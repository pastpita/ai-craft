const path = require('path');
const JS = path.join(__dirname, '..', 'web', 'js');
globalThis.World = require(path.join(JS, 'world.js'));
for (const f of ['cast', 'sim', 'society', 'civ', 'sync']) require(path.join(JS, f + '.js'));
const AV = globalThis.AV, Sim = AV.Sim, Civ = AV.Civ;
console.time('new'); Sim.newWorld(12345); console.timeEnd('new');
const S = Sim.S();
const days = +process.argv[2] || 2;
const coarse = process.argv[3] === 'coarse';
S.coarse = coarse;
console.time('run');
for (let i = 0; i < days * 1440; i++) {
  Sim.advance(1);
  if (i % 1440 === 1439) { console.log('DAY', JSON.stringify(Sim.worldStats()).slice(0, 600)); for (const v of World.VILLAGES) console.log('  ', v.id, JSON.stringify(Sim.stats(v.id)).slice(0, 400)); }
}
console.timeEnd('run');
const types = {}; for (const e of S.events) types[e.type] = (types[e.type] || 0) + 1;
console.log('event types', JSON.stringify(types));
console.log('--- FEED imp>=.6 ---');
for (const e of S.feed.slice(0, 40).reverse()) if (e.imp >= 0.6) console.log(Sim.fmtClock(e.t), 'D' + e.day, e.vid, e.type, '|', e.text);
console.log('--- MIND FEED ---'); for (const m of S.mindFeed.slice(0, 15)) console.log(JSON.stringify(m).slice(0, 200));
console.log('--- HISTORY ---'); for (const h of S.history.slice(-15)) console.log(JSON.stringify(h).slice(0, 200));
console.log('projects', S.projects.map(p => p.vid + ':' + p.kind + ':' + (p.spec && p.spec.name) + ' ' + p.i + '/' + p.blocks.length + (p.done ? ' done' : '') + (p.waiting ? ' waiting ' + p.waiting : '')).join('; '));
console.log('businesses', JSON.stringify(Object.values(S.businesses).map(b => b.name + '@' + b.vid)).slice(0, 400));
for (const v of World.VILLAGES) console.log(v.id, 'stock', JSON.stringify(S.villages[v.id].econ.stock), 'tier', S.villages[v.id].tier);
const top = S.agents.filter(a => !a.left).sort((a, b) => b.scores.cognition - a.scores.cognition).slice(0, 8);
for (const a of top) console.log(a.name, a.vid, a.job, a.mind.type, JSON.stringify(a.scores));
const a0 = S.agents[0]; console.log('dlog', JSON.stringify(a0.decisions[0]).slice(0, 500));
console.log('papers', S.villages && Object.values(S.villages).map(v => (v.news || []).length).join(','), (S.news || []).length);
module.exports = { S };
