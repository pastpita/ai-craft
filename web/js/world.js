/* AI CRAFT \u2014 world.js
   Voxel world of five settlements: block registry, deterministic generation (terrain, river, mountain,
   roads, villages with identities, resource nodes, building lots), walk grid, A*, line of sight,
   raycast and torch light. Pure data, no rendering. Runs in the browser and in Node. */
(function (root) {
'use strict';

const W = 208, H = 44, D = 208;
const GROUND = 9;
const STAND = GROUND + 1;

// ---------- block registry (tex: [top, side, bottom] atlas tiles, painted in render.js) ----------
const BLOCKS = [
  { name: 'air', solid: false, opaque: false },
  { name: 'grass', tex: [0, 1, 2] },
  { name: 'dirt', tex: [2, 2, 2] },
  { name: 'stone', tex: [3, 3, 3] },
  { name: 'log', tex: [5, 4, 5] },
  { name: 'planks', tex: [6, 6, 6] },
  { name: 'glass', tex: [7, 7, 7], opaque: false, cutout: true },
  { name: 'brick', tex: [8, 8, 8] },
  { name: 'roof tile', tex: [9, 9, 9] },
  { name: 'sand', tex: [10, 10, 10] },
  { name: 'water', tex: [11, 11, 11], solid: false, opaque: false, liquid: true },
  { name: 'farmland', tex: [12, 2, 2] },
  { name: 'crop', tex: [13, 13, 13], solid: false, opaque: false, shape: 'cross' },
  { name: 'ore', tex: [14, 14, 14] },            // iron ore
  { name: 'fence', tex: [15, 15, 15], opaque: false, shape: 'post' },
  { name: 'torch', tex: [16, 16, 16], solid: false, opaque: false, shape: 'torch', light: 14 },
  { name: 'door', tex: [17, 17, 17], solid: false, opaque: false, shape: 'door' },
  { name: 'path', tex: [18, 2, 2] },
  { name: 'leaves', tex: [19, 19, 19], opaque: false, cutout: true },
  { name: 'cobble', tex: [20, 20, 20] },
  { name: 'plaster', tex: [21, 21, 21] },
  { name: 'slate', tex: [22, 22, 22] },
  { name: 'cloth', tex: [23, 23, 23] },
  { name: 'shelf', tex: [6, 24, 6] },
  { name: 'oven', tex: [8, 25, 8], light: 9 },
  { name: 'coal ore', tex: [26, 26, 26] },
  { name: 'gold ore', tex: [27, 27, 27], light: 3 },
  { name: 'clay', tex: [28, 28, 28] },
  { name: 'wool', tex: [29, 29, 29] },
  { name: 'stone brick', tex: [30, 30, 30] },
  { name: 'thatch', tex: [31, 31, 31] },
  { name: 'sprout', tex: [32, 32, 32], solid: false, opaque: false, shape: 'cross' },
];
BLOCKS.forEach((b, i) => {
  b.id = i;
  if (b.solid === undefined) b.solid = true;
  if (b.opaque === undefined) b.opaque = true;
  if (!b.shape) b.shape = b.liquid ? 'liquid' : 'cube';
});
const B = {};
BLOCKS.forEach(b => { B[b.name.replace(/ /g, '_').toUpperCase()] = b.id; });

const data = new Uint8Array(W * H * D);
let base = null;                            // generated world, for compacting edits
const light = new Uint8Array(W * H * D);
const standY = new Int16Array(W * D);
const pathCost = new Float32Array(W * D);
const idx = (x, y, z) => (y * D + z) * W + x;
const inb = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D;
function get(x, y, z) { x |= 0; y |= 0; z |= 0; return inb(x, y, z) ? data[idx(x, y, z)] : (y < 0 ? B.STONE : 0); }
function isSolid(x, y, z) { return BLOCKS[get(Math.floor(x), Math.floor(y), Math.floor(z))].solid; }
function isOpaque(x, y, z) { return BLOCKS[get(x, y, z)].opaque; }

const listeners = [];
const edits = {};
let generating = false;
function set(x, y, z, b, opts) {
  if (!inb(x, y, z)) return false;
  const i = idx(x, y, z);
  if (data[i] === b) return false;
  const old = data[i];
  data[i] = b;
  if (!generating) {
    if (base && base[i] === b) delete edits[i]; else edits[i] = b;
    computeStandColumn(x, z);
    for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) if (dx || dz) computeStandColumn(x + dx, z + dz);
    if (BLOCKS[old].opaque !== BLOCKS[b].opaque || BLOCKS[old].light || BLOCKS[b].light) relightAround(x, y, z);
    for (const fn of listeners) fn(x, y, z, b, opts);
  }
  return true;
}
function onChange(fn) { listeners.push(fn); }

// ---------- rng + noise ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeNoise(rng) {
  const G = 32, g = [];
  for (let i = 0; i < G * G; i++) g.push(rng());
  const s = t => t * t * (3 - 2 * t);
  return function (x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = s(x - xi), zf = s(z - zi);
    const v = (a, b) => g[((a % G + G) % G) + ((b % G + G) % G) * G];
    const a = v(xi, zi), b = v(xi + 1, zi), c = v(xi, zi + 1), d = v(xi + 1, zi + 1);
    return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf;
  };
}

// ---------- village identities ----------
const VILLAGES = [
  { id: 'highvale', name: 'Highvale', cx: 100, cz: 46, r: 32, plaza: 17, theme: 'Politics \u00B7 education \u00B7 learning',
    walls: [B.PLASTER, B.BRICK, B.PLASTER, B.STONE_BRICK], roofs: [B.SLATE, B.SLATE, B.ROOF_TILE], plazaBlock: B.COBBLE, houses: 13, extra: ['academy'], color: '#8bb3d1' },
  { id: 'ironridge', name: 'Ironridge', cx: 172, cz: 68, r: 27, plaza: 13, theme: 'Mining \u00B7 industry \u00B7 wealth',
    walls: [B.COBBLE, B.STONE_BRICK, B.BRICK], roofs: [B.SLATE], plazaBlock: B.STONE_BRICK, houses: 12, extra: [], color: '#c9a24a' },
  { id: 'rivergate', name: 'Rivergate', cx: 172, cz: 160, r: 27, plaza: 15, theme: 'Trade \u00B7 merchants \u00B7 information',
    walls: [B.BRICK, B.PLASTER, B.BRICK], roofs: [B.ROOF_TILE], plazaBlock: B.COBBLE, houses: 12, extra: ['stalls'], color: '#e07a5a' },
  { id: 'greenhollow', name: 'Greenhollow', cx: 48, cz: 156, r: 29, plaza: 13, theme: 'Agriculture \u00B7 tradition \u00B7 cooperation',
    walls: [B.PLANKS, B.PLASTER], roofs: [B.THATCH, B.THATCH, B.ROOF_TILE], plazaBlock: B.PATH, houses: 12, extra: [], color: '#7d9b52' },
  { id: 'ashfield', name: 'Ashfield', cx: 36, cz: 64, r: 26, plaza: 11, theme: 'Poor \u00B7 chaotic \u00B7 lawless',
    walls: [B.PLANKS, B.COBBLE, B.PLANKS], roofs: [B.PLANKS, B.SLATE], plazaBlock: B.PATH, houses: 12, extra: [], color: '#a0603a' },
];
const VBY = {}; VILLAGES.forEach(v => { VBY[v.id] = v; });
const CROSS = [106, 104];
const riverX = z => Math.round(137 + 4 * Math.sin(z * 0.045) + 2 * Math.sin(z * 0.13));
const MOUNTAIN = { x: 184, z: 20, r: 40, h: 18 };

// ---------- generation state ----------
const places = {};
const buildings = [];
const occupied = new Uint8Array(W * D);
const torches = [];
const lots = {};
const nodes = [];
const roadCells = [];
let heights = new Int16Array(W * D);

