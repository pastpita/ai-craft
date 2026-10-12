/* AI CRAFT \u2014 net.js
   The shared world in the browser. One world, one clock, one history for every visitor.
   Transports:
     artifact  shared database + room of the published page. One open tab with write access holds a
               20 s lease and runs the simulation (the "host"); every other tab follows its frames.
     server    the Node server (server/server.js): it always runs the world; every tab follows.
     local     no backend reachable: a private, unsaved copy (clearly labelled).
   Nothing important lives in browser storage; it only keeps preferences and this tab's visitor id. */
(function (root) {
'use strict';
const AV = root.AV, World = root.World;
const Sim = AV.Sim, Civ = AV.Civ, Sync = AV.Sync;
const S = () => Sim.S();

const LEASE_MS = 20000, RENEW_MS = 6000;
// a store call that never answers must not freeze the world
// the store hands out frozen snapshots; the simulation needs its own copies
const thaw = (v) => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));
const within = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout', message: what + ' timed out' }), ms))]);
const TAB = 't' + Math.random().toString(36).slice(2, 10);
const pref = {
  get(k) { try { return localStorage.getItem('aicraft.' + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('aicraft.' + k, v); } catch (e) { /* preferences only */ } },
};

const Net = AV.Net = {
  transport: 'none',      // artifact | server | local
  role: 'booting',        // host | follower | projection | local
  canWrite: false,
  meta: null,
  pid: null, name: pref.get('name') || '',
  peers: [], online: 1,
  hb: { d: 0, m: 0, c: 0, l: 0, w: 0, n: 0, dd: 0, dm: 0 }, hbAt: 0, hbHist: [],
  frameAt: 0, lastSave: 0, lastError: '', saveFails: 0, status: '', listeners: {},
  tab: TAB,
};
const emitLocal = (k, v) => { for (const fn of Net.listeners[k] || []) try { fn(v); } catch (e) { console.warn(e); } };
Net.on = (k, fn) => { (Net.listeners[k] = Net.listeners[k] || []).push(fn); };
Net.clockNow = () => Net.meta && Net.meta.clock ? Sync.clockNow(Net.meta.clock) : S().t;
Net.label = function () {
  if (Net.role === 'host') { const ago = Net.lastSave ? Math.round((Date.now() - Net.lastSave) / 1000) : -1; return ago < 0 || ago > 90 ? 'LIVE \u00B7 hosting \u00B7 NOT SAVING' + (Net.lastError ? ' (' + Net.lastError + ')' : '') : 'LIVE \u00B7 you are hosting the simulation'; }
  if (Net.role === 'follower') return Net.transport === 'server' ? 'LIVE \u00B7 server world' : 'LIVE \u00B7 shared world';
  if (Net.role === 'projection') return 'LOCAL PROJECTION \u00B7 no host online';
  if (Net.role === 'local') return 'PRIVATE PREVIEW \u00B7 not shared or saved';
  return 'CONNECTING';
};
// if the boot failed half way, keep the world alive here and keep trying to host
Net.rescue = function () {
  if (Net.role === 'host' || Net.role === 'local' || Net.role === 'projection' || Net.role === 'follower') return false;
  console.warn('boot did not finish: projecting locally');
  if (!Net.meta || !Net.meta.clock) Net.meta = { worldId: S().worldId, clock: { epoch: Date.now(), t0: S().t } };
  if (Net.transport === 'artifact') becomeFollower(); else becomeProjection();
  return true;
};
// aerial snapshots for Then / Now: loaded on demand, they are large
Net.snaps = {};
Net.loadSnaps = async function () {
  const s = S();
  for (const sn of (s && s._snapQueue) || []) Net.snaps[sn.d] = sn;
  if (s && s._snaps) for (const d in s._snaps) Net.snaps[d] = s._snaps[d];
  try {
    if (DB) { const q = await within(DB.collection('snaps').get(), 20000, 'snaps'); for (const d of q.docs) if (d.exists) { const b = thaw(d.data()); if (b && b.d) Net.snaps[b.d] = b; } }
    else if (Net.transport === 'server') { const r = await fetch('api/snaps', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); for (const b of j.snaps || []) Net.snaps[b.d] = b; } }
  } catch (e) { console.warn('snapshots', e && e.code); }
  return Net.snaps;
};
Net.shared = () => Net.transport === 'artifact' || Net.transport === 'server';

