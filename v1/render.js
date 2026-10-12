/* AI VILLAGE — render.js
   Original pixel textures, chunked voxel meshing with baked AO + sky/torch light,
   a custom day/night shader, voxel villagers, sky, clouds, rain and the heatmap overlay. */
(function (root) {
'use strict';
const AV = root.AV = root.AV || {};
const W = root.World, THREE = root.THREE;
const R = AV.Render = {};
const TILE = 16, COLS = 8, ROWS = 4;

// ---------------- texture atlas ----------------
function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function paintAtlas() {
  const cv = document.createElement('canvas'); cv.width = COLS * TILE; cv.height = ROWS * TILE;
  const g = cv.getContext('2d');
  const img = g.createImageData(cv.width, cv.height);
  const px = (t, x, y, c, a) => { const tx = (t % COLS) * TILE + x, ty = Math.floor(t / COLS) * TILE + y; const i = (ty * cv.width + tx) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = a === undefined ? 255 : a; };
  const shade = (c, f) => [Math.max(0, Math.min(255, c[0] * f)), Math.max(0, Math.min(255, c[1] * f)), Math.max(0, Math.min(255, c[2] * f))];
  const noiseFill = (t, base, amp, seed) => { const r = rng(seed); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(t, x, y, shade(hex(base), 1 - amp / 2 + r() * amp)); };
  // 0 grass top
  noiseFill(0, '#6c9a3f', 0.35, 11); { const r = rng(5); for (let i = 0; i < 26; i++) px(0, Math.floor(r() * 16), Math.floor(r() * 16), hex(r() < .5 ? '#86b551' : '#557d30')); }
  // 2 dirt
  noiseFill(2, '#7a5636', 0.35, 22); { const r = rng(9); for (let i = 0; i < 18; i++) px(2, Math.floor(r() * 16), Math.floor(r() * 16), hex(r() < .5 ? '#5e3f26' : '#93704a')); }
  // 1 grass side
  noiseFill(1, '#7a5636', 0.35, 23); { const r = rng(3); for (let x = 0; x < 16; x++) { const d = 3 + Math.floor(r() * 3); for (let y = 0; y < d; y++) px(1, x, y, shade(hex('#6c9a3f'), 0.85 + r() * 0.3)); } }
  // 3 stone
  noiseFill(3, '#8d8f8a', 0.22, 33); { const r = rng(4); for (let i = 0; i < 6; i++) { let x = Math.floor(r() * 16), y = Math.floor(r() * 16); for (let k = 0; k < 4; k++) { px(3, x & 15, y & 15, hex('#6f716c')); x += r() < .5 ? 1 : 0; y += 1; } } }
  // 4 log side
  { const r = rng(44); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const stripe = (x % 4 === 0 || x % 7 === 3) ? 0.75 : 1; px(4, x, y, shade(hex('#6b4a2c'), stripe * (0.85 + r() * 0.25))); } }
  // 5 log top
  { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); const ring = Math.floor(d) % 3 === 0 ? 0.8 : 1; px(5, x, y, d > 7 ? hex('#5a3d24') : shade(hex('#b08a5a'), ring)); } }
  // 6 planks
  { const r = rng(66); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const seam = y % 4 === 3 ? 0.68 : 1; const joint = (x === ((y >> 2) * 5 + 3) % 16) ? 0.75 : 1; px(6, x, y, shade(hex('#b48a54'), seam * joint * (0.9 + r() * 0.15))); } px(6, 2, 1, hex('#5b4026')); px(6, 13, 9, hex('#5b4026')); }
  // 7 glass (cutout)
  { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const edge = x === 0 || y === 0 || x === 15 || y === 15; const glint = (x - y === 4 || x - y === 5) && x > 3 && x < 12; if (edge) px(7, x, y, hex('#d9e7ea')); else if (glint) px(7, x, y, hex('#f4fbff')); else px(7, x, y, hex('#a8d0dc'), 0); } }
  // 8 brick
  { const r = rng(88); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const row = y >> 2; const mortar = y % 4 === 3 || ((x + (row % 2) * 4) % 8 === 7); px(8, x, y, mortar ? hex('#c9bca6') : shade(hex('#9c4a35'), 0.85 + r() * 0.25)); } }
  // 9 roof tile (terracotta scallops)
  { const r = rng(99); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const row = y >> 2; const cx = ((x + (row % 2) * 2) % 4) - 1.5; const curve = (y % 4) < 1 + Math.abs(cx) * 0.6; px(9, x, y, shade(hex('#b55a3a'), (curve ? 0.7 : 1) * (0.9 + r() * 0.2))); } }
  // 10 sand
  noiseFill(10, '#d8c48c', 0.2, 1010);
  // 11 water
  { const r = rng(111); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const w = Math.sin((x + y * 0.5) * 0.8) > 0.6 ? 1.25 : 1; px(11, x, y, shade(hex('#3f6f9e'), w * (0.92 + r() * 0.12))); } }
  // 12 farmland
  { const r = rng(1212); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(12, x, y, shade(hex('#5a3c22'), (y % 4 < 1 ? 0.7 : 1) * (0.85 + r() * 0.25))); }
  // 13 crop (cutout)
  { const r = rng(1313); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(13, x, y, [0, 0, 0], 0); for (let k = 0; k < 6; k++) { const x = 1 + k * 2 + Math.floor(r() * 2); const top = 2 + Math.floor(r() * 4); for (let y = top; y < 16; y++) px(13, x, y, hex(y < top + 3 ? '#d6b84a' : '#7fa040')); } }
  // 14 ore (amber flecks in stone)
  noiseFill(14, '#8d8f8a', 0.22, 1414); { const r = rng(7); for (let i = 0; i < 5; i++) { const x = 2 + Math.floor(r() * 11), y = 2 + Math.floor(r() * 11); px(14, x, y, hex('#e0a040')); px(14, x + 1, y, hex('#c07a28')); px(14, x, y + 1, hex('#f2c060')); } }
  // 15 fence post
  { const r = rng(1515); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(15, x, y, shade(hex('#8a6438'), (x % 5 === 0 ? 0.8 : 1) * (0.9 + r() * 0.2))); }
  // 16 torch (stick + flame)
  { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(16, x, y, y < 5 ? hex(y < 2 ? '#fff2a8' : '#ffb440') : hex('#6b4a2c')); }
  // 17 door
  { const r = rng(1717); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { let c = shade(hex('#7b5530'), (x % 4 === 0 ? 0.75 : 1) * (0.9 + r() * 0.15)); if (y > 2 && y < 6 && x > 3 && x < 12) c = hex('#a8c8d0'); if (x === 12 && y === 9) c = hex('#2a2a2a'); px(17, x, y, c); } }
  // 18 path
  noiseFill(18, '#a68a5c', 0.3, 1818); { const r = rng(18); for (let i = 0; i < 20; i++) px(18, Math.floor(r() * 16), Math.floor(r() * 16), hex(r() < .5 ? '#8a7048' : '#c0a476')); }
  // 19 leaves (cutout)
  { const r = rng(1919); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const hole = r() < 0.16; px(19, x, y, shade(hex('#4d7a2e'), 0.75 + r() * 0.45), hole ? 0 : 255); } }
  // 20 cobble
  { const r = rng(2020); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const cx = (x + (Math.floor(y / 5) % 2) * 3) % 6, cy = y % 5; const edge = cx === 0 || cy === 0; px(20, x, y, edge ? hex('#5e605c') : shade(hex('#9a9c96'), 0.85 + r() * 0.25)); } }
  // 21 plaster
  noiseFill(21, '#e4dccb', 0.1, 2121);
  // 22 slate
  { const r = rng(2222); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const row = y >> 2; const edge = y % 4 === 3 || ((x + row * 3) % 6 === 0); px(22, x, y, edge ? hex('#3a4450') : shade(hex('#5c6b7a'), 0.88 + r() * 0.2)); } }
  // 23 cloth stripes
  { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(23, x, y, (x >> 2) % 2 ? hex('#efe2c4') : hex('#a8423a')); }
  // 24 shelf side
  { const r = rng(2424); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { let c = hex('#6b4a2c'); if (y % 8 === 7 || x === 0 || x === 15) c = hex('#b48a54'); else if (y % 8 > 1 && r() < 0.55) c = hex(['#3f6f9e', '#a8423a', '#d6b84a', '#6c9a3f', '#efe2c4'][Math.floor(r() * 5)]); px(24, x, y, c); } }
  // 25 oven side
  { const r = rng(2525); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const mortar = y % 4 === 3 || ((x + ((y >> 2) % 2) * 4) % 8 === 7); let c = mortar ? hex('#8a7a66') : shade(hex('#7a3a2a'), 0.85 + r() * 0.2); if (x > 3 && x < 12 && y > 7 && y < 14) c = y > 11 ? hex('#ffb440') : hex('#2a1810'); px(25, x, y, c); } }
  g.putImageData(img, 0, 0);
  return cv;
}

