/* AI VILLAGE — world.js
   Voxel world: block registry, deterministic village generation, walk grid,
   pathfinding, line of sight, raycasting and torch light.
   Pure data, no rendering. Works in the browser and in Node (for headless tests). */
(function (root) {
'use strict';

const W = 96, H = 40, D = 96;
const GROUND = 9;          // y of the grass layer; feet stand at GROUND+1
const STAND = GROUND + 1;

// ---------- block registry ----------
// tex: [top, side, bottom] tile indices in the atlas (render.js paints them)
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
  { name: 'ore', tex: [14, 14, 14] },
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
const light = new Uint8Array(W * H * D);   // torch light 0..14
const standY = new Int16Array(W * D);      // y where feet rest, -1 = not walkable
const pathCost = new Float32Array(W * D);
const idx = (x, y, z) => (y * D + z) * W + x;
const inb = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D;
function get(x, y, z) { x |= 0; y |= 0; z |= 0; return inb(x, y, z) ? data[idx(x, y, z)] : (y < 0 ? B.STONE : 0); }
function isSolid(x, y, z) { return BLOCKS[get(Math.floor(x), Math.floor(y), Math.floor(z))].solid; }
function isOpaque(x, y, z) { return BLOCKS[get(x, y, z)].opaque; }

const listeners = [];
const edits = {};          // idx -> block id (diff from the generated world, persisted)
let generating = false;
function set(x, y, z, b, opts) {
  if (!inb(x, y, z)) return false;
  const i = idx(x, y, z);
  if (data[i] === b) return false;
  const old = data[i];
  data[i] = b;
  if (!generating) {
    edits[i] = b;
    computeStandColumn(x, z);
    for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) if (dx || dz) computeStandColumn(x + dx, z + dz);
    if (BLOCKS[old].opaque !== BLOCKS[b].opaque || BLOCKS[old].light || BLOCKS[b].light) relightAround(x, y, z);
    listeners.forEach(fn => fn(x, y, z, b, opts));
  }
  return true;
}
function onChange(fn) { listeners.push(fn); }

// ---------- seeded RNG + value noise ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeNoise(rng) {
  const G = 16, g = [];
  for (let i = 0; i < G * G; i++) g.push(rng());
  const s = t => t * t * (3 - 2 * t);
  return function (x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = s(x - xi), zf = s(z - zi);
    const v = (a, b) => g[((a % G + G) % G) + ((b % G + G) % G) * G];
    const a = v(xi, zi), b = v(xi + 1, zi), c = v(xi, zi + 1), d = v(xi + 1, zi + 1);
    return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf;
  };
}

// ---------- places ----------
const places = {};        // id -> place
const buildings = [];     // generated building records
const occupied = new Uint8Array(W * D);  // reserved cells for generation
const torches = [];       // [x,y,z]
const lots = [];          // unused lots for future construction

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

let heights = new Int16Array(W * D);
function topSolid(x, z) { for (let y = H - 1; y >= 0; y--) { const b = get(x, y, z); if (b && BLOCKS[b].solid) return y; } return -1; }

function fillColumn(x, z, h) {
  for (let y = 0; y < H; y++) {
    let b = 0;
    if (y === 0) b = B.STONE;
    else if (y < h - 2) b = B.STONE;
    else if (y < h) b = B.DIRT;
    else if (y === h) b = B.GRASS;
    data[idx(x, y, z)] = b;
  }
  heights[x + z * W] = h;
}

function flatten(x0, z0, w, d, top) {
  for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) {
    for (let y = 1; y < H; y++) {
      if (y < top - 2) data[idx(x, y, z)] = B.STONE;
      else if (y < top) data[idx(x, y, z)] = B.DIRT;
      else if (y === top) data[idx(x, y, z)] = top === GROUND ? B.GRASS : B.DIRT;
      else data[idx(x, y, z)] = 0;
    }
  }
}

// ---------- building generator ----------
const STYLES = {
  house: [[B.PLANKS, B.ROOF_TILE], [B.PLASTER, B.ROOF_TILE], [B.PLASTER, B.SLATE], [B.BRICK, B.SLATE], [B.COBBLE, B.ROOF_TILE], [B.PLANKS, B.SLATE]],
};

