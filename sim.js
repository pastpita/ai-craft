/* AI VILLAGE — sim.js
   Agent core: state, needs, schedules, utility-based decisions, movement, conversation,
   beliefs (separate from world truth), gossip with provenance and distortion, memory and decay,
   perception through an event bus. Economy, crime, news, politics and persistence live in society.js. */
(function (root) {
'use strict';
const AV = root.AV = root.AV || {};
const World = root.World || require('./world.js');
const B = World.B;
const DAY = 1440;
const REL = ['trust', 'affection', 'respect', 'fear', 'jealousy', 'resentment', 'attraction', 'familiarity'];
const RI = {}; REL.forEach((k, i) => { RI[k] = i; });
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = Math.random;
const pick = a => a[Math.floor(rnd() * a.length)];
const Sim = AV.Sim = AV.Sim || {};
Sim.REL = REL; Sim.RI = RI; Sim.DAY = DAY; Sim.clamp = clamp; Sim.pick = pick;
let S = null;
Sim.S = () => S;
Sim._setState = st => { S = st; };

// ---------- time helpers ----------
const hourOf = t => (t % DAY) / 60;
const dayOf = t => Math.floor(t / DAY) + 1;
const fmtClock = t => { const m = Math.floor(t % DAY); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
Sim.hourOf = hourOf; Sim.dayOf = dayOf; Sim.fmtClock = fmtClock;
const inHours = (h, ranges) => ranges.some(([a, b]) => h >= a && h < b);

// ---------- claims: what beliefs can say ----------
const CLAIMS = {
  theft:      { val: -1,   ladder: ['was hanging around the {place} at night', 'has been acting shifty near the {place}', 'probably stole from the {place}', 'robbed the {place}'] },
  skips:      { val: -0.4, ladder: ['missed a shift', 'keeps skipping work', 'never does a day of work'] },
  fraud:      { val: -0.8, ladder: ['sells odd-tasting flour', 'cheats customers', 'cuts the flour with chalk'] },
  corrupt:    { val: -1,   ladder: ['is careless with the treasury', 'is hiding something about the treasury', 'has been stealing from the treasury'] },
  secret:     { val: -0.6, ladder: ['{secret}'] },
  helped:     { val: 0.8,  ladder: ['helped {other}', 'is generous', 'is the kindest soul in the village'] },
  liar:       { val: -0.7, ladder: ['bends the truth', 'lies a lot', 'is a liar'] },
  innocent:   { val: 0.6,  ladder: ['was wrongly accused over the {place}'] },
  couple:     { val: 0.15, ladder: ['has been seen with {other}', 'is courting {other}'] },
  damage:     { val: -0.7, ladder: ['broke things around the {place}', 'vandalised the {place}'] },
  ineffective:{ val: -0.5, ladder: ['is not doing much as mayor', 'is a useless mayor'] },
  arrested:   { val: -0.9, ladder: ['was arrested over the {place} theft'] },
  supports:   { val: 0.2,  ladder: ['is backing {other} for mayor'] },
};
Sim.CLAIMS = CLAIMS;

function nameOf(id, viewer) {
  if (id === 'you') return viewer === 'you' ? 'you' : 'the newcomer';
  const a = S.byId[id]; return a ? a.name : (id || 'someone');
}
function placeName(pid) { const p = World.places[pid] || (S && S.extraPlaces && S.extraPlaces[pid]); return p ? p.name.replace(/^The /, '') .toLowerCase().replace(/^crooked lantern$/, 'tavern') : (pid || 'village'); }
Sim.nameOf = nameOf; Sim.placeName = placeName;

function claimText(b, level, listenerId) {
  const C = CLAIMS[b.type]; if (!C) return '';
  const lv = clamp(level === undefined ? b.level : level, 0, C.ladder.length - 1);
  let s = C.ladder[lv]
    .replace('{place}', placeName(b.place))
    .replace('{other}', nameOf(b.other, listenerId))
    .replace('{secret}', b.secretId && S.secrets[b.secretId] ? S.secrets[b.secretId].gossip : 'has a secret');
  const subj = b.about === listenerId ? 'you' : nameOf(b.about, listenerId);
  if (subj === 'you') s = s.replace(/^was /, 'were ').replace(/^is /, 'are ').replace(/^has /, 'have ').replace(/^keeps /, 'keep ').replace(/^never does/, 'never do').replace(/^sells/, 'sell').replace(/^cheats/, 'cheat').replace(/^cuts/, 'cut').replace(/^lies/, 'lie').replace(/^bends/, 'bend').replace(/^broke/, 'broke');
  return subj + ' ' + s;
}
Sim.claimText = claimText;
function beliefKey(b) { return b.type + ':' + b.about + ':' + (b.place || b.other || b.secretId || ''); }

// ---------- creation ----------
function rel0() { return [0, 0, 0, 0, 0, 0, 0, 0]; }
function newAgent(def, i) {
  const a = {
    id: def.id, name: def.name, surname: def.surname || '', age: def.age, job: def.job, core: !!def.core,
    p: def.p, v: def.v, bio: def.bio || '', look: def.look, voice: def.voice || def.id, habit: def.habit || null,
    needs: { hunger: 0.7 + rnd() * 0.25, energy: 0.6 + rnd() * 0.3, social: 0.5 + rnd() * 0.4, safety: 0.75, comfort: 0.7 },
    money: def.money, debt: def.debt || 0, inv: { bread: 1 + Math.floor(rnd() * 2), tools: 0 }, toolHp: 0.3 + rnd() * 0.7,
    home: null, work: null, goals: (def.goals || []).map(g => Object.assign({ progress: 0 }, g)),
    secrets: [], beliefs: [], memories: [], summaries: {}, traitsBelief: {}, rel: {}, support: {}, family: def.family ? def.family.slice() : [],
    mood: 0.2, moodLabel: 'content', x: 48, z: 48, y: World.STAND, dir: 0, jx: 0, jz: 0, speed: 2.4,
    plan: null, path: null, pi: 0, convo: null, thinkAt: 0, lod: 2, sleeping: false, jailUntil: 0, sick: false, injured: false,
    left: false, bubble: null, thought: null, decisions: [], shiftsMissed: 0, workAcc: 0, platform: def.platform || null,
    stats: { thefts: 0, convos: 0, helped: 0 }, lastAte: 0, voted: -1, hungryMins: 0, readPaper: -1, couple: null,
  };
  a.inv.tools = a.toolHp > 0 ? 1 : 0;
  return a;
}

Sim.newWorld = function () {
  World.clearEdits();
  World.generate(42);
  S = {
    v: 3, t: 6 * 60, realSaved: Date.now(), agents: [], byId: {}, nextId: 1,
    player: { id: 'you', name: 'You', money: 30, inv: { bread: 2, tools: 0 }, x: 48.5, y: World.STAND, z: 40.5, told: [], known: {}, votedDay: -1 },
    events: [], feed: [], away: [], news: [], crimes: [], cases: [], rumors: {}, convos: {}, projects: [], secrets: {},
    shops: {}, econ: {}, town: {}, election: {}, extraPlaces: {}, statsHist: [], decisionsLog: [], llmLog: [],
    flags: { protestDay: -1 }, weather: { kind: 'clear', until: 0, drought: 0, harvest: 0 }, heat: { social: {}, crime: {} },
  };
  const R = World.mulberry32(777);
  const defs = AV.CAST.map(c => Object.assign({ core: true }, JSON.parse(JSON.stringify(c))));
  // the wider village
  const jobs = AV.EXTRA_JOBS.slice();
  for (let i = 0; i < AV.EXTRA_NAMES.length; i++) {
    const r = () => R();
    const t = { openness: r(), conscientiousness: .4 + r() * .5, extraversion: r(), agreeableness: .3 + r() * .6, neuroticism: r() * .8,
      ambition: r(), greed: r() * .8, honesty: .3 + r() * .7, empathy: r(), loyalty: r(), jealousy: r() * .7, courage: r(), curiosity: r(),
      laziness: r() * .5, riskTolerance: r(), sociability: r() };
    const v = { wealth: r(), status: r(), family: r(), friendship: r(), safety: r(), truth: r(), power: r() * .6, community: r(), freedom: r() };
    const P = AV.PALETTE;
    const job = jobs[i];
    const goals = [{ type: pick(['BECOME_RICH', 'FIND_A_PARTNER', 'BECOME_POPULAR', 'PAY_OFF_DEBT']), primary: true }];
    if (job === 'unemployed') goals.unshift({ type: 'FIND_WORK', primary: true });
    if (i === 5 || i === 17) goals.unshift({ type: 'OPEN_A_SHOP', primary: true, shop: i === 5 ? 'Tea House' : 'Lamp & Candle' });
    const voice = t.extraversion > .7 ? 'chatty' : t.extraversion < .25 ? 'shy' : t.agreeableness < .45 ? 'gruff' : 'warm';
    const look = { skin: P.skin[Math.floor(r() * P.skin.length)], hair: P.hair[Math.floor(r() * P.hair.length)], hairStyle: P.styles[Math.floor(r() * P.styles.length)],
      shirt: P.shirt[Math.floor(r() * P.shirt.length)], pants: P.pants[Math.floor(r() * P.pants.length)], shoes: '#2a2018', acc: [], posture: t.laziness > .55 ? 'slouch' : t.conscientiousness > .8 ? 'upright' : 'normal', h: 0.92 + r() * 0.14 };
    if (job === 'miner') look.acc.push('helmet_lamp'); if (job === 'guard' || job === 'nightguard') { look.acc.push('badge'); look.shirt = '#2f4a3a'; }
    if (job === 'baker') look.acc.push('apron'); if (job === 'farmer' && r() < .5) look.acc.push('strawhat'); if (job === 'doctor') look.shirt = '#f2f0ea';
    if (r() < .2) look.acc.push('beard');
    defs.push({ id: AV.EXTRA_NAMES[i].toLowerCase(), name: AV.EXTRA_NAMES[i], age: 18 + Math.floor(r() * 50), job, p: t, v, money: 15 + Math.floor(r() * 45) + (i === 5 ? 70 : 0) + (i === 17 ? 60 : 0),
      goals, secrets: [], look, voice, bio: '', ties: [] });
  }
  defs.forEach((d, i) => { const a = newAgent(d, i); S.agents.push(a); S.byId[a.id] = a; });
  // homes
  const houses = World.buildings.filter(b => b.kind === 'house');
  const occ = houses.map(() => []);
  const core = S.agents.filter(a => a.core), extra = S.agents.filter(a => !a.core);
  core.forEach((a, i) => { a.home = houses[i % houses.length].id; occ[i % houses.length].push(a); });
  let hi = core.length % houses.length;
  const surn = AV.EXTRA_SURNAMES;
  extra.forEach((a, i) => {
    // fill the houses without core villagers first, families of 3-4
    let best = 0;
    for (let k = 0; k < houses.length; k++) if (occ[k].length - (k < core.length ? 1.5 : 0) < occ[best].length - (best < core.length ? 1.5 : 0)) best = k;
    a.home = houses[best].id; occ[best].push(a);
  });
  occ.forEach((list, k) => {
    const sur = surn[k % surn.length];
    list.forEach(a => { if (!a.core) a.surname = sur; a.housemates = list.filter(b => b !== a).map(b => b.id); });
    for (const a of list) for (const b of list) if (a !== b && !a.core && !b.core && !a.family.includes(b.id)) a.family.push(b.id);
  });
  // workplaces
  for (const a of S.agents) a.work = AV.JOBS[a.job].place;
  // relationships
  for (const a of S.agents) {
    for (const b of S.agents) {
      if (a === b) continue;
      const r = rel0();
      r[RI.familiarity] = 20 + rnd() * 30;
      r[RI.trust] = (a.p.agreeableness - 0.4) * 30 + (rnd() - 0.5) * 16 - (a.p.neuroticism - 0.4) * 15;
      r[RI.affection] = (rnd() - 0.4) * 16;
      r[RI.respect] = 5 + (rnd() - 0.3) * 14 + (b.core ? 6 : 0);
      if (a.work && a.work === b.work) { r[RI.familiarity] += 25; r[RI.trust] += 6; r[RI.affection] += 4; }
      if (a.family.includes(b.id)) { r[RI.familiarity] = 90; r[RI.trust] += 45; r[RI.affection] += 45; }
      else if (a.housemates && a.housemates.includes(b.id)) { r[RI.familiarity] = 80; r[RI.trust] += 18; r[RI.affection] += 15; }
      a.rel[b.id] = r;
    }
    a.rel.you = rel0(); a.rel.you[RI.trust] = (a.p.agreeableness - 0.5) * 20; a.rel.you[RI.respect] = 5;
  }
  for (const d of defs) for (const [oid, vals] of (d.ties || [])) {
    const r = S.byId[d.id].rel[oid]; if (!r) continue;
    for (const k in vals) r[RI[k]] = vals[k];
  }
  // secrets
  for (const d of defs) for (const sdef of (d.secrets || [])) {
    const id = 's' + (S.nextId++);
    S.secrets[id] = { id, owner: d.id, type: sdef.type, text: sdef.text, gossip: sdef.gossip, knownBy: (sdef.known || []).slice(), exposed: false };
    S.byId[d.id].secrets.push(id);
  }
  // Otto starts with a few secrets
  for (const k of (AV.CAST.find(c => c.id === 'otto').knows || [])) {
    const [who, type] = k.split(':');
    const sid = S.byId[who].secrets.find(s => S.secrets[s].type === type);
    if (sid && !S.secrets[sid].knownBy.includes('otto')) S.secrets[sid].knownBy.push('otto');
  }
  for (const sid in S.secrets) { const sc = S.secrets[sid]; sc.chain = newChain({ type: 'secret', about: sc.owner, secretId: sid, by: sc.knownBy[0] || sc.owner, level: 0, truth: true, how: 'already known' }); for (const k of sc.knownBy) addBelief(S.byId[k], { type: 'secret', about: sc.owner, secretId: sid, level: 0, conf: 0.85, src: 'self', chain: sc.chain }, null, true); }
  // seeded opinions
  addBelief(S.byId.arthur, { type: 'theft', about: 'finn', place: 'store', level: 1, conf: 0.45, src: 'self', chain: newChain({ type: 'theft', about: 'finn', place: 'store', by: 'arthur', level: 1, truth: false, how: 'an old suspicion' }) }, null, true);
  addBelief(S.byId.ada, { type: 'ineffective', about: 'henry', level: 1, conf: 0.7, src: 'self', chain: newChain({ type: 'ineffective', about: 'henry', by: 'ada', level: 1, truth: true, how: 'opinion' }) }, null, true);
  addBelief(S.byId.elias, { type: 'ineffective', about: 'henry', level: 1, conf: 0.9, src: 'self', chain: newChain({ type: 'ineffective', about: 'henry', by: 'elias', level: 1, truth: true, how: 'grudge' }) }, null, true);
  // positions: at home, asleep
  for (const a of S.agents) {
    const h = World.places[a.home];
    const sp = pick(h.spots); a.x = sp[0] + 0.5; a.z = sp[1] + 0.5; a.y = World.standAt(a.x, a.z);
    a.jx = (rnd() - 0.5) * 0.5; a.jz = (rnd() - 0.5) * 0.5;
    a.sleeping = true; a.plan = { type: 'sleep', place: a.home, until: S.t + 30 + rnd() * 90, arrived: true, reason: 'night' };
    a.thinkAt = S.t + 20 + rnd() * 90;
  }
  Sim.initSociety();
  Sim.emit({ type: 'DAY_START', text: 'Day 1 begins in the village.', imp: 0.3, public: false });
  return S;
};

// ---------- relationships ----------
function rel(a, bId) { if (!a.rel[bId]) a.rel[bId] = rel0(); return a.rel[bId]; }
function relAdj(a, bId, k, d) { const r = rel(a, bId); const i = RI[k]; const before = r[i]; r[i] = clamp(r[i] + d, -100, 100); return r[i] - before; }
Sim.rel = rel; Sim.relAdj = relAdj;
function relScore(a, bId) { const r = rel(a, bId); return (r[0] + r[1] + r[2]) / 3 - r[RI.resentment] * 0.5; }
Sim.relScore = relScore;

// ---------- memory ----------
function remember(a, m) {
  if (!a || a.left) return;
  m.t = S.t; m.id = S.nextId++;
  a.memories.push(m);
  if (a.memories.length > 90) pruneMemories(a);
  return m;
}
function strength(m) {
  const age = (S.t - m.t) / DAY;
  const imp = m.imp || 0.3;
  return imp * (0.6 + 0.4 * Math.abs(m.val || 0)) * Math.exp(-age / (0.4 + imp * 4));
}
function pruneMemories(a) {
  a.memories.sort((x, y) => strength(y) - strength(x));
  const keep = a.memories.slice(0, 60);
  a.memories = keep.sort((x, y) => x.t - y.t);
}
function recall(a, filter, k) {
  return a.memories.filter(filter).map(m => [m, strength(m)]).sort((x, y) => y[1] - x[1]).slice(0, k || 5).map(x => x[0]);
}
Sim.remember = remember; Sim.strength = strength; Sim.recall = recall;

// ---------- beliefs ----------
function findBelief(a, key) { return a.beliefs.find(b => b.key === key); }
function addBelief(a, nb, from, silent) {
  if (!a || a.left) return null;
  nb.key = beliefKey(nb);
  let b = findBelief(a, nb.key);
  if (b) {
    b.conf = clamp(1 - (1 - b.conf) * (1 - nb.conf * 0.8), 0, 0.97);
    if (nb.level > b.level && nb.conf > 0.3) b.level = nb.level;
    b.t = S.t; b.srcs = (b.srcs || [b.src]).concat(nb.src).slice(-4);
    return b;
  }
  b = Object.assign({ id: S.nextId++, t: S.t, told: [], hops: 0, level: 0 }, nb);
  b.srcs = [b.src];
  a.beliefs.push(b);
  if (a.beliefs.length > 45) {
    a.beliefs.sort((x, y) => (y.conf * (1 + Math.abs(CLAIMS[y.type].val)) - (S.t - y.t) / DAY * 0.1) - (x.conf * (1 + Math.abs(CLAIMS[x.type].val)) - (S.t - x.t) / DAY * 0.1));
    a.beliefs.length = 40;
  }
  if (!silent) applyBeliefToRel(a, b, nb.conf);
  return b;
}
function applyBeliefToRel(a, b, conf) {
  if (!b.about || b.about === a.id) return;
  const C = CLAIMS[b.type]; const w = conf * (0.5 + b.level * 0.25);
  if (C.val < 0) { relAdj(a, b.about, 'trust', 14 * C.val * w); relAdj(a, b.about, 'respect', 8 * C.val * w); }
  else { relAdj(a, b.about, 'trust', 8 * C.val * w); relAdj(a, b.about, 'affection', 6 * C.val * w); relAdj(a, b.about, 'respect', 6 * C.val * w); }
}
Sim.addBelief = addBelief; Sim.findBelief = findBelief; Sim.beliefKey = beliefKey;

// rumor provenance
function newChain(origin) {
  const id = 'r' + (S.nextId++);
  S.rumors[id] = { id, type: origin.type, about: origin.about, place: origin.place || null, other: origin.other || null, secretId: origin.secretId || null,
    origin: { by: origin.by, t: S.t, level: origin.level, truth: origin.truth, how: origin.how }, hops: [] };
  return id;
}
Sim.newChain = newChain;

// ---------- event bus + perception ----------
Sim.emit = function (ev, perceive) {
  ev.id = S.nextId++; ev.t = S.t; ev.day = dayOf(S.t);
  if (ev.x !== undefined) {
    const p = S.player; ev.playerSaw = Math.hypot(p.x - ev.x, p.z - ev.z) < 16 && World.los(p.x, p.y + 1.6, p.z, ev.x, (ev.y || World.STAND) + 1.2, ev.z);
  }
  S.events.push(ev); if (S.events.length > 700) S.events.splice(0, 100);
  if ((ev.imp || 0) >= 0.35 && ev.feed !== false) { S.feed.unshift(ev); if (S.feed.length > 220) S.feed.length = 220; }
  if ((ev.imp || 0) >= 0.7 && S.recordAway) S.away.push(ev);
  if (ev.heat && ev.x !== undefined) { const k = Math.floor(ev.x / 4) + ',' + Math.floor(ev.z / 4); S.heat[ev.heat][k] = (S.heat[ev.heat][k] || 0) + 1; }
  if (ev.public) {
    for (const a of S.agents) if (!a.left) {
      if (perceive) perceive(a, 0, true);
      else remember(a, { text: ev.memText || ev.text, kind: ev.type, about: ev.about, actor: ev.actor, imp: (ev.imp || 0.3) * 0.7, val: ev.val || 0 });
    }
  } else if (ev.x !== undefined && perceive) {
    const night = hourOf(S.t) >= 21 || hourOf(S.t) < 5.5;
    const lit = World.lightAt(ev.x, (ev.y || World.STAND) + 1, ev.z) > 0.35;
    const R = (ev.radius || 12) * (night && !lit ? 0.55 : 1);
    for (const a of S.agents) {
      if (a.left || a.id === ev.actor || a.sleeping) continue;
      const d = Math.hypot(a.x - ev.x, a.z - ev.z);
      if (d > R) continue;
      if (!World.los(a.x, a.y + 1.6, a.z, ev.x, (ev.y || World.STAND) + 1.2, ev.z)) continue;
      perceive(a, d, false);
    }
  }
  return ev;
};

// how a personality reads news about someone (used for gossip, witnessing and the paper)
function interpretCategory(b, bel, tellerId) {
  const C = CLAIMS[bel.type];
  if (bel.about === b.id) return C.val < 0 ? 'deny' : 'thank';
  const r = rel(b, bel.about);
  const cands = S.election.candidates || [];
  if (C.val < 0 && (b.family.includes(bel.about) || r[RI.trust] > 38 || r[RI.affection] > 45)) return 'defend';
  if (b.job === 'journalist' && Math.abs(C.val) >= 0.5) return 'story';
  if (cands.includes(b.id) && C.val < 0 && (cands.includes(bel.about) || bel.type === 'theft' || bel.type === 'corrupt')) return 'political';
  if (C.val < 0 && (b.p.neuroticism > 0.65 || r[RI.trust] < -25)) return 'confirm';
  if (b.p.laziness > 0.75 || b.p.curiosity < 0.22) return 'shrug';
  return 'neutral';
}
Sim.interpretCategory = interpretCategory;
const THOUGHTS = {
  confirm: ['I knew {subj} was trouble.', 'Suspicious. As I expected.', '{subj}. Of course.'],
  defend: ['{subj} would never. Someone is lying.', 'Not {subj}. I know better.'],
  story: ['This is a story.', 'Front page, if I can confirm it.'],
  political: ['This could become an election issue.', 'Useful. Very useful.'],
  shrug: ['I do not care.', 'Not my problem.'],
  neutral: ['Huh. {subj}?', 'Interesting.'],
  deny: ['They are talking about me.', 'Who is spreading this?'],
  thank: ['Nice to be noticed.'],
};

function think(a, text) { if (!text) return; a.thought = { text, t: S.t }; }
Sim.setThought = think;

// ---------- voices ----------
function voiceOf(a) { return AV.VOICES[a.voice] || AV.VOICES.warm; }
function line(a, key, vars) {
  const v = voiceOf(a);
  let arr = v[key] || AV.VOICES.warm[key] || (key === 'story' || key === 'political' ? v.believe : null) || AV.VOICES.warm.believe;
  let s = pick(arr);
  for (const k in (vars || {})) s = s.split('{' + k + '}').join(vars[k]);
  return s.replace(/\{\w+\}/g, '');
}
Sim.line = line;
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
Sim.cap = cap;

function sayBubble(a, text) { a.bubble = { text, t: S.t }; }
Sim.sayBubble = sayBubble;

// ---------- gossip ----------
function shareScore(a, bel, listener) {
  if (bel.conf < 0.22) return 0;
  if (bel.about === listener.id && CLAIMS[bel.type].val < 0) return 0;
  if (bel.told.includes(listener.id)) return 0;
  if (listener.beliefs.some(x => x.key === bel.key && x.conf >= bel.conf * 0.9)) return 0.02;
  const C = CLAIMS[bel.type];
  if (bel.about && C.val < 0) {
    const r = rel(a, bel.about);
    if ((r[RI.affection] > 45 || a.family.includes(bel.about)) && a.p.honesty < 0.9) return 0;
  }
  if (bel.type === 'secret' && bel.about === a.id) return 0;
  const age = (S.t - bel.t) / DAY;
  let s = Math.abs(C.val) * bel.conf * (0.6 + bel.level * 0.2) * Math.exp(-age / 2.5);
  if (bel.type === 'secret') s *= 0.9 * (1.2 - a.p.loyalty * 0.6) * (a.id === 'otto' ? 0.3 : 1);
  s *= Math.pow(0.72, bel.told.length);
  if ((bel.hops || 0) > 5) s *= 0.5;
  if (bel.type === 'supports') s *= 0.4;
  if (C.val > 0) s *= 0.35;
  const appetite = a.p.sociability * 0.5 + (1 - a.p.honesty) * 0.35 + a.p.curiosity * 0.25;
  return s * appetite * (1 + clamp(relScore(a, listener.id), -30, 60) / 100);
}
function bestShare(a, listener) {
  let best = null, bs = 0.07;
  for (const bel of a.beliefs) { const s = shareScore(a, bel, listener); if (s > bs) { bs = s; best = bel; } }
  return best;
}
Sim.bestShare = bestShare;

function transmit(teller, listener, bel, lines) {
  // teller may embellish
  const C = CLAIMS[bel.type];
  let level = bel.level, mutated = false;
  if (level < C.ladder.length - 1) {
    const pEsc = (1 - teller.p.honesty) * 0.32 + Math.max(0, rel(teller, bel.about || teller.id)[RI.resentment]) / 260 + teller.p.neuroticism * 0.06;
    if (rnd() < pEsc) { level++; mutated = true; }
  }
  const toldConf = clamp(bel.conf * (0.82 + (1 - teller.p.honesty) * 0.3), 0.05, 0.95);
  const claim = claimText(bel, level, listener.id);
  lines.push({ who: teller.id, text: line(teller, 'gossip', { claim, name: listener.name }) });
  bel.told.push(listener.id);
  // listener interprets
  const cat = interpretCategory(listener, bel, teller.id);
  const trustT = rel(listener, teller.id)[RI.trust];
  let acc = clamp(0.32 + trustT / 140 + listener.p.agreeableness * 0.12 - listener.p.openness * 0.04 + (C.val < 0 ? listener.p.neuroticism * 0.15 : 0), 0.06, 0.95);
  const mult = { confirm: 1.35, defend: 0.3, story: 0.9, political: 1.1, shrug: 0.6, neutral: 1, deny: 0, thank: 1 }[cat];
  let conf = clamp(toldConf * acc * mult, 0, 0.95);
  if (listener.id === bel.about) conf = 0;
  const subj = nameOf(bel.about, listener.id);
  let replyKey = { confirm: 'believe', defend: 'doubt', story: 'story', political: 'political', shrug: 'shrug', neutral: conf > 0.35 ? 'believe' : 'doubt', deny: 'deny', thank: 'thank' }[cat];
  let reply = line(listener, replyKey, { subj, name: teller.name, price: priceStr() });
  if (cat === 'defend' && rnd() < 0.6) reply = cap(subj) + '? No. I do not buy that.';
  lines.push({ who: listener.id, text: reply });
  if (conf > 0.04) {
    const nb = addBelief(listener, { type: bel.type, about: bel.about, place: bel.place, other: bel.other, secretId: bel.secretId, level, conf, src: teller.id, chain: bel.chain, hops: (bel.hops || 0) + 1 });
    if (nb && bel.secretId && S.secrets[bel.secretId] && !S.secrets[bel.secretId].knownBy.includes(listener.id)) S.secrets[bel.secretId].knownBy.push(listener.id);
  }
  teller.lastGossip = S.t;
  if (bel.chain && S.rumors[bel.chain] && S.rumors[bel.chain].hops.length < 400) S.rumors[bel.chain].hops.push({ from: teller.id, to: listener.id, t: S.t, level, conf: Math.round(conf * 100) / 100, mut: mutated, cat });
  // social side effects
  if (cat === 'defend') { relAdj(listener, teller.id, 'trust', -4); relAdj(listener, teller.id, 'resentment', 3); }
  if (cat === 'deny') { relAdj(listener, teller.id, 'resentment', 10); relAdj(listener, teller.id, 'trust', -6); }
  if (cat !== 'defend' && cat !== 'deny') relAdj(listener, teller.id, 'familiarity', 2);
  const memTxt = teller.name + ' told me ' + claim.replace(/^you /, 'I ') + '.';
  remember(listener, { text: memTxt, kind: 'heard', about: bel.about, actor: teller.id, imp: 0.25 + Math.abs(C.val) * 0.35 * conf + (bel.about === listener.id ? 0.3 : 0), val: C.val * (bel.about === listener.id ? 1 : 0.5) });
  remember(teller, { text: 'I told ' + listener.name + ' that ' + claim + '.', kind: 'told', about: bel.about, actor: teller.id, imp: 0.15, val: 0 });
  think(listener, (pick(THOUGHTS[cat] || THOUGHTS.neutral)).replace('{subj}', subj));
  if (mutated && C.val < 0 && (level >= 2 || (S.byId[bel.about] && S.byId[bel.about].core))) Sim.emit({ type: 'RUMOR_DISTORTED', actor: teller.id, about: bel.about, chain: bel.chain, imp: 0.3, x: teller.x, z: teller.z,
    text: teller.name + ' told ' + listener.name + ' that ' + claim + ' (the story grew in the retelling).', feed: true });
  return { cat, conf, level };
}
Sim.transmit = transmit;

function priceStr() { return Sim.breadPrice ? Sim.breadPrice().toFixed(1) : '3'; }

// ---------- conversation ----------
function memoryLine(a, b, m) {
  const ago = dayOf(S.t) - dayOf(m.t);
  const when = ago <= 0 ? 'earlier' : ago === 1 ? 'yesterday' : ago + ' days ago';
  if (m.kind === 'helped_me') return 'Still grateful for ' + when + ', ' + b.name + '.';
  if (m.kind === 'heard' && m.actor === b.id) return 'I keep thinking about what you told me ' + when + '.';
  if (m.kind === 'argument') return 'Still angry about ' + when + ', ' + b.name + '.';
  if (m.kind === 'campaign' && m.actor === b.id) return 'I thought about your pitch, ' + b.name + '.';
  if (m.kind === 'damage') return 'I saw what you did ' + when + '.';
  return null;
}

function compat(a, b) {
  const d = Math.abs(a.p.extraversion - b.p.extraversion) * 0.4 + Math.abs(a.p.agreeableness - b.p.agreeableness) * 0.4 + Math.abs(a.p.openness - b.p.openness) * 0.3
    + Math.abs(a.v.community - b.v.community) * 0.3 + Math.abs(a.v.wealth - b.v.wealth) * 0.2;
  return 1 - d;
}

function startConvo(a, b, intent, payload) {
  if (a.convo || b.convo || a.left || b.left || b.sleeping) return null;
  const lines = [];
  intent = intent || 'chat';
  const ok = converse(a, b, intent, payload || {}, lines);
  if (!ok || !lines.length) return null;
  const id = 'c' + (S.nextId++);
  const c = { id, a: a.id, b: b.id, t0: S.t, intent, lines: lines.map((l, i) => Object.assign(l, { at: S.t + i * 2.2 })), end: S.t + lines.length * 2.2 + 1.5, place: a.plan && a.plan.place };
  S.convos[id] = c;
  a.convo = id; b.convo = id;
  a.path = null; b.path = null;
  a.dir = Math.atan2(b.x - a.x, b.z - a.z); b.dir = Math.atan2(a.x - b.x, a.z - b.z);
  a.stats.convos++; b.stats.convos++;
  a.needs.social = clamp(a.needs.social + 0.22, 0, 1); b.needs.social = clamp(b.needs.social + 0.22, 0, 1);
  const k = Math.floor(a.x / 4) + ',' + Math.floor(a.z / 4); S.heat.social[k] = (S.heat.social[k] || 0) + 1;
  S.lastConvo = c;
  return c;
}
Sim.startConvo = startConvo;

function converse(a, b, intent, payload, L) {
  const say = (who, text) => { if (text) L.push({ who: who.id, text }); };
  relAdj(a, b.id, 'familiarity', 2); relAdj(b, a.id, 'familiarity', 2);
  // greeting, possibly remembering something
  const mems = recall(a, m => m.about === b.id || m.actor === b.id && m.kind !== 'told', 3);
  const ml = mems.length && rnd() < 0.55 ? memoryLine(a, b, mems[0]) : null;
  say(a, ml || line(a, 'hi', { name: b.name }));
  if (intent === 'testimony') return Sim.interview(a, b, payload, L);
  if (intent === 'probe') {
    say(a, pick(['Off the record, what have you heard lately?', 'I am working on a story. Anything I should know?']));
    const bel = b.beliefs.filter(x => CLAIMS[x.type].val < 0 && x.conf > 0.2 && x.about !== a.id && !x.told.includes(a.id) && x.about !== b.id).sort((x, y) => y.conf * (1 + y.level) - x.conf * (1 + x.level))[0];
    if (bel && rel(b, a.id)[RI.trust] > -20) transmit(b, a, bel, L);
    else say(b, pick(['Nothing to say.', 'Ask someone else.', 'I keep my head down.']));
    return true;
  }
  if (intent === 'campaign') return Sim.campaignTalk(a, b, L);
  if (intent === 'help') return helpTalk(a, b, payload, L);
  if (intent === 'mediate') {
    const [x, y] = payload.pair || [];
    say(a, 'You and ' + nameOf(y === b.id ? x : y) + ' should talk. This feud is hurting everyone.');
    const other = y === b.id ? x : y;
    if (rnd() < a.p.agreeableness * 0.8) { relAdj(b, other, 'resentment', -15); say(b, 'Maybe you are right.'); think(a, 'One less quarrel.'); }
    else say(b, 'Stay out of it.');
    return true;
  }
  // tavern confessions: Otto hears everything eventually
  if (b.id === 'otto' || a.id === 'otto') {
    const talker = b.id === 'otto' ? a : b, otto = b.id === 'otto' ? b : a;
    const sid = talker.secrets.find(s => !S.secrets[s].knownBy.includes('otto'));
    if (sid && rnd() < 0.05 + talker.p.sociability * 0.05 + (talker.mood > 0.3 ? 0.04 : 0)) {
      say(talker, 'Can I tell you something, Otto? ' + S.secrets[sid].text.replace(talker.name + ' ', 'I ').replace(/^I is/, 'I am'));
      say(otto, 'Your secret is safe with me. Mostly.');
      S.secrets[sid].knownBy.push('otto');
      addBelief(otto, { type: 'secret', about: talker.id, secretId: sid, level: 0, conf: 0.95, src: talker.id, chain: newChain({ type: 'secret', about: talker.id, secretId: sid, by: talker.id, level: 0, truth: true, how: 'confession' }) }, null, true);
      remember(otto, { text: talker.name + ' confided a secret in me.', kind: 'secret', about: talker.id, actor: talker.id, imp: 0.6, val: 0.2 });
      Sim.emit({ type: 'SECRET_TOLD', actor: talker.id, imp: 0.4, x: talker.x, z: talker.z, text: talker.name + ' confided a secret to Otto at the bar.' });
      return true;
    }
  }
  // close friends confide
  const sid = a.secrets.find(s => !S.secrets[s].knownBy.includes(b.id));
  if (sid && rel(a, b.id)[RI.trust] > 50 && rel(a, b.id)[RI.affection] > 40 && rnd() < 0.04) {
    say(a, 'Promise you will not tell anyone? ' + S.secrets[sid].text);
    say(b, 'I promise.');
    S.secrets[sid].knownBy.push(b.id);
    addBelief(b, { type: 'secret', about: a.id, secretId: sid, level: 0, conf: 0.95, src: a.id, chain: newChain({ type: 'secret', about: a.id, secretId: sid, by: a.id, level: 0, truth: true, how: 'confession' }) }, null, true);
    relAdj(b, a.id, 'trust', 6); relAdj(b, a.id, 'affection', 6);
    return true;
  }
  const bel = payload.belief || bestShare(a, b);
  const gossipy = intent === 'gossip' || rnd() < 0.35 + a.p.sociability * 0.4;
  if (bel && gossipy) {
    transmit(a, b, bel, L);
    // the listener might trade a story back
    const back = bestShare(b, a);
    if (back && rnd() < b.p.sociability * 0.6) transmit(b, a, back, L);
  } else if (Sim.breadRatio && Sim.breadRatio() > 1.22 && rnd() < 0.55) {
    say(a, line(a, 'complain', { price: priceStr() }));
    const cands = S.election.candidates || [];
    if (cands.includes(b.id)) say(b, line(b, 'political', { name: a.name }) || line(b, 'complain', { price: priceStr() }));
    else say(b, line(b, rnd() < 0.5 ? 'complain' : 'shrug', { price: priceStr() }));
    a.needs.comfort -= 0.02; b.needs.comfort -= 0.02;
    if (S.town.mayor && S.town.mayor !== a.id && S.town.mayor !== b.id) { relAdj(a, S.town.mayor, 'respect', -1.2); relAdj(b, S.town.mayor, 'respect', -1.2); }
  } else {
    say(a, line(a, 'small', { name: b.name }));
    say(b, rnd() < 0.6 ? line(b, 'small', { name: a.name }) : line(b, 'shrug', {}));
  }
  // chemistry
  const c = compat(a, b);
  relAdj(a, b.id, 'affection', (c - 0.45) * 5); relAdj(b, a.id, 'affection', (c - 0.45) * 5);
  if (c > 0.6) { relAdj(a, b.id, 'trust', 1.2); relAdj(b, a.id, 'trust', 1.2); }
  if (a.goals.some(g => g.type === 'FIND_A_PARTNER' && (!g.target || g.target === b.id))) relAdj(a, b.id, 'attraction', 1.5 + c * 2);
  // friction between rivals can flare into an argument
  const ra = rel(a, b.id), rb = rel(b, a.id);
  if (ra[RI.resentment] + rb[RI.resentment] > 70 && rnd() < 0.3) {
    say(a, pick(['You have some nerve, ' + b.name + '.', 'I know what you did.', 'Stay out of my way.']));
    say(b, pick(['Say that again.', 'You are one to talk.', 'Leave me alone.']));
    relAdj(a, b.id, 'resentment', 6); relAdj(b, a.id, 'resentment', 6);
    remember(a, { text: 'I argued with ' + b.name + '.', kind: 'argument', about: b.id, actor: a.id, imp: 0.55, val: -0.6 });
    remember(b, { text: a.name + ' picked a fight with me.', kind: 'argument', about: a.id, actor: a.id, imp: 0.55, val: -0.6 });
    Sim.emit({ type: 'ARGUMENT', actor: a.id, target: b.id, imp: 0.5, x: a.x, z: a.z, heat: 'crime', text: a.name + ' and ' + b.name + ' argued in public.' }, (w) => {
      if (w.id === b.id) return;
      remember(w, { text: 'I saw ' + a.name + ' and ' + b.name + ' arguing.', kind: 'saw_argument', about: a.id, imp: 0.3, val: -0.2 });
      w.needs.safety -= 0.03;
    });
  }
  if (rnd() < 0.4) say(b, line(b, 'bye', {}));
  return true;
}

function helpTalk(a, b, payload, L) {
  const say = (who, text) => { if (text) L.push({ who: who.id, text }); };
  let gave = '';
  if (a.inv.bread > 0 && b.needs.hunger < 0.5) { a.inv.bread--; b.inv.bread++; gave = 'a loaf of bread'; }
  else if (a.money > 20) { const amt = Math.min(10, Math.floor(a.money * 0.1)); a.money -= amt; b.money += amt; gave = amt + ' coins'; }
  a.lastHelp = S.t; b.lastHelped = S.t;
  if (!gave) { say(a, 'I wish I could do more for you.'); return true; }
  say(a, 'Here, take ' + gave + '. No arguments.');
  say(b, line(b, 'thank', { name: a.name }));
  relAdj(b, a.id, 'trust', 9); relAdj(b, a.id, 'affection', 11); relAdj(b, a.id, 'respect', 5);
  a.stats.helped++;
  remember(b, { text: a.name + ' gave me ' + gave + ' when I needed it.', kind: 'helped_me', about: a.id, actor: a.id, imp: 0.75, val: 0.8 });
  remember(a, { text: 'I gave ' + b.name + ' ' + gave + '.', kind: 'helped', about: b.id, actor: a.id, imp: 0.4, val: 0.5 });
  think(a, 'Feels right.');
  const chain = newChain({ type: 'helped', about: a.id, other: b.id, by: b.id, level: 0, truth: true, how: 'witnessed' });
  addBelief(b, { type: 'helped', about: a.id, other: b.id, level: 0, conf: 0.95, src: 'self', chain }, null, true);
  Sim.emit({ type: 'HELP', actor: a.id, target: b.id, imp: 0.45, x: a.x, z: a.z, text: a.name + ' gave ' + b.name + ' ' + gave + '.' }, (w) => {
    if (w.id === b.id) return;
    addBelief(w, { type: 'helped', about: a.id, other: b.id, level: 0, conf: 0.8, src: 'witness', chain });
    remember(w, { text: 'I saw ' + a.name + ' help ' + b.name + '.', kind: 'saw_help', about: a.id, imp: 0.3, val: 0.4 });
  });
  return true;
}

function tickConvos() {
  for (const id in S.convos) {
    const c = S.convos[id];
    for (const l of c.lines) if (!l.shown && S.t >= l.at) { l.shown = true; const sp = S.byId[l.who]; if (sp) sayBubble(sp, l.text); }
    if (S.t >= c.end) {
      const a = S.byId[c.a], b = S.byId[c.b];
      if (a && a.convo === id) { a.convo = null; a.convoCool = S.t + 10; }
      if (b && b.convo === id) { b.convo = null; b.convoCool = S.t + 14; }
      if (a && a.plan && (a.plan.type === 'talk_to' || a.plan.type === 'gossip' || a.plan.type === 'help' || a.plan.type === 'mediate')) a.plan.until = S.t;
      if (a && a.plan && a.plan.type === 'investigate' && a.plan.step === 'interview') a.plan.until = S.t;
      S.convoLog = S.convoLog || []; S.convoLog.unshift({ a: c.a, b: c.b, t: c.t0, intent: c.intent, lines: c.lines.map(l => ({ who: l.who, text: l.text })) });
      if (S.convoLog.length > 80) S.convoLog.length = 80;
      delete S.convos[id];
    }
  }
}

// ---------- needs + mood ----------
function needsTick(a) {
  const n = a.needs;
  n.hunger = clamp(n.hunger - (a.sleeping ? 1 / 3200 : 1 / 1150), 0, 1);
  n.energy = clamp(n.energy + (a.sleeping ? 1 / 300 : -(a.plan && a.plan.type === 'work' && a.plan.arrived ? 1 / 1000 : 1 / 1300)), 0, 1);
  n.social = clamp(n.social - (a.sleeping ? 0 : (0.4 + a.p.extraversion) / 900), 0, 1);
  n.comfort = clamp(n.comfort + (a.sleeping || (a.plan && a.plan.type === 'rest') ? 1 / 300 : -1 / 1600), 0, 1);
  n.safety = clamp(n.safety + (0.75 - n.safety) / 600, 0, 1);
  if (n.hunger < 0.06) { a.hungryMins++; if (a.hungryMins > 480 && !a.sick) { a.sick = true; Sim.emit({ type: 'NPC_SICK', actor: a.id, imp: 0.3, x: a.x, z: a.z, text: a.name + ' fell ill from hunger.' }); } }
  else a.hungryMins = 0;
}
function updateMood(a) {
  const n = a.needs;
  const needsAvg = (n.hunger + n.energy + n.social + n.safety + n.comfort) / 5;
  const recent = a.memories.filter(m => S.t - m.t < 720);
  let rv = 0, rw = 0; for (const m of recent) { rv += (m.val || 0) * (m.imp || 0.3); rw += (m.imp || 0.3); }
  const memV = rw ? rv / rw : 0;
  const money = clamp((a.money - a.debt * 0.3) / 80, -1, 1);
  const m = (needsAvg - 0.55) * 1.6 + memV * 0.5 + money * 0.25 - a.p.neuroticism * 0.15 + (a.sick ? -0.4 : 0) + (a.jailUntil > S.t ? -0.6 : 0);
  a.mood = clamp(a.mood * 0.9 + m * 0.1, -1, 1);
  let label = 'content';
  if (a.jailUntil > S.t) label = 'jailed';
  else if (a.sick) label = 'unwell';
  else if (n.hunger < 0.2) label = 'hungry';
  else if (n.energy < 0.18) label = 'exhausted';
  else if (n.safety < 0.4) label = 'anxious';
  else if (memV < -0.35) label = 'angry';
  else if (n.social < 0.2) label = 'lonely';
  else if (a.mood > 0.45) label = a.p.greed > 0.7 && a.money > 120 ? 'smug' : 'cheerful';
  else if (a.mood < -0.3) label = 'gloomy';
  else if (a.p.laziness > 0.7 && a.plan && a.plan.type === 'work') label = 'bored';
  a.moodLabel = label;
}
Sim.updateMood = updateMood;

// ---------- decisions ----------
function workPlace(a) {
  if (a.job === 'builder') { const pr = S.projects.find(p => !p.done); if (pr) return pr.siteId; }
  if (a.job === 'merchant' && a.shopId) return a.shopId;
  return a.work;
}
function isWorkTime(a, h) { const J = AV.JOBS[a.job]; return J && J.place !== undefined && inHours(h, J.hours) && a.job !== 'unemployed'; }
function workEnd(a, h) { const J = AV.JOBS[a.job]; for (const [s, e] of J.hours) if (h >= s && h < e) return S.t + (e - h) * 60; return S.t + 60; }
Sim.isWorkTime = isWorkTime;

function socialPlace(a, h) {
  const tav = Sim.shopOpen('tavern', h) && a.money >= 3;
  const rain = S.weather.kind === 'rain';
  if ((h >= 17.5 || rain) && tav) return 'tavern';
  if (h >= 21 && !tav) return a.home;
  return rnd() < 0.7 ? 'plaza' : (tav ? 'tavern' : 'market');
}
function enemiesAt(a, placeId) {
  return S.agents.filter(o => o !== a && !o.left && o.plan && o.plan.place === placeId && (rel(a, o.id)[RI.resentment] > 50 || rel(a, o.id)[RI.fear] > 45));
}

function wakeHour(a) { return 6.2 + a.p.laziness * 1.6 - a.p.conscientiousness * 0.5; }

function decide(a) {
  const h = hourOf(S.t), n = a.needs, C = [];
  const add = (type, score, o) => C.push(Object.assign({ type, score }, o || {}));
  const work = isWorkTime(a, h);
  const night = h >= 22 || h < wakeHour(a);
  const bp = Sim.breadPrice();
  // sleep
  if (night) add('sleep', 2.6 + (1 - n.energy) * 2 - (a.p.extraversion > 0.8 && h < 23.5 && h >= 22 ? 0.9 : 0), { place: a.home, reason: 'late, time to sleep' });
  if (n.energy < 0.15) add('sleep', 2.5 + (0.15 - n.energy) * 8, { place: a.home, reason: 'exhausted', nap: !night });
  // eat
  const eatAt = 0.4 + clamp(a.money / 200, 0, 0.15) + (night ? 0.1 : 0);
  if (n.hunger < eatAt) {
    const meal = (h >= 7 && h < 9) || (h >= 12 && h < 14) || (h >= 18 && h < 20.5) ? 1.0 : 0;
    const s = (1 - n.hunger) * 3.4 + meal - 0.5 + (night ? 1.6 : 0) + (n.hunger < 0.25 ? 1.5 : 0);
    if (a.inv.bread > 0) add('eat', s + 0.4, { place: null, reason: 'hungry, has bread' });
    else {
      const seller = Sim.chooseSeller(a, 'bread', h);
      if (seller && a.money >= seller.price) add('eat', s, { place: seller.id, reason: 'hungry, buying bread at the ' + placeName(seller.id), shop: seller.id });
    }
  }
  // work
  if (work && a.job !== 'unemployed') {
    let s = 1.6 + a.p.conscientiousness * 0.85 - a.p.laziness * 1.15 + clamp((60 - a.money) / 60, 0, 1) * 0.9;
    if (a.goals.some(g => g.type === 'BECOME_RICH')) s += 0.25;
    if (a.goals.some(g => g.type === 'AVOID_WORK')) s -= 0.35;
    if (a.job === 'mayor' && a.p.conscientiousness < 0.3) s -= 0.3;
    if (a.toolHp <= 0 && ['farmer', 'miner', 'builder', 'blacksmith'].includes(a.job)) {
      const seller = Sim.chooseSeller(a, 'tools', h);
      if (seller && a.money >= seller.price) add('buy', 2.4, { place: seller.id, item: 'tools', reason: 'tools broke', shop: seller.id });
    }
    add('work', s, { place: workPlace(a), reason: 'work hours', until: workEnd(a, h) });
  }
  // socialise
  const sn = 1 - n.social;
  if (!night || h < 23.5) add('socialize', sn * 1.5 * (0.5 + a.p.extraversion) + (h >= 18 && h < 22 ? 0.75 : 0) + (S.weather.kind === 'rain' ? -0.2 : 0) - (work ? 0.5 : 0), { place: socialPlace(a, h), reason: 'wants company' });
  // rest
  add('rest', (1 - n.energy) * 1.1 + a.p.laziness * (work ? 1.05 : 0.45) + (1 - n.comfort) * 0.5 - 0.15, { place: a.home, reason: a.p.laziness > 0.7 && work ? 'cannot be bothered to work' : 'tired' });
  // gossip: pick the juiciest thing and someone to tell
  if (!night && a.lod >= 1) {
    let best = null, bs = 0;
    const known = S.agents.filter(o => o !== a && !o.left && !o.sleeping && o.jailUntil <= S.t && Math.hypot(o.x - a.x, o.z - a.z) < 40);
    for (let k = 0; k < Math.min(6, known.length); k++) {
      const o = pick(known); const bel = bestShare(a, o); if (!bel) continue;
      const s = shareScore(a, bel, o) * (1 + relScore(a, o.id) / 80);
      if (s > bs) { bs = s; best = [o, bel]; }
    }
    if (best && bs > 0.1) add('gossip', 0.35 + Math.min(bs, 0.8) * 2.2 - (work ? 0.9 : 0) - (a.lastGossip > S.t - 90 ? 0.8 : 0), { target: best[0].id, belief: best[1].id, reason: 'has news for ' + best[0].name, intent: 'gossip' });
  }
  // goals
  Sim.goalCandidates(a, h, add, work, night);
  // help someone they know is struggling
  if (a.p.empathy > 0.55 && !night && (a.money > 30 || a.inv.bread > 1) && !(a.lastHelp > S.t - 360)) {
    const needy = S.agents.filter(o => o !== a && !o.left && !o.sleeping && o.needs.hunger < 0.3 && o.money < 4 && o.inv.bread === 0 && rel(a, o.id)[RI.familiarity] > 30 && Math.hypot(o.x - a.x, o.z - a.z) < 35 && !(o.lastHelped > S.t - 240));
    if (needy.length) add('help', 0.9 + a.p.empathy * 1.3, { target: pick(needy).id, reason: 'someone is going hungry', intent: 'help' });
  }
  // crime
  Sim.crimeCandidates(a, h, add, night);
  // wander
  if (!night) add('visit', 0.25 + a.p.curiosity * 0.4 + a.p.openness * 0.2 + (S.weather.kind === 'clear' ? 0.15 : -0.2), { place: pick(['river', 'forest', 'plaza', 'market', 'river']), reason: 'wandering' });
  // noise + pick
  for (const c of C) c.score += (rnd() - 0.5) * 0.3;
  C.sort((x, y) => y.score - x.score);
  return C;
}

function chooseAndGo(a, forced) {
  if (a.left) return;
  if (a.convo) { a.thinkAt = S.t + 3; return; }
  const h = hourOf(S.t);
  if (a.jailUntil > S.t) { goPlan(a, { type: 'jail', place: 'guard', until: a.jailUntil, reason: 'locked up' }); a.thinkAt = a.jailUntil; return; }
  if (a.jailed) { a.jailed = false; think(a, 'Free. And I will remember who put me here.'); }
  if (a.sick || a.injured) { goPlan(a, { type: 'clinic', place: 'clinic', until: S.t + 180, reason: a.injured ? 'injured' : 'feeling ill' }); a.thinkAt = S.t + 60; return; }
  const C = forced ? [forced] : decide(a);
  const top = C[0];
  if (!top) return;
  // avoid enemies at the chosen place
  if (top.place && top.type !== 'work' && top.type !== 'sleep') {
    const en = enemiesAt(a, top.place);
    if (en.length && rnd() < 0.8) {
      const alt = top.place === 'tavern' ? 'plaza' : top.place === 'plaza' ? 'river' : a.home;
      think(a, 'Not going near ' + en[0].name + ' right now.');
      top.reason += ' (avoiding ' + en[0].name + ')'; top.place = alt; top.avoided = en[0].id;
    }
  }
  const work = isWorkTime(a, h);
  if (work && top.type !== 'work' && a.job !== 'unemployed' && !['eat', 'buy', 'investigate', 'vote', 'campaign', 'clinic', 'gossip'].includes(top.type) && !(a.plan && a.plan.type === top.type)) {
    if (!a.skipLogged || a.skipLogged < S.t - 240) {
      a.skipLogged = S.t; a.shiftsMissed++;
      Sim.onSkip(a, top);
    }
  }
  const dlog = { t: S.t, chosen: top.type, reason: top.reason, src: top.src || 'utility', top: C.slice(0, 4).map(c => [c.type, Math.round(c.score * 100) / 100, c.target ? nameOf(c.target) : (c.place ? placeName(c.place) : '')]) };
  a.decisions.unshift(dlog); if (a.decisions.length > 14) a.decisions.length = 14;
  goPlan(a, top);
  setThoughtFor(a, top, work);
  const iv = a.lod >= 3 ? 8 + rnd() * 8 : a.lod === 2 ? 14 + rnd() * 14 : 28 + rnd() * 30;
  a.thinkAt = S.t + iv;
}
Sim.chooseAndGo = chooseAndGo;

function setThoughtFor(a, p, work) {
  const tn = p.target ? nameOf(p.target) : '';
  const T = {
    sleep: ['Long day.', 'Bed.', 'Finally.'],
    eat: ['Starving.', 'Time for a loaf.', 'Need to eat something.'],
    work: a.p.laziness > 0.7 ? ['Fine. Work.', 'Ugh.'] : a.p.ambition > 0.7 ? ['Every coin counts.', 'Let us get it done.'] : ['Back to work.'],
    socialize: a.id === 'otto' ? ['Time to open up.'] : ['I need some company.', 'Let us see who is around.'],
    rest: work ? (a.id === 'milo' ? ['I can probably skip work again.'] : ['Nobody will notice if I am late.']) : ['A quiet hour.'],
    gossip: [tn + ' will want to hear this.', 'Wait until ' + tn + ' hears.'],
    campaign: [tn ? tn + ' could help my campaign.' : 'Votes do not win themselves.'],
    investigate: ['Someone in this village is lying.', 'Facts first.'],
    steal: ['Nobody is watching. Now.', 'Quick and quiet.'],
    help: [tn + ' looks like they are struggling.'],
    protest: ['Enough. Bread at ' + priceStr() + '?'],
    vote: ['My vote counts.'],
    visit: ['A walk would do me good.'],
    buy: ['Need new tools.'],
    build: ['One more wall.'],
  }[p.type];
  if (p.thought) think(a, p.thought); else if (T && (rnd() < 0.6 || p.type === 'steal' || p.type === 'campaign')) think(a, pick(T));
}

function spotIn(placeId, a) {
  const p = World.places[placeId] || S.extraPlaces[placeId];
  if (!p) return null;
  if (placeId === a.home && a.sleeping !== undefined && p.kind === 'house') return p.spots[(a.name.length * 7) % p.spots.length];
  return pick(p.spots);
}

function goPlan(a, plan) {
  if (a.plan && a.plan.type === 'sleep' && plan.type !== 'sleep') a.sleeping = false;
  plan.t0 = S.t; plan.arrived = false;
  plan.until = plan.until || S.t + 240;
  a.plan = plan;
  if (plan.type !== 'sleep') a.sleeping = false;
  if (plan.target) { const t = S.byId[plan.target]; if (t) setDest(a, Math.floor(t.x), Math.floor(t.z)); return; }
  if (plan.place === null || plan.place === undefined) { a.path = null; arrive(a); return; }
  if (plan.spot) { setDest(a, plan.spot[0], plan.spot[1]); return; }
  const sp = spotIn(plan.place, a);
  if (!sp) { a.path = null; arrive(a); return; }
  plan.spot = sp;
  setDest(a, sp[0], sp[1]);
}
Sim.goPlan = goPlan;

function setDest(a, x, z) {
  if (Math.floor(a.x) === x && Math.floor(a.z) === z) { a.path = null; arrive(a); return; }
  if (S.coarse) { a.x = x + 0.5 + a.jx; a.z = z + 0.5 + a.jz; a.path = null; arrive(a); return; }
  const p = World.findPath(a.x, a.z, x, z, 9000);
  if (!p || p.length < 2) { a.x = x + 0.5; a.z = z + 0.5; a.path = null; arrive(a); return; }
  a.path = p; a.pi = 1;
}

function arrive(a) {
  const p = a.plan; if (!p || p.arrived) return;
  p.arrived = true;
  switch (p.type) {
    case 'sleep': a.sleeping = true; p.until = p.nap ? S.t + 150 : Math.max(p.until, nextWake(a)); break;
    case 'eat': Sim.doEat(a, p); break;
    case 'buy': Sim.doBuy(a, p.shop, p.item || 'tools', 1); p.until = S.t + 10; break;
    case 'work': p.until = p.until || workEnd(a, hourOf(S.t)); break;
    case 'socialize': p.until = S.t + 50 + rnd() * 70; break;
    case 'rest': p.until = S.t + 50 + rnd() * 60; break;
    case 'visit': p.until = S.t + 25 + rnd() * 40; break;
    case 'vote': Sim.castVote(a); p.until = S.t + 10; break;
    case 'protest': p.until = S.t + 90; Sim.onProtestArrive(a); break;
    case 'steal': if (p.stage === 'lurk') { Sim.attemptTheft(a, p); if (!p.lurk) p.until = S.t + 5; } break;
    case 'campaign': p.until = S.t + 120; break;
    case 'commission': Sim.commission(a); p.until = S.t + 15; break;
    case 'investigate': Sim.investigateArrive(a, p); break;
    case 'clinic': break;
    case 'jail': break;
    default: break;
  }
}
function nextWake(a) {
  const h = hourOf(S.t), w = wakeHour(a);
  const base = S.t - (S.t % DAY);
  return h < w ? base + w * 60 : base + DAY + w * 60;
}

function moveAgent(a, dt) {
  if (!a.path) { a.moving = false; return; }
  let dist = a.speed * dt * (a.plan && (a.plan.type === 'steal' || a.plan.urgent) ? 1.4 : 1);
  while (dist > 0 && a.path) {
    const c = a.path[a.pi];
    const last = a.pi === a.path.length - 1;
    const tx = c[0] + 0.5 + (last ? a.jx : 0), tz = c[1] + 0.5 + (last ? a.jz : 0);
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (d > 0.001) a.dir = Math.atan2(dx, dz);
    if (d <= dist) {
      a.x = tx; a.z = tz; dist -= d; a.pi++;
      if (a.pi >= a.path.length) { a.path = null; arrive(a); }
    } else { a.x += dx / d * dist; a.z += dz / d * dist; dist = 0; }
  }
  a.moving = !!a.path;
}

const FREE_PLANS = { socialize: 1, visit: 1, campaign: 1, protest: 1, rest: 1, work: 1 };
// per-minute activity
function actTick(a) {
  const p = a.plan; if (!p) return;
  if (p.target && !a.convo) {
    const t = S.byId[p.target];
    if (!t || t.left || t.sleeping) { p.until = S.t; return; }
    const d = Math.hypot(t.x - a.x, t.z - a.z);
    if (p.intent === 'follow') {
      if (d > 4 && (!a.path || S.t - (p.lastRepath || 0) > 5)) { p.lastRepath = S.t; setDest(a, Math.floor(t.x), Math.floor(t.z)); }
      else if (d <= 4) a.path = null;
      return;
    }
    if (d < 2.3) {
      if (!t.convo && !(t.convoCool > S.t + 8)) {
        const c = startConvo(a, t, p.intent || 'chat', { belief: p.belief ? a.beliefs.find(b => b.id === p.belief) : null, caseId: p.caseId, pair: p.pair });
        if (!c) p.until = S.t;
      }
    } else if (!a.path || (S.t - (p.lastRepath || 0) > 6)) {
      p.lastRepath = S.t; setDest(a, Math.floor(t.x), Math.floor(t.z));
    }
    if (S.t - p.t0 > 120) p.until = S.t;
    return;
  }
  if (!p.arrived) return;
  switch (p.type) {
    case 'work': Sim.workTick(a); break;
    case 'socialize': case 'campaign': case 'visit':
      if (!a.convo && rnd() < (p.type === 'campaign' ? 0.2 : 0.09 + a.p.extraversion * 0.08)) {
        const near = S.agents.filter(o => o !== a && !o.left && !o.convo && !o.sleeping && o.jailUntil <= S.t && !(o.convoCool > S.t) && !o.path && (!o.plan || FREE_PLANS[o.plan.type]) && Math.hypot(o.x - a.x, o.z - a.z) < 7);
        if (near.length) {
          near.sort((x, y) => (relScore(a, y.id) + rnd() * 30) - (relScore(a, x.id) + rnd() * 30));
          const o = p.type === 'campaign' ? near.find(n => !(n.support[a.id] > 0.6)) || near[0] : near[0];
          if (o.plan && o.plan.type === 'work' && rnd() < 0.7) break;
          startConvo(a, o, p.type === 'campaign' && o.id !== a.id ? 'campaign' : 'chat');
        }
      }
      if (p.type === 'socialize' && p.place === 'tavern') Sim.tavernTick(a);
      break;
    case 'clinic': Sim.clinicTick(a); break;
    case 'protest': if (S.t % 15 === 0 && rnd() < 0.3) sayBubble(a, pick(['Bread we can afford!', 'Do something, mayor!', 'Prices down!', 'We are hungry!'])); break;
    case 'jail': break;
  }
}

// ---------- main step ----------
Sim.minuteTick = function () {
  const m = Math.floor(S.t);
  const h = hourOf(m);
  for (const a of S.agents) {
    if (a.left) continue;
    needsTick(a);
    actTick(a);
    const hold = a.plan && ((a.plan.type === 'sleep' && a.sleeping) || a.plan.type === 'steal' || a.plan.type === 'jail' || a.plan.type === 'follow') && S.t < a.plan.until;
    if (!a.convo && ((!hold && S.t >= a.thinkAt) || (a.plan && a.plan.until <= S.t))) chooseAndGo(a);
    else if (!a.convo && a.needs.hunger < 0.12 && a.plan && a.plan.type !== 'eat' && a.plan.type !== 'clinic' && a.plan.type !== 'jail' && S.t - a.plan.t0 > 20) chooseAndGo(a);
    if (m % 10 === 0) updateMood(a);
    if (a.bubble && S.t - a.bubble.t > 7) a.bubble = null;
    if (a.thought && S.t - a.thought.t > 30) a.thought = null;
  }
  tickConvos();
  Sim.societyMinute(m, h);
};

Sim.advance = function (dtMin) {
  // continuous movement + discrete minute ticks
  const before = S.t;
  S.t += dtMin;
  if (!S.coarse) for (const a of S.agents) if (!a.left && !a.convo) moveAgent(a, dtMin);
  let guard = 0;
  for (let m = Math.floor(before) + 1; m <= Math.floor(S.t) && guard < 400; m++, guard++) {
    const save = S.t; S.t = m; Sim.minuteTick(); S.t = save;
  }
};

Sim.setObserver = function (x, z) {
  if (!S) return;
  S.obs = [x, z];
};
Sim.updateLOD = function () {
  const o = S.obs || [48, 48];
  for (const a of S.agents) {
    if (a.left) continue;
    const d = Math.hypot(a.x - o[0], a.z - o[1]);
    a.lod = a.sleeping ? 0 : d < 24 ? 3 : d < 48 ? 2 : 1;
  }
};

// social summaries & semantic beliefs (once a day)
Sim.summarize = function () {
  for (const a of S.agents) {
    if (a.left) continue;
    pruneMemories(a);
    a.summaries = {};
    const others = Object.keys(a.rel).filter(id => id === 'you' || S.byId[id]).map(id => [id, a.rel[id]]).filter(([, r]) => r[RI.familiarity] > 30 || Math.abs(r[0]) > 25 || Math.abs(r[1]) > 25 || r[RI.resentment] > 20);
    for (const [id, r] of others) {
      const nm = nameOf(id);
      const mems = a.memories.filter(m => m.about === id || m.actor === id);
      const helped = mems.filter(m => m.kind === 'helped_me').length;
      const sup = mems.filter(m => m.kind === 'endorsed').length;
      const args = mems.filter(m => m.kind === 'argument').length;
      let s = null;
      if (a.family.includes(id)) s = nm + ' is family.';
      else if (a.housemates && a.housemates.includes(id) && r[1] > 20) s = nm + ' shares my roof.';
      if (helped >= 2) s = nm + ' usually helps me.';
      else if (sup >= 1) s = nm + ' supports me.';
      else if (args >= 2) s = nm + ' and I keep clashing.';
      else if (r[RI.resentment] > 45) s = 'I have not forgiven ' + nm + '.';
      else if (r[0] > 45 && r[2] > 30) s = nm + ' is reliable. I can count on them.';
      else if (r[0] < -30) s = 'I do not trust ' + nm + '.';
      else if (r[1] > 50) s = nm + ' is one of my closest friends.';
      else if (r[RI.attraction] > 50) s = 'I cannot stop thinking about ' + nm + '.';
      else if (r[RI.jealousy] > 45) s = nm + ' has it too easy.';
      if (s) a.summaries[id] = s;
      // semantic trait beliefs
      const t = r[0] > 40 ? 'trustworthy' : r[0] < -35 ? 'dishonest' : null;
      if (t) a.traitsBelief[id] = t; else delete a.traitsBelief[id];
    }
    // belief decay
    for (const b of a.beliefs) { if (S.t - b.t > DAY) b.conf *= 0.93; }
    a.beliefs = a.beliefs.filter(b => b.conf > 0.08 || b.type === 'secret');
    for (const c in a.support) a.support[c] *= 0.85;
  }
};

// read-only views for UI
Sim.agentsList = () => S.agents.filter(a => !a.left);
Sim.topRelations = function (a, n) {
  const arr = Object.keys(a.rel).filter(id => S.byId[id] && !S.byId[id].left).map(id => ({ id, r: a.rel[id], s: relScore(a, id) }));
  arr.sort((x, y) => y.s - x.s);
  return { friends: arr.slice(0, n || 3), rivals: arr.slice(-(n || 3)).reverse().filter(x => x.s < 0) };
};

if (typeof module !== 'undefined' && module.exports) module.exports = AV;
})(typeof window !== 'undefined' ? window : globalThis);