function reserve(x0, z0, w, d, m) {
  for (let x = x0 - m; x < x0 + w + m; x++) for (let z = z0 - m; z < z0 + d + m; z++)
    if (x >= 0 && z >= 0 && x < W && z < D) occupied[x + z * W] = 1;
}
function isFree(x0, z0, w, d, m) {
  for (let x = x0 - m; x < x0 + w + m; x++) for (let z = z0 - m; z < z0 + d + m; z++) {
    if (x < 1 || z < 1 || x >= W - 1 || z >= D - 1) return false;
    if (occupied[x + z * W]) return false;
  }
  return true;
}
function topSolid(x, z) { for (let y = H - 1; y >= 0; y--) { const b = get(x, y, z); if (b && BLOCKS[b].solid) return y; } return -1; }
function fillColumn(x, z, h, topBlock) {
  for (let y = 0; y < H; y++) {
    let b = 0;
    if (y < h - 2) b = B.STONE; else if (y < h) b = B.DIRT; else if (y === h) b = topBlock || B.GRASS;
    data[idx(x, y, z)] = b;
  }
  heights[x + z * W] = h;
}
function flatten(x0, z0, w, d, top, topBlock) {
  for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) {
    if (x < 0 || z < 0 || x >= W || z >= D) continue;
    for (let y = 1; y < H; y++) {
      if (y < top - 2) data[idx(x, y, z)] = B.STONE;
      else if (y < top) data[idx(x, y, z)] = B.DIRT;
      else if (y === top) data[idx(x, y, z)] = topBlock || B.GRASS;
      else data[idx(x, y, z)] = 0;
    }
    heights[x + z * W] = top;
  }
}

// ---------- buildings ----------
function building(spec) {
  const { x, z, w, d } = spec;
  const wallH = spec.wallH || 4;
  flatten(x - 1, z - 1, w + 2, d + 2, GROUND, spec.ground);
  const top = STAND + wallH;
  for (let i = x; i < x + w; i++) for (let k = z; k < z + d; k++) data[idx(i, GROUND, k)] = spec.floor || B.PLANKS;
  let dx, dz;
  if (spec.door === 'S') { dx = x + (w >> 1); dz = z + d - 1; }
  if (spec.door === 'N') { dx = x + (w >> 1); dz = z; }
  if (spec.door === 'E') { dx = x + w - 1; dz = z + (d >> 1); }
  if (spec.door === 'W') { dx = x; dz = z + (d >> 1); }
  for (let i = x; i < x + w; i++) for (let k = z; k < z + d; k++) {
    const edge = i === x || i === x + w - 1 || k === z || k === z + d - 1;
    if (!edge) continue;
    const corner = (i === x || i === x + w - 1) && (k === z || k === z + d - 1);
    for (let y = STAND; y < top; y++) {
      let b = corner ? (spec.corner || B.LOG) : spec.wall;
      const along = (k === z || k === z + d - 1) ? i - x : k - z;
      const len = (k === z || k === z + d - 1) ? w : d;
      if (!corner && y === STAND + 1 && along % 3 === 1 && along > 0 && along < len - 1) b = B.GLASS;
      if (!corner && (y === STAND + 1 || y === STAND + 2) && wallH >= 5 && along % 3 === 1) b = B.GLASS;
      if (y === top - 1 && !corner && wallH >= 4) b = spec.trim || b;
      data[idx(i, y, k)] = b;
    }
  }
  data[idx(dx, STAND, dz)] = B.DOOR; data[idx(dx, STAND + 1, dz)] = B.DOOR;
  const alongX = w >= d;
  const L = alongX ? w : d, Sh = alongX ? d : w;
  for (let lvl = 0; ; lvl++) {
    const a = lvl - 1, b = Sh - lvl;
    if (a > b) break;
    const y = top + lvl;
    for (let t = -1; t <= L; t++) {
      for (const s of (a === b ? [a] : [a, b])) {
        const px = alongX ? x + t : x + s, pz = alongX ? z + s : z + t;
        if (inb(px, y, pz)) data[idx(px, y, pz)] = spec.roof;
      }
      if (t === 0 || t === L - 1) for (let s = a + 1; s < b; s++) {
        const px = alongX ? x + t : x + s, pz = alongX ? z + s : z + t;
        if (inb(px, y, pz)) data[idx(px, y, pz)] = spec.wall === B.GLASS ? B.PLANKS : spec.wall;
      }
    }
    if (a === b || a + 1 === b) break;
  }
  const out = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[spec.door];
  const entry = [dx + out[0], dz + out[1]];
  data[idx(entry[0], GROUND, entry[1])] = B.PATH;
  const rec = Object.assign({}, spec, { doorCell: [dx, dz], entry, spots: [], top });
  buildings.push(rec);
  reserve(x, z, w, d, 1);
  return rec;
}
function furnish(rec) {
  const { x, z, w, d, kind } = rec;
  const ix0 = x + 1, iz0 = z + 1, ix1 = x + w - 2, iz1 = z + d - 2;
  const put = (i, k, b, y) => { data[idx(i, y || STAND, k)] = b; };
  const nearDoor = (i, k) => Math.abs(i - rec.doorCell[0]) + Math.abs(k - rec.doorCell[1]) <= 2;
  const corner = [[ix0, iz0], [ix1, iz0], [ix0, iz1], [ix1, iz1]].filter(c => !nearDoor(c[0], c[1]));
  if (kind === 'house') {
    const c = corner[0]; put(c[0], c[1], B.CLOTH);
    const c2 = corner[corner.length - 1]; put(c2[0], c2[1], B.PLANKS); put(c2[0], c2[1], B.TORCH, STAND + 1);
  } else if (kind === 'bakery') {
    put(ix0, iz0, B.OVEN); put(ix0, iz0, B.OVEN, STAND + 1); put(ix0 + 1, iz0, B.OVEN);
    for (let k = iz0 + 2; k <= iz1 - 1; k++) if (!nearDoor(ix1 - 1, k)) put(ix1 - 1, k, B.PLANKS);
    put(ix1, iz0, B.SHELF); put(ix1, iz0, B.SHELF, STAND + 1);
  } else if (kind === 'store' || kind === 'post') {
    for (let i = ix0; i <= ix1; i++) if (!nearDoor(i, iz0)) { put(i, iz0, B.SHELF); put(i, iz0, B.SHELF, STAND + 1); }
    for (let i = ix0 + 1; i < ix1; i++) if (!nearDoor(i, iz0 + 2)) put(i, iz0 + 2, B.PLANKS);
    put(ix1, iz1, B.TORCH);
    if (kind === 'post') put(ix0 + 1, iz0 + 2, B.CLOTH, STAND + 1);
  } else if (kind === 'forge') {
    put(ix0, iz0, B.OVEN); put(ix0, iz0, B.OVEN, STAND + 1); put(ix0 + 1, iz0, B.OVEN);
    put(ix0 + 2, iz0 + 2, B.STONE); put(ix1, iz0, B.SHELF);
  } else if (kind === 'tavern') {
    for (let k = iz0; k <= iz1; k++) if (!nearDoor(ix1, k) && !nearDoor(ix1 - 1, k)) put(ix1 - 1, k, B.PLANKS);
    put(ix1, iz0, B.SHELF); put(ix1, iz0, B.SHELF, STAND + 1);
    put(ix0 + 1, iz0 + 1, B.PLANKS); put(ix0 + 3, iz0 + 1, B.PLANKS);
    put(ix0, iz0, B.TORCH); put(ix0, iz1, B.TORCH);
  } else if (kind === 'clinic') {
    put(ix0, iz0, B.CLOTH); put(ix0, iz0 + 2, B.CLOTH); put(ix1, iz0, B.SHELF); put(ix1, iz1, B.TORCH);
  } else if (kind === 'townhall') {
    for (let i = ix0 + 2; i <= ix1 - 2; i++) if (!nearDoor(i, iz0 + 2)) put(i, iz0 + 2, B.PLANKS);
    put(ix0, iz0, B.TORCH); put(ix1, iz0, B.TORCH);
  } else if (kind === 'guard') {
    for (let i = ix0; i <= ix0 + 3; i++) { put(i, iz0 + 3, B.FENCE); put(i, iz0 + 3, B.FENCE, STAND + 1); }
    for (let k = iz0; k <= iz0 + 3; k++) { put(ix0 + 3, k, B.FENCE); put(ix0 + 3, k, B.FENCE, STAND + 1); }
    put(ix0 + 3, iz0 + 1, B.DOOR); put(ix0 + 3, iz0 + 1, B.DOOR, STAND + 1);
    put(ix1, iz1, B.TORCH); put(ix1, iz0, B.SHELF);
    rec.jail = [ix0 + 1, iz0 + 1];
  } else if (kind === 'storehouse') {
    for (let i = ix0; i <= ix1; i++) for (const k of [iz0, iz1]) if (!nearDoor(i, k) && (i + k) % 2) { put(i, k, B.PLANKS); if (i % 3 === 0) put(i, k, B.SHELF, STAND + 1); }
    put(ix1, iz0 + 1, B.TORCH);
  } else if (kind === 'academy') {
    for (let k = iz0 + 2; k <= iz1; k += 2) for (let i = ix0 + 1; i <= ix1 - 1; i++) if (!nearDoor(i, k) && i % 3 !== 0) put(i, k, B.PLANKS);
    for (let i = ix0 + 2; i <= ix1 - 2; i++) put(i, iz0, B.SHELF, STAND + 1);
    put(ix0, iz0, B.TORCH); put(ix1, iz0, B.TORCH);
  }
}