function building(spec) {
  // spec: {id, name, kind, x, z, w, d, wallH, wall, roof, door:'N'|'S'|'E'|'W', floor}
  const { x, z, w, d } = spec;
  const wallH = spec.wallH || 4;
  flatten(x - 1, z - 1, w + 2, d + 2, GROUND);
  const top = STAND + wallH; // first y above walls
  // floor
  for (let i = x; i < x + w; i++) for (let k = z; k < z + d; k++) data[idx(i, GROUND, k)] = spec.floor || B.PLANKS;
  // door cell
  let dx, dz;
  if (spec.door === 'S') { dx = x + (w >> 1); dz = z + d - 1; }
  if (spec.door === 'N') { dx = x + (w >> 1); dz = z; }
  if (spec.door === 'E') { dx = x + w - 1; dz = z + (d >> 1); }
  if (spec.door === 'W') { dx = x; dz = z + (d >> 1); }
  // walls
  for (let i = x; i < x + w; i++) for (let k = z; k < z + d; k++) {
    const edge = i === x || i === x + w - 1 || k === z || k === z + d - 1;
    if (!edge) continue;
    const corner = (i === x || i === x + w - 1) && (k === z || k === z + d - 1);
    for (let y = STAND; y < top; y++) {
      let b = corner ? B.LOG : spec.wall;
      const along = (k === z || k === z + d - 1) ? i - x : k - z;
      const len = (k === z || k === z + d - 1) ? w : d;
      if (!corner && y === STAND + 1 && along % 3 === 1 && along > 0 && along < len - 1) b = B.GLASS;
      if (!corner && y === STAND + 1 && wallH >= 5 && along % 3 === 1) b = B.GLASS;
      if (!corner && y === STAND + 2 && wallH >= 5 && along % 3 === 1) b = B.GLASS;
      if (y === top - 1 && !corner && wallH >= 4) b = spec.trim || b;
      data[idx(i, y, k)] = b;
    }
  }
  data[idx(dx, STAND, dz)] = B.DOOR; data[idx(dx, STAND + 1, dz)] = B.DOOR;
  // clear glass right next to door
  // roof (gabled along the longer axis, eaves overhang by one)
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
      if (t === 0 || t === L - 1) {
        for (let s = a + 1; s < b; s++) {
          const px = alongX ? x + t : x + s, pz = alongX ? z + s : z + t;
          if (inb(px, y, pz)) data[idx(px, y, pz)] = spec.wall === B.GLASS ? B.PLANKS : spec.wall;
        }
      }
    }
    if (a === b || a + 1 === b) break;
  }
  // entry outside the door
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
    for (let k = iz0 + 2; k <= iz1 - 1; k++) put(ix1 - 1, k, B.PLANKS);
    put(ix1, iz0, B.SHELF); put(ix1, iz0, B.SHELF, STAND + 1);
  } else if (kind === 'store' || kind === 'post') {
    for (let i = ix0; i <= ix1; i++) if (!nearDoor(i, iz0)) { put(i, iz0, B.SHELF); put(i, iz0, B.SHELF, STAND + 1); }
    for (let i = ix0 + 1; i < ix1; i++) put(i, iz0 + 2, B.PLANKS);
    put(ix1, iz1, B.TORCH);
    if (kind === 'post') put(ix0 + 1, iz0 + 2, B.CLOTH, STAND + 1);
  } else if (kind === 'forge') {
    put(ix0, iz0, B.OVEN); put(ix0, iz0, B.OVEN, STAND + 1); put(ix0 + 1, iz0, B.OVEN);
    put(ix0 + 2, iz0 + 2, B.STONE);
    put(ix1, iz0, B.SHELF);
  } else if (kind === 'tavern') {
    for (let k = iz0; k <= iz1; k++) if (!nearDoor(ix1, k)) put(ix1 - 1, k, B.PLANKS);
    put(ix1, iz0, B.SHELF); put(ix1, iz0, B.SHELF, STAND + 1); put(ix1, iz1, B.SHELF);
    put(ix0 + 1, iz0 + 1, B.PLANKS); put(ix0 + 1, iz1 - 1, B.PLANKS); put(ix0 + 3, iz0 + 1, B.PLANKS);
    put(ix0, iz0, B.TORCH); put(ix0, iz1, B.TORCH);
  } else if (kind === 'clinic') {
    put(ix0, iz0, B.CLOTH); put(ix0, iz0 + 2, B.CLOTH); put(ix1, iz0, B.SHELF); put(ix1, iz1, B.TORCH);
  } else if (kind === 'townhall') {
    for (let i = ix0 + 2; i <= ix1 - 2; i++) put(i, iz0 + 2, B.PLANKS);
    put(ix0, iz0, B.TORCH); put(ix1, iz0, B.TORCH); put(ix0 + 1, iz0, B.CLOTH, STAND); put(ix1 - 1, iz0, B.CLOTH);
  } else if (kind === 'guard') {
    // jail cell in the back corner
    for (let i = ix0; i <= ix0 + 3; i++) { put(i, iz0 + 3, B.FENCE); put(i, iz0 + 3, B.FENCE, STAND + 1); }
    for (let k = iz0; k <= iz0 + 3; k++) { put(ix0 + 3, k, B.FENCE); put(ix0 + 3, k, B.FENCE, STAND + 1); }
    put(ix0 + 3, iz0 + 1, B.DOOR); put(ix0 + 3, iz0 + 1, B.DOOR, STAND + 1);
    put(ix1, iz1, B.TORCH); put(ix1, iz0, B.SHELF);
    rec.jail = [ix0 + 1, iz0 + 1];
  }
}

