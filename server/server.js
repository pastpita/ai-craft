// AI CRAFT — authoritative shared-world server.
// One simulation, one world clock, PostgreSQL persistence, WebSocket fan-out to every visitor.
//   DATABASE_URL=postgres://av:av@localhost/aivillage PORT=8787 node server.js
// Without DATABASE_URL it persists to ./world-data.json (single-machine fallback).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const ROOT = path.join(__dirname, '..', 'web');
globalThis.World = require(path.join(ROOT, 'js', 'world.js'));
for (const f of ['cast', 'sim', 'society', 'civ', 'sync']) require(path.join(ROOT, 'js', f + '.js'));
const { Sim, Civ, Sync } = globalThis.AV;

const PORT = +process.env.PORT || 8787;
const DB_URL = process.env.DATABASE_URL || '';
const FILE = process.env.AV_FILE || path.join(__dirname, 'world-data.json');
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.AV_MODEL || 'claude-haiku-5-5';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------------- storage: Postgres, or a JSON file ----------------
const Store = {
  pool: null,
  async init() {
    if (!DB_URL) { log('storage: file', FILE); return; }
    const { Pool } = require('pg');
    this.pool = new Pool({ connectionString: DB_URL, max: 4 });
    await this.pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    log('storage: postgres');
  },
  async loadAll() {
    if (!this.pool) { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return {}; } }
    const r = await this.pool.query('select key, body from world_docs');
    const out = {}; for (const row of r.rows) out[row.key] = row.body; return out;
  },
  async saveDocs(docs) {
    const keys = Object.keys(docs); if (!keys.length) return;
    if (!this.pool) { const all = await this.loadAll(); Object.assign(all, docs); fs.writeFileSync(FILE + '.tmp', JSON.stringify(all)); fs.renameSync(FILE + '.tmp', FILE); return; }
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      for (const k of keys) await c.query('insert into world_docs (key, body, updated_at) values ($1, $2, now()) on conflict (key) do update set body = excluded.body, updated_at = now()', [k, JSON.stringify(docs[k])]);
      await c.query('commit');
    } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
  },
  async appendHistory(worldId, items) {
    if (!this.pool || !items.length) return;
    for (const h of items) await this.pool.query('insert into world_history (world_id, day, t, kind, village, text) values ($1,$2,$3,$4,$5,$6)', [worldId, h.day, h.t, h.kind || null, h.vid || null, h.text]);
  },
  async appendEvents(worldId, evs) {
    if (!this.pool || !evs.length) return;
    for (const e of evs) await this.pool.query('insert into world_events (world_id, ev_id, day, t, type, village, actor, text, truth) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing', [worldId, e.id, e.day, e.t, e.type, e.vid || null, e.actor || null, e.text || null, e.truth || null]);
  },
  async saveMetrics(worldId, rows, totals) {
    if (!this.pool) return;
    for (const r of rows) await this.pool.query('insert into world_metrics (world_id, day, population, wealth, buildings, houses_built, blocks_placed, blocks_mined, trees_cut, crops_harvested, farm_tiles, trade_volume, businesses, data) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict (world_id, day) do update set data = excluded.data', [worldId, r.d, r.pop, r.wealth, r.bld, r.housesBuilt, r.blocksPlaced, r.blocksMined, r.treesCut, r.cropsHarvested, r.farmTiles, Math.round(r.tradeVolume || 0), r.biz, JSON.stringify(r)]);
    if (totals) await this.pool.query('insert into world_metrics_totals (world_id, totals, updated_at) values ($1, $2, now()) on conflict (world_id) do update set totals = excluded.totals, updated_at = now()', [worldId, JSON.stringify(totals)]);
  },
  async wipe() { if (this.pool) await this.pool.query('delete from world_docs'); else try { fs.unlinkSync(FILE); } catch (e) { /* none */ } },
};

// ---------------- the world ----------------
let S = null, meta = null;
const collector = Sync.collector();
const lastSaved = {};             // key -> JSON string written last
let histSaved = 0, evSaved = 0, metricsSaved = 0;