// ---------- terrain features ----------
function tree(x, z, rng, dead) {
  const h = topSolid(x, z); const g = get(x, h, z);
  if (g !== B.GRASS && g !== B.DIRT) return null;
  const th = dead ? 3 + Math.floor(rng() * 2) : 4 + Math.floor(rng() * 3);
  const logs = [], leaves = [];
  for (let y = h + 1; y <= h + th; y++) { data[idx(x, y, z)] = B.LOG; logs.push([x, y, z, B.LOG]); }
  if (dead) { if (rng() < 0.6) { const y = h + th - 1, dx = rng() < .5 ? 1 : -1; if (inb(x + dx, y, z) && !data[idx(x + dx, y, z)]) { data[idx(x + dx, y, z)] = B.LOG; logs.push([x + dx, y, z, B.LOG]); } } }
  else for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 1; dy++) {
    const r = Math.abs(dx) + Math.abs(dz) + Math.abs(dy + 0.5);
    if (r > 3.6 || (dy === 1 && Math.abs(dx) + Math.abs(dz) > 1)) continue;
    const px = x + dx, py = h + th + dy, pz = z + dz;
    if (inb(px, py, pz) && data[idx(px, py, pz)] === 0 && rng() > 0.08) { data[idx(px, py, pz)] = B.LEAVES; leaves.push([px, py, pz, B.LEAVES]); }
  }
  // chopping removes leaves first, then the trunk from the top down
  return logs.concat(leaves).reverse();
}
function drawRoad(x0, z0, x1, z1, block) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n), z = Math.round(z0 + (z1 - z0) * i / n);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) roadCell(x + a, z + b, block);
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) { const px = x + a, pz = z + b; if (px < 0 || pz < 0 || px >= W || pz >= D) continue; if (heights[px + pz * W] > GROUND + 1 && !occupied[px + pz * W] && Math.abs(a) + Math.abs(b) < 6) flatten(px, pz, 1, 1, Math.min(heights[px + pz * W], GROUND + Math.max(Math.abs(a), Math.abs(b)) - 1)); }
  }
}
function roadCell(x, z, block) {
  if (x < 0 || z < 0 || x >= W || z >= D) return;
  const rx = riverX(z);
  if (x >= rx - 2 && x <= rx + 1) { data[idx(x, GROUND, z)] = B.PLANKS; for (let y = STAND; y < STAND + 4; y++) data[idx(x, y, z)] = 0; occupied[x + z * W] = 2; roadCells.push([x, z]); return; }
  flatten(x, z, 1, 1, GROUND, block || B.PATH);
  occupied[x + z * W] = 2; roadCells.push([x, z]);
}
function addPlace(p) { places[p.id] = p; return p; }
function addNode(n) { n.id = 'n' + nodes.length; nodes.push(n); return n; }
// nodes created during play (new fields); the id is chosen by the caller and survives reloads
function registerNode(n) { const k = nodes.findIndex(x => x.id === n.id); if (k >= 0) nodes[k] = n; else nodes.push(n); return n; }

// lot search around a village centre: nearest free spot, optionally facing the centre
function placeAround(v, w, d, opts) {
  const o = opts || {};
  let best = null, bs = 1e9;
  const R = o.r || v.r;
  const rng = o.rng;
  for (let x = v.cx - R; x <= v.cx + R - w; x++) for (let z = v.cz - R; z <= v.cz + R - d; z++) {
    const mx = x + w / 2, mz = z + d / 2;
    const dist = Math.hypot(mx - v.cx, mz - v.cz);
    if (Math.hypot(x - v.cx, z - v.cz) > R || Math.hypot(x + w - v.cx, z + d - v.cz) > R || Math.hypot(x + w - v.cx, z - v.cz) > R || Math.hypot(x - v.cx, z + d - v.cz) > R) continue;
    if (o.minDist && dist < o.minDist) continue;
    if (!isFree(x, z, w, d, o.margin === undefined ? 1 : o.margin)) continue;
    if (heights[x + z * W] > GROUND + 4 || heights[x + w - 1 + (z + d - 1) * W] > GROUND + 4) continue;
    const s = dist + (rng ? rng() * (o.jitter || 0) : 0);
    if (s < bs) { bs = s; best = { x, z, w, d }; }
  }
  if (best) {
    const dx = v.cx - (best.x + w / 2), dz = v.cz - (best.z + d / 2);
    best.door = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : (dz > 0 ? 'S' : 'N');
  }
  return best;
}
function pathTo(from, tx, tz, block) {
  let [x, z] = from;
  const inB = (px, pz) => buildings.some(b => px >= b.x && px < b.x + b.w && pz >= b.z && pz < b.z + b.d);
  for (let g = 0; g < 60; g++) {
    const cur = get(x, GROUND, z);
    if (g > 0 && (cur === B.PATH || cur === B.COBBLE || cur === B.STONE_BRICK)) break;
    if (cur === B.GRASS || cur === B.DIRT || cur === B.SAND) data[idx(x, GROUND, z)] = block || B.PATH;
    for (let y = STAND; y < STAND + 3; y++) { const bb = get(x, y, z); if (bb === B.LOG || bb === B.LEAVES) data[idx(x, y, z)] = 0; }
    const dx = tx - x, dz = tz - z;
    if (Math.abs(dx) < 1 && Math.abs(dz) < 1) break;
    let nx = x, nz = z;
    if (Math.abs(dx) > Math.abs(dz)) nx += Math.sign(dx); else nz += Math.sign(dz);
    if (inB(nx, nz)) { nx = x; nz = z; if (Math.abs(dx) > Math.abs(dz)) nz += Math.sign(dz) || 1; else nx += Math.sign(dx) || 1; }
    if (inB(nx, nz)) break;
    x = nx; z = nz;
  }
}
function lamp(x, z) {
  const h = topSolid(x, z); if (h < 0 || h > GROUND + 1) return;
  data[idx(x, h + 1, z)] = B.FENCE; data[idx(x, h + 2, z)] = B.FENCE; data[idx(x, h + 3, z)] = B.TORCH;
}

const CORE = [
  ['townhall', 'Town Hall', 13, 9, 5], ['storehouse', 'Storehouse', 9, 8, 4], ['tavern', 'Tavern', 11, 9, 4],
  ['bakery', 'Bakery', 8, 7, 4], ['store', 'General Store', 9, 7, 4], ['guard', 'Guard Post', 9, 8, 4],
  ['clinic', 'Clinic', 9, 7, 4], ['forge', 'Forge', 9, 7, 4], ['post', 'Press Office', 8, 7, 4],
];
const TAVERN_NAMES = { highvale: 'The Crooked Lantern', ironridge: 'The Anvil & Ale', rivergate: 'The Drowned Coin', greenhollow: 'The Hayloft', ashfield: 'The Rusty Nail' };
const PAPER_HOUSE = { highvale: 'Village Post Office', ironridge: 'Ledger Office', rivergate: 'Courier House', greenhollow: 'Almanac Office', ashfield: 'Rag Shack' };