// ---------------- chunk meshing ----------------
const CH = 16;
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: 0.8 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: 0.8 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 0.55 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.9 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.7 },
];
let skyTop = null;
function computeSkyTop() {
  skyTop = new Int16Array(W.W * W.D);
  for (let x = 0; x < W.W; x++) for (let z = 0; z < W.D; z++) { let y = W.H - 1; while (y > 0 && !W.isOpaque(x, y, z)) y--; skyTop[x + z * W.W] = y; }
}
function skyAt(x, y, z) { if (x < 0 || z < 0 || x >= W.W || z >= W.D) return 1; return y > skyTop[x + z * W.W] ? 1 : 0.32; }
function lightAt(x, y, z) { if (!W.inb(x, y, z)) return 0; return W.light[W.idx(x, y, z)] / 14; }

function tileUV(t) { const u = (t % COLS) / COLS, v = Math.floor(t / COLS) / ROWS; const e = 0.0008; return [u + e, 1 - v - 1 / ROWS + e, u + 1 / COLS - e, 1 - v - e]; }

function buildChunk(cx, cz) {
  const out = { o: newBuf(), w: newBuf() };
  const B = W.BLOCKS;
  for (let x = cx * CH; x < cx * CH + CH; x++) for (let z = cz * CH; z < cz * CH + CH; z++) for (let y = 0; y < W.H; y++) {
    const id = W.data[W.idx(x, y, z)]; if (!id) continue;
    const b = B[id];
    if (b.shape === 'cube' || b.shape === 'liquid') {
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
        const nid = W.get(nx, ny, nz);
        const nb = B[nid];
        if (b.liquid) { if (nid === id || (nb.opaque && f !== 2)) continue; }
        else if (nb.opaque || (b.cutout && nid === id)) continue;
        const tile = f === 2 ? b.tex[0] : f === 3 ? b.tex[2] : b.tex[1];
        const buf = b.liquid ? out.w : out.o;
        const sky = skyAt(nx, ny, nz), tl = b.light ? 1.15 : lightAt(nx, ny, nz);
        const uv = tileUV(tile);
        const corners = F.c.map(c => [x + c[0], y + (b.liquid && c[1] === 1 ? 0.86 : c[1]), z + c[2]]);
        const ao = F.c.map(c => b.liquid ? 1 : vertAO(x, y, z, F.n, c));
        pushQuad(buf, corners, F.n, uv, ao.map(a => a * F.s), sky, tl, f === 2 || f === 3 ? 0 : 1);
      }
    } else if (b.shape === 'cross') {
      const uv = tileUV(b.tex[0]); const sky = skyAt(x, y, z), tl = lightAt(x, y, z);
      const q1 = [[x + .15, y, z + .15], [x + .85, y, z + .85], [x + .85, y + .9, z + .85], [x + .15, y + .9, z + .15]];
      const q2 = [[x + .85, y, z + .15], [x + .15, y, z + .85], [x + .15, y + .9, z + .85], [x + .85, y + .9, z + .15]];
      for (const q of [q1, q2]) { pushQuad(out.o, q, [0, 1, 0], uv, [0.9, 0.9, 0.9, 0.9], sky, tl, 0); pushQuad(out.o, [q[1], q[0], q[3], q[2]], [0, 1, 0], uv, [0.9, 0.9, 0.9, 0.9], sky, tl, 0); }
    } else {
      // small boxes: post, torch, door
      let x0 = 0.375, x1 = 0.625, z0 = 0.375, z1 = 0.625, y0 = 0, y1 = 1;
      if (b.shape === 'torch') { x0 = z0 = 0.44; x1 = z1 = 0.56; y1 = 0.62; }
      if (b.shape === 'door') {
        const alongX = W.isSolid(x - 1, y, z) || W.isSolid(x + 1, y, z);
        if (alongX) { x0 = 0; x1 = 1; z0 = 0.42; z1 = 0.58; } else { z0 = 0; z1 = 1; x0 = 0.42; x1 = 0.58; }
      }
      boxFaces(out.o, x, y, z, x0, y0, z0, x1, y1, z1, b, skyAt(x, y, z), b.light ? 1.25 : lightAt(x, y, z));
    }
  }
  return out;
}
function boxFaces(buf, x, y, z, x0, y0, z0, x1, y1, z1, b, sky, tl) {
  const uvT = tileUV(b.tex[1]);
  const [u0, v0, u1, v1] = uvT; const du = u1 - u0, dv = v1 - v0;
  const sub = (a0, a1, b0, b1) => [u0 + du * a0, v0 + dv * b0, u0 + du * a1, v0 + dv * b1];
  const P = (a, bb, c) => [x + a, y + bb, z + c];
  const faces = [
    [[P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1)], [1, 0, 0], sub(z0, z1, y0, y1), 0.8],
    [[P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)], [-1, 0, 0], sub(z0, z1, y0, y1), 0.8],
    [[P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], [0, 1, 0], sub(x0, x1, z0, z1), 1],
    [[P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], [0, -1, 0], sub(x0, x1, z0, z1), 0.55],
    [[P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], [0, 0, 1], sub(x0, x1, y0, y1), 0.9],
    [[P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0)], [0, 0, -1], sub(x0, x1, y0, y1), 0.7],
  ];
  for (const [c, n, uv, s] of faces) pushQuad(buf, c, n, uv, [s, s, s, s], sky, tl, 1);
}
function vertAO(x, y, z, n, c) {
  // neighbours in the layer the face looks into
  const ax = n[0] !== 0 ? 0 : 1; // pick two tangent axes
  const t1 = n[0] !== 0 ? [0, 1, 0] : n[1] !== 0 ? [1, 0, 0] : [1, 0, 0];
  const t2 = n[0] !== 0 ? [0, 0, 1] : n[1] !== 0 ? [0, 0, 1] : [0, 1, 0];
  void ax;
  const s1d = (t1[0] ? (c[0] ? 1 : -1) : t1[1] ? (c[1] ? 1 : -1) : (c[2] ? 1 : -1));
  const s2d = (t2[0] ? (c[0] ? 1 : -1) : t2[1] ? (c[1] ? 1 : -1) : (c[2] ? 1 : -1));
  const bx = x + n[0], by = y + n[1], bz = z + n[2];
  const o = (dx, dy, dz) => W.isOpaque(bx + dx, by + dy, bz + dz) ? 1 : 0;
  const a = o(t1[0] * s1d, t1[1] * s1d, t1[2] * s1d);
  const bb = o(t2[0] * s2d, t2[1] * s2d, t2[2] * s2d);
  const cc = o(t1[0] * s1d + t2[0] * s2d, t1[1] * s1d + t2[1] * s2d, t1[2] * s1d + t2[2] * s2d);
  const occ = a && bb ? 3 : a + bb + cc;
  return [1, 0.8, 0.66, 0.52][occ];
}
function newBuf() { return { p: [], n: [], uv: [], c: [], i: [] }; }
function pushQuad(buf, c, n, uv, ao, sky, tl, side) {
  const base = buf.p.length / 3;
  const [u0, v0, u1, v1] = uv;
  const uvs = side ? [[u0, v0], [u1, v0], [u1, v1], [u0, v1]] : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  for (let k = 0; k < 4; k++) { buf.p.push(c[k][0], c[k][1], c[k][2]); buf.n.push(n[0], n[1], n[2]); buf.uv.push(uvs[k][0], uvs[k][1]); buf.c.push(ao[k], sky, tl); }
  if (ao[0] + ao[2] < ao[1] + ao[3]) buf.i.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  else buf.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
function toGeom(buf) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(buf.c, 3));
  g.setIndex(buf.i);
  g.computeBoundingSphere();
  return g;
}