// ---------------------------------------------------------------- boot
// onStep(label, fraction) drives the loading screen
Net.boot = async function (onStep) {
  const step = (t, f) => { Net.status = t; if (onStep) onStep(t, f); };
  step('INITIALIZING MINDS', 0.05);
  let claude = root.claude && typeof root.claude.use === 'function' ? root.claude : null;
  if (claude) {
    const [db, room, user] = await Promise.all([claude.use('db').catch(() => null), claude.use('room').catch(() => null), claude.use('user').catch(() => null)]);
    if (db) { await bootArtifact(db, room, user, step); return; }
  }
  // a Node server serving this page?
  if (/^https?:/.test(location.protocol) && !claude) {
    try {
      const r = await fetch('api/hello', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); if (j && j.transport === 'server') { await bootServer(step); return; } }
    } catch (e) { /* no server */ }
  }
  await bootLocal(step);
};

// ---------------------------------------------------------------- local (no backend)
async function bootLocal(step) {
  Net.transport = 'local'; Net.role = 'local'; Net.canWrite = true;
  step('LOADING MEMORIES', 0.3);
  Sim.newWorld(Date.now() % 100000); warmUp();
  Net.meta = { worldId: S().worldId, clock: { epoch: Date.now(), t0: S().t } };
  step('SYNCING WORLD STATE', 0.6);
  Net.pid = 'p_' + localId();
  Sync.rpc('join', Net.pid, [Net.name || 'Traveller']);
  step('CONNECTING ' + S().agents.length + ' AGENTS', 0.9);
  startHostLoops();
}
// a new world opens at mid-morning with everyone already at work
function warmUp() { for (let i = 0; i < 150; i++) Sim.advance(1); }
function localId() { let id = pref.get('vid'); if (!id) { id = Math.random().toString(36).slice(2, 12); pref.set('vid', id); } return id; }

// ---------------------------------------------------------------- server
let ws = null, rpcSeq = 0; const pending = {};
async function bootServer(step) {
  Net.transport = 'server'; Net.role = 'follower'; Net.canWrite = true;
  Net.pid = 'p_' + localId();
  step('CONNECTING TO THE WORLD', 0.15);
  await new Promise((resolve, reject) => {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + location.pathname.replace(/[^/]*$/, '') + 'ws';
    ws = new WebSocket(url);
    let gotDocs = false;
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.k === 'hello') { Net.meta = m.meta; }
      else if (m.k === 'docs') { step('LOADING MEMORIES', 0.45); Sync.build(m.docs); editDocs = {}; for (const k in m.docs) if (k.startsWith('edits/')) editDocs[k] = Sync.decodeEdits(m.docs[k]); gotDocs = true; step('SYNCING WORLD STATE', 0.75); resolve(); }
      else if (gotDocs) handleServerMsg(m);
    };
    ws.onerror = () => { if (!gotDocs) reject(new Error('server unreachable')); };
    ws.onclose = () => { Net.role = 'follower'; Net.status = 'reconnecting'; emitLocal('status', 'lost'); setTimeout(() => location.reload(), 4000); };
  });
  Net.sendPresence = (p) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ k: 'presence', p })); };
  Net.rpc = (op, args) => new Promise((resolve) => {
    if (!ws || ws.readyState !== 1) return resolve({ ok: false, error: 'offline' });
    const id = ++rpcSeq; pending[id] = resolve; ws.send(JSON.stringify({ k: 'rpc', id, op, pid: Net.pid, args }));
    setTimeout(() => { if (pending[id]) { delete pending[id]; resolve({ ok: false, error: 'timeout' }); } }, 9000);
  });
  await Net.rpc('join', [Net.name || 'Traveller']);
  step('CONNECTING ' + S().agents.filter(a => !a.left).length + ' AGENTS', 0.95);
  startFollowLoops();
}
function handleServerMsg(m) {
  if (m.k === 'f') onFrame(m);
  else if (m.k === 'b') onBubbles(m.d);
  else if (m.k === 'e') onEvents(m.d);
  else if (m.k === 'm') onMind(m.d);
  else if (m.k === 'x') onEdits(m.d);
  else if (m.k === 'k') onTasks(m.d);
  else if (m.k === 'doc') applyDoc(m.key, m.body);
  else if (m.k === 'peers') { Net.peers = m.peers; Net.online = Math.max(1, m.peers.length); emitLocal('peers', Net.peers); }
  else if (m.k === 'rpcr') { const r = pending[m.id]; if (r) { delete pending[m.id]; r(m.res); } }
}

