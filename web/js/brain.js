/* AI CRAFT - brain.js
   The block brain: a brain silhouette built from grass-topped dirt cubes.
   One voxel model drives every form of the mark: the 3D loading/hero mark, static snapshots
   (favicon, top bar) and the SVG export in tools/brand.js. All textures are drawn in code. */
(function (root) {
'use strict';
const AV = root.AV = root.AV || {};
const Brain = AV.Brain = {};

// ---------- voxel model (deterministic, solid) ----------
// returns [x, y, z, kind] with kind: 'g' surface cube (grass on top), 'd' dirt, 's' stone stem
Brain.voxels = function () {
  if (Brain._vox) return Brain._vox;
  const inHemi = (x, y, z) => {
    for (const side of [-1, 1]) {
      const cx = side * 5.4;
      const nx = (x - cx) / 6.6, ny = (y - 0.4) / 7.0, nz = z / 9.6;
      // flatter underside, a fuller frontal lobe, temporal lobes bulging low
      const under = y < -2 ? 0.12 * (-2 - y) / 4 : 0;
      const temporal = y < -1 && y > -5 && z > -3 && z < 5 && Math.abs(x) > 6 ? 0.1 : 0;
      if (nx * nx + ny * ny + nz * nz < 1 - under + temporal) return side;
    }
    return 0;
  };
  const solid = new Map();
  const key = (x, y, z) => x + ',' + y + ',' + z;
  for (let x = -12; x <= 12; x++) for (let y = -6; y <= 8; y++) for (let z = -10; z <= 10; z++) {
    // longitudinal fissure: an open groove on top, joined underneath
    if (Math.abs(x) < 1.5) { if (y > -3 || !inHemi(x > 0 ? 2 : -2, y, z)) continue; solid.set(key(x, y, z), [x, y, z, 'b']); continue; }
    if (!inHemi(x, y, z)) continue;
    solid.set(key(x, y, z), [x, y, z]);
  }
  // folds: one-block grooves cut into the upper surface so the dirt shows like terraces
  const depthFromTop = (x, y, z) => { let d = 0; while (solid.has(key(x, y + d + 1, z))) d++; return d; };
  for (const [k, v] of [...solid]) {
    const [x, y, z] = v;
    const top = depthFromTop(x, y, z);
    if (top > 0) continue;
    const ax = Math.abs(x);
    const fold = Math.sin(z * 0.78 + Math.sin(ax * 0.5) * 1.4) + 0.55 * Math.sin(ax * 0.9 + z * 0.25);
    const central = Math.abs(z - 0.5 + (ax - 6) * 0.35) < 0.55; // central sulcus
    if ((Math.abs(fold) < 0.28 && ax > 1 && ax < 11) || (central && y > 0)) { solid.delete(k); if (Math.abs(fold) < 0.16 && y > 1) solid.delete(key(x, y - 1, z)); }
  }
  // lateral fissure along each side
  for (const [k, v] of [...solid]) { const [x, y, z] = v; if (Math.abs(x) >= 9 && Math.abs(y + 1.2 - z * 0.15) < 0.6 && z > -2 && z < 8 && !solid.has(key(x + Math.sign(x), y, z))) solid.delete(k); }
  // cerebellum under the back
  for (let x = -6; x <= 6; x++) for (let y = -7; y <= -3; y++) for (let z = -10; z <= -5; z++) {
    if (Math.abs(x) < 1) continue;
    const d = (x * x) / 30 + ((y + 4.8) ** 2) / 5 + ((z + 7.6) ** 2) / 7;
    if (d < 1 && !solid.has(key(x, y, z))) solid.set(key(x, y, z), [x, y, z, 'c']);
  }
  const out = [];
  for (const v of solid.values()) {
    const [x, y, z] = v;
    // hidden cubes are never drawn
    const nb = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].every(([a, b, c]) => solid.has(key(x + a, y + b, z + c)));
    if (nb) continue;
    out.push([x, y, z, v[3] === 'b' || solid.has(key(x, y + 1, z)) ? 'd' : 'g']);
  }
  // stone stem
  for (let y = -10; y <= -5; y++) for (let x = -1; x <= 1; x++) for (let z = -5; z <= -3; z++) if (x * x + (z + 4) ** 2 <= 2 && !solid.has(key(x, y, z))) out.push([x, y, z, 's']);
  Brain._vox = out;
  return out;
};
Brain.count = () => Brain.voxels().length;

// ---------- textures (original, procedural) ----------
function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function tex(draw, seed) {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
  const g = cv.getContext('2d'); const r = rng(seed);
  draw(g, r);
  return cv;
}
const px = (g, x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
const GRASS = ['#5f9e37', '#6fb043', '#7cc24d', '#63a63c', '#86c955'];
const DIRT = ['#7b5434', '#6a462a', '#8a6140', '#5d3d24', '#946a46'];
const STONE = ['#8a8a86', '#7a7a76', '#969691', '#6e6e6a'];
Brain.textures = function () {
  if (Brain._tex) return Brain._tex;
  const top = tex((g, r) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, GRASS[Math.floor(r() * GRASS.length)]); }, 11);
  const dirt = tex((g, r) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, DIRT[Math.floor(r() * DIRT.length)]); for (let i = 0; i < 4; i++) px(g, Math.floor(r() * 16), Math.floor(r() * 16), '#9a9a94'); }, 22);
  const side = tex((g, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, DIRT[Math.floor(r() * DIRT.length)]);
    for (let x = 0; x < 16; x++) { const d = 3 + Math.floor(r() * 3); for (let y = 0; y < d; y++) px(g, x, y, GRASS[Math.floor(r() * 3)]); if (r() < 0.35) px(g, x, d, GRASS[0]); }
  }, 33);
  const stone = tex((g, r) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, STONE[Math.floor(r() * STONE.length)]); }, 44);
  const plank = tex((g, r) => { const P = ['#b8894f', '#a97c46', '#c4955a', '#b08250']; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const seam = y % 4 === 3; const joint = x === ((y >> 2) * 5 + 3) % 16; px(g, x, y, seam ? '#7d5a30' : joint ? '#8f6a3b' : P[Math.floor(r() * P.length)]); } }, 55);
  // dark versions for large surfaces that carry text
  const dark = (cv, f, tint) => { const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d'); g.drawImage(cv, 0, 0); g.fillStyle = tint; g.globalAlpha = f; g.fillRect(0, 0, 16, 16); return c; };
  const soil = dark(dirt, 0.84, '#14100b');
  const slab = dark(stone, 0.78, '#2a2925');
  Brain._tex = { top, dirt, side, stone, plank, soil, slab };
  return Brain._tex;
};