function generateVillage(v, rng) {
  const ground = v.id === 'ashfield' ? B.DIRT : B.GRASS;
  // flat disc
  for (let x = v.cx - v.r - 2; x <= v.cx + v.r + 2; x++) for (let z = v.cz - v.r - 2; z <= v.cz + v.r + 2; z++) {
    if (x < 0 || z < 0 || x >= W || z >= D) continue;
    if (Math.hypot(x - v.cx, z - v.cz) > v.r + 2 || occupied[x + z * W] === 3) continue;
    const top = v.id === 'ashfield' && rng() < 0.35 ? (rng() < 0.5 ? B.SAND : B.GRASS) : ground;
    flatten(x, z, 1, 1, GROUND, top);
  }
  // plaza + well
  const P = v.plaza, px0 = v.cx - (P >> 1), pz0 = v.cz - (P >> 1);
  for (let x = px0; x < px0 + P; x++) for (let z = pz0; z < pz0 + P; z++) { flatten(x, z, 1, 1, GROUND, v.plazaBlock); }
  reserve(px0, pz0, P, P, 1);
  for (let x = v.cx - 1; x <= v.cx + 1; x++) for (let z = v.cz - 1; z <= v.cz + 1; z++) {
    if (x === v.cx && z === v.cz) { data[idx(x, GROUND, z)] = B.WATER; data[idx(x, GROUND - 1, z)] = B.WATER; }
    else data[idx(x, STAND, z)] = v.id === 'ashfield' ? B.COBBLE : B.STONE_BRICK;
  }
  if (v.id !== 'ashfield') for (let x = v.cx - 1; x <= v.cx + 1; x++) for (let z = v.cz - 1; z <= v.cz + 1; z++) data[idx(x, STAND + 3, z)] = B.SLATE;
  if (v.id !== 'ashfield') for (const [x, z] of [[v.cx - 1, v.cz - 1], [v.cx + 1, v.cz + 1]]) { data[idx(x, STAND + 1, z)] = B.FENCE; data[idx(x, STAND + 2, z)] = B.FENCE; }
  const plazaSpots = [];
  for (let x = px0 + 1; x < px0 + P - 1; x += 2) for (let z = pz0 + 1; z < pz0 + P - 1; z += 2) if (Math.abs(x - v.cx) > 2 || Math.abs(z - v.cz) > 2) plazaSpots.push([x, z]);
  addPlace({ id: v.id + '_plaza', vid: v.id, kind: 'plaza', name: v.name + ' Square', spots: plazaSpots, entry: [v.cx, pz0], center: [v.cx, v.cz] });
  for (const [x, z] of [[px0, pz0], [px0 + P - 1, pz0], [px0, pz0 + P - 1], [px0 + P - 1, pz0 + P - 1]]) lamp(x, z);
  // market stalls inside the plaza
  const stallSpots = [];
  const stalls = v.extra.includes('stalls') ? 3 : 1;
  for (let s = 0; s < stalls; s++) {
    const sx = px0 + 2 + s * 4, sz = pz0 + 2;
    if (sx + 3 >= px0 + P - 1) break;
    for (let i = 0; i < 3; i++) data[idx(sx + i, STAND, sz)] = B.PLANKS;
    for (const i of [0, 2]) { data[idx(sx + i, STAND + 1, sz + 1)] = B.FENCE; data[idx(sx + i, STAND + 2, sz + 1)] = B.FENCE; }
    for (let i = -1; i <= 3; i++) for (let k = 0; k <= 2; k++) data[idx(sx + i, STAND + 3, sz + k)] = B.CLOTH;
    stallSpots.push([sx + 1, sz + 1]);
  }
  addPlace({ id: v.id + '_market', vid: v.id, kind: 'market', name: v.name + ' Market', spots: stallSpots, entry: [px0 + 3, pz0 + 4], center: [px0 + 3, pz0 + 3] });
  // core buildings
  const list = CORE.slice();
  if (v.extra.includes('academy')) list.splice(1, 0, ['academy', 'Academy', 13, 9, 5]);
  for (const [kind, nm, w0, d0, wallH] of list) {
    let w = w0, d = d0;
    if (v.id === 'highvale' && kind === 'townhall') { w = 15; d = 10; }
    if (v.id === 'ashfield') { w = Math.max(7, w - 2); d = Math.max(6, d - 1); }
    let lot = placeAround(v, w, d, { margin: 2 });
    if (!lot) lot = placeAround(v, w, d, { margin: 1, r: v.r + 5 });
    if (!lot) lot = placeAround(v, d, w, { margin: 1, r: v.r + 7 });
    if (!lot) continue;
    const wall = kind === 'townhall' ? (v.id === 'ashfield' ? B.PLANKS : v.id === 'greenhollow' ? B.PLASTER : B.STONE_BRICK) : kind === 'forge' || kind === 'guard' ? B.COBBLE : v.walls[Math.floor(rng() * v.walls.length)];
    const rec = building({ id: v.id + '_' + kind, vid: v.id, kind, name: kind === 'tavern' ? TAVERN_NAMES[v.id] : kind === 'post' ? PAPER_HOUSE[v.id] : nm, x: lot.x, z: lot.z, w: lot.w, d: lot.d, wallH: v.id === 'ashfield' ? 4 : wallH, wall, roof: v.roofs[Math.floor(rng() * v.roofs.length)], door: lot.door, floor: kind === 'forge' || kind === 'guard' ? B.COBBLE : B.PLANKS, trim: kind === 'townhall' && v.id !== 'ashfield' ? B.PLASTER : null, ground });
    furnish(rec);
    pathTo(rec.entry, v.cx, v.cz, v.plazaBlock === B.PATH ? B.PATH : v.plazaBlock);
  }
  // houses
  let n = 0;
  for (let i = 0; i < v.houses + 8 && n < v.houses; i++) {
    const w = 6 + Math.floor(rng() * 3), d = 6 + Math.floor(rng() * 2);
    const lot = placeAround(v, w, d, { margin: 1, rng, jitter: 9, minDist: 6, r: v.r + 9 });
    if (!lot) continue;
    n++;
    const rec = building({ id: v.id + '_house' + n, vid: v.id, kind: 'house', name: v.name + ' house ' + n, x: lot.x, z: lot.z, w: lot.w, d: lot.d, wall: v.walls[Math.floor(rng() * v.walls.length)], roof: v.roofs[Math.floor(rng() * v.roofs.length)], door: lot.door, ground });
    furnish(rec);
    pathTo(rec.entry, v.cx, v.cz, B.PATH);
  }
  // building lots kept free for construction
  lots[v.id] = [];
  for (let i = 0; i < 6; i++) {
    const lot = placeAround(v, 7, 7, { margin: 1, rng, jitter: 6, minDist: 8, r: v.r + 12 });
    if (!lot) break;
    reserve(lot.x, lot.z, 7, 7, 1);
    lots[v.id].push({ x: lot.x, z: lot.z, w: 7, d: 7, door: lot.door });
  }
}