// ---------------------------------------------------------------- artifact (db + room)
let DB = null, ROOM = null, USER = null;
async function bootArtifact(db, room, user, step) {
  DB = db; ROOM = room; USER = user;
  Net.transport = 'artifact';
  let uid = null;
  try { uid = user ? await user.id() : null; } catch (e) { uid = null; }
  Net.pid = 'p_' + String(uid || localId()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 36);
  let can = null; try { can = user && user.can ? await user.can('data.write') : null; } catch (e) { can = null; }
  Net.canWrite = can !== false;
  step('LOADING MEMORIES', 0.15);
  let docs = await readAll();
  // a world saved before the civilization update was fully built from the start: it is re-founded as five camps
  const stale = docs['world/meta'] && (docs['world/meta'].schema || 0) < Sync.SCHEMA;
  if (stale) { console.warn('re-founding a world from schema', docs['world/meta'].schema); for (const k of Object.keys(docs)) delete docs[k]; Net.refounded = true; }
  if (!docs['world/meta'] || !docs['world/core']) {
    // nobody has started a world yet
    if (Net.canWrite && await tryLease()) {
      step('FOUNDING FIVE CAMPS', 0.3);
      await tick();
      Sim.newWorld(Date.now() % 100000); warmUp();
      Net.meta = { schema: Sync.SCHEMA, worldId: S().worldId, clock: { epoch: Date.now(), t0: S().t }, created: Date.now(), host: TAB, seq: 0 };
      step('WRITING THE FIRST MEMORIES', 0.55);
      const ok = await saveAll(true);
      if (!ok) { Net.canWrite = false; becomeProjection(); }
      else becomeHost();
    } else {
      // someone else is creating it right now (or this viewer cannot write): wait for it
      step('WAITING FOR THE WORLD', 0.3);
      const fresh = (d) => d['world/meta'] && d['world/core'] && (d['world/meta'].schema || 0) >= Sync.SCHEMA;
      for (let i = 0; i < 12 && !fresh(docs); i++) { await sleep(1500); docs = await readAll(); }
      if (!fresh(docs)) docs = {};
      if (!docs['world/core']) { Sim.newWorld(Date.now() % 100000); warmUp(); Net.meta = { worldId: S().worldId, clock: { epoch: Date.now(), t0: S().t } }; becomeProjection(); }
      else { Net.meta = docs['world/meta']; Sync.build(docs); await joinExisting(step); }
    }
  } else {
    Net.meta = docs['world/meta'];
    step('REBUILDING THE WORLD', 0.35);
    await tick();
    Sync.build(docs);
    for (const k in docs) if (k.startsWith('edits/')) editDocs[k] = Sync.decodeEdits(docs[k]);
    await joinExisting(step);
  }
  step('CONNECTING ' + S().agents.filter(a => !a.left).length + ' AGENTS', 0.95);
  setupRoom();
  subscribeDocs();
  // visitor record in the shared world
  Net.rpc('join', [Net.name || 'Traveller']).catch(() => {});
}
async function joinExisting(step) {
  const gap = Net.clockNow() - S().t;
  if (Net.canWrite && await tryLease()) {
    if (gap > 1) {
      step('SYNCING WORLD STATE \u00B7 ' + fmtGap(gap) + ' PASSED', 0.5);
      await tick();
      // in chunks, renewing the lease between them so nobody else starts hosting meanwhile
      const evs = []; let left = Math.floor(gap); const total = left;
      while (left > 0) {
        const n = Math.min(left, 12 * 1440);
        evs.push(...Civ.catchUp(n));
        left = Math.floor(Net.clockNow() - S().t);
        if (left < 2) left = 0;
        step('SYNCING WORLD STATE \u00B7 ' + Math.round((1 - left / Math.max(1, total)) * 100) + '%', 0.5 + (1 - left / Math.max(1, total)) * 0.35);
        await tick(); await tryLease();
      }
      Net.missed = { minutes: gap, events: evs };
    }
    becomeHost();
    saveAll(true);
  } else {
    // someone is hosting; their frames will arrive. Until then advance the copy to "now" cheaply.
    step('SYNCING WORLD STATE', 0.7);
    if (gap > 1) { await tick(); Net.missed = { minutes: gap, events: [] }; }
    becomeFollower();
  }
}
const fmtGap = (m) => m >= 1440 ? (m / 1440).toFixed(1) + ' DAYS' : Math.round(m / 60) + ' HOURS';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const tick = () => new Promise(r => setTimeout(r, 16));