// ---------- 3D mark ----------
// opts: { assembled, orbit, onPick(id), onHover(id), still (no rotation), angle, preserve }
Brain.mount = function (canvas, opts) {
  opts = opts || {};
  const THREE = root.THREE;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: !!opts.preserve });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(26, 1, 1, 500);
  cam.position.set(0, 38, 60); cam.lookAt(0, -1, 0);
  scene.add(new THREE.HemisphereLight('#fff8e8', '#55503f', 0.95));
  const dl = new THREE.DirectionalLight('#fff4dc', 0.55); dl.position.set(-30, 50, 40); scene.add(dl);
  const T = Brain.textures();
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return new THREE.MeshLambertMaterial({ map: t }); };
  const mTop = mk(T.top), mSide = mk(T.side), mDirt = mk(T.dirt), mStone = mk(T.stone);
  const vox = Brain.voxels();
  const groups = { g: [], d: [], s: [] };
  vox.forEach((v, i) => groups[v[3] === 'g' ? 'g' : v[3] === 's' ? 's' : 'd'].push(i));
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const meshes = [];
  const mkInst = (list, mats) => { const m = new THREE.InstancedMesh(geo, mats, list.length); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.userData.list = list; meshes.push(m); return m; };
  const group = new THREE.Group(); scene.add(group);
  // box face order: +x, -x, +y, -y, +z, -z
  group.add(mkInst(groups.g, [mSide, mSide, mTop, mDirt, mSide, mSide]));
  group.add(mkInst(groups.d, mDirt));
  group.add(mkInst(groups.s, mStone));
  group.rotation.y = opts.angle !== undefined ? opts.angle : -0.24;
  const N = vox.length;
  const home = new Float32Array(N * 3), from = new Float32Array(N * 3), delay = new Float32Array(N), glow = new Float32Array(N);
  const R0 = rng(7);
  for (let i = 0; i < N; i++) {
    const [x, y, z] = vox[i];
    home[i * 3] = x; home[i * 3 + 1] = y; home[i * 3 + 2] = z;
    const a = R0() * Math.PI * 2, rr = 36 + R0() * 40;
    from[i * 3] = Math.cos(a) * rr; from[i * 3 + 1] = 30 + R0() * 30; from[i * 3 + 2] = Math.sin(a) * rr;
    delay[i] = ((y + 11) / 19) * 0.9 + R0() * 0.35; // cubes drop in bottom-up, like building a hill
  }
  const dummy = new THREE.Object3D(); const col = new THREE.Color();
  const st = { t0: performance.now(), assemble: opts.assembled ? 0 : 2.4, hover: 0, hoverT: 0, orbit: [], dead: false, spin: 0, pulse: 0 };
  const orbitG = new THREE.Group(); scene.add(orbitG);
  function setOrbit(agents) {
    for (const o of st.orbit) { orbitG.remove(o.sp); o.sp.material.map.dispose(); o.sp.material.dispose(); }
    st.orbit = [];
    agents.slice(0, 30).forEach((a, i) => {
      const cv = AV.Render && AV.Render.faceCanvas ? AV.Render.faceCanvas(a, 4) : null; if (!cv) return;
      const tx = new THREE.CanvasTexture(cv); tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false }));
      sp.scale.set(2.4, 2.4, 1); sp.userData.agentId = a.id;
      const ring = i % 3;
      st.orbit.push({ sp, a: (i / Math.min(30, agents.length)) * Math.PI * 6 + ring, r: 17 + ring * 4, tilt: [0.18, -0.25, 0.08][ring], speed: [0.16, -0.11, 0.08][ring] });
      orbitG.add(sp);
    });
  }
  const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2(-9, -9);
  canvas.addEventListener('pointermove', (e) => { const b = canvas.getBoundingClientRect(); mouse.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); st.hoverT = 1; });
  canvas.addEventListener('pointerleave', () => { st.hoverT = 0; mouse.set(-9, -9); canvas.style.cursor = ''; if (opts.onHover) opts.onHover(null); });
  canvas.addEventListener('click', () => { if (!opts.onPick) return; ray.setFromCamera(mouse, cam); const hit = ray.intersectObjects(orbitG.children)[0]; if (hit) opts.onPick(hit.object.userData.agentId); });
  function size() {
    const w = canvas.clientWidth || canvas.width || 300, h = canvas.clientHeight || canvas.height || 300;
    if (canvas.width !== Math.round(w * r.getPixelRatio()) || canvas.height !== Math.round(h * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  }
  const reduce = root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function draw(now) {
    size();
    const t = (now - st.t0) / 1000;
    st.hover += (st.hoverT - st.hover) * 0.06;
    if (!opts.still && !reduce) st.spin += 0.0016 + st.hover * 0.001;
    if (!opts.still) { group.rotation.y = (opts.angle !== undefined ? opts.angle : -0.24) + Math.sin(st.spin) * 0.5; }
    const pulseAge = (now - st.pulse) / 1000;
    for (const m of meshes) {
      const list = m.userData.list;
      for (let j = 0; j < list.length; j++) {
        const i = list[j];
        let k = st.assemble ? Math.min(1, Math.max(0, (t - delay[i]) / 0.55)) : 1;
        const kk = k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
        const bounce = k > 0.6 && k < 1 ? Math.sin((k - 0.6) / 0.4 * Math.PI) * 0.25 : 0;
        dummy.position.set(from[i * 3] + (home[i * 3] - from[i * 3]) * kk, from[i * 3 + 1] + (home[i * 3 + 1] - from[i * 3 + 1]) * kk + bounce, from[i * 3 + 2] + (home[i * 3 + 2] - from[i * 3 + 2]) * kk);
        const s = k <= 0 ? 0.0001 : 0.98;
        dummy.scale.set(s, s, s); dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix(); m.setMatrixAt(j, dummy.matrix);
        glow[i] *= 0.93;
        const wave = pulseAge < 0.8 ? Math.max(0, 0.22 - Math.abs(home[i * 3 + 2] / 10 - (pulseAge * 2.6 - 1)) * 0.6) : 0;
        const g = Math.min(0.3, glow[i] + wave);
        col.setRGB(0.86 + g * 0.45, 0.86 + g * 0.5, 0.86 + g * 0.2); m.setColorAt(j, col);
      }
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    const spread = 0.35 + st.hover * 0.65;
    for (const o of st.orbit) {
      o.a += (reduce ? 0 : o.speed) * 0.016 * (0.6 + st.hover);
      const rr = o.r * (0.75 + spread * 0.35);
      o.sp.position.set(Math.cos(o.a) * rr, Math.sin(o.a) * rr * o.tilt + 2, Math.sin(o.a) * rr);
      o.sp.material.opacity = 0.3 + st.hover * 0.7;
    }
    if (opts.orbit && st.hover > 0.2 && mouse.x > -2) {
      ray.setFromCamera(mouse, cam);
      const hit = ray.intersectObjects(orbitG.children)[0];
      canvas.style.cursor = hit ? 'pointer' : '';
      if (opts.onHover) opts.onHover(hit ? hit.object.userData.agentId : null);
    }
    r.render(scene, cam);
  }
  function loop(now) { if (st.dead) return; requestAnimationFrame(loop); if (!canvas.isConnected || (canvas.offsetParent === null && !opts.offscreen)) return; draw(now); }
  if (!opts.manual) requestAnimationFrame(loop);
  return {
    setOrbit,
    draw: () => draw(performance.now()),
    fire(n) { for (let k = 0; k < (n || 6); k++) glow[Math.floor(Math.random() * N)] = 0.35; },
    pulse() { st.pulse = performance.now(); },
    snapshot(type) { draw(performance.now()); return canvas.toDataURL(type || 'image/png'); },
    destroy() { st.dead = true; r.dispose(); },
  };
};

// ---------- the hero brain: big, alive, wired to the world ----------
// Every flash is a thought travelling over the cortex. fire() is called for each real decision,
// memory or event from the simulation; the brain also idles with small sparks at the current decision rate.
// opts: { onPick(id), onHover(id) }
const KIND_COL = { decision: '#d6ff7a', belief: '#ff9d3c', rumor: '#ff9d3c', social: '#5fd8ff', convo: '#5fd8ff', score: '#5fd8ff', work: '#ffd23c', build: '#ffd23c', trade: '#ffd23c', politics: '#c99bff', crime: '#ff4a3c', idle: '#7fe3ff' };
Brain.KIND_COL = KIND_COL;
Brain.hero = function (canvas, opts) {
  opts = opts || {};
  const THREE = root.THREE;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 1, 600);
  cam.position.set(0, 30, 52); cam.lookAt(0, -1.5, 0);
  scene.add(new THREE.HemisphereLight('#fff8e8', '#4b4636', 0.9));
  const key = new THREE.DirectionalLight('#fff1d6', 0.62); key.position.set(-30, 46, 40); scene.add(key);
  const rim = new THREE.DirectionalLight('#b9f66d', 0.45); rim.position.set(30, 10, -50); scene.add(rim);
  const T = Brain.textures();
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return new THREE.MeshLambertMaterial({ map: t }); };
  const mTop = mk(T.top), mSide = mk(T.side), mDirt = mk(T.dirt), mStone = mk(T.stone);
  const vox = Brain.voxels(); const N = vox.length;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const rig = new THREE.Group(); scene.add(rig);
  const spin = new THREE.Group(); rig.add(spin);
  spin.position.y = 1.2;
  const lists = { g: [], d: [], s: [] };
  vox.forEach((v, i) => lists[v[3] === 'g' ? 'g' : v[3] === 's' ? 's' : 'd'].push(i));
  const meshes = [];
  const inst = (list, mats) => { const m = new THREE.InstancedMesh(geo, mats, list.length); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.userData.list = list; meshes.push(m); spin.add(m); return m; };
  inst(lists.g, [mSide, mSide, mTop, mDirt, mSide, mSide]); inst(lists.d, mDirt); inst(lists.s, mStone);
  // positions, assembly paths and the neighbour graph the sparks run along
  const home = new Float32Array(N * 3), from = new Float32Array(N * 3), delay = new Float32Array(N), lift = new Float32Array(N);
  const R0 = rng(19); const idx = new Map();
  for (let i = 0; i < N; i++) {
    const [x, y, z] = vox[i]; home[i * 3] = x; home[i * 3 + 1] = y; home[i * 3 + 2] = z; idx.set(x + ',' + y + ',' + z, i);
    const a = R0() * Math.PI * 2, rr = 40 + R0() * 50;
    from[i * 3] = Math.cos(a) * rr; from[i * 3 + 1] = -40 - R0() * 40; from[i * 3 + 2] = Math.sin(a) * rr;
    delay[i] = ((y + 11) / 19) * 1.3 + R0() * 0.5;
  }
  const nb = []; for (let i = 0; i < N; i++) { const [x, y, z] = vox[i]; const L = []; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { if (!dx && !dy && !dz) continue; const j = idx.get((x + dx) + ',' + (y + dy) + ',' + (z + dz)); if (j !== undefined && vox[j][3] !== 's') L.push(j); } nb.push(L); }
  const cortex = []; for (let i = 0; i < N; i++) if (vox[i][3] !== 's' && vox[i][1] > -3) cortex.push(i);
  // glow: additive cubes laid over lit voxels
  const GP = 520;
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92 });
  const glowMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.06, 1.06, 1.06), glowMat, GP); glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); spin.add(glowMesh);
  { const c0 = new THREE.Color(0, 0, 0); for (let q = 0; q < GP; q++) glowMesh.setColorAt(q, c0); }
  const glowCol = new Float32Array(N * 3), glowAmt = new Float32Array(N);
  const tmpC = new THREE.Color();
  function light(i, amt, hex) { tmpC.set(hex); const k = Math.max(glowAmt[i], amt); const w = amt / Math.max(0.001, k); glowCol[i * 3] = glowCol[i * 3] * (1 - w) + tmpC.r * w; glowCol[i * 3 + 1] = glowCol[i * 3 + 1] * (1 - w) + tmpC.g * w; glowCol[i * 3 + 2] = glowCol[i * 3 + 2] * (1 - w) + tmpC.b * w; glowAmt[i] = k; }
  // halo behind the brain
  const hc = document.createElement('canvas'); hc.width = hc.height = 128; const hg = hc.getContext('2d'); const grd = hg.createRadialGradient(64, 64, 4, 64, 64, 64); grd.addColorStop(0, 'rgba(185,246,109,0.55)'); grd.addColorStop(0.45, 'rgba(120,190,70,0.18)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); hg.fillStyle = grd; hg.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 })); halo.scale.set(62, 62, 1); halo.position.set(0, 1, -14); scene.add(halo);
  // thought blocks drifting up around the brain
  const PN = 34; const parts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), [mSide, mSide, mTop, mDirt, mSide, mSide], PN); parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(parts);
  const P = []; for (let k = 0; k < PN; k++) P.push({ a: R0() * Math.PI * 2, r: 13 + R0() * 16, y: -14 + R0() * 34, v: 0.8 + R0() * 1.6, rot: R0() * 6, rs: (R0() - 0.5) * 2 });
  // villagers circling the mind
  const orbitG = new THREE.Group(); scene.add(orbitG);
  let orbit = []; const byAgent = {};
  function setOrbit(agents) {
    for (const o of orbit) { orbitG.remove(o.sp); o.sp.material.map.dispose(); o.sp.material.dispose(); }
    orbit = []; for (const k in byAgent) delete byAgent[k];
    const n = Math.min(36, agents.length);
    agents.slice(0, n).forEach((a, i) => {
      const cv = AV.Render && AV.Render.faceCanvas ? AV.Render.faceCanvas(a, 4) : null; if (!cv) return;
      const tx = new THREE.CanvasTexture(cv); tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false }));
      sp.scale.set(2, 2, 1); sp.userData.agentId = a.id;
      const ring = i % 3;
      const o = { sp, a: (i / n) * Math.PI * 6 + ring * 0.7, r: [19, 23, 27][ring], tilt: [0.16, -0.22, 0.08][ring], speed: [0.11, -0.08, 0.06][ring], pop: 0 };
      orbit.push(o); byAgent[a.id] = o; orbitG.add(sp);
    });
  }
  // synapse lines: from a villager's face into the cortex
  const lines = []; for (let k = 0; k < 8; k++) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#b9f66d', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); l.frustumCulled = false; scene.add(l); lines.push({ l, age: 9, o: null, i: 0 }); }
  const sparks = [];
  const gc = document.createElement('canvas'); gc.width = gc.height = 64; const gg = gc.getContext('2d'); const gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
  const gtex = new THREE.CanvasTexture(gc);
  const heads = []; for (let k = 0; k < 16; k++) { const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 })); h.scale.set(5, 5, 1); spin.add(h); heads.push(h); }
  const st = { t0: performance.now(), last: performance.now(), hover: 0, hoverT: 0, mx: 0, my: 0, tx: 0, ty: 0, beat: -9, beatK: 0, dead: false, idleAcc: 0, rate: 1.5 };
  const v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
  const worldOf = (i, out) => out.set(home[i * 3], home[i * 3 + 1], home[i * 3 + 2]).applyMatrix4(spin.matrixWorld);
  function facing(i) { worldOf(i, v3); v4.copy(cam.position).sub(v3).normalize(); const nx = home[i * 3], ny = home[i * 3 + 1] - 0.5, nz = home[i * 3 + 2]; v3.set(nx, ny, nz).normalize().transformDirection(spin.matrixWorld); return v3.dot(v4); }
  function pickStart(visible) { for (let k = 0; k < 40; k++) { const i = cortex[Math.floor(Math.random() * cortex.length)]; if (!visible || facing(i) > 0.35) return i; } return cortex[Math.floor(Math.random() * cortex.length)]; }
  function fire(o) {
    o = o || {};
    const col = KIND_COL[o.kind] || KIND_COL.decision;
    const start = o.start !== undefined ? o.start : pickStart(!!o.visible);
    const len = o.len || (o.agent ? 22 + Math.floor(Math.random() * 14) : 7 + Math.floor(Math.random() * 8));
    // walk the surface, keeping roughly the same heading, never crossing itself
    const path = [start]; const seen = new Set(path); let dir = null;
    for (let k = 1; k < len; k++) {
      const cur = path[path.length - 1]; let best = -1, bs = -9;
      for (const j of nb[cur]) { if (seen.has(j)) continue; const dx = home[j * 3] - home[cur * 3], dy = home[j * 3 + 1] - home[cur * 3 + 1], dz = home[j * 3 + 2] - home[cur * 3 + 2]; const d = Math.hypot(dx, dy, dz); let sc = Math.random() * 0.8 + (dy > 0 ? 0.05 : 0); if (dir) sc += (dx * dir[0] + dy * dir[1] + dz * dir[2]) / d; if (sc > bs) { bs = sc; best = j; } }
      if (best < 0) break; dir = [home[best * 3] - home[cur * 3], home[best * 3 + 1] - home[cur * 3 + 1], home[best * 3 + 2] - home[cur * 3 + 2]]; path.push(best); seen.add(best);
    }
    const sp = { path, k: 0, speed: o.agent ? 26 : 34, col, big: !!o.agent };
    sparks.push(sp); if (sparks.length > 60) sparks.shift();
    if (o.agent && byAgent[o.agent]) { const L = lines.find(x => x.age > 1.2) || lines[0]; L.age = 0; L.o = byAgent[o.agent]; L.i = start; L.l.material.color.set(col); byAgent[o.agent].pop = 1; }
    return { start, end: path[path.length - 1], ms: path.length / sp.speed * 1000 };
  }
  function project(i) { worldOf(i, v3); v3.project(cam); const w = canvas.clientWidth, h = canvas.clientHeight; return { x: (v3.x + 1) / 2 * w, y: (1 - v3.y) / 2 * h }; }
  function projectAgent(id) { const o = byAgent[id]; if (!o) return null; v3.copy(o.sp.position).project(cam); return { x: (v3.x + 1) / 2 * canvas.clientWidth, y: (1 - v3.y) / 2 * canvas.clientHeight }; }
  const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2(-9, -9);
  const onMove = (e) => { const b = canvas.getBoundingClientRect(); mouse.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); st.tx = Math.max(-1, Math.min(1, mouse.x)); st.ty = Math.max(-1, Math.min(1, mouse.y)); st.hoverT = Math.abs(mouse.x) < 1.2 && Math.abs(mouse.y) < 1.2 ? 1 : 0; };
  window.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerleave', () => { st.hoverT = 0; canvas.style.cursor = ''; if (opts.onHover) opts.onHover(null); });
  canvas.addEventListener('click', () => {
    ray.setFromCamera(mouse, cam);
    const hit = ray.intersectObjects(orbitG.children)[0]; if (hit && opts.onPick) { opts.onPick(hit.object.userData.agentId); return; }
    // a click on the cortex sends a wave of thought through it
    const h2 = ray.intersectObjects(meshes)[0]; if (h2) { const m = h2.object; const i = m.userData.list[h2.instanceId]; for (let k = 0; k < 5; k++) fire({ start: i, kind: ['decision', 'social', 'work', 'belief', 'politics'][k], len: 14 + k * 3 }); st.beat = performance.now(); st.beatK = 1; }
  });
  function size() {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
    if (canvas.width !== Math.round(w * r.getPixelRatio()) || canvas.height !== Math.round(h * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.position.z = w / h < 0.9 ? 86 : 52; cam.position.y = w / h < 0.9 ? 40 : 30; cam.updateProjectionMatrix(); }
  }
  const reduce = root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dummy = new THREE.Object3D(); const col = new THREE.Color();
  let assembled = false;
  function draw(now) {
    size();
    const dt = Math.min(0.05, (now - st.last) / 1000); st.last = now;
    const t = (now - st.t0) / 1000;
    st.hover += (st.hoverT - st.hover) * Math.min(1, dt * 4);
    st.mx += (st.tx - st.mx) * Math.min(1, dt * 3); st.my += (st.ty - st.my) * Math.min(1, dt * 3);
    // slow turn, float, lean toward the pointer
    if (!reduce) spin.rotation.y += dt * (0.16 + st.hover * 0.05);
    rig.rotation.x = -st.my * 0.16 + Math.sin(t * 0.6) * 0.03; rig.rotation.z = Math.sin(t * 0.45) * 0.02; rig.rotation.y = st.mx * 0.32;
    rig.position.y = Math.sin(t * 1.1) * 0.6;
    const ba = (now - st.beat) / 1000; const bk = ba < 1 ? Math.exp(-ba * 5) * st.beatK : 0;
    rig.scale.setScalar(1 + bk * 0.04);
    halo.material.opacity = 0.42 + bk * 0.35 + Math.sin(t * 1.3) * 0.04;
    scene.updateMatrixWorld();
    // hover ripple: cubes near the pointer lift out of the surface
    const needPos = true;
    if (needPos) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      let any = false; let all = true;
      for (const m of meshes) {
        const list = m.userData.list;
        for (let j = 0; j < list.length; j++) {
          const i = list[j];
          let k = 1; if (!assembled) { k = Math.min(1, Math.max(0, (t - delay[i]) / 0.7)); if (k < 1) all = false; }
          const kk = 1 - Math.pow(1 - k, 3);
          let target = 0;
          if (st.hover > 0.01 && assembled) { worldOf(i, v3); v3.project(cam); const dx = (v3.x - mouse.x) * w / h, dy = v3.y - mouse.y; const d = Math.hypot(dx, dy); target = Math.max(0, 1 - d / 0.2) * st.hover; }
          target = Math.max(target, glowAmt[i] * 0.42);
          lift[i] += (target - lift[i]) * Math.min(1, dt * 12); if (lift[i] > 0.01) any = true;
          const L = lift[i] * 1.3; const hx = home[i * 3], hy = home[i * 3 + 1] - 0.5, hz = home[i * 3 + 2]; const hl = Math.hypot(hx, hy, hz) || 1;
          const spinA = (1 - kk) * 6;
          dummy.position.set(from[i * 3] + (home[i * 3] - from[i * 3]) * kk + hx / hl * L, from[i * 3 + 1] + (home[i * 3 + 1] - from[i * 3 + 1]) * kk + hy / hl * L, from[i * 3 + 2] + (home[i * 3 + 2] - from[i * 3 + 2]) * kk + hz / hl * L);
          dummy.rotation.set(spinA, spinA * 0.7, 0);
          const s = k <= 0 ? 0.0001 : 0.985; dummy.scale.set(s, s, s);
          dummy.updateMatrix(); m.setMatrixAt(j, dummy.matrix);
        }
        m.instanceMatrix.needsUpdate = true;
      }
      st.hadLift = any;
      if (!assembled && all) { assembled = true; if (opts.onAssembled) opts.onAssembled(); }
    }
    // idle sparks at the world's decision rate
    if (assembled && !reduce) { st.idleAcc += dt * st.rate; while (st.idleAcc >= 1) { st.idleAcc -= 1; fire({ kind: 'idle' }); } }
    // advance sparks: each step lights a cube; the head is brightest
    for (let k = sparks.length - 1; k >= 0; k--) {
      const sp = sparks[k]; const prev = Math.floor(sp.k); sp.k += dt * sp.speed;
      for (let q = prev; q <= Math.min(sp.path.length - 1, Math.floor(sp.k)); q++) { light(sp.path[q], sp.big ? 1 : 0.55, sp.col); if (sp.big && q === Math.floor(sp.k)) for (const j of nb[sp.path[q]]) if (Math.random() < 0.25) light(j, 0.35, sp.col); }
      if (sp.k >= sp.path.length + 2) sparks.splice(k, 1);
    }
    // light heads on the newest sparks
    { let h = 0; for (let k = sparks.length - 1; k >= 0 && h < heads.length; k--) { const sp = sparks[k]; const q = Math.min(sp.path.length - 1, Math.floor(sp.k)); if (sp.k > sp.path.length) continue; const i = sp.path[q]; const H = heads[h++]; const hx = home[i * 3], hy = home[i * 3 + 1] - 0.5, hz = home[i * 3 + 2]; const hl = Math.hypot(hx, hy, hz) || 1; H.position.set(hx + hx / hl * 1.2, home[i * 3 + 1] + hy / hl * 1.2, hz + hz / hl * 1.2); H.material.color.set(sp.col); H.material.opacity = sp.big ? 0.95 : 0.55; const sc = sp.big ? 7 : 4.2; H.scale.set(sc, sc, 1); } for (; h < heads.length; h++) heads[h].material.opacity = 0; }
    // heartbeat wave sweeping front to back
    if (ba < 0.9 && st.beatK > 0.75) { const front = 10 - ba * 26; for (const i of cortex) if (Math.abs(home[i * 3 + 2] - front) < 0.6 && Math.random() < 0.18) light(i, 0.32, '#b9f66d'); }
    // write the glow pool
    let g = 0;
    for (let i = 0; i < N && g < GP; i++) {
      if (glowAmt[i] < 0.06) { glowAmt[i] = 0; continue; }
      const a = glowAmt[i]; glowAmt[i] *= Math.exp(-dt * 2.6);
      { const hx = home[i * 3], hy = home[i * 3 + 1] - 0.5, hz = home[i * 3 + 2]; const hl = Math.hypot(hx, hy, hz) || 1; const L = lift[i] * 1.3; dummy.position.set(hx + hx / hl * L, home[i * 3 + 1] + hy / hl * L, hz + hz / hl * L); }
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(assembled ? Math.min(1, 0.25 + a * 1.1) : 0.0001); dummy.updateMatrix(); glowMesh.setMatrixAt(g, dummy.matrix);
      const wh = Math.max(0, a - 0.7) * 1.4; col.setRGB(Math.min(1, glowCol[i * 3] + wh), Math.min(1, glowCol[i * 3 + 1] + wh), Math.min(1, glowCol[i * 3 + 2] + wh)); glowMesh.setColorAt(g, col); g++;
    }
    for (let q = g; q < GP; q++) { dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.0001); dummy.updateMatrix(); glowMesh.setMatrixAt(q, dummy.matrix); }
    glowMesh.count = Math.max(1, g); glowMesh.instanceMatrix.needsUpdate = true; if (glowMesh.instanceColor) glowMesh.instanceColor.needsUpdate = true;
    // drifting blocks
    for (let k = 0; k < PN; k++) { const p = P[k]; p.y += dt * p.v * (reduce ? 0 : 1); p.rot += dt * p.rs; if (p.y > 22) { p.y = -14; p.a = Math.random() * Math.PI * 2; } const fade = Math.min(1, (p.y + 14) / 6, (22 - p.y) / 6); dummy.position.set(Math.cos(p.a + t * 0.05) * p.r, p.y, Math.sin(p.a + t * 0.05) * p.r); dummy.rotation.set(p.rot, p.rot * 0.6, 0); dummy.scale.setScalar(Math.max(0.0001, fade) * (assembled ? 1 : 0.0001)); dummy.updateMatrix(); parts.setMatrixAt(k, dummy.matrix); }
    parts.instanceMatrix.needsUpdate = true;
    // faces in orbit
    for (const o of orbit) {
      o.a += (reduce ? 0 : o.speed) * dt * (1 + st.hover * 0.4);
      o.sp.position.set(Math.cos(o.a) * o.r, Math.sin(o.a) * o.r * o.tilt + 1.5, Math.sin(o.a) * o.r);
      o.pop = Math.max(0, o.pop - dt * 1.2); const near = Math.max(0, Math.sin(o.a)); const s = (2.1 - near * 0.9) + o.pop * 1.4; o.sp.scale.set(s, s, 1);
      o.sp.material.opacity = assembled ? 0.92 : 0;
    }
    for (const L of lines) {
      L.age += dt; const op = L.age < 1.2 ? (1 - L.age / 1.2) * 0.9 : 0; L.l.material.opacity = op;
      if (op > 0 && L.o) { const pos = L.l.geometry.attributes.position.array; pos[0] = L.o.sp.position.x; pos[1] = L.o.sp.position.y; pos[2] = L.o.sp.position.z; worldOf(L.i, v3); pos[3] = v3.x; pos[4] = v3.y; pos[5] = v3.z; L.l.geometry.attributes.position.needsUpdate = true; }
    }
    if (st.hover > 0.2 && mouse.x > -2) {
      ray.setFromCamera(mouse, cam);
      const hit = ray.intersectObjects(orbitG.children)[0];
      canvas.style.cursor = hit ? 'pointer' : 'crosshair';
      if (opts.onHover) opts.onHover(hit ? hit.object.userData.agentId : null);
    }
    r.render(scene, cam);
  }
  function loop(now) { if (st.dead) return; requestAnimationFrame(loop); if (!canvas.isConnected || canvas.offsetParent === null) { st.last = now; return; } draw(now); }
  requestAnimationFrame(loop);
  return {
    setOrbit, fire, project, projectAgent,
    setRate(perSec) { st.rate = Math.max(0.6, Math.min(7, perSec)); },
    beat(k) { st.beat = performance.now(); st.beatK = Math.max(0.4, Math.min(1.2, k || 1)); },
    pulse() { this.beat(1); },
    destroy() { st.dead = true; window.removeEventListener('pointermove', onMove); r.dispose(); },
  };
};

