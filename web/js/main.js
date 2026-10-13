/* AI CRAFT \u2014 main.js
   Boot (loading brain \u2192 shared world), the render loop, first-person physics, spectator camera,
   block interaction (sent to the host), input, synthesized audio, other visitors and the language-model provider. */
(function (root) {
'use strict';
const AV = root.AV, W = root.World, THREE = root.THREE;
AV.THREE = THREE;
const Sim = AV.Sim, R = AV.Render, UI = AV.UI, Net = AV.Net, Brain = AV.Brain;
const $ = id => document.getElementById(id);
const S = () => Sim.S();

// ---------------- preferences (this browser only) ----------------
const settings = (() => { try { return JSON.parse(Net.pref.get('settings') || '{}'); } catch (e) { return {}; } })();

// ---------------- language model ----------------
const LLM = AV.LLM = {
  enabled: settings.llm !== false, auto: !!settings.auto, provider: null,
  available() { return !!this.provider; },
  ready() { return this.enabled && !!this.provider; },
  disable() { this.provider = null; },
  json(prompt, o) { return this.provider.json(prompt, o || {}); },
  text(prompt, o) { return this.provider.text(prompt, o || {}); },
};
(async () => {
  try {
    if (root.claude && typeof root.claude.use === 'function') {
      const sample = await root.claude.use('sample');
      if (sample) LLM.provider = {
        json: (p, o) => sample.json(p, { modelTier: o.tier || 'quick', cache: false }),
        text: async (p, o) => (await sample(p, { modelTier: o.tier || 'quick', cache: false, onText: o.onText ? ({ text }) => o.onText(text) : undefined })).text,
      };
    }
  } catch (e) { /* stays on the behavior engine */ }
})();

// ---------------- game state ----------------
const G = AV.Game = {
  mode: 'watch', page: 'home', slot: 0, selected: null, follow: null, showThoughts: true, heat: null, sound: settings.sound !== false,
  hotbar: [W.B.PLANKS, W.B.COBBLE, W.B.STONE_BRICK, W.B.GLASS, W.B.PLASTER, W.B.THATCH, W.B.LOG, W.B.TORCH, W.B.WOOL],
  dialogNpc: null,
};
G.saveSettings = () => Net.pref.set('settings', JSON.stringify({ llm: LLM.enabled, auto: LLM.auto, sound: G.sound }));

// ---------------- loading screen ----------------
Brain.cssTextures();
const loadBrain = Brain.mount($('loadBrain'), {});
const steps = [];
function loadStep(label, frac) {
  const ul = $('loadSteps');
  const key = label.split(' \u00B7 ')[0];
  let li = steps.find(s => s.key === key);
  if (!li) { for (const s of steps) { s.el.className = 'ok'; } const el = document.createElement('li'); ul.appendChild(el); li = { key, el }; steps.push(li); if (steps.length > 5) { steps.shift().el.remove(); } }
  li.el.textContent = label; li.el.className = 'cur';
  if (frac !== undefined) $('loadBar').firstElementChild.style.width = Math.round(frac * 100) + '%';
  loadBrain.fire(30);
}

// ---------------- three.js ----------------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#9fc4d8', 60, 145);
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 900);
camera.rotation.order = 'YXZ';
window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });

let hv = null;
const P = { x: W.VILLAGES[0].cx + 0.5, y: W.STAND, z: W.VILLAGES[0].cz + 6.5, vx: 0, vy: 0, vz: 0, yaw: Math.PI, pitch: 0, onGround: false, phase: 0, crouch: false };
const cam = { x: P.x + 10, y: 28, z: P.z + 24, yaw: 0.35, pitch: -0.55 };
G.P = P; G.cam = cam; G.camera = camera;
G.viewPos = () => (G.mode === 'play' ? { x: P.x, z: P.z } : { x: cam.x - Math.sin(cam.yaw) * 14, z: cam.z - Math.cos(cam.yaw) * 14 });

let booted = false;
(async function boot() {
  const t0 = performance.now();
  try { await Net.boot(loadStep); }
  catch (e) { console.error(e); loadStep('COULD NOT REACH THE SHARED WORLD \u00B7 STARTING A PRIVATE PREVIEW', 0.4); Net.transport = 'none'; }
  if (!S()) { Sim.newWorld(); Net.meta = { worldId: S().worldId, clock: { epoch: Date.now(), t0: S().t } }; Net.transport = 'none'; Net.role = 'booting'; }
  // spawn on Highvale square, on open ground
  hv = W.places.highvale_plaza;
  if (hv) { const sp = hv.spots.find(([x, z]) => !W.isSolid(x + 0.5, W.standAt(x + 0.5, z + 0.5) + 0.5, z + 0.5)) || hv.center; P.x = sp[0] + 0.5; P.z = sp[1] + 0.5; P.y = W.standAt(P.x, P.z); cam.x = P.x + 10; cam.z = P.z + 24; }
  G.cinemaFocus();
  cam.x = cine.x + 12; cam.z = cine.z + 18;
  // world meshes, nearest to the homepage camera first
  R.init(scene); R.lights(scene);
  UI.init();
  G.selectSlot(0);
  AV.Pages.init();
  let frac = 0;
  while (frac < 1) { frac = R.buildSome(40, cam.x, cam.z); loadStep('CONNECTING ' + S().agents.filter(a => !a.left).length + ' AGENTS', 0.9 + frac * 0.08); await new Promise(r => setTimeout(r, 0)); if (performance.now() - t0 > 9000) break; }
  // the brain needs a moment to assemble: at least 2.4 s on screen
  const wait = Math.max(0, 2400 - (performance.now() - t0));
  await new Promise(r => setTimeout(r, wait));
  loadStep('WORLD ONLINE', 1);
  setTimeout(() => { $('loading').classList.add('done'); setTimeout(() => { loadBrain.destroy(); $('loading').remove(); }, 600); }, 450);
  booted = true;
  // whatever happened while connecting, the world must keep its clock
  if (Net.rescue) { Net.rescue(); setInterval(() => Net.rescue(), 5000); }
  const hash = (location.hash || '').replace('#', '');
  AV.Pages.go(['home', 'world', 'minds', 'villages', 'network', 'history'].includes(hash) ? hash : 'home');
  setTimeout(sinceLastVisit, 1400);
  Net.on('event', onWorldEvent);
  Net.on('role', (r) => { if (r === 'host') UI.toast('This tab is now hosting the shared simulation.', 3500); });
  setInterval(llmAutoThink, 45000);
  setInterval(() => { Net.pref.set('lastT', String(Math.floor(S().t))); }, 15000);
})();