async function boot() {
  await Store.init();
  const docs = await Store.loadAll();
  // worlds from before the civilization update were fully built from the start: they are re-founded as camps
  const current = docs['world/meta'] && (docs['world/meta'].schema || 0) >= Sync.SCHEMA;
  if (docs['world/meta'] && docs['world/core'] && current && process.env.AV_RESET !== '1') {
    meta = docs['world/meta'];
    S = Sync.build(docs);
    for (const k in docs) lastSaved[k] = JSON.stringify(docs[k]);
    histSaved = S.history.length; evSaved = S.events.length ? S.events[S.events.length - 1].id : 0;
    log('loaded world', meta.worldId, 'day', Sim.dayOf(S.t), Sim.fmtClock(S.t));
  } else {
    if (docs['world/meta']) await Store.wipe();
    Sim.newWorld(Date.now() % 100000);
    for (let i = 0; i < 150; i++) Sim.advance(1);
    S = Sim.S();
    meta = { schema: Sync.SCHEMA, worldId: S.worldId, clock: { epoch: Date.now(), t0: S.t }, seq: 0, created: Date.now(), host: 'server' };
    log('created world', meta.worldId);
  }
  meta.host = 'server';
  // the world kept living while the server was down
  const gap = Sync.clockNow(meta.clock) - S.t;
  if (gap > 2) {
    log('catching up', Math.round(gap), 'world minutes (' + (gap / 1440).toFixed(1) + ' days)');
    const t0 = Date.now();
    const evs = Civ.catchUp(Math.floor(gap), (f) => log('  catch-up', Math.round(f * 100) + '%'));
    log('caught up in', Date.now() - t0, 'ms;', evs.length, 'events while offline');
  }
  collector.attach(); collector.reset(S);
  await persist(true);
  startLoops();
  startHttp();
}

// ---------------- simulation loop ----------------
let hbPrev = null, seq = 0, ticking = false;
function startLoops() {
  setInterval(() => {
    if (ticking) return; ticking = true;
    try {
      const target = Sync.clockNow(meta.clock);
      let gap = target - S.t;
      if (gap > 90) { Civ.catchUp(Math.floor(gap)); gap = target - S.t; }
      let n = 0; while (gap > 0.001 && n < 40) { const st = Math.min(1, gap); Sim.advance(st); gap -= st; n++; }
    } catch (e) { log('tick error', e.stack); }
    ticking = false;
  }, 250);
  setInterval(broadcastFrame, 1000);
  setInterval(() => persist(false).catch(e => log('persist error', e.message)), 15000);
  let shardI = 0;
  setInterval(() => { const n = Sync.shards(S); const k = shardI++ % n; send({ k: 'doc', key: 'agents/s' + k, body: Sync.shardDoc(S, k) }); }, 2000);
  setInterval(() => { send({ k: 'doc', key: 'world/core', body: Sync.coreDoc(S) }); send({ k: 'doc', key: 'world/feed', body: Sync.feedDoc(S) }); }, 10000);
  setInterval(llmTick, 20000);
}
function broadcastFrame() {
  if (!S) return;
  const hb = Sync.heartbeat(S, hbPrev); hbPrev = hb;
  const msg = { k: 'f', t: S.t, seq: ++seq, f: Sync.encodeFrame(S), hb, w: S.weather && S.weather.kind };
  send(msg);
  const c = collector.take(S);
  if (c.bubbles.length) send({ k: 'b', d: c.bubbles });
  if (c.events.length) send({ k: 'e', d: c.events.slice(-60) });
  if (c.mind.length) send({ k: 'm', d: c.mind.slice(0, 40) });
  if (c.edits.length) for (const part of Sync.chunk(c.edits, 60000)) send({ k: 'x', d: part });
  if (c.tasks.length) send({ k: 'k', d: c.tasks });
}
async function persist(all) {
  meta.seq = (meta.seq || 0) + 1; meta.savedAt = Date.now(); meta.savedT = S.t; meta.nAgents = S.agents.length; meta.shards = Sync.shards(S);
  const docs = Sync.allDocs(S, meta);
  const changed = {};
  for (const k in docs) { const j = JSON.stringify(docs[k]); if (all || lastSaved[k] !== j) { changed[k] = docs[k]; lastSaved[k] = j; } }
  await Store.saveDocs(changed);
  // snapshots for Then / Now, written once each
  const snaps = {}; while (S._snapQueue && S._snapQueue.length) { const sn = S._snapQueue.shift(); snaps['snaps/d' + sn.d] = sn; }
  if (Object.keys(snaps).length) await Store.saveDocs(snaps);
  const rows = (S.metricsHist || []).filter(r => r.d > metricsSaved); if (rows.length) metricsSaved = rows[rows.length - 1].d;
  await Store.saveMetrics(meta.worldId, rows, Object.assign({ day: Sim.dayOf(S.t) }, S.metrics || {}, Civ.worldTotals ? Civ.worldTotals() : {}));
  const newHist = S.history.slice(histSaved); histSaved = S.history.length;
  const newEv = S.events.filter(e => e.id > evSaved && (e.imp || 0) >= 0.4); if (S.events.length) evSaved = S.events[S.events.length - 1].id;
  await Store.appendHistory(meta.worldId, newHist);
  await Store.appendEvents(meta.worldId, newEv);
  for (const k in changed) if (k.startsWith('edits/') || k.startsWith('history/') || k === 'world/rumors' || k === 'world/meta' || k === 'world/civ') send({ k: 'doc', key: k, body: changed[k] });
}

