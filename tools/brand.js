#!/usr/bin/env node
// Writes the block-brain mark as an isometric SVG from the same voxel model the game uses.
//   node tools/brand.js            -> assets/brand/block-brain.svg
//   node tools/brand.js out.svg 8  -> custom path and cube size
'use strict';
const fs = require('fs');
const path = require('path');
const Brain = require(path.join(__dirname, '..', 'web', 'js', 'brain.js'));

const out = process.argv[2] || path.join(__dirname, '..', 'assets', 'brand', 'block-brain.svg');
const S = +(process.argv[3] || 10);
const vox = Brain.voxels();
const has = new Set(vox.map(v => v[0] + ',' + v[1] + ',' + v[2]));
const at = (x, y, z) => has.has(x + ',' + y + ',' + z);

// isometric projection, viewer at (+x, +y, +z)
const C = Math.cos(Math.PI / 6), Sn = 0.5;
const P = (x, y, z) => [(x - z) * C * S, (x + z) * Sn * S - y * S];
let rnd = 7; const r = () => { rnd = (rnd * 16807) % 2147483647; return (rnd - 1) / 2147483646; };
const pick = (a) => a[Math.floor(r() * a.length)];
const GRASS = ['#6fb043', '#76b84a', '#68a83e', '#7cc24d'];
const DIRT_L = ['#8a6140', '#845c3b', '#8f6643'], DIRT_R = ['#6a462a', '#654328', '#70492c'];
const FRINGE_L = '#5e9a37', FRINGE_R = '#4d822c';
const STONE_L = '#8f8f8a', STONE_R = '#73736f', STONE_T = '#a3a39e';

const polys = [];
const poly = (pts, fill) => polys.push('<polygon points="' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '" fill="' + fill + '"/>');
const sorted = vox.slice().sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]) || a[1] - b[1]);
for (const [x, y, z, k] of sorted) {
  const top = !at(x, y + 1, z), right = !at(x + 1, y, z), left = !at(x, y, z + 1);
  const T = [P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)];
  const Rf = [P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1), P(x + 1, y, z)];
  const Lf = [P(x, y + 1, z + 1), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1), P(x, y, z + 1)];
  const stone = k === 's';
  if (left) {
    poly(Lf, stone ? STONE_L : pick(DIRT_L));
    if (k === 'g') poly([P(x, y + 1, z + 1), P(x + 1, y + 1, z + 1), P(x + 1, y + 0.72, z + 1), P(x, y + 0.72, z + 1)], FRINGE_L);
  }
  if (right) {
    poly(Rf, stone ? STONE_R : pick(DIRT_R));
    if (k === 'g') poly([P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y + 0.72, z + 1), P(x + 1, y + 0.72, z)], FRINGE_R);
  }
  if (top) poly(T, stone ? STONE_T : k === 'g' ? pick(GRASS) : pick(DIRT_L));
}
// bounds
let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
for (const [x, y, z] of vox) for (const [dx, dy, dz] of [[0, 0, 0], [1, 1, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [0, 1, 1], [1, 0, 1]]) { const [a, b] = P(x + dx, y + dy, z + dz); mnx = Math.min(mnx, a); mxx = Math.max(mxx, a); mny = Math.min(mny, b); mxy = Math.max(mxy, b); }
const pad = S;
const w = Math.ceil(mxx - mnx + pad * 2), h = Math.ceil(mxy - mny + pad * 2);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(mnx - pad).toFixed(1)} ${(mny - pad).toFixed(1)} ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges" role="img" aria-label="AI CRAFT block brain"><g stroke="none">${polys.join('')}</g></svg>\n`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, svg);
console.log('wrote', out, w + 'x' + h, polys.length, 'faces');