function siteAt(v, angle, w, d) {
  for (let k = 0; k < 24; k++) {
    const a = (angle + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 15) * Math.PI / 180;
    const dist = v.r + 3 + Math.max(w, d) / 2;
    const x = Math.round(v.cx + Math.cos(a) * dist - w / 2), z = Math.round(v.cz + Math.sin(a) * dist - d / 2);
    if (x < 2 || z < 2 || x + w > W - 2 || z + d > D - 2) continue;
    if (isFree(x, z, w, d, 1)) return [x, z];
  }
  const a = angle * Math.PI / 180; return [Math.round(v.cx + Math.cos(a) * (v.r + 6)), Math.round(v.cz + Math.sin(a) * (v.r + 6))];
}
function farmAt(v, angle, fw, fd, name) { const p = siteAt(v, angle, fw, fd); return farm(v, p[0], p[1], fw, fd, name); }
function farm(v, fx0, fz0, fw, fd, name) {
  const spots = [], blocks = [];
  flatten(fx0 - 1, fz0 - 1, fw + 2, fd + 2, GROUND);
  for (let x = fx0; x < fx0 + fw; x++) for (let z = fz0; z < fz0 + fd; z++) {
    const edge = x === fx0 || x === fx0 + fw - 1 || z === fz0 || z === fz0 + fd - 1;
    if (edge) { if (!(z === fz0 + 2 && (x === fx0 || x === fx0 + fw - 1)) && !(x === fx0 + 2 && (z === fz0 || z === fz0 + fd - 1))) data[idx(x, STAND, z)] = B.FENCE; else data[idx(x, GROUND, z)] = B.PATH; continue; }
    if ((z - fz0) % 4 === 0) { data[idx(x, GROUND, z)] = B.WATER; continue; }
    data[idx(x, GROUND, z)] = B.FARMLAND; data[idx(x, STAND, z)] = B.CROP; blocks.push([x, STAND, z, B.CROP]); spots.push([x, z]);
  }
  reserve(fx0, fz0, fw, fd, 1);
  const id = v.id + '_farm' + (places[v.id + '_farm'] ? '2' : '');
  const pl = addPlace({ id, vid: v.id, kind: 'farm', name: name || v.name + ' Fields', spots, entry: [fx0 - 1, fz0 + 2], center: [fx0 + (fw >> 1), fz0 + (fd >> 1)] });
  pathTo([fx0 - 1, fz0 + 2], v.cx, v.cz, B.PATH);
  addNode({ vid: v.id, type: 'food', place: id, spots, blocks, max: blocks.length, regen: 0, mode: 'crop', crop: true });
  return pl;
}

function generate(seed) {
  generating = true;
  data.fill(0); occupied.fill(0); buildings.length = 0; torches.length = 0; nodes.length = 0; roadCells.length = 0;
  for (const k in lots) delete lots[k];
  for (const k in places) delete places[k];
  const rng = mulberry32(seed || 4242);
  const noise = makeNoise(rng);
  // terrain: gentle hills between settlements, a mountain to the north-east
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    let near = 1e9;
    for (const v of VILLAGES) near = Math.min(near, Math.hypot(x - v.cx, z - v.cz) - v.r);
    let h = GROUND;
    const hill = noise(x / 14, z / 14) * 7 + noise(x / 5 + 50, z / 5) * 2 - 3.2;
    const fade = Math.max(0, Math.min(1, (near - 4) / 14));
    h += Math.max(0, Math.round(hill * fade));
    const md = Math.hypot(x - MOUNTAIN.x, (z - MOUNTAIN.z) * 1.1);
    if (md < MOUNTAIN.r) h = Math.max(h, GROUND + Math.round((1 - md / MOUNTAIN.r) * MOUNTAIN.h + noise(x / 4, z / 4) * 2));
    const hd = Math.hypot(x - 80, z - 6);
    if (hd < 15) h = Math.max(h, GROUND + Math.round((1 - hd / 15) * 9 + noise(x / 4 + 9, z / 4) * 1.5));
    let top = B.GRASS;
    if (Math.hypot(x - 36, z - 64) < 46 && noise(x / 6 + 90, z / 6) > 0.55) top = B.DIRT;
    fillColumn(x, z, Math.min(h, H - 6), top);
  }
  // river with sand banks
  for (let z = 0; z < D; z++) {
    const rx = riverX(z);
    for (let x = rx - 4; x <= rx + 3; x++) {
      if (x < 0 || x >= W) continue;
      const inRiver = x >= rx - 2 && x <= rx + 1;
      for (let y = 1; y < H; y++) {
        let b;
        if (inRiver) b = y < 5 ? B.STONE : y === 5 ? B.SAND : y <= 8 ? B.WATER : 0;
        else b = y > GROUND ? 0 : y >= GROUND - 2 ? B.SAND : data[idx(x, y, z)] || B.STONE;
        data[idx(x, y, z)] = b;
      }
      heights[x + z * W] = inRiver ? 5 : GROUND;
      occupied[x + z * W] = 3;
    }
  }
  // roads: every village to the crossroads
  for (const v of VILLAGES) drawRoad(v.cx, v.cz, CROSS[0], CROSS[1], B.PATH);
  drawRoad(172, 68, 172, 160, B.PATH); // the river road between the mine town and the trading town
  // bridge rails
  for (const [x, z] of roadCells) { const rx = riverX(z); if (x >= rx - 2 && x <= rx + 1) for (const dz of [-2, 2]) { const zz = z + dz; if (zz >= 0 && zz < D && data[idx(x, GROUND, zz)] === B.WATER) { data[idx(x, GROUND, zz)] = B.PLANKS; data[idx(x, STAND, zz)] = B.FENCE; } } }
  // crossroads signpost
  data[idx(CROSS[0] + 2, STAND, CROSS[1] + 2)] = B.FENCE; data[idx(CROSS[0] + 2, STAND + 1, CROSS[1] + 2)] = B.FENCE; data[idx(CROSS[0] + 2, STAND + 2, CROSS[1] + 2)] = B.PLANKS; data[idx(CROSS[0] + 2, STAND + 3, CROSS[1] + 2)] = B.TORCH;
  addPlace({ id: 'crossroads', vid: null, kind: 'crossroads', name: 'The Crossroads', spots: [[CROSS[0], CROSS[1]]], entry: CROSS.slice(), center: CROSS.slice() });
  // villages
  for (const v of VILLAGES) generateVillage(v, rng);
  // resource sites
  const hv = VBY.highvale, ir = VBY.ironridge, rg = VBY.rivergate, gh = VBY.greenhollow, af = VBY.ashfield;
  farmAt(hv, 60, 13, 11, 'Highvale Terraces');
  farmAt(gh, 200, 15, 13, 'North Fields'); farmAt(gh, 95, 17, 13, 'South Fields');
  farmAt(rg, 80, 13, 11, 'Delta Fields');
  farmAt(af, 150, 9, 9, 'Dust Patch');
  farmAt(ir, 10, 9, 9, 'Ridge Garden');
  // Ironridge mine: a tunnel north into the mountain with ore along the walls
  mine(ir, rng);
  // Highvale quarry in the north hill, Ashfield quarry pit
  quarry(hv, 82, 14, 9, 5, rng);
  const qa = siteAt(af, 250, 9, 7); quarry(af, qa[0], qa[1], 9, 7, rng, true);
  // Rivergate: fishing pier and clay banks
  riverWorks(rg, rng);
  // Greenhollow sheep pen
  const pp = siteAt(gh, 330, 9, 7); pen(gh, pp[0], pp[1]);
  // trees and forests; each tree is a renewable wood node owned by the nearest village
  const forests = [[34, 110, 20], [58, 10, 14], [10, 26, 16], [90, 180, 16], [198, 112, 16], [150, 38, 10], [130, 100, 12]];
  for (let x = 2; x < W - 2; x++) for (let z = 2; z < D - 2; z++) {
    if (occupied[x + z * W]) continue;
    let near = false;
    for (let dx = -2; dx <= 2 && !near; dx++) for (let dz = -2; dz <= 2; dz++) { const o = occupied[(x + dx) + (z + dz) * W]; if (o && o !== 4) { near = true; break; } }
    if (near) continue;
    let p = 0.01;
    for (const [fx, fz, fr] of forests) { const d = Math.hypot(x - fx, z - fz); if (d < fr) p = Math.max(p, 0.1 * (1 - d / fr) + 0.02); }
    let inVillage = false; for (const v of VILLAGES) if (Math.hypot(x - v.cx, z - v.cz) < v.r + 3) inVillage = true;
    if (inVillage) continue;
    if (rng() < p) {
      let nv = null, nd = 1e9; for (const v of VILLAGES) { const d = Math.hypot(x - v.cx, z - v.cz); if (d < nd) { nd = d; nv = v; } }
      const dead = nv.id === 'ashfield' && nd < 46 && rng() < 0.6;
      const blocks = tree(x, z, rng, dead);
      if (!blocks) continue;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (x + dx >= 0 && z + dz >= 0 && x + dx < W && z + dz < D && !occupied[x + dx + (z + dz) * W]) occupied[x + dx + (z + dz) * W] = 4;
      const spots = [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]];
      addNode({ vid: nv.id, type: 'wood', spots, blocks, max: dead ? 6 : 12, regen: dead ? 0.4 : 1.6, mode: 'remove', dist: nd });
    }
  }
  // leisure places near each village: the nearest forest edge and riverbank
  for (const v of VILLAGES) {
    const trees = nodes.filter(n => n.type === 'wood' && n.vid === v.id).sort((a, b) => a.dist - b.dist).slice(0, 6);
    if (trees.length) addPlace({ id: v.id + '_forest', vid: v.id, kind: 'forest', name: 'Woods near ' + v.name, spots: trees.map(t => t.spots[0]), entry: trees[0].spots[0], center: trees[0].spots[0] });
    const bank = [];
    for (let z = v.cz - 30; z <= v.cz + 30; z += 6) { if (z < 0 || z >= D) continue; const bx = riverX(z) - 4; if (Math.abs(bx - v.cx) < 40) bank.push([bx, z]); }
    if (bank.length) addPlace({ id: v.id + '_river', vid: v.id, kind: 'river', name: 'Riverbank', spots: bank, entry: bank[0], center: bank[0] });
  }
  // torches
  torches.length = 0;
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) if (data[idx(x, y, z)] === B.TORCH) torches.push([x, y, z]);
  generating = false;
  computeLight();
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) computeStandColumn(x, z);
  for (const b of buildings) {
    places[b.id] = b;
    b.spots = [];
    b.center = [b.x + (b.w >> 1), b.z + (b.d >> 1)];
    for (let i = b.x + 1; i < b.x + b.w - 1; i++) for (let k = b.z + 1; k < b.z + b.d - 1; k++)
      if (standY[i + k * W] === STAND && !(b.jail && i <= b.jail[0] + 1 && k <= b.jail[1] + 1)) b.spots.push([i, k]);
    if (!b.spots.length) b.spots.push(b.entry);
  }
  // flood from the crossroads to find every cell a villager can actually walk to
  const reach = new Uint8Array(W * D);
  { const q = [CROSS[0] + CROSS[1] * W]; reach[q[0]] = 1; let h = 0;
    while (h < q.length) { const c = q[h++]; const cx = c % W, cz = (c / W) | 0, cy = standY[c];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue; const ni = nx + nz * W; if (reach[ni] || standY[ni] < 0 || Math.abs(standY[ni] - cy) > 1) continue; if (standY[ni] > cy && BLOCKS[get(cx, cy + 2, cz)].solid) continue; reach[ni] = 1; q.push(ni); } } }
  const ok = ([x, z]) => x >= 0 && z >= 0 && x < W && z < D && reach[x + z * W];
  const fix = (cell) => { if (ok(cell)) return cell; for (let r = 1; r < 6; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { const c = [cell[0] + dx, cell[1] + dz]; if (ok(c)) return c; } return null; };
  for (const p of Object.values(places)) {
    p.spots = p.spots.filter(ok);
    const e = fix(p.entry); if (e) p.entry = e;
    if (!p.spots.length) p.spots = [p.entry];
  }
  for (let i = nodes.length - 1; i >= 0; i--) { const n = nodes[i]; n.spots = n.spots.map(fix).filter(Boolean); if (!n.spots.length) nodes.splice(i, 1); }
  nodes.forEach((n, i) => { n.id = 'n' + i; });
  World.reach = reach;
  base = data.slice();
}

