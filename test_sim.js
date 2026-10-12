globalThis.World = require('./world.js');
require('./cast.js'); require('./sim.js'); require('./society.js');
const AV = globalThis.AV, Sim = AV.Sim;
console.time('new'); Sim.newWorld(); console.timeEnd('new');
const S = Sim.S();
const days = +process.argv[2] || 4;
const snapRel = () => S.agents.map(a => Object.values(a.rel).map(r => r.slice()));
const r0 = snapRel();
console.time('run');
const coarse = process.argv[3] === 'coarse';
S.coarse = coarse;
for (let i = 0; i < days * 1440; i++) {
  Sim.advance(1);
  if (i % 1440 === 1439) { const st = Sim.stats(); console.log('DAY', st.day, JSON.stringify(st)); }
}
console.timeEnd('run');
const types = {};
for (const e of S.events) types[e.type] = (types[e.type] || 0) + 1;
console.log('event types', JSON.stringify(types));
console.log('--- FEED (imp>=0.5) ---');
for (const e of S.feed.slice().reverse()) if (e.imp >= 0.5) console.log(Sim.fmtClock(e.t), 'D' + e.day, e.type, '|', e.text, e.truth ? '[' + e.truth + ']' : '');
console.log('--- PAPERS ---');
for (const n of S.news) console.log('#' + n.no, 'day', n.day, n.headlines.map(h => h.h).join(' / '));
// relationship change
const r1 = snapRel(); let ch = 0, n = 0; r0.forEach((rows, i) => rows.forEach((r, j) => { const d = r.reduce((x, v, k) => x + Math.abs(v - r1[i][j][k]), 0); ch += d; n++; }));
console.log('avg rel change per pair', (ch / n).toFixed(2));
console.log('crimes', S.crimes.map(c => c.thief + '@' + c.place + (c.witnesses && c.witnesses.length ? ' seen by ' + c.witnesses.join(',') : '')).join('; '));
console.log('cases', S.cases.map(c => c.place + ':' + c.status + (c.accused ? ' accused ' + c.accused + (c.correct ? ' (right)' : ' (WRONG)') : '') + ' ev=' + c.evidence.length + ' iv=' + c.interviewed.length).join('; '));
console.log('rumors', Object.keys(S.rumors).length, 'longest chain', Math.max(...Object.values(S.rumors).map(r => r.hops.length)));
const jobs = {}; S.agents.forEach(a => jobs[a.job] = (jobs[a.job] || 0) + 1); console.log('jobs', JSON.stringify(jobs));
console.log('econ', JSON.stringify(S.econ.hist.slice(-5)));
console.log('town', JSON.stringify(S.town).slice(0, 300));
for (const id of ['ada', 'finn', 'rose', 'arthur', 'milo', 'henry', 'elias']) { const a = S.byId[id]; console.log(id, a.moodLabel, Math.round(a.money), 'missed', a.shiftsMissed, 'beliefs', a.beliefs.length, 'mems', a.memories.length, '|', a.decisions.slice(0, 3).map(d => d.chosen + '(' + d.reason + ')').join(', '), '|', Object.values(a.summaries).slice(0, 3).join(' ')); }
console.log('convos logged', (S.convoLog || []).length); for (const c of (S.convoLog || []).slice(0, 6)) console.log(' ', c.intent, c.lines.map(l => Sim.nameOf(l.who) + ': ' + l.text).join(' / '));
console.log('save size KB', (Sim.serialize().length / 1024).toFixed(0));
