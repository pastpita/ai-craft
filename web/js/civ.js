/* AI CRAFT \u2014 civ.js
   Civilization layer on top of the agent simulation:
   resource nodes and physical gathering, material-driven construction, homes and property,
   businesses and hiring, lending, skills, mind scores (derived from traits + measured behavior),
   mind types, decision explanations, live mind feed, migration, trade caravans, village visits,
   world events, village tiers and tech, permanent history, and the coarse macro-day model. */
(function (root) {
'use strict';
const AV = root.AV = root.AV || {};
const World = root.World || require('./world.js');
const Sim = AV.Sim;
const B = World.B;
const { DAY, RI, clamp, pick } = Sim;
const rnd = Math.random;
const S = () => Sim.S();
const dayOf = Sim.dayOf, hourOf = Sim.hourOf;
const nameOf = (id, v) => Sim.nameOf(id, v);
const Civ = AV.Civ = {};

// ---------------- constants ----------------
const RATE = { food: 3.4, wood: 4.8, stone: 3.4, iron: 1.4, coal: 1.7, gold: 0.18, clay: 3.2, wool: 1.4, fish: 2.6 };
const SKILL_OF = { food: 'farming', fish: 'fishing', wood: 'woodcutting', stone: 'mining', iron: 'mining', coal: 'mining', gold: 'mining', clay: 'digging', wool: 'herding' };
const STOCK_OF = { fish: 'food' };
const JOB_SKILL = { farmer: 'farming', fisher: 'fishing', woodcutter: 'woodcutting', miner: 'mining', potter: 'digging', shepherd: 'herding', builder: 'building', baker: 'baking', blacksmith: 'smithing', merchant: 'trade', shopkeeper: 'trade', bartender: 'trade', guard: 'investigation', nightguard: 'investigation', journalist: 'writing', doctor: 'medicine', mayor: 'politics', teacher: 'teaching' };
const SKILLS = ['farming', 'fishing', 'woodcutting', 'mining', 'digging', 'herding', 'building', 'baking', 'smithing', 'trade', 'investigation', 'writing', 'medicine', 'politics', 'teaching'];
const CARRY = 8;
Civ.RATE = RATE; Civ.SKILLS = SKILLS; Civ.JOB_SKILL = JOB_SKILL;
const MAT = {};
[B.PLANKS, B.LOG, B.FENCE, B.DOOR, B.SHELF, B.THATCH].forEach(b => { MAT[b] = 'wood'; });
[B.COBBLE, B.STONE, B.STONE_BRICK, B.SLATE].forEach(b => { MAT[b] = 'stone'; });
[B.BRICK, B.ROOF_TILE, B.PLASTER, B.GLASS].forEach(b => { MAT[b] = 'clay'; });
[B.CLOTH, B.WOOL].forEach(b => { MAT[b] = 'wool'; });
MAT[B.TORCH] = 'coal';
// when a material runs out, builders change the plan instead of standing at the storehouse
const SUB = {};
SUB[B.BRICK] = [B.STONE_BRICK, B.COBBLE, B.PLANKS]; SUB[B.ROOF_TILE] = [B.SLATE, B.THATCH, B.PLANKS]; SUB[B.PLASTER] = [B.PLANKS, B.COBBLE]; SUB[B.GLASS] = [0];
SUB[B.CLOTH] = [B.PLANKS]; SUB[B.WOOL] = [B.PLANKS]; SUB[B.TORCH] = [0];
[B.COBBLE, B.STONE, B.STONE_BRICK].forEach(b => { SUB[b] = [B.PLANKS]; }); SUB[B.SLATE] = [B.THATCH, B.PLANKS];
[B.PLANKS, B.LOG, B.FENCE, B.SHELF].forEach(b => { SUB[b] = [B.COBBLE, B.STONE_BRICK]; }); SUB[B.THATCH] = [B.SLATE, B.COBBLE];
const MAT_WORD = { clay: 'clay', stone: 'stone', wood: 'timber', wool: 'wool', coal: 'coal' };
function substitute(pr, mat, a) {
  const Vv = V(pr.vid); const st = Vv.econ.stock;
  const rem = {}; for (let k = pr.i; k < pr.blocks.length; k++) { const b = pr.blocks[k][3]; if (MAT[b] === mat) rem[b] = (rem[b] || 0) + 1; }
  const swap = {}; let into = null;
  for (const key in rem) {
    let best = null, bs = -1;
    for (const alt of SUB[key] || []) { if (alt === 0) { if (best === null) { best = 0; bs = 0; } continue; } const am = MAT[alt]; if (am === mat) continue; const have = (st[am] || 0) + (pr.site[am] || 0); if (have > bs) { bs = have; best = alt; } }
    if (best === null || (best !== 0 && bs < Math.min(4, rem[key]))) continue;
    swap[key] = best; if (best) into = into || MAT[best];
  }
  if (!Object.keys(swap).length) return 0;
  let n = 0;
  for (let k = pr.i; k < pr.blocks.length; k++) { const b = pr.blocks[k][3]; if (swap[b] !== undefined) { const r = pr.blocks[k]; pr.blocks[k] = [r[0], r[1], r[2], swap[b]]; n++; } }
  pr.waiting = null; pr.waitSince = null; pr.subs = (pr.subs || 0) + 1;
  pr.cost = Math.max(1, Math.round(pr.cost));
  const who = a ? a.name : 'The builders of ' + Vv.name;
  const txt = into ? who + ' changed the plan for ' + pr.label + ': ' + Vv.name + ' is out of ' + (MAT_WORD[mat] || mat) + ', so it goes up in ' + (MAT_WORD[into] || into) + ' instead.' : who + ' left the windows of ' + pr.label + ' open: ' + Vv.name + ' is out of ' + (MAT_WORD[mat] || mat) + '.';
  if (a) { Sim.setThought(a, 'No ' + (MAT_WORD[mat] || mat) + ' anywhere. We build it in ' + (into ? MAT_WORD[into] || into : 'what we have') + '.'); Civ.mind(a, a.name + ' changed the plan of ' + pr.label + ': ' + (MAT_WORD[mat] || mat) + ' ran out, so ' + (into || 'other blocks') + ' instead', 'decision'); }
  Sim.emit({ type: 'CONSTRUCTION_STARTED', vid: pr.vid, actor: a ? a.id : null, imp: 0.38, public: true, what: 'change of plan', x: pr.lot.x, z: pr.lot.z, text: txt });
  return n;
}
Civ.substitute = substitute;

// ---------------- helpers ----------------
function V(vid) { return S().villages[vid]; }
function people(vid) { return S().agents.filter(a => !a.left && a.vid === vid); }
function walk(a, x, z, maxNodes) {
  if (S().coarse) { a.x = x + 0.5; a.z = z + 0.5; a.y = World.standAt(a.x, a.z); a.path = null; return true; }
  const p = World.findPath(a.x, a.z, x, z, maxNodes || 9000);
  if (p && p.length > 1) { a.path = p; a.pi = 1; return false; }
  if (!p) { a.x = x + 0.5; a.z = z + 0.5; a.y = World.standAt(a.x, a.z); }
  a.path = null; return true;
}
function near(a, x, z, r) { return Math.hypot(a.x - x - 0.5, a.z - z - 0.5) < (r || 1.8); }
function stockKey(t) { return STOCK_OF[t] || t; }
Civ.walk = walk;

// ---------------- init ----------------
Civ.init = function () {
  const s = S();
  s.nodes = {};
  for (const n of World.nodes) s.nodes[n.id] = Math.round(n.max * (n.type === 'wood' ? 1 : n.type === 'food' ? 0.85 : 1));
  s.farms = {}; s.fields = [];
  for (const n of World.nodes) if (n.crop) { const f = farmOf(n); let st = ''; for (let i = 0; i < n.blocks.length; i++) { const r = rnd(); st += r < 0.62 ? '2' : r < 0.86 ? '1' : '0'; } f.s = st; s.nodes[n.id] = cropCount(n, '2') * CROP_YIELD; }
  for (const a of s.agents) initAgent(a);
  // property: every generated house becomes a property owned by one of its residents
  for (const b of World.buildings.filter(b => b.kind === 'house')) {
    const res = s.agents.filter(a => a.home === b.id);
    const owner = res.slice().sort((x, y) => (y.core - x.core) || (y.money - x.money) || (y.age - x.age))[0];
    const tier = b.w * b.d >= 56 ? 'cottage' : 'hut';
    s.properties['pr_' + b.id] = { id: 'pr_' + b.id, vid: b.vid, placeId: b.id, kind: 'house', tier, owner: owner ? owner.id : null, value: tier === 'cottage' ? 120 : 80, cost: 0, condition: 0.75 + rnd() * 0.25, built: 0, forSale: !owner, price: tier === 'cottage' ? 130 : 90, residents: res.map(a => a.id) };
    if (owner) owner.owns = ['pr_' + b.id];
  }
  s.relations = {};
  const pairs = [['ironridge', 'rivergate', 12], ['highvale', 'ashfield', -12], ['greenhollow', 'highvale', 8], ['rivergate', 'ashfield', 4], ['ironridge', 'ashfield', -6]];
  for (const [a, b, v] of pairs) s.relations[relKey(a, b)] = v;
  s.history = [{ day: 1, t: s.t, kind: 'world', vid: null, text: 'The world began: five villages, ' + s.agents.length + ' minds.' }];
  for (const a of s.agents) updateScores(a, true);
  Civ.syncAllNodes();
};
// worlds saved before crops and fields existed: seed the fields and open the first building sites
Civ.upgradeSave = function (s) {
  s.counters = s.counters || {}; s.counters.work = s.counters.work || {};
  if (s.fields && s.farms && Object.keys(s.farms).length) return;
  s.farms = s.farms || {};
  for (const n of World.nodes) if (n.crop && !s.farms[n.id]) { const f = farmOf(n); let st = ''; for (let i = 0; i < n.blocks.length; i++) { const r = rnd(); st += r < 0.6 ? '2' : r < 0.85 ? '1' : '0'; } f.s = st; s.nodes[n.id] = cropCount(n, '2') * CROP_YIELD; }
  if (!s.fields) { s.fields = []; Civ.startFields(); }
};
// right after the villages exist: most farming villages have a new field pegged out, waiting to be tilled
Civ.startFields = function () {
  const s = S();
  for (const v of World.VILLAGES) if (villageCrops(v.id).length && rnd() < 0.8) { const by = people(v.id).find(a => a.job === 'farmer'); if (by) Civ.planField(v.id, by); }
  s.events = s.events.filter(e => e.type !== 'CONSTRUCTION_STARTED'); s.feed = s.feed.filter(e => e.type !== 'CONSTRUCTION_STARTED');
  for (const v of World.VILLAGES) { const Vv = V(v.id); if (Vv) Vv.tierScore = Math.round(tierScore(v.id) * 10) / 10; }
  // the better-off already saved for a bigger home: building sites from the first morning
  for (const v of World.VILLAGES) {
    const rich = people(v.id).filter(a => !['mayor', 'builder'].includes(a.job)).sort((x, y) => y.money - x.money)[0];
    if (!rich || rnd() < 0.25) continue;
    const tier = rich.money > Civ.estimate(v.id, 'stone') * 0.6 ? 'stone' : 'cottage';
    const est = Civ.estimate(v.id, tier);
    const pay = Math.min(rich.money * 0.8, est);
    const pr = Civ.startProject(rich, 'home', { tier, escrow: est * 1.3, why: rich.name + ' saved ' + Math.round(pay) + ' coins and borrowed the rest for a ' + HOME[tier].label });
    if (pr) { rich.money -= pay; rich.debt = (rich.debt || 0) + Math.round(Math.max(0, est * 1.3 - pay)); rich.goals = (rich.goals || []).filter(g => g.type !== 'BUILD_HOME'); rich.goals.unshift({ type: 'MOVE_INTO_NEW_HOME', primary: true, progress: 0 }); }
  }
  s.events = s.events.filter(e => e.type !== 'CONSTRUCTION_STARTED'); s.feed = s.feed.filter(e => e.type !== 'CONSTRUCTION_STARTED');
};
function initAgent(a) {
  a.skills = a.skills || {};
  const yrs = clamp((a.age - 16) / 40, 0.1, 1);
  for (const k of SKILLS) a.skills[k] = a.skills[k] || Math.round(3 + rnd() * 10);
  const js = JOB_SKILL[a.job]; if (js) a.skills[js] = Math.round(30 + yrs * 40 + rnd() * 12);
  if (a.job === 'miner') a.skills.mining = Math.max(a.skills.mining, 35);
  a.stats = Object.assign({ thefts: 0, convos: 0, helped: 0, recalls: 0, adopted: 0, liesTold: 0, liesBelieved: 0, exposed: 0, adapt: 0, achieved: 0, earned: 0, gathered: 0, sickMins: 0, types: {} }, a.stats || {});
  a.needAvg = a.needAvg || 0.7;
  a.carry = a.carry || {};
  a.owns = a.owns || [];
  a.scoreHist = a.scoreHist || [];
  a.mindVer = a.mindVer || 0; a.mindDrift = a.mindDrift || 0;
  computeMind(a);
}
Civ.initAgent = initAgent;
function relKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
Civ.relKey = relKey;
Civ.villageRel = (a, b) => S().relations[relKey(a, b)] || 0;
function bumpRel(a, b, d) { if (!a || !b || a === b) return; const k = relKey(a, b); S().relations[k] = clamp((S().relations[k] || 0) + d, -100, 100); }

// ---------------- skills ----------------
Civ.skillMult = function (a, k) { const v = (a.skills && a.skills[k]) || 10; const tech = V(a.vid) ? 1 + (V(a.vid).tech - 1) * 0.03 : 1; return (0.6 + v / 100 * 0.8) * tech; };
Civ.practice = function (a, k, amt) {
  if (!a.skills || !k) return;
  const lr = 0.6 + a.p.openness * 0.5 + a.p.curiosity * 0.3;
  const v = a.skills[k] || 5;
  const nv = Math.min(100, v + 0.02 * (amt || 1) * (1 - v / 110) * lr);
  if (Math.floor(nv / 10) > Math.floor(v / 10) && nv >= 40) Civ.mind(a, a.name + '\'s ' + k + ' skill reached ' + Math.floor(nv), 'skill');
  a.skills[k] = nv;
};
Civ.gatherJobsFor = function (vid) {
  const out = [];
  for (const j of ['farmer', 'woodcutter', 'miner', 'fisher', 'shepherd', 'potter']) {
    const types = AV.JOBS[j].gather;
    if (World.nodes.some(n => n.vid === vid && types.includes(n.type) && ((S().nodes[n.id] || 0) >= 1 || n.crop))) out.push(j);
  }
  return out;
};
Civ.workPlace = function (a) {
  if (a.job === 'builder') { const pr = projectFor(a); if (pr) return pr.siteId; }
  if (a.job === 'merchant' && a.shopId) return a.shopId;
  return null;
};

// ---------------- resource nodes ----------------
function nodeShown(n) {
  const amt = S().nodes[n.id] || 0;
  return n.blocks.length ? Math.round(clamp(amt / n.max, 0, 1) * n.blocks.length) : 0;
}
function syncNode(n, full) {
  if (n.crop) { if (full || n._shown === undefined) { syncCrops(n); n._shown = 1; } return; }
  if (!n.blocks.length || n.mode === 'none') return;
  if (n._shown === undefined) full = true;
  const want = nodeShown(n);
  const prev = full || n._shown === undefined ? (full ? -1 : want) : n._shown;
  if (!full && prev === want) return;
  // present blocks are the first `want` entries; removed ones take the depleted form
  const lo = full ? 0 : Math.min(prev, want), hi = full ? n.blocks.length : Math.max(prev, want);
  for (let k = lo; k < hi; k++) {
    const [x, y, z, b] = n.blocks[k];
    const target = k < want ? b : (n.mode === 'swap' ? n.swap : 0);
    if (World.get(x, y, z) !== target) {
      const cur = World.get(x, y, z);
      if (k < want && cur !== 0 && cur !== n.swap && cur !== b) continue; // something was built there
      World.set(x, y, z, target, { node: n.id });
    }
  }
  n._shown = want;
}
Civ.syncAllNodes = function () { for (const n of World.nodes) { n._shown = undefined; syncNode(n, true); } };
function chooseNode(a, types) {
  const s = S(); const vid = a.vid;
  let best = null, bs = -1e9;
  for (const n of World.nodes) {
    if (n.vid !== vid || !types.includes(n.type)) continue;
    const amt = s.nodes[n.id] || 0; if (amt < 1) continue;
    if (n.type === 'gold' && (a.skills.mining || 0) < 45 && rnd() < 0.85) continue;
    if ((n.type === 'iron' || n.type === 'coal' || n.type === 'gold') && V(vid).flags.mineClosed > 0) continue;
    const sp = n.spots[0];
    const d = Math.hypot(sp[0] - a.x, sp[1] - a.z);
    const sc = Sim.priceOf(stockKey(n.type), vid) * RATE[n.type] * 10 - d / 12 + rnd() * 2 + (n.type === 'wood' ? amt / 4 : 0);
    if (sc > bs) { bs = sc; best = n; }
  }
  return best;
}
Civ.gatherTick = function (a, mult) {
  const s = S(), p = a.plan;
  const types = AV.JOBS[a.job].gather;
  if (types.includes('food') && World.nodes.some(n => n.crop && n.vid === a.vid)) return farmTick(a, mult);
  const store = Sim.place('storehouse', a.vid);
  const carried = Object.values(a.carry).reduce((x, y) => x + y, 0);
  const g = p.g || (p.g = { stage: carried >= CARRY ? 'haul' : 'go' });
  if (g.stage === 'haul') {
    if (!store) { g.stage = 'go'; return; }
    const e = store.entry;
    if (near(a, e[0], e[1], 2)) { deposit(a, store); g.stage = 'go'; return; }
    if (!a.path && (!g.t || s.t - g.t > 4)) { g.t = s.t; walk(a, e[0], e[1]); }
    return;
  }
  if (g.stage !== 'haul' && carried > 0 && p.until && s.t > p.until - 25) { g.stage = 'haul'; a.acting = null; return; }
  if (g.stage === 'go') {
    if (carried >= CARRY) { g.stage = 'haul'; return; }
    const n = chooseNode(a, types);
    if (!n) { if (carried > 0) g.stage = 'haul'; else if (s.t % 120 === 0) Sim.setThought(a, 'Nothing left to ' + (a.job === 'woodcutter' ? 'cut' : 'take') + ' here.'); return; }
    g.node = n.id; g.spot = pick(n.spots); g.stage = 'walk'; g.t = s.t;
    if (walk(a, g.spot[0], g.spot[1])) g.stage = 'gather';
    return;
  }
  if (g.stage === 'walk') {
    if (!a.path) { if (near(a, g.spot[0], g.spot[1], 2.2)) g.stage = 'gather'; else if (s.t - g.t > 30) { a.x = g.spot[0] + 0.5; a.z = g.spot[1] + 0.5; g.stage = 'gather'; } else if (!g.retry || s.t - g.retry > 5) { g.retry = s.t; walk(a, g.spot[0], g.spot[1]); } }
    return;
  }
  if (g.stage === 'gather') {
    const n = World.nodes.find(x => x.id === g.node);
    if (!n) { g.stage = 'go'; return; }
    let amt = s.nodes[n.id] || 0;
    if (amt < 1) { g.stage = carried > 0 ? 'haul' : 'go'; return; }
    const b = n.blocks[0]; if (b) a.dir = Math.atan2(b[0] + 0.5 - a.x, b[2] + 0.5 - a.z);
    a.acting = n.type;
    const sk = SKILL_OF[n.type];
    const r = RATE[n.type] * mult * Civ.skillMult(a, sk) * (n.type === 'food' ? (V(a.vid).flags.drought > 0 ? 0.4 : V(a.vid).flags.harvest > 0 ? 1.4 : s.weather.kind === 'rain' ? 1.1 : 1) : 1);
    a.workAcc = (a.workAcc || 0) + r / 60;
    while (a.workAcc >= 1 && amt >= 1) { a.workAcc--; amt--; a.carry[n.type] = (a.carry[n.type] || 0) + 1; }
    s.nodes[n.id] = amt;
    syncNode(n);
    Civ.practice(a, sk);
    if ((n.type === 'iron' || n.type === 'coal' || n.type === 'stone' || n.type === 'gold') && rnd() < 0.000015) {
      a.injured = true; a.plan.until = s.t;
      Sim.emit({ type: 'NPC_INJURED', vid: a.vid, actor: a.id, about: a.id, imp: 0.7, x: a.x, z: a.z, public: true, text: 'A support beam slipped in the ' + Sim.placeName(n.place || 'mine') + '. ' + a.name + ' was hurt.', val: -0.4 });
    }
    if (Object.values(a.carry).reduce((x, y) => x + y, 0) >= CARRY) { g.stage = 'haul'; a.acting = null; }
  }
};
function deposit(a, store) {
  const s = S(); const vid = a.vid; const Vv = V(vid);
  let pay = 0, n = 0; const parts = [];
  for (const t in a.carry) {
    const q = a.carry[t]; if (!q) continue;
    const k = stockKey(t);
    const unit = Sim.priceOf(k, vid) * 0.8;
    Vv.econ.stock[k] = (Vv.econ.stock[k] || 0) + q;
    Vv.econ.prodDay[k] = (Vv.econ.prodDay[k] || 0) + q;
    pay += unit * q; n += q; parts.push(q + ' ' + t);
  }
  a.carry = {};
  if (!n) return;
  pay = Math.min(pay, Math.max(0, Vv.town.treasury) + 4);
  Vv.town.treasury -= pay;
  const biz = a.employer && s.businesses[a.employer];
  if (biz) { const cut = pay * 0.2; biz.cash += cut; biz.revenue += cut; pay -= cut; }
  a.money += pay; a.stats.earned += pay; a.stats.gathered += n;
  work('hauls'); for (const pt of parts) { const [q, t] = pt.split(' '); work(t === 'wood' ? 'wood' : t === 'food' || t === 'fish' ? 'food' : 'stone', +q); }
  if ((a.core || a.carry.gold) && (!a.lastHaulNote || s.t - a.lastHaulNote > DAY)) { a.lastHaulNote = s.t; Civ.mind(a, a.name + ' carried ' + parts.join(' and ') + ' to the ' + Vv.name + ' storehouse and earned ' + Math.round(pay) + ' coins', 'work'); }
  if (parts.some(p => p.includes('gold'))) Sim.emit({ type: 'GOLD_FOUND', vid, actor: a.id, imp: 0.55, x: a.x, z: a.z, text: a.name + ' brought gold up from the deep seam.' });
}

// ---------------- farming: till, plant, tend, harvest ----------------
// Every farmland cell has a state: '0' bare farmland, '1' sprout, '2' ripe wheat.
const CROP_YIELD = 1;
function work(k, n) { const c = S().counters; c.work = c.work || {}; c.work[k] = (c.work[k] || 0) + (n === undefined ? 1 : n); }
Civ.work = work;
function farmOf(n) {
  const s = S(); s.farms = s.farms || {};
  let f = s.farms[n.id];
  if (!f) f = s.farms[n.id] = { s: '', tend: 0 };
  if (f.s.length < n.blocks.length) f.s += '0'.repeat(n.blocks.length - f.s.length);
  return f;
}
function cropCount(n, ch) { const st = farmOf(n).s; let c = 0; for (let i = 0; i < st.length; i++) if (st[i] === ch) c++; return c; }
Civ.cropCount = cropCount; Civ.farmOf = farmOf;
const cropBlock = ch => ch === '2' ? B.CROP : ch === '1' ? B.SPROUT : 0;
function setCrop(n, i, ch) {
  const f = farmOf(n);
  f.s = f.s.slice(0, i) + ch + f.s.slice(i + 1);
  S().nodes[n.id] = cropCount(n, '2') * CROP_YIELD;
  const [x, y, z] = n.blocks[i]; const cur = World.get(x, y, z);
  if (cur === 0 || cur === B.CROP || cur === B.SPROUT) { const want = cropBlock(ch); if (cur !== want) World.set(x, y, z, want, { node: n.id }); }
}
function syncCrops(n) {
  const f = farmOf(n);
  for (let i = 0; i < n.blocks.length; i++) { const [x, y, z] = n.blocks[i]; const cur = World.get(x, y, z); const want = cropBlock(f.s[i]); if (cur !== want && (cur === 0 || cur === B.CROP || cur === B.SPROUT)) World.set(x, y, z, want, { node: n.id }); }
  S().nodes[n.id] = cropCount(n, '2') * CROP_YIELD;
}
// sprouts ripen over roughly half a day; tending, rain and good seasons speed it up
function growCrops(hours) {
  const s = S();
  for (const n of World.nodes) {
    if (!n.crop) continue;
    const f = farmOf(n); const Vv = V(n.vid);
    let p = 0.11 * hours;
    if (Vv && Vv.flags.drought > 0) p *= 0.3;
    if (Vv && Vv.flags.harvest > 0) p *= 1.5;
    if (s.weather && s.weather.kind === 'rain') p *= 1.25;
    if (s.t - (f.tend || -1e9) < 6 * 60) p *= 1.5;
    let changed = false; let st = '';
    for (let i = 0; i < f.s.length; i++) { const c = f.s[i]; if (c === '1' && rnd() < p) { st += '2'; changed = true; } else st += c; }
    if (changed) { f.s = st; syncCrops(n); }
  }
}
Civ.growCrops = growCrops;
function villageCrops(vid) { return World.nodes.filter(n => n.crop && n.vid === vid); }
function openField(vid) { return (S().fields || []).find(f => f.vid === vid && f.tilled < f.cells.length); }
// what should this farmer do next? keeps working along a row when it can
function pickFarmJob(a, last) {
  const nodes = villageCrops(a.vid);
  let best = null, bd = 1e9; const tally = { '0': 0, '1': 0, '2': 0 };
  const cand = { '0': null, '1': null, '2': null }, cd = { '0': 1e9, '1': 1e9, '2': 1e9 };
  for (const n of nodes) {
    const st = farmOf(n).s;
    for (let i = 0; i < st.length; i++) {
      const c = st[i]; tally[c]++;
      const [x, , z] = n.blocks[i]; const d = Math.hypot(x + 0.5 - a.x, z + 0.5 - a.z) + rnd() * 2;
      if (d < cd[c]) { cd[c] = d; cand[c] = [n, i]; }
    }
  }
  const mk = (mode, c) => ({ mode, node: cand[c][0].id, i: cand[c][1], spot: [cand[c][0].blocks[cand[c][1]][0], cand[c][0].blocks[cand[c][1]][2]] });
  // continue the same kind of work if there is more of it close by
  if (last === 'harvest' && cand['2'] && cd['2'] < 4) return mk('harvest', '2');
  if (last === 'plant' && cand['0'] && cd['0'] < 4) return mk('plant', '0');
  const fld = openField(a.vid);
  if (last === 'till' && fld) return tillJob(fld);
  if (fld && rnd() < 0.35) return tillJob(fld);
  if (cand['2'] && (!cand['0'] || rnd() < 0.6)) return mk('harvest', '2');
  if (cand['0']) return mk('plant', '0');
  if (fld) return tillJob(fld);
  if (cand['1'] && rnd() < 0.7) return mk('tend', '1');
  void best; void bd;
  return null;
}
function tillJob(f) { const c = f.cells[f.tilled]; return { mode: 'till', field: f.id, spot: [c[0], c[1]] }; }
function haulStep(a, g) {
  const s = S(); const store = Sim.place('storehouse', a.vid);
  if (!store) { g.stage = 'pick'; return; }
  const e = store.entry;
  if (near(a, e[0], e[1], 2)) { deposit(a, store); g.stage = 'pick'; return; }
  if (!a.path && (!g.t || s.t - g.t > 4)) { g.t = s.t; walk(a, e[0], e[1]); }
}
const FARM_SPEED = { harvest: 9, plant: 11, till: 6, tend: 10 }; // cells per working hour
function farmTick(a, mult) {
  const s = S(), p = a.plan;
  const carried = Object.values(a.carry).reduce((x, y) => x + y, 0);
  const g = p.g || (p.g = { stage: carried >= CARRY ? 'haul' : 'pick' });
  if (g.stage === 'go') g.stage = 'pick';
  if (g.stage !== 'haul' && carried > 0 && p.until && s.t > p.until - 25) { g.stage = 'haul'; a.acting = null; }
  if (g.stage === 'haul') { a.acting = null; return haulStep(a, g); }
  if (g.stage === 'pick') {
    if (carried >= CARRY) { g.stage = 'haul'; return; }
    const job = pickFarmJob(a, g.mode);
    if (!job) { a.acting = null; if (carried > 0) g.stage = 'haul'; else if (Math.floor(s.t) % 90 === 0) Sim.setThought(a, 'Everything is planted. Now the wheat needs time.'); return; }
    Object.assign(g, job); g.stage = 'walk'; g.t = s.t; a.acting = null;
    if (walk(a, job.spot[0], job.spot[1])) g.stage = 'work';
    return;
  }
  if (g.stage === 'walk') {
    if (!a.path) { if (near(a, g.spot[0], g.spot[1], 1.6)) g.stage = 'work'; else if (s.t - g.t > 30) { a.x = g.spot[0] + 0.5; a.z = g.spot[1] + 0.5; a.y = World.standAt(a.x, a.z); g.stage = 'work'; } else if (!g.retry || s.t - g.retry > 5) { g.retry = s.t; if (walk(a, g.spot[0], g.spot[1])) g.stage = 'work'; } }
    return;
  }
  if (g.stage === 'work') {
    a.acting = g.mode === 'harvest' ? 'food' : g.mode === 'plant' ? 'plant' : g.mode === 'till' ? 'till' : 'tend';
    a.dir = Math.atan2(g.spot[0] + 0.5 - a.x, g.spot[1] + 0.5 - a.z) || a.dir;
    const Vv = V(a.vid);
    let rate = FARM_SPEED[g.mode] * mult * Civ.skillMult(a, 'farming');
    if (g.mode === 'harvest' && Vv.flags.harvest > 0) rate *= 1.3;
    a.workAcc = (a.workAcc || 0) + rate / 60;
    if (a.workAcc < 1) return;
    a.workAcc -= 1;
    Civ.practice(a, 'farming');
    if (g.mode === 'till') {
      const f = (s.fields || []).find(x => x.id === g.field);
      if (f && f.tilled < f.cells.length) tillCell(f, a);
    } else {
      const n = World.nodes.find(x => x.id === g.node);
      if (n) {
        const c = farmOf(n).s[g.i];
        if (g.mode === 'harvest' && c === '2') { setCrop(n, g.i, '0'); work('harvested'); a.carry.food = (a.carry.food || 0) + CROP_YIELD; a.stats.gathered += CROP_YIELD; Vv.econ.prodDay.food = Vv.econ.prodDay.food || 0; }
        else if (g.mode === 'plant' && c === '0') { setCrop(n, g.i, '1'); work('planted'); }
        else if (g.mode === 'tend' && c === '1') { farmOf(n).tend = s.t; if (rnd() < 0.12) setCrop(n, g.i, '2'); }
      }
    }
    g.stage = 'pick';
  }
}
// a new field: pegged out on a free plot near the village, then tilled cell by cell
Civ.planField = function (vid, by) {
  const s = S(); s.fields = s.fields || [];
  const lot = World.findLot(vid, 8, 7); if (!lot) return null;
  const Vv = V(vid);
  const f = { id: 'fd' + (s.nextId++), vid, x: lot.x, z: lot.z, w: 8, d: 7, cells: [], tilled: 0, by: by ? by.id : null, started: s.t };
  for (let z = lot.z + 1; z < lot.z + 6; z++) for (let x = lot.x + 1; x < lot.x + 7; x++) f.cells.push([x, z, z === lot.z + 3 ? 1 : 0]);
  s.fields.push(f);
  registerField(f);
  s.extraPlaces['pl_' + f.id] = { id: 'pl_' + f.id, vid, kind: 'farm', name: Vv.name + ' New Field', spots: f.cells.filter(c => !c[2]).map(c => [c[0], c[1]]), entry: [lot.x, lot.z + 3], center: [lot.x + 4, lot.z + 3], x: lot.x, z: lot.z, w: 8, d: 7 };
  Sim.emit({ type: 'CONSTRUCTION_STARTED', vid, actor: by ? by.id : null, imp: 0.55, public: true, what: 'field', x: lot.x + 4, z: lot.z + 3, text: (by ? by.name + ' pegged out' : Vv.name + ' pegged out') + ' a new field: the village needs more wheat.' });
  if (by) Civ.mind(by, by.name + ' decided to dig a new field: ' + Vv.name + ' is short of food', 'decision');
  return f;
};
function registerField(f) {
  const n = World.registerNode({ id: f.id, vid: f.vid, type: 'food', place: 'pl_' + f.id, spots: [], blocks: [], max: 0, regen: 0, mode: 'crop', crop: true, field: f.id });
  for (let k = 0; k < f.tilled; k++) { const c = f.cells[k]; if (!c[2]) { n.blocks.push([c[0], World.STAND, c[1], B.CROP]); n.spots.push([c[0], c[1]]); } }
  n.max = n.blocks.length;
  return n;
}
Civ.rebuildFields = function () { for (const f of S().fields || []) registerField(f); };
function tillCell(f, a) {
  const c = f.cells[f.tilled]; const [x, z, water] = c;
  if (World.get(x, World.STAND, z) && World.get(x, World.STAND, z) !== B.CROP) World.set(x, World.STAND, z, 0, { by: a && a.id });
  World.set(x, World.GROUND, z, water ? B.WATER : B.FARMLAND, { by: a && a.id });
  f.tilled++; work('tilled');
  if (!water) { const n = World.nodes.find(nn => nn.id === f.id) || registerField(f); n.blocks.push([x, World.STAND, z, B.CROP]); n.spots.push([x, z]); n.max = n.blocks.length; farmOf(n); }
  if (f.tilled >= f.cells.length) {
    const Vv = V(f.vid);
    Civ.history((a ? a.name + ' finished tilling' : 'Farmers finished') + ' a new field in ' + Vv.name, f.vid, 'growth');
    Sim.emit({ type: 'BUILDING_CREATED', vid: f.vid, actor: a ? a.id : null, imp: 0.6, public: true, x: f.x + 4, z: f.z + 3, text: 'A new field is ready in ' + Vv.name + '. Thirty rows of farmland waiting for seed.' });
  }
}

// ---------------- what each resident is doing, in words ----------------
const GATHER_VERB = { wood: 'Chopping wood', stone: 'Mining stone', iron: 'Mining iron ore', coal: 'Mining coal', gold: 'Digging for gold', fish: 'Fishing', clay: 'Digging clay', wool: 'Shearing sheep', food: 'Harvesting wheat' };
const FARM_VERB = { harvest: 'Harvesting ripe wheat', plant: 'Planting wheat seeds', till: 'Tilling grass into farmland', tend: 'Tending young sprouts' };
const STAGE_WORD = { 'site clearing': 'clearing the site for', foundation: 'laying the foundation of', walls: 'building the walls of', roof: 'putting the roof on', tower: 'raising the tower of', interior: 'fitting out', complete: 'finishing' };
function carryText(a) { const e = Object.entries(a.carry || {}).filter(x => x[1] > 0); return e.length ? e.map(([k, q]) => q + ' ' + k).join(' and ') : ''; }
Civ.taskOf = function (a) {
  const s = S(); const p = a.plan || {}; const Vv = V(a.vid) || { name: '' };
  const pl = (id) => { const P = Sim.place(id, a.vid); const nmx = P && P.name ? P.name : Sim.placeName(id, a.vid); return P && P.vid && P.vid !== a.vid ? nmx + ' in ' + (V(P.vid) || {}).name : nmx; };
  if (a.jailUntil > s.t) return { t: 'Sitting in a cell', r: 'Arrested by the guard' };
  if (a.sleeping) return { t: 'Sleeping at home', r: 'Night. Energy ' + Math.round(a.needs.energy * 100) + '%' };
  if (a.convo) return { t: 'Talking with ' + Sim.nameOf(a.convoWith || (s.convos[a.convo] && (s.convos[a.convo].a === a.id ? s.convos[a.convo].b : s.convos[a.convo].a)) || 'a neighbour'), r: p.reason || 'Wants company' };
  if (p.type === 'sleep') return { t: 'Walking home for the night', r: 'Getting late; energy ' + Math.round(a.needs.energy * 100) + '%' };
  if (p.type === 'work') {
    const J = AV.JOBS[a.job] || {};
    const g = p.g;
    const shortage = Civ.shortages ? Civ.shortages(a.vid) : [];
    if (!g && !p.b && (J.gather || a.job === 'builder')) return { t: 'Walking to work' + (p.place ? ' at ' + pl(p.place) : ''), r: 'Shift starts' };
    if (J.gather && g) {
      const good = J.gather[0];
      const why = shortage.includes(good === 'fish' ? 'food' : good) ? Vv.name + ' is short of ' + (good === 'fish' ? 'food' : good) : 'The storehouse pays ' + Sim.priceOf(good === 'fish' ? 'food' : good, a.vid).toFixed(1) + ' coins per ' + (good === 'fish' ? 'food' : good);
      if (g.stage === 'haul') return { t: 'Carrying ' + (carryText(a) || 'a load') + ' to the storehouse', r: 'Bag is full; ' + why.charAt(0).toLowerCase() + why.slice(1) };
      if (g.mode && FARM_VERB[g.mode]) {
        const r = g.mode === 'till' ? 'Every plot is planted and ' + Vv.name + ' needs more wheat' : g.mode === 'plant' ? 'Bare farmland grows nothing' : g.mode === 'tend' ? 'Watered sprouts ripen faster' : why;
        const WALK = { harvest: 'Walking to the ripe wheat', plant: 'Walking to bare farmland to plant', till: 'Walking to the new field to till it', tend: 'Walking over to the young sprouts' };
        return { t: g.stage === 'walk' ? WALK[g.mode] : FARM_VERB[g.mode], r };
      }
      if (g.stage === 'pick' || (!g.mode && good === 'food')) return { t: 'Checking the fields', r: 'Looking for ripe wheat or bare farmland' };
      if (g.stage === 'walk' || g.stage === 'go') return { t: 'Walking to ' + (g.node ? pl((World.nodes.find(n => n.id === g.node) || {}).place || p.place) : pl(p.place)) + ' to work', r: why };
      return { t: GATHER_VERB[a.acting || good] || 'Working', r: why };
    }
    if (a.job === 'builder') {
      const pr = s.projects.find(x => x.id === a.project && !x.done);
      if (pr) {
        const b = p.b || {};
        const what = pr.label;
        if (b.stage === 'fetch') return { t: 'Fetching materials for ' + what + ' at the storehouse', r: pr.why || 'Commissioned by ' + Sim.nameOf(pr.owner) };
        if (b.stage === 'carry') return { t: 'Carrying ' + (carryText(a) || 'materials') + ' to ' + what, r: pr.why || 'Commissioned by ' + Sim.nameOf(pr.owner) };
        if (b.stage === 'wait') return { t: 'Waiting for ' + (pr.waiting || 'materials') + ' for ' + what, r: 'The storehouse has run out' };
        const st = stageOf(pr);
        return { t: 'Placing blocks: ' + (STAGE_WORD[st] || st) + ' ' + what + ' (' + pr.i + '/' + pr.blocks.length + ')', r: pr.why || 'Commissioned by ' + Sim.nameOf(pr.owner) };
      }
      return { t: 'Repairing worn houses', r: 'No new building ordered' };
    }
    const W0 = { baker: ['Baking bread', 'Bread sells for ' + Sim.breadPrice(a.vid).toFixed(1) + ' coins'], blacksmith: ['Forging tools', 'Miners and builders need tools'], shopkeeper: ['Minding the store', 'Customers come by in daylight'], merchant: ['Trading at the market', 'Buying low, selling high'], bartender: ['Pouring drinks at the tavern', 'Evenings are busy'], guard: ['Patrolling ' + Vv.name, 'Keeping the peace'], nightguard: ['Keeping the night watch', 'Thieves work in the dark'], journalist: ['Gathering news for the paper', 'The next issue goes out at 06:00'], doctor: ['Treating patients at the clinic', 'People fall ill'], mayor: ['Working at the town hall', 'Running ' + Vv.name], teacher: ['Teaching at the Academy', 'Skills raise the village'] };
    const w = W0[a.job]; if (w) return { t: w[0], r: w[1] };
  }
  if (p.type === 'travel') return { t: a.trip ? 'Carrying ' + a.trip.q + ' ' + a.trip.g + ' to ' + V(a.trip.to).name : 'Travelling to ' + (V(p.dest) || {}).name, r: p.reason || '' };
  const VERBS = { eat: 'Getting something to eat', rest: 'Resting at home', socialize: 'Looking for company', gossip: 'Passing on news', talk_to: 'Going to talk to ' + Sim.nameOf(p.target), campaign: 'Campaigning for votes', vote: 'Voting at the town hall', help: 'Helping ' + Sim.nameOf(p.target), investigate: 'Investigating a theft', steal: 'Sneaking around after dark', protest: 'Protesting at the town hall', visit: 'Taking a walk', commission: 'Ordering a building at the town hall', learn: 'Studying at the Academy', follow: 'Following ' + Sim.nameOf(p.target), mediate: 'Settling a feud', buy: 'Buying tools', clinic: 'Seeing the doctor' };
  const t = (VERBS[p.type] || 'Going about the day') + (p.place && !['talk_to', 'help', 'follow'].includes(p.type) ? ' (' + pl(p.place) + ')' : '');
  const r = p.type === 'eat' ? (a.needs.hunger < 0.4 ? 'Hungry: fullness ' + Math.round(a.needs.hunger * 100) + '%' : 'Mealtime') : p.type === 'rest' ? (a.needs.energy < 0.4 ? 'Tired: energy ' + Math.round(a.needs.energy * 100) + '%' : 'A quiet hour at home') : p.reason || '';
  return { t, r };
};

// ---------------- construction ----------------
const HOME = {
  hut: { w: 5, d: 5, wallH: 3, wall: B.PLANKS, roof: B.THATCH, corner: B.LOG, label: 'wooden hut', value: 70 },
  cottage: { w: 6, d: 6, wallH: 4, wall: B.PLASTER, roof: B.ROOF_TILE, corner: B.LOG, label: 'cottage', value: 130 },
  stone: { w: 7, d: 7, wallH: 4, wall: B.COBBLE, roof: B.SLATE, corner: B.STONE_BRICK, label: 'stone house', value: 210 },
  manor: { w: 9, d: 7, wallH: 5, wall: B.BRICK, roof: B.SLATE, corner: B.STONE_BRICK, trim: B.PLASTER, label: 'manor', value: 360 },
  civic: { w: 9, d: 8, wallH: 5, wall: B.STONE_BRICK, roof: B.SLATE, corner: B.STONE_BRICK, trim: B.PLASTER, label: 'civic residence', value: 330 },
  atelier: { w: 7, d: 7, wallH: 4, wall: B.PLANKS, roof: B.ROOF_TILE, corner: B.LOG, tower: true, label: 'builder\'s atelier', value: 230 },
};
const SHOP = { w: 6, d: 6, wallH: 3, wall: B.PLASTER, roof: 'awning', corner: B.LOG, label: 'shop', value: 150 };
const CIVIC = {
  library: { w: 9, d: 7, wallH: 5, wall: B.STONE_BRICK, roof: B.SLATE, corner: B.STONE_BRICK, trim: B.PLASTER, label: 'Library', value: 300, cost: 220 },
  watchtower: { w: 4, d: 4, wallH: 8, wall: B.COBBLE, roof: B.SLATE, corner: B.LOG, label: 'Watchtower', value: 160, cost: 140 },
  school: { w: 8, d: 7, wallH: 4, wall: B.PLASTER, roof: B.ROOF_TILE, corner: B.LOG, label: 'School', value: 220, cost: 170 },
  hall: { w: 10, d: 8, wallH: 5, wall: B.BRICK, roof: B.SLATE, corner: B.STONE_BRICK, trim: B.PLASTER, label: 'Market Hall', value: 360, cost: 260 },
};
Civ.HOME = HOME;
function blueprint(lot, spec, kind) {
  const { x, z } = lot; const w = spec.w, d = spec.d;
  const G = World.GROUND, ST = World.STAND;
  const L = [], stages = [];
  const mark = n => stages.push([n, L.length]);
  const toCenter = World.VBY[lot.vid] ? [World.VBY[lot.vid].cx - (x + w / 2), World.VBY[lot.vid].cz - (z + d / 2)] : [0, 1];
  const door = lot.door || (Math.abs(toCenter[0]) > Math.abs(toCenter[1]) ? (toCenter[0] > 0 ? 'E' : 'W') : (toCenter[1] > 0 ? 'S' : 'N'));
  let dx, dz;
  if (door === 'S') { dx = x + (w >> 1); dz = z + d - 1; } if (door === 'N') { dx = x + (w >> 1); dz = z; }
  if (door === 'E') { dx = x + w - 1; dz = z + (d >> 1); } if (door === 'W') { dx = x; dz = z + (d >> 1); }
  const out = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[door];
  mark('site clearing');
  for (let i = x - 1; i <= x + w; i++) for (let k = z - 1; k <= z + d; k++) for (let y = ST; y < ST + spec.wallH + 6; y++) if (World.get(i, y, k)) L.push([i, y, k, 0]);
  mark('foundation');
  for (let i = x; i < x + w; i++) for (let k = z; k < z + d; k++) L.push([i, G, k, kind === 'civic' || spec.wall === B.COBBLE ? B.COBBLE : B.PLANKS]);
  mark('walls');
  const top = ST + spec.wallH;
  for (let y = ST; y < top; y++) for (let i = x; i < x + w; i++) for (let k = z; k < z + d; k++) {
    const edge = i === x || i === x + w - 1 || k === z || k === z + d - 1; if (!edge) continue;
    const corner = (i === x || i === x + w - 1) && (k === z || k === z + d - 1);
    let b = corner ? spec.corner : spec.wall;
    const along = (k === z || k === z + d - 1) ? i - x : k - z, len = (k === z || k === z + d - 1) ? w : d;
    if (i === dx && k === dz && y < ST + 2) b = B.DOOR;
    else if (!corner && y === ST + 1 && along % 2 === 1 && along > 0 && along < len - 1) b = B.GLASS;
    else if (!corner && y === top - 1 && spec.trim) b = spec.trim;
    L.push([i, y, k, b]);
  }
  mark('roof');
  if (spec.roof === 'awning') {
    for (let i = x - 1; i <= x + w; i++) for (let k = z - 1; k <= z + d; k++) L.push([i, top, k, (i + k) % 2 ? B.CLOTH : B.ROOF_TILE]);
    for (let i = x + 1; i < x + w - 1; i++) for (let k = z + 1; k < z + d - 1; k++) L.push([i, top + 1, k, B.ROOF_TILE]);
  } else {
    const alongX = w >= d; const Ln = alongX ? w : d, Sh = alongX ? d : w;
    for (let lvl = 0; ; lvl++) {
      const a = lvl - 1, b = Sh - lvl; if (a > b) break;
      const y = top + lvl;
      for (let t = -1; t <= Ln; t++) {
        for (const sIdx of (a === b ? [a] : [a, b])) { const px = alongX ? x + t : x + sIdx, pz = alongX ? z + sIdx : z + t; L.push([px, y, pz, spec.roof]); }
        if (t === 0 || t === Ln - 1) for (let sIdx = a + 1; sIdx < b; sIdx++) { const px = alongX ? x + t : x + sIdx, pz = alongX ? z + sIdx : z + t; L.push([px, y, pz, spec.wall]); }
      }
      if (a === b || a + 1 === b) break;
    }
  }
  if (spec.tower) {
    mark('tower');
    const tx = x + w - 1, tz = z;
    for (let y = top; y < top + 4; y++) L.push([tx, y, tz, B.STONE_BRICK], [tx - 1, y, tz, B.STONE_BRICK], [tx, y, tz + 1, B.STONE_BRICK]);
    L.push([tx, top + 4, tz, B.TORCH]);
  }
  mark('interior');
  L.push([x + 1, ST, z + 1, kind === 'shop' ? B.SHELF : B.CLOTH], [x + w - 2, ST, z + d - 2, B.TORCH]);
  if (kind === 'shop') L.push([x + 2, ST, z + 1, B.PLANKS], [x + 3, ST, z + 1, B.PLANKS]);
  L.push([dx + out[0], G, dz + out[1], B.PATH]);
  mark('complete');
  return { list: L, stages, door: [dx, dz], entry: [dx + out[0], dz + out[1]] };
}
function needsOf(list) { const m = {}; for (const [, , , b] of list) { const k = MAT[b]; if (k) m[k] = (m[k] || 0) + 1; } return m; }
function costOf(list, vid) { const need = needsOf(list); let c = list.length * 0.32; for (const k in need) c += need[k] * Sim.priceOf(k, vid); return Math.round(c); }
Civ.estimate = function (vid, tier) { const spec = HOME[tier]; const fake = { x: 0, z: 0, vid }; const n = spec.w * spec.d; const walls = 2 * (spec.w + spec.d) * spec.wallH; let c = (n + walls + n * 1.4) * 0.32; c += walls * Sim.priceOf(MAT[spec.wall], vid) + n * Sim.priceOf('wood', vid) + n * 1.4 * Sim.priceOf(MAT[spec.roof] || 'wood', vid); void fake; return Math.round(c); };

Civ.startProject = function (owner, kind, opts) {
  const s = S(); const vid = owner ? owner.vid : opts.vid;
  const spec = kind === 'home' ? HOME[opts.tier] : kind === 'shop' ? SHOP : kind === 'civic' ? CIVIC[opts.civic] : null;
  if (!spec) return null;
  const lot = World.findLot(vid, spec.w + 0, spec.d + 0);
  if (!lot) { if (owner) Sim.setThought(owner, 'There is no land left to build on in ' + V(vid).name + '.'); return null; }
  lot.vid = vid;
  const bp = blueprint(lot, spec, kind === 'civic' ? 'civic' : kind);
  const cost = costOf(bp.list, vid);
  const id = 'p' + (s.nextId++);
  const label = kind === 'home' ? (owner.name + '\'s ' + spec.label) : kind === 'shop' ? opts.name : spec.label + ' of ' + V(vid).name;
  const siteSpots = [];
  for (let x = lot.x - 1; x <= lot.x + spec.w; x++) for (const z of [lot.z - 1, lot.z + spec.d]) siteSpots.push([x, z]);
  for (let z = lot.z; z < lot.z + spec.d; z++) for (const x of [lot.x - 1, lot.x + spec.w]) siteSpots.push([x, z]);
  const siteId = 'site_' + id;
  s.extraPlaces[siteId] = { id: siteId, vid, name: label + ' (building site)', kind: 'site', spots: siteSpots.filter(([x, z]) => World.standY[x + z * World.W] >= 0), entry: bp.entry, center: [lot.x + (spec.w >> 1), lot.z + (spec.d >> 1)] };
  if (!s.extraPlaces[siteId].spots.length) s.extraPlaces[siteId].spots = [bp.entry];
  const pr = { id, vid, kind, owner: owner ? owner.id : null, label, tier: opts.tier || null, civic: opts.civic || null, biz: opts.biz || null, lot: { x: lot.x, z: lot.z, w: spec.w, d: spec.d }, blocks: bp.list, stages: bp.stages, entry: bp.entry, i: 0,
    site: {}, escrow: opts.escrow !== undefined ? opts.escrow : cost, cost, siteId, started: s.t, done: false, waiting: null, crew: [], value: spec.value,
    why: opts.why || (kind === 'home' ? owner.name + ' saved up ' + cost + ' coins for a ' + spec.label : kind === 'shop' ? (owner ? owner.name : 'A resident') + ' is opening ' + opts.name : kind === 'civic' ? V(vid).name + ' grew and voted for a ' + spec.label : 'Repairs') };
  s.projects.push(pr);
  Sim.emit({ type: 'CONSTRUCTION_STARTED', vid, actor: owner ? owner.id : null, imp: 0.55, public: true, what: kind === 'home' ? spec.label : kind === 'civic' ? spec.label : 'shop', x: lot.x, z: lot.z, text: (owner ? owner.name + ' hired the builders of ' + V(vid).name + ' to build ' : V(vid).name + ' began building ') + (kind === 'home' ? 'a ' + spec.label : kind === 'civic' ? 'a ' + spec.label : opts.name) + ' (' + cost + ' coins).' });
  if (owner) Civ.mind(owner, owner.name + ' started building ' + (kind === 'home' ? 'a ' + spec.label : opts.name || spec.label), 'build');
  return pr;
};
function projectFor(a) {
  const s = S();
  let pr = a.project && s.projects.find(p => p.id === a.project && !p.done);
  if (pr) return pr;
  const open = s.projects.filter(p => !p.done && p.vid === a.vid);
  if (!open.length) { a.project = null; return null; }
  const biz = a.employer && s.businesses[a.employer];
  open.sort((x, y) => (x.crew.length - y.crew.length) + (biz && biz.kind === 'construction' && biz.owner === y.owner ? 1 : 0) - (biz && biz.kind === 'construction' && biz.owner === x.owner ? 1 : 0));
  pr = open[0]; a.project = pr.id; if (!pr.crew.includes(a.id)) pr.crew.push(a.id);
  return pr;
}
Civ.projectFor = projectFor;
function stageOf(pr) { let st = pr.stages[0][0]; for (const [n, i] of pr.stages) if (pr.i >= i) st = n; return pr.done ? 'complete' : st; }
Civ.stageOf = stageOf;
Civ.buildTick = function (a) {
  const s = S();
  const pr = projectFor(a);
  if (!pr) { if (s.t % 120 === 0) { Civ.repairTick(a); } return; }
  const p = a.plan; const b = p.b || (p.b = { stage: 'next' });
  if (pr.i >= pr.blocks.length) { finishProject(pr); return; }
  const next = pr.blocks[pr.i];
  const m = MAT[next[3]];
  const store = Sim.place('storehouse', a.vid);
  const Vv = V(a.vid);
  if (b.stage === 'fetch') {
    if (!store) { b.stage = 'next'; return; }
    if (near(a, store.entry[0], store.entry[1], 2)) {
      const need = {}; for (let k = pr.i; k < Math.min(pr.blocks.length, pr.i + 40); k++) { const mm = MAT[pr.blocks[k][3]]; if (mm) need[mm] = (need[mm] || 0) + 1; }
      let took = 0; const parts = [];
      for (const mm in need) {
        const want = Math.max(0, need[mm] - (pr.site[mm] || 0));
        const q = Math.min(want, CARRY * 2 - took, Math.floor(Vv.econ.stock[mm] || 0));
        if (q <= 0) continue;
        const cost = q * Sim.priceOf(mm, a.vid);
        if (pr.escrow < cost * 0.5 && pr.owner) { const o = s.byId[pr.owner]; if (o && o.money > cost) { o.money -= cost; pr.escrow += cost; } }
        const paid = Math.min(cost, Math.max(0, pr.escrow));
        if (paid < cost * 0.5 && pr.owner) {
          // the owner is short: the village lends the difference and the work goes on
          const o = s.byId[pr.owner]; const gap = cost - paid;
          if (o && !o.left && (o.debt || 0) < pr.cost * 2.5) { o.debt = Math.round((o.debt || 0) + gap); pr.escrow += gap; } else if (Vv.town.treasury > gap + 20) { Vv.town.treasury -= gap; pr.escrow += gap; } else { pr.waiting = 'funds'; continue; }
        }
        const pay2 = Math.min(cost, Math.max(0, pr.escrow));
        pr.escrow -= pay2; Vv.town.treasury += pay2;
        Vv.econ.stock[mm] -= q; a.carry[mm] = (a.carry[mm] || 0) + q; took += q; parts.push(q + ' ' + mm);
      }
      if (!took && m && (Vv.econ.stock[m] || 0) < 1) {
        pr.waitSince = pr.waitSince || s.t;
        // nobody nearby makes it, or the wait is long: change the plan
        if ((!Civ.gatherJobsFor(a.vid).includes(JOB_FOR[m]) || s.t - pr.waitSince > 45) && substitute(pr, m, a)) { b.stage = 'next'; return; }
      }
      if (!took) { pr.waiting = m && (Vv.econ.stock[m] || 0) < 1 ? m : pr.waiting || 'materials'; Vv.econ.want = Vv.econ.want || {}; if (m) Vv.econ.want[m] = (Vv.econ.want[m] || 0) + 1; if (s.t % 60 === 0) Sim.setThought(a, pr.waiting === 'funds' ? 'The money for this job ran out.' : 'No ' + pr.waiting + ' in the storehouse. We wait.'); b.stage = 'wait'; b.t = s.t; return; }
      pr.waiting = null; pr.waitSince = null;
      b.stage = 'carry';
      const e = Sim.place(pr.siteId).spots[0]; b.spot = e;
      walk(a, e[0], e[1]);
      return;
    }
    if (!a.path && (!b.t || s.t - b.t > 4)) { b.t = s.t; walk(a, store.entry[0], store.entry[1]); }
    return;
  }
  if (b.stage === 'wait') { if (s.t - b.t > 30) b.stage = 'next'; return; }
  if (b.stage === 'carry') {
    if (!a.path) { for (const k in a.carry) { pr.site[k] = (pr.site[k] || 0) + a.carry[k]; } a.carry = {}; b.stage = 'next'; }
    return;
  }
  // next: if material is missing on site go fetch, else build
  if (m && (pr.site[m] || 0) < 1) { b.stage = 'fetch'; b.t = 0; if (store) walk(a, store.entry[0], store.entry[1]); return; }
  const site = Sim.place(pr.siteId);
  if (!b.atSite) { const sp = pick(site.spots); b.atSite = true; walk(a, sp[0], sp[1]); return; }
  if (a.path) return;
  a.acting = 'build';
  const cx = pr.lot.x + (pr.lot.w >> 1), cz = pr.lot.z + (pr.lot.d >> 1); a.dir = Math.atan2(cx - a.x, cz - a.z);
  a.buildAcc = (a.buildAcc || 0) + 0.7 * (0.6 + a.needs.energy * 0.4) * (a.toolHp > 0 ? 1 : 0.6) * Civ.skillMult(a, 'building') * (a.design ? 1 : 1);
  let placed = 0;
  while (a.buildAcc >= 1 && pr.i < pr.blocks.length && placed < 6) {
    const [x, y, z, blk] = pr.blocks[pr.i];
    const mm = MAT[blk];
    if (mm && (pr.site[mm] || 0) < 1) break;
    a.buildAcc -= blk ? 1 : 0.35;
    if (mm) pr.site[mm]--;
    World.set(x, y, z, blk, { by: a.id, project: pr.id });
    pr.i++; placed++; work('blocks');
    const pay = Math.min(Math.max(0, pr.escrow), 0.32); pr.escrow -= pay;
    const biz = a.employer && s.businesses[a.employer];
    if (biz) { biz.cash += pay * 0.2; biz.revenue += pay * 0.2; a.money += pay * 0.8; } else a.money += pay;
    a.stats.earned += pay;
  }
  Civ.practice(a, 'building', placed);
  if (s.t % 25 === 0) b.atSite = false;
  if (pr.i >= pr.blocks.length) finishProject(pr);
};
function finishProject(pr) {
  const s = S(); if (pr.done) return;
  pr.done = true; pr.finished = s.t;
  const o = s.byId[pr.owner];
  const Vv = V(pr.vid);
  const spots = [];
  for (let i = pr.lot.x + 1; i < pr.lot.x + pr.lot.w - 1; i++) for (let k = pr.lot.z + 1; k < pr.lot.z + pr.lot.d - 1; k++) if (World.standY[i + k * World.W] === World.STAND) spots.push([i, k]);
  const pid = 'pl_' + pr.id;
  const kindName = pr.kind === 'home' ? 'house' : pr.kind === 'shop' ? 'shop' : pr.civic;
  s.extraPlaces[pid] = { id: pid, vid: pr.vid, name: pr.label, kind: kindName, spots: spots.length ? spots : [pr.entry], entry: pr.entry, center: [pr.lot.x + (pr.lot.w >> 1), pr.lot.z + (pr.lot.d >> 1)], x: pr.lot.x, z: pr.lot.z, w: pr.lot.w, d: pr.lot.d, built: s.t };
  delete s.extraPlaces[pr.siteId];
  for (const id of pr.crew) { const b = s.byId[id]; if (b && b.project === pr.id) { b.project = null; if (b.plan && b.plan.type === 'work') b.plan.until = s.t; } }
  if (pr.escrow > 0 && o) { o.money += pr.escrow * 0.5; pr.escrow = 0; }
  if (pr.kind === 'home') {
    const prop = { id: 'pr_' + pid, vid: pr.vid, placeId: pid, kind: 'house', tier: pr.tier, owner: pr.owner, value: pr.value, cost: pr.cost, condition: 1, built: dayOf(s.t), forSale: false, price: Math.round(pr.value * 1.1), residents: [pr.owner] };
    s.properties[prop.id] = prop;
    if (o) {
      o.owns.push(prop.id);
      moveHome(o, pid, prop);
      o.stats.achieved++;
      Civ.mind(o, o.name + ' moved into a new ' + HOME[pr.tier].label, 'build');
      if (pr.tier === 'manor' || pr.tier === 'atelier' || pr.tier === 'civic') Civ.history(o.name + ' finished a ' + HOME[pr.tier].label + ' in ' + Vv.name, pr.vid, 'build');
      else if (!s.history.some(h => h.kind === 'build' && h.vid === pr.vid)) Civ.history('The first new home in ' + Vv.name + ' was finished: ' + o.name + '\'s ' + HOME[pr.tier].label, pr.vid, 'build');
    }
    Sim.emit({ type: 'BUILDING_CREATED', vid: pr.vid, actor: pr.owner, imp: 0.75, public: true, val: 0.2, x: pr.lot.x + 3, z: pr.lot.z + 3, headline: (o ? o.name.toUpperCase() + ' MOVES INTO A NEW ' : 'NEW ') + HOME[pr.tier].label.toUpperCase(), text: (o ? o.name : 'Someone') + ' finished building a ' + HOME[pr.tier].label + ' in ' + Vv.name + '.' });
  } else if (pr.kind === 'shop') {
    const biz = s.businesses[pr.biz];
    const sells = biz ? BIZ[biz.kind].sells : ['bread', 'tools'];
    const tea = sells.includes('meal');
    s.shops[pid] = { id: pid, vid: pr.vid, kind: biz ? biz.kind : 'shop', name: pr.label, owner: pr.owner, open: tea ? [9, 21] : [8, 18], stock: tea ? { bread: 8 } : { bread: sells.includes('bread') ? 6 : 0, tools: sells.includes('tools') ? 2 : 0 }, sells, biz: pr.biz };
    if (biz) biz.shopId = pid;
    s.properties['pr_' + pid] = { id: 'pr_' + pid, vid: pr.vid, placeId: pid, kind: 'shop', tier: 'shop', owner: pr.owner, value: pr.value, cost: pr.cost, condition: 1, built: dayOf(s.t), forSale: false, price: pr.value, residents: [] };
    if (o && !o.left) { o.formerJob = o.job; o.job = 'merchant'; o.shopId = pid; o.work = pid; o.owns.push('pr_' + pid); o.goals = o.goals.filter(g => g.type !== 'OPEN_A_SHOP'); o.goals.unshift({ type: 'BECOME_RICH', primary: true }); Sim.setThought(o, 'My own place. Finally.'); o.stats.achieved++; }
    Sim.emit({ type: 'BUILDING_CREATED', vid: pr.vid, actor: pr.owner, imp: 0.85, public: true, val: 0.2, x: pr.lot.x + 3, z: pr.lot.z + 3, headline: (o ? o.name.toUpperCase() : 'SOMEONE') + ' OPENS ' + pr.label.toUpperCase(), text: (o ? o.name : 'Someone') + ' opened ' + pr.label + ' in ' + Vv.name + '.' });
    Civ.history((o ? o.name : 'Someone') + ' opened ' + pr.label + ' in ' + Vv.name, pr.vid, 'business');
  } else if (pr.kind === 'civic') {
    Vv.civic = Vv.civic || []; Vv.civic.push(pr.civic);
    s.properties['pr_' + pid] = { id: 'pr_' + pid, vid: pr.vid, placeId: pid, kind: 'civic', tier: pr.civic, owner: null, value: pr.value, cost: pr.cost, condition: 1, built: dayOf(s.t), forSale: false, price: 0, residents: [] };
    Sim.emit({ type: 'BUILDING_CREATED', vid: pr.vid, imp: 0.85, public: true, val: 0.3, x: pr.lot.x + 3, z: pr.lot.z + 3, headline: Vv.name.toUpperCase() + ' OPENS A ' + CIVIC[pr.civic].label.toUpperCase(), text: Vv.name + ' finished its new ' + CIVIC[pr.civic].label + '.' });
    Civ.history(Vv.name + ' built a ' + CIVIC[pr.civic].label, pr.vid, 'build');
  } else if (pr.kind === 'repair') {
    const prop = s.properties[pr.prop]; if (prop) prop.condition = 1;
  }
}
Civ.finishProject = finishProject;
function moveHome(a, placeId, prop) {
  const s = S();
  const old = Object.values(s.properties).find(p => p.placeId === a.home);
  if (old) { old.residents = (old.residents || []).filter(x => x !== a.id); if (old.owner === a.id && !old.residents.length) { old.forSale = true; old.price = Math.round(old.value * old.condition * 1.05); } }
  a.home = placeId;
  if (prop && !prop.residents.includes(a.id)) prop.residents.push(a.id);
  if (a.couple) { const c = s.byId[a.couple]; if (c && c.vid === a.vid && !c.owns.length) { c.home = placeId; if (prop) prop.residents.push(c.id); } }
}
Civ.moveHome = moveHome;
Civ.repairTick = function (a) {
  const s = S();
  const prop = Object.values(s.properties).filter(p => p.vid === a.vid && p.condition < 0.55 && !p.repairing && p.owner).sort((x, y) => x.condition - y.condition)[0];
  if (!prop) return;
  const o = s.byId[prop.owner]; if (!o) return;
  const cost = Math.round(18 + (1 - prop.condition) * 40);
  if (o.money < cost) return;
  o.money -= cost; a.money += cost * 0.8; V(a.vid).town.treasury += cost * 0.2;
  prop.condition = Math.min(1, prop.condition + 0.45);
  const pl = Sim.place(prop.placeId);
  if (pl) walk(a, pl.entry[0], pl.entry[1]);
  Civ.practice(a, 'building', 8);
  // put back any blocks a fire took
  if (prop.damage && prop.damage.length) { for (const [x, y, z, b] of prop.damage) World.set(x, y, z, b, { repair: true }); prop.damage = []; }
  Civ.mind(a, a.name + ' repaired ' + nameOf(prop.owner) + '\'s ' + (prop.kind === 'house' ? 'house' : 'building') + ' for ' + cost + ' coins', 'work');
};

// ---------------- goals \u2192 new candidates ----------------
const BIZ = {
  bakery: { label: 'Bakery', sells: ['bread'], premises: true, job: 'baker', cost: 90 },
  teahouse: { label: 'Tea House', sells: ['meal'], premises: true, job: 'bartender', cost: 90 },
  workshop: { label: 'Workshop', sells: ['tools'], premises: true, job: 'blacksmith', cost: 100 },
  shop: { label: 'Shop', sells: ['bread', 'tools'], premises: true, job: 'shopkeeper', cost: 95 },
  mining: { label: 'Mining Company', premises: false, job: 'miner', cost: 70 },
  construction: { label: 'Construction Company', premises: false, job: 'builder', cost: 60 },
  trading: { label: 'Trading House', premises: false, job: 'merchant', cost: 80 },
  farm: { label: 'Farm Co-op', premises: false, job: 'farmer', cost: 50 },
};
Civ.BIZ = BIZ;
function pickBusiness(a, g) {
  const s = S(); const vid = a.vid;
  if (g && g.business) return g.business;
  const shopName = g && g.shop ? g.shop.toLowerCase() : '';
  if (/tea|tavern|inn/.test(shopName)) return 'teahouse';
  if (/lamp|candle|tool|work/.test(shopName)) return 'workshop';
  if (/seed|shop|store/.test(shopName)) return 'shop';
  const ratio = Sim.breadRatio(vid);
  const opts = [];
  if (ratio > 1.15) opts.push(['bakery', ratio * 2]);
  if (World.nodes.some(n => n.vid === vid && (n.type === 'iron' || n.type === 'stone'))) opts.push(['mining', 1.4 + a.p.greed]);
  if (s.projects.filter(p => !p.done && p.vid === vid).length >= 2) opts.push(['construction', 2]);
  if (vid === 'rivergate' || a.job === 'merchant') opts.push(['trading', 1.3 + a.p.curiosity]);
  if (World.nodes.some(n => n.vid === vid && n.type === 'food')) opts.push(['farm', 0.8 + a.v.community]);
  opts.push(['shop', 1], ['teahouse', 0.8 + a.p.sociability]);
  // a market that already has one of these is less attractive
  for (const o of opts) { const have = Object.values(s.businesses).filter(b => b.vid === vid && b.kind === o[0]).length; o[1] /= 1 + have * 1.6; }
  opts.sort((x, y) => y[1] - x[1]);
  return opts[0][0];
}
function homeTier(a) {
  if (a.job === 'mayor') return 'civic';
  if (a.job === 'builder' && a.p.openness > 0.6) return 'atelier';
  const w = a.money;
  for (const t of ['manor', 'stone', 'cottage', 'hut']) { const c = Civ.estimate(a.vid, t); if (w > c * 1.25 && (t !== 'manor' || a.p.ambition + a.v.status > 1.3)) return t; }
  return null;
}
function ownsHome(a) { const s = S(); return a.owns.map(id => s.properties[id]).filter(p => p && p.kind === 'house'); }
Civ.goalCandidates = function (a, h, add, work, night) {
  const s = S();
  if (night || a.jailUntil > s.t) return;
  const busyProject = s.projects.some(p => !p.done && p.owner === a.id);
  for (const g of a.goals) {
    if (g.type === 'OPEN_A_SHOP' && !a.business && !busyProject && h >= 9 && h < 16 && dayOf(s.t) >= 2) {
      const kind = pickBusiness(a, g); const B0 = BIZ[kind];
      const need = B0.cost + (B0.premises ? Civ.estimate(a.vid, 'cottage') * 0.7 : 0);
      if (a.money >= need && rnd() < 0.25) add('commission', 2.4 + a.p.ambition, { place: Sim.vp('townhall'), what: 'business', biz: kind, reason: 'saved ' + Math.round(a.money) + ' coins to open a ' + B0.label.toLowerCase(), thought: 'Time to open my ' + B0.label.toLowerCase() + '.' });
    }
    if ((g.type === 'BUILD_HOME' || g.type === 'OWN_LARGEST_HOUSE') && !busyProject && h >= 9 && h < 16) {
      const tier = homeTier(a); const mine = ownsHome(a);
      const rank = t => ['hut', 'cottage', 'stone', 'atelier', 'civic', 'manor'].indexOf(t);
      if (tier && (!mine.length || mine.every(p => rank(p.tier) < rank(tier))) && rnd() < 0.2) add('commission', 2.1 + a.p.ambition * 0.8, { place: Sim.vp('townhall'), what: 'home', tier, reason: 'can afford a ' + HOME[tier].label + ' now', thought: 'A ' + HOME[tier].label + ' of my own.' });
    }
    if (g.type === 'LEARN' && h >= 9 && h < 17 && !work && Sim.vp('academy', 'highvale') && rnd() < 0.3) {
      const acad = Sim.vp('academy', a.vid);
      if (acad) add('learn', 0.9 + a.p.curiosity, { place: acad, reason: 'wants to study at the Academy', until: s.t + 120 });
    }
  }
  // wealthy residents without a proper home want one even without the goal
  if (!busyProject && h >= 9 && h < 16 && a.money > 260 && !ownsHome(a).some(p => p.tier !== 'hut') && rnd() < 0.05) {
    const tier = homeTier(a); if (tier) add('commission', 1.6 + a.v.status, { place: Sim.vp('townhall'), what: 'home', tier, reason: 'rich enough for a ' + HOME[tier].label, thought: 'Time I lived like it.' });
  }
  // curious residents visit other villages and carry news back and forth
  if (!work && h >= 9 && h < 15 && a.p.curiosity + a.p.sociability > 1.15 && !a.trip && rnd() < 0.012 && a.money > 10) {
    const others = World.VILLAGES.filter(v => v.id !== a.vid);
    const v = others.sort((x, y) => (Civ.villageRel(a.vid, y.id) + rnd() * 30) - (Civ.villageRel(a.vid, x.id) + rnd() * 30))[0];
    add('travel', 1.0 + a.p.curiosity, { place: Sim.vp('tavern', v.id) || Sim.vp('plaza', v.id), dest: v.id, purpose: 'visit', reason: 'curious about ' + v.name, until: s.t + 600, thought: 'I wonder what they are saying in ' + v.name + '.' });
  }
};
Civ.commission = function (a, p) {
  const s = S();
  if (p.what === 'business') return openBusiness(a, p.biz);
  if (p.what === 'home') {
    const est = Civ.estimate(a.vid, p.tier);
    if (a.money < est) { Sim.setThought(a, 'Not enough for that yet.'); a.lastFail = s.t; return; }
    a.money -= est;
    const pr = Civ.startProject(a, 'home', { tier: p.tier, escrow: est });
    if (!pr) { a.money += est; a.lastFail = s.t; }
  }
};
function openBusiness(a, kind) {
  const s = S(); const B0 = BIZ[kind]; if (!B0 || a.business) return;
  if (a.money < B0.cost) { a.lastFail = s.t; return; }
  const inVillage = Object.values(s.businesses).filter(b => b.vid === a.vid);
  if (inVillage.length >= Math.ceil(people(a.vid).length / 5) || inVillage.filter(b => b.kind === kind).length >= 2) { a.lastFail = s.t; Sim.setThought(a, 'There are already enough ' + B0.label.toLowerCase() + 's here.'); return; }
  a.money -= B0.cost;
  const id = 'b' + (s.nextId++);
  const name = (a.name + '\'s ' + B0.label);
  const biz = { id, vid: a.vid, owner: a.id, kind, name, employees: [], cash: B0.cost * 0.5, revenue: 0, founded: dayOf(s.t), shopId: null };
  s.businesses[id] = biz; a.business = id;
  V(a.vid).town.treasury += B0.cost * 0.5;
  if (B0.premises) {
    const est = Civ.estimate(a.vid, 'cottage') * 0.7;
    const pay = Math.min(a.money, est); a.money -= pay;
    const pr = Civ.startProject(a, 'shop', { name, biz: id, escrow: pay });
    if (!pr) { a.money += pay; }
  }
  a.goals = a.goals.filter(g => g.type !== 'OPEN_A_SHOP');
  a.goals.unshift({ type: 'GROW_BUSINESS', primary: true });
  a.stats.achieved++;
  Sim.emit({ type: 'BUSINESS_OPENED', vid: a.vid, actor: a.id, imp: 0.8, public: true, val: 0.2, x: a.x, z: a.z, text: a.name + ' founded ' + name + ' in ' + V(a.vid).name + '.' });
  Civ.mind(a, a.name + ' founded ' + name, 'business');
  if (!s.history.some(h => h.kind === 'business')) Civ.history('The first business of the new age: ' + name + ' in ' + V(a.vid).name, a.vid, 'business');
  else Civ.history(a.name + ' founded ' + name, a.vid, 'business', true);
}
Civ.openBusiness = openBusiness;

// ---------------- teaching ----------------
Civ.teachTick = function (a) {
  const s = S();
  if (s.t % 30) return;
  const acad = Sim.place('academy', a.vid); if (!acad) return;
  const learners = s.agents.filter(o => o !== a && !o.left && o.plan && o.plan.type === 'learn' && o.plan.arrived && Math.hypot(o.x - acad.center[0], o.z - acad.center[1]) < 12);
  for (const o of learners) {
    const k = JOB_SKILL[o.job] || 'trade';
    Civ.practice(o, k, 30 * Civ.skillMult(a, 'teaching'));
    o.stats.learned = (o.stats.learned || 0) + 1;
  }
  if (learners.length) { Civ.practice(a, 'teaching', 6); if (rnd() < 0.2) Sim.sayBubble(a, pick(['Again, from the top.', 'Show me your working.', 'Good. Now explain why.'])); }
};

// ---------------- travel: visits, trade caravans, migration ----------------
Civ.arrive = function (a, p) {
  const s = S();
  if (p.type === 'travel') {
    p.until = Math.max(p.until || 0, s.t + 120 + rnd() * 180);
    if (p.purpose === 'trade') sellCaravan(a, p);
    if (p.purpose === 'migrate') settle(a, p.dest);
    if (p.purpose === 'visit') { Sim.remember(a, { text: 'I visited ' + V(p.dest).name + '.', kind: 'visit', imp: 0.35, val: 0.2 }); bumpRel(a.vid, p.dest, 0.5); }
  }
  if (p.type === 'learn') p.until = Math.max(p.until || 0, s.t + 90);
};
Civ.actTick = function (a) {
  const s = S(), p = a.plan;
  if (p.type === 'travel' && p.arrived && p.purpose !== 'migrate') {
    // while visiting: chat with locals, which carries news between villages
    if (!a.convo && rnd() < 0.08) {
      const locals = s.agents.filter(o => o !== a && !o.left && !o.convo && !o.sleeping && o.vid === p.dest && Math.hypot(o.x - a.x, o.z - a.z) < 8);
      if (locals.length) Sim.startConvo(a, pick(locals), 'gossip');
    }
  }
};
Civ.tradeTick = function (a) {
  const s = S();
  const h = hourOf(s.t);
  if (h < 8 || h > 10 || a.trip || (a.lastTrip && s.t - a.lastTrip < DAY * 1.5)) return;
  if (!(a.business && s.businesses[a.business] && s.businesses[a.business].kind === 'trading') && a.p.riskTolerance + a.p.greed < 0.9 && a.vid !== 'rivergate') return;
  // find the most profitable good to carry to another village
  const home = V(a.vid); let best = null, bs = 6;
  for (const v of World.VILLAGES) {
    if (v.id === a.vid) continue;
    for (const g of Sim.GOODS) {
      const have = home.econ.stock[g] || 0; if (have < 15) continue;
      const buy = Sim.priceOf(g, a.vid), sell = Sim.priceOf(g, v.id);
      const q = Math.min(20, Math.floor(have - 10), Math.floor(a.money / buy));
      const profit = (sell * 0.9 - buy) * q - 4;
      if (profit > bs) { bs = profit; best = { to: v.id, g, q, buy }; }
    }
  }
  if (!best) return;
  home.econ.stock[best.g] -= best.q; a.money -= best.q * best.buy; home.town.treasury += best.q * best.buy;
  a.carry = { [best.g]: best.q };
  a.trip = { to: best.to, g: best.g, q: best.q, paid: best.q * best.buy, start: s.t };
  a.lastTrip = s.t;
  const dest = Sim.vp('storehouse', best.to);
  Sim.goPlan(a, { type: 'travel', place: dest, dest: best.to, purpose: 'trade', until: s.t + 900, reason: 'carrying ' + best.q + ' ' + best.g + ' to sell in ' + V(best.to).name, src: 'engine' });
  Civ.mind(a, a.name + ' set out for ' + V(best.to).name + ' with ' + best.q + ' ' + best.g + ' to sell', 'trade');
};
function sellCaravan(a, p) {
  const s = S(); const t = a.trip; if (!t) return;
  const D0 = V(t.to);
  const unit = Sim.priceOf(t.g, t.to) * 0.9;
  const got = Math.min(unit * t.q, Math.max(0, D0.town.treasury));
  D0.town.treasury -= got; D0.econ.stock[t.g] = (D0.econ.stock[t.g] || 0) + t.q;
  a.carry = {};
  let profit = got - t.paid;
  const biz = a.business && s.businesses[a.business];
  if (biz) { biz.revenue += Math.max(0, profit); }
  a.money += got; a.stats.earned += Math.max(0, profit);
  bumpRel(a.vid, t.to, 2);
  Civ.practice(a, 'trade', 40);
  Sim.emit({ type: 'TRADE', vid: a.vid, to: t.to, actor: a.id, imp: 0.5, x: a.x, z: a.z, text: a.name + ' of ' + V(a.vid).name + ' sold ' + t.q + ' ' + t.g + ' in ' + D0.name + ' for ' + Math.round(got) + ' coins (' + (profit >= 0 ? '+' : '') + Math.round(profit) + ').' });
  if (profit > 25) Civ.mind(a, a.name + ' made ' + Math.round(profit) + ' coins carrying ' + t.g + ' to ' + D0.name, 'trade');
  a.trip = null;
  // head home after a short stay
  p.until = s.t + 90;
  a.returnHome = true;
}
Civ.migrate = function (a, to, why) {
  const s = S(); if (!to || to === a.vid || a.migrating) return;
  a.migrating = to;
  Sim.goPlan(a, { type: 'travel', place: Sim.vp('plaza', to), dest: to, purpose: 'migrate', until: s.t + 900, reason: why, src: 'engine' });
  Civ.mind(a, a.name + ' decided to leave ' + V(a.vid).name + ' for ' + V(to).name + ': ' + why, 'decision');
};
function settle(a, to) {
  const s = S(); const from = a.vid;
  if (from === to) { a.migrating = null; return; }
  // property left behind
  for (const id of a.owns) { const pr = s.properties[id]; if (pr && pr.kind === 'house') { pr.residents = (pr.residents || []).filter(x => x !== a.id); pr.forSale = !pr.residents.length; pr.price = Math.round(pr.value * pr.condition); } }
  for (const id in s.shops) if (s.shops[id].owner === a.id) { const heir = s.agents.find(o => o.vid === from && !o.left && a.family.includes(o.id)); if (heir) { s.shops[id].owner = heir.id; Civ.history(heir.name + ' inherited ' + s.shops[id].name, from, 'business', true); } }
  a.vid = to; Sim.useVillage(to);
  a.migrating = null; a.lowDays = 0;
  const vacant = Object.values(s.properties).filter(p => p.vid === to && p.kind === 'house' && (p.forSale || (p.residents || []).length < 2)).sort((x, y) => (x.residents || []).length - (y.residents || []).length)[0];
  if (vacant) { a.home = vacant.placeId; vacant.residents = (vacant.residents || []).concat(a.id); a.renting = vacant.id; }
  else a.home = Sim.vp('tavern', to);
  const jobs = Civ.gatherJobsFor(to);
  if (AV.JOBS[a.job] && AV.JOBS[a.job].gather && !jobs.includes(a.job)) a.job = jobs[0] || 'unemployed';
  if (['guard', 'mayor', 'journalist', 'doctor', 'baker', 'blacksmith', 'shopkeeper', 'bartender', 'teacher'].includes(a.job)) a.job = jobs[0] || 'unemployed';
  a.work = Sim.defaultWork(a);
  a.goals = a.goals.filter(g => g.type !== 'MOVE_TO');
  for (const sid of a.secrets) if (s.secrets[sid].type === 'leaving') s.secrets[sid].exposed = true;
  for (const o of s.agents) if (o.vid === to && o !== a) { const r = Sim.rel(a, o.id); r[RI.familiarity] = Math.max(r[RI.familiarity], 12); }
  bumpRel(from, to, -1);
  Sim.emit({ type: 'MIGRATION', vid: from, to, actor: a.id, imp: 0.8, public: true, world: true, val: -0.1, text: a.name + ' moved from ' + V(from).name + ' to ' + V(to).name + '.' }, (o) => {
    if (o.rel[a.id] && o.rel[a.id][1] > 30 && o.vid === from) Sim.remember(o, { text: a.name + ' moved away to ' + V(to).name + '.', kind: 'loss', about: a.id, imp: 0.6, val: -0.5 });
  });
  Civ.history(a.name + ' moved from ' + V(from).name + ' to ' + V(to).name, to, 'migration', !a.core);
  a.stats.achieved += a.goals.length ? 0 : 1;
}

// ---------------- mind: scores, type, parameters ----------------
const TYPES = {
  PLANNER: t => t.conscientiousness * 0.5 + t.ambition * 0.4 + (1 - t.laziness) * 0.2 + (1 - t.riskTolerance) * 0.1,
  SOCIAL: t => t.extraversion * 0.45 + t.agreeableness * 0.3 + t.sociability * 0.35,
  OPPORTUNIST: t => t.greed * 0.45 + t.riskTolerance * 0.35 + (1 - t.honesty) * 0.3,
  'MEMORY-HEAVY': t => t.conscientiousness * 0.35 + (1 - t.neuroticism) * 0.3 + t.loyalty * 0.25 + (1 - t.extraversion) * 0.15,
  CREATIVE: t => t.openness * 0.55 + t.curiosity * 0.45,
  CAUTIOUS: t => t.neuroticism * 0.45 + (1 - t.riskTolerance) * 0.45 + (1 - t.courage) * 0.2,
  CHAOTIC: t => (1 - t.conscientiousness) * 0.45 + t.riskTolerance * 0.3 + t.neuroticism * 0.3 + t.laziness * 0.15,
  LOGICAL: t => t.honesty * 0.35 + (1 - t.neuroticism) * 0.3 + t.conscientiousness * 0.25 + (1 - t.extraversion) * 0.15 + t.curiosity * 0.1,
  MANIPULATOR: t => (1 - t.honesty) * 0.5 + t.extraversion * 0.3 + t.ambition * 0.2 + t.sociability * 0.1,
};
const ADJ = { PLANNER: 'Strategic', SOCIAL: 'Social', OPPORTUNIST: 'Opportunistic', 'MEMORY-HEAVY': 'Retentive', CREATIVE: 'Inventive', CAUTIOUS: 'Cautious', CHAOTIC: 'Erratic', LOGICAL: 'Analytical', MANIPULATOR: 'Persuasive', GENERALIST: 'Balanced' };
const NOUN = { PLANNER: 'Planner', SOCIAL: 'Connector', OPPORTUNIST: 'Opportunist', 'MEMORY-HEAVY': 'Archivist', CREATIVE: 'Creator', CAUTIOUS: 'Sentinel', CHAOTIC: 'Wildcard', LOGICAL: 'Reasoner', MANIPULATOR: 'Manipulator', GENERALIST: 'Generalist' };
const THINK = { PLANNER: 14, SOCIAL: 9, OPPORTUNIST: 8, 'MEMORY-HEAVY': 13, CREATIVE: 10, CAUTIOUS: 16, CHAOTIC: 6, LOGICAL: 12, MANIPULATOR: 9, GENERALIST: 11 };
Civ.TYPES = Object.keys(NOUN);
function computeMind(a) {
  const t = a.p;
  const ranked = Object.keys(TYPES).map(k => [k, TYPES[k](t)]).sort((x, y) => y[1] - x[1]);
  let type = ranked[0][0];
  if (ranked[0][1] < 0.6) type = 'GENERALIST';
  const second = type === 'GENERALIST' ? ranked[0][0] : ranked[1][0];
  const capacity = Math.round(40 + 25 * t.conscientiousness + 15 * t.openness + 10 * (1 - t.neuroticism));
  const sc = a.scores || {};
  const strat = sc.strategy || 50, soc = sc.socialIQ || 50;
  const depth = strat >= 66 ? 'HIGH' : strat >= 45 ? 'MEDIUM' : 'LOW';
  const smodel = soc >= 66 ? 'STRONG' : soc >= 45 ? 'MEDIUM' : 'WEAK';
  a.mind = {
    type, label: ADJ[second] + ' ' + NOUN[type], capacity, think: THINK[type],
    depth, samples: depth === 'HIGH' ? 8 : depth === 'MEDIUM' ? 5 : 3, noise: depth === 'HIGH' ? 0.16 : depth === 'MEDIUM' ? 0.3 : 0.46,
    smodel, social: smodel === 'STRONG' ? 0.85 : smodel === 'MEDIUM' ? 0.5 : 0.2,
    version: 'v1.' + (a.mindVer || 0),
  };
}
Civ.computeMind = computeMind;
function entropy(types) { const vals = Object.values(types || {}); const n = vals.reduce((x, y) => x + y, 0); if (!n) return 0; let h = 0; for (const v of vals) { const p = v / n; h -= p * Math.log(p); } return h / Math.log(12); }
function scoreTargets(a) {
  const s = S(); const t = a.p; const st = a.stats;
  const peers = s.agents.filter(o => !o.left && o.vid === a.vid);
  // accuracy: share of this mind's beliefs that match world truth, weighted by confidence
  let wt = 0, wr = 0;
  for (const b of a.beliefs) { if (!b.chain) continue; const tr = Sim.truthOf(b.chain, b.level); if (tr === null || tr === undefined) continue; wt += b.conf; if (tr) wr += b.conf; }
  const accuracy = clamp((wr + 1.5) / (wt + 2) * 100, 5, 99);
  // social model: does whom they trust track who is actually honest?
  let hit = 0, tot = 0;
  for (const o of peers) { if (o === a) continue; const r = a.rel[o.id]; if (!r || r[RI.familiarity] < 30) continue; tot++; if ((r[0] > 5) === (o.p.honesty > 0.5)) hit++; }
  const modelAcc = tot ? hit / tot : 0.5;
  // respect others hold for them
  let resp = 0, rn = 0; for (const o of peers) { if (o === a || !o.rel[a.id]) continue; resp += o.rel[a.id][2]; rn++; }
  resp = rn ? resp / rn : 0;
  const earnRank = peers.filter(o => (o.stats.earned || 0) < (st.earned || 0)).length / Math.max(1, peers.length - 1);
  const role = a.job === 'mayor' ? 10 : a.job === 'journalist' ? 7 : a.business ? 5 : a.job === 'teacher' ? 4 : 0;
  const days = Math.max(1, dayOf(s.t));
  const capacity = a.mind ? a.mind.capacity : 60;
  const T = {
    memory: 30 + (capacity - 40) * 1.1 + Math.min(15, (st.recalls || 0) * 0.4),
    socialIQ: 22 + 14 * t.agreeableness + 18 * t.empathy + 10 * t.extraversion + 8 * t.openness + Math.min(10, (st.convos || 0) / 20) + (modelAcc - 0.5) * 30,
    strategy: 18 + 25 * t.conscientiousness + 20 * t.ambition + 10 * (1 - t.laziness) + Math.min(18, (st.achieved || 0) * 6) + (a.job === 'mayor' ? 4 : 0),
    creativity: 18 + 32 * t.openness + 18 * t.curiosity + entropy(st.types) * 18 + (a.mind && a.mind.type === 'CREATIVE' ? 4 : 0),
    adaptability: 24 + 18 * t.openness + 14 * t.riskTolerance + 14 * (1 - t.neuroticism) + Math.min(16, (st.adapt || 0) * 1.6),
    influence: 12 + 18 * t.extraversion + 8 * t.sociability + resp / 100 * 30 + Math.min(16, (st.adopted || 0) * 0.25) + role,
    accuracy,
    deception: 30 * (1 - t.honesty) + 10 * t.extraversion + ((st.liesBelieved || 0) / ((st.liesTold || 0) + 2)) * 40 - (st.exposed || 0) * 8 + 10,
    resourcefulness: 18 + 14 * t.conscientiousness + 10 * t.curiosity + earnRank * 32 + Math.min(12, (st.gathered || 0) / 40),
    survival: (a.needAvg || 0.6) * 62 + 38 * (1 - Math.min(1, (st.sickMins || 0) / (days * 240))),
  };
  for (const k in T) T[k] = clamp(T[k], 3, 99);
  T.cognition = 0.18 * T.memory + 0.16 * T.socialIQ + 0.2 * T.strategy + 0.1 * T.creativity + 0.1 * T.adaptability + 0.16 * T.accuracy + 0.1 * T.influence;
  return T;
}
const REASON = {
  memory: ['kept more of what mattered', 'forgot what mattered'], socialIQ: ['read people correctly', 'misjudged who to trust'],
  strategy: ['reached a long-term goal', 'plans stalled'], creativity: ['tried something new', 'fell into a routine'],
  adaptability: ['changed course after a setback', 'kept repeating a failing plan'], influence: ['people took up their words', 'lost standing'],
  accuracy: ['beliefs matched the truth', 'believed false claims'], deception: ['a lie went unnoticed', 'a lie was exposed'],
  resourcefulness: ['earned more than peers', 'fell behind peers'], survival: ['kept fed and rested', 'went hungry or fell ill'],
};
function updateScores(a, init) {
  const s = S();
  const T = scoreTargets(a);
  if (init || !a.scores) { a.scores = {}; for (const k in T) a.scores[k] = Math.round(T[k]); computeMind(a); return; }
  const before = Object.assign({}, a.scores);
  for (const k in T) { if (k === 'cognition') continue; a.scores[k] = Math.round(clamp(a.scores[k] + clamp((T[k] - a.scores[k]) * 0.25, -2, 2), 1, 99) * 10) / 10; }
  const sc = a.scores;
  sc.cognition = Math.round((0.18 * sc.memory + 0.16 * sc.socialIQ + 0.2 * sc.strategy + 0.1 * sc.creativity + 0.1 * sc.adaptability + 0.16 * sc.accuracy + 0.1 * sc.influence) * 10) / 10;
  let drift = 0, big = null;
  for (const k in sc) { const d = sc[k] - before[k]; drift += Math.abs(d); if (k !== 'cognition' && (!big || Math.abs(d) > Math.abs(big[1]))) big = [k, d]; }
  a.mindDrift += drift;
  if (a.mindDrift >= 5) { a.mindVer++; a.mindDrift = 0; }
  computeMind(a);
  a.scoreHist.push({ d: dayOf(s.t), c: Math.round(sc.cognition), m: Math.round(sc.memory), s: Math.round(sc.socialIQ), st: Math.round(sc.strategy), cr: Math.round(sc.creativity), ad: Math.round(sc.adaptability), i: Math.round(sc.influence), ac: Math.round(sc.accuracy), de: Math.round(sc.deception), r: Math.round(sc.resourcefulness), su: Math.round(sc.survival) });
  if (a.scoreHist.length > 40) a.scoreHist.shift();
  if (big && Math.abs(big[1]) >= 1.5 && (a.core || Math.abs(big[1]) >= 2)) {
    const lab = { memory: 'memory', socialIQ: 'social IQ', strategy: 'strategy', creativity: 'creativity', adaptability: 'adaptability', influence: 'influence', accuracy: 'accuracy', deception: 'deception', resourcefulness: 'resourcefulness', survival: 'survival' }[big[0]];
    a.lastScoreNote = { k: big[0], d: big[1], why: REASON[big[0]][big[1] > 0 ? 0 : 1], day: dayOf(s.t) };
    (Civ._notes = Civ._notes || []).push([Math.abs(big[1]) + (a.core ? 0.5 : 0) + rnd() * 0.3, a, a.name + ' ' + lab + ' ' + (big[1] > 0 ? '+' : '') + Math.round(big[1] * 10) / 10 + ': ' + REASON[big[0]][big[1] > 0 ? 0 : 1]]);
  }
}
Civ.updateScores = updateScores;
Civ.scoreTargets = scoreTargets;
Civ.scoreElection = function (vid, winner, counts) {
  const s = S(); const w = s.byId[winner]; if (w) { w.stats.adopted += (counts[winner] || 0); if (w.job !== 'mayor') w.stats.achieved++; }
};

// ---------------- decision explanations (structured, for the UI) ----------------
const GOAL_FOR = { campaign: 'BECOME_MAYOR', vote: 'CIVIC_DUTY', commission: 'BUILD_OR_OPEN', learn: 'LEARN', travel: 'EXPLORE', steal: 'BECOME_RICH', investigate: 'PROTECT_VILLAGE', protest: 'FAIR_PRICES', help: 'HELP_OTHERS', mediate: 'KEEP_PEACE' };
const VERB = { work: 'Go to work', eat: 'Get something to eat', sleep: 'Go to sleep', rest: 'Rest at home', socialize: 'Look for company', gossip: 'Pass on news', talk_to: 'Talk to someone', campaign: 'Campaign for votes', vote: 'Vote', help: 'Help someone in need', investigate: 'Investigate', steal: 'Steal', protest: 'Protest at the town hall', visit: 'Take a walk', commission: 'Commission a building', learn: 'Study at the Academy', travel: 'Travel to another village', follow: 'Follow someone', mediate: 'Settle a feud', buy: 'Buy tools', clinic: 'See the doctor', jail: 'Sit in a cell' };
Civ.explain = function (a, top, C) {
  const s = S(); const vid = a.vid;
  let perceived = '';
  const recent = Sim.recall(a, m => s.t - m.t < 360 && (m.imp || 0) >= 0.4, 1)[0];
  const ratio = Sim.breadRatio(vid);
  if (top.type === 'eat' || a.needs.hunger < 0.3) perceived = 'Hunger at ' + Math.round(a.needs.hunger * 100) + '%';
  else if (top.type === 'sleep' && a.needs.energy < 0.3) perceived = 'Energy at ' + Math.round(a.needs.energy * 100) + '%';
  else if ((top.type === 'protest' || top.type === 'campaign') && ratio > 1.08) perceived = 'Bread prices up ' + Math.round((ratio - 1) * 100) + '%';
  else if (recent) perceived = recent.text;
  else if (ratio > 1.12) perceived = 'Bread prices up ' + Math.round((ratio - 1) * 100) + '%';
  else perceived = Sim.fmtClock(s.t) + ', ' + (a.needs.social < 0.3 ? 'feeling lonely' : 'a normal day');
  let bel = null;
  if (top.target) bel = a.beliefs.filter(b => b.about === top.target).sort((x, y) => y.conf - x.conf)[0];
  if (!bel && (top.type === 'campaign' || top.type === 'protest' || top.type === 'vote')) bel = a.beliefs.filter(b => b.about === s.town.mayor).sort((x, y) => y.conf - x.conf)[0];
  if (!bel && top.type === 'gossip' && top.belief) bel = a.beliefs.find(b => b.id === top.belief);
  if (!bel) bel = a.beliefs.slice().sort((x, y) => y.conf * Math.abs(Sim.CLAIMS[y.type].val) - x.conf * Math.abs(Sim.CLAIMS[x.type].val))[0];
  const believed = bel ? Sim.cap(Sim.claimText(bel, bel.level)) + ' (' + Math.round(bel.conf * 100) + '%)' : '';
  const g = a.goals.find(x => x.primary) || a.goals[0];
  let goal = GOAL_FOR[top.type] || (top.type === 'work' ? 'EARN A LIVING' : top.type === 'eat' || top.type === 'sleep' || top.type === 'rest' ? 'STAY WELL' : g ? g.type : '');
  if (top.type === 'commission') goal = top.what === 'business' ? 'OPEN A BUSINESS' : 'BUILD A HOME';
  if (top.type === 'campaign' && s.town.mayor === a.id) goal = 'STAY MAYOR';
  let relTxt = '';
  const tid = top.target || top.avoided || (top.type === 'campaign' || top.type === 'protest' ? s.town.mayor : null);
  if (tid && tid !== a.id && (s.byId[tid] || Sim.isPlayer(tid))) {
    const r = Sim.rel(a, tid); const n = nameOf(tid);
    relTxt = r[RI.resentment] > 35 ? 'Resents ' + n : r[0] > 35 ? 'Trusts ' + n : r[0] < -20 ? 'Distrusts ' + n : r[1] > 35 ? 'Fond of ' + n : 'Knows ' + n + ' a little';
    relTxt += ' (trust ' + Math.round(r[0]) + ')';
    if (top.avoided) relTxt = 'Avoiding ' + n;
  }
  const margin = C && C[1] ? Math.round((C[0].score - C[1].score) * 100) / 100 : null;
  return { perceived, believed, goal: String(goal).replace(/_/g, ' '), rel: relTxt, decision: (VERB[top.type] || top.type) + (top.target ? ': ' + nameOf(top.target) : top.place ? ' (' + Sim.placeName(top.place) + ')' : ''), reason: top.reason || '', margin, alt: C && C[1] ? C[1].type : null };
};
Civ.onDecision = function (a, top, work) {
  const s = S();
  if (work && (top.type === 'rest' || top.type === 'socialize' || top.type === 'visit') && a.job !== 'unemployed' && (!a.lastSkipNote || s.t - a.lastSkipNote > DAY)) { a.lastSkipNote = s.t; Civ.mind(a, a.name + ' decided to skip work (' + top.type + ' instead)', 'decision'); }
  if (top.type === 'campaign' && (!a.lastCampNote || s.t - a.lastCampNote > DAY)) { a.lastCampNote = s.t; Civ.mind(a, a.name + ' started campaigning', 'decision'); }
  if (top.type === 'follow') Civ.mind(a, a.name + ' started following ' + nameOf(top.target), 'decision');
  if (top.type === 'protest' && (!a.lastProtNote || s.t - a.lastProtNote > DAY)) { a.lastProtNote = s.t; Civ.mind(a, a.name + ' joined a protest over prices', 'decision'); }
  if (top.type === 'steal') Civ.mind(a, a.name + ' decided to steal tonight', 'secret');
  if (top.type === 'travel' && top.purpose === 'visit') Civ.mind(a, a.name + ' set out to visit ' + V(top.dest).name, 'decision');
  if (top.src === 'llm') Civ.mind(a, a.name + ' made a decision with AI reasoning: ' + (VERB[top.type] || top.type).toLowerCase(), 'ai');
  const vote = s.election.candidates.includes(a.id) ? null : leaning(a);
  if (vote && a.lean && a.lean !== vote && (!a.lastLeanNote || s.t - a.lastLeanNote > DAY / 2)) { a.lastLeanNote = s.t; Civ.mind(a, a.name + ' reconsidered support: now leaning ' + nameOf(vote) + ' over ' + nameOf(a.lean), 'politics'); }
  if (vote) a.lean = vote;
};
function leaning(a) { if (!a.core || S().t % 3) return a.lean; const sc = Sim.voteScores(a); const b = Object.entries(sc).sort((x, y) => y[1] - x[1])[0]; return b ? b[0] : null; }
Civ.onBelief = function (a, b, teller) {
  if (!b.chain || b.conf < 0.4 || !(a.core || a.featured)) return;
  const s = S();
  if (a.lastFalseNote && s.t - a.lastFalseNote < DAY / 2) return;
  if (Sim.truthOf(b.chain, b.level) === false) { a.lastFalseNote = s.t; Civ.mind(a, a.name + ' formed a false belief: ' + Sim.claimText(b, b.level) + (teller ? ' (from ' + teller.name + ')' : ''), 'belief'); }
};
Civ.onEvent = function (ev) {
  const s = S();
  if (ev.type === 'ARREST' && ev.guilty === false) { const who = S().byId[ev.about]; Civ.history(nameOf(ev.about) + ' was wrongly arrested in ' + (V(ev.vid) || { name: '?' }).name, ev.vid, 'crime', !!(who && who.jailHistory && who.jailHistory.length > 1)); }
  if (ev.type === 'CLEARED') Civ.history(ev.text.replace(/\.$/, ''), ev.vid, 'crime');
  if (ev.type === 'FALSE_TESTIMONY' || ev.type === 'RUMOR_CREATED') { const a = s.byId[ev.actor]; if (a) a.stats.liesTold = (a.stats.liesTold || 0) + 1; }
  if (ev.type === 'RUMOR_CREATED') { const a = s.byId[ev.actor]; if (a) Civ.mind(a, a.name + ' made up a rumor about ' + nameOf(ev.about), 'secret'); }
  if (ev.type === 'ARREST') { const g = s.byId[ev.actor]; if (g) { g.stats.achieved += ev.guilty ? 1 : 0; Civ.practice(g, 'investigation', 30); } }
  if (ev.type === 'ITEM_STOLEN') { const v = V(ev.vid); if (v) v.crimes = (v.crimes || 0) + 1; }
};
Civ.mind = function (a, text, kind) {
  const s = S(); if (!s.mindFeed) s.mindFeed = [];
  s.mindFeed.unshift({ id: s.nextId++, t: s.t, agent: a ? a.id : null, vid: a ? a.vid : null, text, kind: kind || 'decision' });
  if (s.mindFeed.length > 220) s.mindFeed.length = 220;
};
Civ.history = function (text, vid, kind, minor) {
  const s = S();
  const last = s.history[s.history.length - 1];
  if (last && last.text === text) return;
  s.history.push({ day: dayOf(s.t), t: s.t, text, vid: vid || null, kind: kind || 'world', minor: !!minor });
};

// ---------------- village aggregates ----------------
Civ.output = function (vid) {
  const h = V(vid).econ.hist; const last = h[h.length - 1];
  if (!last || !last.produced) return 0;
  let v = 0; for (const g in last.produced) v += last.produced[g] * (Sim.BASE_PRICE[g] || 1); return v;
};
Civ.influence = function (vid) {
  const s = S(); let r = 0;
  for (const v of World.VILLAGES) if (v.id !== vid) r += Civ.villageRel(vid, v.id);
  const L = people(vid);
  return clamp(30 + r * 0.6 + L.reduce((x, a) => x + (a.scores ? a.scores.influence : 40), 0) / Math.max(1, L.length) * 0.5 + s.history.filter(h => h.vid === vid && !h.minor).length * 0.5, 0, 100);
};

// ---------------- hourly / daily ----------------
Civ.hourly = function (hh) {
  const s = S();
  growCrops(1);
  if (hh === 9 || hh === 13) for (const v of World.VILLAGES) Civ.growth(v.id);
  for (const n of World.nodes) {
    if (n.crop) continue;
    let r = n.regen / 24;
    const Vv = V(n.vid);
    if (n.type === 'food' && Vv && Vv.flags.drought > 0) r *= 0.25;
    if (n.type === 'food' && Vv && Vv.flags.harvest > 0) r *= 1.6;
    if (!r) continue;
    s.nodes[n.id] = Math.min(n.max, (s.nodes[n.id] || 0) + r);
    syncNode(n);
  }
  for (const a of s.agents) {
    if (a.left) continue;
    if (hh === 23 && a.carry && !a.trip && Object.keys(a.carry).length) { const st = Sim.place('storehouse', a.vid); if (st) deposit(a, st); }
    a.needAvg = (a.needAvg || 0.6) * 0.96 + ((a.needs.hunger + a.needs.energy) / 2) * 0.04;
    if (a.sick) a.stats.sickMins += 60;
    // finish a visit or a trade trip by heading home
    if (a.plan && a.plan.type === 'travel' && a.plan.arrived && a.plan.purpose !== 'migrate' && s.t >= a.plan.until - 5) {
      a.returnHome = false;
      Sim.goPlan(a, { type: 'sleep', place: a.home, reason: 'heading home from ' + V(a.plan.dest).name, src: 'engine' });
    }
  }
  // village road upgrades after a tier rise: a few blocks per hour, visibly
  for (const v of World.VILLAGES) {
    const Vv = V(v.id); if (!Vv.roadQueue || !Vv.roadQueue.length) continue;
    for (let k = 0; k < 18 && Vv.roadQueue.length; k++) { const [x, z] = Vv.roadQueue.shift(); if (World.get(x, World.GROUND, z) === B.PATH) World.set(x, World.GROUND, z, Vv.tier === 'City' ? B.STONE_BRICK : B.COBBLE, { road: true }); }
  }
};
Civ.minute = function () {
  const s = S();
  if (Math.floor(s.t) % 2) return;
  for (const a of s.agents) if (!a.left) {
    if (a.acting && (!a.plan || a.plan.type !== 'work')) a.acting = null;
    const t = Civ.taskOf(a); if (!a.task || a.task.t !== t.t || a.task.r !== t.r) a.task = t;
  }
};
const TIERS = [['Hamlet', 0], ['Village', 22], ['Town', 38], ['City', 58]];
Civ.TIERS = TIERS;
function tierScore(vid) {
  const s = S(); const Vv = V(vid);
  const pop = people(vid).length;
  const homes = Object.values(s.properties).filter(p => p.vid === vid && p.kind === 'house').length;
  const biz = Object.values(s.businesses).filter(b => b.vid === vid).length + Object.values(s.shops).filter(sh => sh.vid === vid).length * 0.3;
  const civic = (Vv.civic || []).length + (World.places[vid + '_academy'] ? 1 : 0);
  let stockVal = 0; for (const g in Vv.econ.stock) stockVal += Vv.econ.stock[g] * (Sim.BASE_PRICE[g] || 1);
  return pop * 0.55 + homes * 0.5 + biz * 2 + civic * 4 + Math.min(10, (stockVal + Vv.town.treasury) / 120) + (Vv.tech - 1) * 2;
}
// shortages: a village short of food or of a building material pulls gatherers onto it
Civ.shortages = function (vid) {
  const s = S(); const Vv = V(vid); const L = people(vid); const out = [];
  if ((Vv.econ.stock.food || 0) < L.length * 1.5) out.push('food');
  for (const pr of s.projects) if (!pr.done && pr.vid === vid && pr.waiting && pr.waiting !== 'food') out.push(pr.waiting);
  return [...new Set(out)];
};
const JOB_FOR = { food: 'farmer', wood: 'woodcutter', stone: 'miner', iron: 'miner', coal: 'miner', clay: 'potter', wool: 'shepherd', gold: 'miner' };
Civ.rebalanceJobs = function (vid) {
  const s = S(); const L = people(vid); const avail = Civ.gatherJobsFor(vid);
  for (const need of Civ.shortages(vid)) {
    let job = JOB_FOR[need]; if (need === 'food' && !avail.includes('farmer') && avail.includes('fisher')) job = 'fisher';
    if (!avail.includes(job)) continue;
    const have = L.filter(a => a.job === job).length;
    if (have >= Math.max(3, L.length / 4)) continue;
    const pool = L.filter(a => !a.core && a.job !== job && AV.JOBS[a.job] && AV.JOBS[a.job].gather && L.filter(o => o.job === a.job).length > 2 && !a.employer).sort((x, y) => x.money - y.money);
    const a = pool[0]; if (!a) continue;
    const from = a.job; a.job = job; a.work = Sim.defaultWork(a); a.stats.adapt = (a.stats.adapt || 0) + 1;
    Sim.setThought(a, need === 'food' ? 'People are going hungry. The fields need hands.' : 'The builders are waiting on ' + need + '.');
    Civ.mind(a, a.name + ' switched from ' + from + ' to ' + job + ': ' + V(vid).name + ' is short of ' + need, 'decision');
    Sim.emit({ type: 'JOB_CHANGE', actor: a.id, vid, imp: 0.4, text: a.name + ' left ' + from + ' work for the ' + (job === 'farmer' ? 'fields' : job === 'woodcutter' ? 'forest' : job + "'s trade") + ': the village is short of ' + need + '.' });
  }
};
// storehouse carts: when no merchant has covered a shortage, the treasury buys from the richest neighbour
Civ.carts = function () {
  const s = S();
  for (const v of World.VILLAGES) {
    const Vv = V(v.id); const pop = people(v.id).length;
    for (const g of ['food', 'wood', 'stone', 'iron', 'coal', 'clay', 'wool']) {
      const want = g === 'food' ? pop * 2.5 : g === 'iron' || g === 'coal' ? 10 : 20;
      if ((Vv.econ.stock[g] || 0) >= want * 0.5) continue;
      const src = World.VILLAGES.filter(o => o.id !== v.id && (V(o.id).econ.stock[g] || 0) > (g === 'food' ? people(o.id).length * 4 : g === 'iron' || g === 'coal' ? 30 : 50)).sort((x, y) => V(y.id).econ.stock[g] - V(x.id).econ.stock[g])[0];
      if (!src) continue;
      const Sv = V(src.id);
      const unit = (Sim.priceOf(g, src.id) + Sim.priceOf(g, v.id)) / 2;
      const q = Math.floor(Math.min(want - (Vv.econ.stock[g] || 0), (Sv.econ.stock[g] || 0) * 0.35, Math.max(0, Vv.town.treasury - 20) / unit));
      if (q < 5) continue;
      Sv.econ.stock[g] -= q; Vv.econ.stock[g] = (Vv.econ.stock[g] || 0) + q;
      const cost = Math.round(q * unit); Vv.town.treasury -= cost; Sv.town.treasury += cost;
      bumpRel(v.id, src.id, 1);
      Sim.emit({ type: 'TRADE', vid: v.id, to: src.id, imp: g === 'food' ? 0.55 : 0.4, public: true, text: Vv.name + ' bought ' + q + ' ' + g + ' from ' + Sv.name + ' by storehouse cart for ' + cost + ' coins.' });
    }
  }
};
// growth: a village with idle builders always finds something worth building
Civ.growth = function (vid) {
  const s = S(); const Vv = V(vid); const L = people(vid);
  const builders = L.filter(a => a.job === 'builder').length; if (!builders) return null;
  const open = s.projects.filter(p => !p.done && p.vid === vid);
  if (open.length >= Math.max(1, Math.ceil(builders / 2))) return null;
  // 1. the best-off resident without a proper home of their own
  const homeless = L.filter(a => !a.core || true).filter(a => !ownsHome(a).some(p => p.tier && p.tier !== 'hut') && !s.projects.some(p => !p.done && p.owner === a.id) && !(a.jailUntil > s.t) && (a.debt || 0) < 150);
  homeless.sort((x, y) => y.money - x.money);
  for (const a of homeless.slice(0, 3)) {
    const tier = a.money > Civ.estimate(vid, 'cottage') * 0.6 ? 'cottage' : 'hut';
    const est = Civ.estimate(vid, tier); if (a.money < est * 0.3) continue;
    const pay = Math.round(Math.min(a.money * 0.8, est)); const loan = Math.max(0, Math.round(est * 1.15 - pay));
    a.money -= pay;
    const pr = Civ.startProject(a, 'home', { tier, escrow: pay + loan, why: a.name + ' put down ' + pay + ' coins' + (loan ? ' and borrowed ' + loan + ' from the village' : '') + ' for a ' + HOME[tier].label });
    if (!pr) { a.money += pay; continue; }
    if (loan) { a.debt = (a.debt || 0) + loan; Vv.town.treasury -= Math.min(Vv.town.treasury, loan * 0.5); }
    Sim.setThought(a, 'A place of my own, finally.');
    return pr;
  }
  // 2. a public building the village does not have yet
  const want = ['watchtower', 'school', 'library', 'hall'].find(c => !(Vv.civic || []).includes(c) && !s.projects.some(p => p.civic === c && p.vid === vid));
  if (want && Vv.town.treasury > CIVIC[want].cost * 0.5) { const pay = Math.min(Vv.town.treasury - 10, CIVIC[want].cost); Vv.town.treasury -= pay; return Civ.startProject(null, 'civic', { vid, civic: want, escrow: CIVIC[want].cost, why: Vv.name + ' has builders with nothing to do and voted for a ' + CIVIC[want].label }); }
  return null;
};
Civ.daily = function () {
  const s = S(); const d = dayOf(s.t);
  s.counters.workDay = Object.assign({}, s.counters.work || {});
  Civ.carts();
  for (const v of World.VILLAGES) {
    const crops = villageCrops(v.id); if (!crops.length) continue;
    const pop = people(v.id).length; let bare = 0, cells = 0; for (const n of crops) { bare += cropCount(n, '0'); cells += n.blocks.length; }
    const Vv = V(v.id);
    if (!openField(v.id) && bare < 6 && (Vv.econ.stock.food || 0) < pop * 5 && cells < pop * 7 && (s.fields || []).filter(f => f.vid === v.id).length < 4) {
      const by = people(v.id).filter(a => a.job === 'farmer').sort((x, y) => (y.skills.farming || 0) - (x.skills.farming || 0))[0];
      Civ.planField(v.id, by);
    }
  }
  for (const v of World.VILLAGES) { Sim.useVillage(v.id); Civ.rebalanceJobs(v.id); }
  for (const v of World.VILLAGES) {
    const vid = v.id; const Vv = V(vid); Sim.useVillage(vid);
    for (const k in Vv.flags) if (typeof Vv.flags[k] === 'number' && k !== 'protestDay' && Vv.flags[k] > 0) { Vv.flags[k]--; if (k === 'drought' && !Vv.flags[k]) Sim.emit({ type: 'WORLD_EVENT', vid, imp: 0.6, public: true, headline: 'RAIN ENDS THE DROUGHT', text: 'Rain at last in ' + Vv.name + '. The fields recover.' }); if (k === 'mineClosed' && !Vv.flags[k]) Sim.emit({ type: 'WORLD_EVENT', vid, imp: 0.5, public: true, headline: 'MINE REOPENS', text: 'The ' + Vv.name + ' mine is shored up and open again.' }); }
    Vv.econ.boom = Vv.flags.boom > 0;
    // tech + tier
    const prod = Civ.output(vid);
    Vv.techPoints += prod / 60 + people(vid).filter(a => a.stats.learned).length * 0.3 + (Vv.civic || []).length * 0.5 + (vid === 'highvale' ? 1.5 : 0);
    Vv.tech = Math.min(10, 1 + Math.floor(Math.sqrt(Vv.techPoints / 30)));
    Vv.tierScore = Math.round(tierScore(vid) * 10) / 10;
    let tier = TIERS.filter(t => Vv.tierScore >= t[1]).pop()[0];
    const curI = TIERS.findIndex(t => t[0] === Vv.tier);
    if (TIERS.findIndex(t => t[0] === tier) < curI && Vv.tierScore >= TIERS[curI][1] - 4) tier = Vv.tier; // hysteresis: shrink only on a clear drop
    if (tier !== Vv.tier) {
      const up = TIERS.findIndex(t => t[0] === tier) > TIERS.findIndex(t => t[0] === Vv.tier);
      const was = Vv.tier; Vv.tier = tier;
      if (up && d > 1) {
        Sim.emit({ type: 'TIER_UP', vid, imp: 0.95, public: true, world: true, val: 0.3, headline: Vv.name.toUpperCase() + ' IS NOW A ' + tier.toUpperCase(), text: Vv.name + ' grew from a ' + was.toLowerCase() + ' into a ' + tier.toLowerCase() + '.' });
        Civ.history(Vv.name + ' became a ' + tier.toLowerCase(), vid, 'growth');
        // better roads and a new public building
        Vv.roadQueue = [];
        for (let x = v.cx - v.r - 6; x <= v.cx + v.r + 6; x++) for (let z = v.cz - v.r - 6; z <= v.cz + v.r + 6; z++) if (x >= 0 && z >= 0 && x < World.W && z < World.D && World.get(x, World.GROUND, z) === B.PATH && Math.hypot(x - v.cx, z - v.cz) < v.r + 6) Vv.roadQueue.push([x, z]);
        Vv.roadQueue.sort((p, q) => Math.hypot(p[0] - v.cx, p[1] - v.cz) - Math.hypot(q[0] - v.cx, q[1] - v.cz));
        const want = ['watchtower', 'school', 'library', 'hall'].find(c => !(Vv.civic || []).includes(c) && !s.projects.some(p => p.civic === c && p.vid === vid));
        if (want && Vv.town.treasury > CIVIC[want].cost) { Vv.town.treasury -= CIVIC[want].cost; Civ.startProject(null, 'civic', { vid, civic: want, escrow: CIVIC[want].cost }); }
      } else if (!up && d > 1) Civ.history(Vv.name + ' shrank back to a ' + tier.toLowerCase(), vid, 'growth');
    }
    Vv.trust = Sim.stats(vid).trust;
    // property: rent and wear
    for (const p of Object.values(s.properties)) {
      if (p.vid !== vid) continue;
      p.condition = Math.max(0, p.condition - 0.006 - (vid === 'ashfield' ? 0.004 : 0));
      p.value = Math.round((HOME[p.tier] ? HOME[p.tier].value : p.kind === 'house' ? 80 : 150) * (0.5 + p.condition * 0.5) * (1 + (Vv.tech - 1) * 0.04));
      const o = s.byId[p.owner];
      for (const rid of (p.residents || [])) {
        const r = s.byId[rid]; if (!r || r === o || !o || (o.family || []).includes(rid) || o.couple === rid) continue;
        const rent = p.tier === 'hut' ? 2 : p.tier === 'cottage' ? 3 : 4;
        if (r.money >= rent) { r.money -= rent; o.money += rent; } else Sim.relAdj(o, r.id, 'resentment', 2);
      }
    }
    // buying a home for sale
    const forSale = Object.values(s.properties).filter(p => p.vid === vid && p.kind === 'house' && p.forSale);
    for (const p of forSale) {
      const buyer = people(vid).filter(a => !ownsHome(a).length && a.money > p.price * 1.15 && (a.p.ambition > 0.4 || a.couple)).sort((x, y) => y.money - x.money)[0];
      if (!buyer) continue;
      const seller = s.byId[p.owner];
      buyer.money -= p.price; if (seller) { seller.money += p.price; seller.owns = seller.owns.filter(x => x !== p.id); } else Vv.town.treasury += p.price;
      p.owner = buyer.id; p.forSale = false; buyer.owns.push(p.id);
      moveHome(buyer, p.placeId, p);
      Civ.mind(buyer, buyer.name + ' bought a house' + (seller ? ' from ' + seller.name : '') + ' for ' + p.price + ' coins', 'property');
      Sim.emit({ type: 'PROPERTY_SOLD', vid, actor: buyer.id, imp: 0.5, text: buyer.name + ' bought ' + (seller ? seller.name + '\'s ' : 'a ') + 'house in ' + Vv.name + ' for ' + p.price + ' coins.' });
    }
    // businesses: hiring, firing and dividends
    for (const b of Object.values(s.businesses).filter(b => b.vid === vid)) {
      const owner = s.byId[b.owner];
      if (!owner || owner.left || owner.vid !== vid) { const heir = owner && s.agents.find(o => o.vid === vid && !o.left && (owner.family || []).includes(o.id)); if (heir) { b.owner = heir.id; heir.business = b.id; Civ.history(heir.name + ' inherited ' + b.name, vid, 'business', true); } continue; }
      const cap = b.kind === 'mining' ? 5 : b.kind === 'construction' ? 4 : 3;
      const job = BIZ[b.kind].job;
      if (b.cash > 12 && b.employees.length < cap && rnd() < 0.7) {
        const cand = people(vid).filter(a => !a.employer && a !== owner && !a.business && (a.job === 'unemployed' || (a.job === job && a.money < 60)) && a.jailUntil <= s.t).sort((x, y) => ((y.skills[JOB_SKILL[job]] || 0) + Sim.relScore(owner, y.id)) - ((x.skills[JOB_SKILL[job]] || 0) + Sim.relScore(owner, x.id)))[0];
        if (cand) {
          if (cand.job === 'unemployed' && job !== 'merchant') { cand.job = job; cand.work = Sim.defaultWork(cand); cand.goals = cand.goals.filter(g => g.type !== 'FIND_WORK'); }
          cand.employer = b.id; b.employees.push(cand.id); b.cash -= 4; cand.money += 4;
          Sim.relAdj(cand, owner.id, 'trust', 6);
          Civ.mind(owner, owner.name + ' hired ' + cand.name + ' for ' + b.name, 'business');
          Sim.emit({ type: 'HIRED', vid, actor: owner.id, target: cand.id, imp: 0.45, text: owner.name + ' hired ' + cand.name + ' at ' + b.name + '.' });
        }
      }
      if (b.cash < -15 && b.employees.length) {
        const id = b.employees.pop(); const e = s.byId[id];
        if (e) { e.employer = null; Sim.relAdj(e, owner.id, 'resentment', 20); Sim.remember(e, { text: owner.name + ' let me go from ' + b.name + '.', kind: 'fired', about: owner.id, actor: owner.id, imp: 0.7, val: -0.7 }); Civ.mind(owner, owner.name + ' fired ' + e.name + ' from ' + b.name, 'business'); }
      }
      // daily wage floor for employees, dividends to the owner
      for (const id of b.employees) { const e = s.byId[id]; if (e && b.cash > 3) { b.cash -= 2; e.money += 2; } }
      if (b.cash > 20) { const div = (b.cash - 20) * 0.6; b.cash -= div; owner.money += div; owner.stats.earned += div; }
    }
    // lending
    const poor = people(vid).filter(a => a.money < 4 && a.needs.hunger < 0.45 && !s.loans.some(l => l.borrower === a.id && !l.done));
    for (const a of poor.slice(0, 2)) {
      const lender = people(vid).filter(o => o !== a && o.money > 120 && Sim.rel(o, a.id)[0] > -10).sort((x, y) => (y.money * (1 - y.p.empathy * 0.3)) - (x.money * (1 - x.p.empathy * 0.3)))[0];
      if (!lender) continue;
      const amount = 20, rate = Math.round((0.05 + lender.p.greed * 0.25) * 100) / 100;
      lender.money -= amount; a.money += amount;
      s.loans.push({ id: 'l' + (s.nextId++), vid, lender: lender.id, borrower: a.id, amount, owed: Math.round(amount * (1 + rate)), day: d, due: d + 5, done: false });
      Civ.mind(lender, lender.name + ' lent ' + a.name + ' ' + amount + ' coins at ' + Math.round(rate * 100) + '%', 'money');
    }
    for (const l of s.loans.filter(l => !l.done && l.vid === vid)) {
      const b = s.byId[l.borrower], le = s.byId[l.lender]; if (!b || !le) { l.done = true; continue; }
      if (b.money > l.owed + 15) { b.money -= l.owed; le.money += l.owed; l.done = true; Sim.relAdj(le, b.id, 'trust', 6); }
      else if (d > l.due + 3 && !l.defaulted) {
        l.defaulted = true; Sim.relAdj(le, b.id, 'trust', -20); Sim.relAdj(le, b.id, 'resentment', 20);
        const chain = Sim.newChain({ type: 'liar', about: b.id, by: le.id, level: 0, truth: true, how: 'unpaid debt' });
        Sim.addBelief(le, { type: 'liar', about: b.id, level: 1, conf: 0.7, src: 'self', chain }, null, true);
        Civ.mind(le, b.name + ' defaulted on a loan from ' + le.name, 'money');
      }
    }
    // donations from the generous
    for (const a of people(vid)) {
      if (a.money > 180 && a.p.empathy > 0.7 && rnd() < 0.3) {
        const need = people(vid).filter(o => o.money < 6).sort((x, y) => x.money - y.money)[0];
        if (need) { a.money -= 12; need.money += 12; Sim.relAdj(need, a.id, 'affection', 10); Sim.remember(need, { text: a.name + ' gave me 12 coins.', kind: 'helped_me', about: a.id, actor: a.id, imp: 0.6, val: 0.7 }); a.stats.helped++; }
        else { a.money -= 15; Vv.town.treasury += 15; }
      }
    }
    // migration: people whose life here has gone wrong, or who always meant to leave
    const popNow = people(vid).length;
    for (const a of people(vid)) {
      if (a.migrating || a.jailUntil > s.t) continue;
      if (popNow <= 16) { a.lowDays = 0; continue; }
      if (a.mood < -0.25) a.lowDays = (a.lowDays || 0) + 1; else a.lowDays = Math.max(0, (a.lowDays || 0) - 1);
      const goal = a.goals.find(g => g.type === 'MOVE_TO');
      const planner = a.secrets.some(x => s.secrets[x].type === 'leaving');
      if (goal && a.money > 70 && d >= 3 && rnd() < 0.3) { Civ.migrate(a, goal.target, 'always wanted to live in ' + V(goal.target).name); continue; }
      if ((planner && a.lowDays >= 3 && d > 4) || (a.lowDays >= 4 && a.money < 25 && !a.owns.length && a.p.riskTolerance > 0.4 && rnd() < 0.35)) {
        const best = World.VILLAGES.filter(x => x.id !== vid && people(x.id).length < 34).map(x => [x.id, Sim.stats(x.id).happy + Civ.gatherJobsFor(x.id).length * 2 + Civ.villageRel(vid, x.id) * 0.2 + rnd() * 8]).sort((p, q) => q[1] - p[1])[0];
        if (best) Civ.migrate(a, best[0], 'life in ' + Vv.name + ' has gone sour');
      }
    }
    Sim.useVillage(vid);
  }
  // scores evolve slowly, once a day
  Civ._notes = [];
  for (const a of s.agents) if (!a.left) updateScores(a);
  for (const [, a, text] of Civ._notes.sort((x, y) => y[0] - x[0]).slice(0, 8)) Civ.mind(a, text, 'score');
  Civ._notes = [];
  // milestones
  const rich = s.agents.filter(a => !a.left).sort((x, y) => y.money - x.money)[0];
  for (const m of [500, 1000, 2500]) { const key = 'rich' + m; if (rich && rich.money >= m && !s.history.some(h => h.key === key)) { Civ.history('First resident with ' + m + ' coins: ' + rich.name + ' of ' + V(rich.vid).name, rich.vid, 'milestone'); s.history[s.history.length - 1].key = key; } }
  for (const v of World.VILLAGES) { const n = people(v.id).length; for (const m of [20, 30, 40]) { const key = 'pop' + v.id + m; if (n >= m && V(v.id).pop0 < m && !s.history.some(h => h.key === key)) { Civ.history(V(v.id).name + ' reached ' + m + ' residents', v.id, 'growth'); s.history[s.history.length - 1].key = key; } } }
  // world events
  Civ.worldEvent();
  // relations slowly return toward zero; prune old records
  for (const k in s.relations) s.relations[k] *= 0.985;
  if (s.crimes.length > 160) s.crimes.splice(0, s.crimes.length - 160);
  if (s.cases.length > 120) s.cases.splice(0, s.cases.length - 120);
  s.loans = s.loans.filter(l => !l.done || d - l.day < 6);
  for (const pr of s.projects.filter(p => p.done && s.t - p.finished > 3 * DAY)) pr.blocks = [];
  s.projects = s.projects.filter(p => !p.done || s.t - p.finished < 6 * DAY);
};

// ---------------- world events ----------------
const EVENTS = [
  ['drought', 0.16], ['harvest', 0.12], ['collapse', 0.08], ['fire', 0.1], ['disease', 0.09], ['wave', 0.07], ['discovery', 0.07], ['boom', 0.1], ['crimewave', 0.1],
];
Civ.worldEvent = function (force) {
  const s = S();
  if (!force && (rnd() > 0.16 || dayOf(s.t) < 2)) return;
  let r = rnd() * EVENTS.reduce((x, e) => x + e[1], 0), kind = force;
  if (!kind) for (const [k, w] of EVENTS) { r -= w; if (r <= 0) { kind = k; break; } }
  const vs = World.VILLAGES.map(v => v.id);
  const emit = (vid, headline, text, imp, hist) => { Sim.useVillage(vid); Sim.emit({ type: 'WORLD_EVENT', kind, vid, imp: imp || 0.8, public: true, world: (imp || 0.8) >= 0.85, val: -0.2, headline, text }); if (hist !== false) Civ.history(text.replace(/\.$/, ''), vid, 'event'); };
  if (kind === 'drought') {
    const hit = vs.filter(v => World.nodes.some(n => n.vid === v && n.type === 'food')).sort((a, b) => (b === 'greenhollow') - (a === 'greenhollow') || rnd() - 0.5).slice(0, 2);
    for (const vid of hit) { V(vid).flags.drought = 3; for (const n of World.nodes.filter(n => n.vid === vid && n.type === 'food')) { s.nodes[n.id] *= 0.5; syncNode(n); } }
    emit(hit[0], 'DROUGHT HITS THE FIELDS', 'Drought struck ' + hit.map(v => V(v).name).join(' and ') + '. The crops are wilting.');
  } else if (kind === 'harvest') {
    const vid = pick(vs.filter(v => World.nodes.some(n => n.vid === v && n.type === 'food')));
    V(vid).flags.harvest = 3; emit(vid, 'A RECORD HARVEST', 'A record harvest in ' + V(vid).name + '. Granaries are filling.', 0.7);
  } else if (kind === 'collapse') {
    const vid = 'ironridge'; V(vid).flags.mineClosed = 2;
    for (const n of World.nodes.filter(n => n.vid === vid && (n.type === 'iron' || n.type === 'coal'))) { s.nodes[n.id] *= 0.7; syncNode(n); }
    const miners = people(vid).filter(a => a.job === 'miner' && a.plan && a.plan.type === 'work');
    const hurt = miners.slice(0, 1 + Math.floor(rnd() * 2)); for (const a of hurt) a.injured = true;
    emit(vid, 'IRONRIDGE MINE COLLAPSES', 'A gallery collapsed in the Ironridge mine' + (hurt.length ? ', injuring ' + hurt.map(a => a.name).join(' and ') : '') + '. The mine is closed for repairs.', 0.95);
  } else if (kind === 'fire') {
    const vid = pick(vs);
    const prop = pick(Object.values(s.properties).filter(p => p.vid === vid && p.kind !== 'civic')); if (!prop) return;
    const pl = Sim.place(prop.placeId); if (!pl) return;
    const b = World.buildings.find(x => x.id === prop.placeId) || pl;
    prop.damage = [];
    if (b.x !== undefined) for (let i = 0; i < 14; i++) { const x = b.x + Math.floor(rnd() * b.w), z = b.z + Math.floor(rnd() * b.d); for (let y = World.H - 2; y > World.STAND + 2; y--) { const blk = World.get(x, y, z); if (blk && blk !== B.TORCH) { prop.damage.push([x, y, z, blk]); World.set(x, y, z, 0, { fire: true }); break; } } }
    prop.condition = Math.max(0.1, prop.condition - 0.45);
    emit(vid, 'FIRE IN ' + V(vid).name.toUpperCase(), 'Fire tore through ' + (prop.owner ? nameOf(prop.owner) + '\'s ' : 'a ') + (prop.kind === 'house' ? 'house' : 'shop') + ' in ' + V(vid).name + '. The roof is open to the sky.');
  } else if (kind === 'disease') {
    const vid = rnd() < 0.5 ? 'ashfield' : pick(vs);
    const sick = people(vid).filter(() => rnd() < 0.22); for (const a of sick) a.sick = true;
    emit(vid, 'FEVER SPREADS IN ' + V(vid).name.toUpperCase(), 'A fever spread through ' + V(vid).name + ': ' + sick.length + ' residents fell ill.');
  } else if (kind === 'wave') {
    const from = 'ashfield'; const to = World.VILLAGES.filter(v => v.id !== from).map(v => v.id).sort((a, b) => Sim.stats(b).happy - Sim.stats(a).happy)[0];
    const movers = people(from).length > 18 ? people(from).filter(a => !a.owns.length && a.money < 30 && !a.core).slice(0, 3) : [];
    for (const a of movers) Civ.migrate(a, to, 'joined the wave leaving ' + V(from).name);
    if (movers.length) emit(from, 'EXODUS FROM ASHFIELD', movers.length + ' residents set out from Ashfield for ' + V(to).name + '.');
  } else if (kind === 'discovery') {
    const n = World.nodes.find(x => x.type === 'gold'); if (!n) return;
    let added = 0;
    for (let k = 0; k < 400 && added < 4; k++) { const sp = pick(n.spots); const x = sp[0] + (rnd() < 0.5 ? -1 : 1), z = sp[1], y = World.STAND + Math.floor(rnd() * 3); if (World.get(x, y, z) === B.STONE) { n.blocks.push([x, y, z, B.GOLD_ORE]); added++; } }
    n.max += added * 2; s.nodes[n.id] = (s.nodes[n.id] || 0) + added * 2; n._shown = undefined; syncNode(n, true);
    emit(n.vid, 'NEW GOLD VEIN FOUND', 'Miners found a new gold vein in the Ironridge deep seam.', 0.9);
  } else if (kind === 'boom') {
    const vid = pick(['rivergate', 'ironridge', 'highvale']); V(vid).flags.boom = 3;
    emit(vid, 'MARKET BOOM', 'Trade is booming in ' + V(vid).name + '. Prices are up and caravans are busy.', 0.7);
  } else if (kind === 'crimewave') {
    const vid = rnd() < 0.6 ? 'ashfield' : pick(vs); V(vid).flags.crimeWave = 3;
    emit(vid, 'CRIME WAVE IN ' + V(vid).name.toUpperCase(), 'Break-ins are rising in ' + V(vid).name + '. Residents lock their doors.', 0.75);
  }
};

// ---------------- macro day: coarse simulation for long gaps ----------------
Civ.macroDay = function () {
  const s = S();
  s.coarse = true;
  const d0 = dayOf(s.t);
  for (const v of World.VILLAGES) {
    const vid = v.id; const Vv = V(vid); Sim.useVillage(vid);
    const L = people(vid);
    // production
    for (const a of L) {
      const J = AV.JOBS[a.job]; if (!J || !J.gather || a.jailUntil > s.t) continue;
      const hours = 8 * (0.5 + a.p.conscientiousness * 0.5) * (1 - a.p.laziness * 0.4);
      for (const t of J.gather) {
        if (t === 'food' && villageCrops(vid).length) {
          // a day in the fields: harvest what is ripe, replant what is bare, till part of an open field
          let budget = hours * 9 * Civ.skillMult(a, 'farming'); let got = 0;
          for (const n of villageCrops(vid)) { const f = farmOf(n); let st = ''; for (const c of f.s) { if (c === '2' && budget >= 1) { budget--; got += CROP_YIELD; st += '0'; } else st += c; } f.s = st; }
          for (const n of villageCrops(vid)) { const f = farmOf(n); let st = ''; for (const c of f.s) { if (c === '0' && budget >= 1) { budget--; st += '1'; } else st += c; } f.s = st; }
          const fld = openField(vid); while (fld && budget >= 2 && fld.tilled < fld.cells.length) { budget -= 2; tillCell(fld, a); }
          Vv.econ.stock.food = (Vv.econ.stock.food || 0) + got; Vv.econ.prodDay.food = (Vv.econ.prodDay.food || 0) + got;
          const pay = Math.min(got * Sim.priceOf('food', vid) * 0.8, Math.max(0, Vv.town.treasury)); Vv.town.treasury -= pay; a.money += pay; a.stats.earned += pay; a.stats.gathered += got;
          Civ.practice(a, 'farming', 60);
          continue;
        }
        const nodes = World.nodes.filter(n => n.vid === vid && n.type === t && (s.nodes[n.id] || 0) >= 1);
        if (!nodes.length || (t === 'gold' && rnd() < 0.8)) continue;
        const n = pick(nodes);
        let q = Math.min(s.nodes[n.id], RATE[t] * hours * Civ.skillMult(a, SKILL_OF[t]) / J.gather.length);
        s.nodes[n.id] -= q; const k = stockKey(t);
        Vv.econ.stock[k] = (Vv.econ.stock[k] || 0) + q; Vv.econ.prodDay[k] = (Vv.econ.prodDay[k] || 0) + q;
        const pay = Math.min(q * Sim.priceOf(k, vid) * 0.8, Math.max(0, Vv.town.treasury)); Vv.town.treasury -= pay; a.money += pay; a.stats.earned += pay; a.stats.gathered += q;
        Civ.practice(a, SKILL_OF[t], 60);
      }
    }
    // bakers and smiths
    for (const n of villageCrops(vid)) { const f = farmOf(n); let st = ''; for (const c of f.s) st += c === '1' && rnd() < 0.9 ? '2' : c; f.s = st; syncCrops(n); }
    const bak = s.shops[Sim.vp('bakery')], forge = s.shops[Sim.vp('forge')];
    if (bak) { const q = Math.min(Vv.econ.stock.food, 40); Vv.econ.stock.food -= q; bak.stock.bread = Math.min(160, bak.stock.bread + q * 2); }
    if (forge) { const q = Math.min(Math.floor(Vv.econ.stock.iron / 2), Vv.econ.stock.coal, 3); Vv.econ.stock.iron -= q * 2; Vv.econ.stock.coal -= q; forge.stock.tools += q; }
    for (const k of ['store', 'market', 'tavern']) { const id = Sim.vp(k); if (id) Sim.restock(id); }
    // eating
    for (const a of L) {
      let ate = 0;
      for (let m = 0; m < 2; m++) {
        if (a.inv.bread > 0) { a.inv.bread--; ate++; continue; }
        const sel = Sim.chooseSeller(a, 'bread', 12); if (sel && Sim.sell(a, sel.id, sel.good === 'meal' ? 'meal' : 'bread', 1)) { if (sel.good !== 'meal') a.inv.bread = Math.max(0, a.inv.bread - 1); ate++; }
      }
      a.needs.hunger = ate >= 2 ? 0.8 : ate === 1 ? 0.5 : 0.2; a.needs.energy = 0.85; a.needs.social = clamp(a.needs.social + 0.1, 0, 1);
      if (!ate && rnd() < 0.3) a.sick = true; else if (a.sick && rnd() < 0.5) a.sick = false;
      Sim.updateMood(a);
    }
    // crime
    for (const a of L) {
      if (a.job === 'guard' || a.job === 'nightguard' || a.jailUntil > s.t) continue;
      const desperate = a.needs.hunger < 0.3 && a.money < 3;
      let p = (a.habit === 'thief' ? 0.25 : 0.01) * (1 - a.p.honesty) + (desperate ? 0.2 : 0);
      if (Vv.flags.crimeWave > 0) p *= 2;
      if (rnd() > p) continue;
      const shops = Sim.vshops(vid).filter(sh => sh.owner !== a.id); if (!shops.length) continue;
      const sh = pick(shops); const o = s.byId[sh.owner]; const amt = o ? Math.floor(Math.min(o.money * 0.12, 22)) : 0;
      if (o) { o.money -= amt; a.money += amt; }
      const crime = { id: 'x' + (s.nextId++), vid, type: 'theft', thief: a.id, place: sh.id, victim: sh.owner, item: amt + ' coins', t: s.t + 60 * 26, discovered: true, witnesses: [] };
      s.crimes.push(crime); a.stats.thefts++;
      const solved = rnd() < 0.3 * Vv.town.guardBudget;
      const guard = L.find(g => g.job === 'guard');
      if (solved && guard) {
        a.jailUntil = s.t + DAY + 600; a.jailHistory = (a.jailHistory || []).concat(crime.id);
        Sim.emit({ type: 'ARREST', vid, actor: guard.id, about: a.id, imp: 0.85, public: true, guilty: true, val: -0.3, text: guard.name + ' arrested ' + a.name + ' for the ' + Sim.placeName(sh.id) + ' theft.', truth: 'They really did it.' });
      } else Sim.emit({ type: 'THEFT_DISCOVERED', vid, actor: sh.owner, place: sh.id, imp: 0.7, public: true, val: -0.3, crimeId: crime.id, text: 'The ' + Sim.placeName(sh.id) + ' was robbed. ' + crime.item + ' missing.', truth: 'The thief was ' + a.name + '.' });
    }
    // construction progress
    const builders = L.filter(a => a.job === 'builder');
    for (const pr of s.projects.filter(p => !p.done && p.vid === vid)) {
      let budget = Math.round(builders.length * 0.7 * 60 * 7 / Math.max(1, s.projects.filter(p => !p.done && p.vid === vid).length));
      while (budget-- > 0 && pr.i < pr.blocks.length) {
        const [x, y, z, blk] = pr.blocks[pr.i]; const mm = MAT[blk];
        if (mm && (Vv.econ.stock[mm] || 0) < 1 && substitute(pr, mm, null)) continue;
        if (mm) { if ((Vv.econ.stock[mm] || 0) < 1) { pr.waiting = mm; break; } Vv.econ.stock[mm]--; const c = Sim.priceOf(mm, vid); pr.escrow -= c; Vv.town.treasury += c; }
        World.set(x, y, z, blk, { macro: true }); pr.i++;
        const b = pick(builders); if (b) { b.money += 0.32; b.stats.earned += 0.32; }
      }
      if (pr.i >= pr.blocks.length) finishProject(pr);
    }
    for (const a of L) { if (a.carry && Object.keys(a.carry).length) a.carry = {}; }
  }
  // the daily clockwork, in the order the minute model would run it
  const runHour = (hh) => {
    for (const v of World.VILLAGES) {
      Sim.useVillage(v.id);
      if (hh === 6) { Sim._priceDay(); Sim._dailyMoney(); Sim.composePaper(v.id); }
      if (hh === 7) { Sim._mayorPolicies(); Sim._findWork(); }
      if (hh === 20) {
        if (dayOf(s.t) === S().election.day) { for (const a of people(v.id)) if (a.jailUntil <= s.t && rnd() < 0.85) { a.voted = -1; s.t = s.t; Sim.castVote(a); } Sim._tallyElection(); }
      }
    }
  };
  const base = s.t - (s.t % DAY);
  s.t = base + 6 * 60; runHour(6);
  s.t = base + 7 * 60; runHour(7);
  s.t = base + 20 * 60; runHour(20);
  // relationships drift between neighbours who would have met
  for (const v of World.VILLAGES) {
    const L = people(v.id);
    for (let k = 0; k < L.length * 2; k++) {
      const a = pick(L), b = pick(L); if (a === b) continue;
      Sim.relAdj(a, b.id, 'familiarity', 1.5); Sim.relAdj(b, a.id, 'familiarity', 1.5);
      const c = 1 - Math.abs(a.p.agreeableness - b.p.agreeableness) - Math.abs(a.p.extraversion - b.p.extraversion) * 0.5;
      Sim.relAdj(a, b.id, 'affection', (c - 0.5) * 3); Sim.relAdj(b, a.id, 'affection', (c - 0.5) * 3);
      if (rnd() < 0.3) { const bel = Sim.bestShare(a, b); if (bel) Sim.transmit(a, b, bel, []); }
    }
  }
  s.t = base + DAY;
  Sim.summarize(); Sim._secretsCheck(); Sim._couples();
  Civ.daily();
  s.statsHist.push(Sim.worldStats()); if (s.statsHist.length > 60) s.statsHist.shift();
  // everyone wakes at home
  for (const a of s.agents) {
    if (a.left) continue;
    if (a.migrating) settle(a, a.migrating);
    const h = Sim.place(a.home, a.vid);
    if (h) { const sp = h.spots[0]; a.x = sp[0] + 0.5 + a.jx; a.z = sp[1] + 0.5 + a.jz; a.y = World.standAt(a.x, a.z); }
    a.path = null; a.convo = null; a.sleeping = true; a.trip = null;
    a.plan = { type: 'sleep', place: a.home, until: s.t + 6 * 60, arrived: true, reason: 'night', t0: s.t };
    a.thinkAt = s.t + 5 * 60 + rnd() * 120;
  }
  s.convos = {};
  s.coarse = false;
  void d0;
};

// catch up any gap: macro days for the bulk, fine minutes for the last hours
Civ.catchUp = function (minutes, onProgress) {
  const s = S();
  const before = s.events.length;
  const recordFrom = s.t;
  minutes = Math.max(0, minutes);
  const FINE = 6 * 60;
  let macro = Math.max(0, Math.floor((minutes - FINE) / DAY));
  macro = Math.min(macro, 2000);
  // align: run fine minutes until midnight, then whole macro days, then the rest fine
  let rest = minutes;
  if (macro > 0) {
    const toMidnight = DAY - (s.t % DAY);
    s.coarse = true;
    for (let m = 0; m < toMidnight; m += 5) Sim.advance(Math.min(5, toMidnight - m));
    s.coarse = false;
    rest -= toMidnight;
    for (let d = 0; d < macro && rest > FINE; d++) { Civ.macroDay(); rest -= DAY; if (onProgress && d % 10 === 0) onProgress(d / macro); }
  }
  s.coarse = true;
  for (let m = 0; m < rest; m += 3) Sim.advance(Math.min(3, rest - m));
  s.coarse = false;
  for (const a of s.agents) { if (a.left) continue; a.path = null; if (a.plan && a.plan.spot) { a.x = a.plan.spot[0] + 0.5 + a.jx; a.z = a.plan.spot[1] + 0.5 + a.jz; a.y = World.standAt(a.x, a.z); } a.thinkAt = Math.min(a.thinkAt, s.t + 5); }
  return s.events.slice(before).filter(e => e.t >= recordFrom);
};
})(typeof window !== 'undefined' ? window : globalThis);