// ---------- generation ----------
function generate(seed) {
  generating = true;
  data.fill(0); occupied.fill(0); buildings.length = 0; torches.length = 0; lots.length = 0;
  for (const k in places) delete places[k];
  const rng = mulberry32(seed || 1337);
  const noise = makeNoise(rng);
  const cx = 48, cz = 50;
  // terrain
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    const dd = Math.hypot(x - cx, z - cz);
    let h = GROUND;
    if (dd > 36) h += Math.floor((dd - 36) * 0.32 + noise(x / 9, z / 9) * 3);
    if (x < 20) h += Math.floor(noise(x / 7 + 40, z / 7) * 2.2);
    const md = Math.hypot(x - 48, (z - 5) * 1.15);
    if (md < 17) h = Math.max(h, GROUND + Math.floor((17 - md) * 0.85 + noise(x / 5, z / 5) * 2));
    fillColumn(x, z, Math.min(h, H - 6));
  }
  // river (east), banks of sand
  const riverX = z => 80 + Math.round(2 * Math.sin(z * 0.11));
  for (let z = 0; z < D; z++) {
    const rx = riverX(z);
    for (let x = rx - 4; x <= rx + 3; x++) {
      if (x < 0 || x >= W) continue;
      const inRiver = x >= rx - 2 && x <= rx + 1;
      for (let y = 1; y < H; y++) {
        let b = data[idx(x, y, z)];
        if (inRiver) { b = y < 5 ? B.STONE : y === 5 ? B.SAND : y <= 8 ? B.WATER : 0; }
        else { if (y > GROUND) b = 0; else if (y === GROUND) b = B.SAND; else if (y >= GROUND - 2) b = B.SAND; }
        data[idx(x, y, z)] = b;
      }
      heights[x + z * W] = inRiver ? 5 : GROUND;
    }
    reserve(rx - 5, z, 10, 1, 0);
  }
  // roads
  const road = (x, z) => {
    if (x < 0 || z < 0 || x >= W || z >= D) return;
    const h = topSolid(x, z);
    if (get(x, h, z) === B.WATER || h < GROUND) {           // bridge
      data[idx(x, GROUND, z)] = B.PLANKS;
      return;
    }
    for (let y = GROUND + 1; y < H; y++) if (y < GROUND + 4 || topSolid(x, z) < GROUND + 5) data[idx(x, y, z)] = 0;
    data[idx(x, GROUND, z)] = B.PATH;
    occupied[x + z * W] = 1;
  };
  for (let x = 10; x < 94; x++) { road(x, 47); road(x, 48); }
  for (let z = 18; z < 92; z++) { road(47, z); road(48, z); }
  // bridge rails
  for (let z of [46, 49]) for (let x = 0; x < W; x++) {
    const rx = riverX(46);
    if (x >= rx - 3 && x <= rx + 2) { data[idx(x, GROUND, z)] = B.PLANKS; data[idx(x, GROUND + 1, z)] = B.FENCE; }
  }
  reserve(10, 46, 84, 4, 0); reserve(46, 18, 4, 74, 0);
  // mine: open cut + tunnel into the hill
  for (let z = 1; z < 22; z++) {
    for (let x = 46; x <= 49; x++) {
      const inside = x === 47 || x === 48;
      const h = topSolid(x, z);
      if (inside) {
        data[idx(x, GROUND, z)] = z < 16 ? B.STONE : B.PATH;
        for (let y = STAND; y < STAND + 3; y++) data[idx(x, y, z)] = 0;
        if (h < STAND + 5) for (let y = STAND + 3; y < H; y++) data[idx(x, y, z)] = 0;
        else data[idx(x, STAND + 3, z)] = z % 4 === 0 ? B.PLANKS : data[idx(x, STAND + 3, z)];
      } else if (h < STAND + 5) {
        for (let y = STAND; y < H; y++) data[idx(x, y, z)] = 0;
      }
    }
  }
  // side gallery
  for (let x = 38; x <= 58; x++) for (let z = 6; z <= 7; z++) {
    data[idx(x, GROUND, z)] = B.STONE;
    for (let y = STAND; y < STAND + 3; y++) data[idx(x, y, z)] = 0;
  }
  const mineCells = [];
  for (let x = 37; x <= 59; x++) for (let z = 1; z <= 8; z++) for (let y = STAND - 1; y <= STAND + 3; y++) {
    if (data[idx(x, y, z)] === B.STONE || data[idx(x, y, z)] === B.DIRT) {
      let nearAir = false;
      for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) if (inb(x + a, y + b, z + c) && data[idx(x + a, y + b, z + c)] === 0 && y + b >= STAND) nearAir = true;
      if (nearAir && rng() < 0.22) data[idx(x, y, z)] = B.ORE;
    }
  }
  for (let x = 38; x <= 58; x++) for (let z = 6; z <= 7; z++) mineCells.push([x, z]);
  for (let z = 2; z < 15; z++) mineCells.push([47, z], [48, z]);
  // tunnel torches in niches
  for (const [x, z] of [[46, 12], [49, 8], [40, 5], [56, 8], [46, 3], [52, 5], [44, 8]]) { data[idx(x, STAND + 1, z)] = B.TORCH; torches.push([x, STAND + 1, z]); }
  // timber frame at the tunnel mouth
  let mouthZ = 15; for (let z = 21; z > 1; z--) { if (topSolid(46, z) >= STAND + 4) { mouthZ = z; break; } }
  for (const x of [46, 49]) for (let y = STAND; y < STAND + 3; y++) data[idx(x, y, mouthZ)] = B.LOG;
  for (let x = 46; x <= 49; x++) data[idx(x, STAND + 3, mouthZ)] = B.PLANKS;
  reserve(36, 0, 24, 20, 0);
  places.mine = { id: 'mine', name: 'The Mine', kind: 'mine', spots: mineCells, entry: [47, mouthZ + 2], center: [48, 8] };

  // plaza with a covered well
  for (let x = 39; x <= 57; x++) for (let z = 39; z <= 57; z++) {
    for (let y = STAND; y < H; y++) data[idx(x, y, z)] = 0;
    data[idx(x, GROUND, z)] = B.COBBLE;
  }
  reserve(38, 38, 21, 21, 0);
  for (let x = 46; x <= 49; x++) for (let z = 46; z <= 49; z++) {
    const inner = x > 46 && x < 49 && z > 46 && z < 49;
    if (inner) { data[idx(x, GROUND, z)] = B.WATER; data[idx(x, GROUND - 1, z)] = B.WATER; }
    else data[idx(x, STAND, z)] = B.COBBLE;
  }
  for (const [x, z] of [[46, 46], [49, 49]]) { data[idx(x, STAND + 1, z)] = B.FENCE; data[idx(x, STAND + 2, z)] = B.FENCE; }
  for (let x = 45; x <= 50; x++) for (let z = 45; z <= 50; z++) if (x === 45 || x === 50 || z === 45 || z === 50 || true) { if (x >= 46 && x <= 49 && z >= 46 && z <= 49) data[idx(x, STAND + 3, z)] = B.SLATE; }
  // market stalls (NW of plaza)
  const stallSpots = [];
  for (const [sx, sz] of [[41, 41], [41, 52]]) {
    for (let i = 0; i < 4; i++) data[idx(sx + i, STAND, sz)] = B.PLANKS;
    for (const i of [0, 3]) { data[idx(sx + i, STAND + 1, sz + 1)] = B.FENCE; data[idx(sx + i, STAND + 2, sz + 1)] = B.FENCE; }
    for (let i = -1; i <= 4; i++) for (let k = 0; k <= 2; k++) data[idx(sx + i, STAND + 3, sz + k)] = B.CLOTH;
    stallSpots.push([sx + 1, sz + 1], [sx + 2, sz + 1]);
  }
  places.market = { id: 'market', name: 'Market Stalls', kind: 'market', spots: stallSpots, entry: [43, 44], center: [42, 46] };
  const plazaSpots = [];
  for (let x = 40; x <= 56; x += 2) for (let z = 40; z <= 56; z += 2) {
    if (x >= 45 && x <= 50 && z >= 45 && z <= 50) continue;
    if (x >= 40 && x <= 45 && (z >= 40 && z <= 43 || z >= 51 && z <= 54)) continue;
    plazaSpots.push([x, z]);
  }
  places.plaza = { id: 'plaza', name: 'Village Square', kind: 'plaza', spots: plazaSpots, entry: [48, 44], center: [48, 44] };
  // lamp posts
  const lamp = (x, z) => {
    const h = topSolid(x, z); if (h < 0) return;
    data[idx(x, h + 1, z)] = B.FENCE; data[idx(x, h + 2, z)] = B.FENCE; data[idx(x, h + 3, z)] = B.TORCH;
    torches.push([x, h + 3, z]);
  };
  for (const [x, z] of [[39, 39], [57, 39], [39, 57], [57, 57]]) lamp(x, z);
  for (let x = 14; x < 92; x += 10) { if (Math.abs(x - 48) > 10 && Math.abs(x - riverX(48)) > 4) { lamp(x, 45); } }
  for (let z = 22; z < 92; z += 10) { if (Math.abs(z - 48) > 10) lamp(50, z); }

  // core buildings around the square
  const core = [
    { id: 'townhall', name: 'Town Hall', kind: 'townhall', x: 40, z: 26, w: 15, d: 10, wallH: 5, wall: B.BRICK, roof: B.SLATE, door: 'S', trim: B.PLASTER },
    { id: 'guard', name: 'Guard Station', kind: 'guard', x: 58, z: 28, w: 9, d: 8, wall: B.COBBLE, roof: B.SLATE, door: 'S', floor: B.COBBLE },
    { id: 'clinic', name: 'Clinic', kind: 'clinic', x: 28, z: 29, w: 9, d: 7, wall: B.PLASTER, roof: B.SLATE, door: 'E' },
    { id: 'tavern', name: 'The Crooked Lantern', kind: 'tavern', x: 60, z: 37, w: 11, d: 9, wall: B.PLANKS, roof: B.ROOF_TILE, door: 'W', wallH: 4 },
    { id: 'bakery', name: 'Bakery', kind: 'bakery', x: 60, z: 51, w: 8, d: 7, wall: B.PLASTER, roof: B.ROOF_TILE, door: 'W' },
    { id: 'store', name: 'General Store', kind: 'store', x: 28, z: 38, w: 9, d: 7, wall: B.PLASTER, roof: B.ROOF_TILE, door: 'E' },
    { id: 'forge', name: 'Forge', kind: 'forge', x: 28, z: 51, w: 9, d: 7, wall: B.COBBLE, roof: B.SLATE, door: 'E', floor: B.COBBLE },
    { id: 'post', name: 'Village Post Office', kind: 'post', x: 51, z: 60, w: 8, d: 7, wall: B.PLANKS, roof: B.SLATE, door: 'N' },
  ];
  for (const s of core) { const r = building(s); furnish(r); }
  // farm (south-east)
  const fx0 = 58, fz0 = 66, fw = 17, fd = 15;
  const farmSpots = [];
  for (let x = fx0; x < fx0 + fw; x++) for (let z = fz0; z < fz0 + fd; z++) {
    flatten(x, z, 1, 1, GROUND);
    const edge = x === fx0 || x === fx0 + fw - 1 || z === fz0 || z === fz0 + fd - 1;
    if (edge) { if (!(x === fx0 && z === fz0 + 2)) data[idx(x, STAND, z)] = B.FENCE; else data[idx(x, GROUND, z)] = B.PATH; continue; }
    if ((z - fz0) % 4 === 0) { data[idx(x, GROUND, z)] = B.WATER; continue; }
    data[idx(x, GROUND, z)] = B.FARMLAND; data[idx(x, STAND, z)] = B.CROP; farmSpots.push([x, z]);
  }
  reserve(fx0, fz0, fw, fd, 1);
  places.farm = { id: 'farm', name: 'The Fields', kind: 'farm', spots: farmSpots, entry: [fx0 - 1, fz0 + 2], center: [fx0 + 8, fz0 + 7], rect: [fx0, fz0, fw, fd] };
  // path from the main road to the farm gate
  for (let x = 49; x < fx0; x++) { flatten(x, fz0 + 2, 1, 1, GROUND); data[idx(x, GROUND, fz0 + 2)] = B.PATH; reserve(x, fz0 + 2, 1, 1, 1); }

  // empty lots kept free for villagers who save up to build something
  for (const L of [{ x: 30, z: 61, w: 6, d: 6 }, { x: 64, z: 19, w: 6, d: 6 }, { x: 38, z: 70, w: 6, d: 6 }]) { reserve(L.x, L.z, L.w, L.d, 2); flatten(L.x, L.z, L.w, L.d, GROUND); lots.push(L); }
  // houses on free lots
  const houseLots = [];
  const tries = [];
  for (let z = 6; z < 92; z += 1) for (let x = 4; x < 92; x += 1) tries.push([x, z]);
  for (let i = tries.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [tries[i], tries[j]] = [tries[j], tries[i]]; }
  for (const [x, z] of tries) {
    if (houseLots.length >= 24) break;
    const w = 6 + Math.floor(rng() * 3), d = 6 + Math.floor(rng() * 2);
    if (!isFree(x, z, w, d, 1)) continue;
    // terrain must be near flat
    let mn = 99, mx = -1;
    for (let i = x; i < x + w; i++) for (let k = z; k < z + d; k++) { const h = heights[i + k * W]; mn = Math.min(mn, h); mx = Math.max(mx, h); }
    if (mx - mn > 3 || mn < GROUND || mx > GROUND + 3) continue;
    // must be close to a road (within 9 cells of a road line)
    const roadDist = Math.min(Math.abs(x + w / 2 - 48), Math.abs(z + d / 2 - 48));
    if (roadDist > 24) continue;
    reserve(x, z, w, d, 1);
    houseLots.push({ x, z, w, d });
  }
  // free them again and actually build (reserve was only for spacing)
  let hn = 0;
  for (const lot of houseLots) {
    const toRoadX = 48 - (lot.x + lot.w / 2), toRoadZ = 48 - (lot.z + lot.d / 2);
    let door;
    if (Math.abs(toRoadX) < Math.abs(toRoadZ)) door = toRoadX > 0 ? 'E' : 'W';
    else door = toRoadZ > 0 ? 'S' : 'N';
    const st = STYLES.house[Math.floor(rng() * STYLES.house.length)];
    if (hn >= 21) continue;
    hn++;
    const r = building({ id: 'house' + hn, name: 'House ' + hn, kind: 'house', x: lot.x, z: lot.z, w: lot.w, d: lot.d, wall: st[0], roof: st[1], door });
    furnish(r);
  }
  // trees: forest to the west + scattered
  const tree = (x, z) => {
    const h = topSolid(x, z); if (get(x, h, z) !== B.GRASS) return;
    const th = 4 + Math.floor(rng() * 3);
    for (let y = h + 1; y <= h + th; y++) data[idx(x, y, z)] = B.LOG;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 1; dy++) {
      const r = Math.abs(dx) + Math.abs(dz) + Math.abs(dy + 0.5);
      if (r > 3.6 || (dy === 1 && Math.abs(dx) + Math.abs(dz) > 1)) continue;
      const px = x + dx, py = h + th + dy, pz = z + dz;
      if (inb(px, py, pz) && data[idx(px, py, pz)] === 0 && rng() > 0.08) data[idx(px, py, pz)] = B.LEAVES;
    }
  };
  const treeMask = new Uint8Array(W * D);
  for (let x = 2; x < W - 2; x++) for (let z = 2; z < D - 2; z++) {
    if (occupied[x + z * W] || treeMask[x + z * W]) continue;
    let near = false;
    for (let dx = -2; dx <= 2 && !near; dx++) for (let dz = -2; dz <= 2; dz++) if (occupied[(x + dx) + (z + dz) * W] === 1 && Math.abs(dx) + Math.abs(dz) < 3) { near = true; break; }
    if (near) continue;
    const forest = x < 22 ? 0.09 : (Math.hypot(x - 48, z - 50) > 38 ? 0.035 : 0.012);
    if (rng() < forest) { tree(x, z); for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (x + dx >= 0 && z + dz >= 0 && x + dx < W && z + dz < D) treeMask[x + dx + (z + dz) * W] = 1; }
  }
  places.forest = { id: 'forest', name: 'Westwood', kind: 'forest', spots: [[16, 30], [15, 62], [18, 46], [14, 52]], entry: [18, 48], center: [16, 46] };
  places.river = { id: 'river', name: 'Riverbank', kind: 'river', spots: [[76, 40], [75, 56], [76, 30], [75, 62]], entry: [76, 48], center: [76, 48] };

  // register buildings as places with interior spots
  for (const b of buildings) {
    places[b.id] = b;
    b.spots = [];
    b.center = [b.x + (b.w >> 1), b.z + (b.d >> 1)];
  }
  // paths from each door toward the nearest road line
  const inBuilding = (x, z) => buildings.some(b => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d);
  for (const b of buildings) {
    let [ex, ez] = b.entry;
    for (let guard = 0; guard < 60; guard++) {
      const g = get(ex, GROUND, ez);
      if (guard > 0 && (g === B.PATH || g === B.COBBLE)) break;
      if (g === B.GRASS || g === B.DIRT || g === B.SAND) data[idx(ex, GROUND, ez)] = B.PATH;
      for (let y = STAND; y < STAND + 3; y++) { const bb = get(ex, y, ez); if (bb === B.LOG || bb === B.LEAVES) data[idx(ex, y, ez)] = 0; }
      const dx = 47.5 - ex, dz = 47.5 - ez;
      if (Math.abs(dx) < 1 || Math.abs(dz) < 1) break;
      let nx = ex, nz = ez;
      if (Math.abs(dx) <= Math.abs(dz)) nx += Math.sign(dx); else nz += Math.sign(dz);
      if (inBuilding(nx, nz)) { nx = ex; nz = ez; if (Math.abs(dx) <= Math.abs(dz)) nz += Math.sign(dz); else nx += Math.sign(dx); }
      if (inBuilding(nx, nz)) break;
      ex = nx; ez = nz;
    }
  }
  // torch light + walk grid
  torches.length = 0;
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) if (data[idx(x, y, z)] === B.TORCH) torches.push([x, y, z]);
  generating = false;
  computeLight();
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) computeStandColumn(x, z);
  for (const b of buildings) {
    for (let i = b.x + 1; i < b.x + b.w - 1; i++) for (let k = b.z + 1; k < b.z + b.d - 1; k++)
      if (standY[i + k * W] === STAND && !(b.jail && i <= b.jail[0] + 1 && k <= b.jail[1] + 1)) b.spots.push([i, k]);
    if (!b.spots.length) b.spots.push(b.entry);
  }
  for (const p of Object.values(places)) {
    p.spots = p.spots.filter(([x, z]) => standY[x + z * W] >= 0);
    if (!p.spots.length) p.spots = [p.entry];
  }
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
  pathCost[x + z * W] = (g === B.PATH || g === B.COBBLE || g === B.PLANKS || g === B.STONE) ? 1 : g === B.FARMLAND ? 1.6 : 1.35;
}
// ground y under a point (for NPC feet)
function standAt(x, z) { x = Math.floor(x); z = Math.floor(z); if (x < 0 || z < 0 || x >= W || z >= D) return STAND; const s = standY[x + z * W]; return s < 0 ? STAND : s; }

