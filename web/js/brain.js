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