function mine(v, rng) {
  // tunnel from the town's north edge into the mountain
  const x0 = v.cx - 1, zTop = 8, zMouth = v.cz - v.r + 1;
  const ore = { iron: [], coal: [], gold: [] }, spots = [];
  const cut = (x, z) => { data[idx(x, GROUND, z)] = B.STONE; for (let y = STAND; y < STAND + 3; y++) data[idx(x, y, z)] = 0; occupied[x + z * W] = 1; };
  for (let z = zTop; z <= zMouth; z++) for (let x = x0; x <= x0 + 1; x++) { cut(x, z); if (z < zMouth - 4) spots.push([x, z]); }
  for (const gz of [14, 24]) for (let x = x0 - 12; x <= x0 + 13; x++) for (let z = gz; z <= gz + 1; z++) { cut(x, z); spots.push([x, z]); }
  // timber supports + lights
  for (let z = zTop + 2; z < zMouth - 2; z += 5) { if (data[idx(x0, STAND + 3, z)]) for (let x = x0; x <= x0 + 1; x++) data[idx(x, STAND + 3, z)] = B.PLANKS; data[idx(x0 - 1, STAND + 1, z)] = data[idx(x0 - 1, STAND + 1, z)] ? B.TORCH : 0; }
  for (const gz of [14, 24]) for (const x of [x0 - 10, x0 - 4, x0 + 5, x0 + 11]) if (data[idx(x, STAND + 1, gz - 1)]) data[idx(x, STAND + 1, gz - 1)] = B.TORCH;
  // ore in the walls
  for (let x = x0 - 13; x <= x0 + 14; x++) for (let z = zTop - 1; z <= zMouth; z++) for (let y = STAND; y <= STAND + 2; y++) {
    const b = data[idx(x, y, z)];
    if (b !== B.STONE && b !== B.DIRT) continue;
    let air = false;
    for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(x + a, y, z + c) && data[idx(x + a, y, z + c)] === 0 && occupied[(x + a) + (z + c) * W] === 1) air = true;
    if (!air) continue;
    const r = rng();
    const deep = z < 18;
    if (deep && r < 0.05) { data[idx(x, y, z)] = B.GOLD_ORE; ore.gold.push([x, y, z, B.GOLD_ORE]); }
    else if (r < 0.2) { data[idx(x, y, z)] = B.ORE; ore.iron.push([x, y, z, B.ORE]); }
    else if (r < 0.34) { data[idx(x, y, z)] = B.COAL_ORE; ore.coal.push([x, y, z, B.COAL_ORE]); }
  }
  for (const x of [x0 - 1, x0 + 2]) for (let y = STAND; y < STAND + 3; y++) data[idx(x, y, zMouth)] = B.LOG;
  for (let x = x0 - 1; x <= x0 + 2; x++) data[idx(x, STAND + 3, zMouth)] = B.PLANKS;
  addPlace({ id: v.id + '_mine', vid: v.id, kind: 'mine', name: 'The Deep Seam', spots, entry: [x0, zMouth + 1], center: [x0, 20] });
  addNode({ vid: v.id, type: 'iron', place: v.id + '_mine', spots: spots.slice(), blocks: ore.iron, max: ore.iron.length * 2, regen: 2, mode: 'swap', swap: B.STONE });
  addNode({ vid: v.id, type: 'coal', place: v.id + '_mine', spots: spots.slice(), blocks: ore.coal, max: ore.coal.length * 2, regen: 2, mode: 'swap', swap: B.STONE });
  addNode({ vid: v.id, type: 'gold', place: v.id + '_mine', spots: spots.filter(s => s[1] < 20), blocks: ore.gold, max: Math.max(2, ore.gold.length), regen: 0.08, mode: 'swap', swap: B.STONE });
  const stone = [];
  for (let x = x0 - 13; x <= x0 + 14; x++) for (let z = 12; z <= 27; z++) if (data[idx(x, STAND, z)] === B.STONE && occupied[x + z * W] !== 1) { let air = false; for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (data[idx(x + a, STAND, z + c)] === 0) air = true; if (air) stone.push([x, STAND, z, B.STONE]); }
  addNode({ vid: v.id, type: 'stone', place: v.id + '_mine', spots: spots.slice(), blocks: stone.slice(0, 60), max: 180, regen: 0, mode: 'remove' });
  pathTo([x0, zMouth + 1], v.cx, v.cz, B.STONE_BRICK);
}
function quarry(v, qx, qz, w, d, rng, pit) {
  const blocks = [], spots = [];
  for (let x = qx; x < qx + w; x++) for (let z = qz; z < qz + d; z++) {
    const h = topSolid(x, z);
    const floor = pit ? GROUND - 1 : GROUND;
    for (let y = floor + 1; y <= Math.max(h, GROUND); y++) data[idx(x, y, z)] = 0;
    data[idx(x, floor, z)] = B.STONE;
    if (pit) { data[idx(x, GROUND - 2, z)] = B.STONE; }
    spots.push([x, z]);
    occupied[x + z * W] = 1;
  }
  for (let x = qx - 1; x <= qx + w; x++) for (let z = qz - 1; z <= qz + d; z++) {
    if (x >= qx && x < qx + w && z >= qz && z < qz + d) continue;
    for (let y = GROUND - 1; y <= GROUND + 3; y++) { if (pit && y > GROUND) break; const b = get(x, y, z); if (b === B.STONE || b === B.DIRT || b === B.GRASS) { data[idx(x, y, z)] = B.STONE; blocks.push([x, y, z, B.STONE]); } }
  }
  addPlace({ id: v.id + '_quarry', vid: v.id, kind: 'quarry', name: v.name + ' Quarry', spots, entry: [qx + (w >> 1), qz + d], center: [qx + (w >> 1), qz + (d >> 1)] });
  addNode({ vid: v.id, type: 'stone', place: v.id + '_quarry', spots, blocks, max: blocks.length * 2, regen: 0, mode: 'remove' });
  if (!pit && rng() < 2) { for (let k = 0; k < 4; k++) { const b = blocks[Math.floor(rng() * blocks.length)]; if (b) { data[idx(b[0], b[1], b[2])] = B.ORE; b[3] = B.ORE; } } }
  pathTo([qx + (w >> 1), qz + d], v.cx, v.cz, B.PATH);
}
function riverWorks(v, rng) {
  const pz = v.cz; const rx = riverX(pz);
  const spots = [];
  for (let x = rx - 4; x < v.cx - v.r + 1; x++) { data[idx(x, GROUND, pz)] = B.PLANKS; data[idx(x, GROUND, pz + 1)] = B.PLANKS; occupied[x + pz * W] = 1; }
  for (let x = rx - 2; x <= rx; x++) for (const z of [pz, pz + 1]) { data[idx(x, GROUND, z)] = B.PLANKS; spots.push([x, z]); }
  for (const z of [pz - 1, pz + 2]) for (let x = rx - 2; x <= rx; x++) if (data[idx(x, GROUND, z)] === B.WATER) { data[idx(x, GROUND, z)] = B.PLANKS; data[idx(x, STAND, z)] = B.FENCE; }
  addPlace({ id: v.id + '_pier', vid: v.id, kind: 'pier', name: 'Rivergate Pier', spots, entry: [rx - 4, pz], center: [rx - 1, pz] });
  addNode({ vid: v.id, type: 'fish', place: v.id + '_pier', spots, blocks: [], max: 40, regen: 26, mode: 'none' });
  const clay = [], cspots = [];
  for (let z = pz - 22; z <= pz - 6; z++) { const r2 = riverX(z); for (const x of [r2 - 3, r2 - 4]) { if (data[idx(x, GROUND, z)] === B.SAND) { data[idx(x, GROUND, z)] = B.CLAY; clay.push([x, GROUND, z, B.CLAY]); if (x === r2 - 4) cspots.push([x - 1, z]); } } }
  for (const [x, z] of cspots) flatten(x, z, 1, 1, GROUND, B.SAND);
  addPlace({ id: v.id + '_claypits', vid: v.id, kind: 'claypits', name: 'Clay Banks', spots: cspots, entry: cspots[0], center: cspots[cspots.length >> 1] });
  addNode({ vid: v.id, type: 'clay', place: v.id + '_claypits', spots: cspots, blocks: clay, max: clay.length * 3, regen: 2, mode: 'swap', swap: B.SAND });
}
function pen(v, x0, z0) {
  const spots = [], blocks = [];
  flatten(x0 - 1, z0 - 1, 11, 9, GROUND);
  for (let x = x0; x < x0 + 9; x++) for (let z = z0; z < z0 + 7; z++) {
    const edge = x === x0 || x === x0 + 8 || z === z0 || z === z0 + 6;
    if (edge) { if (!(x === x0 && z === z0 + 3)) data[idx(x, STAND, z)] = B.FENCE; continue; }
    spots.push([x, z]);
  }
  for (const [x, z] of [[x0 + 2, z0 + 2], [x0 + 5, z0 + 4], [x0 + 6, z0 + 1]]) { data[idx(x, STAND, z)] = B.WOOL; blocks.push([x, STAND, z, B.WOOL]); }
  reserve(x0, z0, 9, 7, 1);
  addPlace({ id: v.id + '_pen', vid: v.id, kind: 'pen', name: 'Sheep Pen', spots, entry: [x0 - 1, z0 + 3], center: [x0 + 4, z0 + 3] });
  addNode({ vid: v.id, type: 'wool', place: v.id + '_pen', spots, blocks, max: 30, regen: 12, mode: 'remove' });
  pathTo([x0 - 1, z0 + 3], v.cx, v.cz, B.PATH);
}