const VERT = `
attribute vec3 color;
varying vec2 vUv; varying vec3 vC; varying float vFog; varying float vSun; varying vec3 vWorld;
uniform vec3 sunDir; uniform float fogNear; uniform float fogFar; uniform float wave;
void main(){
  vUv = uv; vC = color;
  vec3 p = position;
  if (wave > 0.0) { p.y += sin(p.x * 1.3 + wave) * 0.04 + cos(p.z * 1.1 + wave * 0.8) * 0.04; vUv.x += wave * 0.002; }
  vSun = 0.62 + 0.38 * max(dot(normal, sunDir), 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vWorld = p;
  vFog = smoothstep(fogNear, fogFar, length(mv.xyz));
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D map; uniform float daylight; uniform vec3 fogColor; uniform float alpha; uniform vec3 skyTint;
varying vec2 vUv; varying vec3 vC; varying float vFog; varying float vSun; varying vec3 vWorld;
void main(){
  vec4 t = texture2D(map, vUv);
  if (alpha > 0.99 && t.a < 0.5) discard;
  float sky = vC.g * daylight * vSun;
  float torch = vC.b;
  vec3 light = skyTint * sky + vec3(1.0, 0.72, 0.42) * pow(min(torch, 1.0), 1.6) * (1.15 - daylight * 0.75);
  if (torch > 1.05) light = vec3(1.25, 1.1, 0.9);
  light = max(light, vec3(0.055, 0.06, 0.09));
  vec3 col = t.rgb * light * vC.r;
  col = mix(col, fogColor, vFog);
  gl_FragColor = vec4(col, alpha > 0.99 ? 1.0 : alpha);
}`;