async function readAll() {
  const out = {};
  for (const c of ['world', 'agents', 'edits', 'history']) {
    try { const q = await within(DB.collection(c).get(), 20000, 'read ' + c); for (const d of q.docs) if (d.exists) out[c + '/' + d.id] = thaw(d.data()); } catch (e) { console.warn('read', c, e && e.code); }
  }
  return out;
}
async function tryLease() {
  try { const r = await within(DB.doc('world/lock').acquire({ holder: TAB, ttlMs: LEASE_MS }), 10000, 'lease'); return !!(r && r.acquired); } catch (e) { Net.lastError = 'lease ' + ((e && e.code) || 'error'); if (e && (e.code === 'invalid_argument' || e.code === 'not_granted' || e.code === 'revoked')) Net.canWrite = false; return false; }
}

// ---------- write queue: one write at a time per document, only when the body changed
const lastJSON = {}; let writing = false; const queue = new Map();
function enqueue(key, body) {
  const j = JSON.stringify(body);
  if (lastJSON[key] === j) return;
  queue.set(key, { body, j });
  pump();
}
async function pump() {
  if (writing || !(Net.role === 'host' || Net.role === 'booting')) return;
  writing = true;
  try {
    while (queue.size && (Net.role === 'host' || Net.role === 'booting')) {
      const [key, item] = queue.entries().next().value; queue.delete(key);
      try { await within(DB.doc(key).set(item.body), 15000, 'save'); lastJSON[key] = item.j; Net.lastSave = Date.now(); Net.saveFails = 0; Net.lastError = ''; }
      catch (e) {
        const code = (e && e.code) || 'error'; Net.saveFails++; Net.lastError = 'save ' + code;
        if (code === 'invalid_argument' || code === 'quota_exceeded') console.warn('write refused', key, e && e.message);
        else if (code === 'not_granted' || code === 'revoked') { Net.canWrite = false; console.warn('no write access', key); }
        else if (code === 'resource_exhausted' || code === 'unavailable' || code === 'timeout') { if (!queue.has(key)) queue.set(key, item); await sleep(2500); }
        else console.warn('write failed', key, code);
      }
    }
  } finally { writing = false; }
}
async function saveAll(force) {
  const s = S();
  Net.meta.savedAt = Date.now(); Net.meta.savedT = s.t; Net.meta.host = TAB; Net.meta.nAgents = s.agents.length; Net.meta.seq = (Net.meta.seq || 0) + 1;
  const docs = Sync.allDocs(s, Net.meta);
  if (force) for (const k in docs) delete lastJSON[k];
  // meta last, so a reader never sees meta without the world
  for (const k in docs) if (k !== 'world/meta') enqueue(k, docs[k]);
  enqueue('world/meta', docs['world/meta']);
  // wait until the first full save is through (used at world creation)
  for (let i = 0; i < 200 && (queue.size || writing); i++) await sleep(100);
  return Net.canWrite;
}