// ---------- walk grid ----------
function computeStandColumn(x, z) {
  if (x < 0 || z < 0 || x >= W || z >= D) return;
  let found = -1;
  for (let y = 1; y < H - 2; y++) {
    const below = BLOCKS[data[idx(x, y - 1, z)]];
    const here = data[idx(x, y, z)], above = data[idx(x, y + 1, z)];
    if (!below.solid || below.shape === 'post') continue;
    if (BLOCKS[here].solid || BLOCKS[above].solid) continue;
    if (here === B.WATER || data[idx(x, y - 1, z)] === B.WATER) continue;
    found = y; break;
  }
  standY[x + z * W] = found;
  const g = found >= 0 ? data[idx(x, found - 1, z)] : 0;
  pathCost[x + z * W] = (g === B.PATH || g === B.COBBLE || g === B.PLANKS || g === B.STONE || g === B.STONE_BRICK) ? 1 : g === B.FARMLAND ? 1.6 : 1.4;
}
function standAt(x, z) { x = Math.floor(x); z = Math.floor(z); if (x < 0 || z < 0 || x >= W || z >= D) return STAND; const s = standY[x + z * W]; return s < 0 ? STAND : s; }

// ---------- A* ----------
const openHeap = [];
const gScore = new Float32Array(W * D), fromIdx = new Int32Array(W * D), stamp = new Uint32Array(W * D), closedStamp = new Uint32Array(W * D);
let curStamp = 1;
function findPath(sx, sz, tx, tz, maxNodes) {
  sx |= 0; sz |= 0; tx |= 0; tz |= 0;
  if (sx < 0 || sz < 0 || sx >= W || sz >= D || tx < 0 || tz < 0 || tx >= W || tz >= D) return null;
  if (standY[tx + tz * W] < 0) { const n = nearestWalkable(tx, tz); if (!n) return null; [tx, tz] = n; }
  if (standY[sx + sz * W] < 0) { const n = nearestWalkable(sx, sz); if (!n) return null; [sx, sz] = n; }
  curStamp++;
  const start = sx + sz * W, goal = tx + tz * W;
  openHeap.length = 0;
  const h = (i) => { const x = i % W, z = (i / W) | 0; const dx = Math.abs(x - tx), dz = Math.abs(z - tz); return (dx + dz) + (1.414 - 2) * Math.min(dx, dz); };
  gScore[start] = 0; stamp[start] = curStamp; fromIdx[start] = -1;
  push([h(start), start]);
  let n = 0; maxNodes = maxNodes || 6000;
  while (openHeap.length) {
    const [, cur] = pop();
    if (closedStamp[cur] === curStamp) continue;
    closedStamp[cur] = curStamp;
    if (cur === goal) break;
    if (++n > maxNodes) return null;
    const cx = cur % W, cz = (cur / W) | 0, cy = standY[cur];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
      const ni = nx + nz * W, ny = standY[ni];
      if (ny < 0 || Math.abs(ny - cy) > 1) continue;
      if (dx && dz) { const a = standY[cx + dx + cz * W], b = standY[cx + (cz + dz) * W]; if (a !== cy || b !== cy || ny !== cy) continue; }
      if (ny > cy && BLOCKS[get(cx, cy + 2, cz)].solid) continue;
      const step = (dx && dz ? 1.414 : 1) * pathCost[ni] + (ny !== cy ? 0.5 : 0);
      const g = gScore[cur] + step;
      if (stamp[ni] !== curStamp || g < gScore[ni]) { stamp[ni] = curStamp; gScore[ni] = g; fromIdx[ni] = cur; push([g + h(ni), ni]); }
    }
  }
  if (stamp[goal] !== curStamp || closedStamp[goal] !== curStamp) return null;
  const out = [];
  for (let c = goal; c !== -1; c = fromIdx[c]) out.push([c % W, (c / W) | 0]);
  out.reverse();
  return out;
}
function push(item) { openHeap.push(item); let i = openHeap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (openHeap[p][0] <= item[0]) break; openHeap[i] = openHeap[p]; i = p; } openHeap[i] = item; }
function pop() { const top = openHeap[0], last = openHeap.pop(); if (openHeap.length) { let i = 0; const n = openHeap.length; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < n && openHeap[l][0] < (m === i ? last[0] : openHeap[m][0])) m = l; if (r < n && openHeap[r][0] < (m === i ? last[0] : openHeap[m][0])) m = r; if (m === i) break; openHeap[i] = openHeap[m]; i = m; } openHeap[i] = last; } return top; }
function nearestWalkable(x, z) {
  for (let r = 0; r < 10; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const nx = x + dx, nz = z + dz;
    if (nx >= 0 && nz >= 0 && nx < W && nz < D && standY[nx + nz * W] >= 0) return [nx, nz];
  }
  return null;
}

