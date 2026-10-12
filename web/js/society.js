/* AI CRAFT \u2014 society.js
   Economy, jobs, crime and investigation, the Village Post, elections and mayor powers,
   construction, secrets, the player's social footprint, LLM prompt building + validation,
   persistence and offline catch-up. */
(function (root) {
'use strict';
const AV = root.AV = root.AV || {};
const World = root.World || require('./world.js');
const Sim = AV.Sim;
const B = World.B;
const { DAY, RI, clamp, pick } = Sim;
const rnd = Math.random;
const S = () => Sim.S();
const hourOf = Sim.hourOf, dayOf = Sim.dayOf;
const rel = (a, id) => Sim.rel(a, id), relAdj = (...x) => Sim.relAdj(...x);
const nameOf = (id, v) => Sim.nameOf(id, v), placeName = p => Sim.placeName(p);
const CLAIMS = Sim.CLAIMS;
const cap = s => Sim.cap(s);

// ============ economy (per village; the village context swaps S.town / S.econ / S.election) ============
const GOODS = ['food', 'wood', 'stone', 'iron', 'coal', 'clay', 'wool', 'gold'];
const BASE_PRICE = { food: 1.6, wood: 1.4, stone: 1.5, iron: 3.2, coal: 2.4, clay: 1.3, wool: 2.2, gold: 14 };
const TARGET = { food: 90, wood: 60, stone: 60, iron: 30, coal: 30, clay: 40, wool: 25, gold: 6 };
Sim.GOODS = GOODS; Sim.BASE_PRICE = BASE_PRICE; Sim.TARGET = TARGET;
const VSET = {
  highvale: { treasury: 380, elect: 3, stock: { food: 70, wood: 40, stone: 40, iron: 10, coal: 10, clay: 20, wool: 8, gold: 0 } },
  ironridge: { treasury: 560, elect: 4, stock: { food: 40, wood: 30, stone: 70, iron: 40, coal: 40, clay: 8, wool: 4, gold: 3 } },
  rivergate: { treasury: 450, elect: 5, stock: { food: 70, wood: 30, stone: 30, iron: 12, coal: 12, clay: 50, wool: 10, gold: 1 } },
  greenhollow: { treasury: 260, elect: 6, stock: { food: 110, wood: 60, stone: 20, iron: 6, coal: 6, clay: 10, wool: 30, gold: 0 } },
  ashfield: { treasury: 90, elect: 4, stock: { food: 25, wood: 25, stone: 40, iron: 4, coal: 4, clay: 4, wool: 2, gold: 0 } },
};
function priceOf(good, vid) {
  const V = vid ? S().villages[vid] : null; const E = V ? V.econ : S().econ;
  const st = E && E.stock ? (E.stock[good] || 0) : 0;
  const b = BASE_PRICE[good] || 2, t = TARGET[good] || 40;
  return clamp(b * Math.sqrt(t / (st + t * 0.12)), b * 0.35, b * 4.5) * (E && E.boom ? 1.15 : 1);
}
Sim.priceOf = priceOf;
Sim.initSociety = function () {
  const s = S();
  for (const V of World.VILLAGES) {
    const vid = V.id, cfg = VSET[vid];
    const people = s.agents.filter(a => a.vid === vid);
    const byJob = j => people.find(a => a.job === j);
    const owner = (j, fallback) => (byJob(j) || fallback || people.slice().sort((a, b) => b.money - a.money)[0]).id;
    const mayor = byJob('mayor') || people.sort((a, b) => b.p.ambition - a.p.ambition)[0];
    if (mayor.job !== 'mayor') { mayor.job = 'mayor'; mayor.work = Sim.vp('townhall', vid); }
    const merchant = vid === 'highvale' ? s.byId.ada : people.find(a => a.job === 'merchant' && !a.goals.some(g => g.type === 'OPEN_A_SHOP')) || byJob('merchant');
    const mk = (kind, name, own, open, stock, sells) => { const id = Sim.vp(kind, vid); if (!id) return; s.shops[id] = { id, vid, kind, name, owner: own, open, stock, sells }; };
    mk('bakery', 'Bakery', owner('baker'), [6, 19], { bread: 70 }, ['bread']);
    mk('store', 'General Store', owner('shopkeeper'), [8, 19], { bread: 16, tools: 4 }, ['bread', 'tools']);
    mk('market', 'Market Stalls', (merchant || mayor).id, [8, 18], { bread: 14, tools: 2 }, ['bread', 'tools']);
    mk('forge', 'Forge', owner('blacksmith'), [8, 18], { tools: 6 }, ['tools']);
    mk('tavern', (World.places[vid + '_tavern'] || {}).name || 'Tavern', owner('bartender'), [11, 24], { bread: 16 }, ['meal']);
    const challenger = people.find(a => a.id !== mayor.id && a.goals.some(g => g.type === 'BECOME_MAYOR')) || people.filter(a => a.id !== mayor.id).sort((a, b) => (b.p.ambition + b.v.power) - (a.p.ambition + a.v.power))[0];
    s.villages[vid] = {
      id: vid, name: V.name, theme: V.theme, color: V.color,
      town: { treasury: cfg.treasury, tax: vid === 'ashfield' ? 0.06 : 0.1, guardBudget: 1.0, subsidy: 0, mayor: mayor.id, missing: 0, pressure: 0, policyLog: [] },
      election: { day: cfg.elect, candidates: [mayor.id, challenger.id], votes: {}, history: [] },
      econ: { stock: Object.assign({}, cfg.stock), hist: [], sold: { bread: 0 }, baked: 0, baseBread: 0, produced: {}, prodDay: {}, wilted: [] },
      flags: { protestDay: -1, crimeWave: 0, drought: 0, harvest: 0, plague: 0, mineClosed: 0 },
      tier: 'Village', tierScore: 0, tech: 1, techPoints: 0, trust: 0, founded: 1, pop0: people.length,
    };
  }
  for (const V of World.VILLAGES) {
    Sim.useVillage(V.id);
    const E = s.econ;
    E.baseBread = Sim.breadPrice();
    E.hist.push({ day: 1, bread: +E.baseBread.toFixed(2), food: +priceOf('food').toFixed(2), iron: +priceOf('iron').toFixed(2), wood: +priceOf('wood').toFixed(2), stone: +priceOf('stone').toFixed(2), tools: +toolPrice(Sim.vp('forge')).toFixed(1), treasury: s.town.treasury });
  }
  Sim.useVillage('highvale');
  for (const a of s.agents) if (a.id !== 'henry' && a.vid === 'highvale') { relAdj(a, 'henry', 'affection', 12); relAdj(a, 'henry', 'trust', 4); relAdj(a, 'henry', 'respect', -6); }
  for (const a of s.agents) if (a.id !== 'ada' && a.vid === 'highvale') relAdj(a, 'ada', 'respect', 8);
  s.statsHist.push(Sim.worldStats());
};

function grainPrice() { return priceOf('food'); }
function orePrice() { return priceOf('iron'); }
function vshops(vid) { const s = S(); const v = vid || Sim.ctx(); const out = []; for (const id in s.shops) if (s.shops[id].vid === v) out.push(s.shops[id]); return out; }
Sim.vshops = vshops;
function totalBread(vid) { let n = 0; for (const sh of vshops(vid)) n += sh.stock.bread || 0; return n; }
function scarcity(vid) { const v = vid || Sim.ctx(); const pop = S().agents.filter(a => a.vid === v && !a.left).length || 1; return clamp((pop * 3.2 - totalBread(v)) / (pop * 3.2), 0, 1); }
function breadCost() { return grainPrice() / 2 + 0.7; }
function shopPrice(id, good) {
  const s = S(); const sh = s.shops[id]; if (!sh) return 99;
  if (sh.vid && sh.vid !== Sim.ctx()) { const keep = Sim.ctx(); Sim.useVillage(sh.vid); const r = shopPrice(id, good); Sim.useVillage(keep); return r; }
  const o = s.byId[sh.owner] || { p: { greed: 0.5, empathy: 0.5 } };
  if (good === 'bread' || good === 'meal') {
    const sc = scarcity();
    let mk = 1.25 + o.p.greed * 0.25 + sc * (o.p.greed * 1.0 - o.p.empathy * 0.6) + ((sh.stock.bread || 0) < 6 ? 0.2 : 0);
    if (sh.kind !== 'bakery') mk += 0.15;
    const p = breadCost() * Math.max(1.1, mk);
    return good === 'meal' ? p * 1.6 + 1 : p;
  }
  if (good === 'tools') return toolPrice(id);
  return 99;
}
function toolPrice(id) { const sh = S().shops[id]; const o = sh && S().byId[sh.owner] || { p: { greed: .5 } }; return (priceOf('iron') * 1.5 + priceOf('coal') + 5) * (1.2 + o.p.greed * 0.3) * (sh && sh.kind === 'forge' ? 1 : 1.12); }
Sim.grainPrice = grainPrice; Sim.orePrice = orePrice; Sim.shopPrice = shopPrice; Sim.totalBread = totalBread; Sim.scarcity = scarcity; Sim.toolPrice = toolPrice;
Sim.shopOpen = function (id, h) { const sh = S().shops[id]; if (!sh) return false; const o = S().byId[sh.owner]; if (!o || o.left) return false; return h >= sh.open[0] && h < sh.open[1]; };
Sim.breadPrice = function (vid) {
  const s = S(); const keep = Sim.ctx(); if (vid) Sim.useVillage(vid);
  let sum = 0, n = 0;
  for (const sh of vshops()) if (sh.sells.includes('bread')) { sum += shopPrice(sh.id, 'bread'); n++; }
  const r = (n ? sum / n : 3) * (1 - (s.town ? s.town.subsidy : 0));
  if (vid && keep) Sim.useVillage(keep);
  return r;
};
Sim.breadRatio = function (vid) { const s = S(); const E = vid ? s.villages[vid].econ : s.econ; return E.baseBread ? Sim.breadPrice(vid) / E.baseBread : 1; };

Sim.chooseSeller = function (a, good, h) {
  const s = S(); let best = null, bs = -1e9;
  const here = World.villageAt(a.x, a.z, 6) || a.vid;
  for (const id in s.shops) {
    const sh = s.shops[id];
    if (sh.vid !== a.vid && sh.vid !== here) continue;
    if (AV.Civ.isPlanned && AV.Civ.isPlanned(id)) continue; // not built yet
    const g = good === 'bread' ? (sh.sells.includes('bread') ? 'bread' : sh.sells.includes('meal') && h >= 11 ? 'meal' : null) : (sh.sells.includes(good) ? good : null);
    if (!g || !Sim.shopOpen(id, h)) continue;
    if ((sh.stock[g === 'meal' ? 'bread' : g] || 0) <= 0) continue;
    const pr = shopPrice(id, g) * (g === 'tools' ? 1 : 1 - (s.villages[sh.vid] ? s.villages[sh.vid].town.subsidy : 0));
    const pl = Sim.place(id);
    const d = pl ? Math.hypot(pl.center[0] - a.x, pl.center[1] - a.z) : 30;
    const fraud = a.beliefs.find(b => b.type === 'fraud' && b.about === sh.owner);
    let sc = -pr * (1 + clamp((40 - a.money) / 40, 0, 1)) - d / 22 + Sim.relScore(a, sh.owner) / 55 - (fraud ? fraud.conf * 2.2 : 0) + (g === 'meal' ? 0.6 + (1 - a.needs.social) : 0);
    if (sh.owner === a.id) sc += 2;
    if (sc > bs) { bs = sc; best = { id, price: pr, good: g }; }
  }
  return best;
};

function sell(a, shopId, good, qty) {
  const s = S(); const sh = s.shops[shopId]; if (!sh) return 0;
  const V = s.villages[sh.vid] || { town: s.town, econ: s.econ };
  const key = good === 'meal' ? 'bread' : good;
  const base = shopPrice(shopId, good);
  const paid = good === 'tools' ? base : base * (1 - V.town.subsidy);
  let n = 0;
  while (n < qty && (sh.stock[key] || 0) > 0 && a.money >= paid) {
    a.money -= paid; sh.stock[key]--; n++; if (AV.Civ.metric) AV.Civ.metric('tradeVolume', paid);
    const owner = s.byId[sh.owner]; if (owner) { owner.money += base; owner.stats.earned = (owner.stats.earned || 0) + base; }
    if (good !== 'tools') V.town.treasury -= base - paid;
    if (key === 'bread') V.econ.sold.bread++;
    if (sh.biz && s.businesses[sh.biz]) s.businesses[sh.biz].revenue += base;
  }
  if (good === 'bread') a.inv.bread += n;
  if (n && good === 'bread' && s.byId[sh.owner] && s.byId[sh.owner].habit === 'fraud' && rnd() < 0.015 + a.p.curiosity * 0.02) {
    const o = s.byId[sh.owner];
    const chain = Sim.newChain({ type: 'fraud', about: o.id, by: a.id, level: 0, truth: true, how: 'noticed' });
    Sim.addBelief(a, { type: 'fraud', about: o.id, level: 0, conf: 0.6, src: 'self', chain });
    Sim.remember(a, { text: 'The bread from ' + sh.name + ' tasted of chalk.', kind: 'noticed', about: o.id, imp: 0.5, val: -0.5 });
    Sim.setThought(a, 'This bread tastes of chalk...');
    Sim.emit({ type: 'FRAUD_NOTICED', actor: a.id, about: o.id, imp: 0.4, text: a.name + ' noticed chalk in bread from ' + sh.name + '.', truth: o.name + ' really does cut the flour.' });
  }
  return n;
}
Sim.sell = sell;

Sim.doEat = function (a, p) {
  const s = S();
  if (p.ration) {
    const V = s.villages[a.vid]; const E = V && V.econ;
    if (E && (E.stock.food || 0) >= 1) { E.stock.food -= 1; const c = Math.min(a.money, 1.2); a.money -= c; V.town.treasury += c; a.needs.hunger = clamp(a.needs.hunger + 0.5, 0, 1); a.lastAte = s.t; p.until = s.t + 20; if (AV.Civ.metric) AV.Civ.metric('tradeVolume', c); return; }
    p.until = s.t; a.lastFail = s.t; return;
  }
  if (p.shop) {
    const sh = s.shops[p.shop];
    if (sh && sh.sells.includes('meal')) {
      if (sell(a, p.shop, 'meal', 1)) { a.needs.hunger = clamp(a.needs.hunger + 0.62, 0, 1); a.needs.social = clamp(a.needs.social + 0.1, 0, 1); p.until = S().t + 35; a.lastAte = s.t; return; }
    } else {
      const want = clamp(Math.min(Math.floor(a.money / Math.max(0.5, shopPrice(p.shop, 'bread'))), 2 - a.inv.bread), 0, 2);
      sell(a, p.shop, 'bread', want);
    }
  }
  if (a.inv.bread > 0) { a.inv.bread--; a.needs.hunger = clamp(a.needs.hunger + 0.45, 0, 1); a.lastAte = s.t; p.until = s.t + 15; }
  else { p.until = s.t; a.lastFail = s.t; }
};
Sim.doBuy = function (a, shopId, item, qty) {
  const n = sell(a, shopId, item, qty);
  if (n && item === 'tools') { a.inv.tools++; a.toolHp = 1; }
  return n;
};

const PRODUCER = { farmer: 1, miner: 1, builder: 1, blacksmith: 1, woodcutter: 1, fisher: 1, shepherd: 1, potter: 1 };
Sim.workTick = function (a) {
  const s = S(), p = a.plan;
  const toolMult = PRODUCER[a.job] ? (a.toolHp > 0 ? 1 : 0.6) : 1;
  const em = 0.6 + 0.4 * a.needs.energy;
  if (PRODUCER[a.job]) { a.toolHp = Math.max(0, a.toolHp - 0.011 / 60); if (a.toolHp <= 0 && a.inv.tools > 0) { a.inv.tools = 0; Sim.setThought(a, 'My tools are done for.'); } }
  const m = Math.floor(s.t);
  const J = AV.JOBS[a.job];
  if (J && J.gather) { AV.Civ.gatherTick(a, toolMult * em); return; }
  const skill = k => AV.Civ.skillMult(a, k);
  switch (a.job) {
    case 'baker': {
      const sh = s.shops[Sim.vp('bakery')]; if (!sh) break; const owner = s.byId[sh.owner] || a;
      if (s.econ.stock.food >= 1 && sh.stock.bread < 120) {
        a.workAcc += 11 / 60 * em * skill('baking');
        while (a.workAcc >= 1 && s.econ.stock.food >= 1) { a.workAcc--; s.econ.stock.food--; const c = grainPrice() + 0.5; owner.money -= c; s.town.treasury += c; sh.stock.bread += 2; s.econ.baked = (s.econ.baked || 0) + 2; if (a !== owner) { owner.money -= 0.6; a.money += 0.6; } }
        AV.Civ.practice(a, 'baking');
      }
      break;
    }
    case 'blacksmith': {
      const sh = s.shops[Sim.vp('forge')]; if (!sh) break; const owner = s.byId[sh.owner] || a;
      if (s.econ.stock.iron >= 2 && s.econ.stock.coal >= 1 && sh.stock.tools < 14) {
        a.workAcc += 1 / 60 * em * toolMult * skill('smithing');
        while (a.workAcc >= 1 && s.econ.stock.iron >= 2 && s.econ.stock.coal >= 1) { a.workAcc--; s.econ.stock.iron -= 2; s.econ.stock.coal -= 1; const c = priceOf('iron') * 2 + priceOf('coal'); owner.money -= c; s.town.treasury += c; sh.stock.tools++; }
        AV.Civ.practice(a, 'smithing');
      } else if (m % 120 === 0) Sim.setThought(a, s.econ.stock.iron < 2 ? 'No iron in the storehouse. The forge is cold.' : 'No coal for the fire.');
      break;
    }
    case 'merchant': case 'shopkeeper': case 'bartender':
      if (m % 60 === 0) restock(a.job === 'bartender' ? Sim.vp('tavern') : a.job === 'shopkeeper' ? Sim.vp('store') : (a.shopId || Sim.vp('market')));
      if (a.job === 'merchant') AV.Civ.tradeTick(a);
      AV.Civ.practice(a, 'trade');
      break;
    case 'guard': case 'nightguard':
      if (m % 18 === 0 && !a.convo) {
        const pts = ['plaza', 'market', 'bakery', 'store', 'tavern', 'guard', 'forge', 'post', 'storehouse'];
        const pl = Sim.place(pick(pts));
        if (pl) { const e = pl.entry; a.plan.patrol = e; Sim.goTo(a, e[0], e[1]); }
      }
      AV.Civ.practice(a, 'investigation', 0.3);
      break;
    case 'builder': AV.Civ.buildTick(a); break;
    case 'transporter': AV.Civ.haulTick(a); break;
    case 'engineer': AV.Civ.roadTick(a); break;
    case 'banker': AV.Civ.practice(a, 'trade', 0.5); a.workedToday = Sim.dayOf(s.t); break;
    case 'teacher': AV.Civ.teachTick(a); break;
    case 'doctor': AV.Civ.practice(a, 'medicine', 0.4); break;
    case 'mayor': AV.Civ.practice(a, 'politics', 0.4); break;
    case 'journalist': AV.Civ.practice(a, 'writing', 0.5); break;
    default: break;
  }
};
Sim.goTo = function (a, x, z) {
  if (S().coarse) { a.x = x + 0.5; a.z = z + 0.5; a.path = null; return; }
  const p = World.findPath(a.x, a.z, x, z, 6000);
  if (p && p.length > 1) { a.path = p; a.pi = 1; }
};
function restock(shopId) {
  const s = S(); const sh = s.shops[shopId]; if (!sh) return;
  const owner = s.byId[sh.owner]; if (!owner) return;
  const bak = s.shops[Sim.vp('bakery', sh.vid)], forge = s.shops[Sim.vp('forge', sh.vid)];
  if (bak && (sh.sells.includes('bread') || sh.sells.includes('meal')) && shopId !== bak.id && (sh.stock.bread || 0) < 12 && bak.stock.bread > 20) {
    const n = Math.min(12, bak.stock.bread - 15); const unit = shopPrice(bak.id, 'bread') * 0.78;
    const can = Math.min(n, Math.floor(owner.money / unit));
    if (can > 0) { bak.stock.bread -= can; sh.stock.bread = (sh.stock.bread || 0) + can; owner.money -= can * unit; if (s.byId[bak.owner]) s.byId[bak.owner].money += can * unit; }
  }
  if (forge && sh.sells.includes('tools') && shopId !== forge.id && (sh.stock.tools || 0) < 3 && forge.stock.tools > 3) {
    const unit = toolPrice(forge.id) * 0.8;
    if (owner.money > unit * 2) { forge.stock.tools -= 2; sh.stock.tools = (sh.stock.tools || 0) + 2; owner.money -= unit * 2; if (s.byId[forge.owner]) s.byId[forge.owner].money += unit * 2; }
  }
}
Sim.restock = restock;

Sim.tavernTick = function (a) {
  const s = S();
  const sh = s.shops[Sim.vp('tavern')]; const o = sh && s.byId[sh.owner];
  if (!o || a.id === o.id || a.money < 5 || rnd() > 1 / 50) return;
  a.money -= 2; if (!o.left) o.money += 2;
  a.needs.social = clamp(a.needs.social + 0.05, 0, 1); a.mood = clamp(a.mood + 0.03, -1, 1);
  if (a.secrets.some(x => s.secrets[x].type === 'gambling') && rnd() < 0.15) { const lost = Math.min(a.money, 6); a.money -= lost; o.money += lost; Sim.setThought(a, 'One more hand. I will win it back.'); }
};

Sim.clinicTick = function (a) {
  const s = S();
  const clinic = Sim.vp('clinic');
  const doc = s.agents.find(d => d.job === 'doctor' && !d.left && d.vid === a.vid && d.plan && d.plan.type === 'work' && d.plan.arrived && d.plan.place === clinic);
  a.clinicMins = (a.clinicMins || 0) + 1;
  if ((doc && a.clinicMins > 25 / AV.Civ.skillMult(doc, 'medicine')) || a.clinicMins > 360) {
    const fee = 6;
    if (doc) {
      if (a.money >= fee + 8 || doc.p.empathy < 0.7) { const f = Math.min(fee, a.money); a.money -= f; doc.money += f; }
      else {
        Sim.remember(a, { text: doc.name + ' treated me for free.', kind: 'helped_me', about: doc.id, actor: doc.id, imp: 0.7, val: 0.8 });
        relAdj(a, doc.id, 'trust', 8); relAdj(a, doc.id, 'affection', 10);
        Sim.addBelief(a, { type: 'helped', about: doc.id, other: a.id, level: 1, conf: 0.9, src: 'self', chain: Sim.newChain({ type: 'helped', about: doc.id, other: a.id, by: a.id, level: 1, truth: true }) }, null, true);
      }
      AV.Civ.practice(doc, 'medicine', 3);
    }
    a.sick = false; a.injured = false; a.clinicMins = 0; a.needs.hunger = Math.max(a.needs.hunger, 0.35);
    a.plan.until = s.t;
    Sim.remember(a, { text: 'I recovered at the clinic.', kind: 'healed', imp: 0.4, val: 0.4 });
  }
};

// ============ goals \u2192 candidates ============
Sim.goalCandidates = function (a, h, add, work, night) {
  const s = S();
  const day = dayOf(s.t);
  const cands = s.election.candidates;
  // civic: vote on election day
  if (day === s.election.day && h >= 9 && h < 19.5 && a.voted !== day && a.jailUntil <= s.t) add('vote', 2.2 + a.v.community * 0.6 + (a.p.laziness < 0.8 ? 0.4 : -0.6), { place: Sim.vp('townhall'), reason: 'election day' });
  // campaigning
  if (cands.includes(a.id) && !night && h >= 9.5 && h < 20 && day <= s.election.day) {
    const soon = s.election.day - day <= 1 ? 0.6 : 0;
    add('campaign', a.p.ambition * 1.7 + soon - (work ? 0.25 : 0) - (a.p.laziness * 0.6), { place: Sim.vp(h >= 17.5 ? 'tavern' : pick(['plaza', 'market', 'plaza'])), reason: 'campaigning for mayor', thought: 'Votes do not win themselves.' });
    // win over influencers
    const ally = a.goals.find(g => g.type === 'WIN_ALLY');
    const tgt = ally ? s.byId[ally.target] : s.agents.find(o => o.vid === a.vid && o.job === 'journalist' && !o.left);
    if (tgt && !tgt.left && !(tgt.support[a.id] > 0.7) && tgt.id !== a.id) add('talk_to', 1.1 + a.p.ambition, { target: tgt.id, intent: 'campaign', reason: tgt.name + ' influences public opinion', thought: tgt.name + ' could help my campaign.' });
  }
  for (const g of a.goals) {
    switch (g.type) {
      case 'PROTECT_VILLAGE':
        if (h >= 20.5 && h < 23 && rnd() < 0.5) {
          const sus = a.beliefs.filter(b => b.type === 'theft' && b.conf > 0.3).sort((x, y) => y.conf - x.conf)[0];
          if (sus && s.byId[sus.about] && !s.byId[sus.about].left) add('follow', 2.9 + a.p.neuroticism, { target: sus.about, intent: 'follow', until: s.t + 90, reason: 'keeping an eye on ' + nameOf(sus.about), thought: 'Where are you going, ' + nameOf(sus.about) + '?' });
        }
        break;
      case 'EXPOSE_CORRUPTION':
        if (work && s.town.missing > 25 && !a.beliefs.some(b => b.type === 'corrupt' && b.conf > 0.5) && rnd() < 0.35) add('investigate', 2.5, { place: Sim.vp('townhall'), step: 'audit', reason: 'the treasury numbers do not add up' });
        break;
      case 'FIND_A_PARTNER': {
        if (h >= 17 && h < 22) {
          let best = g.target && s.byId[g.target] && !s.byId[g.target].left ? g.target : null;
          if (!best) { let bv = 25; for (const id in a.rel) if (s.byId[id] && a.rel[id][RI.attraction] > bv) { bv = a.rel[id][RI.attraction]; best = id; } }
          if (best && !s.byId[best].sleeping) add('talk_to', 0.9 + rel(a, best)[RI.attraction] / 90, { target: best, intent: 'chat', reason: 'wants to see ' + nameOf(best), thought: 'Maybe today I say something.' });
        }
        break;
      }
      case 'KEEP_PEACE': {
        if (!night && rnd() < 0.3) {
          const feud = s.agents.find(x => !x.left && x.vid === a.vid && Object.keys(x.rel).some(y => s.byId[y] && x.rel[y][RI.resentment] > 55 && s.byId[y].rel[x.id] && s.byId[y].rel[x.id][RI.resentment] > 45));
          if (feud) { const other = Object.keys(feud.rel).find(y => s.byId[y] && feud.rel[y][RI.resentment] > 55); add('mediate', 1.3 + a.p.empathy, { target: feud.id, intent: 'mediate', pair: [feud.id, other], reason: 'settle the feud between ' + feud.name + ' and ' + nameOf(other) }); }
        }
        break;
      }
      case 'BEAT_RIVAL':
      case 'AVENGE': {
        const rv = g.target; const R = s.byId[rv]; if (!R || R.left || night) break;
        if (rnd() < 0.25) {
          let bel = a.beliefs.filter(b => b.about === rv && CLAIMS[b.type].val < 0 && b.conf > 0.3).sort((x, y) => y.conf - x.conf)[0];
          if (!bel && a.p.honesty < 0.5 && rnd() < 0.5) {
            // fabricate
            const type = R.job === 'mayor' ? 'ineffective' : R.job === 'merchant' || R.job === 'shopkeeper' ? 'fraud' : 'liar';
            const chain = Sim.newChain({ type, about: rv, by: a.id, level: 0, truth: false, how: 'invented' });
            bel = Sim.addBelief(a, { type, about: rv, level: 0, conf: 0.7, src: 'self', chain, fabricated: true }, null, true);
            Sim.emit({ type: 'RUMOR_CREATED', actor: a.id, about: rv, chain, imp: 0.55, text: a.name + ' made up a rumor that ' + Sim.claimText(bel, 0) + '.', truth: 'It is not true.' });
          }
          if (bel) {
            const lis = s.agents.filter(o => o !== a && o.id !== rv && !o.left && !o.sleeping && Math.hypot(o.x - a.x, o.z - a.z) < 35);
            if (lis.length) add('gossip', 1.4 + (1 - a.p.honesty), { target: pick(lis).id, belief: bel.id, intent: 'gossip', reason: 'undermining ' + R.name, thought: R.name + ' has it coming.' });
          }
        }
        break;
      }
      case 'BREAK_A_BIG_STORY': {
        if (!work) break;
        const open = s.cases.find(c => c.status === 'open' && c.vid === a.vid);
        if (open && rnd() < 0.4) {
          const src = s.agents.filter(o => o !== a && !o.left && !o.sleeping && o.beliefs.some(b => b.place === open.place && b.type === 'theft'));
          if (src.length) add('talk_to', 2.0, { target: pick(src).id, intent: 'probe', reason: 'chasing the ' + placeName(open.place) + ' story', thought: 'Somebody knows something.' });
          else add('visit', 1.6, { place: open.place, reason: 'looking at the scene of the ' + placeName(open.place) + ' theft' });
        }
        break;
      }
      case 'FIND_WORK': break;
      case 'BECOME_POPULAR': break;
    }
  }
  // report a crime you saw
  const seen = a.beliefs.find(b => b.type === 'theft' && b.level >= 2 && b.src === 'witness' && !b.reported);
  if (seen && !night && a.p.courage + a.p.honesty + (rel(a, seen.about)[RI.trust] < 0 ? 0.3 : 0) > 0.75 && !(rel(a, seen.about)[RI.affection] > 45) && !Sim.isPlayer(seen.about)) {
    const g = s.agents.filter(o => (o.job === 'guard' || o.job === 'nightguard') && o.vid === a.vid && !o.left && !o.sleeping).sort((x, y) => Math.hypot(x.x - a.x, x.z - a.z) - Math.hypot(y.x - a.x, y.z - a.z))[0];
    if (g && g !== a) { add('gossip', 2.7, { target: g.id, belief: seen.id, intent: 'gossip', reason: 'reporting what I saw to ' + g.name, thought: 'The guard needs to know.' }); seen.reported = true; }
  }
  // guards investigate open cases
  if ((a.job === 'guard' || a.job === 'nightguard') && work) {
    const c = s.cases.filter(c => c.status === 'open' && c.vid === a.vid).sort((x, y) => x.opened - y.opened)[0];
    if (c) {
      if (!c.scene) add('investigate', 2.6 + a.p.conscientiousness, { place: c.place, step: 'scene', caseId: c.id, reason: 'examining the ' + placeName(c.place) });
      else {
        const who = nextInterviewee(c, a);
        if (who) add('investigate', 2.4 + a.p.conscientiousness, { target: who, step: 'interview', intent: 'testimony', caseId: c.id, reason: 'questioning ' + nameOf(who) + ' about the ' + placeName(c.place) });
      }
    }
  }
  // protest
  const ratio = Sim.breadRatio();
  if (ratio > 1.3 && h >= 10 && h < 17 && (a.money < 20 || a.v.community > 0.7) && a.p.courage > 0.45 && a.mood < 0.15 && a.id !== s.town.mayor)
    add('protest', (ratio - 1) * 2.4 * a.p.courage + (rel(a, s.town.mayor)[RI.resentment] > 30 ? 0.4 : 0), { place: Sim.vp('townhall'), reason: 'bread costs ' + Sim.breadPrice().toFixed(1) + ' coins' });
  AV.Civ.goalCandidates(a, h, add, work, night);
  // repay debts
  if (a.debt > 0 && a.money > a.debt * 0.5 + 40 && !night && rnd() < 0.2) { const pay = Math.min(a.debt, 25); a.debt -= pay; a.money -= pay; const cr = s.byId.nora; if (cr) cr.money += pay; }
};

function nextInterviewee(c, guard) {
  const s = S();
  const pl = Sim.place(c.place);
  const cand = [];
  const sh = s.shops[c.place]; if (sh && sh.owner) cand.push(sh.owner);
  for (const b of guard.beliefs) if (b.place === c.place && b.type === 'theft') { if (b.src && s.byId[b.src]) cand.push(b.src); cand.push(b.about); }
  for (const e of c.evidence) cand.push(e.suspect);
  if (pl) {
    const near = s.agents.filter(o => !o.left && o.vid === c.vid).map(o => { const h = World.places[o.home]; return [o.id, h ? Math.hypot(h.center[0] - pl.center[0], h.center[1] - pl.center[1]) : 99]; }).sort((x, y) => x[1] - y[1]).slice(0, 3).map(x => x[0]);
    cand.push(...near);
  }
  cand.push(pick(s.agents).id);
  return cand.find(id => id && id !== guard.id && s.byId[id] && !s.byId[id].left && !s.byId[id].sleeping && s.byId[id].jailUntil <= s.t && !c.interviewed.includes(id));
}

Sim.investigateArrive = function (a, p) {
  const s = S();
  if (p.step === 'scene') {
    const c = s.cases.find(x => x.id === p.caseId); if (!c) return;
    c.scene = true; p.until = s.t + 20;
    const crime = s.crimes.find(x => x.id === c.crimeId);
    if (crime && rnd() < 0.22 + 0.2 * s.town.guardBudget) {
      const clue = pick(['flour dust on a sleeve that matches', 'a boot print that fits', 'a dropped coin pouch that belongs to', 'a torn scrap of cloth from the coat of']);
      c.evidence.push({ suspect: crime.thief, w: 0.6, src: 'scene', note: clue + ' ' + nameOf(crime.thief) });
      Sim.setThought(a, 'Interesting. ' + cap(clue) + ' ' + nameOf(crime.thief) + '.');
      Sim.emit({ type: 'EVIDENCE_FOUND', actor: a.id, about: crime.thief, imp: 0.5, x: a.x, z: a.z, text: a.name + ' found ' + clue + ' ' + nameOf(crime.thief) + ' at the ' + placeName(c.place) + '.' });
    } else Sim.setThought(a, 'Nothing obvious. Someone was careful.');
    evaluateCase(c, a);
  } else if (p.step === 'audit') {
    p.until = s.t + 40;
    const mayor = s.byId[s.town.mayor];
    if (mayor && mayor.habit === 'embezzle' && rnd() < clamp(s.town.missing / 140, 0.1, 0.65) * (0.5 + a.p.curiosity * 0.5)) {
      const sid = mayor.secrets.find(x => s.secrets[x].type === 'embezzle');
      const chain = Sim.newChain({ type: 'corrupt', about: mayor.id, by: a.id, level: 2, truth: true, how: 'audit' });
      Sim.addBelief(a, { type: 'corrupt', about: mayor.id, level: 2, conf: 0.7, src: 'self', chain });
      if (sid && !s.secrets[sid].knownBy.includes(a.id)) s.secrets[sid].knownBy.push(a.id);
      Sim.setThought(a, Math.round(s.town.missing) + ' coins are missing from the treasury. This is the story.');
      Sim.remember(a, { text: 'The treasury ledger is short by ' + Math.round(s.town.missing) + ' coins.', kind: 'discovery', about: mayor.id, imp: 0.9, val: -0.4 });
      Sim.emit({ type: 'CORRUPTION_FOUND', actor: a.id, about: mayor.id, imp: 0.8, x: a.x, z: a.z, text: a.name + ' found ' + Math.round(s.town.missing) + ' coins missing from the treasury ledger.', truth: mayor.name + ' has been skimming it.' });
    } else Sim.setThought(a, 'The ledger looks clean. For now.');
  }
};

// testimony during an interview
Sim.interview = function (g, b, payload, L) {
  const s = S();
  const say = (who, t) => L.push({ who: who.id, text: t });
  const c = s.cases.find(x => x.id === payload.caseId);
  if (!c) { say(g, 'Never mind.'); return true; }
  const crime = s.crimes.find(x => x.id === c.crimeId);
  c.interviewed.push(b.id);
  say(g, 'About the ' + placeName(c.place) + ' the other night. What did you see?');
  const trustW = (rel(g, b.id)[RI.trust] + 60) / 120;
  if (crime && crime.thief === b.id) {
    say(b, Sim.line(b, 'deny', {}) || 'I was home asleep.');
    if (rnd() < (1 - b.p.honesty) * 0.85) {
      const sc = Object.keys(b.rel).filter(id => s.byId[id] && !s.byId[id].left && id !== b.id && id !== g.id).sort((x, y) => (b.rel[y][RI.resentment] - b.rel[y][RI.trust]) - (b.rel[x][RI.resentment] - b.rel[x][RI.trust]))[0];
      if (sc) {
        say(b, 'But I did see ' + nameOf(sc) + ' hanging around there.');
        c.evidence.push({ suspect: sc, w: 0.45 * trustW, src: b.id, false: true, note: b.name + ' says they saw ' + nameOf(sc) + ' nearby' });
        const chain = Sim.newChain({ type: 'theft', about: sc, place: c.place, by: b.id, level: 0, truth: false, how: 'deflection' });
        Sim.addBelief(g, { type: 'theft', about: sc, place: c.place, level: 0, conf: 0.4 * trustW, src: b.id, chain });
        Sim.setThought(b, 'Better ' + nameOf(sc) + ' than me.');
        Sim.emit({ type: 'FALSE_TESTIMONY', actor: b.id, about: sc, imp: 0.6, x: b.x, z: b.z, text: b.name + ' told ' + g.name + ' they saw ' + nameOf(sc) + ' near the ' + placeName(c.place) + '.', truth: 'A lie, to cover their own theft.' });
      }
    }
    if (rnd() < g.p.neuroticism * 0.5) c.evidence.push({ suspect: b.id, w: 0.2, src: g.id, note: g.name + ' found ' + b.name + ' nervous' });
    evaluateCase(c, g);
    return true;
  }
  const bels = b.beliefs.filter(x => x.type === 'theft' && x.place === c.place && x.conf > 0.15 && x.about !== b.id);
  if (!bels.length) {
    if (b.id === (s.shops[c.place] || {}).owner) say(b, 'I locked up as usual. In the morning, it was gone.');
    else say(b, pick(['I did not see anything.', 'I was asleep. Sorry.', 'No idea.']));
    if (b.jailHistory && b.jailHistory.length) c.evidence.push({ suspect: b.id, w: 0.08, src: g.id, note: 'has a record' });
    evaluateCase(c, g);
    return true;
  }
  const lw = [0.35, 0.5, 0.75, 1];
  for (const bel of bels.slice(0, 2)) {
    const seen = bel.src === 'witness';
    say(b, seen ? (bel.level >= 3 ? 'I saw ' + nameOf(bel.about) + ' do it. With my own eyes.' : 'I saw ' + nameOf(bel.about) + ' near there, late.') : 'People say ' + Sim.claimText(bel, bel.level) + '.');
    c.evidence.push({ suspect: bel.about, w: bel.conf * lw[bel.level] * trustW * (seen ? 1.2 : 0.6), src: b.id, note: b.name + (seen ? ' saw ' : ' heard ') + Sim.claimText(bel, bel.level) });
    Sim.addBelief(g, { type: 'theft', about: bel.about, place: c.place, level: bel.level, conf: bel.conf * trustW * 0.8, src: b.id, chain: bel.chain, hops: (bel.hops || 0) + 1 });
  }
  say(g, pick(['Noted.', 'That is helpful.', 'I will remember that.']));
  evaluateCase(c, g);
  return true;
};

function evaluateCase(c, g) {
  const s = S();
  if (c.status !== 'open') return;
  const sc = {};
  for (const e of c.evidence) sc[e.suspect] = (sc[e.suspect] || 0) + e.w;
  for (const b of g.beliefs) if (b.type === 'theft' && b.place === c.place) sc[b.about] = (sc[b.about] || 0) + b.conf * 0.3;
  for (const id in sc) {
    const r = rel(g, id);
    if (r[RI.trust] < 0) sc[id] += (-r[RI.trust] / 100) * g.p.neuroticism * 0.4;
    if (s.byId[id] && s.byId[id].left) delete sc[id];
    // the guard is wary of arresting the same person again so soon
    else if (s.byId[id] && s.byId[id].lastArrest && s.t - s.byId[id].lastArrest < 4 * DAY) delete sc[id];
    else if (s.byId[id] && s.byId[id].wrongArrests) sc[id] *= Math.pow(0.6, s.byId[id].wrongArrests);
  }
  delete sc[g.id];
  const ranked = Object.entries(sc).sort((x, y) => y[1] - x[1]);
  c.scores = ranked.slice(0, 4).map(([id, v]) => [id, Math.round(v * 100) / 100]);
  const thr = 0.88 - (s.town.guardBudget - 1) * 0.25 - g.p.neuroticism * 0.15;
  const impatient = c.interviewed.length >= 7;
  if (ranked.length && (ranked[0][1] >= thr || (impatient && ranked[0][1] >= thr * 0.7)) && (c.interviewed.length >= 2 || c.evidence.length >= 2) && (ranked.length < 2 || ranked[0][1] - ranked[1][1] > 0.12)) arrest(ranked[0][0], c, g);
  else if (c.interviewed.length >= 10) { c.status = 'cold'; Sim.emit({ type: 'CASE_COLD', place: c.place, imp: 0.5, public: true, text: g.name + ' gave up on the ' + placeName(c.place) + ' theft.', truth: 'The thief was ' + nameOf((s.crimes.find(x => x.id === c.crimeId) || {}).thief) + '.' }); }
}

function arrest(id, c, g) {
  const s = S(); const sus = s.byId[id]; if (!sus) return;
  const crime = s.crimes.find(x => x.id === c.crimeId);
  c.status = 'solved'; c.accused = id; c.closed = s.t; c.guard = g.id;
  const guilty = crime && crime.thief === id;
  c.correct = guilty;
  sus.jailUntil = s.t + 900; sus.jailed = true; sus.lastArrest = s.t; sus.jailHistory = (sus.jailHistory || []).concat(c.id).slice(-6);
  const fine = Math.min(15, Math.max(0, Math.floor(sus.money)));
  sus.money -= fine; const vic = crime && s.byId[crime.victim]; if (vic) vic.money += fine;
  sus.plan = null; Sim.chooseAndGo(sus);
  relAdj(sus, g.id, 'resentment', guilty ? 25 : 50); relAdj(sus, g.id, 'trust', -30);
  Sim.remember(sus, { text: g.name + ' arrested me for the ' + placeName(c.place) + ' theft.' + (guilty ? '' : ' I did not do it.'), kind: 'arrested', about: g.id, actor: g.id, imp: 1, val: -1 });
  Sim.setThought(sus, guilty ? 'Caught. Somebody talked.' : 'I did not do this. Someone set me up.');
  Sim.setThought(g, 'Case closed.');
  const chain = Sim.newChain({ type: 'arrested', about: id, place: c.place, by: g.id, level: 0, truth: true, how: 'arrest' });
  const truthTxt = guilty ? 'They really did it.' : 'Wrong person. The real thief was ' + nameOf(crime && crime.thief) + '.';
  if (!guilty) s.flags.falseArrests = (s.flags.falseArrests || 0) + 1;
  Sim.emit({ type: 'ARREST', actor: g.id, about: id, imp: 0.9, x: sus.x, z: sus.z, public: true, guilty, val: -0.3,
    text: g.name + ' arrested ' + sus.name + ' for the ' + placeName(c.place) + ' theft.', truth: truthTxt }, (a) => {
    if (a.id === id) return;
    const r = rel(a, id);
    const friend = r[RI.trust] > 38 || r[RI.affection] > 45 || a.family.includes(id);
    const tg = (rel(a, g.id)[RI.trust] + 60) / 120;
    if (friend) {
      Sim.remember(a, { text: sus.name + ' was arrested. I do not believe it.', kind: 'arrest', about: id, imp: 0.6, val: -0.5 });
      relAdj(a, g.id, 'trust', -6);
      Sim.addBelief(a, { type: 'innocent', about: id, place: c.place, level: 0, conf: 0.5, src: 'self', chain: Sim.newChain({ type: 'innocent', about: id, place: c.place, by: a.id, level: 0, truth: !guilty, how: 'loyalty' }) }, null, true);
    } else {
      Sim.addBelief(a, { type: 'arrested', about: id, place: c.place, level: 0, conf: clamp(0.5 + tg * 0.4, 0.2, 0.9), src: 'news', chain });
      Sim.remember(a, { text: sus.name + ' was arrested for the ' + placeName(c.place) + ' theft.', kind: 'arrest', about: id, imp: 0.55, val: -0.2 });
    }
  });
  // an earlier innocent arrest gets overturned when the real thief is caught for the same place
  if (guilty) {
    for (const old of s.cases) {
      const oc = s.crimes.find(x => x.id === old.crimeId);
      if (old !== c && old.status === 'solved' && !old.correct && oc && oc.thief === id && !old.overturned) {
        old.overturned = true;
        const inn = s.byId[old.accused]; if (!inn) continue;
        Sim.emit({ type: 'CLEARED', actor: id, about: inn.id, imp: 0.95, public: true, val: 0.3, text: inn.name + ' was cleared: ' + sus.name + ' was behind the ' + placeName(old.place) + ' theft all along.' }, (a) => {
          Sim.addBelief(a, { type: 'innocent', about: inn.id, place: old.place, level: 0, conf: 0.8, src: 'news', chain: Sim.newChain({ type: 'innocent', about: inn.id, place: old.place, by: g.id, level: 0, truth: true, how: 'overturned' }) });
          const ab = a.beliefs.find(b => b.about === inn.id && (b.type === 'theft' || b.type === 'arrested')); if (ab) ab.conf *= 0.2;
          if (a.id !== inn.id) relAdj(a, old.guard || g.id, 'trust', -4);
        });
        relAdj(inn, old.guard, 'resentment', 10);
      }
    }
  }
}

Sim.crimeCandidates = function (a, h, add, night) {
  const s = S();
  if (!(h >= 20.5 || h < 3)) return;
  if (a.jailUntil > s.t || a.job === 'guard' || a.job === 'nightguard') return;
  const d = dayOf(s.t - 4 * 60);
  if (a.crimeDay !== d) {
    a.crimeDay = d;
    const desperate = a.needs.hunger < 0.4 && a.money < Sim.breadPrice() && a.inv.bread === 0;
    const tempt = (1 - a.p.honesty) * a.p.greed;
    let p = a.habit === 'thief' ? tempt * 0.6 + 0.1 : tempt * 0.08;
    if (desperate) p += 0.45 * (1 - a.p.honesty * 0.5);
    p *= (0.55 + a.p.riskTolerance * 0.6) * (1.25 - s.town.guardBudget * 0.3);
    if (a.lastTheft && s.t - a.lastTheft < 2 * DAY) p *= 0.3;
    if (a.beliefs.some(b => b.type === 'arrested' && b.about === a.id)) p *= 0.5;
    a.crimeTonight = rnd() < p ? (desperate ? 'food' : 'loot') : null;
  }
  if (!a.crimeTonight) return;
  // choose a target
  const targets = [];
  for (const id in s.shops) {
    const sh = s.shops[id]; if (sh.owner === a.id || sh.vid !== a.vid) continue;
    const o = s.byId[sh.owner];
    const v = a.crimeTonight === 'food' ? (sh.stock.bread || 0) : (o ? o.money : 0) * 0.15 + (sh.stock.bread || 0) * 0.2;
    const pl = Sim.place(id);
    const guards = s.agents.filter(g => (g.job === 'guard' || g.job === 'nightguard') && !g.sleeping && pl && Math.hypot(g.x - pl.center[0], g.z - pl.center[1]) < 15).length;
    targets.push({ id, v: v - guards * 10 - (o ? Math.max(0, Sim.relScore(a, o.id)) / 10 : 0) });
  }
  targets.sort((x, y) => y.v - x.v);
  if (!targets.length || targets[0].v <= 0) return;
  const tgt = targets[0].id;
  const pl = Sim.place(tgt);
  const now = hourOf(s.t);
  const wait = now >= 20.5 ? s.t + (24 - now) * 60 + 30 + rnd() * 120 : s.t + 10;
  const hs = World.places[a.home]; const homeSpot = hs ? hs.spots[0] : pl.entry;
  add('steal', 5, { place: tgt, spot: homeSpot, entry: pl.entry, stage: 'wait', lurk: true, waitUntil: wait, until: wait + 120, reason: a.crimeTonight === 'food' ? 'starving, no money' : 'the till is full and nobody is watching', thought: 'Nobody is watching. Now.' });
  a.crimeTonight = null;
};

Sim.attemptTheft = function (a, p) {
  const s = S();
  if (s.t < p.waitUntil || p.stage !== 'lurk') { p.arrived = false; p.lurk = true; p.until = p.waitUntil + 60; return; }
  const pl = Sim.place(p.place);
  const eyes = s.agents.filter(o => o !== a && !o.left && !o.sleeping && Math.hypot(o.x - a.x, o.z - a.z) < 6 && World.los(o.x, o.y + 1.6, o.z, a.x, a.y + 1.2, a.z));
  if (eyes.length && rnd() < 0.6) { Sim.setThought(a, 'Too many eyes. Not tonight.'); return; }
  const sh = s.shops[p.place]; const owner = sh && s.byId[sh.owner];
  let item = '', amount = 0;
  if ((a.needs.hunger < 0.4 || rnd() < 0.4) && sh && (sh.stock.bread || 0) > 0) { amount = Math.min(sh.stock.bread, 3 + Math.floor(rnd() * 5)); sh.stock.bread -= amount; a.inv.bread += amount; item = amount + ' loaves'; }
  else if (owner) { amount = Math.floor(Math.min(owner.money * 0.15, 28)); if (amount <= 0) return; owner.money -= amount; a.money += amount; item = amount + ' coins'; }
  if (!item) return;
  const crime = { id: 'x' + (s.nextId++), vid: a.vid, type: 'theft', thief: a.id, place: p.place, victim: sh ? sh.owner : null, item, t: s.t, discovered: false };
  s.crimes.push(crime);
  a.lastTheft = s.t; a.stats.thefts++;
  const chain = Sim.newChain({ type: 'theft', about: a.id, place: p.place, by: 'witness', level: 3, truth: true, how: 'witnessed' });
  crime.chain = chain;
  let witnessed = [];
  Sim.emit({ type: 'ITEM_STOLEN', actor: a.id, about: a.id, place: p.place, imp: 0.7, x: a.x, z: a.z, heat: 'crime', radius: 14, crimeId: crime.id,
    text: a.name + ' stole ' + item + ' from the ' + placeName(p.place) + '.', secretive: true }, (w, d) => {
    const lit = World.lightAt(a.x, a.y + 1, a.z) > 0.3;
    if (d < (lit ? 9 : 5)) {
      Sim.addBelief(w, { type: 'theft', about: a.id, place: p.place, level: 3, conf: 0.9, src: 'witness', chain });
      Sim.remember(w, { text: 'I saw ' + a.name + ' steal from the ' + placeName(p.place) + '!', kind: 'saw_crime', about: a.id, imp: 0.9, val: -0.8 });
      Sim.setThought(w, 'Was that ' + a.name + '?!');
    } else {
      Sim.addBelief(w, { type: 'theft', about: a.id, place: p.place, level: 0, conf: 0.6, src: 'witness', chain });
      Sim.remember(w, { text: 'I saw ' + a.name + ' near the ' + placeName(p.place) + ' late at night.', kind: 'saw_lurk', about: a.id, imp: 0.5, val: -0.2 });
    }
    w.needs.safety -= 0.12;
    witnessed.push(w.name);
    if (s.rumors[chain]) s.rumors[chain].hops.push({ from: 'event', to: w.id, t: s.t, level: d < 9 ? 3 : 0, conf: 0.8, cat: 'witness' });
  });
  crime.witnesses = witnessed;
  Sim.setThought(a, witnessed.length ? 'Did ' + witnessed[0] + ' see me?' : 'Nobody saw me.');
  Sim.remember(a, { text: 'I took ' + item + ' from the ' + placeName(p.place) + '.' + (witnessed.length ? ' ' + witnessed[0] + ' may have seen.' : ''), kind: 'stole', about: a.id, imp: 0.8, val: 0.2 });
  if (a.secrets.length) { const sid = a.secrets.find(x => s.secrets[x].type === 'theft'); if (sid) witnessed.forEach(n => { const w = s.agents.find(z => z.name === n); if (w && !s.secrets[sid].knownBy.includes(w.id)) s.secrets[sid].knownBy.push(w.id); }); }
};

// lurkers get noticed while waiting
function lurkTick(a) {
  const s = S(), p = a.plan;
  if (!p || p.type !== 'steal' || !p.lurk) return;
  const e = p.entry || ((Sim.place(p.place)) || {}).entry;
  if (!e) { p.until = s.t; return; }
  if (p.stage === 'wait') { if (s.t >= p.waitUntil - 25) { p.stage = 'go'; if (s.coarse) { a.x = e[0] + 0.5; a.z = e[1] + 0.5; } else Sim.goTo(a, e[0], e[1]); } return; }
  const near = Math.hypot(a.x - e[0] - 0.5, a.z - e[1] - 0.5) < 2.5;
  if (!near) { if (!a.path) { if (s.coarse) { a.x = e[0] + 0.5; a.z = e[1] + 0.5; } else Sim.goTo(a, e[0], e[1]); } return; }
  p.stage = 'lurk';
  if (s.t >= p.waitUntil) { p.lurk = false; Sim.attemptTheft(a, p); p.arrived = true; p.until = s.t + 5; return; }
  if (s.t % 10 === 0) {
    for (const o of s.agents) {
      if (o === a || o.left || o.sleeping) continue;
      const d = Math.hypot(o.x - a.x, o.z - a.z);
      if (d > 11 || !World.los(o.x, o.y + 1.6, o.z, a.x, a.y + 1.2, a.z)) continue;
      const k = 'theft:' + a.id + ':' + p.place;
      if (o.beliefs.some(b => b.key === k)) continue;
      const chain = Sim.newChain({ type: 'theft', about: a.id, place: p.place, by: o.id, level: 0, truth: true, how: 'saw lurking' });
      Sim.addBelief(o, { type: 'theft', about: a.id, place: p.place, level: 0, conf: 0.5, src: 'witness', chain });
      Sim.remember(o, { text: 'I saw ' + a.name + ' outside the ' + placeName(p.place) + ' at night.', kind: 'saw_lurk', about: a.id, imp: 0.45, val: -0.2 });
      Sim.setThought(o, 'What is ' + a.name + ' doing out here at this hour?');
      Sim.emit({ type: 'SEEN_AT_NIGHT', actor: o.id, about: a.id, imp: p.seenEmitted ? 0.2 : 0.45, x: a.x, z: a.z, text: o.name + ' saw ' + a.name + ' outside the ' + placeName(p.place) + ' at night.' });
      p.seenEmitted = true;
      if (rnd() < 0.6) { Sim.setThought(a, 'Did ' + o.name + ' see me?'); }
    }
  }
}

function discoverCrimes(h) {
  const s = S();
  const vid = Sim.ctx();
  for (const c of s.crimes) {
    if (c.discovered || c.vid !== vid) continue;
    if (!Sim.shopOpen(c.place, h) && s.t - c.t < 8 * 60) continue;
    if (s.t - c.t < 60) continue;
    c.discovered = true;
    const owner = s.byId[c.victim];
    const caseId = 'k' + (s.nextId++);
    s.cases.push({ id: caseId, vid: c.vid, crimeId: c.id, place: c.place, opened: s.t, status: 'open', evidence: [], interviewed: [], scene: false });
    c.caseId = caseId;
    if (owner) { Sim.remember(owner, { text: 'Someone robbed my ' + placeName(c.place) + ': ' + c.item + ' gone.', kind: 'robbed', imp: 0.9, val: -0.9 }); owner.needs.safety -= 0.3; Sim.setThought(owner, 'Who did this?'); }
    Sim.emit({ type: 'THEFT_DISCOVERED', vid, actor: c.victim, place: c.place, imp: 0.75, public: true, val: -0.3, crimeId: c.id,
      text: 'The ' + placeName(c.place) + ' was robbed overnight. ' + cap(c.item) + ' missing.', truth: 'The thief was ' + nameOf(c.thief) + '.', memText: 'The ' + placeName(c.place) + ' was robbed last night.' }, (a) => {
      Sim.remember(a, { text: 'The ' + placeName(c.place) + ' was robbed last night.', kind: 'theft_discovered', imp: 0.45, val: -0.3 });
      a.needs.safety -= 0.05 * (0.5 + a.p.neuroticism);
    });
  }
  for (const c of s.cases) if (c.vid === vid && c.status === 'open' && s.t - c.opened > 2.2 * DAY) { c.status = 'cold'; Sim.emit({ type: 'CASE_COLD', vid, place: c.place, imp: 0.5, public: true, text: 'The ' + placeName(c.place) + ' theft case went cold.', truth: 'The thief was ' + nameOf((s.crimes.find(x => x.id === c.crimeId) || {}).thief) + '.' }); }
}

Sim.onSkip = function (a, top) {
  const s = S();
  const wp = Sim.place(a.work);
  if (!wp) return;
  const n = a.shiftsMissed;
  const coworkers = s.agents.filter(o => o !== a && !o.left && o.work === a.work && o.plan && o.plan.type === 'work' && o.plan.arrived);
  const chain = coworkers.length ? Sim.newChain({ type: 'skips', about: a.id, by: coworkers[0].id, level: n >= 3 ? 1 : 0, truth: true, how: 'noticed' }) : null;
  for (const o of coworkers.slice(0, 3)) {
    Sim.addBelief(o, { type: 'skips', about: a.id, level: n >= 5 ? 2 : n >= 3 ? 1 : 0, conf: 0.75, src: 'witness', chain });
    if (o.p.conscientiousness > 0.6) relAdj(o, a.id, 'respect', -3);
  }
  Sim.emit({ type: 'MISSED_SHIFT', actor: a.id, about: a.id, imp: n === 3 || n === 6 ? 0.4 : 0.2, x: a.x, z: a.z, text: a.name + ' skipped work (' + top.type + ' instead). Missed shifts: ' + n + '.' });
};

// ============ protests, politics ============
Sim.onProtestArrive = function (a) {
  const s = S(); const d = dayOf(s.t);
  const prot = s.agents.filter(o => !o.left && o.vid === a.vid && o.plan && o.plan.type === 'protest' && o.plan.arrived && s.t - o.plan.t0 < 120);
  if (prot.length >= 3 && s.flags.protestDay !== d) {
    s.flags.protestDay = d; s.town.pressure += 2;
    const mayor = s.byId[s.town.mayor];
    Sim.emit({ type: 'PROTEST', actor: a.id, imp: 0.8, public: true, x: a.x, z: a.z, heat: 'crime', val: -0.2,
      text: prot.length + ' villagers protested at the Town Hall over bread at ' + Sim.breadPrice().toFixed(1) + ' coins.', participants: prot.map(p => p.id) }, (o) => {
      if (mayor && o.id === mayor.id) { Sim.remember(o, { text: 'A crowd protested outside my office.', kind: 'protest', imp: 0.8, val: -0.6 }); Sim.setThought(o, 'They are angry. I should do something.'); }
      else Sim.remember(o, { text: 'People protested bread prices at the Town Hall.', kind: 'protest', imp: 0.4, val: -0.1 });
    });
    for (const p of prot) relAdj(p, s.town.mayor, 'respect', -5);
  }
};

function platformOf(c) {
  if (c.platform) return c.platform;
  return { tax: c.v.wealth > 0.6 || c.v.freedom > 0.7 ? 'lower' : 'keep', guards: c.v.safety > 0.6 ? 'more' : 'keep', subsidy: c.v.community > 0.6 || c.p.empathy > 0.6 ? 'yes' : 'no' };
}
Sim.platformOf = platformOf;
function crimeRecent(vid) { const s = S(); const v = vid || Sim.ctx(); return s.crimes.filter(c => c.discovered && c.vid === v && s.t - c.t < 3 * DAY).length; }
function avgMood(vid) { const v = vid || Sim.ctx(); const L = S().agents.filter(a => !a.left && a.vid === v); return L.reduce((x, a) => x + a.mood, 0) / Math.max(1, L.length); }
Sim.crimeRecent = crimeRecent; Sim.avgMood = avgMood;

Sim.voteScores = function (v) {
  const s = S(); const out = {};
  const ratio = Sim.breadRatio(), cr = crimeRecent(), am = avgMood();
  for (const cid of s.election.candidates) {
    const c = s.byId[cid]; if (!c || c.left) continue;
    if (cid === v.id) { out[cid] = 9; continue; }
    const r = rel(v, cid);
    let sc = (r[0] + r[1] + r[2]) / 300 * 1.3 - r[RI.resentment] / 150;
    const pf = platformOf(c);
    if (pf.tax === 'lower') sc += (v.v.wealth - 0.5) * 0.5 + (v.money < 20 ? 0.12 : 0);
    if (pf.guards === 'more') sc += (v.v.safety - 0.5) * 0.5 + cr * 0.05 * v.v.safety;
    if (pf.subsidy === 'yes') sc += (v.v.community - 0.5) * 0.4 + (v.money < 25 ? 0.22 : 0) + (ratio > 1.15 ? 0.15 : 0);
    if (cid === s.town.mayor) sc += -(ratio - 1) * 0.9 - cr * 0.05 + am * 0.3 + 0.15;
    for (const b of v.beliefs) if (b.about === cid) {
      const val = CLAIMS[b.type].val;
      sc += val * b.conf * (0.2 + b.level * 0.08) * (b.type === 'corrupt' ? 2.2 : b.type === 'secret' ? 0.8 : 1);
    }
    sc += (v.support[cid] || 0) * 0.7;
    // friends' leanings
    const friends = Object.keys(v.rel).filter(id => s.byId[id] && v.rel[id][1] > 35).slice(0, 4);
    for (const f of friends) { const fr = s.byId[f]; if (fr && (fr.support[cid] || 0) > 0.5) sc += 0.06; if (f === cid) sc += 0.1; }
    let hsh = 0; for (const ch of v.id + cid) hsh = (hsh * 31 + ch.charCodeAt(0)) | 0;
    sc += ((hsh % 100) / 100 - 0.5) * 0.12;
    out[cid] = sc;
  }
  return out;
};
Sim.poll = function () {
  const s = S(); const tally = {};
  for (const c of s.election.candidates) tally[c] = 0;
  for (const a of s.agents) if (!a.left && a.vid === Sim.ctx()) { const sc = Sim.voteScores(a); const best = Object.entries(sc).sort((x, y) => y[1] - x[1])[0]; if (best) tally[best[0]]++; }
  return tally;
};
Sim.castVote = function (a) {
  const s = S(); const d = dayOf(s.t);
  if (d !== s.election.day || a.voted === d) return;
  const sc = Sim.voteScores(a);
  const best = Object.entries(sc).sort((x, y) => y[1] - x[1])[0];
  if (!best) return;
  s.election.votes[a.id] = best[0]; a.voted = d;
  Sim.setThought(a, 'My vote goes to ' + nameOf(best[0]) + '.');
  Sim.remember(a, { text: 'I voted for ' + nameOf(best[0]) + '.', kind: 'voted', about: best[0], imp: 0.3, val: 0.1 });
};

Sim.campaignTalk = function (c, b, L) {
  const s = S();
  const say = (who, t) => L.push({ who: who.id, text: t });
  const pf = platformOf(c);
  say(c, Sim.line(c, 'campaign', { name: b.name }) || 'I am running for mayor. I could use your vote, ' + b.name + '.');
  const planks = [];
  if (pf.tax === 'lower') planks.push(['I will cut taxes.', b.v.wealth]);
  if (pf.guards === 'more') planks.push(['More guards on the streets at night.', b.v.safety + crimeRecent() * 0.1]);
  if (pf.subsidy === 'yes') planks.push(['Cheaper bread for every family.', b.v.community + (b.money < 25 ? 0.4 : 0)]);
  if (c.id === s.town.mayor) planks.push(['Steady hands. No surprises.', b.v.safety * 0.6]);
  planks.sort((x, y) => y[1] - x[1]);
  if (planks.length) say(c, planks[0][0]);
  const charisma = c.p.extraversion * 0.5 + c.p.agreeableness * 0.3 + rel(b, c.id)[RI.respect] / 200;
  b.support[c.id] = clamp((b.support[c.id] || 0) + 0.12 * charisma + (planks.length ? planks[0][1] - 0.5 : 0) * 0.1, 0, 1);
  const sc = Sim.voteScores(b);
  const ranked = Object.entries(sc).sort((x, y) => y[1] - x[1]);
  if (ranked[0] && ranked[0][0] === c.id) {
    say(b, pick(['You have my vote.', 'I am with you.', 'Count me in.']));
    Sim.remember(c, { text: b.name + ' promised me their vote.', kind: 'endorsed', about: b.id, actor: b.id, imp: 0.4, val: 0.5 });
    b.support[c.id] = Math.max(b.support[c.id], 0.6);
    Sim.addBelief(c, { type: 'supports', about: b.id, other: c.id, level: 0, conf: 0.8, src: 'self' }, null, true);
  } else if (ranked[0] && ranked[0][1] - (sc[c.id] || 0) < 0.15) say(b, pick(['I will think about it.', 'Maybe. Convince me.']));
  else say(b, pick(['Not a chance.', 'I am voting for ' + nameOf(ranked[0] && ranked[0][0]) + '.', 'We will see.']));
  // mudslinging
  const rival = s.election.candidates.find(x => x !== c.id);
  if (rival && rnd() < (1 - c.p.honesty) * 0.7 + 0.12) {
    const rb = c.beliefs.filter(x => x.about === rival && CLAIMS[x.type].val < 0 && x.conf > 0.3 && !x.told.includes(b.id)).sort((x, y) => y.conf - x.conf)[0];
    if (rb) Sim.transmit(c, b, rb, L);
  }
  relAdj(b, c.id, 'familiarity', 3);
  Sim.remember(b, { text: c.name + ' asked for my vote.', kind: 'campaign', about: c.id, actor: c.id, imp: 0.3, val: 0.1 });
  return true;
};

function tallyElection() {
  const s = S(); const d = dayOf(s.t);
  const counts = {};
  for (const c of s.election.candidates) counts[c] = 0;
  for (const k in s.election.votes) { const v = s.election.votes[k]; if (counts[v] !== undefined) counts[v]++; }
  const ranked = Object.entries(counts).sort((x, y) => y[1] - x[1]);
  if (!ranked.length) return;
  const winner = ranked[0][0];
  const prev = s.town.mayor;
  const vid = Sim.ctx(); const vname = s.villages[vid].name;
  s.election.history.push({ day: d, counts, winner, prev });
  const txt = ranked.map(([c, n]) => nameOf(c) + ' ' + n).join(', ');
  const upset = winner !== prev;
  Sim.emit({ type: 'ELECTION_RESULT', actor: winner, imp: 1, public: true, val: 0.1, text: upset ? nameOf(winner) + ' won the ' + vname + ' election and is the new mayor (' + txt + ').' : nameOf(winner) + ' was re-elected mayor of ' + vname + ' (' + txt + ').' }, (a) => {
    const happy = (s.election.votes[a.id] === winner);
    Sim.remember(a, { text: nameOf(winner) + ' won the election.', kind: 'election', about: winner, imp: 0.6, val: happy ? 0.5 : -0.4 });
  });
  AV.Civ.history(upset ? vname + ' elected ' + nameOf(winner) + ' as mayor' : nameOf(winner) + ' re-elected in ' + vname, vid, 'politics', !upset);
  for (const k in s.election.votes) { const voter = s.byId[k]; if (voter && voter.promised && voter.promised[winner] !== undefined) {} }
  AV.Civ.scoreElection(vid, winner, counts);
  if (upset) {
    const old = s.byId[prev], nw = s.byId[winner];
    if (old) { old.job = 'unemployed'; old.work = null; Sim.setThought(old, 'After all these years...'); old.goals.unshift({ type: 'BECOME_MAYOR', primary: true }); }
    if (nw) { nw.formerJob = nw.job; nw.job = 'mayor'; nw.work = Sim.vp('townhall'); Sim.setThought(nw, 'Now the real work starts.'); nw.goals = nw.goals.filter(g => g.type !== 'BECOME_MAYOR'); nw.goals.unshift({ type: 'STAY_MAYOR', primary: true }); }
    s.town.mayor = winner;
  }
  // next race
  s.election.day = d + 6; s.election.votes = {};
  const ambitious = s.agents.filter(a => !a.left && a.vid === vid && a.id !== winner && a.jailUntil <= s.t && (a.goals.some(g => g.type === 'BECOME_MAYOR') || (a.p.ambition > 0.65 && a.v.power > 0.55 && Sim.relScore(a, winner) < -5)))
    .sort((x, y) => (y.p.ambition + y.v.status) - (x.p.ambition + x.v.status)).slice(0, 2).map(a => a.id);
  s.election.candidates = [winner].concat(ambitious.length ? ambitious : (prev !== winner ? [prev] : []));
  if (s.election.candidates.length < 2) {
    const ch = s.agents.filter(a => !a.left && a.vid === vid && a.id !== winner).sort((x, y) => y.p.ambition - x.p.ambition)[0];
    if (ch) s.election.candidates.push(ch.id);
  }
  Sim.emit({ type: 'ELECTION_STARTED', imp: 0.55, public: true, text: vname + ' votes on day ' + s.election.day + ': ' + s.election.candidates.map(c => nameOf(c)).join(' vs ') + '.' });
}

function mayorPolicies() {
  const s = S(); const m = s.byId[s.town.mayor]; if (!m || m.left) return;
  if (rnd() > 0.25 + m.p.conscientiousness * 0.75 && s.town.pressure < 3) { Sim.setThought(m, 'Things will sort themselves out.'); return; }
  const T = s.town; const changes = [];
  const ratio = Sim.breadRatio(), cr = crimeRecent();
  const tax = clamp(Math.round((0.1 + (T.treasury < 150 ? 0.04 : 0) - (m.v.freedom - 0.5) * 0.08 - (platformOf(m).tax === 'lower' ? 0.03 : 0) + (m.p.greed - 0.5) * 0.04) * 100) / 100, 0.04, 0.2);
  const guard = clamp(Math.round((0.85 + cr * 0.12 * m.v.safety + (platformOf(m).guards === 'more' ? 0.2 : 0)) * 10) / 10, 0.6, 1.6);
  const afford = T.treasury > 260 ? 1 : T.treasury > 140 ? 0.5 : 0;
  const sub = (ratio > 1.15 || T.pressure >= 2 ? clamp(Math.round((m.p.empathy * 0.3 + m.v.community * 0.15 + T.pressure * 0.04) * 20) / 20, 0, 0.4) : (platformOf(m).subsidy === 'yes' ? 0.05 : 0)) * afford;
  if (Math.abs(tax - T.tax) >= 0.02) { changes.push('set taxes to ' + Math.round(tax * 100) + '%'); T.tax = tax; }
  if (Math.abs(guard - T.guardBudget) >= 0.1) { changes.push((guard > T.guardBudget ? 'raised' : 'cut') + ' the guard budget to ' + Math.round(guard * 100) + '%'); T.guardBudget = guard; }
  if (Math.abs(sub - T.subsidy) >= 0.05) { changes.push(sub > T.subsidy ? 'introduced a ' + Math.round(sub * 100) + '% bread subsidy' : (sub ? 'cut the bread subsidy to ' + Math.round(sub * 100) + '%' : 'ended the bread subsidy')); T.subsidy = sub; }
  T.pressure = Math.max(0, T.pressure - 1);
  if (changes.length) {
    T.policyLog.push({ day: dayOf(s.t), by: m.id, changes });
    Sim.emit({ type: 'POLICY_CHANGED', actor: m.id, imp: 0.6, public: true, text: 'Mayor ' + m.name + ' ' + changes.join(', ') + '.' });
  }
}

// ============ newspapers: one per village, written by that village's journalist ============
const PAPERS = { highvale: 'The Village Post', ironridge: 'The Ironridge Ledger', rivergate: 'The Rivergate Courier', greenhollow: 'The Greenhollow Almanac', ashfield: 'The Ashfield Rag' };
Sim.PAPERS = PAPERS;
function composePaper(vid) {
  const s = S(); vid = vid || Sim.ctx(); Sim.useVillage(vid);
  const V = s.villages[vid];
  const paper = PAPERS[vid] || 'The Post';
  const issueNo = s.news.filter(n => n.vid === vid).length + 1 + (V.issueBase || 0);
  const rose = s.agents.find(a => a.job === 'journalist' && !a.left && a.vid === vid && a.core) || s.agents.find(a => a.job === 'journalist' && a.vid === vid && !a.left);
  if (!rose || rose.jailUntil > s.t) {
    if (rose) s.news.push({ vid, paper, no: issueNo, day: dayOf(s.t), missing: true, by: rose.id, headlines: [{ h: 'NO ISSUE TODAY', body: rose.name + ' is in a cell at the guard post.' }] });
    return;
  }
  const since = s.t - DAY;
  const evs = s.events.filter(e => e.t >= since && (e.vid === vid || (e.imp || 0) >= 0.85));
  const H = [];
  const add = (score, h, body, claim, kind) => H.push({ score: score + (rnd() * 0.1), h, body, claim, kind });
  const sens = 0.6 + rose.v.status * 0.6;
  const foreign = e => e.vid && e.vid !== vid ? (s.villages[e.vid] ? s.villages[e.vid].name.toUpperCase() + ': ' : '') : '';
  for (const e of evs) {
    switch (e.type) {
      case 'THEFT_DISCOVERED': {
        if (e.vid !== vid) break;
        const c = s.crimes.find(x => x.id === e.crimeId); const cs = c && s.cases.find(k => k.crimeId === c.id);
        const bel = rose.beliefs.filter(b => b.type === 'theft' && b.place === e.place && b.level >= 1).sort((x, y) => y.conf * y.level - x.conf * x.level)[0];
        const bar = 0.62 - (1 - rose.p.honesty) * 0.35 - rose.v.status * 0.15;
        if (cs && cs.status === 'solved') break;
        if (bel && bel.conf > bar) add(0.95 * sens, nameOf(bel.about).toUpperCase() + ' SUSPECTED IN ' + placeName(e.place).toUpperCase() + ' THEFT' + (bel.conf < 0.55 ? '?' : ''), 'Sources close to the paper say ' + Sim.claimText(bel, bel.level) + '. ' + (c ? cap(c.item) : 'Goods') + ' went missing overnight.', { type: 'theft', about: bel.about, place: e.place, level: Math.min(3, bel.level), conf: bel.conf * 0.85, chain: bel.chain }, 'crime');
        else add(0.85, (rnd() < 0.5 ? 'BREAK-IN AT THE ' : placeName(e.place).toUpperCase() + ' THEFT ') + (rnd() < 0.5 ? placeName(e.place).toUpperCase() : 'STILL UNSOLVED'), cap(c ? c.item : 'Goods') + ' vanished from the ' + placeName(e.place) + ' overnight. The guard is asking questions.', null, 'crime');
        break;
      }
      case 'ARREST': if (e.vid === vid) add(0.98, nameOf(e.about).toUpperCase() + ' ARRESTED OVER ' + ((e.text.match(/the (.*) theft/) || [, 'THEFT'])[1] || 'THEFT').toUpperCase() + ' THEFT', e.text + ' The accused ' + (rnd() < 0.5 ? 'denies everything.' : 'says nothing.'), null, 'crime'); break;
      case 'CLEARED': add(1.1, foreign(e) + nameOf(e.about).toUpperCase() + ' CLEARED', e.text, null, 'crime'); break;
      case 'ELECTION_RESULT': add(e.vid === vid ? 1.2 : 0.6, foreign(e) + (e.text.includes('new mayor') ? nameOf(e.actor).toUpperCase() + ' ELECTED MAYOR' : nameOf(e.actor).toUpperCase() + ' HOLDS ON AS MAYOR'), e.text, null, 'politics'); break;
      case 'POLICY_CHANGED': if (e.vid === vid) add(0.6, 'MAYOR ' + (e.text.match(/(raised|cut|set|introduced|ended)[^,.]*/) || ['ACTS'])[0].toUpperCase(), e.text, null, 'politics'); break;
      case 'PROTEST': if (e.vid === vid) add(0.9, 'PROTEST AT TOWN HALL OVER BREAD PRICES', e.text, null, 'politics'); break;
      case 'BUILDING_CREATED': add(e.vid === vid ? 0.8 : 0.4, foreign(e) + (e.headline || 'NEW BUILDING COMPLETED'), e.text, null, 'business'); break;
      case 'BUSINESS_OPENED': add(e.vid === vid ? 0.85 : 0.4, foreign(e) + nameOf(e.actor).toUpperCase() + ' OPENS A BUSINESS', e.text, null, 'business'); break;
      case 'CONSTRUCTION_STARTED': if (e.vid === vid) add(0.5, 'NEW ' + (e.what || 'BUILDING').toUpperCase() + ' GOING UP', e.text, null, 'business'); break;
      case 'WORLD_EVENT': add((e.vid === vid ? 1.0 : 0.65) * (e.imp || 0.7), foreign(e) + (e.headline || 'NEWS FROM AFAR'), e.text, null, 'economy'); break;
      case 'TRADE': if (e.vid === vid || e.to === vid) add(0.45, 'CARAVAN ' + (e.vid === vid ? 'RETURNS FROM ' + (s.villages[e.to] || {}).name : 'ARRIVES FROM ' + (s.villages[e.vid] || {}).name).toUpperCase(), e.text, null, 'economy'); break;
      case 'MIGRATION': add(e.vid === vid || e.to === vid ? 0.7 : 0.3, foreign(e) + nameOf(e.actor).toUpperCase() + (e.to === vid ? ' MOVES HERE' : ' MOVES AWAY'), e.text, null, 'social'); break;
      case 'NPC_INJURED': if (e.vid === vid) add(0.7, 'MINE ACCIDENT INJURES ' + nameOf(e.actor).toUpperCase(), e.text, null, 'incident'); break;
      case 'ARGUMENT': if (e.vid === vid && s.byId[e.actor] && s.byId[e.actor].core) add(0.45 * sens, nameOf(e.actor).toUpperCase() + ' AND ' + nameOf(e.target).toUpperCase() + ' FEUD IN PUBLIC', e.text, null, 'social'); break;
      case 'COUPLE': if (e.vid === vid) add(0.5 * sens, e.text.replace(/ are courting\./, '').toUpperCase() + ': A NEW COUPLE?', e.text, null, 'social'); break;
      case 'SECRET_EXPOSED': if (e.vid === vid) add(0.9 * sens, e.headline || 'SECRETS SPILL', e.text, null, 'gossip'); break;
      case 'TIER_UP': add(e.vid === vid ? 1.15 : 0.5, foreign(e) + (e.headline || 'THE VILLAGE GROWS'), e.text, null, 'social'); break;
      case 'JOB_CHANGE': if (e.vid === vid && rnd() < 0.3) add(0.35, nameOf(e.actor).toUpperCase() + ' FINDS WORK', e.text, null, 'economy'); break;
    }
  }
  const h = V.econ.hist; const last = h[h.length - 1], prev = h[h.length - 2];
  if (last && prev) {
    const ch = (last.bread - prev.bread) / prev.bread;
    if (Math.abs(ch) >= 0.06) add(0.55 + Math.abs(ch) * 2, 'BREAD PRICES ' + (ch > 0 ? 'RISE ' : 'FALL ') + Math.round(Math.abs(ch) * 100) + '%', 'A loaf now costs ' + last.bread.toFixed(1) + ' coins on average' + (ch > 0 ? '. Families are feeling it.' : '.'), null, 'economy');
    for (const g of ['iron', 'stone', 'wood', 'food']) { const a0 = prev[g], a1 = last[g]; if (a0 && a1 && Math.abs(a1 - a0) / a0 > 0.25) add(0.4, g.toUpperCase() + ' PRICE ' + (a1 > a0 ? 'JUMPS' : 'SLUMPS') + ' ' + Math.round(Math.abs(a1 - a0) / a0 * 100) + '%', 'The storehouse now pays ' + a1.toFixed(1) + ' coins a unit.', null, 'economy'); }
  }
  const d = dayOf(s.t);
  if (s.election.day - d <= 2 && s.election.day >= d) {
    const poll = Sim.poll(); const r = Object.entries(poll).sort((x, y) => y[1] - x[1]);
    if (r.length >= 2) add(0.7, r[0][1] === r[1][1] ? 'DEAD HEAT: ' + nameOf(r[0][0]).toUpperCase() + ' AND ' + nameOf(r[1][0]).toUpperCase() + ' TIED' : nameOf(r[0][0]).toUpperCase() + ' LEADS ' + nameOf(r[1][0]).toUpperCase() + ' AHEAD OF ELECTION', 'A survey of ' + s.agents.filter(a => !a.left && a.vid === vid).length + ' residents: ' + r.map(([c, n]) => nameOf(c) + ' ' + n).join(', ') + '. Voting on day ' + s.election.day + '.', null, 'politics');
  }
  for (const b of rose.beliefs) {
    const ab = s.byId[b.about];
    if (b.type === 'skips' && b.conf > 0.4 && ab && ab.vid === vid && ab.shiftsMissed >= 3 && !b.printed) { const n = ab.shiftsMissed; add(0.5, nameOf(b.about).toUpperCase() + ' MISSES ' + ['', 'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH'][Math.min(n, 6)] + ' SHIFT THIS WEEK', 'Coworkers say ' + Sim.claimText(b, b.level) + '.', { type: 'skips', about: b.about, level: b.level, conf: b.conf * 0.8, chain: b.chain }, 'social'); b.printed = true; }
    if (b.type === 'corrupt' && b.conf > 0.5 && !b.printed) { add(1.25 * sens, 'TREASURY COINS MISSING: QUESTIONS FOR ' + nameOf(b.about).toUpperCase(), 'The paper has seen the ledger. ' + Math.round(s.town.missing) + ' coins cannot be accounted for.', { type: 'corrupt', about: b.about, level: b.level, conf: b.conf * 0.9, chain: b.chain }, 'politics'); b.printed = true; }
    if (b.type === 'fraud' && b.conf > 0.55 && !b.printed) { add(0.85 * sens, 'CUSTOMERS QUESTION ' + nameOf(b.about).toUpperCase(), 'Several customers say ' + Sim.claimText(b, b.level) + '.', { type: 'fraud', about: b.about, level: b.level, conf: b.conf * 0.8, chain: b.chain }, 'economy'); b.printed = true; }
    if (b.type === 'secret' && b.conf > 0.6 - (1 - rose.p.honesty) * 0.2 && !b.printed && rnd() < 0.5 && b.about !== rose.id) { add(0.8 * sens, 'WHISPERS: ' + Sim.claimText(b, 0).toUpperCase(), 'We hear that ' + Sim.claimText(b, 0) + '. ' + nameOf(b.about) + ' did not comment.', { type: 'secret', about: b.about, secretId: b.secretId, level: 0, conf: b.conf * 0.8, chain: b.chain }, 'gossip'); b.printed = true; }
    if (b.type === 'theft' && b.level >= 2 && b.conf > 0.6 - (1 - rose.p.honesty) * 0.3 && !b.printed && b.place && ab && rnd() < 0.3) { add(0.7 * sens, 'WHO ROBBED THE ' + placeName(b.place).toUpperCase() + '?', 'Word is that ' + Sim.claimText(b, b.level) + '.', { type: 'theft', about: b.about, place: b.place, level: b.level, conf: b.conf * 0.8, chain: b.chain }, 'crime'); b.printed = true; }
  }
  if (!H.length) add(0.2, 'A QUIET DAY IN ' + V.name.toUpperCase(), 'Nothing worth printing. ' + rose.name + ' blames the weather.', null, 'social');
  H.sort((x, y) => y.score - x.score);
  const seen = new Set(); const heads = [];
  for (const x of H) { if (seen.has(x.h)) continue; seen.add(x.h); heads.push(x); if (heads.length >= 5) break; }
  const issue = { vid, paper, no: issueNo, day: dayOf(s.t), by: rose.id, headlines: heads.map(x => ({ h: x.h, body: x.body, claim: x.claim, kind: x.kind })) };
  s.news.push(issue);
  const mine = s.news.filter(n => n.vid === vid); if (mine.length > 12) s.news.splice(s.news.indexOf(mine[0]), 1);
  Sim.remember(rose, { text: 'I published issue ' + issue.no + ': ' + heads[0].h, kind: 'published', imp: 0.4, val: 0.3 });
  rose.stats.issues = (rose.stats.issues || 0) + 1;
  AV.Civ.practice(rose, 'writing', 20);
  Sim.emit({ type: 'NEWSPAPER', actor: rose.id, vid, imp: 0.4, text: paper + ' #' + issue.no + ': ' + heads[0].h + '.' });
  for (const hd of issue.headlines) if (hd.claim && hd.claim.chain && Sim.truthOf(hd.claim.chain, hd.claim.level) === false) AV.Civ.mind(rose, rose.name + ' printed a claim that is not true: ' + hd.h.toLowerCase(), 'rumor');
  for (const a of s.agents) {
    if (a.left || a.vid !== vid || a === rose || a.money < 1 || rnd() > 0.35 + a.p.curiosity * 0.55) continue;
    a.money -= 1; rose.money += 1; a.readPaper = issue.no;
    const tr = (rel(a, rose.id)[RI.trust] + 60) / 120;
    for (const hd of issue.headlines) {
      if (!hd.claim) continue;
      if (hd.claim.about === a.id) { relAdj(a, rose.id, 'resentment', 18); relAdj(a, rose.id, 'trust', -10); Sim.remember(a, { text: rose.name + ' printed lies about me: ' + hd.h, kind: 'smeared', about: rose.id, actor: rose.id, imp: 0.85, val: -0.8 }); Sim.setThought(a, 'How dare they print that.'); continue; }
      const cat = Sim.interpretCategory(a, hd.claim, rose.id);
      const mult = { confirm: 1.3, defend: 0.25, shrug: 0.6 }[cat] || 1;
      Sim.addBelief(a, Object.assign({}, hd.claim, { conf: clamp(hd.claim.conf * tr * mult * (1 - (a.mind ? a.mind.social * 0.2 : 0.1)), 0.05, 0.9), src: 'news', hops: 1 }));
      if (hd.claim.secretId && s.secrets[hd.claim.secretId] && !s.secrets[hd.claim.secretId].knownBy.includes(a.id)) s.secrets[hd.claim.secretId].knownBy.push(a.id);
    }
    Sim.remember(a, { text: paper + ' says: ' + issue.headlines[0].h, kind: 'read', imp: 0.3, val: 0 });
  }
  rose.goals.forEach(g => { if (g.type === 'BREAK_A_BIG_STORY' && heads[0].score > 1) g.progress = Math.min(1, g.progress + 0.34); });
}
Sim.composePaper = composePaper;

// ============ daily + hourly society (each runs inside a village context) ============
function dailyMoney() {
  const s = S(); const T = s.town; const vid = Sim.ctx();
  const L = s.agents.filter(a => !a.left && a.vid === vid);
  for (const a of L) {
    const due = Math.round((T.tax * 30 + Math.max(0, a.money - 150) * T.tax * 0.5) * 10) / 10;
    const paid = Math.min(Math.max(0, a.money), due); a.money -= paid; T.treasury += paid;
  }
  const sal = { guard: 10 * T.guardBudget, nightguard: 10 * T.guardBudget, mayor: 12, doctor: 8, journalist: 5, teacher: 7 };
  for (const a of L) if (sal[a.job] && a.jailUntil <= s.t) { const p = Math.min(sal[a.job], Math.max(0, T.treasury)); T.treasury -= p; a.money += p; }
  const wages = { baker: 'bakery', blacksmith: 'forge', shopkeeper: 'store', merchant: 'market', bartender: 'tavern' };
  for (const a of L) {
    const shopId = wages[a.job] && Sim.vp(wages[a.job]); if (!shopId) continue;
    const sh = s.shops[shopId]; if (!sh || sh.owner === a.id || a.shopId || a.employer) continue;
    const o = s.byId[sh.owner]; if (!o) continue;
    if (o.money > 15) { o.money -= 9; a.money += 9; } else { relAdj(a, o.id, 'resentment', 6); Sim.setThought(a, o.name + ' could not pay me today.'); }
  }
  const m = s.byId[T.mayor];
  if (m && m.habit === 'embezzle' && T.treasury > 80) { const take = Math.round(T.treasury * 0.035); T.treasury -= take; m.money += take; T.missing += take; }
  if (T.treasury < 40 && T.subsidy > 0) { T.subsidy = Math.max(0, T.subsidy - 0.15); Sim.emit({ type: 'POLICY_CHANGED', vid, imp: 0.55, public: true, text: 'The ' + s.villages[vid].name + ' treasury is nearly empty. The bread subsidy was cut to ' + Math.round(T.subsidy * 100) + '%.' }); }
  if (T.treasury < 0) T.treasury = 0;
}
function priceDay() {
  const s = S(); const vid = Sim.ctx(); const E = s.econ;
  const rec = { day: dayOf(s.t), baked: E.baked || 0, bread: +Sim.breadPrice().toFixed(2), tools: +toolPrice(Sim.vp('forge')).toFixed(1), treasury: Math.round(s.town.treasury), sold: E.sold.bread, stockBread: totalBread(), stock: Object.assign({}, E.stock), produced: Object.assign({}, E.prodDay || {}) };
  for (const g of GOODS) rec[g] = +priceOf(g).toFixed(2);
  for (const g in rec.stock) rec.stock[g] = Math.round(rec.stock[g]);
  E.sold.bread = 0; E.baked = 0; E.prodDay = {};
  const prev = E.hist[E.hist.length - 1];
  E.hist.push(rec); if (E.hist.length > 40) E.hist.shift();
  if (prev) {
    const ch = (rec.bread - prev.bread) / prev.bread;
    if (Math.abs(ch) >= 0.08) Sim.emit({ type: 'PRICE_CHANGED', vid, imp: Math.abs(ch) > 0.15 ? 0.7 : 0.45, public: true, val: ch > 0 ? -0.2 : 0.1, text: 'Bread in ' + s.villages[vid].name + ' ' + (ch > 0 ? 'rose' : 'fell') + ' ' + Math.round(Math.abs(ch) * 100) + '% to ' + rec.bread.toFixed(1) + ' coins.' });
  }
}
function weatherRoll() { const W = S().weather; const r = rnd(); W.kind = r < 0.28 ? 'rain' : r < 0.52 ? 'cloudy' : 'clear'; }

function findWork() {
  const s = S(); const vid = Sim.ctx();
  const L = s.agents.filter(a => !a.left && a.vid === vid);
  for (const a of L) {
    if (a.core || a.money > 18 || rnd() > 0.5 || a.employer) continue;
    const opts = AV.Civ.gatherJobsFor(vid);
    if (!AV.JOBS[a.job] || !AV.JOBS[a.job].gather || opts.length < 2) continue;
    const pay = j => AV.JOBS[j].gather.reduce((m, g) => Math.max(m, priceOf(g)), 0) * (AV.Civ.RATE[AV.JOBS[j].gather[0]] || 0.5);
    const best = opts.slice().sort((x, y) => pay(y) - pay(x))[0];
    if (best === a.job || pay(best) < pay(a.job) * 1.3) continue;
    const from = a.job;
    a.job = best; a.work = Sim.defaultWork(a);
    Sim.setThought(a, 'Better money as a ' + AV.JOBS[best].label.toLowerCase() + '.');
    a.stats.adapt = (a.stats.adapt || 0) + 1;
    AV.Civ.mind(a, a.name + ' switched from ' + from + ' to ' + best + ' because it pays better', 'decision');
    Sim.emit({ type: 'JOB_CHANGE', actor: a.id, vid, imp: 0.4, text: a.name + ' quit as a ' + from + ' and became a ' + AV.JOBS[best].label.toLowerCase() + '.' });
  }
  for (const a of L) {
    if (a.job !== 'unemployed' || a.jailUntil > s.t || a.employer) continue;
    if (rnd() > 0.35 + a.p.conscientiousness * 0.3 - a.p.laziness * 0.3) continue;
    let job = null;
    if (s.projects.some(p => !p.done && p.vid === vid) && rnd() < 0.4) job = 'builder';
    else { const opts = AV.Civ.gatherJobsFor(vid); job = opts.sort((x, y) => priceOf(AV.JOBS[y].gather[0]) - priceOf(AV.JOBS[x].gather[0]))[0]; }
    if (!job) continue;
    a.job = job; a.work = Sim.defaultWork(a);
    a.goals = a.goals.filter(g => g.type !== 'FIND_WORK');
    Sim.setThought(a, 'Steady work, at last.');
    Sim.emit({ type: 'JOB_CHANGE', actor: a.id, vid, imp: 0.4, text: a.name + ' started work as a ' + AV.JOBS[job].label.toLowerCase() + '.' });
  }
}
function secretsCheck() {
  const s = S();
  for (const id in s.secrets) {
    const sc = s.secrets[id];
    if (sc.exposed) continue;
    const owner = s.byId[sc.owner]; if (!owner) continue;
    const pop = s.agents.filter(a => !a.left && a.vid === owner.vid).length;
    if (sc.knownBy.filter(k => s.byId[k] && !s.byId[k].left && s.byId[k].vid === owner.vid).length >= Math.max(8, pop * 0.45)) {
      sc.exposed = true;
      Sim.useVillage(owner.vid);
      const headline = owner.name.toUpperCase() + ' ' + sc.gossip.toUpperCase();
      Sim.emit({ type: 'SECRET_EXPOSED', vid: owner.vid, actor: sc.owner, about: sc.owner, imp: 0.85, public: true, headline: 'EVERYONE KNOWS: ' + headline, val: -0.1, text: 'Everyone in ' + s.villages[owner.vid].name + ' is talking: ' + owner.name + ' ' + sc.gossip + '.' }, (a) => {
        if (a.id === sc.owner) { Sim.remember(a, { text: 'Everyone knows my secret now.', kind: 'exposed', imp: 0.95, val: -0.9 }); return; }
        Sim.addBelief(a, { type: 'secret', about: sc.owner, secretId: id, level: 0, conf: 0.8, src: 'news' }, null, true);
        if (!sc.knownBy.includes(a.id)) sc.knownBy.push(a.id);
        if (sc.type === 'embezzle' || sc.type === 'bribe') Sim.addBelief(a, { type: 'corrupt', about: sc.owner, level: 2, conf: 0.75, src: 'news' });
        if (sc.type === 'fraud') Sim.addBelief(a, { type: 'fraud', about: sc.owner, level: 2, conf: 0.7, src: 'news' });
        if (sc.type === 'theft' || sc.type === 'lie' || sc.type === 'smuggling') Sim.addBelief(a, { type: 'liar', about: sc.owner, level: 1, conf: 0.6, src: 'news' });
        if (sc.type === 'debt' || sc.type === 'gambling' || sc.type === 'hoard') relAdj(a, sc.owner, 'respect', -8);
      });
      for (const liar of s.agents) if (liar.stats.liesBelieved && sc.type === 'lie' && liar.id === sc.owner) liar.stats.exposed = (liar.stats.exposed || 0) + 1;
      if (sc.type === 'lie' || sc.type === 'theft' || sc.type === 'smuggling' || sc.type === 'embezzle' || sc.type === 'bribe') owner.stats.exposed = (owner.stats.exposed || 0) + 1;
      owner.mood = clamp(owner.mood - 0.5, -1, 1); Sim.setThought(owner, 'They all know.');
      AV.Civ.history(owner.name + '\'s secret came out in ' + s.villages[owner.vid].name + ': ' + sc.gossip, owner.vid, 'social', true);
    }
  }
}
function couples() {
  const s = S();
  for (const a of s.agents) {
    if (a.left || a.couple) continue;
    for (const id in a.rel) {
      const b = s.byId[id]; if (!b || b.left || b.couple) continue;
      const ra = a.rel[id], rb = b.rel[a.id]; if (!rb) continue;
      if (a.family.includes(id)) continue;
      if (ra[1] > 50 && rb[1] > 45 && ra[RI.attraction] + rb[RI.attraction] > 70 && ra[0] > 30 && rb[0] > 25) {
        a.couple = b.id; b.couple = a.id;
        Sim.useVillage(a.vid);
        Sim.emit({ type: 'COUPLE', vid: a.vid, actor: a.id, target: b.id, imp: 0.6, public: true, val: 0.2, text: a.name + ' and ' + b.name + ' are courting.' });
        AV.Civ.mind(a, a.name + ' and ' + b.name + ' started courting', 'social');
        for (const o of s.agents) if (o !== a && o !== b && o.rel[a.id] && o.rel[a.id][RI.attraction] > 40) { relAdj(o, b.id, 'jealousy', 30); Sim.setThought(o, 'Of course. ' + b.name + ' of all people.'); }
        break;
      }
    }
  }
}

Sim.societyMinute = function (m, h) {
  const s = S();
  for (const a of s.agents) if (a.plan && a.plan.type === 'steal' && a.plan.lurk !== undefined) { Sim.useVillage(a.vid); lurkTick(a); }
  if (m % 10 === 0) Sim.updateLOD();
  if (m % 60 === 0) {
    const hh = Math.round(h) % 24;
    if (hh === 5) weatherRoll();
    if (hh === 13 && rnd() < 0.2) weatherRoll();
    for (const V of World.VILLAGES) {
      Sim.useVillage(V.id);
      discoverCrimes(h);
      if (hh === 8) for (const k of ['store', 'market', 'tavern']) { const id = Sim.vp(k); if (id) restock(id); }
      if (hh === 6) { priceDay(); dailyMoney(); composePaper(V.id); }
      if (hh === 7) { mayorPolicies(); findWork(); }
      if (hh === 20 && dayOf(s.t) === s.election.day) tallyElection();
    }
    if (hh === 20) couples();
    if (hh === 0) {
      Sim.summarize(); secretsCheck();
      AV.Civ.daily();
      s.statsHist.push(Sim.worldStats()); if (s.statsHist.length > 60) s.statsHist.shift();
      Sim.emit({ type: 'DAY_START', imp: 0.2, text: 'World day ' + dayOf(s.t) + ' begins.' });
      for (const a of s.agents) if (S().t - (a.shiftWeekReset || 0) > 7 * DAY) { a.shiftsMissed = 0; a.shiftWeekReset = s.t; }
    }
    if (hh === 12 || hh === 18) secretsCheck();
    AV.Civ.hourly(hh);
  }
  AV.Civ.minute(m, h);
};

// ============ stats ============
Sim.stats = function (vid) {
  const s = S(); vid = vid || Sim.ctx() || 'highvale'; const keep = Sim.ctx(); Sim.useVillage(vid);
  const V = s.villages[vid];
  const L = s.agents.filter(a => !a.left && a.vid === vid);
  const pop = L.length || 1;
  const happy = Math.round((L.reduce((x, a) => x + a.mood, 0) / pop + 1) * 50);
  let tr = 0, n = 0; for (const a of L) for (const b of L) if (a !== b && a.rel[b.id]) { tr += a.rel[b.id][0]; n++; }
  const poll = Sim.poll();
  const cog = Math.round(L.reduce((x, a) => x + (a.scores ? a.scores.cognition : 50), 0) / pop);
  const wealth = Math.round(L.reduce((x, a) => x + Math.max(0, a.money), 0) + V.town.treasury + Object.keys(V.econ.stock).reduce((x, g) => x + V.econ.stock[g] * priceOf(g), 0));
  const out = { vid, name: V.name, day: dayOf(s.t), pop: L.length, bread: +Sim.breadPrice().toFixed(2), food: Math.round((totalBread() + V.econ.stock.food * 2) / Math.max(1, pop * 2) * 10) / 10, money: Math.round(L.reduce((x, a) => x + a.money, 0) / pop),
    happy, crime: crimeRecent(), trust: Math.round(tr / Math.max(1, n)), poll, electionIn: s.election.day - dayOf(s.t), treasury: Math.round(s.town.treasury), mayor: s.town.mayor,
    cognition: cog, wealth, output: Math.round(AV.Civ.output(vid)), tier: V.tier, tech: V.tech, influence: Math.round(AV.Civ.influence(vid)) };
  if (keep) Sim.useVillage(keep);
  return out;
};
Sim.worldStats = function () {
  const s = S();
  const L = s.agents.filter(a => !a.left);
  let rels = 0; for (const a of L) for (const id in a.rel) { const r = a.rel[id]; if (Math.abs(r[0]) > 25 || Math.abs(r[1]) > 25 || r[5] > 25) rels++; }
  const mem = L.reduce((x, a) => x + a.memories.length, 0);
  return { day: dayOf(s.t), agents: L.length, villages: World.VILLAGES.length, memories: mem, beliefs: L.reduce((x, a) => x + a.beliefs.length, 0), relationships: rels, buildings: Object.keys(s.properties).length + Object.keys(s.extraPlaces).length };
};

// truth of a rumor at a given level (spectator only)
Sim.truthOf = function (chainId, level) {
  const s = S(); const r = s.rumors && s.rumors[chainId]; if (!r) return null;
  if (r.type === 'theft') {
    if ((level || 0) <= 1) return r.origin.truth;
    return s.crimes.some(c => c.thief === r.about && c.place === r.place);
  }
  if (r.type === 'corrupt') return !!(s.byId[r.about] && s.byId[r.about].habit === 'embezzle');
  if (r.type === 'fraud') return !!(s.byId[r.about] && s.byId[r.about].habit === 'fraud');
  return r.origin.truth;
};

// ============ the player ============
let PID = 'p_anon';
function PL() { const s = S(); if (!s.players[PID]) s.players[PID] = { id: PID, name: 'A visitor', money: 30, inv: { bread: 2, tools: 0 }, x: 0, y: World.STAND, z: 0, told: [], known: {}, votedDay: -1, beliefs: [], joined: s.t }; return s.players[PID]; }
function PN(capital) { const n = (PL().name || 'a visitor'); return capital ? n.charAt(0).toUpperCase() + n.slice(1) : n; }
function ctxFor(x) { const a = typeof x === 'string' && S().byId[x]; if (a) Sim.useVillage(a.vid); }
Sim.ensurePlayer = function (pid, name) { PID = pid; ctxFor(arguments[1]); const p = PL(); if (name) p.name = name; return p; };
function playerListener() { const p = PL(); p.beliefs = p.beliefs || []; return { id: PID, name: 'you', beliefs: p.beliefs, family: [], p: { agreeableness: 0.5, openness: 0.5, neuroticism: 0.3 }, rel: {} }; }
function knowLog(a, text) { const p = PL(); p.known[a.id] = p.known[a.id] || []; p.known[a.id].unshift({ t: S().t, text }); if (p.known[a.id].length > 20) p.known[a.id].length = 20; }
Sim.knowLog = knowLog;

Sim.playerGreet = function (pid, id) { PID = pid; ctxFor(arguments[1]);
  const s = S(); const a = s.byId[id]; if (!a) return [];
  const r = rel(a, PID); const out = [];
  if (a.jailUntil > s.t) return [{ who: a.id, text: pick(['Come to gloat?', 'I should not be in here.', 'Get me out of here.']) }];
  if (a.sleeping) {
    a.sleeping = false; if (a.plan) a.plan.until = s.t; a.needs.energy = Math.max(0, a.needs.energy - 0.05);
    relAdj(a, PID, 'trust', -2); relAdj(a, PID, 'familiarity', 3);
    Sim.remember(a, { text: PN(1) + ' woke me up.', kind: 'woken', about: PID, actor: PID, imp: 0.3, val: -0.3 });
    out.push({ who: a.id, text: pick(['Mm? You woke me up. What is it?', 'Whuh... do you know what time it is?', 'I was asleep. This had better be good.']) });
    return out;
  }
  if (r[RI.familiarity] < 6) {
    out.push({ who: a.id, text: Sim.line(a, 'hi', { name: 'stranger' }) + ' I am ' + a.name + ', the ' + AV.JOBS[a.job].label.toLowerCase() + '.' });
    knowLog(a, a.name + ' is the ' + AV.JOBS[a.job].label.toLowerCase() + '.');
  } else {
    const mem = Sim.recall(a, m => m.about === PID || m.actor === PID, 3)[0];
    if (mem && Sim.strength(mem) > 0.08) {
      const ago = dayOf(s.t) - dayOf(mem.t), when = ago <= 0 ? 'earlier' : ago === 1 ? 'yesterday' : ago + ' days ago';
      let t = null;
      if (mem.kind === 'heard_from_you') t = 'You told me ' + when + ' that ' + mem.claim + '.' + (mem.chain && Sim.truthOf(mem.chain, mem.level) === false && a.beliefs.some(b => b.type === 'innocent' && b.about === mem.about) ? ' That was not true, was it?' : ' I have been thinking about it.');
      else if (mem.kind === 'helped_me') t = 'You helped me ' + when + '. I have not forgotten.';
      else if (mem.kind === 'damage') t = 'I saw what you did to the ' + mem.placeName + ' ' + when + '.';
      else if (mem.kind === 'worked_with_you') t = 'Good work ' + when + '. Come back any time.';
      else if (mem.kind === 'heard') t = 'People say ' + mem.text.replace(/^.*? told me /, '').replace(/\.$/, '') + '. Is that true?';
      out.push({ who: a.id, text: t || Sim.line(a, 'hi', { name: 'friend' }) });
    } else out.push({ who: a.id, text: Sim.line(a, 'hi', { name: r[0] > 30 ? 'friend' : 'newcomer' }) });
  }
  relAdj(a, PID, 'familiarity', 4);
  return out;
};

Sim.playerNews = function (pid, id) { PID = pid; ctxFor(arguments[1]);
  const s = S(); const a = s.byId[id]; const L = [];
  const lis = playerListener();
  const r = rel(a, PID);
  if (r[0] < -25 && a.p.agreeableness < 0.7) { L.push({ who: a.id, text: 'Why would I tell you anything?' }); return L; }
  let best = null, bs = 0.04;
  for (const b of a.beliefs) {
    if (b.about === PID) continue;
    if (b.told.includes(PID)) continue;
    if (b.type === 'secret' && (a.p.loyalty > 0.6 || r[0] < 40) && a.id !== 'nora') continue;
    if (b.type === 'secret' && b.about === a.id) continue;
    const sc = Math.abs(CLAIMS[b.type].val) * b.conf * (0.6 + b.level * 0.2) * Math.exp(-(s.t - b.t) / DAY / 3);
    if (sc > bs) { bs = sc; best = b; }
  }
  if (!best) { L.push({ who: a.id, text: Sim.line(a, 'small', { name: 'you' }) || 'Nothing new.' }); return L; }
  const C = CLAIMS[best.type];
  let level = best.level; if (level < C.ladder.length - 1 && rnd() < (1 - a.p.honesty) * 0.3) level++;
  const claim = Sim.claimText(best, level, PID);
  L.push({ who: a.id, text: Sim.line(a, 'gossip', { claim, name: 'you' }) });
  best.told.push(PID);
  lis.beliefs.push({ type: best.type, about: best.about, place: best.place, level, conf: best.conf, src: a.id, chain: best.chain, t: s.t });
  if (best.chain && s.rumors[best.chain]) s.rumors[best.chain].hops.push({ from: a.id, to: PID, t: s.t, level, conf: best.conf, cat: 'player' });
  if (best.secretId && s.secrets[best.secretId] && !s.secrets[best.secretId].knownBy.includes(PID)) s.secrets[best.secretId].knownBy.push(PID);
  knowLog(a, a.name + ' told you ' + claim + '.');
  relAdj(a, PID, 'familiarity', 3);
  return L;
};

Sim.playerOpinion = function (pid, id, subj) { PID = pid; ctxFor(arguments[1]);
  const s = S(); const a = s.byId[id]; const L = [];
  if (subj === a.id) { L.push({ who: a.id, text: 'Me? ' + (a.mood > 0.3 ? 'Never better.' : a.mood < -0.3 ? 'Honestly, not great.' : 'Getting by.') }); return L; }
  const r = rel(a, subj); const nm = nameOf(subj, PID);
  const sum = a.summaries[subj];
  const bel = a.beliefs.filter(b => b.about === subj && b.conf > 0.3).sort((x, y) => Math.abs(CLAIMS[y.type].val) * y.conf - Math.abs(CLAIMS[x.type].val) * x.conf)[0];
  let t;
  if (sum && rnd() < 0.6) t = sum.replace(/them/g, nm === 'you' ? 'you' : 'them');
  else if (r[0] > 40) t = nm + '? Good person. I trust them.';
  else if (r[0] < -30) t = 'I would not turn my back on ' + nm + '.';
  else if (r[1] > 40) t = 'I am fond of ' + nm + '.';
  else if (r[RI.resentment] > 35) t = 'Do not get me started on ' + nm + '.';
  else t = nm + '? We get along well enough.';
  L.push({ who: a.id, text: cap(t) });
  if (bel && (rnd() < 0.7 || r[0] < 0)) L.push({ who: a.id, text: 'And between us, ' + Sim.claimText(bel, bel.level, PID) + '.' });
  knowLog(a, a.name + ' on ' + nm + ': ' + L.map(x => x.text).join(' '));
  return L;
};

const TELLABLE = { theft: 1, fraud: 1, liar: 1, helped: 1, skips: 1, corrupt: 1, innocent: 1, damage: 1 };
Sim.playerTell = function (pid, id, claim) { PID = pid; ctxFor(arguments[1]);
  const s = S(); const a = s.byId[id]; const L = [];
  if (!TELLABLE[claim.type] || !s.byId[claim.about]) return [{ who: a.id, text: 'What are you talking about?' }];
  const C = CLAIMS[claim.type];
  const level = clamp(claim.level | 0, 0, C.ladder.length - 1);
  const nb = { type: claim.type, about: claim.about, place: claim.place || null, other: claim.other || null, level };
  // is it true?
  let truth = null;
  if (claim.type === 'theft') truth = level <= 1 ? s.crimes.some(c => c.thief === claim.about) : s.crimes.some(c => c.thief === claim.about && c.place === claim.place);
  else if (claim.type === 'fraud') truth = s.byId[claim.about].habit === 'fraud';
  else if (claim.type === 'corrupt') truth = s.byId[claim.about].habit === 'embezzle';
  else if (claim.type === 'skips') truth = s.byId[claim.about].shiftsMissed > 0;
  else if (claim.type === 'helped') truth = s.byId[claim.about].stats.helped > 0;
  const chain = Sim.newChain({ type: claim.type, about: claim.about, place: claim.place, by: PID, level, truth, how: '' + PN() + '' });
  const txt = Sim.claimText(nb, level, a.id);
  const cat = Sim.interpretCategory(a, nb, PID);
  const tr = rel(a, PID)[0];
  let conf = clamp(0.25 + tr / 120 + a.p.agreeableness * 0.15, 0.05, 0.85) * ({ confirm: 1.35, defend: 0.25, shrug: 0.6, deny: 0 }[cat] || 1);
  // they may know better
  const contra = a.beliefs.find(b => b.about === claim.about && (b.type === 'innocent' || b.type === 'helped') && b.conf > 0.6 && C.val < 0);
  const witnessedOther = claim.type === 'theft' && a.beliefs.find(b => b.type === 'theft' && b.place === claim.place && b.level >= 3 && b.src === 'witness' && b.about !== claim.about);
  if (claim.about === a.id) {
    L.push({ who: a.id, text: C.val < 0 ? Sim.line(a, 'deny', {}) + ' Who told you that?' : 'Ha! Kind of you to say.' });
    relAdj(a, PID, C.val < 0 ? 'resentment' : 'affection', C.val < 0 ? 12 : 6);
  } else if (witnessedOther) {
    L.push({ who: a.id, text: 'That is not what happened. I saw ' + nameOf(witnessedOther.about) + ' there myself.' });
    relAdj(a, PID, 'trust', -10);
  } else if (contra) {
    L.push({ who: a.id, text: 'I do not believe that for a second.' });
    relAdj(a, PID, 'trust', -6);
  } else {
    const key = { confirm: 'believe', defend: 'doubt', story: 'story', political: 'political', shrug: 'shrug', neutral: conf > 0.35 ? 'believe' : 'doubt' }[cat];
    L.push({ who: a.id, text: Sim.line(a, key, { subj: nameOf(claim.about), name: 'you', price: Sim.breadPrice().toFixed(1) }) });
    Sim.addBelief(a, Object.assign(nb, { conf, src: PID, chain, hops: 1 }));
    s.rumors[chain].hops.push({ from: PID, to: a.id, t: s.t, level, conf: Math.round(conf * 100) / 100, cat });
  }
  Sim.remember(a, { text: PN(1) + ' told me ' + txt + '.', kind: 'heard_from_you', claim: Sim.claimText(nb, level, PID), chain, level, about: claim.about, actor: PID, imp: 0.55, val: C.val * 0.4 });
  relAdj(a, PID, 'familiarity', 4);
  PL().told.push({ t: s.t, to: a.id, claim: txt, truth, chain });
  knowLog(a, 'You told ' + a.name + ' that ' + Sim.claimText(nb, level, PID) + '.');
  Sim.emit({ type: 'PLAYER_INTERACTION', actor: PID, target: a.id, imp: 0.45, text: PN(1) + ' told ' + a.name + ' that ' + Sim.claimText(nb, level, 'x') + '.', truth: truth === null ? '' : truth ? 'That is true.' : 'That is false.' });
  return L;
};

Sim.playerAccuse = function (pid, id, suspect) { PID = pid; ctxFor(arguments[1]);
  const s = S(); const a = s.byId[id];
  if (a.job !== 'guard' && a.job !== 'nightguard') return Sim.playerTell(id, { type: 'theft', about: suspect, level: 2, place: (s.cases.find(c => c.status === 'open') || s.crimes[s.crimes.length - 1] || {}).place || 'store' });
  const c = s.cases.filter(k => k.status === 'open').sort((x, y) => y.opened - x.opened)[0];
  if (!c) return [{ who: a.id, text: 'Accuse them of what? Nothing has been reported.' }];
  const tr = (rel(a, PID)[0] + 60) / 120;
  c.evidence.push({ suspect, w: 0.45 * tr, src: PID, note: PN(1) + ' accused ' + nameOf(suspect) });
  const chain = Sim.newChain({ type: 'theft', about: suspect, place: c.place, by: PID, level: 2, truth: s.crimes.some(x => x.id === c.crimeId && x.thief === suspect), how: 'accusation' });
  Sim.addBelief(a, { type: 'theft', about: suspect, place: c.place, level: 2, conf: 0.5 * tr, src: PID, chain });
  Sim.remember(a, { text: PN(1) + ' accused ' + nameOf(suspect) + ' of the ' + placeName(c.place) + ' theft.', kind: 'heard_from_you', claim: nameOf(suspect) + ' robbed the ' + placeName(c.place), chain, level: 2, about: suspect, actor: PID, imp: 0.6, val: -0.3 });
  evaluateCase(c, a);
  knowLog(a, 'You accused ' + nameOf(suspect) + ' to ' + a.name + '.');
  return [{ who: a.id, text: c.status === 'solved' ? 'That settles it. I am bringing ' + nameOf(suspect) + ' in.' : 'I will weigh that. ' + (tr < 0.5 ? 'I do not know you well, though.' : 'Thank you.') }];
};

Sim.playerGive = function (pid, id, what) { PID = pid; ctxFor(arguments[1]);
  const s = S(); const a = s.byId[id]; const p = PL();
  let gave = '';
  if (what === 'bread' && p.inv.bread > 0) { p.inv.bread--; a.inv.bread++; gave = 'a loaf of bread'; a.needs.hunger = Math.min(1, a.needs.hunger + 0.1); }
  else if (what === 'coins' && p.money >= 5) { p.money -= 5; a.money += 5; gave = '5 coins'; }
  if (!gave) return [{ who: a.id, text: 'You have nothing to give.' }];
  const needy = a.needs.hunger < 0.4 || a.money < 10;
  relAdj(a, PID, 'trust', needy ? 10 : 5); relAdj(a, PID, 'affection', needy ? 12 : 6);
  Sim.remember(a, { text: PN(1) + ' gave me ' + gave + (needy ? ' when I needed it.' : '.'), kind: 'helped_me', about: PID, actor: PID, imp: needy ? 0.8 : 0.5, val: 0.8 });
  const chain = Sim.newChain({ type: 'helped', about: PID, other: a.id, by: a.id, level: 0, truth: true, how: 'gift' });
  Sim.addBelief(a, { type: 'helped', about: PID, other: a.id, level: 0, conf: 0.9, src: 'self', chain }, null, true);
  Sim.emit({ type: 'PLAYER_INTERACTION', actor: PID, target: a.id, imp: 0.4, x: a.x, z: a.z, text: PN(1) + ' gave ' + a.name + ' ' + gave + '.' }, (w) => {
    if (w === a) return;
    Sim.addBelief(w, { type: 'helped', about: PID, other: a.id, level: 0, conf: 0.7, src: 'witness', chain });
  });
  knowLog(a, 'You gave ' + a.name + ' ' + gave + '.');
  return [{ who: a.id, text: Sim.line(a, 'thank', { name: 'you' }) }];
};

Sim.playerBuy = function (pid, id) { PID = pid; ctxFor(arguments[1]);
  const s = S(); const a = s.byId[id]; const p = PL(); const h = hourOf(s.t);
  const shopId = Object.keys(s.shops).find(k => s.shops[k].owner === a.id) || Sim.vp({ baker: 'bakery', shopkeeper: 'store', merchant: a.shopId || 'market', bartender: 'tavern' }[a.job], a.vid);
  const sh = s.shops[shopId];
  if (!sh || !sh.sells.some(g => g === 'bread' || g === 'meal')) return [{ who: a.id, text: 'I do not sell bread.' }];
  if (!Sim.shopOpen(shopId, h)) return [{ who: a.id, text: 'We are closed. Come back at ' + sh.open[0] + ':00.' }];
  if (!(sh.stock.bread > 0)) return [{ who: a.id, text: 'Sold out, sorry.' }];
  const price = shopPrice(shopId, 'bread') * (1 - s.town.subsidy);
  if (p.money < price) return [{ who: a.id, text: 'That is ' + price.toFixed(1) + ' coins. You are short.' }];
  p.money -= price; sh.stock.bread--; p.inv.bread++; const o = s.byId[sh.owner]; if (o) o.money += shopPrice(shopId, 'bread');
  relAdj(a, PID, 'familiarity', 2); relAdj(a, PID, 'affection', 1);
  return [{ who: a.id, text: 'One loaf, ' + price.toFixed(1) + ' coins. ' + (a.p.greed > 0.7 ? 'Pleasure doing business.' : 'Enjoy it.') }];
};

Sim.playerWork = function (pid, id) { PID = pid; ctxFor(arguments[1]);
  const s = S(); const a = s.byId[id]; const p = PL();
  const J = AV.JOBS[a.job] || {};
  if (!J.gather && !['builder', 'baker', 'blacksmith'].includes(a.job)) return { lines: [{ who: a.id, text: 'There is no work for you here.' }], minutes: 0 };
  if (p.workedDay === dayOf(s.t) && p.workedWith === a.id) return { lines: [{ who: a.id, text: 'You already put in a shift today. Come back tomorrow.' }], minutes: 0 };
  if (!isWorkHour(a)) return { lines: [{ who: a.id, text: 'Not now. Come by during working hours.' }], minutes: 0 };
  const pay = 5 + Math.round(rnd() * 3);
  p.money += pay;
  relAdj(a, PID, 'trust', 6); relAdj(a, PID, 'respect', 8); relAdj(a, PID, 'affection', 3);
  p.workedDay = dayOf(s.t); p.workedWith = a.id;
  if (J.gather) { const g = J.gather[0] === 'fish' ? 'food' : J.gather[0]; s.econ.stock[g] = (s.econ.stock[g] || 0) + 3; }
  else if (a.job === 'baker') { const b = s.shops[Sim.vp('bakery', a.vid)]; if (b) b.stock.bread += 3; }
  else if (a.job === 'builder') { const pr = AV.Civ.projectFor(a); if (pr) a.workAcc = (a.workAcc || 0) + 6; }
  Sim.remember(a, { text: PN(1) + ' worked alongside me for an hour.', kind: 'worked_with_you', about: PID, actor: PID, imp: 0.55, val: 0.6 });
  Sim.addBelief(a, { type: 'helped', about: PID, other: a.id, level: 0, conf: 0.85, src: 'self' }, null, true);
  knowLog(a, 'You worked an hour with ' + a.name + ' for ' + pay + ' coins.');
  return { lines: [{ who: a.id, text: 'Good hands. Here, ' + pay + ' coins.' }], minutes: 60 };
};
function isWorkHour(a) { return Sim.isWorkTime(a, hourOf(S().t)); }

Sim.playerSupport = function (pid, id, cand) { PID = pid; ctxFor(arguments[1]);
  const s = S(); const a = s.byId[id];
  if (!s.election.candidates.includes(cand)) return [{ who: a.id, text: nameOf(cand) + ' is not even running.' }];
  const tr = (rel(a, PID)[0] + 50) / 100;
  a.support[cand] = clamp((a.support[cand] || 0) + 0.18 * tr, 0, 1);
  const sc = Sim.voteScores(a); const best = Object.entries(sc).sort((x, y) => y[1] - x[1])[0];
  Sim.remember(a, { text: PN(1) + ' asked me to vote for ' + nameOf(cand) + '.', kind: 'heard_from_you', claim: 'I should vote for ' + nameOf(cand), about: cand, actor: PID, imp: 0.4, val: 0 });
  knowLog(a, 'You asked ' + a.name + ' to vote for ' + nameOf(cand) + '.');
  if (cand === a.id) return [{ who: a.id, text: 'Ha! Well, I appreciate that.' }];
  return [{ who: a.id, text: best && best[0] === cand ? 'I was leaning that way anyway.' : tr > 0.7 ? 'Hm. You make a fair point. I will think about it.' : 'I make up my own mind, thank you.' }];
};
Sim.playerVote = function (pid, cand) { PID = pid; ctxFor(arguments[1]);
  const s = S(); const d = dayOf(s.t);
  if (d !== s.election.day) return 'Voting is on day ' + s.election.day + '.';
  if (PL().votedDay === d) return 'You already voted.';
  if (!s.election.candidates.includes(cand)) return 'Not a candidate.';
  s.election.votes[PID] = cand; PL().votedDay = d;
  Sim.emit({ type: 'PLAYER_INTERACTION', actor: PID, imp: 0.4, text: PN(1) + ' voted for ' + nameOf(cand) + '.' });
  return 'You cast your vote for ' + nameOf(cand) + '.';
};
Sim.playerCase = function (pid, id) { PID = pid; ctxFor(arguments[1]);
  const s = S(); const a = s.byId[id];
  const bels = a.beliefs.filter(b => (b.type === 'theft' || b.type === 'arrested' || b.type === 'innocent') && b.conf > 0.2).sort((x, y) => y.t - x.t).slice(0, 2);
  if (!bels.length) return [{ who: a.id, text: 'I do not know anything about any theft.' }];
  if (rel(a, PID)[0] < -20) return [{ who: a.id, text: 'Why do you want to know?' }];
  const L = bels.map(b => ({ who: a.id, text: (b.src === 'witness' ? 'I saw it myself: ' : b.src === 'news' ? 'The Post says ' : 'I heard ') + Sim.claimText(b, b.level, PID) + '.' }));
  for (const b of bels) { knowLog(a, a.name + ': ' + Sim.claimText(b, b.level, PID)); PL().beliefs = PL().beliefs || []; PL().beliefs.push({ type: b.type, about: b.about, place: b.place, level: b.level, conf: b.conf, src: a.id, chain: b.chain, t: s.t }); }
  return L;
};

// property damage by the player
Sim.playerBlock = function (pid, x, y, z, action, prev) { PID = pid; ctxFor(arguments[1]);
  const s = S();
  if (action !== 'break') return;
  const vid = World.villageAt(x, z, 4); if (vid) Sim.useVillage(vid);
  const b = World.placeAt(x, z) || Object.values(s.extraPlaces).find(p => p.x !== undefined && x >= p.x && x < p.x + p.w && z >= p.z && z < p.z + p.d);
  const pl = vid && Sim.place('plaza', vid);
  const inPlaza = pl && Math.abs(x - pl.center[0]) < 9 && Math.abs(z - pl.center[1]) < 9;
  const proj = s.projects.find(p => !p.done && x >= p.lot.x && x < p.lot.x + p.lot.w && z >= p.lot.z && z < p.lot.z + p.lot.d);
  if (!b && !inPlaza && !proj) return;
  const placeId = b ? b.id : proj ? proj.siteId : pl.id;
  const prop = b && Object.values(s.properties).find(q => q.placeId === b.id);
  const owner = b && s.shops[b.id] ? s.shops[b.id].owner : prop ? prop.owner : proj ? proj.owner : null;
  if (prop) prop.condition = Math.max(0, prop.condition - 2);
  PL().damage = (PL().damage || 0) + 1;
  if (PL().lastDamage && s.t - PL().lastDamage < 15) return;
  PL().lastDamage = s.t;
  const pn = b ? b.name : proj ? proj.name : 'Village Square';
  const chain = Sim.newChain({ type: 'damage', about: PID, place: placeId, by: 'witness', level: 0, truth: true, how: 'witnessed' });
  Sim.emit({ type: 'PROPERTY_DAMAGE', actor: PID, place: placeId, imp: 0.55, x, y, z, heat: 'crime', radius: 14, text: PN(1) + ' broke a block at the ' + pn + '.' }, (w, d) => {
    Sim.addBelief(w, { type: 'damage', about: PID, place: placeId, level: PL().damage > 6 ? 1 : 0, conf: 0.85, src: 'witness', chain });
    Sim.remember(w, { text: 'I saw ' + PN() + ' breaking the ' + pn + '.', kind: 'damage', placeName: pn, about: PID, actor: PID, imp: 0.65, val: -0.6 });
    relAdj(w, PID, 'trust', -6); relAdj(w, PID, 'respect', -4);
    if (w.id === owner) { relAdj(w, PID, 'resentment', 18); Sim.setThought(w, 'That is MY ' + pn + '!'); Sim.sayBubble(w, 'Hey! Stop that!'); }
    else if (w.job === 'guard' || w.job === 'nightguard') { Sim.sayBubble(w, 'You there! That is village property.'); Sim.setThought(w, PN(1) + ' is trouble.'); }
    else Sim.setThought(w, 'What is ' + PN() + ' doing?');
  });
};

// ============ LLM: prompts + validation ============
const ALLOWED = ['talk_to', 'work', 'eat', 'sleep', 'buy', 'visit', 'investigate', 'campaign', 'spread_rumor', 'help', 'steal', 'avoid', 'follow', 'socialize', 'rest', 'protest', 'vote', 'build', 'repair'];
Sim.ALLOWED_ACTIONS = ALLOWED;
function traitWords(a) {
  const w = [];
  const p = a.p;
  const pairs = [['ambition', 'ambitious', 'unambitious'], ['honesty', 'honest', 'dishonest'], ['empathy', 'caring', 'cold'], ['greed', 'greedy', 'generous'], ['laziness', 'lazy', 'hard-working'], ['curiosity', 'curious', 'incurious'], ['courage', 'brave', 'timid'], ['sociability', 'sociable', 'withdrawn'], ['neuroticism', 'anxious and suspicious', 'calm'], ['loyalty', 'loyal', 'fickle'], ['jealousy', 'jealous', 'content with what they have']];
  for (const [k, hi, lo] of pairs) { if (p[k] >= 0.75) w.push(hi); else if (p[k] <= 0.2) w.push(lo); }
  return w.join(', ');
}
function relWords(a, id) { const r = rel(a, id); return 'trust ' + Math.round(r[0]) + ', affection ' + Math.round(r[1]) + ', respect ' + Math.round(r[2]) + ', fear ' + Math.round(r[3]) + ', resentment ' + Math.round(r[5]) + ', familiarity ' + Math.round(r[7]) + ' (scale -100..100)'; }
function situation(a) {
  const s = S(); const pl = a.plan && a.plan.place ? placeName(a.plan.place) : 'out and about';
  return 'Day ' + dayOf(s.t) + ', ' + Sim.fmtClock(s.t) + ', weather ' + (s.weather.drought ? 'drought' : s.weather.kind) + '. You are ' + (a.plan ? a.plan.type : 'idle') + ' (' + pl + '). Bread costs ' + Sim.breadPrice().toFixed(1) + ' coins (' + Math.round((Sim.breadRatio() - 1) * 100) + '% vs normal). Mayor: ' + nameOf(s.town.mayor) + '. Election on day ' + s.election.day + ' between ' + s.election.candidates.map(c => nameOf(c)).join(' and ') + '. You have ' + Math.round(a.money) + ' coins, ' + a.inv.bread + ' bread. Hunger ' + Math.round(a.needs.hunger * 100) + '%, energy ' + Math.round(a.needs.energy * 100) + '%.';
}
function goalWords(a) { return a.goals.map(g => g.type.replace(/_/g, ' ').toLowerCase() + (g.target ? ' (' + nameOf(g.target) + ')' : '') + (g.primary ? ' [primary]' : '')).join('; '); }
function mentioned(text) { const s = S(); const t = (text || '').toLowerCase(); return s.agents.filter(a => t.includes(a.name.toLowerCase())).map(a => a.id); }

Sim.buildDialoguePrompt = function (pid, a, msg, history) {
  PID = pid; Sim.useVillage(a.vid);
  const s = S();
  const ids = mentioned(msg).concat(mentioned((history || []).map(h => h.text).join(' ')));
  const mems = Sim.recall(a, m => m.about === PID || m.actor === PID || ids.includes(m.about) || ids.includes(m.actor), 6);
  const bels = a.beliefs.filter(b => ids.includes(b.about) || b.about === PID).concat(a.beliefs.slice().sort((x, y) => y.conf * Math.abs(CLAIMS[y.type].val) - x.conf * Math.abs(CLAIMS[x.type].val)).slice(0, 4));
  const uniq = []; const seen = new Set(); for (const b of bels) if (!seen.has(b.id)) { seen.add(b.id); uniq.push(b); }
  const secrets = a.secrets.map(id => s.secrets[id].text);
  const r = rel(a, PID);
  const lines = [];
  lines.push('You are role-playing ' + a.name + ', age ' + a.age + ', of ' + s.villages[a.vid].name + ' (' + s.villages[a.vid].theme.toLowerCase() + '), the ' + AV.JOBS[a.job].label.toLowerCase() + ' in a small voxel village. Stay in character. You only know what is listed here; you do not know hidden truths about other people.');
  lines.push('PERSONALITY: ' + (traitWords(a) || 'unremarkable') + '. ' + (a.bio || ''));
  lines.push('VOICE EXAMPLES (match this voice, do not copy): ' + [Sim.line(a, 'hi', { name: 'friend' }), Sim.line(a, 'small', {}), Sim.line(a, 'shrug', {})].join(' | '));
  lines.push('VALUES (0-1): ' + Object.entries(a.v).map(([k, v]) => k + ' ' + v.toFixed(1)).join(', '));
  lines.push('GOALS: ' + goalWords(a));
  lines.push('MOOD: ' + a.moodLabel + ' (' + a.mood.toFixed(2) + ').');
  lines.push('YOUR RELATIONSHIP WITH THE NEWCOMER (the person talking to you): ' + relWords(a, PID) + '.' + (a.summaries[PID] ? ' ' + a.summaries[PID] : ''));
  lines.push('RELEVANT MEMORIES:\n' + (mems.length ? mems.map(m => '- [day ' + dayOf(m.t) + '] ' + m.text).join('\n') : '- none'));
  lines.push('WHAT YOU BELIEVE (with confidence):\n' + (uniq.length ? uniq.map(b => '- id ' + b.id + ': ' + Sim.claimText(b, b.level) + ' (' + Math.round(b.conf * 100) + '%, heard from ' + (b.src === 'self' ? 'own observation' : b.src === 'witness' ? 'seeing it yourself' : b.src === 'news' ? 'the Village Post' : nameOf(b.src)) + ')').join('\n') : '- nothing notable'));
  for (const id of ids) lines.push('ABOUT ' + nameOf(id).toUpperCase() + ': ' + relWords(a, id) + (a.summaries[id] ? '. ' + a.summaries[id] : ''));
  if (secrets.length) lines.push('YOUR PRIVATE SECRETS (never reveal unless trust in the newcomer is above 60 and it serves you; you may lie to protect them): ' + secrets.join(' '));
  lines.push('SITUATION: ' + situation(a));
  lines.push('Villager ids you may reference: ' + s.agents.filter(x => !x.left).map(x => x.id).join(', ') + ', you (the newcomer). Places in your village: bakery, store, market, tavern, forge, townhall, guard, clinic, post, storehouse, farm, plaza.');
  if (history && history.length) lines.push('CONVERSATION SO FAR:\n' + history.slice(-8).map(h => (h.who === 'you' ? 'Newcomer: ' : a.name + ': ') + h.text).join('\n'));
  lines.push('The newcomer now says: "' + String(msg).slice(0, 400) + '"');
  lines.push('Reply with ONLY a JSON object: {"reply": string (1-3 short casual sentences, in your own voice, no stage directions), "emotion": one word, "trust_delta": integer -10..10 (how this exchange changes your trust in the newcomer), "affection_delta": integer -10..10, "learned": array (claims the newcomer just told you about a villager, may be empty) of {"about": villager id, "type": one of theft|fraud|corrupt|liar|helped|skips|damage|innocent, "level": 0-3 (0 = mild, 3 = certain/severe), "place": place id or null, "believe": number 0-1}, "shared_belief_id": the id of one belief from your list you revealed in this reply, or null}.');
  return lines.join('\n\n');
};

Sim.applyDialogue = function (pid, a, msg, j) {
  PID = pid; Sim.useVillage(a.vid);
  const s = S();
  if (!j || typeof j !== 'object' || typeof j.reply !== 'string') return { ok: false, error: 'missing reply' };
  const reply = j.reply.replace(/\s+/g, ' ').trim().slice(0, 320);
  const td = clamp(Math.round(+j.trust_delta || 0), -10, 10), ad = clamp(Math.round(+j.affection_delta || 0), -10, 10);
  relAdj(a, PID, 'trust', td); relAdj(a, PID, 'affection', ad); relAdj(a, PID, 'familiarity', 4);
  const applied = [];
  if (Array.isArray(j.learned)) for (const c of j.learned.slice(0, 3)) {
    if (!c || !TELLABLE[c.type] || !s.byId[c.about] || c.about === a.id) continue;
    const C = CLAIMS[c.type];
    const level = clamp(c.level | 0, 0, C.ladder.length - 1);
    const place = Sim.vp(c.place) || null;
    const conf = clamp(+c.believe || 0.3, 0, 0.9);
    const chain = Sim.newChain({ type: c.type, about: c.about, place, by: PID, level, truth: null, how: 'a visitor (free talk)' });
    if (conf > 0.05) Sim.addBelief(a, { type: c.type, about: c.about, place, level, conf, src: PID, chain, hops: 1 });
    const nb = { type: c.type, about: c.about, place, level };
    Sim.remember(a, { text: PN(1) + ' told me ' + Sim.claimText(nb, level) + '.', kind: 'heard_from_you', claim: Sim.claimText(nb, level, PID), chain, level, about: c.about, actor: PID, imp: 0.55, val: C.val * 0.4 });
    (PL().told = PL().told || []).push({ t: s.t, to: a.id, claim: Sim.claimText(nb, level), truth: Sim.truthOf(chain, level), chain }); if (PL().told.length > 30) PL().told.shift();
    applied.push(Sim.claimText(nb, level));
  }
  if (j.shared_belief_id) { const b = a.beliefs.find(x => String(x.id) === String(j.shared_belief_id)); if (b && !b.told.includes(PID)) { b.told.push(PID); PL().beliefs = PL().beliefs || []; PL().beliefs.push({ type: b.type, about: b.about, place: b.place, level: b.level, conf: b.conf, src: a.id, chain: b.chain, t: s.t }); knowLog(a, a.name + ' told you ' + Sim.claimText(b, b.level, PID) + '.'); } }
  Sim.remember(a, { text: PN(1) + ' said to me: "' + String(msg).slice(0, 90) + '"', kind: 'talked_with_you', about: PID, actor: PID, imp: 0.35 + Math.abs(td) * 0.03, val: (td + ad) / 20 });
  knowLog(a, a.name + ' said: ' + reply);
  Sim.sayBubble(a, reply);
  return { ok: true, reply, emotion: String(j.emotion || '').slice(0, 20), applied, td, ad };
};

Sim.buildDecisionPrompt = function (a) {
  Sim.useVillage(a.vid);
  const s = S();
  const C = (function () { try { return null; } catch (e) { return null; } })(); void C;
  const near = s.agents.filter(o => o !== a && !o.left && Math.hypot(o.x - a.x, o.z - a.z) < 25).slice(0, 8);
  const top = Sim.topRelations(a, 3);
  const mems = Sim.recall(a, () => true, 8);
  const bels = a.beliefs.slice().sort((x, y) => y.conf * Math.abs(CLAIMS[y.type].val) - x.conf * Math.abs(CLAIMS[x.type].val)).slice(0, 6);
  const lines = [];
  lines.push('You decide the next high-level action for ' + a.name + ', the ' + AV.JOBS[a.job].label.toLowerCase() + ' of ' + s.villages[a.vid].name + ' (' + s.villages[a.vid].theme.toLowerCase() + '), in an autonomous civilization simulation with five villages. Think as this specific person would, from their personality, values, goals, memories, beliefs and situation. They do not know anything beyond what is listed.');
  lines.push('PERSONALITY: ' + (traitWords(a) || 'unremarkable') + '. Big five: ' + ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'].map(k => k + ' ' + a.p[k].toFixed(1)).join(', ') + '.');
  lines.push('VALUES: ' + Object.entries(a.v).map(([k, v]) => k + ' ' + v.toFixed(1)).join(', '));
  lines.push('GOALS: ' + goalWords(a));
  lines.push('MOOD: ' + a.moodLabel + '. NEEDS (1 = satisfied): ' + Object.entries(a.needs).map(([k, v]) => k + ' ' + v.toFixed(2)).join(', '));
  lines.push('CLOSEST: ' + top.friends.map(f => nameOf(f.id) + ' (' + relWords(a, f.id) + ')').join('; ') + '. RIVALS: ' + (top.rivals.map(f => nameOf(f.id) + ' (' + relWords(a, f.id) + ')').join('; ') || 'none'));
  lines.push('RECENT MEMORIES:\n' + mems.map(m => '- [day ' + dayOf(m.t) + ' ' + Sim.fmtClock(m.t) + '] ' + m.text).join('\n'));
  lines.push('BELIEFS:\n' + (bels.map(b => '- ' + Sim.claimText(b, b.level) + ' (' + Math.round(b.conf * 100) + '%)').join('\n') || '- none'));
  lines.push('PEOPLE NEARBY: ' + (near.map(o => o.id + ' (' + o.name + ', ' + (o.plan ? o.plan.type : 'idle') + ')').join(', ') || 'nobody'));
  lines.push('SITUATION: ' + situation(a));
  lines.push('The simulation\'s own utility scores for the top options were: ' + (a.decisions[0] ? a.decisions[0].top.map(x => x[0] + ' ' + x[1]).join(', ') : 'n/a') + '. You may agree or choose differently.');
  lines.push('Allowed actions: ' + ALLOWED.join(', ') + '. Places: home, bakery, store, market, tavern, forge, townhall, guard, clinic, post, farm, mine, plaza, river, forest.');
  lines.push('Reply with ONLY a JSON object: {"action": one allowed action, "target": villager id or null, "place": place id or null, "intent": short phrase, "reason": one sentence, "emotionalState": one word, "thought": a short private thought in their voice (max 12 words)}.');
  return lines.join('\n\n');
};

Sim.applyDecision = function (a, j) {
  Sim.useVillage(a.vid);
  const s = S();
  if (!j || typeof j !== 'object') return { ok: false, error: 'not an object' };
  const act = String(j.action || '');
  if (!ALLOWED.includes(act)) return { ok: false, error: 'action "' + act + '" is not allowed' };
  const tgt = j.target && s.byId[j.target] && j.target !== a.id && !s.byId[j.target].left ? j.target : null;
  let place = j.place === 'home' ? a.home : j.place;
  place = place ? Sim.vp(place) : null;
  const h = hourOf(s.t);
  const reason = String(j.reason || '').slice(0, 160), thought = String(j.thought || '').slice(0, 90);
  let plan = null;
  switch (act) {
    case 'talk_to': case 'socialize':
      if (act === 'talk_to') { if (!tgt) return { ok: false, error: 'talk_to needs a valid target' }; plan = { type: 'talk_to', target: tgt, intent: 'chat' }; }
      else plan = { type: 'socialize', place: place || Sim.vp(h >= 17 ? 'tavern' : 'plaza') };
      break;
    case 'spread_rumor': {
      if (!tgt) return { ok: false, error: 'spread_rumor needs a target listener' };
      const bel = Sim.bestShare(a, s.byId[tgt]); if (!bel) return { ok: false, error: 'has nothing to gossip about' };
      plan = { type: 'gossip', target: tgt, belief: bel.id, intent: 'gossip' }; break;
    }
    case 'work': case 'repair': plan = { type: 'work', place: a.work || 'plaza', until: s.t + 120 }; if (!a.work) return { ok: false, error: 'has no job' }; break;
    case 'build': if (a.job !== 'builder') return { ok: false, error: 'only builders can build' }; plan = { type: 'work', place: (s.projects.find(p => !p.done) || {}).siteId || 'plaza', until: s.t + 120 }; break;
    case 'eat': { const sel = Sim.chooseSeller(a, 'bread', h); plan = a.inv.bread > 0 ? { type: 'eat', place: null } : sel ? { type: 'eat', place: sel.id, shop: sel.id } : null; if (!plan) return { ok: false, error: 'no food and no open seller' }; break; }
    case 'buy': { const sel = Sim.chooseSeller(a, 'tools', h) || Sim.chooseSeller(a, 'bread', h); if (!sel) return { ok: false, error: 'nothing open' }; plan = { type: sel.good === 'tools' ? 'buy' : 'eat', place: sel.id, shop: sel.id, item: sel.good }; break; }
    case 'sleep': plan = { type: 'sleep', place: a.home }; break;
    case 'rest': plan = { type: 'rest', place: a.home }; break;
    case 'visit': plan = { type: 'visit', place: place || 'plaza' }; break;
    case 'investigate': {
      if (a.job !== 'guard' && a.job !== 'nightguard' && a.job !== 'journalist') return { ok: false, error: 'only guards and journalists investigate' };
      const c = s.cases.find(k => k.status === 'open');
      if (!c) return { ok: false, error: 'no open case' };
      plan = tgt ? { type: 'investigate', step: 'interview', target: tgt, intent: a.job === 'journalist' ? 'probe' : 'testimony', caseId: c.id } : { type: 'investigate', step: 'scene', place: c.place, caseId: c.id };
      break;
    }
    case 'campaign': if (!s.election.candidates.includes(a.id)) return { ok: false, error: 'not a candidate' }; plan = tgt ? { type: 'talk_to', target: tgt, intent: 'campaign' } : { type: 'campaign', place: place || 'plaza' }; break;
    case 'help': if (!tgt) return { ok: false, error: 'help needs a target' }; plan = { type: 'help', target: tgt, intent: 'help' }; break;
    case 'follow': if (!tgt) return { ok: false, error: 'follow needs a target' }; plan = { type: 'follow', target: tgt, intent: 'follow', until: s.t + 60 }; break;
    case 'avoid': { if (!tgt) return { ok: false, error: 'avoid needs a target' }; const t = s.byId[tgt]; const far = ['river', 'forest', 'plaza', 'market', a.home].map(p => [Sim.vp(p), Sim.place(p)]).filter(x => x[1]).sort((x, y) => Math.hypot(y[1].center[0] - t.x, y[1].center[1] - t.z) - Math.hypot(x[1].center[0] - t.x, x[1].center[1] - t.z))[0]; plan = { type: 'visit', place: far[0], avoided: tgt }; break; }
    case 'steal': {
      if (!(h >= 21.5 || h < 4)) return { ok: false, error: 'the engine only allows theft attempts late at night' };
      const shop = place && s.shops[place] && s.shops[place].owner !== a.id ? place : Object.keys(s.shops).find(k => s.shops[k].owner !== a.id && s.shops[k].vid === a.vid);
      const pl = Sim.place(shop);
      plan = { type: 'steal', place: shop, spot: pl.entry, waitUntil: s.t + 20, until: s.t + 140 }; break;
    }
    case 'protest': plan = { type: 'protest', place: Sim.vp('townhall') }; break;
    case 'vote': if (dayOf(s.t) !== s.election.day) return { ok: false, error: 'not election day' }; plan = { type: 'vote', place: Sim.vp('townhall') }; break;
  }
  if (!plan) return { ok: false, error: 'could not build a plan' };
  plan.reason = reason || 'decided by the language model'; plan.thought = thought; plan.src = 'llm';
  plan.score = 99;
  a.plan = null;
  Sim.chooseAndGo(a, plan);
  return { ok: true, plan };
};

Sim.columnPrompt = function (issue) {
  const s = S(); const rose = s.byId[issue.by];
  return 'You are ' + (rose ? rose.name : 'the editor') + ', who writes, edits and prints The Village Post, a one-page daily for a village of about fifty people. Personality: ' + (rose ? traitWords(rose) : '') + '. Values truth, loves a byline and attention. Write today\'s short editor\'s column (90-130 words, plain prose, no headings, no markdown) reacting to these headlines from issue #' + issue.no + ' (day ' + issue.day + '):\n' + issue.headlines.map(h => '- ' + h.h + ': ' + h.body).join('\n') + '\nStick to what the headlines say; you may speculate, but label speculation. Sign off with your first name.';
};

Sim._priceDay = priceDay; Sim._dailyMoney = dailyMoney; Sim._mayorPolicies = mayorPolicies; Sim._findWork = findWork; Sim._tallyElection = tallyElection; Sim._secretsCheck = secretsCheck; Sim._couples = couples;

})(typeof window !== 'undefined' ? window : globalThis);
