/* AI CRAFT \u2014 world.js
   Voxel world of five settlements: block registry, deterministic generation (terrain, river, mountain,
   roads, villages with identities, resource nodes, building lots), walk grid, A*, line of sight,
   raycast and torch light. Pure data, no rendering. Runs in the browser and in Node. */
(function (root) {
'use strict';

const W = 320, H = 60, D = 320;
// layout of the old 208-block map, scaled onto the larger one
const SK = 1.5, SO = 4, SP = (n) => Math.round(SO + n * SK), SR = (n) => Math.round(n * SK);
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
  // biomes
  { name: 'snow', tex: [33, 33, 33], col: '#eef3f6', snap: 12 },
  { name: 'snowy grass', tex: [33, 34, 2], col: '#e6eef0', snap: 12 },
  { name: 'spruce log', tex: [36, 35, 36], col: '#4a3420', snap: 6 },
  { name: 'spruce leaves', tex: [37, 37, 37], opaque: false, cutout: true, col: '#2f5a3a', snap: 7 },
  { name: 'spruce planks', tex: [38, 38, 38], col: '#7a5634', snap: 8 },
  { name: 'birch log', tex: [40, 39, 40], col: '#d9d4c4', snap: 6 },
  { name: 'birch leaves', tex: [41, 41, 41], opaque: false, cutout: true, col: '#7fae4a', snap: 7 },
  { name: 'cactus', tex: [43, 42, 43], opaque: true, col: '#4f8a34', snap: 7 },
  { name: 'red sand', tex: [44, 44, 44], col: '#c46a32', snap: 10 },
  { name: 'terracotta', tex: [45, 45, 45], col: '#b5603a', snap: 10 },
  { name: 'white terracotta', tex: [46, 46, 46], col: '#d8c0a8', snap: 5 },
  { name: 'brown terracotta', tex: [47, 47, 47], col: '#7d4a33', snap: 10 },
  { name: 'sandstone', tex: [49, 48, 49], col: '#dcca92', snap: 5 },
  { name: 'cut sandstone', tex: [49, 50, 49], col: '#e0cf98', snap: 5 },
  { name: 'mud', tex: [51, 51, 51], col: '#4a3c30', snap: 2 },
  { name: 'mud brick', tex: [52, 52, 52], col: '#8f7356', snap: 10 },
  { name: 'swamp grass', tex: [53, 54, 2], col: '#55663a', snap: 1 },
  { name: 'red flower', tex: [55, 55, 55], solid: false, opaque: false, shape: 'cross', col: '#6c9a3f', snap: 1, decor: true },
  { name: 'yellow flower', tex: [56, 56, 56], solid: false, opaque: false, shape: 'cross', col: '#6c9a3f', snap: 1, decor: true },
  { name: 'tall grass', tex: [57, 57, 57], solid: false, opaque: false, shape: 'cross', col: '#6c9a3f', snap: 1, decor: true },
  { name: 'dead bush', tex: [58, 58, 58], solid: false, opaque: false, shape: 'cross', col: '#d8c48c', snap: 5, decor: true },
  { name: 'reeds', tex: [59, 59, 59], solid: false, opaque: false, shape: 'cross', col: '#55663a', snap: 1, decor: true },
  { name: 'vine', tex: [60, 60, 60], solid: false, opaque: false, shape: 'cross', col: '#3f6a2a', snap: 7, decor: true },
  { name: 'jungle log', tex: [62, 61, 62], col: '#5a4426', snap: 6 },
  { name: 'jungle leaves', tex: [63, 63, 63], opaque: false, cutout: true, col: '#2f7a26', snap: 7 },
  { name: 'ice', tex: [64, 64, 64], col: '#9cc4e8', snap: 4 },
  { name: 'stained glass', tex: [65, 65, 65], opaque: false, cutout: true, col: '#8a5ab0', snap: 14 },
  { name: 'clock', tex: [30, 66, 30], col: '#e8e0c8', snap: 11 },
  { name: 'gold block', tex: [67, 67, 67], light: 4, col: '#f0c838', snap: 14 },
  { name: 'dark planks', tex: [68, 68, 68], col: '#4a3222', snap: 8 },
  { name: 'mossy cobble', tex: [69, 69, 69], col: '#6f7d5a', snap: 3 },
  { name: 'marble', tex: [70, 71, 70], col: '#ecebe4', snap: 12 },
  { name: 'copper roof', tex: [72, 72, 72], col: '#5fa08a', snap: 11 },
  { name: 'lantern', tex: [73, 73, 73], opaque: false, cutout: true, light: 13, col: '#ffd060', snap: 14 },
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
// every settlement has a biome and builds in its own style:
//   style.wood / style.stone / style.fine: wall materials by wealth, corner: posts, roofs + roofShape, ground: the soil they live on
const VILLAGES = [
  { id: 'highvale', name: 'Highvale', cx: SP(100), cz: SP(46), r: 40, plaza: 19, theme: 'Politics \u00B7 education \u00B7 learning', biome: 'snow',
    walls: [B.SPRUCE_PLANKS, B.STONE_BRICK, B.SPRUCE_PLANKS, B.PLASTER], roofs: [B.SLATE, B.DARK_PLANKS, B.SLATE], plazaBlock: B.COBBLE, houses: 13, extra: ['academy'], color: '#8bb3d1',
    style: { wood: B.SPRUCE_PLANKS, stone: B.STONE_BRICK, fine: B.PLASTER, corner: B.SPRUCE_LOG, trim: B.DARK_PLANKS, roofs: [B.SLATE, B.DARK_PLANKS], roofShape: 'steep', ground: B.SNOWY_GRASS, accent: B.COPPER_ROOF } },
  { id: 'ironridge', name: 'Ironridge', cx: SP(172), cz: SP(68), r: 34, plaza: 15, theme: 'Mining \u00B7 industry \u00B7 wealth', biome: 'badlands',
    walls: [B.TERRACOTTA, B.COBBLE, B.STONE_BRICK, B.WHITE_TERRACOTTA], roofs: [B.SLATE, B.DARK_PLANKS], plazaBlock: B.STONE_BRICK, houses: 12, extra: [], color: '#c9a24a',
    style: { wood: B.DARK_PLANKS, stone: B.TERRACOTTA, fine: B.WHITE_TERRACOTTA, corner: B.STONE_BRICK, trim: B.BROWN_TERRACOTTA, roofs: [B.SLATE, B.DARK_PLANKS], roofShape: 'hip', ground: B.RED_SAND, accent: B.GOLD_BLOCK } },
  { id: 'rivergate', name: 'Rivergate', cx: SP(172), cz: SP(160), r: 34, plaza: 17, theme: 'Trade \u00B7 merchants \u00B7 information', biome: 'swamp',
    walls: [B.MUD_BRICK, B.PLANKS, B.BRICK, B.PLASTER], roofs: [B.ROOF_TILE, B.THATCH], plazaBlock: B.COBBLE, houses: 12, extra: ['stalls'], color: '#e07a5a',
    style: { wood: B.PLANKS, stone: B.MUD_BRICK, fine: B.BRICK, corner: B.DARK_PLANKS, trim: B.PLASTER, roofs: [B.ROOF_TILE, B.THATCH], roofShape: 'gable', ground: B.SWAMP_GRASS, accent: B.COPPER_ROOF } },
  { id: 'greenhollow', name: 'Greenhollow', cx: SP(48), cz: SP(156), r: 36, plaza: 15, theme: 'Agriculture \u00B7 tradition \u00B7 cooperation', biome: 'meadow',
    walls: [B.PLANKS, B.PLASTER], roofs: [B.THATCH, B.THATCH, B.ROOF_TILE], plazaBlock: B.PATH, houses: 12, extra: [], color: '#7d9b52',
    style: { wood: B.PLANKS, stone: B.PLASTER, fine: B.BRICK, corner: B.LOG, trim: B.LOG, roofs: [B.THATCH, B.ROOF_TILE], roofShape: 'gable', ground: B.GRASS, accent: B.ROOF_TILE } },
  { id: 'ashfield', name: 'Ashfield', cx: SP(36), cz: SP(64), r: 33, plaza: 13, theme: 'Poor \u00B7 chaotic \u00B7 lawless', biome: 'desert',
    walls: [B.SANDSTONE, B.MUD_BRICK, B.SANDSTONE], roofs: [B.CUT_SANDSTONE], plazaBlock: B.PATH, houses: 12, extra: [], color: '#a0603a',
    style: { wood: B.MUD_BRICK, stone: B.SANDSTONE, fine: B.CUT_SANDSTONE, corner: B.CUT_SANDSTONE, trim: B.TERRACOTTA, roofs: [B.CUT_SANDSTONE], roofShape: 'flat', ground: B.SAND, accent: B.GOLD_BLOCK } },
];
const VBY = {}; VILLAGES.forEach(v => { VBY[v.id] = v; });
const CROSS = [SP(106), SP(104)];
const riverX = z => Math.round(SP(137) + 6 * Math.sin(z * 0.03) + 3 * Math.sin(z * 0.087));
const MOUNTAIN = { x: SP(184), z: SP(20), r: 64, h: 30 };
const LAKE = { x: 150, z: 286, rx: 34, rz: 20 };

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
// biome of every column, decided once per world
const BIOMES = ['meadow', 'snow', 'badlands', 'swamp', 'desert', 'jungle', 'mountain', 'lake'];
const biomeMap = new Uint8Array(W * D);
const biomeAt = (x, z) => (x < 0 || z < 0 || x >= W || z >= D) ? 'meadow' : BIOMES[biomeMap[x + z * W]];
const GROUND_OF = { meadow: B.GRASS, snow: B.SNOWY_GRASS, badlands: B.RED_SAND, swamp: B.SWAMP_GRASS, desert: B.SAND, jungle: B.GRASS, mountain: B.GRASS, lake: B.SAND };
const groundAt = (x, z) => GROUND_OF[biomeAt(x, z)] || B.GRASS;
// badlands cliffs show coloured bands
const BAND = (y) => [B.TERRACOTTA, B.WHITE_TERRACOTTA, B.TERRACOTTA, B.BROWN_TERRACOTTA, B.RED_SAND, B.TERRACOTTA, B.WHITE_TERRACOTTA][((y % 7) + 7) % 7];
function fillColumn(x, z, h, topBlock, sub) {
  for (let y = 0; y < H; y++) {
    let b = 0;
    if (y < h - 2 && !(sub === 'band' && y >= GROUND - 2)) b = B.STONE;
    else if (y < h) b = sub === 'band' ? BAND(y) : (sub || B.DIRT);
    else if (y === h) b = topBlock || B.GRASS;
    data[idx(x, y, z)] = b;
  }
  heights[x + z * W] = h;
}
function flatten(x0, z0, w, d, top, topBlock) {
  for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) {
    if (x < 0 || z < 0 || x >= W || z >= D) continue;
    const tb = topBlock || groundAt(x, z), sub = tb === B.SAND ? B.SANDSTONE : tb === B.RED_SAND ? B.TERRACOTTA : B.DIRT;
    for (let y = 1; y < H; y++) {
      if (y < top - 2) data[idx(x, y, z)] = B.STONE;
      else if (y < top) data[idx(x, y, z)] = sub;
      else if (y === top) data[idx(x, y, z)] = tb;
      else data[idx(x, y, z)] = 0;
    }
    heights[x + z * W] = top;
  }
}

// ---------- buildings ----------
// roof cells over a w x d footprint whose walls end at `top`: gable, steep, hip, flat (parapet), dome, spire
function roofCells(x, z, w, d, top, shape, roof, wall, trim) {
  const out = [];
  const put = (i, y, k, b) => out.push([i, y, k, b]);
  shape = shape || 'gable';
  if (shape === 'flat') {
    for (let i = x; i < x + w; i++) for (let k = z; k < z + d; k++) put(i, top, k, roof);
    for (let i = x; i < x + w; i++) for (let k = z; k < z + d; k++) {
      const edge = i === x || i === x + w - 1 || k === z || k === z + d - 1; if (!edge) continue;
      put(i, top + 1, k, trim || wall);
      if ((i + k) % 2 === 0 && ((i === x || i === x + w - 1) && (k === z || k === z + d - 1) || (i + k) % 4 === 0)) put(i, top + 2, k, trim || wall);
    }
    return out;
  }
  if (shape === 'hip' || shape === 'spire') {
    const rise = shape === 'spire' ? 2 : 1;
    for (let lvl = 0; ; lvl++) {
      const x0 = x - 1 + lvl, z0 = z - 1 + lvl, x1 = x + w - lvl, z1 = z + d - lvl;
      if (x0 > x1 || z0 > z1) break;
      for (let r = 0; r < rise; r++) {
        const y = top + lvl * rise + r;
        for (let i = x0; i <= x1; i++) for (let k = z0; k <= z1; k++) if (i === x0 || i === x1 || k === z0 || k === z1 || x1 - x0 < 2 || z1 - z0 < 2) put(i, y, k, roof);
      }
      if (x1 - x0 < 2 || z1 - z0 < 2) break;
    }
    return out;
  }
  if (shape === 'dome') {
    const cx = x + (w - 1) / 2, cz = z + (d - 1) / 2, R = Math.min(w, d) / 2 + 0.3;
    for (let i = x; i < x + w; i++) for (let k = z; k < z + d; k++) for (let y = 0; y <= Math.ceil(R); y++) {
      const r = Math.hypot(i - cx, y * 1.05, k - cz);
      if (r <= R && r > R - 1.25) put(i, top + y, k, roof);
    }
    for (let i = x; i < x + w; i++) for (let k = z; k < z + d; k++) put(i, top, k, roof);
    return out;
  }
  // gable (and steep: two blocks of rise per step)
  const rise = shape === 'steep' ? 2 : 1;
  const alongX = w >= d; const L = alongX ? w : d, Sh = alongX ? d : w;
  for (let lvl = 0; ; lvl++) {
    const a = lvl - 1, b = Sh - lvl; if (a > b) break;
    for (let r = 0; r < rise; r++) {
      const y = top + lvl * rise + r;
      for (let t = -1; t <= L; t++) {
        for (const sIdx of (a === b ? [a] : [a, b])) put(alongX ? x + t : x + sIdx, y, alongX ? z + sIdx : z + t, roof);
        if (t === 0 || t === L - 1) for (let sIdx = a + 1; sIdx < b; sIdx++) put(alongX ? x + t : x + sIdx, y, alongX ? z + sIdx : z + t, wall === B.GLASS ? B.PLANKS : wall);
      }
    }
    if (a === b || a + 1 === b) break;
  }
  return out;
}
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
  for (const [i, y, k, b] of roofCells(x, z, w, d, top, spec.roofShape, spec.roof, spec.wall, spec.trim)) if (inb(i, y, k)) data[idx(i, y, k)] = b;
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
// trees: each returns its blocks in the order they come down (leaves first, then the trunk from the top)
const GROWS = new Set([B.GRASS, B.DIRT, B.SNOWY_GRASS, B.SWAMP_GRASS, B.SAND, B.RED_SAND, B.SNOW]);
function setIf(x, y, z, b, list) { if (inb(x, y, z) && data[idx(x, y, z)] === 0) { data[idx(x, y, z)] = b; list.push([x, y, z, b]); return true; } return false; }
function trunk(x, z, h, th, log, logs) { for (let y = h + 1; y <= h + th; y++) { data[idx(x, y, z)] = log; logs.push([x, y, z, log]); } }
function tree(x, z, rng, kind) {
  const h = topSolid(x, z); const g = get(x, h, z);
  if (!GROWS.has(g) || h > H - 20) return null;
  const logs = [], leaves = [];
  kind = kind || 'oak';
  if (kind === 'dead') {
    const th = 3 + Math.floor(rng() * 2); trunk(x, z, h, th, B.LOG, logs);
    if (rng() < 0.6) { const dx = rng() < .5 ? 1 : -1; setIf(x + dx, h + th - 1, z, B.LOG, logs); }
  } else if (kind === 'cactus') {
    const th = 2 + Math.floor(rng() * 2); trunk(x, z, h, th, B.CACTUS, logs);
  } else if (kind === 'spruce') {
    const th = 6 + Math.floor(rng() * 4); trunk(x, z, h, th, B.SPRUCE_LOG, logs);
    // tiers of a cone, wide at the bottom
    for (let y = h + 3; y <= h + th + 1; y++) {
      const fromTop = h + th + 1 - y; const r = fromTop === 0 ? 0 : Math.min(3, 1 + (fromTop >> 1) - ((y - h) % 2 === 0 ? 1 : 0));
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (Math.abs(dx) + Math.abs(dz) <= r + 1 && (dx || dz || y > h + th)) setIf(x + dx, y, z + dz, B.SPRUCE_LEAVES, leaves);
    }
    setIf(x, h + th + 2, z, B.SNOW, leaves);
  } else if (kind === 'birch') {
    const th = 5 + Math.floor(rng() * 3); trunk(x, z, h, th, B.BIRCH_LOG, logs);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 1; dy++) {
      const r = Math.abs(dx) + Math.abs(dz) + Math.abs(dy + 0.5); if (r > 3.2 || (dy === 1 && Math.abs(dx) + Math.abs(dz) > 1)) continue;
      if (rng() > 0.1) setIf(x + dx, h + th + dy, z + dz, B.BIRCH_LEAVES, leaves);
    }
  } else if (kind === 'jungle') {
    // a 2x2 giant with a wide canopy and hanging vines
    const th = 11 + Math.floor(rng() * 5);
    for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { if (get(x + ox, h, z + oz) === 0) data[idx(x + ox, h, z + oz)] = B.DIRT; trunk(x + ox, z + oz, h, th, B.JUNGLE_LOG, logs); }
    for (let dy = -2; dy <= 1; dy++) { const R = dy === 1 ? 2 : dy === -2 ? 3 : 4; for (let dx = -R; dx <= R + 1; dx++) for (let dz = -R; dz <= R + 1; dz++) { const ddx = dx - 0.5, ddz = dz - 0.5; if (ddx * ddx + ddz * ddz > R * R + 1 || rng() < 0.08) continue; setIf(x + dx, h + th + dy, z + dz, B.JUNGLE_LEAVES, leaves); } }
    for (let k = 0; k < 8; k++) { const a = rng() * Math.PI * 2, vx = x + Math.round(Math.cos(a) * 4), vz = z + Math.round(Math.sin(a) * 4); for (let y = h + th - 3; y > h + th - 3 - (2 + Math.floor(rng() * 4)); y--) if (!setIf(vx, y, vz, B.VINE, leaves)) break; }
  } else if (kind === 'palm') {
    const th = 6 + Math.floor(rng() * 2); trunk(x, z, h, th, B.JUNGLE_LOG, logs);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { setIf(x + dx, h + th, z + dz, B.JUNGLE_LEAVES, leaves); setIf(x + dx * 2, h + th, z + dz * 2, B.JUNGLE_LEAVES, leaves); setIf(x + dx * 3, h + th - 1, z + dz * 3, B.JUNGLE_LEAVES, leaves); }
    setIf(x, h + th + 1, z, B.JUNGLE_LEAVES, leaves);
  } else {
    // oak, and the swamp oak: wider, lower, with vines
    const swamp = kind === 'swamp';
    const th = swamp ? 4 + Math.floor(rng() * 2) : 4 + Math.floor(rng() * 3); trunk(x, z, h, th, B.LOG, logs);
    const R = swamp ? 3 : 2;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) for (let dy = -2; dy <= 1; dy++) {
      const r = Math.abs(dx) + Math.abs(dz) + Math.abs(dy + 0.5);
      if (r > R + 1.6 || (dy === 1 && Math.abs(dx) + Math.abs(dz) > 1)) continue;
      if (rng() > 0.08) setIf(x + dx, h + th + dy, z + dz, B.LEAVES, leaves);
    }
    if (swamp) for (let k = 0; k < 5; k++) { const vx = x + (rng() < .5 ? -R : R), vz = z + Math.floor(rng() * (2 * R + 1)) - R; for (let y = h + th - 2; y > h + th - 5; y--) if (!setIf(vx, y, vz, B.VINE, leaves)) break; }
  }
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
  const ground = v.style.ground;
  // flat disc
  for (let x = v.cx - v.r - 2; x <= v.cx + v.r + 2; x++) for (let z = v.cz - v.r - 2; z <= v.cz + v.r + 2; z++) {
    if (x < 0 || z < 0 || x >= W || z >= D) continue;
    if (Math.hypot(x - v.cx, z - v.cz) > v.r + 2 || occupied[x + z * W] === 3) continue;
    const top = v.id === 'ashfield' && rng() < 0.04 ? B.DIRT : ground;
    flatten(x, z, 1, 1, GROUND, top);
  }
  // plaza + well
  const P = v.plaza, px0 = v.cx - (P >> 1), pz0 = v.cz - (P >> 1);
  for (let x = px0; x < px0 + P; x++) for (let z = pz0; z < pz0 + P; z++) { flatten(x, z, 1, 1, GROUND, v.plazaBlock); }
  reserve(px0, pz0, P, P, 1);
  for (let x = v.cx - 1; x <= v.cx + 1; x++) for (let z = v.cz - 1; z <= v.cz + 1; z++) {
    if (x === v.cx && z === v.cz) { data[idx(x, GROUND, z)] = B.WATER; data[idx(x, GROUND - 1, z)] = B.WATER; }
    else data[idx(x, STAND, z)] = v.id === 'ashfield' ? B.SANDSTONE : v.biome === 'badlands' ? B.TERRACOTTA : B.STONE_BRICK;
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
    const wall = kind === 'townhall' ? (v.id === 'ashfield' ? B.CUT_SANDSTONE : v.id === 'greenhollow' ? B.PLASTER : v.id === 'ironridge' ? B.WHITE_TERRACOTTA : B.STONE_BRICK) : kind === 'forge' || kind === 'guard' ? (v.id === 'ashfield' ? B.SANDSTONE : B.COBBLE) : v.walls[Math.floor(rng() * v.walls.length)];
    const rec = building({ id: v.id + '_' + kind, vid: v.id, kind, name: kind === 'tavern' ? TAVERN_NAMES[v.id] : kind === 'post' ? PAPER_HOUSE[v.id] : nm, x: lot.x, z: lot.z, w: lot.w, d: lot.d, wallH: v.id === 'ashfield' ? 4 : wallH, wall, roof: v.roofs[Math.floor(rng() * v.roofs.length)], roofShape: kind === 'townhall' && v.style.roofShape === 'gable' ? 'hip' : v.style.roofShape, corner: v.style.corner, door: lot.door, floor: kind === 'forge' || kind === 'guard' ? B.COBBLE : B.PLANKS, trim: kind === 'townhall' ? v.style.trim : null, ground });
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
    const rec = building({ id: v.id + '_house' + n, vid: v.id, kind: 'house', name: v.name + ' house ' + n, x: lot.x, z: lot.z, w: lot.w, d: lot.d, wall: v.walls[Math.floor(rng() * v.walls.length)], roof: v.roofs[Math.floor(rng() * v.roofs.length)], roofShape: v.style.roofShape === 'gable' && rng() < 0.3 ? 'hip' : v.style.roofShape, corner: v.style.corner, door: lot.door, ground });
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
  // biomes: each settlement's land around it, warped so the borders wander; a mountain range, a lake and a jungle
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    let bio;
    const lk = ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2;
    const md = Math.hypot(x - MOUNTAIN.x, (z - MOUNTAIN.z) * 1.1);
    if (lk < 1.35) bio = 'lake';
    else if (md < MOUNTAIN.r * 0.8) bio = 'mountain';
    else {
      let best = null, bd = 1e9;
      for (const v of VILLAGES) { const dd = Math.hypot(x - v.cx, z - v.cz) + (noise(x / 26 + v.cx, z / 26 + 7) - 0.5) * 60; if (dd < bd) { bd = dd; best = v; } }
      bio = best.biome;
      if (bd > 70 && z > 238 && x < 136) bio = 'jungle';
      else if (z < 30 + noise(x / 18, 3) * 14 && bio !== 'badlands') bio = 'snow';
    }
    biomeMap[x + z * W] = BIOMES.indexOf(bio);
  }
  // terrain: hills between settlements shaped by the biome, the mountain to the north-east
  const AMP = { meadow: 6, snow: 10, badlands: 4, swamp: 1.2, desert: 3, jungle: 8, mountain: 8, lake: 0 };
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    const bio = BIOMES[biomeMap[x + z * W]];
    let near = 1e9;
    for (const v of VILLAGES) near = Math.min(near, Math.hypot(x - v.cx, z - v.cz) - v.r);
    const fade = Math.max(0, Math.min(1, (near - 4) / 18));
    const amp = AMP[bio];
    let h = GROUND + Math.max(0, Math.round((noise(x / 21, z / 21) * amp + noise(x / 7 + 50, z / 7) * 2 - amp * 0.45) * fade));
    if (bio === 'badlands') { const m = noise(x / 15 + 200, z / 15 + 20); if (m > 0.58) h = Math.max(h, GROUND + Math.round((5 + (m - 0.58) * 30) * fade)); }
    if (bio === 'desert') h += Math.round(noise(x / 9 + 300, z / 9) * 2.2 * fade);
    const mdd = Math.hypot(x - MOUNTAIN.x, (z - MOUNTAIN.z) * 1.1);
    if (mdd < MOUNTAIN.r) h = Math.max(h, GROUND + Math.round((1 - mdd / MOUNTAIN.r) * MOUNTAIN.h + noise(x / 4, z / 4) * 3));
    const hd = Math.hypot(x - SP(80), z - SP(6));
    if (hd < 22) h = Math.max(h, GROUND + Math.round((1 - hd / 22) * 12 + noise(x / 4 + 9, z / 4) * 1.5));
    h = Math.min(h, H - 8);
    let top = GROUND_OF[bio], sub = B.DIRT;
    if (bio === 'desert') sub = B.SANDSTONE;
    if (bio === 'badlands') sub = 'band';
    if (bio === 'snow' && h > GROUND + 7) top = B.SNOW;
    if (bio === 'mountain') { top = h > GROUND + 20 ? B.SNOW : h > GROUND + 9 ? B.STONE : B.GRASS; if (top === B.STONE) sub = B.STONE; }
    if (bio === 'swamp' && fade > 0.5 && noise(x / 6 + 400, z / 6) > 0.64) { fillColumn(x, z, GROUND - 1, B.MUD); data[idx(x, GROUND, z)] = B.WATER; heights[x + z * W] = GROUND; occupied[x + z * W] = 3; continue; }
    if (bio === 'swamp' && noise(x / 5 + 90, z / 5) > 0.7) top = B.MUD;
    fillColumn(x, z, h, top, sub);
  }
  // the lake, with sandy shores
  for (let x = LAKE.x - LAKE.rx - 3; x <= LAKE.x + LAKE.rx + 3; x++) for (let z = LAKE.z - LAKE.rz - 3; z <= LAKE.z + LAKE.rz + 3; z++) {
    if (x < 0 || z < 0 || x >= W || z >= D) continue;
    const lk = ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2 + (noise(x / 5, z / 5 + 60) - 0.5) * 0.25;
    if (lk < 1) { const deep = Math.max(1, Math.round((1 - lk) * 5)); for (let y = 1; y < H; y++) data[idx(x, y, z)] = y < GROUND - deep - 1 ? B.STONE : y < GROUND - deep ? B.SAND : y < GROUND ? B.WATER : 0; heights[x + z * W] = GROUND - deep; occupied[x + z * W] = 3; }
    else if (lk < 1.35) flatten(x, z, 1, 1, GROUND, B.SAND);
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
  drawRoad(SP(172), SP(68), SP(172), SP(160), B.PATH); // the river road between the mine town and the trading town
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
  quarry(hv, SP(82), SP(14), 9, 5, rng);
  const qa = siteAt(af, 250, 13, 9); quarry(af, qa[0], qa[1], 13, 9, rng, true);
  // Rivergate: fishing pier and clay banks
  riverWorks(rg, rng);
  // clay pits for the brick and terracotta towns
  { const p1 = siteAt(ir, 200, 9, 7); clayPit(ir, p1[0], p1[1], 9, 7, B.TERRACOTTA, 'Red Clay Pit'); }
  { const p2 = siteAt(af, 120, 9, 7); clayPit(af, p2[0], p2[1], 9, 7, B.CLAY, 'Mud Flats'); }
  // Greenhollow sheep pen
  const pp = siteAt(gh, 330, 9, 7); pen(gh, pp[0], pp[1]);
  // trees and forests by biome; each tree is a renewable wood node owned by the nearest village
  // [chance in open land, chance in a forest patch, tree kinds]
  const FLORA = { meadow: [0.006, 0.07, ['oak', 'oak', 'birch']], snow: [0.02, 0.09, ['spruce']], badlands: [0.002, 0.015, ['dead', 'oak']], swamp: [0.01, 0.06, ['swamp', 'swamp', 'oak']],
    desert: [0.004, 0.004, ['cactus']], jungle: [0.03, 0.09, ['jungle', 'oak', 'jungle', 'palm']], mountain: [0.008, 0.04, ['spruce', 'spruce', 'oak']], lake: [0.003, 0.01, ['palm', 'birch']] };
  const oasis = { x: VBY.ashfield.cx - 26, z: VBY.ashfield.cz + 44 };
  for (let x = 2; x < W - 3; x++) for (let z = 2; z < D - 3; z++) {
    if (occupied[x + z * W]) continue;
    let near = false;
    for (let dx = -2; dx <= 3 && !near; dx++) for (let dz = -2; dz <= 3; dz++) { const o = occupied[(x + dx) + (z + dz) * W]; if (o && o !== 4) { near = true; break; } }
    if (near) continue;
    let inVillage = false; for (const v of VILLAGES) if (Math.hypot(x - v.cx, z - v.cz) < v.r + 3) inVillage = true;
    if (inVillage) continue;
    const bio = BIOMES[biomeMap[x + z * W]];
    const F = FLORA[bio];
    const patch = noise(x / 11 + 500, z / 11 + 500) > 0.62;
    let p = patch ? F[1] : F[0];
    let kind = F[2][Math.floor(rng() * F[2].length)];
    // a palm oasis in the desert gives Ashfield its timber
    if (Math.hypot(x - oasis.x, z - oasis.z) < 14) { p = 0.08; kind = rng() < 0.6 ? 'palm' : 'oak'; }
    if (rng() >= p) continue;
    if (kind === 'jungle' && (occupied[(x + 1) + z * W] || occupied[x + (z + 1) * W])) kind = 'oak';
    let nv = null, nd = 1e9; for (const v of VILLAGES) { const d = Math.hypot(x - v.cx, z - v.cz); if (d < nd) { nd = d; nv = v; } }
    const blocks = tree(x, z, rng, kind);
    if (!blocks) continue;
    const big = kind === 'jungle' ? 3 : 2;
    for (let dx = -2; dx <= big; dx++) for (let dz = -2; dz <= big; dz++) if (x + dx >= 0 && z + dz >= 0 && x + dx < W && z + dz < D && !occupied[x + dx + (z + dz) * W]) occupied[x + dx + (z + dz) * W] = 4;
    if (kind === 'cactus') continue; // cacti are scenery, not timber
    const spots = kind === 'jungle' ? [[x + 2, z], [x - 1, z], [x, z + 2], [x, z - 1]] : [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]];
    const dead = kind === 'dead';
    addNode({ vid: nv.id, type: 'wood', spots, blocks, max: dead ? 6 : kind === 'jungle' ? 30 : 12, regen: dead ? 0.4 : 1.6, mode: 'remove', dist: nd });
  }
  // an oasis pond
  for (let x = oasis.x - 3; x <= oasis.x + 3; x++) for (let z = oasis.z - 2; z <= oasis.z + 2; z++) if (Math.hypot(x - oasis.x, (z - oasis.z) * 1.4) < 3.2 && !occupied[x + z * W]) { flatten(x, z, 1, 1, GROUND - 1, B.SAND); data[idx(x, GROUND, z)] = B.WATER; occupied[x + z * W] = 3; }
  // ground cover: flowers and grass in the meadows, reeds by the water, dead bushes in the dry lands
  for (let x = 1; x < W - 1; x++) for (let z = 1; z < D - 1; z++) {
    if (occupied[x + z * W]) continue;
    let inVillage = false; for (const v of VILLAGES) if (Math.hypot(x - v.cx, z - v.cz) < v.r + 4) { inVillage = true; break; }
    if (inVillage) continue;
    const h = topSolid(x, z); if (h < 0 || h >= H - 2 || data[idx(x, h + 1, z)]) continue;
    const g = data[idx(x, h, z)], bio = BIOMES[biomeMap[x + z * W]], r = rng();
    let wet = false; for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (get(x + a, h, z + c) === B.WATER || get(x + a, h - 1, z + c) === B.WATER) wet = true;
    let deco = 0;
    if (wet && (g === B.GRASS || g === B.SWAMP_GRASS || g === B.SAND || g === B.MUD) && r < 0.35) deco = B.REEDS;
    else if (g === B.GRASS && bio === 'meadow') deco = r < 0.05 ? B.RED_FLOWER : r < 0.1 ? B.YELLOW_FLOWER : r < 0.22 ? B.TALL_GRASS : 0;
    else if (g === B.GRASS && (bio === 'jungle' || bio === 'mountain')) deco = r < 0.18 ? B.TALL_GRASS : r < 0.2 ? B.RED_FLOWER : 0;
    else if (g === B.SWAMP_GRASS) deco = r < 0.12 ? B.TALL_GRASS : 0;
    else if ((g === B.SAND || g === B.RED_SAND) && (bio === 'desert' || bio === 'badlands')) deco = r < 0.02 ? B.DEAD_BUSH : 0;
    if (deco) data[idx(x, h + 1, z)] = deco;
  }
  // leisure places near each village: the nearest forest edge and riverbank
  for (const v of VILLAGES) {
    const trees = nodes.filter(n => n.type === 'wood' && n.vid === v.id).sort((a, b) => a.dist - b.dist).slice(0, 6);
    if (trees.length) addPlace({ id: v.id + '_forest', vid: v.id, kind: 'forest', name: 'Woods near ' + v.name, spots: trees.map(t => t.spots[0]), entry: trees[0].spots[0], center: trees[0].spots[0] });
    const bank = [];
    for (let z = v.cz - 40; z <= v.cz + 40; z += 6) { if (z < 0 || z >= D) continue; const bx = riverX(z) - 4; if (Math.abs(bx - v.cx) < 60) bank.push([bx, z]); }
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
  const x0 = v.cx - 1, zMouth = v.cz - v.r + 1, zTop = zMouth - 40, G1 = zTop + 6, G2 = zTop + 16;
  const ore = { iron: [], coal: [], gold: [] }, spots = [];
  const cut = (x, z) => { data[idx(x, GROUND, z)] = B.STONE; for (let y = STAND; y < STAND + 3; y++) data[idx(x, y, z)] = 0; occupied[x + z * W] = 1; };
  for (let z = zTop; z <= zMouth; z++) for (let x = x0; x <= x0 + 1; x++) { cut(x, z); if (z < zMouth - 4) spots.push([x, z]); }
  for (const gz of [G1, G2]) for (let x = x0 - 12; x <= x0 + 13; x++) for (let z = gz; z <= gz + 1; z++) { cut(x, z); spots.push([x, z]); }
  // timber supports + lights
  for (let z = zTop + 2; z < zMouth - 2; z += 5) { if (data[idx(x0, STAND + 3, z)]) for (let x = x0; x <= x0 + 1; x++) data[idx(x, STAND + 3, z)] = B.PLANKS; data[idx(x0 - 1, STAND + 1, z)] = data[idx(x0 - 1, STAND + 1, z)] ? B.TORCH : 0; }
  for (const gz of [G1, G2]) for (const x of [x0 - 10, x0 - 4, x0 + 5, x0 + 11]) if (data[idx(x, STAND + 1, gz - 1)]) data[idx(x, STAND + 1, gz - 1)] = B.TORCH;
  // ore in the walls
  for (let x = x0 - 13; x <= x0 + 14; x++) for (let z = zTop - 1; z <= zMouth; z++) for (let y = STAND; y <= STAND + 2; y++) {
    const b = data[idx(x, y, z)];
    if (b !== B.STONE && b !== B.DIRT) continue;
    let air = false;
    for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(x + a, y, z + c) && data[idx(x + a, y, z + c)] === 0 && occupied[(x + a) + (z + c) * W] === 1) air = true;
    if (!air) continue;
    const r = rng();
    const deep = z < zTop + 10;
    if (deep && r < 0.05) { data[idx(x, y, z)] = B.GOLD_ORE; ore.gold.push([x, y, z, B.GOLD_ORE]); }
    else if (r < 0.2) { data[idx(x, y, z)] = B.ORE; ore.iron.push([x, y, z, B.ORE]); }
    else if (r < 0.34) { data[idx(x, y, z)] = B.COAL_ORE; ore.coal.push([x, y, z, B.COAL_ORE]); }
  }
  for (const x of [x0 - 1, x0 + 2]) for (let y = STAND; y < STAND + 3; y++) data[idx(x, y, zMouth)] = B.LOG;
  for (let x = x0 - 1; x <= x0 + 2; x++) data[idx(x, STAND + 3, zMouth)] = B.PLANKS;
  addPlace({ id: v.id + '_mine', vid: v.id, kind: 'mine', name: 'The Deep Seam', spots, entry: [x0, zMouth + 1], center: [x0, zTop + 12] });
  addNode({ vid: v.id, type: 'iron', place: v.id + '_mine', spots: spots.slice(), blocks: ore.iron, max: ore.iron.length * 2, regen: 2, mode: 'swap', swap: B.STONE });
  addNode({ vid: v.id, type: 'coal', place: v.id + '_mine', spots: spots.slice(), blocks: ore.coal, max: ore.coal.length * 2, regen: 2, mode: 'swap', swap: B.STONE });
  addNode({ vid: v.id, type: 'gold', place: v.id + '_mine', spots: spots.filter(s => s[1] < zTop + 12), blocks: ore.gold, max: Math.max(2, ore.gold.length), regen: 0.08, mode: 'swap', swap: B.STONE });
  const stone = [];
  for (let x = x0 - 13; x <= x0 + 14; x++) for (let z = zTop + 4; z <= zTop + 19; z++) if (data[idx(x, STAND, z)] === B.STONE && occupied[x + z * W] !== 1) { let air = false; for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (data[idx(x + a, STAND, z + c)] === 0) air = true; if (air) stone.push([x, STAND, z, B.STONE]); }
  addNode({ vid: v.id, type: 'stone', place: v.id + '_mine', spots: spots.slice(), blocks: stone.slice(0, 60), max: 240, regen: 60, mode: 'remove' });
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
  // a quarry face keeps giving: new stone is cut deeper into the hill as the old face is used
  addNode({ vid: v.id, type: 'stone', place: v.id + '_quarry', spots, blocks, max: Math.max(150, blocks.length * 3), regen: 60, mode: 'remove' });
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
// a clay pit: diggers take the coloured clay and it slowly seeps back
function clayPit(v, x0, z0, w, d, block, name) {
  const blocks = [], spots = [];
  flatten(x0 - 1, z0 - 1, w + 2, d + 2, GROUND);
  for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) {
    const edge = x === x0 || x === x0 + w - 1 || z === z0 || z === z0 + d - 1;
    if (edge) { spots.push([x, z]); continue; }
    data[idx(x, GROUND, z)] = block; blocks.push([x, GROUND, z, block]);
  }
  reserve(x0, z0, w, d, 1);
  addPlace({ id: v.id + '_claypits', vid: v.id, kind: 'claypits', name, spots, entry: [x0 - 1, z0 + (d >> 1)], center: [x0 + (w >> 1), z0 + (d >> 1)] });
  addNode({ vid: v.id, type: 'clay', place: v.id + '_claypits', spots, blocks, max: blocks.length * 3, regen: 8, mode: 'swap', swap: B.MUD });
  pathTo([x0 - 1, z0 + (d >> 1)], v.cx, v.cz, B.PATH);
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
const AREA_K = (W * D) / (208 * 208); // search budgets were tuned on the old map
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
  let n = 0; maxNodes = Math.round((maxNodes || 6000) * AREA_K);
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
// ---------- the master plan ----------
// The generator lays out every settlement fully built. A new world then un-builds most of it: each building
// of the plan becomes a blueprint that villagers construct block by block when their village needs it.
// Deterministic: every viewer derives the same camp and the same blueprints from the same seed.
const plan = {};
function groundOf(vid) { return VBY[vid] ? VBY[vid].style.ground : B.GRASS; }
function unbuildRegion(id, vid, kind, name, x0, z0, x1, z1, keepPaths, emptyTop) {
  const blocks = [];
  for (let y = GROUND - 1; y < H; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (!inb(x, y, z)) continue;
    const i = idx(x, y, z), cur = data[i];
    let empty;
    if (y < GROUND) empty = cur === B.WATER ? B.DIRT : cur;
    else if (y === GROUND) empty = keepPaths && cur === B.PATH ? B.PATH : (emptyTop || groundOf(vid));
    else empty = 0;
    if (cur === empty) continue;
    blocks.push([x, y, z, cur]);
    data[i] = empty;
  }
  // build order: foundation first, then walls course by course, roof last; within a course, sweep around the centre
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  blocks.sort((a, b) => (a[1] - b[1]) || (Math.atan2(a[2] - cz, a[0] - cx) - Math.atan2(b[2] - cz, b[0] - cx)));
  plan[id] = { id, vid, kind, name, lot: { x: x0, z: z0, w: x1 - x0 + 1, d: z1 - z0 + 1 }, blocks };
  return plan[id];
}
// keep: ids of buildings that stand on day one. Returns the plan.
function unbuild(keep) {
  const K = new Set(keep || []);
  for (const k in plan) delete plan[k];
  generating = true;
  for (const b of buildings) {
    if (K.has(b.id)) continue;
    unbuildRegion(b.id, b.vid, b.kind, b.name, b.x - 1, b.z - 1, b.x + b.w, b.z + b.d, true);
    // the doorstep path belongs to the camp
    if (b.entry && inb(b.entry[0], GROUND, b.entry[1])) data[idx(b.entry[0], GROUND, b.entry[1])] = B.PATH;
  }
  // the square: paving, well, stalls and lamps come later; the camp has a trampled clearing and a fire pit
  for (const v of VILLAGES) {
    const id = v.id + '_square';
    if (K.has(id)) continue;
    const P = v.plaza, px0 = v.cx - (P >> 1), pz0 = v.cz - (P >> 1);
    unbuildRegion(id, v.id, 'square', v.name + ' Market Square', px0 - 1, pz0 - 1, px0 + P, pz0 + P, false, B.PATH);
    data[idx(v.cx, STAND, v.cz)] = B.COBBLE; data[idx(v.cx, STAND + 1, v.cz)] = B.TORCH;
  }
  generating = false;
  torches.length = 0;
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) if (data[idx(x, y, z)] === B.TORCH) torches.push([x, y, z]);
  computeLight();
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) computeStandColumn(x, z);
  // places inside planned buildings: stand on the empty lot until it is built
  for (const id in plan) {
    const p = places[id]; if (!p) continue;
    const L = plan[id].lot; const spots = [];
    for (let i = L.x + 1; i < L.x + L.w - 1; i++) for (let k = L.z + 1; k < L.z + L.d - 1; k++) if (standY[i + k * W] >= 0) spots.push([i, k]);
    if (spots.length) p.spots = spots;
  }
  base = data.slice();
  return plan;
}
// lots for growth beyond the plan: further out as the settlement grows, clearing trees in the way
function findGrowthLot(vid, w, d, ring) {
  const v = VBY[vid]; if (!v) return null;
  for (const R of [v.r + 8, v.r + 14 + (ring || 0), v.r + 22 + (ring || 0), v.r + 30 + (ring || 0)]) {
    let best = null, bs = 1e9;
    for (let x = v.cx - R; x <= v.cx + R - w; x += 1) for (let z = v.cz - R; z <= v.cz + R - d; z += 1) {
      const mx = x + w / 2, mz = z + d / 2; const dist = Math.hypot(mx - v.cx, mz - v.cz);
      if (dist > R || dist < 6) continue;
      if (x < 2 || z < 2 || x + w > W - 2 || z + d > D - 2) continue;
      let ok = true;
      for (let i = x - 1; i <= x + w && ok; i++) for (let k = z - 1; k <= z + d; k++) {
        const o = occupied[i + k * W];
        if (o && o !== 4) { ok = false; break; }
        const h = heights[i + k * W]; if (h < GROUND || h > GROUND + 2) { ok = false; break; }
        if (data[idx(i, GROUND, k)] === B.WATER || data[idx(i, GROUND, k)] === B.FARMLAND) { ok = false; break; }
      }
      if (!ok) continue;
      // prefer lots near a road and near the centre
      const s = dist + (data[idx(x + (w >> 1), GROUND, z + d + 1)] === B.PATH ? -3 : 0);
      if (s < bs) { bs = s; best = { x, z, w, d }; }
    }
    if (best) {
      reserve(best.x, best.z, w, d, 1);
      const dx = v.cx - (best.x + w / 2), dz = v.cz - (best.z + d / 2);
      best.door = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : (dz > 0 ? 'S' : 'N');
      return best;
    }
  }
  return null;
}
function topBlockColor(x, z) { const y = topSolidAny(x, z); return [y, data[idx(x, y, z)]]; }
function topSolidAny(x, z) { for (let y = H - 1; y >= 0; y--) { const b = data[idx(x, y, z)]; if (b && b !== B.TORCH) return y; } return 0; }

const World = {
  W, H, D, GROUND, STAND, BLOCKS, B, data, light, standY, idx, inb, get, set, isSolid, isOpaque, onChange, edits,
  applyEdits, syncEdits, clearEdits, generate, places, buildings, torches, lots, nodes, roadCells, findPath, nearestWalkable, standAt,
  los, raycast, lightAt, placeAt, villageAt, mulberry32, building, furnish, computeLight, findLot, flatten, reserve, topBlockColor,
  VILLAGES, VBY, CROSS, riverX, registerNode, roofCells, BIOMES, biomeAt, groundAt, LAKE, MOUNTAIN, get base() { return base; }, plan, unbuild, findGrowthLot, groundOf, occupied: () => occupied, heights: () => heights,
};
if (typeof module !== 'undefined' && module.exports) module.exports = World; else root.World = World;
})(typeof window !== 'undefined' ? window : globalThis);