// ---------------- optional: language-model decisions for featured residents ----------------
async function llmTick() {
  if (!API_KEY || !S) return;
  const pool = S.agents.filter(a => (a.core || a.featured) && !a.left && !a.sleeping && !a.convo && a.jailUntil <= S.t);
  const a = pool[Math.floor(Math.random() * pool.length)]; if (!a) return;
  const prompt = Sim.buildDecisionPrompt(a);
  a.thinking = 'llm';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt + '\nAnswer with JSON only.' }] }) });
    const j = await r.json();
    const text = (j.content || []).map(c => c.text || '').join('');
    const m = text.match(/\{[\s\S]*\}/);
    const res = m ? Sim.applyDecision(a, JSON.parse(m[0])) : { ok: false };
    S.llmLog = S.llmLog || []; S.llmLog.push({ t: S.t, kind: 'decision', who: a.id, prompt: prompt.slice(0, 1500), raw: text.slice(0, 800), ok: !!(res && res.ok) });
  } catch (e) { log('llm error', e.message); }
  a.thinking = null;
}

// ---------------- HTTP + WebSocket ----------------
const clients = new Set();
function send(msg) { const s = JSON.stringify(msg); for (const ws of clients) if (ws.readyState === 1) ws.send(s); }
const peers = new Map();
function sendPeers() { send({ k: 'peers', peers: [...peers.values()] }); }
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css', '.md': 'text/markdown; charset=utf-8' };
function startHttp() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/hello') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, transport: 'server', worldId: meta.worldId, clock: meta.clock, day: Sim.dayOf(S.t), agents: S.agents.length })); }
    if (url.pathname === '/api/world') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ day: Sim.dayOf(S.t), time: Sim.fmtClock(S.t), world: Sim.worldStats(), villages: World.VILLAGES.map(v => Sim.stats(v.id)) })); }
    if (url.pathname === '/api/snaps') { Store.loadAll().then(all => { const snaps = Object.keys(all).filter(k => k.startsWith('snaps/')).map(k => all[k]); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ snaps })); }).catch(() => { res.writeHead(500); res.end('{}'); }); return; }
    if (url.pathname === '/api/metrics') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ day: Sim.dayOf(S.t), totals: Object.assign({}, S.metrics || {}, Civ.worldTotals()), daily: S.metricsHist || [], reports: (S.reports || []).slice(-14) })); }
    if (url.pathname === '/api/history') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(S.history)); }
    let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(404); return res.end(); }
    fs.readFile(file, (err, buf) => { if (err) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(buf); });
  });
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
  wss.on('connection', (ws) => {
    const peer = 'c' + Math.random().toString(36).slice(2, 9);
    clients.add(ws);
    ws.send(JSON.stringify({ k: 'hello', meta, peer }));
    ws.send(JSON.stringify({ k: 'docs', docs: Sync.allDocs(S, meta) }));
    ws.send(JSON.stringify({ k: 'peers', peers: [...peers.values()] }));
    let budget = 30; const refill = setInterval(() => { budget = Math.min(30, budget + 10); }, 1000);
    ws.on('message', (raw) => {
      if (--budget < 0) return;
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (!m || typeof m !== 'object') return;
      if (m.k === 'rpc') {
        let res; try { res = Sync.rpc(String(m.op), m.pid, m.args); } catch (e) { res = { ok: false, error: 'failed' }; log('rpc error', m.op, e.message); }
        ws.send(JSON.stringify({ k: 'rpcr', id: m.id, res }));
      } else if (m.k === 'presence' && m.p && typeof m.p === 'object') {
        const p = m.p; const pid = Sync.cleanPid(p.pid);
        peers.set(peer, { peer, pid, name: String(p.name || '').slice(0, 24), x: +p.x || 0, y: +p.y || 0, z: +p.z || 0, yaw: +p.yaw || 0, mode: String(p.mode || '').slice(0, 10) });
        if (pid && S.players[pid]) Sync.rpc('pos', pid, [p.x, p.z, p.y]);
        sendPeersSoon();
      }
    });
    ws.on('close', () => { clients.delete(ws); clearInterval(refill); peers.delete(peer); sendPeersSoon(); });
  });
  server.listen(PORT, () => log('AI CRAFT server on http://localhost:' + PORT));
}
let peersTimer = null;
function sendPeersSoon() { if (peersTimer) return; peersTimer = setTimeout(() => { peersTimer = null; sendPeers(); }, 250); }

process.on('SIGINT', async () => { log('saving before exit'); try { await persist(false); } catch (e) { log(e.message); } process.exit(0); });
process.on('SIGTERM', async () => { try { await persist(false); } catch (e) { /* ignore */ } process.exit(0); });
boot().catch(e => { console.error(e); process.exit(1); });