// ---------- host
let collector = null, renewTimer = null, hostTimers = [];
function becomeHost() {
  Net.role = 'host';
  if (!collector) { collector = Sync.collector(); collector.attach(); }
  collector.reset(S());
  emitLocal('role', 'host');
  clearInterval(renewTimer);
  renewTimer = setInterval(async () => {
    if (Net.role !== 'host') return;
    if (!Net.canWrite) { console.warn('cannot write: hosting locally'); clearInterval(renewTimer); becomeProjection(); return; }
    const ok = await tryLease();
    if (!ok && Net.role === 'host') { console.warn('lost the host lease'); demote(); }
  }, RENEW_MS);
  startHostLoops();
}
function startHostLoops() {
  for (const t of hostTimers) clearInterval(t); hostTimers = [];
  if (!collector) { collector = Sync.collector(); collector.attach(); collector.reset(S()); }
  // the simulation follows the global clock, also while this tab is in the background
  hostTimers.push(setInterval(hostTick, 250));
  hostTimers.push(setInterval(hostBroadcast, 1000));
  if (Net.transport === 'artifact') {
    let shardI = 0;
    hostTimers.push(setInterval(() => { if (Net.role !== 'host') return; const s = S(); const n = Sync.shards(s); for (let k = 0; k < 2; k++) { const i = shardI++ % n; enqueue('agents/s' + i, Sync.shardDoc(s, i)); } }, 4000));
    hostTimers.push(setInterval(() => { if (Net.role !== 'host') return; const s = S(); enqueue('world/core', Sync.coreDoc(s)); enqueue('world/feed', Sync.feedDoc(s)); }, 12000));
    hostTimers.push(setInterval(() => { if (Net.role !== 'host') return; const s = S(); while (s._snapQueue && s._snapQueue.length) { const sn = s._snapQueue.shift(); enqueue('snaps/d' + sn.d, { d: sn.d, w: sn.w, h: sn.h, v: sn.v, px: sn.px }); Net.snaps[sn.d] = sn; } }, 3000));
    hostTimers.push(setInterval(() => {
      if (Net.role !== 'host') return; const s = S();
      enqueue('world/rumors', Sync.rumorsDoc(s));
      enqueue('world/civ', Sync.civDoc(s));
      for (const e of Sync.editDocs()) enqueue('edits/e' + e.k, e);
      for (const p of Sync.historyPages(s)) enqueue('history/h' + p.k, p);
      Net.meta.savedAt = Date.now(); Net.meta.savedT = s.t; Net.meta.nAgents = s.agents.length; enqueue('world/meta', Object.assign({}, Net.meta));
    }, 20000));
  }
}
let ticking = false;
function hostTick() {
  if (ticking || (Net.role !== 'host' && Net.role !== 'local' && Net.role !== 'projection')) return;
  ticking = true;
  try {
    const s = S();
    let gap = Net.clockNow() - s.t;
    if (gap > 120) { Civ.catchUp(Math.floor(gap)); gap = Net.clockNow() - s.t; emitLocal('jump', gap); }
    let n = 0; while (gap > 0.0005 && n < 60) { const st = Math.min(1, gap); Sim.advance(st); gap -= st; n++; }
  } catch (e) { console.error('simulation error', e); }
  ticking = false;
}
let hbPrev = null, seq = 0;
function hostBroadcast() {
  if (Net.role !== 'host' && Net.role !== 'local' && Net.role !== 'projection') return;
  const s = S();
  const hb = Sync.heartbeat(s, hbPrev); hbPrev = hb; setHB(hb);
  if (Net.role !== 'host' || !ROOM) { collector && collector.take(s); return; }
  const frame = Sync.encodeFrame(s);
  ROOM.presence(Object.assign({ auth: TAB, f: frame, t: Math.round(s.t * 100) / 100, seq: ++seq, hb, w: s.weather && s.weather.kind }, Net.me || {})).catch(() => {});
  const c = collector.take(s);
  if (c.bubbles.length) for (const part of Sync.chunk(c.bubbles)) ROOM.emit('b', part).catch(() => {});
  if (c.events.length) for (const part of Sync.chunk(c.events.slice(-40))) ROOM.emit('e', part).catch(() => {});
  if (c.mind.length) for (const part of Sync.chunk(c.mind.slice(0, 30))) ROOM.emit('m', part).catch(() => {});
  if (c.edits.length) for (const part of Sync.chunk(c.edits, 3500)) ROOM.emit('x', part).catch(() => {});
  if (c.tasks.length) for (const part of Sync.chunk(c.tasks, 3500)) ROOM.emit('k', part).catch(() => {});
}
function setHB(hb) {
  Net.hb = hb; Net.hbAt = performance.now();
  Net.hbHist.push(hb.dd || 0); if (Net.hbHist.length > 60) Net.hbHist.shift();
  emitLocal('hb', hb);
}
function demote() {
  Net.role = 'follower';
  queue.clear();
  emitLocal('role', 'follower');
  becomeFollower(true);
  setTimeout(resync, 1500);
}