// ---------- line of sight + raycast ----------
function los(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const dist = Math.hypot(dx, dy, dz); if (dist < 1) return true;
  const steps = Math.ceil(dist * 2);
  for (let i = 1; i < steps; i++) { const t = i / steps; if (isOpaque(Math.floor(ax + dx * t), Math.floor(ay + dy * t), Math.floor(az + dz * t))) return false; }
  return true;
}
function raycast(ox, oy, oz, dx, dy, dz, maxDist, pickable) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
  const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
  let tx = dx ? ((sx > 0 ? x + 1 - ox : ox - x) * tdx) : Infinity;
  let ty = dy ? ((sy > 0 ? y + 1 - oy : oy - y) * tdy) : Infinity;
  let tz = dz ? ((sz > 0 ? z + 1 - oz : oz - z) * tdz) : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  while (t <= maxDist) {
    const b = get(x, y, z);
    if (b && (pickable ? pickable(b) : b !== B.WATER)) return { x, y, z, nx, ny, nz, block: b, dist: t };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}

// ---------- torch light ----------
function computeLight() {
  light.fill(0);
  const q = [];
  for (let i = 0; i < data.length; i++) { const L = BLOCKS[data[i]].light; if (L) { light[i] = L; q.push(i); } }
  flood(q);
}
function flood(q) {
  let head = 0;
  while (head < q.length) {
    const i = q[head++], L = light[i];
    if (L <= 1) continue;
    const x = i % W, z = ((i / W) | 0) % D, y = (i / (W * D)) | 0;
    for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const nx = x + a, ny = y + b, nz = z + c;
      if (!inb(nx, ny, nz)) continue;
      const j = idx(nx, ny, nz);
      if (BLOCKS[data[j]].opaque) continue;
      if (light[j] < L - 1) { light[j] = L - 1; q.push(j); }
    }
  }
}
function relightAround(x, y, z) {
  const R = 15, q = [];
  const x0 = Math.max(0, x - R), x1 = Math.min(W - 1, x + R), y0 = Math.max(0, y - R), y1 = Math.min(H - 1, y + R), z0 = Math.max(0, z - R), z1 = Math.min(D - 1, z + R);
  for (let j = y0; j <= y1; j++) for (let k = z0; k <= z1; k++) for (let i = x0; i <= x1; i++) light[idx(i, j, k)] = 0;
  for (let j = Math.max(0, y0 - 1); j <= Math.min(H - 1, y1 + 1); j++) for (let k = Math.max(0, z0 - 1); k <= Math.min(D - 1, z1 + 1); k++) for (let i = Math.max(0, x0 - 1); i <= Math.min(W - 1, x1 + 1); i++) {
    const n = idx(i, j, k);
    const inside = i >= x0 && i <= x1 && j >= y0 && j <= y1 && k >= z0 && k <= z1;
    if (inside) { const L = BLOCKS[data[n]].light; if (L) { light[n] = L; q.push(n); } }
    else if (light[n] > 1) q.push(n);
  }
  flood(q);
}
function lightAt(x, y, z) { x = Math.floor(x); y = Math.floor(y); z = Math.floor(z); return inb(x, y, z) ? light[idx(x, y, z)] / 14 : 0; }

function applyEdits(map) {
  generating = true;
  for (const k in map) { data[+k] = map[k]; if (base && base[+k] === map[k]) delete edits[k]; else edits[k] = map[k]; }
  generating = false;
  computeLight();
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) computeStandColumn(x, z);
}
// apply a full authoritative edit set: restore anything no longer edited, set the rest (followers)
function syncEdits(map, notify) {
  const changed = [];
  for (const k in edits) if (!(k in map) && base) { const i = +k; if (data[i] !== base[i]) { data[i] = base[i]; changed.push(i); } delete edits[k]; }
  for (const k in map) { const i = +k; if (data[i] !== map[k]) { data[i] = map[k]; changed.push(i); } edits[k] = map[k]; }
  if (!changed.length) return 0;
  const cols = new Set();
  for (const i of changed) { const x = i % W, z = ((i / W) | 0) % D; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) cols.add((x + a) + ',' + (z + b)); }
  for (const c of cols) { const [x, z] = c.split(',').map(Number); computeStandColumn(x, z); }
  if (changed.length > 200) computeLight(); else { const seen = new Set(); for (const i of changed) { const x = i % W, z = ((i / W) | 0) % D, y = (i / (W * D)) | 0; const k = (x >> 3) + ',' + (y >> 3) + ',' + (z >> 3); if (!seen.has(k)) { seen.add(k); relightAround(x, y, z); } } }
  if (notify) for (const i of changed) { const x = i % W, z = ((i / W) | 0) % D, y = (i / (W * D)) | 0; for (const fn of listeners) fn(x, y, z, data[i], { sync: true }); }
  return changed.length;
}
function clearEdits() { for (const k in edits) delete edits[k]; }
function placeAt(x, z) { for (const b of buildings) if (x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d) return b; return null; }
function villageAt(x, z, pad) { for (const v of VILLAGES) if (Math.hypot(x - v.cx, z - v.cz) < v.r + (pad === undefined ? 8 : pad)) return v.id; return null; }
function findLot(vid, w, d) {
  const L = lots[vid] || [];
  const k = L.findIndex(l => l.w >= w && l.d >= d);
  if (k >= 0) return L.splice(k, 1)[0];
  const v = VBY[vid]; if (!v) return null;
  const lot = placeAround(v, w, d, { margin: 1, r: v.r + 7, minDist: 8 });
  if (!lot) return null;
  for (let x = lot.x; x < lot.x + w; x++) for (let z = lot.z; z < lot.z + d; z++) if (heights[x + z * W] > GROUND + 2) return null;
  reserve(lot.x, lot.z, w, d, 1);
  return lot;
}
function topBlockColor(x, z) { const y = topSolidAny(x, z); return [y, data[idx(x, y, z)]]; }
function topSolidAny(x, z) { for (let y = H - 1; y >= 0; y--) { const b = data[idx(x, y, z)]; if (b && b !== B.TORCH) return y; } return 0; }

const World = {
  W, H, D, GROUND, STAND, BLOCKS, B, data, light, standY, idx, inb, get, set, isSolid, isOpaque, onChange, edits,
  applyEdits, syncEdits, clearEdits, generate, places, buildings, torches, lots, nodes, roadCells, findPath, nearestWalkable, standAt,
  los, raycast, lightAt, placeAt, villageAt, mulberry32, building, furnish, computeLight, findLot, flatten, reserve, topBlockColor,
  VILLAGES, VBY, CROSS, riverX, registerNode, get base() { return base; },
};
if (typeof module !== 'undefined' && module.exports) module.exports = World; else root.World = World;
})(typeof window !== 'undefined' ? window : globalThis);