R.init = function (scene) {
  R.scene = scene;
  const atlas = paintAtlas();
  R.atlasCanvas = atlas;
  const tex = new THREE.CanvasTexture(atlas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  R.uniforms = { map: { value: tex }, daylight: { value: 1 }, sunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() }, fogColor: { value: new THREE.Color('#9fc4d8') }, fogNear: { value: 40 }, fogFar: { value: 90 }, alpha: { value: 1 }, wave: { value: 0 }, skyTint: { value: new THREE.Color(1, 1, 1) } };
  R.matOpaque = new THREE.ShaderMaterial({ uniforms: R.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.FrontSide });
  const wu = Object.assign({}, R.uniforms, { alpha: { value: 0.78 }, wave: { value: 0.001 } });
  R.waterUniforms = wu;
  R.matWater = new THREE.ShaderMaterial({ uniforms: wu, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  R.chunks = {};
  computeSkyTop();
  for (let cx = 0; cx < W.W / CH; cx++) for (let cz = 0; cz < W.D / CH; cz++) R.rebuild(cx, cz);
  R.dirty = new Set();
  W.onChange((x, y, z) => {
    // sky column may have changed
    let yy = W.H - 1; while (yy > 0 && !W.isOpaque(x, yy, z)) yy--; skyTop[x + z * W.W] = yy;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const nx = Math.floor((x + dx * 15) / CH), nz = Math.floor((z + dz * 15) / CH);
      if (nx >= 0 && nz >= 0 && nx < W.W / CH && nz < W.D / CH) R.dirty.add(nx + ',' + nz);
    }
    R.dirty.add(cx + ',' + cz);
  });
  R.initSky(); R.initRain(); R.initHighlight(); R.initHeat();
  R.npcs = {};
};
R.rebuild = function (cx, cz) {
  const k = cx + ',' + cz;
  const old = R.chunks[k];
  if (old) { for (const m of old) { R.scene.remove(m); m.geometry.dispose(); } }
  const out = buildChunk(cx, cz);
  const ms = [];
  if (out.o.i.length) { const m = new THREE.Mesh(toGeom(out.o), R.matOpaque); R.scene.add(m); ms.push(m); }
  if (out.w.i.length) { const m = new THREE.Mesh(toGeom(out.w), R.matWater); m.renderOrder = 2; R.scene.add(m); ms.push(m); }
  R.chunks[k] = ms;
};
R.flushDirty = function (max) {
  let n = 0;
  for (const k of R.dirty) { const [cx, cz] = k.split(',').map(Number); R.rebuild(cx, cz); R.dirty.delete(k); if (++n >= (max || 3)) break; }
};
R.refreshAll = function () { computeSkyTop(); for (let cx = 0; cx < W.W / CH; cx++) for (let cz = 0; cz < W.D / CH; cz++) R.rebuild(cx, cz); };

// ---------------- sky, sun, moon, stars, clouds ----------------
R.initSky = function () {
  const geo = new THREE.SphereGeometry(400, 24, 12);
  R.skyU = { top: { value: new THREE.Color('#5d8fc4') }, horizon: { value: new THREE.Color('#bcd8e6') } };
  const mat = new THREE.ShaderMaterial({ uniforms: R.skyU, side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.6 + 0.08, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.7)), 1.0); }' });
  R.sky = new THREE.Mesh(geo, mat); R.sky.renderOrder = -10; R.scene.add(R.sky);
  const sq = (c, s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: c, fog: false, depthWrite: false, transparent: true })); m.renderOrder = -9; R.scene.add(m); return m; };
  R.sun = sq('#fff1c2', 34); R.moon = sq('#dfe6f0', 22);
  // stars
  const sg = new THREE.BufferGeometry(); const sp = [];
  for (let i = 0; i < 600; i++) { const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45; sp.push(Math.cos(th) * Math.cos(ph) * 380, Math.sin(ph) * 380 + 20, Math.sin(th) * Math.cos(ph) * 380); }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  R.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  R.scene.add(R.stars);
  // blocky clouds
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const g = cv.getContext('2d');
  const r = rng(424242);
  for (let i = 0; i < 26; i++) { const x = Math.floor(r() * 64), y = Math.floor(r() * 64), w = 3 + Math.floor(r() * 9), h = 2 + Math.floor(r() * 5); g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h); g.fillRect((x + 64) % 64, y, w, h); }
  const ct = new THREE.CanvasTexture(cv); ct.magFilter = THREE.NearestFilter; ct.minFilter = THREE.NearestFilter; ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(3, 3);
  R.clouds = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.8, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  R.clouds.rotation.x = -Math.PI / 2; R.clouds.position.y = 62; R.scene.add(R.clouds);
};