// ---------- follower
let watchdog = null, watching = false;
function becomeFollower(fromHost) {
  if (Net.role !== 'follower') Net.role = 'follower';
  emitLocal('role', 'follower');
  if (fromHost) collector && collector.reset(S());
  clearInterval(watchdog);
  // if the host disappears, the next writer takes over; a viewer who cannot write projects locally
  watchdog = setInterval(async () => {
    if (Net.role === 'host' || watching) return;
    const quiet = performance.now() - Net.frameAt > 9000;
    if (!quiet) return;
    watching = true;
    try {
      if (Net.canWrite && Net.transport === 'artifact' && await tryLease()) {
        // promote: catch up from the last state we have and continue
        const gap = Net.clockNow() - S().t; if (gap > 1) Civ.catchUp(Math.floor(gap));
        becomeHost();
        saveAll(true);
      } else if (Net.role !== 'projection') {
        // nobody is sending the world: run it here so time and work go on, and keep trying to host
        becomeProjection();
      }
    } finally { watching = false; }
  }, 4000);
  startFollowLoops();
}
function becomeProjection() {
  Net.role = 'projection';
  emitLocal('role', 'projection');
  startHostLoops();
}
let followTimer = null;
function startFollowLoops() {
  clearInterval(followTimer);
  followTimer = setInterval(() => {
    if (Net.role !== 'follower') return;
    // the global clock is the time; frames place people
    const s = S(); const t = Net.clockNow(); if (t > s.t) s.t = t;
  }, 250);
}
// called every animation frame: glide residents between the last two frames
Net.frame = function () {
  if (Net.role !== 'follower') return;
  const now = performance.now();
  for (const a of S().agents) {
    if (a._t0 === undefined) continue;
    const k = Math.min(1, (now - a._t0) / 1000);
    a.x = a._px + (a._nx - a._px) * k; a.z = a._pz + (a._nz - a._pz) * k;
    a.y = World.standAt(a.x, a.z);
    a.moving = k < 1 && Math.hypot(a._nx - a._px, a._nz - a._pz) > 0.05;
  }
};
function onFrame(m) {
  const s = S(); if (!s || typeof m.f !== 'string') return;
  Net.frameAt = performance.now();
  if (Net.role === 'projection') { Net.role = 'follower'; emitLocal('role', 'follower'); startFollowLoops(); resync(); return; }
  if (resyncing) return;
  const fr = Sync.decodeFrame(m.f);
  const now = performance.now();
  for (let i = 0; i < fr.length && i < s.agents.length; i++) {
    const a = s.agents[i], f = fr[i];
    if (f.f & 32) { a.hidden = true; } else a.hidden = false;
    const jump = a._nx === undefined || Math.hypot(f.x - a.x, f.z - a.z) > 10;
    a._px = jump ? f.x : a.x; a._pz = jump ? f.z : a.z; a._nx = f.x; a._nz = f.z; a._t0 = now;
    if (jump) { a.x = f.x; a.z = f.z; a.y = World.standAt(a.x, a.z); }
    a.dir = f.dir; a.sleeping = !!(f.f & 1); a.carryN = !!(f.f & 4); a.acting = f.f & 8 ? f.act : null; a.convo = f.f & 16 ? 'f' : null; a.act = f.act;
    a.thinking = f.act === 'think' || f.act === 'llm' ? f.act : null;
    if (a.plan && f.act && Sync.ACTS.indexOf(f.act) <= 23 && f.act !== a.plan.type) a.plan = Object.assign({}, a.plan, { type: f.act, place: null, reason: a.plan.reason });
  }
  if (m.hb) setHB(m.hb);
  if (m.w && s.weather) s.weather.kind = m.w;
}
// a host appeared while this view was projecting on its own: take the shared state as it is now
let resyncing = false;
async function resync() {
  if (!DB || resyncing) return;
  resyncing = true;
  try {
    const docs = await readAll();
    if (docs['world/core']) { Net.meta = docs['world/meta'] || Net.meta; editDocs = {}; for (const k in docs) if (k.startsWith('edits/')) editDocs[k] = Sync.decodeEdits(docs[k]); Sync.build(docs); if (AV.Render && AV.Render.refreshAll) AV.Render.refreshAll(); emitLocal('resync'); }
  } catch (e) { console.warn('resync failed', e); }
  resyncing = false;
}
function onBubbles(list) {
  const s = S(); if (!Array.isArray(list)) return;
  for (const [i, text] of list) { const a = s.agents[i]; if (a && typeof text === 'string') a.bubble = { text: text.slice(0, 200), t: s.t }; }
}
function onEvents(list) {
  const s = S(); if (!Array.isArray(list)) return;
  const have = new Set(s.events.slice(-300).map(e => e.id));
  for (const e of list) {
    if (!e || have.has(e.id)) continue;
    s.events.push(e); if (s.events.length > 700) s.events.splice(0, 100);
    if ((e.imp || 0) >= 0.35) { s.feed.unshift(e); if (s.feed.length > 220) s.feed.length = 220; }
    emitLocal('event', e);
  }
}
function onMind(list) {
  const s = S(); if (!Array.isArray(list)) return;
  const have = new Set(s.mindFeed.slice(0, 80).map(m => m.id));
  for (const m of list.slice().reverse()) if (m && !have.has(m.id)) { s.mindFeed.unshift(m); emitLocal('mind', m); }
  if (s.mindFeed.length > 220) s.mindFeed.length = 220;
}
function onTasks(list) {
  const s = S(); if (!Array.isArray(list)) return;
  for (const [i, t, r] of list) { const a = s.agents[i]; if (a && typeof t === 'string') a.task = { t: t.slice(0, 90), r: String(r || '').slice(0, 90) }; }
}
function onEdits(list) {
  if (!Array.isArray(list)) return;
  for (const [i, b] of list) {
    const x = i % World.W, z = Math.floor(i / World.W) % World.D, y = Math.floor(i / (World.W * World.D));
    if (World.inb(x, y, z) && World.BLOCKS[b]) World.set(x, y, z, b, { sync: true });
  }
}
let editDocs = {};
function applyDoc(key, body) {
  const s = S(); if (!s || !body) return;
  if (key === 'world/meta') { Net.meta = Object.assign({}, Net.meta, body); return; }
  if (key === 'world/core') { Sync.applyCore(s, body); emitLocal('core'); return; }
  if (key === 'world/feed') { Sync.applyFeed(s, body); return; }
  if (key === 'world/civ') { for (const k of Sync.CIV_KEYS) if (k in body && k !== 'plan') s[k] = body[k]; emitLocal('civ'); return; }
  if (key === 'world/rumors') { s.rumors = Object.assign(s.rumors || {}, body.rumors || {}); return; }
  if (key.startsWith('agents/')) { Sync.applyShard(s, body); return; }
  if (key.startsWith('edits/')) { editDocs[key] = Sync.decodeEdits(body); const all = {}; for (const k in editDocs) Object.assign(all, editDocs[k]); World.syncEdits(all, true); return; }
  if (key.startsWith('history/')) { const k = body.k || 0; s.history.splice(k * Sync.HIST_PAGE, (body.items || []).length, ...(body.items || [])); emitLocal('history'); }
}
function subscribeDocs() {
  for (const c of ['world', 'agents', 'edits', 'history']) {
    try {
      DB.collection(c).onSnapshot((q) => {
        if (Net.role === 'host' || Net.role === 'local') return;
        for (const ch of q.docChanges()) { if (ch.type === 'removed') continue; if (ch.doc.metadata && ch.doc.metadata.hasPendingWrites) continue; applyDoc(c + '/' + ch.doc.id, thaw(ch.doc.data())); }
      }, (e) => console.warn('subscription', c, e && e.code));
    } catch (e) { console.warn('subscribe', c, e); }
  }
}

