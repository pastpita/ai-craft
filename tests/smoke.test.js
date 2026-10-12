// Headless smoke test: builds a world, runs a world day, checks the core loops and the shared-world round trip.
'use strict';
const assert = require('assert');
const path = require('path');
const JS = path.join(__dirname, '..', 'web', 'js');
globalThis.World = require(path.join(JS, 'world.js'));
for (const f of ['cast', 'sim', 'society', 'civ', 'sync']) require(path.join(JS, f + '.js'));
const { Sim, Civ, Sync } = globalThis.AV;

const t0 = Date.now();
Sim.newWorld(4242);
const S = Sim.S();
assert.strictEqual(S.agents.length, 120, '120 villagers');
assert.strictEqual(Object.keys(S.villages).length, 5, 'five villages');
for (let i = 0; i < 1440; i++) Sim.advance(1);

const work = S.counters.work || {};
assert.ok((work.harvested || 0) + (work.planted || 0) > 20, 'farmers plant and harvest');
assert.ok((work.hauls || 0) > 10, 'loads are carried to storehouses');
assert.ok(S.agents.every(a => a.left || (a.task && a.task.t)), 'every villager has a task descriptor');
assert.ok(S.agents.some(a => a.decisions && a.decisions[0] && a.decisions[0].why), 'decisions carry structured summaries');
assert.ok(S.history.length >= 1, 'history is written');
for (const a of S.agents) for (const k of ['cognition', 'memory', 'socialIQ']) assert.ok(a.scores[k] >= 1 && a.scores[k] <= 99, 'scores in range');

// documents stay under the store's 256 KiB limit and rebuild into the same world
const docs = Sync.allDocs(S, { worldId: S.worldId });
for (const k in docs) assert.ok(Sync.bytes(docs[k]) < 240 * 1024, k + ' fits in one document');
const t = S.t, n = S.agents.length;
const S2 = Sync.build(JSON.parse(JSON.stringify(docs)));
assert.strictEqual(S2.t, t); assert.strictEqual(S2.agents.length, n);
for (let i = 0; i < 120; i++) Sim.advance(1);

// offline catch-up: three days pass in one call
const day = Sim.dayOf(Sim.S().t);
Civ.catchUp(3 * 1440);
assert.ok(Sim.dayOf(Sim.S().t) >= day + 3, 'catch-up advances the clock');

console.log('smoke test passed in', ((Date.now() - t0) / 1000).toFixed(1) + 's',
  '| planted', work.planted || 0, 'harvested', work.harvested || 0, 'blocks', work.blocks || 0, 'hauls', work.hauls || 0);