// ---------------- since the last visit ----------------
function sinceLastVisit() {
  const s = S(); const last = +Net.pref.get('lastT') || 0;
  if (!last || s.t - last < 60) return;
  const hist = s.history.filter(h => h.t > last && !h.minor);
  const evs = s.feed.filter(e => e.t > last && (e.imp || 0) >= 0.75).slice(0, 8);
  const items = hist.slice(-8).concat(evs).sort((a, b) => a.t - b.t).slice(-9);
  if (!items.length) return;
  const mins = s.t - last;
  UI.showAway(items, 'The world kept living: ' + (mins >= 1440 ? (mins / 1440).toFixed(1) + ' world days' : Math.round(mins / 60) + ' world hours') + ' passed since you were last here. Some of what happened:');
}
function onWorldEvent(e) {
  if (!e || !booted) return;
  if (e.type === 'WORLD_EVENT' || e.type === 'TIER_UP' || (e.type === 'ELECTION_RESULT' && (e.imp || 0) >= 0.8)) UI.banner(e.headline || e.type.replace(/_/g, ' '), e.text);
}
// with "the model thinks for featured minds" on, the host asks the model for one real decision now and then
async function llmAutoThink() {
  if (!LLM.ready() || !LLM.auto || (Net.role !== 'host' && Net.role !== 'local')) return;
  const s = S();
  const pool = s.agents.filter(a => (a.core || a.featured) && !a.left && !a.sleeping && !a.convo && a.jailUntil <= s.t);
  const a = pool[Math.floor(Math.random() * pool.length)]; if (!a) return;
  a.thinking = 'llm';
  try { const prompt = Sim.buildDecisionPrompt(a); const j = await LLM.json(prompt, { tier: 'quick' }); const r = Sim.applyDecision(a, j); s.llmLog.push({ t: s.t, kind: 'decision', agent: a.id, prompt, response: j, result: r.ok ? 'accepted' : 'rejected: ' + r.error }); }
  catch (e) { if (e && (e.code === 'not_granted' || e.code === 'sampling_disabled')) LLM.disable(); }
  a.thinking = null;
}

// ---------------- modes ----------------
G.setMode = function (m) {
  if (AV.Pages.current !== 'world') AV.Pages.go('world');
  if (m === G.mode) { if (m === 'play') lockPointer(); return; }
  const prev = G.mode; G.mode = m;
  document.body.classList.toggle('play', m === 'play');
  document.body.classList.toggle('watch', m === 'watch');
  if (m === 'watch') {
    if (document.pointerLockElement) document.exitPointerLock();
    if (prev === 'play') { cam.x = P.x + Math.sin(P.yaw) * 6; cam.z = P.z + Math.cos(P.yaw) * 6; cam.y = P.y + 9; cam.yaw = P.yaw; cam.pitch = -0.6; }
  } else if (m === 'play') {
    G.follow = null;
    if (!Net.canWrite && Net.shared()) UI.toast('You are a viewer: walk around freely, but residents only hear Contributors.', 4000);
    lockPointer();
  }
  UI.feedSig = '';
  if (!$('inspector').hidden) { $('inspTabs')._sig = ''; UI.renderInspector(); }
  updateHint();
};
document.body.classList.add('watch');
G.selectSlot = function (i) { G.slot = i; document.querySelectorAll('.slot').forEach((s, k) => s.classList.toggle('sel', k === i)); };
G.toggleHeat = function () {
  G.heat = G.heat === null ? 'social' : G.heat === 'social' ? 'crime' : null;
  R.heat.visible = !!G.heat;
  if (G.heat) { R.drawHeat(G.heat, S().heat[G.heat]); UI.toast(G.heat === 'social' ? 'Heatmap: where people talk' : 'Heatmap: crime, arguments and protests'); }
};
G.onModal = function (open) { if (open && document.pointerLockElement) document.exitPointerLock(); };
G.onDialog = function (open, a) {
  if (open) { G.dialogNpc = a.id; if (document.pointerLockElement) document.exitPointerLock(); }
  else { G.dialogNpc = null; if (G.mode === 'play' && AV.Pages.current === 'world') lockPointer(); }
};
G.lookAt = function (a) { G.lookAtPoint(a.x, a.z, a.y); };
G.lookAtPoint = function (x, z, y) {
  if (G.mode !== 'watch') return;
  y = y || W.STAND;
  cam.x = x + 7; cam.z = z + 9; cam.y = y + 9;
  const dx = x - cam.x, dz = z - cam.z, dy = y + 1 - cam.y;
  cam.yaw = Math.atan2(-dx, -dz); cam.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  R.buildSome(30, x, z);
};
// camera jump: from any page straight to a resident, following them
G.jumpTo = function (id) {
  const a = S().byId[id]; if (!a) return;
  AV.Pages.go('world');
  if (G.mode !== 'watch') G.setMode('watch');
  G.lookAt(a); G.follow = id; UI.openInspector(id);
};
G.askDecision = async function (a, out) {
  if (!LLM.ready()) { UI.toast(LLM.available() ? 'Turn AI conversations on in the ? menu first.' : 'A language model is not available in this view. The prompt is shown in LOG > Prompts.'); UI.openDev('prompts'); return; }
  if (out) out.textContent = 'Asking the language model to think as ' + a.name + '...';
  a.thinking = 'llm';
  const prompt = Sim.buildDecisionPrompt(a);
  try {
    const j = await LLM.json(prompt, { tier: 'quick' });
    const r = await Net.rpc('decision', [a.id, j]);
    const msg = r && r.ok ? a.name + ' will ' + String(j.action).replace(/_/g, ' ') + (j.target ? ' (' + Sim.nameOf(j.target) + ')' : '') + ': ' + (j.reason || '') : 'The engine rejected the plan (' + ((r && r.error) || 'no answer') + '). ' + a.name + ' keeps their own.';
    if (out) out.textContent = msg; UI.toast(r && r.ok ? 'The language model decided for ' + a.name + ' (labelled AI REASONING)' : 'Plan rejected by the engine', 3000);
  } catch (e) {
    if (e && (e.code === 'not_granted' || e.code === 'sampling_disabled')) LLM.disable();
    if (out) out.textContent = 'The language model could not answer (' + (e && e.code || 'error') + '). ' + a.name + ' keeps their own plan.';
  }
  a.thinking = null;
};
G.toggleSound = function () { G.sound = !G.sound; Audio.setOn(G.sound); G.saveSettings(); };
G.onPage = function (p) {
  document.body.classList.toggle('paged', p !== 'world' && p !== 'home');
  document.body.classList.toggle('home', p === 'home');
  if (p !== 'home' && p !== 'world') UI.clearLabels();
  if (p !== 'world' && document.pointerLockElement) document.exitPointerLock();
  if (p === 'world') { Audio.init(); UI.feedSig = ''; }
};