R.lights = function (scene) {
  R.hemi = new THREE.HemisphereLight('#ffffff', '#555544', 0.6); scene.add(R.hemi);
  R.dirLight = new THREE.DirectionalLight('#ffffff', 0.6); scene.add(R.dirLight);
};

const lerpC = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
R.updateSky = function (t, camPos, weather) {
  const h = (t % 1440) / 60;
  // daylight curve
  let d;
  if (h < 5) d = 0; else if (h < 7) d = (h - 5) / 2; else if (h < 18.5) d = 1; else if (h < 20.5) d = 1 - (h - 18.5) / 2; else d = 0;
  d = d * d * (3 - 2 * d);
  const overcast = weather === 'rain' ? 0.45 : weather === 'cloudy' ? 0.75 : 1;
  const day = 0.14 + 0.86 * d * (0.55 + 0.45 * overcast);
  R.uniforms.daylight.value = day;
  const ang = ((h - 6) / 24) * Math.PI * 2;
  const sd = new THREE.Vector3(Math.cos(ang) * 0.9, Math.sin(ang), 0.35).normalize();
  R.uniforms.sunDir.value.copy(sd.y > 0 ? sd : sd.clone().negate());
  const dusk = Math.max(0, 1 - Math.abs(h - 19.2) / 1.4) + Math.max(0, 1 - Math.abs(h - 6.2) / 1.2);
  const top = lerpC('#0b1024', weather === 'clear' ? '#4f86c6' : '#7a8a99', d);
  let horizon = lerpC('#1c2236', weather === 'clear' ? '#bcd8e6' : '#aab4bc', d);
  if (dusk > 0 && weather !== 'rain') horizon = horizon.lerp(new THREE.Color('#e8905a'), Math.min(1, dusk) * 0.65);
  R.skyU.top.value.copy(top); R.skyU.horizon.value.copy(horizon);
  R.uniforms.fogColor.value.copy(horizon); R.waterUniforms.fogColor.value.copy(horizon);
  R.uniforms.skyTint.value.setRGB(1, dusk > 0.3 ? 0.88 : 1, dusk > 0.3 ? 0.78 : (d < 0.3 ? 1.15 : 1));
  const fogFar = weather === 'rain' ? 55 : weather === 'cloudy' ? 80 : 95;
  R.uniforms.fogFar.value = fogFar; R.uniforms.fogNear.value = fogFar * 0.4;
  if (R.scene.fog) { R.scene.fog.color.copy(horizon); R.scene.fog.near = fogFar * 0.4; R.scene.fog.far = fogFar; }
  R.sky.position.copy(camPos);
  const sunPos = new THREE.Vector3(Math.cos(ang) * 300, Math.sin(ang) * 300, 100).add(camPos);
  R.sun.position.copy(sunPos); R.sun.lookAt(camPos); R.sun.visible = Math.sin(ang) > -0.1 && weather !== 'rain';
  R.moon.position.copy(new THREE.Vector3(-Math.cos(ang) * 300, -Math.sin(ang) * 300, -80).add(camPos)); R.moon.lookAt(camPos); R.moon.visible = Math.sin(ang) < 0.1;
  R.stars.position.copy(camPos); R.stars.material.opacity = Math.max(0, 1 - d * 2) * (weather === 'clear' ? 1 : 0.3);
  R.clouds.position.x = camPos.x + ((t * 0.08) % 200) - 100; R.clouds.position.z = camPos.z;
  R.clouds.material.opacity = (weather === 'clear' ? 0.55 : 0.9) * (0.35 + 0.65 * d);
  R.clouds.material.color.copy(lerpC('#3a4256', weather === 'rain' ? '#8f979e' : '#ffffff', d));
  if (R.hemi) { R.hemi.intensity = 0.25 + day * 0.55; R.dirLight.intensity = day * 0.55; R.dirLight.position.copy(R.uniforms.sunDir.value).multiplyScalar(50); }
  R.waterUniforms.wave.value = (t * 0.5) % 1000 + 0.001;
  return d;
};

// ---------------- rain ----------------
R.initRain = function () {
  const n = 1600, g = new THREE.BufferGeometry(), p = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 50, y = Math.random() * 30, z = (Math.random() - 0.5) * 50; p.set([x, y, z, x, y - 0.6, z], i * 6); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  R.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#a8bccc', transparent: true, opacity: 0.55, fog: false }));
  R.rain.visible = false; R.rain.frustumCulled = false; R.scene.add(R.rain);
};
R.updateRain = function (on, cam, dt) {
  R.rain.visible = on; if (!on) return;
  const p = R.rain.geometry.attributes.position;
  for (let i = 0; i < p.count; i += 2) {
    let y = p.getY(i) - dt * 22;
    if (y < -2) y += 32;
    p.setY(i, y); p.setY(i + 1, y - 0.6);
  }
  p.needsUpdate = true;
  R.rain.position.set(cam.x, cam.y - 10, cam.z);
};