// ---------- A* ----------
const openHeap = [];
const gScore = new Float32Array(W * D), fromIdx = new Int32Array(W * D), stamp = new Uint32Array(W * D), closedStamp = new Uint32Array(W * D);
let curStamp = 1;
function findPath(sx, sz, tx, tz, maxNodes) {
  sx |= 0; sz |= 0; tx |= 0; tz |= 0;
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
      if (dx && dz) { // no corner cutting
        const a = standY[cx + dx + cz * W], b = standY[cx + (cz + dz) * W];
        if (a !== cy || b !== cy || ny !== cy) continue;
      }
      // headroom when stepping up
      if (ny > cy && BLOCKS[get(cx, cy + 2, cz)].solid) continue;
      const step = (dx && dz ? 1.414 : 1) * pathCost[ni] + (ny !== cy ? 0.5 : 0);
      const g = gScore[cur] + step;
      if (stamp[ni] !== curStamp || g < gScore[ni]) {
        stamp[ni] = curStamp; gScore[ni] = g; fromIdx[ni] = cur;
        push([g + h(ni), ni]);
      }
    }
  }
  if (stamp[goal] !== curStamp) return null;
  const out = [];
  for (let c = goal; c !== -1; c = fromIdx[c]) out.push([c % W, (c / W) | 0]);
  out.reverse();
  return out;
}
function push(item) { openHeap.push(item); let i = openHeap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (openHeap[p][0] <= item[0]) break; openHeap[i] = openHeap[p]; i = p; } openHeap[i] = item; }
function pop() { const top = openHeap[0], last = openHeap.pop(); if (openHeap.length) { let i = 0; const n = openHeap.length; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < n && openHeap[l][0] < (m === i ? last[0] : openHeap[m][0])) m = l; if (r < n && openHeap[r][0] < (m === i ? last[0] : openHeap[m][0])) m = r; if (m === i) break; openHeap[i] = openHeap[m]; i = m; } openHeap[i] = last; } return top; }
function nearestWalkable(x, z) {
  for (let r = 0; r < 8; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
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
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isOpaque(Math.floor(ax + dx * t), Math.floor(ay + dy * t), Math.floor(az + dz * t))) return false;
  }
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

