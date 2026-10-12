#!/usr/bin/env node
// Writes the block-brain mark as an SVG from the same voxel model the game uses:
// a brain seen from the side, grass on the ridges, soil in the folds, a stone stem.
//   node tools/brand.js                 -> assets/brand/block-brain.svg
//   node tools/brand.js out.svg 12      -> custom path and cube size
//   node tools/brand.js out.svg 12 66 24 -> also the view: turn and elevation in degrees
'use strict';
const fs = require('fs');
const path = require('path');
const Brain = require(path.join(__dirname, '..', 'web', 'js', 'brain.js'));

const out = process.argv[2] || path.join(__dirname, '..', 'assets', 'brand', 'block-brain.svg');
const S = +(process.argv[3] || 12);
const AZ = +(process.argv[4] || 66) * Math.PI / 180, EL = +(process.argv[5] || 24) * Math.PI / 180;
const vox = Brain.voxels();
const has = new Set(vox.map(v => v[0] + ',' + v[1] + ',' + v[2]));
const at = (x, y, z) => has.has(x + ',' + y + ',' + z);

// orthographic view from the side of the brain, a little above it
const cam = [Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL)];
const right = [Math.cos(AZ), 0, -Math.sin(AZ)];
const up = [-Math.sin(AZ) * Math.sin(EL), Math.cos(EL), -Math.cos(AZ) * Math.sin(EL)];
const P = (x, y, z) => [(x * right[0] + z * right[2]) * S, -(x * up[0] + y * up[1] + z * up[2]) * S];
const depth = (x, y, z) => x * cam[0] + y * cam[1] + z * cam[2];
let seed = 9; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const PAL = {
  g: ['#6fb043', '#76b84a', '#68a83e', '#7cc24d'],
  d: ['#7b5434', '#6a462a', '#8a6140'],
  s: ['#8f8f8a', '#9a9a94', '#85857f'],
};
const LIGHT = { top: 1.0, side: 0.84, front: 0.7 };
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.min(255, Math.round(v * f)).toString(16).padStart(2, '0')).join(''); };

const faces = [];
for (const [x, y, z, k] of vox) {
  const F = [];
  if (!at(x, y + 1, z)) F.push([[[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]], LIGHT.top]);
  if (cam[0] > 0 && !at(x + 1, y, z)) F.push([[[x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x + 1, y, z + 1], [x + 1, y, z]], LIGHT.side]);
  if (cam[0] < 0 && !at(x - 1, y, z)) F.push([[[x, y + 1, z], [x, y + 1, z + 1], [x, y, z + 1], [x, y, z]], LIGHT.side]);
  if (cam[2] > 0 && !at(x, y, z + 1)) F.push([[[x, y + 1, z + 1], [x + 1, y + 1, z + 1], [x + 1, y, z + 1], [x, y, z + 1]], LIGHT.front]);
  for (const [pts, l] of F) {
    const pal = PAL[k] || PAL.g;
    faces.push({ d: pts.reduce((a, q) => a + depth(...q), 0) / 4, pts: pts.map(q => P(...q)), fill: shade(pal[Math.floor(rnd() * pal.length)], l) });
  }
}
faces.sort((a, b) => a.d - b.d);
let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
for (const f of faces) for (const [a, b] of f.pts) { mnx = Math.min(mnx, a); mny = Math.min(mny, b); mxx = Math.max(mxx, a); mxy = Math.max(mxy, b); }
const pad = S;
const w = Math.ceil(mxx - mnx + pad * 2), h = Math.ceil(mxy - mny + pad * 2);
const pts = (f) => f.pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
const outline = faces.map(f => `<polygon points="${pts(f)}"/>`).join('');
const body = faces.map(f => `<polygon points="${pts(f)}" fill="${f.fill}" stroke="${f.fill}" stroke-width="0.6"/>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(mnx - pad).toFixed(1)} ${(mny - pad).toFixed(1)} ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="AI CRAFT block brain">` +
  `<defs><filter id="edge"><feMorphology operator="dilate" radius="${(S * 0.35).toFixed(1)}"/></filter></defs>` +
  `<g fill="#2a1a0c" filter="url(#edge)">${outline}</g>${body}</svg>`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, svg);
console.log('wrote', out, w + 'x' + h, faces.length, 'faces');