// ---------- room: frames, bubbles, events, visitor actions
let rpcWait = {};
function setupRoom() {
  if (!ROOM) { Net.rpc = async (op, args) => Net.role === 'host' || Net.role === 'projection' ? Sync.rpc(op, Net.pid, args) : { ok: false, error: 'offline' }; return; }
  ROOM.onPeers((ch) => {
    Net.peers = ch.peers.map(p => ({ peer: p.peer, by: p.by, isMe: p.isMe && p.sameTab, guest: p.guest, pid: p.presence && p.presence.pid, name: p.presence && typeof p.presence.name === 'string' ? p.presence.name.slice(0, 24) : '', x: +(p.presence && p.presence.x) || 0, y: +(p.presence && p.presence.y) || 0, z: +(p.presence && p.presence.z) || 0, yaw: +(p.presence && p.presence.yaw) || 0, mode: p.presence && p.presence.mode, auth: p.presence && p.presence.auth }));
    Net.online = Math.max(1, ch.peers.length);
    // the host's frame rides in its presence
    for (const p of ch.updated.concat(ch.joined)) {
      const pr = p.presence || {};
      if (pr.auth && pr.auth !== TAB && typeof pr.f === 'string' && Net.role !== 'host') onFrame(pr);
      // the host applies visitors' positions so residents can notice them
      if (Net.role === 'host' && !p.sameTab && pr.pid && p.by && pr.pid === pidFor(p.by)) Sync.rpc('pos', pr.pid, [pr.x, pr.z, pr.y]);
    }
    emitLocal('peers', Net.peers);
  });
  ROOM.on('b', (m) => { if (Net.role !== 'host' && isHostMsg(m)) onBubbles(thaw(m.data)); });
  ROOM.on('e', (m) => { if (Net.role !== 'host' && isHostMsg(m)) onEvents(thaw(m.data)); });
  ROOM.on('m', (m) => { if (Net.role !== 'host' && isHostMsg(m)) onMind(thaw(m.data)); });
  ROOM.on('x', (m) => { if (Net.role !== 'host' && isHostMsg(m)) onEdits(thaw(m.data)); });
  ROOM.on('k', (m) => { if (Net.role !== 'host' && isHostMsg(m)) onTasks(m.data); });
  ROOM.on('rpc', (m) => {
    if (Net.role !== 'host' || !m.data || typeof m.data !== 'object') return;
    // a visitor can only act as themselves
    const pid = m.by ? pidFor(m.by) : null;
    let res; try { res = pid ? Sync.rpc(String(m.data.op).slice(0, 20), pid, thaw(m.data.args)) : { ok: false, error: 'sign in to take part' }; } catch (e) { res = { ok: false, error: 'failed' }; console.warn(e); }
    let body = { id: m.data.id, to: m.peer, res };
    if (JSON.stringify(body).length > 3800) body = { id: m.data.id, to: m.peer, res: { ok: res && res.ok, error: res && res.error, result: Array.isArray(res && res.result) ? res.result.slice(0, 3).map(l => Object.assign({}, l, { text: String(l.text || '').slice(0, 400) })) : undefined } };
    ROOM.emit('rpcr', body).catch(() => {});
  });
  ROOM.on('rpcr', (m) => { const d = m.data; if (!d || !rpcWait[d.id]) return; const r = rpcWait[d.id]; delete rpcWait[d.id]; r(d.res); });
  Net.sendPresence = (p) => { Net.me = p; if (Net.role !== 'host') ROOM.presence(p).catch(() => {}); };
  Net.rpc = (op, args) => {
    if (Net.role === 'host' || Net.role === 'projection') return Promise.resolve(Sync.rpc(op, Net.pid, args));
    if (!Net.canWrite) return Promise.resolve({ ok: false, error: 'spectator' });
    return new Promise((resolve) => {
      const id = TAB + ':' + (++rpcSeq); rpcWait[id] = resolve;
      ROOM.emit('rpc', { id, op, args }).catch((e) => { delete rpcWait[id]; resolve({ ok: false, error: e && e.code === 'not_permitted' ? 'spectator' : 'offline' }); });
      setTimeout(() => { if (rpcWait[id]) { delete rpcWait[id]; resolve({ ok: false, error: 'no answer from the host' }); } }, 9000);
    });
  };
}
function pidFor(by) { return 'p_' + String(by).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 36); }
function isHostMsg(m) { const p = Net.peers.find(x => x.peer === m.peer); return !!(p && p.auth); }

Net.rpc = async (op, args) => Sync.rpc(op, Net.pid, args);
Net.sendPresence = (p) => { Net.me = p; };
Net.setName = function (name) {
  Net.name = String(name || '').slice(0, 24); pref.set('name', Net.name);
  return Net.rpc('join', [Net.name || 'Traveller']);
};
Net.pref = pref;
Net.save = () => { if (Net.role === 'host') saveAll(false); };
document.addEventListener('visibilitychange', () => { if (document.hidden && Net.role === 'host') saveAll(false); });
})(typeof window !== 'undefined' ? window : globalThis);
