// AI CRAFT \u2014 shared-world state layout. Used by the browser authority tab, followers and the Node server.
// Splits the simulation state into documents (each well under 256 KiB), rebuilds state from them,
// and encodes the 1 Hz position frame.
(function (root) {
'use strict';
const AV = root.AV = root.AV || {};
const World = root.World || require('./world.js');
const Sync = AV.Sync = {};
const Sim = () => AV.Sim;

Sync.RATE = 1.2;                 // world minutes per real second: one world day = 20 real minutes
Sync.SHARD = 6;                  // residents per agents/ doc
Sync.EDIT_DOCS = 16;
Sync.HIST_PAGE = 400;
Sync.SCHEMA = 3;

const R2 = (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v);
const clone = (o) => JSON.parse(JSON.stringify(o, R2));
Sync.bytes = (o) => JSON.stringify(o).length;

// ---------- the global clock ----------
// meta.clock = { epoch: real ms when world minute t0 happened, t0 } \u2014 set once when the world is created, never moved
Sync.clockNow = (clock, now) => clock.t0 + ((now === undefined ? Date.now() : now) - clock.epoch) / 1000 * Sync.RATE;

// ---------- serialize ----------
const AGENT_DROP = { path: 1, convo: 1, bubble: 1, _vx: 1, _vz: 1, _tx: 1, _tz: 1, _lerp: 1 };
function packAgent(a) {
  const o = {};
  for (const k in a) if (!AGENT_DROP[k]) o[k] = a[k];
  const cap = Math.min(50, (a.mind && a.mind.capacity) || 50);
  if (a.memories.length > cap) {
    // keep the most important and the most recent
    const recent = a.memories.slice(-Math.floor(cap / 2));
    const rest = a.memories.slice(0, -Math.floor(cap / 2)).sort((x, y) => (y.imp || 0) - (x.imp || 0)).slice(0, cap - recent.length).sort((x, y) => x.t - y.t);
    o.memories = rest.concat(recent);
  }
  if (a.rel) { const r = {}; for (const id in a.rel) { const v = a.rel[id]; if (v && v.some(x => Math.abs(x) >= 1)) r[id] = v; } o.rel = r; }
  o.decisions = (a.decisions || []).slice(0, 6);
  o.scoreHist = (a.scoreHist || []).slice(-24);
  return o;
}
function shardsOf(s) { return Math.ceil(s.agents.length / Sync.SHARD); }
Sync.shardDoc = function (s, k) {
  const list = s.agents.slice(k * Sync.SHARD, (k + 1) * Sync.SHARD).map(packAgent);
  let body = clone({ k, agents: list });
  // safety valve: trim memories until under 220 KiB
  while (Sync.bytes(body) > 220 * 1024) { for (const a of body.agents) a.memories = a.memories.slice(Math.floor(a.memories.length * 0.2)); }
  return body;
};
// the rumour graph, newest hops first, trimmed to fit one document
Sync.rumorsDoc = function (s) {
  const live = Sync.liveRumors(s);
  const ids = Object.keys(live).sort((a, b) => lastHop(live[b]) - lastHop(live[a]));
  const out = {}; let size = 20;
  for (const id of ids) { const r = live[id]; if (r.hops.length > 12) r.hops = r.hops.slice(-12); const j = JSON.stringify(r, R2).length; if (size + j > 200 * 1024) break; out[id] = r; size += j + id.length + 4; }
  return clone({ rumors: out });
};
function lastHop(r) { const h = r.hops && r.hops[r.hops.length - 1]; return h ? h.t : (r.origin && r.origin.t) || 0; }
Sync.liveRumors = function (s) {
  const live = new Set();
  for (const a of s.agents) for (const b of a.beliefs) if (b.chain) live.add(b.chain);
  for (const sc of Object.values(s.secrets || {})) if (sc.chain) live.add(sc.chain);
  for (const c of s.cases || []) for (const ev of c.evidence || []) if (ev.chain) live.add(ev.chain);
  const out = {};
  for (const id in s.rumors) if (live.has(id)) { const r = s.rumors[id]; out[id] = Object.assign({}, r, { hops: r.hops.length > 24 ? r.hops.slice(0, 12).concat(r.hops.slice(-12)) : r.hops }); }
  return out;
};
Sync.coreDoc = function (s) {
  const villages = {};
  for (const vid in s.villages) {
    const v = s.villages[vid];
    villages[vid] = Object.assign({}, v, { econ: Object.assign({}, v.econ, { hist: v.econ.hist.slice(-24).map(round2), wilted: (v.econ.wilted || []).slice(-10) }), roadQueue: (v.roadQueue || []).slice(0, 160),
      town: v.town ? Object.assign({}, v.town, { policyLog: (v.town.policyLog || []).slice(-12) }) : v.town });
  }
  // blueprints: a planned building's blocks come from the master plan; others are packed as text
  const projects = s.projects.filter(p => !p.done || s.t - (p.finished || 0) < 3 * 1440).map(p => p.done ? Object.assign({}, p, { blocks: [] }) : p.plan ? Object.assign({}, p, { blocks: [], packed: 'plan' }) : Object.assign({}, p, { blocks: Sync.packBlocks(p.blocks), packed: 'text' }));
  const heat = { social: trimHeat(s.heat.social), crime: trimHeat(s.heat.crime) };
  return clone({
    v: s.v, worldId: s.worldId, t: s.t, nextId: s.nextId, players: s.players, crimes: s.crimes.slice(-60), cases: s.cases.slice(-40),
    projects, secrets: s.secrets, farms: s.farms || {}, fields: s.fields || [], shops: s.shops, villages, extraPlaces: packPlaces(s.extraPlaces), properties: s.properties, businesses: s.businesses,
    loans: s.loans.slice(-80), nodes: s.nodes, relations: s.relations, counters: s.counters, weather: s.weather, heat, statsHist: (s.statsHist || []).slice(-40),
    nAgents: s.agents.length,
  });
};
// finished buildings: their standing spots are recomputed from the lot on load
function packPlaces(ep) {
  const o = {};
  for (const id in ep) {
    const p = ep[id];
    // a finished building's record lives in the civ document (bmeta); only its standing spots are recomputed
    if (p.w && p.built) o[id] = Object.assign({}, p, { spots: undefined, meta: undefined });
    else if (p.spots && p.spots.length > 8) o[id] = Object.assign({}, p, { spots: undefined, sp: p.spots.map(q => q[0].toString(36) + '.' + q[1].toString(36)).join(',') });
    else o[id] = p;
  }
  return o;
}
// economy history rows: two decimals are plenty for a chart
function round2(r) { const o = {}; for (const k in r) { const v = r[k]; o[k] = typeof v === 'number' ? Math.round(v * 100) / 100 : v && typeof v === 'object' ? round2(v) : v; } return o; }
Sync.unpackPlaces = function (s) {
  for (const id in s.extraPlaces || {}) {
    const p = s.extraPlaces[id];
    if (!p.meta && s.bmeta && s.bmeta[id]) p.meta = s.bmeta[id];
    if (p.sp) { p.spots = p.sp.split(',').map(t => t.split('.').map(n => parseInt(n, 36))); delete p.sp; }
    if (p.spots && p.spots.length) continue;
    const spots = [];
    for (let i = p.x + 1; i < p.x + p.w - 1; i++) for (let k = p.z + 1; k < p.z + p.d - 1; k++) if (World.standY[i + k * World.W] >= 0) spots.push([i, k]);
    p.spots = spots.length ? spots : [p.entry];
  }
};
function trimHeat(h) { const e = Object.entries(h || {}).sort((a, b) => b[1] - a[1]).slice(0, 600); const o = {}; for (const [k, v] of e) o[k] = v; return o; }
Sync.feedDoc = function (s) {
  return clone({
    events: s.events.slice(-140), feed: s.feed.slice(0, 120), mindFeed: s.mindFeed.slice(0, 160), news: s.news.slice(-40).map(n => Object.assign({}, n, { column: n.column ? String(n.column).slice(0, 1200) : n.column })),
    convoLog: (s.convoLog || []).slice(0, 16), llmLog: (s.llmLog || []).slice(-6).map(l => Object.assign({}, l, { prompt: String(l.prompt || '').slice(0, 1500), raw: String(l.raw || '').slice(0, 800) })),
  });
};
// block edits, packed: sorted cell indexes as base-36 deltas with the block id ("d.b,d.b,..."), 16 documents
Sync.editDocs = function () {
  const parts = []; for (let i = 0; i < Sync.EDIT_DOCS; i++) parts.push([]);
  for (const k in World.edits) parts[(+k) % Sync.EDIT_DOCS].push(+k);
  return parts.map((ix, i) => {
    ix.sort((a, b) => a - b); let prev = 0; const out = [];
    for (const k of ix) { out.push((k - prev).toString(36) + '.' + World.edits[k].toString(36)); prev = k; }
    return { k: i, p: out.join(',') };
  });
};
Sync.decodeEdits = function (body) {
  if (!body) return {};
  if (body.m) return body.m;
  const out = {}; if (!body.p) return out;
  let k = 0;
  for (const part of body.p.split(',')) { const j = part.indexOf('.'); if (j < 0) continue; k += parseInt(part.slice(0, j), 36); out[k] = parseInt(part.slice(j + 1), 36); }
  return out;
};
Sync.packBlocks = (list) => list.map(b => b[0].toString(36) + '.' + b[1].toString(36) + '.' + b[2].toString(36) + '.' + b[3].toString(36)).join(',');
Sync.unpackBlocks = (str) => !str ? [] : str.split(',').map(t => t.split('.').map(n => parseInt(n, 36)));
Sync.hydrateProjects = function (s) {
  for (const p of s.projects || []) {
    if (p.packed === 'plan') { const P = World.plan[p.plan]; const sw = p.swap || {}; p.blocks = P ? P.blocks.map(b => (sw[b[3]] !== undefined ? [b[0], b[1], b[2], sw[b[3]]] : b)) : []; }
    else if (p.packed === 'text' || typeof p.blocks === 'string') p.blocks = Sync.unpackBlocks(p.blocks);
    delete p.packed;
  }
};
// the growth record: kept out of world/core so core stays small
const CIV_KEYS = ['small', 'plan', 'planDone', 'metrics', 'metricsHist', 'reports', 'milestones', 'snapDays', 'cleared', 'bmeta'];
Sync.CIV_KEYS = CIV_KEYS;
Sync.civDoc = function (s) {
  const o = {}; for (const k of CIV_KEYS) if (s[k] !== undefined) o[k] = s[k];
  if (o.metricsHist) o.metricsHist = AV.Civ && AV.Civ.thinHist ? AV.Civ.thinHist(o.metricsHist) : o.metricsHist.slice(-300);
  if (o.reports) o.reports = o.reports.slice(-40);
  return clone(o);
};
// aerial snapshot of the valley: one byte per column, the top block's class (high nibble) and its height (low nibble)
const SNAP_CLASS = (() => {
  const B = World.B, c = new Uint8Array(64).fill(15);
  const set = (k, ...ids) => ids.forEach(i => { if (i !== undefined) c[i] = k; });
  set(0, 0); set(1, B.GRASS); set(2, B.DIRT, B.FARMLAND); set(3, B.STONE, B.COBBLE, B.ORE, B.COAL_ORE, B.GOLD_ORE); set(4, B.WATER); set(5, B.SAND, B.CLAY);
  set(6, B.LOG); set(7, B.LEAVES); set(8, B.PLANKS, B.DOOR, B.FENCE, B.SHELF); set(9, B.PATH); set(10, B.BRICK, B.ROOF_TILE, B.OVEN);
  set(11, B.SLATE, B.STONE_BRICK); set(12, B.PLASTER, B.CLOTH, B.WOOL); set(13, B.THATCH, B.CROP, B.SPROUT); set(14, B.TORCH, B.GLASS);
  return c;
})();
Sync.snapshot = function (day) {
  const W = World.W, D = World.D; const px = new Uint8Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) { const [y, b] = World.topBlockColor(x, z); px[x + z * W] = (SNAP_CLASS[b] << 4) | Math.max(0, Math.min(15, y - (World.GROUND - 3))); }
  let str = ''; for (let i = 0; i < px.length; i += 0x8000) str += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
  return { d: day, w: W, h: D, v: 2, px: typeof btoa === 'function' ? btoa(str) : Buffer.from(str, 'binary').toString('base64') };
};
Sync.SNAP_DAYS = [1, 2, 3, 5, 7, 10, 14, 20, 30, 45, 60, 90, 120];
Sync.isSnapDay = (d) => Sync.SNAP_DAYS.includes(d) || (d > 120 && d % 30 === 0);
Sync.historyPages = function (s) {
  const pages = [];
  for (let i = 0; i * Sync.HIST_PAGE < s.history.length; i++) pages.push({ k: i, items: s.history.slice(i * Sync.HIST_PAGE, (i + 1) * Sync.HIST_PAGE) });
  return pages;
};
// every document, keyed by path
Sync.allDocs = function (s, meta) {
  const docs = {};
  docs['world/meta'] = meta;
  docs['world/core'] = Sync.coreDoc(s);
  docs['world/feed'] = Sync.feedDoc(s);
  docs['world/rumors'] = Sync.rumorsDoc(s);
  docs['world/civ'] = Sync.civDoc(s);
  for (let k = 0; k < shardsOf(s); k++) docs['agents/s' + k] = Sync.shardDoc(s, k);
  for (const e of Sync.editDocs()) docs['edits/e' + e.k] = e;
  for (const p of Sync.historyPages(s)) docs['history/h' + p.k] = p;
  return docs;
};
Sync.shards = shardsOf;

// ---------- rebuild ----------
// docs: { 'world/core': body, 'agents/s0': body, ... } \u2192 a live state installed into Sim
Sync.build = function (docs, opts) {
  opts = opts || {};
  // documents from the store are frozen: build from a private copy
  docs = JSON.parse(JSON.stringify(docs || {}));
  const core = docs['world/core'], feed = docs['world/feed'] || {}, rum = docs['world/rumors'] || {};
  if (!core) return null;
  World.clearEdits(); World.generate(4242);
  const civ = docs['world/civ'] || {};
  // a world that started as camps: un-build the master plan first, then lay the saved edits on top
  if (civ.plan && AV.Civ && AV.Civ.replayPlan) AV.Civ.replayPlan(civ);
  const edits = {}; for (const key in docs) if (key.startsWith('edits/')) Object.assign(edits, Sync.decodeEdits(docs[key]));
  World.applyEdits(edits);
  const agents = [];
  const keys = Object.keys(docs).filter(k => k.startsWith('agents/')).sort((a, b) => +a.slice(8) - +b.slice(8));
  for (const k of keys) for (const a of docs[k].agents || []) agents.push(a);
  const s = Object.assign({}, core, {
    agents, byId: {}, events: feed.events || [], feed: feed.feed || [], mindFeed: feed.mindFeed || [], news: feed.news || [], convoLog: feed.convoLog || [], llmLog: feed.llmLog || [],
    rumors: rum.rumors || {}, convos: {}, away: [], econ: null, town: null, election: null, flags: null,
    history: [],
  }, civ);
  const pages = Object.keys(docs).filter(k => k.startsWith('history/')).sort((a, b) => +a.slice(9) - +b.slice(9));
  for (const k of pages) s.history.push(...(docs[k].items || []));
  for (const a of agents) { s.byId[a.id] = a; a.path = null; a.convo = null; a.memories = a.memories || []; a.beliefs = a.beliefs || []; }
  Sync.hydrateProjects(s);
  Sync.unpackPlaces(s);
  // lots used by projects and finished buildings are no longer free
  for (const p of s.projects) reserveLot(p.vid, p.lot);
  for (const id in s.extraPlaces) { const pl = s.extraPlaces[id]; if (pl.w) reserveLot(pl.vid, { x: pl.x, z: pl.z, w: pl.w, d: pl.d }); }
  Sim()._setState(s);
  if (AV.Civ && AV.Civ.rebuildFields) AV.Civ.rebuildFields();
  if (AV.Civ && AV.Civ.upgradeSave) AV.Civ.upgradeSave(s);
  if (AV.Civ && AV.Civ.applyCleared) AV.Civ.applyCleared();
  if (AV.Civ && AV.Civ.syncAllNodes) AV.Civ.syncAllNodes();
  for (const a of agents) { if (a.plan && !a.plan.arrived) a.thinkAt = Math.min(a.thinkAt || s.t, s.t + 2); }
  return s;
};
function reserveLot(vid, lot) {
  if (!lot) return;
  const L = World.lots[vid]; if (L) { const k = L.findIndex(l => l.x === lot.x && l.z === lot.z); if (k >= 0) L.splice(k, 1); }
  World.reserve(lot.x, lot.z, lot.w, lot.d, 1);
}
// replace one shard's residents in a live follower state, keeping render-only fields
Sync.FRAME_KEYS = ['x', 'y', 'z', 'dir', 'bubble', 'acting', 'carryN', 'moving', 'sleeping', 'convo', 'hidden', 'act', 'flags', 'thinking', 'task'];
Sync.applyShard = function (s, body) {
  for (const a of body.agents || []) {
    const old = s.byId[a.id];
    if (old) {
      const keep = {}; for (const k of Sync.FRAME_KEYS) keep[k] = old[k];
      for (const k in old) if (!(k in a) && k[0] !== '_') delete old[k];
      Object.assign(old, a, keep);
    } else { a.path = null; s.agents.push(a); s.byId[a.id] = a; }
  }
};
Sync.applyCore = function (s, core) {
  const keep = { t: s.t };
  for (const k in core) if (k !== 'nAgents') s[k] = core[k];
  Sync.hydrateProjects(s);
  Sync.unpackPlaces(s);
  if (keep.t > s.t) s.t = keep.t;
  for (const p of s.projects) reserveLot(p.vid, p.lot);
  Sim()._setState(s);
};
Sync.applyFeed = function (s, feed) { for (const k of ['events', 'feed', 'mindFeed', 'news', 'convoLog', 'llmLog']) if (feed[k]) s[k] = feed[k]; };

// ---------- frames: every resident in ~7 characters ----------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const ACTS = ['', 'sleep', 'work', 'eat', 'rest', 'socialize', 'gossip', 'talk_to', 'campaign', 'vote', 'help', 'investigate', 'steal', 'protest', 'visit', 'commission', 'learn', 'travel', 'follow', 'mediate', 'buy', 'clinic', 'jail', 'patrol', 'wood', 'stone', 'iron', 'coal', 'gold', 'food', 'fish', 'clay', 'wool', 'build', 'haul', 'trade', 'teach', 'think', 'llm', 'plant', 'till', 'tend'];
Sync.ACTS = ACTS;
const enc2 = (n) => { n = Math.max(0, Math.min(4095, Math.round(n))); return B64[n >> 6] + B64[n & 63]; };
const dec2 = (s, i) => (B64.indexOf(s[i]) << 6) | B64.indexOf(s[i + 1]);
Sync.encodeFrame = function (s) {
  let out = '';
  for (const a of s.agents) {
    const x = a.left ? 0 : a.x * 4, z = a.left ? 0 : a.z * 4;
    const d = Math.round(((((a.dir || 0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 64) & 63;
    let f = 0;
    if (a.sleeping) f |= 1;
    if (a.sick || a.injured) f |= 2;
    if (a.carry && Object.keys(a.carry).length) f |= 4;
    if (a.acting && a.plan && a.plan.type === 'work') f |= 8;
    if (a.convo) f |= 16;
    if (a.left || a.hidden || (a.jailUntil > s.t)) f |= 32;
    let act = a.acting && a.plan && a.plan.type === 'work' && ACTS.indexOf(a.acting) > 0 ? ACTS.indexOf(a.acting) : (a.plan && ACTS.indexOf(a.plan.type) > 0 ? ACTS.indexOf(a.plan.type) : 0);
    if (a.thinking) act = ACTS.indexOf(a.thinking === 'llm' ? 'llm' : 'think');
    out += enc2(x) + enc2(z) + B64[d] + B64[f] + B64[act & 63];
  }
  return out;
};
Sync.decodeFrame = function (str) {
  const out = [];
  for (let i = 0; i + 7 <= str.length; i += 7) {
    out.push({ x: dec2(str, i) / 4, z: dec2(str, i + 2) / 4, dir: B64.indexOf(str[i + 4]) / 64 * 2 * Math.PI, f: B64.indexOf(str[i + 5]), act: ACTS[B64.indexOf(str[i + 6])] || '' });
  }
  return out;
};

// ---------- realtime batches (bubbles, events, block edits) \u2014 each message stays under 4 KiB ----------
Sync.chunk = function (items, maxBytes) {
  const out = []; let cur = [], size = 2;
  for (const it of items) { const n = JSON.stringify(it).length + 1; if (size + n > (maxBytes || 3500) && cur.length) { out.push(cur); cur = []; size = 2; } cur.push(it); size += n; }
  if (cur.length) out.push(cur);
  return out;
};
Sync.slimEvent = (e) => ({ id: e.id, t: e.t, day: e.day, type: e.type, vid: e.vid || null, to: e.to || null, actor: e.actor || null, about: e.about || null, imp: e.imp, text: String(e.text || '').slice(0, 260), truth: e.truth ? String(e.truth).slice(0, 160) : undefined, x: e.x, z: e.z, headline: e.headline, public: e.public, world: e.world });


// ---------- authority side: collect what changed since the last broadcast ----------
Sync.collector = function () {
  const c = { lastEv: 0, lastMind: 0, bub: {}, tasks: {}, edits: new Set(), on: false };
  c.attach = function () { if (c.on) return; c.on = true; World.onChange((x, y, z, b, o) => { if (!o || !o.sync) c.edits.add(World.idx(x, y, z)); }); };
  c.reset = function (s) {
    c.lastEv = s.events.length ? s.events[s.events.length - 1].id || 0 : 0;
    c.lastMind = s.mindFeed.length ? s.mindFeed[0].id || 0 : 0;
    c.bub = {}; for (const a of s.agents) if (a.bubble) c.bub[a.id] = a.bubble.t + '|' + a.bubble.text;
    c.edits.clear();
  };
  c.take = function (s) {
    const out = { bubbles: [], events: [], mind: [], edits: [], tasks: [] };
    s.agents.forEach((a, i) => { if (!a.task) return; const k = a.task.t + '|' + a.task.r; if (c.tasks[a.id] !== k) { c.tasks[a.id] = k; out.tasks.push([i, String(a.task.t).slice(0, 90), String(a.task.r || '').slice(0, 90)]); } });
    s.agents.forEach((a, i) => { if (!a.bubble) return; const key = a.bubble.t + '|' + a.bubble.text; if (c.bub[a.id] !== key) { c.bub[a.id] = key; if (s.t - a.bubble.t < 3) out.bubbles.push([i, String(a.bubble.text).slice(0, 200)]); } });
    for (const e of s.events) if ((e.id || 0) > c.lastEv) out.events.push(Sync.slimEvent(e));
    if (s.events.length) c.lastEv = Math.max(c.lastEv, s.events[s.events.length - 1].id || 0);
    for (const m of s.mindFeed) { if ((m.id || 0) <= c.lastMind) break; out.mind.push(m); }
    if (s.mindFeed.length) c.lastMind = Math.max(c.lastMind, s.mindFeed[0].id || 0);
    for (const i of c.edits) out.edits.push([i, World.data[i]]);
    c.edits.clear();
    return out;
  };
  return c;
};
// short-lived per-tick heartbeat numbers for the brain indicator
Sync.heartbeat = function (s, prev) {
  const c = s.counters || {};
  const thinking = s.agents.filter(a => !a.left && !a.sleeping).length;
  const hb = { d: c.decisions || 0, m: c.memories || 0, c: c.convos || 0, l: c.llm || 0, w: thinking, n: s.agents.filter(a => !a.left).length };
  if (prev) { hb.dd = hb.d - (prev.d || 0); hb.dm = hb.m - (prev.m || 0); }
  return hb;
};

// ---------- visitor actions, executed by the authority (tab or server) ----------
const PLACEABLE = new Set(['PLANKS', 'COBBLE', 'LOG', 'GLASS', 'TORCH', 'BRICK', 'STONE_BRICK', 'WOOL', 'THATCH', 'PLASTER', 'DIRT', 'SAND', 'CLAY']);
Sync.cleanPid = (pid) => typeof pid === 'string' && /^p_[A-Za-z0-9_-]{2,40}$/.test(pid) ? pid : null;
Sync.rpc = function (op, pid, args) {
  const Sm = Sim(); const s = Sm.S();
  pid = Sync.cleanPid(pid); if (!pid || !s) return { ok: false, error: 'bad visitor' };
  args = Array.isArray(args) ? args : [];
  const str = (v, n) => String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, n || 200);
  const agent = (id) => { const a = s.byId[str(id, 40)]; return a && !a.left ? a : null; };
  const p = s.players[pid];
  switch (op) {
    case 'join': { const name = str(args[0], 24).replace(/[^\p{L}\p{N} '._-]/gu, '').trim() || 'Traveller'; const pl = Sm.ensurePlayer(pid, name); pl.lastSeen = Date.now(); return { ok: true, name: pl.name }; }
    case 'greet': case 'news': case 'case': case 'work': case 'buy': { if (!p) return { ok: false, error: 'join first' }; const a = agent(args[0]); if (!a) return { ok: false, error: 'nobody there' };
      const fn = { greet: Sm.playerGreet, news: Sm.playerNews, case: Sm.playerCase, work: Sm.playerWork, buy: Sm.playerBuy }[op]; return { ok: true, result: fn(pid, a.id) }; }
    case 'opinion': { const a = agent(args[0]); if (!p || !a) return { ok: false }; return { ok: true, result: Sm.playerOpinion(pid, a.id, str(args[1], 40)) }; }
    case 'tell': { const a = agent(args[0]); if (!p || !a || !args[1] || typeof args[1] !== 'object') return { ok: false }; const cl = args[1]; return { ok: true, result: Sm.playerTell(pid, a.id, { type: str(cl.type, 20), about: str(cl.about, 40), place: cl.place ? str(cl.place, 40) : undefined, level: Math.max(0, Math.min(3, +cl.level || 0)) }) }; }
    case 'accuse': { const a = agent(args[0]); if (!p || !a) return { ok: false }; return { ok: true, result: Sm.playerAccuse(pid, a.id, str(args[1], 40)) }; }
    case 'give': { const a = agent(args[0]); if (!p || !a) return { ok: false }; return { ok: true, result: Sm.playerGive(pid, a.id, str(args[1], 20)) }; }
    case 'support': { const a = agent(args[0]); if (!p || !a) return { ok: false }; return { ok: true, result: Sm.playerSupport(pid, a.id, str(args[1], 40)) }; }
    case 'vote': { if (!p) return { ok: false }; return { ok: true, result: Sm.playerVote(pid, str(args[0], 40)) }; }
    case 'dialogue': { const a = agent(args[0]); if (!p || !a) return { ok: false }; const j = args[2] && typeof args[2] === 'object' ? args[2] : null; return Sm.applyDialogue(pid, a, str(args[1], 400), j) || { ok: true }; }
    case 'decision': { const a = agent(args[0]); const j = args[1] && typeof args[1] === 'object' ? args[1] : null; if (!a || !j) return { ok: false }; return Sm.applyDecision(a, j) || { ok: true }; }
    case 'block': {
      if (!p) return { ok: false };
      const [x, y, z] = [args[0], args[1], args[2]].map(v => Math.floor(+v)); const action = args[3] === 'place' ? 'place' : 'break';
      if (!World.inb(x, y, z) || y <= 1) return { ok: false, error: 'out of bounds' };
      if (p.x !== undefined && Math.hypot(p.x - x, p.z - z) > 8) return { ok: false, error: 'too far' };
      const prev = World.get(x, y, z);
      if (action === 'break') { if (!prev || y <= 2) return { ok: false }; World.set(x, y, z, 0, { player: pid }); }
      else { const name = str(args[4], 20).toUpperCase(); const b = World.B[name]; if (prev || !PLACEABLE.has(name) || b === undefined) return { ok: false, error: 'cannot place that' }; World.set(x, y, z, b, { player: pid }); }
      Sm.playerBlock(pid, x, y, z, action, prev);
      return { ok: true };
    }
    case 'pos': { if (!p) return { ok: false }; const x = +args[0], z = +args[1]; if (isFinite(x) && isFinite(z)) { p.x = Math.max(0, Math.min(World.W, x)); p.z = Math.max(0, Math.min(World.D, z)); p.y = +args[2] || p.y; p.lastSeen = Date.now(); } return { ok: true }; }
  }
  return { ok: false, error: 'unknown action' };
};

if (typeof module !== 'undefined' && module.exports) module.exports = Sync;
})(typeof window !== 'undefined' ? window : globalThis);