// ---------------- input ----------------
const keys = {};
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
function typing() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA'); }
function lockPointer() { if (isTouch || G.mode !== 'play' || UI.modalOpen() || G.dialogNpc || AV.Pages.current !== 'world') return; const c = renderer.domElement; if (c.requestPointerLock) { try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* optional */ } } }
window.addEventListener('keydown', e => {
  if (typing()) { if (e.key === 'Escape') { e.target.blur(); if (G.dialogNpc) UI.closeDialog(); } return; }
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (G.dialogNpc) UI.closeDialog(); else { for (const m of document.querySelectorAll('.modal')) if (!m.hidden) UI.closeModal(m.id); } return; }
  if (!booted) return;
  if (k === 'm' && !UI.modalOpen()) { AV.Pages.go(AV.Pages.current === 'minds' ? 'world' : 'minds'); return; }
  if (AV.Pages.current !== 'world') return;
  if (k === 'tab') { e.preventDefault(); G.setMode(G.mode === 'play' ? 'watch' : 'play'); return; }
  if (UI.modalOpen() || G.dialogNpc) return;
  keys[k] = true; keys[e.code] = true;
  if (k === ' ' || e.code === 'Space') e.preventDefault();
  if (k === 'e' && G.mode === 'play') { const a = npcInFront(); if (a) UI.openDialog(a.id); }
  if (k === 'q') { const a = G.mode === 'play' ? npcInFront() : null; if (a) UI.openInspector(a.id); }
  if (k === 'n') UI.openPost();
  if (k === 'g') UI.openGraph();
  if (k === 'h' && G.mode === 'watch') G.toggleHeat();
  if (k === 'l') UI.openDev();
  if (k === 't') { G.showThoughts = !G.showThoughts; $('bThink').classList.toggle('on', G.showThoughts); UI.toast(G.showThoughts ? 'Showing private thoughts' : 'Thoughts hidden'); }
  if (k === 'f' && G.mode === 'watch' && G.selected) { G.follow = G.follow === G.selected ? null : G.selected; UI.toast(G.follow ? 'Following ' + Sim.nameOf(G.follow) : 'Free camera'); }
  if (G.mode === 'play' && /^[1-9]$/.test(k)) G.selectSlot(+k - 1);
  if (k === 'c') P.crouch = !P.crouch;
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

const canvas = renderer.domElement;
let drag = null;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (G.mode === 'play') {
    if (!document.pointerLockElement && !isTouch) { lockPointer(); return; }
    if (e.button === 0) breakBlock(); else if (e.button === 2) placeBlock();
  } else if (G.mode === 'watch') { drag = { x: e.clientX, y: e.clientY, moved: 0, btn: e.button }; }
});
window.addEventListener('mousemove', e => {
  if (G.mode === 'play' && document.pointerLockElement === canvas) {
    P.yaw -= e.movementX * 0.0023; P.pitch -= e.movementY * 0.0023; P.pitch = Math.max(-1.55, Math.min(1.55, P.pitch));
  } else if (drag && !isTouch) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
    if (drag.moved > 4) { if (G.follow) { G.followYaw = (G.followYaw || 0) - dx * 0.005; } else { cam.yaw -= dx * 0.004; cam.pitch = Math.max(-1.5, Math.min(1.3, cam.pitch - dy * 0.004)); } }
  }
});
window.addEventListener('mouseup', e => {
  if (drag && drag.moved < 5 && G.mode === 'watch' && e.target === canvas) pickAt(e.clientX, e.clientY);
  drag = null;
});
canvas.addEventListener('wheel', e => { if (G.mode !== 'watch') return; if (G.follow) G.followDist = Math.max(3, Math.min(30, (G.followDist || 9) + Math.sign(e.deltaY))); else { const f = fwd(cam.yaw, cam.pitch); const d = -Math.sign(e.deltaY) * 3; cam.x += f.x * d; cam.y += f.y * d; cam.z += f.z * d; } e.preventDefault(); }, { passive: false });
document.addEventListener('pointerlockchange', updateHint);