// a still render of the mark, as an image (favicon, top bar, emails, README)
Brain.snapshot = function (size, angle) {
  try {
    const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    cv.style.width = size + 'px'; cv.style.height = size + 'px';
    const m = Brain.mount(cv, { assembled: true, still: true, manual: true, preserve: true, angle: angle === undefined ? -0.24 : angle });
    const url = m.snapshot();
    m.destroy();
    return url;
  } catch (e) { return ''; }
};
Brain.favicon = function (url) {
  try {
    url = url || Brain.snapshot(64);
    if (!url) return;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = url;
  } catch (e) { /* cosmetic */ }
};
// the top-bar mark: a still image that bobs on each heartbeat
// paint the materials into CSS variables so the HUD is built from the same blocks as the world
Brain.cssTextures = function () {
  try {
    const T = Brain.textures(); const st = document.documentElement.style;
    const u = (cv) => 'url(' + cv.toDataURL() + ')';
    st.setProperty('--tex-dirt', u(T.dirt)); st.setProperty('--tex-side', u(T.side)); st.setProperty('--tex-grass', u(T.top));
    st.setProperty('--tex-plank', u(T.plank)); st.setProperty('--tex-stone', u(T.slab)); st.setProperty('--tex-soil', u(T.soil));
  } catch (e) { /* plain colours remain */ }
};
Brain.mark = function (img) {
  const url = Brain.snapshot(96);
  if (url) img.src = url;
  Brain.favicon(url);
  return { beat() { img.classList.remove('beat'); void img.offsetWidth; img.classList.add('beat'); } };
};
if (typeof module !== 'undefined' && module.exports) module.exports = Brain;
})(typeof window !== 'undefined' ? window : globalThis);