// ---------------- block highlight ----------------
R.initHighlight = function () {
  const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
  R.hl = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#1b1b16', transparent: true, opacity: 0.7 }));
  R.hl.visible = false; R.scene.add(R.hl);
};
R.highlight = function (hit) { if (!hit) { R.hl.visible = false; return; } R.hl.visible = true; R.hl.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5); };

// ---------------- heatmap ----------------
R.initHeat = function () {
  const cv = document.createElement('canvas'); cv.width = 24; cv.height = 24; R.heatCv = cv;
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  R.heat = new THREE.Mesh(new THREE.PlaneGeometry(96, 96), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
  R.heat.rotation.x = -Math.PI / 2; R.heat.position.set(48, W.STAND + 0.08, 48); R.heat.visible = false; R.heat.renderOrder = 3; R.scene.add(R.heat);
};
R.drawHeat = function (kind, data) {
  const g = R.heatCv.getContext('2d'); g.clearRect(0, 0, 24, 24);
  let mx = 1; for (const k in data) mx = Math.max(mx, data[k]);
  for (const k in data) {
    const [x, z] = k.split(',').map(Number); const v = data[k] / mx;
    g.fillStyle = kind === 'crime' ? `rgba(200,${Math.round(70 - v * 50)},40,${0.25 + v * 0.7})` : `rgba(${Math.round(240 - v * 60)},${Math.round(190 + v * 30)},70,${0.2 + v * 0.75})`;
    g.fillRect(x, z, 1, 1);
  }
  R.heat.material.map.needsUpdate = true;
};

// ---------------- villagers ----------------
const geoCache = {};
const box = (w, h, d) => { const k = w + ',' + h + ',' + d; return geoCache[k] || (geoCache[k] = new THREE.BoxGeometry(w, h, d)); };
const matCache = {};
const mat = c => matCache[c] || (matCache[c] = new THREE.MeshLambertMaterial({ color: c }));
function faceTexture(a) {
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8; const g = cv.getContext('2d');
  const L = a.look;
  g.fillStyle = L.skin; g.fillRect(0, 0, 8, 8);
  g.fillStyle = L.hair; if (L.hairStyle !== 'bald' && L.hairStyle !== 'cap' && L.hairStyle !== 'tophat' && L.hairStyle !== 'strawhat') g.fillRect(0, 0, 8, 2);
  const eye = a.p.neuroticism > 0.7 ? '#1a1a1a' : '#2a2018';
  g.fillStyle = '#f4f1ea'; g.fillRect(1, 3, 2, 1); g.fillRect(5, 3, 2, 1);
  g.fillStyle = eye; g.fillRect(a.p.curiosity > 0.7 ? 2 : 1, 3, 1, 1); g.fillRect(a.p.curiosity > 0.7 ? 6 : 5, 3, 1, 1);
  // brows show temperament
  g.fillStyle = L.hair === '#e8e2d6' || L.hair === '#d8d0c0' ? '#9a9080' : '#3a2a1a';
  if (a.p.agreeableness < 0.35) { g.fillRect(1, 2, 2, 1); g.fillRect(5, 2, 2, 1); } else { g.fillRect(1, 2, 1, 1); g.fillRect(6, 2, 1, 1); }
  // mouth
  g.fillStyle = '#7a3b30';
  if (a.p.extraversion > 0.7) { g.fillRect(2, 6, 4, 1); g.fillRect(2, 5, 1, 1); g.fillRect(5, 5, 1, 1); }
  else if (a.p.neuroticism > 0.65) { g.fillRect(3, 6, 2, 1); g.fillRect(2, 7, 1, 1); g.fillRect(5, 7, 1, 1); }
  else g.fillRect(3, 6, 2, 1);
  if ((L.acc || []).includes('mustache')) { g.fillStyle = L.hair; g.fillRect(2, 5, 4, 1); }
  if ((L.acc || []).includes('beard') || (L.acc || []).includes('beard_white')) { g.fillStyle = (L.acc || []).includes('beard_white') ? '#e8e2d6' : L.hair; g.fillRect(1, 6, 6, 2); g.fillStyle = '#7a3b30'; g.fillRect(3, 6, 2, 1); }
  if ((L.acc || []).includes('glasses')) { g.fillStyle = '#2a2a2a'; g.fillRect(0, 3, 8, 1); g.fillStyle = '#cfe0e6'; g.fillRect(1, 3, 2, 1); g.fillRect(5, 3, 2, 1); }
  if ((L.acc || []).includes('grime')) { g.fillStyle = 'rgba(40,30,20,0.45)'; g.fillRect(5, 4, 2, 2); g.fillRect(0, 6, 2, 1); }
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}
R.faceCanvas = function (a, scale) {
  const t = faceTexture(a); const cv = document.createElement('canvas'); const s = scale || 6; cv.width = 8 * s; cv.height = 8 * s;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(t.image, 0, 0, 8 * s, 8 * s); return cv;
};

function makeNPC(a) {
  const L = a.look, h = L.h || 1;
  const G = new THREE.Group();
  const body = new THREE.Group(); G.add(body);
  const legH = 0.72 * h, torsoH = 0.68 * h, headS = 0.46;
  const legL = new THREE.Mesh(box(0.2, legH, 0.22), mat(L.pants)); legL.geometry = box(0.2, legH, 0.22);
  const pivL = new THREE.Group(); pivL.position.set(-0.11, legH, 0); legL.position.y = -legH / 2; pivL.add(legL); body.add(pivL);
  const legR = new THREE.Mesh(box(0.2, legH, 0.22), mat(L.pants)); const pivR = new THREE.Group(); pivR.position.set(0.11, legH, 0); legR.position.y = -legH / 2; pivR.add(legR); body.add(pivR);
  const shoeL = new THREE.Mesh(box(0.21, 0.1, 0.25), mat(L.shoes || '#222')); shoeL.position.set(0, -legH + 0.05, 0.015); pivL.add(shoeL);
  const shoeR = shoeL.clone(); pivR.add(shoeR);
  const torso = new THREE.Group(); torso.position.y = legH; body.add(torso);
  const chest = new THREE.Mesh(box(0.46, torsoH, 0.26), mat(L.shirt)); chest.position.y = torsoH / 2; torso.add(chest);
  const armGeo = box(0.16, torsoH * 0.95, 0.18);
  const pivAL = new THREE.Group(); pivAL.position.set(-0.32, torsoH - 0.06, 0); const armL = new THREE.Mesh(armGeo, mat(L.shirt)); armL.position.y = -torsoH * 0.45; pivAL.add(armL); torso.add(pivAL);
  const pivAR = new THREE.Group(); pivAR.position.set(0.32, torsoH - 0.06, 0); const armR = new THREE.Mesh(armGeo, mat(L.shirt)); armR.position.y = -torsoH * 0.45; pivAR.add(armR); torso.add(pivAR);
  const handL = new THREE.Mesh(box(0.15, 0.12, 0.17), mat(L.skin)); handL.position.y = -torsoH * 0.92; pivAL.add(handL); const handR = handL.clone(); pivAR.add(handR);
  const headG = new THREE.Group(); headG.position.y = torsoH; torso.add(headG);
  const face = faceTexture(a);
  const skinM = mat(L.skin);
  const head = new THREE.Mesh(box(headS, headS, headS), [skinM, skinM, mat(L.hair), skinM, new THREE.MeshLambertMaterial({ map: face }), skinM]);
  head.position.y = headS / 2 + 0.02; headG.add(head);
  // hair
  const hairM = mat(L.hair);
  const add = (g, w, hh, d, x, y, z, m) => { const mm = new THREE.Mesh(box(w, hh, d), m || hairM); mm.position.set(x, y, z); g.add(mm); return mm; };
  const hy = headS + 0.02;
  switch (L.hairStyle) {
    case 'bun': add(headG, headS + 0.04, 0.1, headS + 0.04, 0, hy + 0.03, 0); add(headG, 0.18, 0.16, 0.16, 0, hy + 0.1, -0.2); break;
    case 'long': add(headG, headS + 0.04, 0.1, headS + 0.04, 0, hy + 0.03, 0); add(headG, headS + 0.06, 0.5, 0.1, 0, hy - 0.26, -0.24); break;
    case 'ponytail': add(headG, headS + 0.04, 0.1, headS + 0.04, 0, hy + 0.03, 0); add(headG, 0.12, 0.34, 0.12, 0, hy - 0.2, -0.29); break;
    case 'messy': add(headG, headS + 0.08, 0.12, headS + 0.08, 0, hy + 0.04, 0); add(headG, 0.12, 0.1, 0.12, 0.12, hy + 0.12, 0.05); add(headG, 0.1, 0.1, 0.12, -0.14, hy + 0.1, -0.08); break;
    case 'shaggy': add(headG, headS + 0.1, 0.14, headS + 0.1, 0, hy + 0.03, 0); add(headG, headS + 0.1, 0.22, 0.08, 0, hy - 0.12, -0.25); break;
    case 'curly': for (let i = 0; i < 5; i++) add(headG, 0.18, 0.16, 0.18, Math.cos(i * 1.3) * 0.16, hy + 0.06, Math.sin(i * 1.3) * 0.16); break;
    case 'swept': add(headG, headS + 0.04, 0.12, headS + 0.04, 0, hy + 0.04, 0); add(headG, 0.24, 0.08, 0.16, 0.08, hy + 0.12, 0.12); break;
    case 'side': add(headG, headS + 0.04, 0.08, headS + 0.04, 0, hy + 0.02, 0); add(headG, 0.06, 0.2, headS, -0.25, hy - 0.08, 0); add(headG, 0.06, 0.2, headS, 0.25, hy - 0.08, 0); break;
    case 'short': add(headG, headS + 0.03, 0.08, headS + 0.03, 0, hy + 0.02, 0); break;
    case 'cap': add(headG, headS + 0.05, 0.12, headS + 0.05, 0, hy + 0.04, 0, mat('#1f2f26')); add(headG, headS * 0.7, 0.04, 0.16, 0, hy, 0.3, mat('#1f2f26')); add(headG, 0.08, 0.08, 0.02, 0, hy + 0.05, 0.25, mat('#d8b040')); break;
    case 'tophat': add(headG, 0.62, 0.04, 0.62, 0, hy + 0.02, 0, mat('#1a1a1a')); add(headG, 0.38, 0.36, 0.38, 0, hy + 0.22, 0, mat('#1a1a1a')); add(headG, 0.39, 0.06, 0.39, 0, hy + 0.08, 0, mat('#7a2a3a')); break;
    case 'strawhat': add(headG, 0.74, 0.04, 0.74, 0, hy + 0.02, 0, mat('#d8b45a')); add(headG, 0.4, 0.16, 0.4, 0, hy + 0.1, 0, mat('#d8b45a')); break;
    default: break;
  }
  const acc = L.acc || [];
  if (acc.includes('apron') || acc.includes('apron_dark')) add(torso, 0.42, torsoH * 0.8, 0.03, 0, torsoH * 0.38, 0.14, mat(acc.includes('apron_dark') ? '#3a2a20' : '#efe8d8'));
  if (acc.includes('sash')) add(torso, 0.47, 0.08, 0.27, 0, torsoH * 0.45, 0, mat('#c9a24a'));
  if (acc.includes('collar')) add(torso, 0.3, 0.06, 0.28, 0, torsoH - 0.02, 0, mat('#f2efe6'));
  if (acc.includes('badge')) add(torso, 0.08, 0.08, 0.02, -0.12, torsoH * 0.72, 0.14, mat('#d8b040'));
  if (acc.includes('notebook')) add(pivAR, 0.12, 0.16, 0.05, 0, -torsoH * 0.95, 0.12, mat('#e8dcc0'));
  if (acc.includes('camera')) add(torso, 0.16, 0.12, 0.1, 0.08, torsoH * 0.55, 0.18, mat('#2a2a2a'));
  if (acc.includes('satchel')) add(torso, 0.1, 0.22, 0.2, -0.28, torsoH * 0.3, 0, mat('#6b4a2c'));
  if (acc.includes('necklace')) add(torso, 0.24, 0.04, 0.02, 0, torsoH * 0.85, 0.14, mat('#d8b040'));
  if (acc.includes('shawl')) add(torso, 0.5, 0.18, 0.3, 0, torsoH - 0.1, 0, mat('#5a3a5a'));
  if (acc.includes('chain')) add(torso, 0.3, 0.05, 0.02, 0, torsoH * 0.7, 0.14, mat('#e0c050'));
  if (acc.includes('toolbelt')) add(torso, 0.48, 0.08, 0.28, 0, 0.04, 0, mat('#4a3420'));
  if (acc.includes('bandana')) add(headG, headS + 0.05, 0.08, headS + 0.05, 0, hy - 0.04, 0, mat('#2f5a8a'));
  if (acc.includes('helmet_lamp')) { add(headG, headS + 0.06, 0.12, headS + 0.06, 0, hy + 0.04, 0, mat('#8a7a3a')); add(headG, 0.1, 0.08, 0.04, 0, hy + 0.05, 0.25, new THREE.MeshBasicMaterial({ color: '#fff0b0' })); }
  const posture = L.posture;
  const parts = { G, body, torso, headG, pivL, pivR, pivAL, pivAR, posture, legH };
  if (posture === 'slouch') { torso.rotation.x = 0.14; headG.rotation.x = 0.18; headG.position.z = 0.04; }
  if (posture === 'hunched') { torso.rotation.x = 0.1; headG.rotation.x = 0.12; }
  if (posture === 'broad') { torso.scale.set(1.14, 1, 1.1); }
  if (posture === 'eager') { torso.rotation.x = -0.04; }
  G.userData.agentId = a.id;
  G.traverse(o => { o.userData.agentId = a.id; });
  return parts;
}
R.syncNPCs = function (agents, t, dt, coarse) {
  for (const a of agents) {
    let n = R.npcs[a.id];
    if (!n) { n = R.npcs[a.id] = makeNPC(a); R.scene.add(n.G); n.vy = a.y; n.phase = Math.random() * 6; n.rx = a.x; n.rz = a.z; n.dir = a.dir; }
    if (a.left) { n.G.visible = false; continue; }
    n.G.visible = true;
    // smooth position (sim positions are authoritative)
    const k = Math.min(1, dt * 12);
    const jump = Math.hypot(a.x - n.rx, a.z - n.rz) > 4;
    n.rx = jump ? a.x : n.rx + (a.x - n.rx) * k; n.rz = jump ? a.z : n.rz + (a.z - n.rz) * k;
    const ty = W.standAt(n.rx, n.rz);
    n.vy = jump ? ty : n.vy + (ty - n.vy) * Math.min(1, dt * 10);
    let dd = a.dir - n.dir; while (dd > Math.PI) dd -= Math.PI * 2; while (dd < -Math.PI) dd += Math.PI * 2;
    n.dir += dd * Math.min(1, dt * 8);
    n.G.position.set(n.rx, n.vy, n.rz);
    n.G.rotation.set(0, n.dir, 0);
    const moving = a.moving && !coarse;
    const rigid = n.posture === 'rigid' || n.posture === 'upright';
    if (moving) n.phase += dt * (a.plan && a.plan.type === 'steal' ? 13 : 9);
    const sw = moving ? Math.sin(n.phase) * 0.6 : 0;
    n.pivL.rotation.x = sw; n.pivR.rotation.x = -sw;
    n.pivAL.rotation.x = -sw * (rigid ? 0.35 : 0.8); n.pivAR.rotation.x = sw * (rigid ? 0.35 : 0.8);
    // working gesture
    if (!moving && a.plan && a.plan.type === 'work' && a.plan.arrived && ['farmer', 'miner', 'blacksmith', 'builder', 'baker'].includes(a.job)) n.pivAR.rotation.x = -1.1 + Math.sin(t * 0.25 + n.phase) * 0.7;
    if (!moving && a.plan && a.plan.type === 'protest') { n.pivAR.rotation.x = -2.6 + Math.sin(t * 0.3) * 0.2; }
    // talking nod
    n.headG.rotation.y = a.convo ? Math.sin(t * 0.5 + n.phase) * 0.12 : 0;
    const bob = moving ? Math.abs(Math.cos(n.phase)) * 0.04 : 0;
    n.body.position.y = bob;
    if (a.sleeping) { n.body.rotation.x = -Math.PI / 2; n.body.position.y = 0.55; n.body.position.z = 0.6; }
    else { n.body.rotation.x = 0; n.body.position.z = 0; }
  }
};
R.npcMeshes = function () { const out = []; for (const id in R.npcs) if (R.npcs[id].G.visible) out.push(R.npcs[id].G); return out; };
})(typeof window !== 'undefined' ? window : globalThis);