// ---------- torch light (flood fill) ----------
function computeLight() {
  light.fill(0);
  const q = [];
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) {
    const L = BLOCKS[data[idx(x, y, z)]].light; if (L) { light[idx(x, y, z)] = L; q.push(idx(x, y, z)); }
  }
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
  // recompute torch light in a box around the change, seeded by sources inside and lit cells on the rim
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
  for (const k in map) { data[+k] = map[k]; edits[k] = map[k]; }
  generating = false;
  computeLight();
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) computeStandColumn(x, z);
}
function clearEdits() { for (const k in edits) delete edits[k]; }

function findLot(w, d) {
  if (lots.length) return lots.shift();
  let best = null, bd = 1e9;
  for (let z = 8; z < D - 8; z++) for (let x = 6; x < W - 8; x++) {
    if (!isFree(x, z, w, d, 1)) continue;
    let mn = 99, mx = -1;
    for (let i = x; i < x + w; i++) for (let k = z; k < z + d; k++) { const h = heights[i + k * W]; mn = Math.min(mn, h); mx = Math.max(mx, h); }
    if (mx - mn > 2 || mn < GROUND || mx > GROUND + 2) continue;
    if (x > 70) continue; // keep new shops on the village side of the river
    const dist = Math.hypot(x + w / 2 - 48, z + d / 2 - 48);
    if (dist < bd) { bd = dist; best = { x, z, w, d }; }
  }
  if (best) reserve(best.x, best.z, best.w, best.d, 1);
  return best;
}
function placeAt(x, z) { // which building (if any) contains a cell
  for (const b of buildings) if (x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d) return b;
  return null;
}

const World = {
  W, H, D, GROUND, STAND, BLOCKS, B, data, light, standY, idx, inb,
  get, set, isSolid, isOpaque, onChange, edits, applyEdits, clearEdits,
  generate, places, buildings, torches, lots, findPath, nearestWalkable, standAt, los, raycast, lightAt, placeAt,
  mulberry32, building, furnish, computeLight, findLot, flatten, reserve,
};
if (typeof module !== 'undefined' && module.exports) module.exports = World; else root.World = World;
})(typeof window !== 'undefined' ? window : globalThis);