const touch = { jx: 0, jz: 0, look: null };
(function touchSetup() {
  const joy = $('joy'), knob = joy.querySelector('i');
  let jid = null;
  joy.addEventListener('pointerdown', e => { jid = e.pointerId; joy.setPointerCapture(jid); move(e); });
  joy.addEventListener('pointermove', e => { if (e.pointerId === jid) move(e); });
  const end = e => { if (e.pointerId !== jid) return; jid = null; touch.jx = touch.jz = 0; knob.style.transform = ''; };
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  function move(e) { const r = joy.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } touch.jx = x; touch.jz = y; knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`; }
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; touch.look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointermove', e => {
    const l = touch.look; if (!l || l.id !== e.pointerId) return;
    const dx = e.clientX - l.x, dy = e.clientY - l.y; l.x = e.clientX; l.y = e.clientY;
    if (G.mode === 'play') { P.yaw -= dx * 0.006; P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch - dy * 0.006)); }
    else if (G.follow) G.followYaw = (G.followYaw || 0) - dx * 0.008;
    else { cam.yaw -= dx * 0.006; cam.pitch = Math.max(-1.5, Math.min(1.3, cam.pitch - dy * 0.006)); }
  });
  canvas.addEventListener('pointerup', e => {
    const l = touch.look; if (!l || l.id !== e.pointerId) return; touch.look = null;
    if (Math.hypot(e.clientX - l.sx, e.clientY - l.sy) < 10 && performance.now() - l.t < 350) {
      if (G.mode === 'watch') pickAt(e.clientX, e.clientY); else { const a = npcInFront(); if (a) UI.openDialog(a.id); }
    }
  });
  $('tTalk').onclick = () => { if (G.mode === 'play') { const a = npcInFront(); if (a) UI.openDialog(a.id); else UI.toast('Walk up to someone first.'); } else if (G.selected) UI.openInspector(G.selected); };
  $('tJump').onclick = () => { if (G.mode === 'play') touch.jump = true; else cam.y += 3; };
  $('tBreak').onclick = () => { if (G.mode === 'play') breakBlock(); };
})();

// ---------------- picking ----------------
const ray = new THREE.Raycaster();
function pickAt(cx, cy) {
  const v = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  ray.setFromCamera(v, camera);
  const hits = ray.intersectObjects(R.npcMeshes(), true);
  const h = hits.find(x => x.object.userData.agentId && S().byId[x.object.userData.agentId]);
  if (h) { UI.openInspector(h.object.userData.agentId); Audio.click(); }
}
function eye() { return { x: P.x, y: P.y + (P.crouch ? 1.3 : 1.62), z: P.z }; }
function fwd(yaw, pitch) { return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }; }
function npcInFront() {
  const e = eye(), f = fwd(P.yaw, P.pitch);
  let best = null, bs = 0.32;
  for (const a of S().agents) {
    if (a.left || a.hidden) continue;
    const n = R.npcs[a.id]; if (!n || !n.G.visible) continue;
    const dx = n.rx - e.x, dy = n.vy + 1.3 - e.y, dz = n.rz - e.z; const d = Math.hypot(dx, dy, dz);
    if (d > 4.6) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * f.x + dy * f.y + dz * f.z) / d)));
    const tol = Math.atan2(0.6, d) + 0.12;
    if (ang < tol && ang < bs + tol) { bs = ang; best = a; }
  }
  return best;
}
function targetBlock() { const e = eye(), f = fwd(P.yaw, P.pitch); return W.raycast(e.x, e.y, e.z, f.x, f.y, f.z, 6); }
let lastBlockAct = 0;
function canBuild() { if (!Net.canWrite && Net.shared()) { UI.toast('Viewers cannot change the shared world.'); return false; } return true; }
async function breakBlock() {
  const now = performance.now(); if (now - lastBlockAct < 180) return; lastBlockAct = now;
  if (npcInFront() || !canBuild()) return;
  const h = targetBlock(); if (!h || h.y <= 2) return;
  const prev = h.block;
  W.set(h.x, h.y, h.z, 0); Audio.thud(prev);
  const r = await Net.rpc('block', [h.x, h.y, h.z, 'break']);
  if (!r || !r.ok) { W.set(h.x, h.y, h.z, prev); if (r && r.error) UI.toast('Could not break that: ' + r.error); }
}
async function placeBlock() {
  const now = performance.now(); if (now - lastBlockAct < 180) return; lastBlockAct = now;
  if (!canBuild()) return;
  const h = targetBlock(); if (!h) return;
  const x = h.x + h.nx, y = h.y + h.ny, z = h.z + h.nz;
  if (!W.inb(x, y, z) || (W.get(x, y, z) && W.get(x, y, z) !== W.B.WATER)) return;
  const b = G.hotbar[G.slot];
  if (W.BLOCKS[b].solid) {
    if (x + 1 > P.x - 0.3 && x < P.x + 0.3 && z + 1 > P.z - 0.3 && z < P.z + 0.3 && y + 1 > P.y && y < P.y + 1.8) return;
    for (const a of S().agents) if (!a.left && Math.floor(a.x) === x && Math.floor(a.z) === z && (y === Math.floor(a.y) || y === Math.floor(a.y) + 1)) return;
  }
  W.set(x, y, z, b); Audio.thud(b, true);
  const r = await Net.rpc('block', [x, y, z, 'place', W.BLOCKS[b].name.replace(/ /g, '_').toUpperCase()]);
  if (!r || !r.ok) { W.set(x, y, z, 0); if (r && r.error) UI.toast('Could not place that: ' + r.error); }
}

// ---------------- physics ----------------
const HW = 0.3;
function collides(x, y, z, hgt) {
  for (let bx = Math.floor(x - HW); bx <= Math.floor(x + HW); bx++)
    for (let by = Math.floor(y); by <= Math.floor(y + hgt - 0.01); by++)
      for (let bz = Math.floor(z - HW); bz <= Math.floor(z + HW); bz++)
        if (W.BLOCKS[W.get(bx, by, bz)].solid) return true;
  return false;
}
function inWater() { return W.get(Math.floor(P.x), Math.floor(P.y + 0.4), Math.floor(P.z)) === W.B.WATER; }
function physics(dt) {
  const hgt = P.crouch ? 1.5 : 1.8;
  let ix = 0, iz = 0;
  if (keys.w || keys.arrowup) iz -= 1; if (keys.s || keys.arrowdown) iz += 1; if (keys.a || keys.arrowleft) ix -= 1; if (keys.d || keys.arrowright) ix += 1;
  ix += touch.jx; iz += touch.jz;
  const m = Math.hypot(ix, iz); if (m > 1) { ix /= m; iz /= m; }
  const sprint = (keys.shift || keys.shiftleft) && !P.crouch;
  const water = inWater();
  const sp = (P.crouch ? 1.7 : sprint ? 6.4 : 4.3) * (water ? 0.55 : 1);
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  const tx = (ix * cos + iz * sin) * sp, tz = (-ix * sin + iz * cos) * sp;
  const acc = P.onGround ? 16 : water ? 6 : 3.5;
  P.vx += (tx - P.vx) * Math.min(1, acc * dt); P.vz += (tz - P.vz) * Math.min(1, acc * dt);
  if (water) { P.vy -= 6 * dt; P.vy *= 0.9; if (keys[' '] || keys.space || touch.jump) P.vy = 3; }
  else { P.vy -= 26 * dt; if ((keys[' '] || keys.space || touch.jump) && P.onGround) { P.vy = 8.2; P.onGround = false; } }
  touch.jump = false;
  P.vy = Math.max(P.vy, -40);
  let nx = P.x + P.vx * dt;
  if (collides(nx, P.y, P.z, hgt)) { nx = P.vx > 0 ? Math.floor(nx + HW) - HW - 0.001 : Math.floor(nx - HW) + 1 + HW + 0.001; if (collides(nx, P.y, P.z, hgt)) nx = P.x; P.vx = 0; }
  if (P.crouch && P.onGround && !collides(nx, P.y - 0.1, P.z, 0.1)) { nx = P.x; P.vx = 0; }
  P.x = nx;
  let nz = P.z + P.vz * dt;
  if (collides(P.x, P.y, nz, hgt)) { nz = P.vz > 0 ? Math.floor(nz + HW) - HW - 0.001 : Math.floor(nz - HW) + 1 + HW + 0.001; if (collides(P.x, P.y, nz, hgt)) nz = P.z; P.vz = 0; }
  if (P.crouch && P.onGround && !collides(P.x, P.y - 0.1, nz, 0.1)) { nz = P.z; P.vz = 0; }
  P.z = nz;
  let ny = P.y + P.vy * dt;
  P.onGround = false;
  if (collides(P.x, ny, P.z, hgt)) {
    if (P.vy < 0) { ny = Math.floor(ny) + 1; P.onGround = true; if (P.vy < -14) Audio.thud(W.B.DIRT); }
    else ny = Math.floor(ny + hgt) - hgt - 0.001;
    if (collides(P.x, ny, P.z, hgt)) ny = P.y;
    P.vy = 0;
  }
  P.y = ny;
  if (P.y < -10) { P.x = hv ? hv.center[0] + 0.5 : W.VILLAGES[0].cx + 0.5; P.z = hv ? hv.center[1] + 4.5 : W.VILLAGES[0].cz + 6.5; P.y = W.STAND + 1; }
  P.x = Math.max(0.5, Math.min(W.W - 0.5, P.x)); P.z = Math.max(0.5, Math.min(W.D - 0.5, P.z));
  const hs = Math.hypot(P.vx, P.vz);
  if (P.onGround && hs > 0.5) {
    const before = Math.sin(P.phase);
    P.phase += dt * hs * 2.1;
    if (Math.sign(before) !== Math.sign(Math.sin(P.phase))) Audio.step(W.get(Math.floor(P.x), Math.floor(P.y - 0.5), Math.floor(P.z)));
  }
  return hs;
}

function updateHint() {
  const el = $('hint');
  if (G.mode !== 'play') { el.textContent = ''; return; }
  if (!document.pointerLockElement && !isTouch && !G.dialogNpc && !UI.modalOpen()) { el.textContent = 'Click to look around'; return; }
  const a = npcInFront();
  if (a) { const r = a.rel[Net.pid]; const p = S().players[Net.pid]; const known = (p && p.known && p.known[a.id] && p.known[a.id].length) || (r && r[7] > 5); el.textContent = (isTouch ? 'TALK' : 'E') + ' talk  \u00B7  Q inspect  \u2014  ' + (known ? a.name : (AV.JOBS[a.job] ? AV.JOBS[a.job].label : 'resident')); }
  else el.textContent = '';
}

// ---------------- other visitors ----------------
const VLOOK = ['#4a5a7a', '#7a4a5a', '#4a7a5a', '#7a6a3a', '#5a4a7a', '#3a6a7a'];
function visitorAgents() {
  const out = [];
  for (const p of Net.peers) {
    if (p.isMe || !p.pid || p.mode !== 'play' || !p.x) continue;
    let h = 0; for (const c of p.pid) h = (h * 31 + c.charCodeAt(0)) | 0;
    const id = 'v_' + String(p.peer).replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
    const prev = visitorCache[id];
    const moving = prev ? Math.hypot(prev.x - p.x, prev.z - p.z) > 0.02 : false;
    const v = visitorCache[id] = Object.assign(prev || { id, visitor: true, job: 'visitor', p: { neuroticism: 0.3, curiosity: 0.6, agreeableness: 0.6, extraversion: 0.5 }, look: { skin: ['#d9a77f', '#b07a52', '#8a5a3a', '#f0c8a0'][Math.abs(h) % 4], hair: '#2a2018', hairStyle: 'short', shirt: VLOOK[Math.abs(h) % VLOOK.length], pants: '#2e2a26', shoes: '#1a1a1a', acc: ['satchel'], posture: 'normal', h: 1 }, rel: {}, plan: null }, { name: p.name || 'Visitor', x: p.x, y: p.y, z: p.z, dir: p.yaw + Math.PI, moving });
    out.push(v);
  }
  return out;
}
const visitorCache = {};
let presT = 0;
function sendPresence(dt) {
  if ((presT += dt) < 0.25) return; presT = 0;
  const playing = G.mode === 'play' && AV.Pages.current === 'world';
  Net.sendPresence({ pid: Net.pid, name: Net.name || 'Traveller', mode: playing ? 'play' : 'watch', x: playing ? Math.round(P.x * 10) / 10 : 0, y: Math.round(P.y * 10) / 10, z: playing ? Math.round(P.z * 10) / 10 : 0, yaw: Math.round(P.yaw * 100) / 100 });
}

// ---------------- audio (synthesized, original) ----------------
const Audio = {
  ctx: null, on: true,
  init() {
    if (this.ctx) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const ctx = this.ctx = new C();
      this.master = ctx.createGain(); this.master.gain.value = G.sound ? 0.8 : 0; this.master.connect(ctx.destination);
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = i % 2 ? w : last * 3.5; }
      this.noise = buf;
      const loop = (type, f, q) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7; const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.master); s.start(); return g; };
      this.wind = loop('lowpass', 380); this.rain = loop('bandpass', 1400, 0.6); this.river = loop('lowpass', 650); this.crowd = loop('bandpass', 420, 1.4);
      this.nextBird = 0; this.nextCricket = 0; this.nextAnvil = 0; this.nextChop = 0;
    } catch (e) { this.ctx = null; }
  },
  setOn(v) { if (this.master) this.master.gain.value = v ? 0.8 : 0; },
  burst(freq, type, dur, vol, q) {
    if (!this.ctx || !G.sound) return;
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain(); const t = ctx.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 1.5, dur + 0.05);
  },
  tone(freq, dur, vol, type, slide) {
    if (!this.ctx || !G.sound) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  step(b) {
    const B = W.B;
    if (b === B.STONE || b === B.COBBLE || b === B.BRICK || b === B.ORE || b === B.STONE_BRICK) this.burst(2300, 'bandpass', 0.07, 0.22, 1.2);
    else if (b === B.PLANKS || b === B.LOG) this.burst(700, 'bandpass', 0.08, 0.3, 2);
    else if (b === B.SAND || b === B.PATH) this.burst(1600, 'lowpass', 0.09, 0.2);
    else this.burst(900, 'lowpass', 0.08, 0.22);
  },
  thud(b, place) { this.burst(place ? 900 : 480, 'bandpass', 0.13, 0.45, 1.4); this.tone(place ? 220 : 140, 0.08, 0.05, 'triangle'); },
  click() { this.tone(880, 0.05, 0.04, 'square'); },
  update(dt, camPos, day) {
    if (!this.ctx || !G.sound) return;
    const s = S(), t = this.ctx.currentTime;
    const rain = s.weather.kind === 'rain';
    const set = (g, v) => g.gain.setTargetAtTime(v, t, 0.6);
    set(this.wind, 0.05 + 0.04 * Math.sin(t * 0.21) + (camPos.y > 25 ? 0.05 : 0));
    set(this.rain, rain ? 0.16 : 0);
    set(this.river, Math.max(0, 1 - Math.abs(camPos.x - W.riverX(Math.round(camPos.z))) / 14) * 0.12);
    const near = s.agents.filter(a => !a.left && Math.hypot(a.x - camPos.x, a.z - camPos.z) < 16);
    set(this.crowd, Math.min(0.06, near.filter(a => a.convo).length * 0.012));
    const now = performance.now() / 1000;
    if (day > 0.5 && !rain && now > this.nextBird) { this.nextBird = now + 1.5 + Math.random() * 5; const f = 2200 + Math.random() * 1500; this.tone(f, 0.09, 0.025, 'sine', f * 1.35); setTimeout(() => this.tone(f * 1.1, 0.07, 0.02, 'sine', f * 1.5), 120); }
    if (day < 0.25 && now > this.nextCricket) { this.nextCricket = now + 0.6 + Math.random() * 1.2; for (let i = 0; i < 3; i++) setTimeout(() => this.tone(4300, 0.025, 0.008, 'square'), i * 60); }
    const smith = near.find(a => a.job === 'blacksmith' && a.plan && a.plan.type === 'work' && a.plan.arrived);
    if (smith && now > this.nextAnvil) { this.nextAnvil = now + 1.2 + Math.random() * 0.8; const v = 0.05 * (1 - Math.hypot(camPos.x - smith.x, camPos.z - smith.z) / 16); this.tone(1850, 0.35, v, 'triangle'); this.tone(2750, 0.25, v * 0.6, 'sine'); }
    const chopper = near.find(a => a.acting === 'wood' || a.acting === 'stone' || a.acting === 'iron' || a.acting === 'coal');
    if (chopper && now > this.nextChop) { this.nextChop = now + 0.7 + Math.random() * 0.4; const v = 0.3 * (1 - Math.hypot(camPos.x - chopper.x, camPos.z - chopper.z) / 16); this.burst(chopper.acting === 'wood' ? 600 : 2100, 'bandpass', 0.08, Math.max(0.02, v), 2); }
  },
};

// ---------------- heartbeat mark + sparkline in the bar ----------------
const mark = Brain.mark($('markImg'));
Net.on('hb', (hb) => { if ((hb.dd || 0) > 0) mark.beat(); if (AV.Pages.onBeat) AV.Pages.onBeat(hb); });
function drawBeat() {
  const cv = $('beat'); if (!cv || cv.offsetParent === null) return;
  const g = cv.getContext('2d'); const w = cv.width, h = cv.height; g.clearRect(0, 0, w, h);
  const vals = Net.hbHist.slice(-35); if (!vals.length) return;
  const mx = Math.max(3, ...vals);
  g.strokeStyle = '#b6e35a'; g.lineWidth = 3; g.beginPath();
  vals.forEach((v, i) => { const x = w - (vals.length - 1 - i) * (w / 34), y = h - 4 - (v / mx) * (h - 10); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
}

// ---------------- the homepage camera: drifts over villagers who are working ----------------
const cine = { x: 0, z: 0, y: W.STAND, tx: 0, tz: 0, ang: 0.6, t: 99, id: null };
function workScore(a) {
  if (a.left || a.sleeping || a.hidden) return 0;
  const carrying = a.carryN || (a.carry && Object.keys(a.carry).some(k => a.carry[k] > 0));
  return a.acting === 'build' ? 5 : a.acting === 'till' || a.acting === 'plant' ? 4.6 : a.acting === 'food' || a.acting === 'tend' || a.acting === 'wood' ? 4 : carrying ? 3.6 : a.acting ? 3.2 : a.moving ? 1 : 0.3;
}
G.workScore = workScore;
function pickCinemaFocus() {
  const L = S().agents.filter(a => workScore(a) > 0);
  let best = null, bs = -1;
  for (const a of L) {
    const sa = workScore(a); if (sa < 3) continue;
    let sum = 0, kinds = new Set();
    for (const b of L) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < 15) { const sb = workScore(b); sum += sb * (1 - d / 15); if (sb >= 3) kinds.add(b.acting || 'carry'); } }
    sum += kinds.size * 3 + (W.villageAt(a.x, a.z, 10) ? 3 : 0) + Math.random() * 2;
    if (a.id === cine.id) sum -= 4;
    if (sum > bs) { bs = sum; best = a; }
  }
  if (!best) { const v = W.VBY.highvale; return { x: v.cx, z: v.cz, id: null }; }
  return { x: best.x, z: best.z, id: best.id };
}
G.cinemaFocus = function () { const f = pickCinemaFocus(); cine.tx = f.x; cine.tz = f.z; cine.id = f.id; cine.t = 0; if (!cine.x) { cine.x = f.x; cine.z = f.z; } return f; };
function cinemaFrame(dt, now) {
  const s = S();
  const pg = $('page'); const hero = document.querySelector('.hero4');
  const heroH = hero ? hero.offsetHeight : 600;
  if (pg.scrollTop > heroH * 0.85) { UI.clearLabels(); return; }
  if ((cine.t += dt) > 22 || !cine.tx) G.cinemaFocus();
  // follow the focus villager loosely while they work
  const fa = cine.id && s.byId[cine.id];
  if (fa && !fa.left && workScore(fa) >= 1) { cine.tx += (fa.x - cine.tx) * Math.min(1, dt * 0.4); cine.tz += (fa.z - cine.tz) * Math.min(1, dt * 0.4); }
  cine.x += (cine.tx - cine.x) * Math.min(1, dt * 0.8); cine.z += (cine.tz - cine.z) * Math.min(1, dt * 0.8);
  const gy = W.standAt(cine.x, cine.z); cine.y += (gy - cine.y) * Math.min(1, dt * 2);
  cine.ang += dt * 0.045;
  const wide = window.innerWidth < 900;
  const r = wide ? 20 : 17, h = wide ? 13 : 10.5;
  // keep the subject to the right of the text column on wide screens
  const side = wide ? 0 : -8;
  const cx = cine.x + Math.sin(cine.ang) * r + Math.cos(cine.ang) * side, cz = cine.z + Math.cos(cine.ang) * r - Math.sin(cine.ang) * side;
  let cy = cine.y + h; let lift = 0; while (lift < 30 && (W.isSolid(cx, cy, cz) || W.isSolid(cx, cy - 1, cz))) { cy += 1; lift++; }
  for (let k = 0; k < 14 && !W.los(cx, cy, cz, cine.x, cine.y + 1.4, cine.z); k++) cy += 1.25;
  cine.cy = cine.cy === undefined ? cy : cine.cy + (cy - cine.cy) * Math.min(1, dt * 1.5); cy = cine.cy;
  camera.position.set(cx, cy, cz);
  const lx = cine.x + Math.cos(cine.ang) * side * 0.95, lz = cine.z - Math.sin(cine.ang) * side * 0.95;
  camera.lookAt(lx, cine.y + 1.2, lz);
  if (Math.abs(camera.fov - 62) > 0.1) { camera.fov = 62; camera.updateProjectionMatrix(); }
  Sim.setObserver(camera.position.x, camera.position.z);
  const day = R.updateSky(s.t, camera.position, s.weather.kind);
  R.updateRain(s.weather.kind === 'rain', camera.position, dt);
  if (R.pending.length) R.buildSome(8, cine.x, cine.z);
  if (R.dirty.size) R.flushDirty(3);
  R.highlight(null);
  R.syncNPCs(s.agents, now / 1000 * 10, dt, false, camera.position);
  renderer.render(scene, camera);
  UI.updateLabels(camera, s.agents, [], true);
  Audio.update(dt, camera.position, day);
}

// ---------------- main loop ----------------
let last = performance.now(), heatT = 0, flushT = 0, hintTick = 0, barT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!booted) return;
  const s = S();
  Net.frame();
  if ((barT += dt) > 0.5) { barT = 0; AV.Pages.bar(); drawBeat(); }
  sendPresence(dt);
  if (AV.Pages.current === 'home') { cinemaFrame(dt, now); AV.Pages.frame(dt); return; }
  if (AV.Pages.current !== 'world') { AV.Pages.frame(dt); return; }
  if (G.mode === 'play') {
    if (!G.dialogNpc && !UI.modalOpen()) physics(dt); else { P.vx = P.vz = 0; }
    const e = eye(); const bob = P.onGround ? Math.sin(P.phase * 2) * 0.035 * Math.min(1, Math.hypot(P.vx, P.vz) / 4) : 0;
    camera.position.set(e.x, e.y + bob, e.z); camera.rotation.set(P.pitch, P.yaw, 0);
    const want = 72 + ((keys.shift || keys.shiftleft) && Math.hypot(P.vx, P.vz) > 5 ? 6 : 0);
    if (Math.abs(camera.fov - want) > 0.1) { camera.fov += (want - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); }
    if ((hintTick += dt) > 0.15) { hintTick = 0; updateHint(); R.highlight(document.pointerLockElement || isTouch ? targetBlock() : null); }
  } else {
    R.highlight(null);
    const fa = G.follow && s.byId[G.follow];
    if (fa && !fa.left) {
      const n = R.npcs[fa.id]; const d = G.followDist || 9; const yaw = (G.followYaw || 0) + (n ? n.dir : 0) + Math.PI;
      const ax = n ? n.rx : fa.x, az = n ? n.rz : fa.z, ay = n ? n.vy : fa.y;
      const tx = ax + Math.sin(yaw) * d, tz = az + Math.cos(yaw) * d;
      // rise above roofs and walls until the villager is in sight
      let ty = ay + d * 0.6 + 2; for (let k = 0; k < 16 && !W.los(tx, ty, tz, ax, ay + 1.4, az); k++) ty += 1.25;
      cam.x += (tx - cam.x) * Math.min(1, dt * 3); cam.y += (ty - cam.y) * Math.min(1, dt * 3); cam.z += (tz - cam.z) * Math.min(1, dt * 3);
      const lx = (n ? n.rx : fa.x) - cam.x, ly = (n ? n.vy : fa.y) + 1.4 - cam.y, lz = (n ? n.rz : fa.z) - cam.z;
      cam.yaw = Math.atan2(-lx, -lz); cam.pitch = Math.atan2(ly, Math.hypot(lx, lz));
    } else if (!UI.modalOpen() && !typing()) {
      let ix = 0, iz = 0, iy = 0;
      if (keys.w || keys.arrowup) iz -= 1; if (keys.s || keys.arrowdown) iz += 1; if (keys.a || keys.arrowleft) ix -= 1; if (keys.d || keys.arrowright) ix += 1;
      if (keys[' '] || keys.space) iy += 1; if (keys.shift || keys.shiftleft) iy -= 1;
      ix += touch.jx; iz += touch.jz;
      const sp = 18 * dt, sin = Math.sin(cam.yaw), cos = Math.cos(cam.yaw);
      cam.x += (ix * cos + iz * sin) * sp; cam.z += (-ix * sin + iz * cos) * sp; cam.y += iy * sp;
      cam.x = Math.max(-30, Math.min(W.W + 30, cam.x)); cam.z = Math.max(-30, Math.min(W.D + 30, cam.z)); cam.y = Math.max(W.STAND + 1, Math.min(110, cam.y));
    }
    // never inside a wall or a hill
    let lift = 0; while (lift < 40 && (W.isSolid(cam.x, cam.y, cam.z) || W.isSolid(cam.x, cam.y - 0.6, cam.z))) { cam.y += 1; lift++; }
    camera.position.set(cam.x, cam.y, cam.z); camera.rotation.set(cam.pitch, cam.yaw, 0);
    if (Math.abs(camera.fov - 72) > 0.1) { camera.fov = 72; camera.updateProjectionMatrix(); }
  }
  Sim.setObserver(camera.position.x, camera.position.z);
  const day = R.updateSky(s.t, camera.position, s.weather.kind);
  R.updateRain(s.weather.kind === 'rain', camera.position, dt);
  if (R.pending.length) R.buildSome(6, camera.position.x, camera.position.z);
  if ((flushT += dt) > 0.05) { flushT = 0; if (R.dirty.size) R.flushDirty(3); }
  const vis = visitorAgents();
  R.syncNPCs(s.agents.concat(vis), now / 1000 * 10, dt, false, camera.position);
  if (G.heat && (heatT += dt) > 3) { heatT = 0; R.drawHeat(G.heat, s.heat[G.heat]); }
  renderer.render(scene, camera);
  UI.updateLabels(camera, s.agents, vis);
  UI.frame(dt);
  Audio.update(dt, camera.position, day);
}
requestAnimationFrame(frame);
})(typeof window !== 'undefined' ? window : globalThis);
