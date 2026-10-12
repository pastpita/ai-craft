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
Sync.SHARD = 8;                  // residents per agents/ doc
Sync.EDIT_DOCS = 4;
Sync.HIST_PAGE = 400;
Sync.SCHEMA = 2;

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
  const cap = Math.min(70, (a.mind && a.mind.capacity) || 60);
  if (a.memories.length > cap) {
    // keep the most important and the most recent
    const recent = a.memories.slice(-Math.floor(cap / 2));
    const rest = a.memories.slice(0, -Math.floor(cap / 2)).sort((x, y) => (y.imp || 0) - (x.imp || 0)).slice(0, cap - recent.length).sort((x, y) => x.t - y.t);
    o.memories = rest.concat(recent);
  }
  o.decisions = (a.decisions || []).slice(0, 8);
  o.scoreHist = (a.scoreHist || []).slice(-30);
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
    villages[vid] = Object.assign({}, v, { econ: Object.assign({}, v.econ, { hist: v.econ.hist.slice(-40), wilted: (v.econ.wilted || []).slice(-10) }), roadQueue: (v.roadQueue || []).slice(0, 400) });
  }
  const projects = s.projects.filter(p => !p.done || s.t - (p.finished || 0) < 3 * 1440).map(p => p.done ? Object.assign({}, p, { blocks: [] }) : p);
  const heat = { social: trimHeat(s.heat.social), crime: trimHeat(s.heat.crime) };
  return clone({
    v: s.v, worldId: s.worldId, t: s.t, nextId: s.nextId, players: s.players, crimes: s.crimes.slice(-60), cases: s.cases.slice(-40),
    projects, secrets: s.secrets, farms: s.farms || {}, fields: s.fields || [], shops: s.shops, villages, extraPlaces: s.extraPlaces, properties: s.properties, businesses: s.businesses,
    loans: s.loans.slice(-80), nodes: s.nodes, relations: s.relations, counters: s.counters, weather: s.weather, heat, statsHist: (s.statsHist || []).slice(-40),
    nAgents: s.agents.length,
  });
};
function trimHeat(h) { const e = Object.entries(h || {}).sort((a, b) => b[1] - a[1]).slice(0, 600); const o = {}; for (const [k, v] of e) o[k] = v; return o; }
Sync.feedDoc = function (s) {
  return clone({
    events: s.events.slice(-140), feed: s.feed.slice(0, 120), mindFeed: s.mindFeed.slice(0, 160), news: s.news.slice(-40).map(n => Object.assign({}, n, { column: n.column ? String(n.column).slice(0, 1200) : n.column })),
    convoLog: (s.convoLog || []).slice(0, 16), llmLog: (s.llmLog || []).slice(-6).map(l => Object.assign({}, l, { prompt: String(l.prompt || '').slice(0, 1500), raw: String(l.raw || '').slice(0, 800) })),
  });
};
Sync.editDocs = function () {
  const parts = []; for (let i = 0; i < Sync.EDIT_DOCS; i++) parts.push({});
  for (const k in World.edits) parts[(+k) % Sync.EDIT_DOCS][k] = World.edits[k];
  return parts.map((m, i) => ({ k: i, m }));
};
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
  docs['world/rumors'] = { rumors: clone(Sync.liveRumors(s)) };
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
  const core = docs['world/core'], feed = docs['world/feed'] || {}, rum = docs['world/rumors'] || {};
  if (!core) return null;
  World.clearEdits(); World.generate(4242);
  const edits = {}; for (const key in docs) if (key.startsWith('edits/')) Object.assign(edits, docs[key].m || {});
  World.applyEdits(edits);
  const agents = [];
  const keys = Object.keys(docs).filter(k => k.startsWith('agents/')).sort((a, b) => +a.slice(8) - +b.slice(8));
  for (const k of keys) for (const a of docs[k].agents || []) agents.push(a);
  const s = Object.assign({}, core, {
    agents, byId: {}, events: feed.events || [], feed: feed.feed || [], mindFeed: feed.mindFeed || [], news: feed.news || [], convoLog: feed.convoLog || [], llmLog: feed.llmLog || [],
    rumors: rum.rumors || {}, convos: {}, away: [], econ: null, town: null, election: null, flags: null,
    history: [],
  });
  const pages = Object.keys(docs).filter(k => k.startsWith('history/')).sort((a, b) => +a.slice(9) - +b.slice(9));
  for (const k of pages) s.history.push(...(docs[k].items || []));
  for (const a of agents) { s.byId[a.id] = a; a.path = null; a.convo = null; a.memories = a.memories || []; a.beliefs = a.beliefs || []; }
  // lots used by projects and finished buildings are no longer free
  for (const p of s.projects) reserveLot(p.vid, p.lot);
  for (const id in s.extraPlaces) { const pl = s.extraPlaces[id]; if (pl.w) reserveLot(pl.vid, { x: pl.x, z: pl.z, w: pl.w, d: pl.d }); }
  Sim()._setState(s);
  if (AV.Civ && AV.Civ.rebuildFields) AV.Civ.rebuildFields();
  if (AV.Civ && AV.Civ.upgradeSave) AV.Civ.upgradeSave(s);
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
