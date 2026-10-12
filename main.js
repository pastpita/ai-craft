/* AI VILLAGE — main.js
   Boot, persistence + offline catch-up, the game loop, first-person physics, spectator camera,
   block interaction, input (keyboard, mouse, touch), synthesized audio and the Claude provider. */
(function (root) {
'use strict';
const AV = root.AV, W = root.World, THREE = root.THREE;
AV.THREE = THREE;
const Sim = AV.Sim, R = AV.Render, UI = AV.UI;
const $ = id => document.getElementById(id);
const SAVE_KEY = 'aivillage.save.v3', SET_KEY = 'aivillage.settings.v1';
const MIN_PER_SEC = 1.2; // game minutes per real second at 1x
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};

// ---------------- LLM provider abstraction ----------------
const LLM = AV.LLM = {
  enabled: true, provider: null,
  available() { return !!this.provider; },
  ready() { return this.enabled && !!this.provider; },
  disable() { this.provider = null; updateAIStatus(); },
  json(prompt, o) { return this.provider.json(prompt, o || {}); },
  text(prompt, o) { return this.provider.text(prompt, o || {}); },
};
function claudeProvider(sample) {
  return {
    name: 'Claude',
    json: (p, o) => sample.json(p, { modelTier: o.tier || 'quick', cache: false }),
    text: async (p, o) => (await sample(p, { modelTier: o.tier || 'quick', cache: { gcTime: 3600000 }, onText: o.onText ? ({ text }) => o.onText(text) : undefined })).text,
  };
}
(async () => {
  try {
    if (root.claude && typeof root.claude.use === 'function') {
      const sample = await root.claude.use('sample');
      if (sample) LLM.provider = claudeProvider(sample);
    }
  } catch (e) { /* stays offline */ }
  updateAIStatus();
})();
function updateAIStatus() {
  const el = $('aiStatus'); if (!el) return;
  el.textContent = LLM.available() ? 'Claude is connected: type anything to a villager and they answer from their own memories and beliefs.' : 'Villagers talk with the built-in responder here. Everything else runs the same.';
}

// ---------------- game state ----------------
const G = AV.Game = {
  mode: 'title', speed: 1, prevSpeed: 1, slot: 0, selected: null, follow: null, showThoughts: true, heat: null, sound: true,
  hotbar: [W.B.PLANKS, W.B.COBBLE, W.B.BRICK, W.B.GLASS, W.B.PLASTER, W.B.ROOF_TILE, W.B.LOG, W.B.TORCH, W.B.FENCE],
  dialogNpc: null, pendingAway: null,
};
const settings = (() => { try { return JSON.parse(store.get(SET_KEY) || '{}'); } catch (e) { return {}; } })();
if (settings.llm === false) LLM.enabled = false;
if (settings.sound === false) G.sound = false;
G.saveSettings = () => store.set(SET_KEY, JSON.stringify({ llm: LLM.enabled, sound: G.sound }));

// ---------------- three.js setup ----------------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#9fc4d8', 40, 95);
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 900);
camera.rotation.order = 'YXZ';
window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });

// ---------------- boot: load or create, then catch up ----------------
let catchUp = null;
(function boot() {
  const raw = store.get(SAVE_KEY);
  let loaded = false;
  if (raw) {
    try {
      Sim.load(raw);
      loaded = true;
      const s = Sim.S();
      const away = (Date.now() - (s.realSaved || Date.now())) / 1000;
      const minutes = Math.min(away * MIN_PER_SEC, 4 * Sim.DAY);
      if (minutes > 30) {
        const before = { mayor: s.town.mayor, bread: Sim.breadPrice(), day: Sim.dayOf(s.t) };
        const evs = Sim.catchUp(minutes, 5);
        catchUp = { events: evs, minutes, before };
      }
    } catch (e) { console.warn('save could not be loaded, starting fresh', e); loaded = false; }
  }
  if (!loaded) {
    Sim.newWorld();
    for (let i = 0; i < 75; i++) Sim.advance(1);
    Sim.composePaper();
  }
})();
const S = () => Sim.S();
R.init(scene); R.lights(scene);
UI.init();
G.pendingAway = catchUp && catchUp.events.length ? catchUp : null;

// the player
const P = { x: S().player.x, y: S().player.y, z: S().player.z, vx: 0, vy: 0, vz: 0, yaw: S().player.yaw || Math.PI, pitch: 0, onGround: false, phase: 0, crouch: false };
if (!W.inb(Math.floor(P.x), Math.floor(P.y), Math.floor(P.z))) { P.x = 48.5; P.z = 40.5; P.y = W.STAND; }
const playerAgent = { id: 'you', name: 'You', job: 'unemployed', look: { skin: '#d9a77f', hair: '#3b2a20', hairStyle: 'short', shirt: '#4a5a7a', pants: '#2e2a26', shoes: '#1a1a1a', acc: ['satchel'], posture: 'normal', h: 1 }, p: { neuroticism: 0.3, curiosity: 0.8, agreeableness: 0.6, extraversion: 0.6 }, x: P.x, z: P.z, dir: 0, rel: {}, left: true, plan: null };
const cam = { x: 48, y: 30, z: 80, yaw: 0, pitch: -0.5 };

// ---------------- modes ----------------
G.setMode = function (m) {
  if (m === G.mode) return;
  const prev = G.mode; G.mode = m;
  document.body.classList.toggle('play', m === 'play');
  document.body.classList.toggle('watch', m === 'watch');
  if (m === 'watch') {
    if (document.pointerLockElement) document.exitPointerLock();
    if (prev === 'play') { cam.x = P.x - Math.sin(P.yaw) * -6; cam.z = P.z - Math.cos(P.yaw) * -6; cam.y = P.y + 9; cam.yaw = P.yaw; cam.pitch = -0.6; }
    playerAgent.left = false;
  } else if (m === 'play') {
    G.follow = null; playerAgent.left = true;
    lockPointer();
  }
  UI.feedSig = '';
  if (!$('inspector').hidden) { $('inspTabs')._sig = ''; UI.renderInspector(); }
  updateHint();
};
G.setSpeed = function (v) { G.speed = v; if (v) G.prevSpeed = v; };
G.selectSlot = function (i) { G.slot = i; document.querySelectorAll('.slot').forEach((s, k) => s.classList.toggle('sel', k === i)); };
G.selectSlot(0);
G.toggleHeat = function () {
  G.heat = G.heat === null ? 'social' : G.heat === 'social' ? 'crime' : null;
  R.heat.visible = !!G.heat;
  if (G.heat) { R.drawHeat(G.heat, S().heat[G.heat]); UI.toast(G.heat === 'social' ? 'Heatmap: where people talk' : 'Heatmap: crime, arguments and protests'); }
};
G.onModal = function (open) { if (open && document.pointerLockElement) document.exitPointerLock(); };
G.onDialog = function (open, a) {
  if (open) {
    G.dialogNpc = a.id; if (document.pointerLockElement) document.exitPointerLock();
    if (!a.convo) { a.convo = 'player'; a.path = null; a.dir = Math.atan2(P.x - a.x, P.z - a.z); }
  } else {
    G.dialogNpc = null;
    if (a && a.convo === 'player') { a.convo = null; a.thinkAt = S().t; a.convoCool = S().t + 5; }
    if (G.mode === 'play') lockPointer();
  }
};
G.skipTime = function (minutes) { for (let i = 0; i < minutes; i++) Sim.advance(1); };
G.lookAt = function (a) { G.lookAtPoint(a.x, a.z, a.y); };
G.lookAtPoint = function (x, z, y) {
  if (G.mode !== 'watch') return;
  y = y || W.STAND;
  cam.x = x + 7; cam.z = z + 9; cam.y = y + 9;
  const dx = x - cam.x, dz = z - cam.z, dy = y + 1 - cam.y;
  cam.yaw = Math.atan2(-dx, -dz); cam.pitch = Math.atan2(dy, Math.hypot(dx, dz));
};
G.askDecision = async function (a) {
  const out = $('iAskOut');
  if (!LLM.ready()) { UI.toast(LLM.available() ? 'Turn Claude on in the ? menu first.' : 'Claude is not available here. The prompt is shown in LOG > Prompts.'); UI.openDev('prompts'); return; }
  if (out) out.textContent = 'Asking Claude to think as ' + a.name + '...';
  const prompt = Sim.buildDecisionPrompt(a);
  try {
    const j = await LLM.json(prompt, { tier: 'quick' });
    const r = Sim.applyDecision(a, j);
    S().llmLog.push({ t: S().t, kind: 'decision', agent: a.id, prompt, response: j, result: r.ok ? 'accepted' : 'rejected: ' + r.error });
    const msg = r.ok ? a.name + ' will ' + String(j.action).replace(/_/g, ' ') + (j.target ? ' (' + Sim.nameOf(j.target) + ')' : '') + ': ' + (j.reason || '') : 'The engine rejected the plan (' + r.error + '). ' + a.name + ' keeps their own.';
    if (out) out.textContent = msg; UI.toast(r.ok ? 'Claude decided for ' + a.name : 'Plan rejected by the engine', 3000);
    if (r.ok && j.thought) Sim.setThought(a, String(j.thought).slice(0, 90));
  } catch (e) {
    if (e && (e.code === 'not_granted' || e.code === 'sampling_disabled')) LLM.disable();
    if (out) out.textContent = 'Claude could not answer (' + (e && e.code || 'error') + '). The villager keeps their own plan.';
  }
};
G.toggleSound = function () { G.sound = !G.sound; Audio.setOn(G.sound); G.saveSettings(); };
G.resetWorld = function () {
  store.del(SAVE_KEY);
  for (const id in R.npcs) { R.scene.remove(R.npcs[id].G); }
  R.npcs = {};
  for (const id in UI.labels) UI.labels[id].remove(); UI.labels = {};
  Sim.newWorld(); for (let i = 0; i < 75; i++) Sim.advance(1); Sim.composePaper();
  R.refreshAll(); R.dirty.clear();
  P.x = 48.5; P.z = 40.5; P.y = W.STAND; P.vx = P.vy = P.vz = 0;
  UI.closeInspector(); UI.closeDialog(); UI.feedSig = '';
  save();
  UI.toast('A new village wakes up.');
};
function save() {
  const s = S(); s.player.x = P.x; s.player.y = P.y; s.player.z = P.z; s.player.yaw = P.yaw;
  if (!store.set(SAVE_KEY, Sim.serialize())) { /* storage full or blocked; the village still runs */ }
}
setInterval(save, 20000);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
window.addEventListener('pagehide', save);

// ---------------- title ----------------
function startGame(m) {
  Audio.init();
  UI.closeModal('title');
  G.mode = 'title';
  G.setMode(m);
  if (G.pendingAway) { const p = G.pendingAway; G.pendingAway = null; setTimeout(() => UI.showAway(p.events, p.minutes, p.before), 250); }
}
$('goPlay').onclick = () => startGame('play');
$('goWatch').onclick = () => startGame('watch');
if (catchUp) $('titleBlurb').textContent = 'The village kept living while you were gone: ' + Math.round(catchUp.minutes / 60) + ' village hours passed. ' + $('titleBlurb').textContent;

// ---------------- input ----------------
const keys = {};
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) { document.body.classList.add('touch'); $('goPlay').textContent = 'Walk the village'; }
function typing() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA'); }
function lockPointer() { if (isTouch || G.mode !== 'play' || UI.modalOpen() || G.dialogNpc) return; const c = renderer.domElement; if (c.requestPointerLock) { try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* optional */ } } }
window.addEventListener('keydown', e => {
  if (typing()) { if (e.key === 'Escape') { e.target.blur(); if (G.dialogNpc) UI.closeDialog(); } return; }
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (G.dialogNpc) UI.closeDialog(); else { for (const m of document.querySelectorAll('.modal')) if (!m.hidden && m.id !== 'title') UI.closeModal(m.id); } return; }
  if (G.mode === 'title') return;
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
  if (k === ']') { const L = [0, 1, 2, 5, 10]; G.setSpeed(L[Math.min(L.length - 1, L.indexOf(G.speed) + 1)]); }
  if (k === '[') { const L = [0, 1, 2, 5, 10]; G.setSpeed(L[Math.max(0, L.indexOf(G.speed) - 1)]); }
  if (k === 'p') G.setSpeed(G.speed ? 0 : G.prevSpeed);
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

// touch: joystick + drag look + tap
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
  const h = hits.find(x => x.object.userData.agentId && x.object.userData.agentId !== 'you');
  if (h) { UI.openInspector(h.object.userData.agentId); Audio.click(); }
}
function eye() { return { x: P.x, y: P.y + (P.crouch ? 1.3 : 1.62), z: P.z }; }
function fwd(yaw, pitch) { return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }; }
function npcInFront() {
  const e = eye(), f = fwd(P.yaw, P.pitch);
  let best = null, bs = 0.32;
  for (const a of S().agents) {
    if (a.left) continue;
    const n = R.npcs[a.id]; if (!n) continue;
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
function breakBlock() {
  const now = performance.now(); if (now - lastBlockAct < 180) return; lastBlockAct = now;
  if (npcInFront()) return;
  const h = targetBlock(); if (!h || h.y <= 0) return;
  const prev = h.block;
  W.set(h.x, h.y, h.z, 0);
  if (prev === W.B.DOOR) { if (W.get(h.x, h.y + 1, h.z) === W.B.DOOR) W.set(h.x, h.y + 1, h.z, 0); if (W.get(h.x, h.y - 1, h.z) === W.B.DOOR) W.set(h.x, h.y - 1, h.z, 0); }
  Sim.playerBlock(h.x, h.y, h.z, 'break', prev);
  Audio.thud(prev);
}
function placeBlock() {
  const now = performance.now(); if (now - lastBlockAct < 180) return; lastBlockAct = now;
  const h = targetBlock(); if (!h) return;
  const x = h.x + h.nx, y = h.y + h.ny, z = h.z + h.nz;
  if (!W.inb(x, y, z) || (W.get(x, y, z) && W.get(x, y, z) !== W.B.WATER)) return;
  const b = G.hotbar[G.slot];
  if (W.BLOCKS[b].solid) {
    if (x + 1 > P.x - 0.3 && x < P.x + 0.3 && z + 1 > P.z - 0.3 && z < P.z + 0.3 && y + 1 > P.y && y < P.y + 1.8) return;
    for (const a of S().agents) if (!a.left && Math.floor(a.x) === x && Math.floor(a.z) === z && (y === Math.floor(a.y) || y === Math.floor(a.y) + 1)) return;
  }
  W.set(x, y, z, b);
  Sim.playerBlock(x, y, z, 'place', 0);
  Audio.thud(b, true);
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
  const sp = (P.crouch ? 1.7 : sprint ? 6.1 : 4.3) * (water ? 0.55 : 1);
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  const tx = (ix * cos + iz * sin) * sp, tz = (-ix * sin + iz * cos) * sp;
  const acc = P.onGround ? 16 : water ? 6 : 3.5;
  P.vx += (tx - P.vx) * Math.min(1, acc * dt); P.vz += (tz - P.vz) * Math.min(1, acc * dt);
  if (water) { P.vy -= 6 * dt; P.vy *= 0.9; if (keys[' '] || keys.space || touch.jump) P.vy = 3; }
  else { P.vy -= 26 * dt; if ((keys[' '] || keys.space || touch.jump) && P.onGround) { P.vy = 8.2; P.onGround = false; } }
  touch.jump = false;
  P.vy = Math.max(P.vy, -40);
  // x
  let nx = P.x + P.vx * dt;
  if (collides(nx, P.y, P.z, hgt)) { nx = P.vx > 0 ? Math.floor(nx + HW) - HW - 0.001 : Math.floor(nx - HW) + 1 + HW + 0.001; if (collides(nx, P.y, P.z, hgt)) nx = P.x; P.vx = 0; }
  // crouch: don't walk off edges
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
  if (P.y < -10) { P.x = 48.5; P.z = 40.5; P.y = W.STAND + 1; }
  P.x = Math.max(0.5, Math.min(W.W - 0.5, P.x)); P.z = Math.max(0.5, Math.min(W.D - 0.5, P.z));
  // head bob + footsteps
  const hs = Math.hypot(P.vx, P.vz);
  if (P.onGround && hs > 0.5) {
    const before = Math.sin(P.phase);
    P.phase += dt * hs * 2.1;
    if (Math.sign(before) !== Math.sign(Math.sin(P.phase))) Audio.step(W.get(Math.floor(P.x), Math.floor(P.y - 0.5), Math.floor(P.z)));
  }
  return hs;
}

// ---------------- hint ----------------
let hintT = 0;
function updateHint() {
  const el = $('hint');
  if (G.mode !== 'play') { el.textContent = ''; return; }
  if (!document.pointerLockElement && !isTouch && !G.dialogNpc && !UI.modalOpen()) { el.textContent = 'Click to look around'; return; }
  const a = npcInFront();
  if (a) { const known = (S().player.known[a.id] && S().player.known[a.id].length) || a.rel.you[7] > 5; el.textContent = (isTouch ? 'TALK' : 'E') + ' talk  ·  Q inspect  —  ' + (known ? a.name : (AV.JOBS[a.job] ? AV.JOBS[a.job].label : 'villager')); }
  else el.textContent = '';
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
      this.nextBird = 0; this.nextCricket = 0; this.nextAnvil = 0;
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
    if (b === B.STONE || b === B.COBBLE || b === B.BRICK || b === B.ORE) this.burst(2300, 'bandpass', 0.07, 0.22, 1.2);
    else if (b === B.PLANKS || b === B.LOG) this.burst(700, 'bandpass', 0.08, 0.3, 2);
    else if (b === B.SAND || b === B.PATH) this.burst(1600, 'lowpass', 0.09, 0.2);
    else this.burst(900, 'lowpass', 0.08, 0.22);
  },
  thud(b, place) { this.burst(place ? 900 : 480, 'bandpass', 0.13, 0.45, 1.4); this.tone(place ? 220 : 140, 0.08, 0.05, 'triangle'); },
  click() { this.tone(880, 0.05, 0.04, 'square'); },
  update(dt, camPos, day) {
    if (!this.ctx || !G.sound) return;
    const s = S(), t = this.ctx.currentTime;
    const rain = s.weather.kind === 'rain' && !s.weather.drought;
    const set = (g, v) => g.gain.setTargetAtTime(v, t, 0.6);
    set(this.wind, 0.05 + 0.04 * Math.sin(t * 0.21) + (camPos.y > 25 ? 0.05 : 0));
    set(this.rain, rain ? 0.16 : 0);
    const rx = 80 + 2 * Math.sin(camPos.z * 0.11);
    set(this.river, Math.max(0, 1 - Math.abs(camPos.x - rx) / 14) * 0.12);
    const talkers = s.agents.filter(a => a.convo && Math.hypot(a.x - camPos.x, a.z - camPos.z) < 14).length;
    set(this.crowd, Math.min(0.06, talkers * 0.012));
    const now = performance.now() / 1000;
    if (day > 0.5 && !rain && now > this.nextBird) { this.nextBird = now + 1.5 + Math.random() * 5; const f = 2200 + Math.random() * 1500; this.tone(f, 0.09, 0.025, 'sine', f * 1.35); setTimeout(() => this.tone(f * 1.1, 0.07, 0.02, 'sine', f * 1.5), 120); }
    if (day < 0.25 && now > this.nextCricket) { this.nextCricket = now + 0.6 + Math.random() * 1.2; for (let i = 0; i < 3; i++) setTimeout(() => this.tone(4300, 0.025, 0.008, 'square'), i * 60); }
    const forge = W.places.forge;
    if (now > this.nextAnvil && forge && Math.hypot(camPos.x - forge.center[0], camPos.z - forge.center[1]) < 18 && s.agents.some(a => a.job === 'blacksmith' && a.plan && a.plan.type === 'work' && a.plan.arrived)) {
      this.nextAnvil = now + 1.2 + Math.random() * 0.8; const v = 0.06 * (1 - Math.hypot(camPos.x - forge.center[0], camPos.z - forge.center[1]) / 18);
      this.tone(1850, 0.35, v, 'triangle'); this.tone(2750, 0.25, v * 0.6, 'sine');
    }
  },
};

// ---------------- main loop ----------------
let last = performance.now(), heatT = 0, flushT = 0, hintTick = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  const s = S();
  // simulate
  if (G.speed > 0 && G.mode !== 'title' && !UI.modalOpen()) Sim.advance(dt * MIN_PER_SEC * G.speed);
  else if (G.mode === 'title') Sim.advance(dt * MIN_PER_SEC);
  // camera
  if (G.mode === 'play') {
    if (!G.dialogNpc && !UI.modalOpen()) physics(dt); else { P.vx = P.vz = 0; }
    const e = eye(); const bob = P.onGround ? Math.sin(P.phase * 2) * 0.035 * Math.min(1, Math.hypot(P.vx, P.vz) / 4) : 0;
    camera.position.set(e.x, e.y + bob, e.z); camera.rotation.set(P.pitch, P.yaw, 0);
    const want = 72 + ((keys.shift || keys.shiftleft) && Math.hypot(P.vx, P.vz) > 5 ? 6 : 0);
    if (Math.abs(camera.fov - want) > 0.1) { camera.fov += (want - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); }
    if ((hintTick += dt) > 0.15) { hintTick = 0; updateHint(); R.highlight(document.pointerLockElement || isTouch ? targetBlock() : null); }
    s.player.x = P.x; s.player.y = P.y; s.player.z = P.z;
  } else if (G.mode === 'watch') {
    R.highlight(null);
    const fa = G.follow && s.byId[G.follow];
    if (fa && !fa.left) {
      const n = R.npcs[fa.id]; const d = G.followDist || 9; const yaw = (G.followYaw || 0) + (n ? n.dir : 0) + Math.PI;
      const tx = (n ? n.rx : fa.x) + Math.sin(yaw) * d, tz = (n ? n.rz : fa.z) + Math.cos(yaw) * d, ty = (n ? n.vy : fa.y) + d * 0.55 + 1.5;
      cam.x += (tx - cam.x) * Math.min(1, dt * 3); cam.y += (ty - cam.y) * Math.min(1, dt * 3); cam.z += (tz - cam.z) * Math.min(1, dt * 3);
      const lx = (n ? n.rx : fa.x) - cam.x, ly = (n ? n.vy : fa.y) + 1.4 - cam.y, lz = (n ? n.rz : fa.z) - cam.z;
      cam.yaw = Math.atan2(-lx, -lz); cam.pitch = Math.atan2(ly, Math.hypot(lx, lz));
    } else if (!UI.modalOpen() && !typing()) {
      let ix = 0, iz = 0, iy = 0;
      if (keys.w || keys.arrowup) iz -= 1; if (keys.s || keys.arrowdown) iz += 1; if (keys.a || keys.arrowleft) ix -= 1; if (keys.d || keys.arrowright) ix += 1;
      if (keys[' '] || keys.space) iy += 1; if (keys.shift || keys.shiftleft) iy -= 1;
      ix += touch.jx; iz += touch.jz;
      const sp = 16 * dt, sin = Math.sin(cam.yaw), cos = Math.cos(cam.yaw);
      cam.x += (ix * cos + iz * sin) * sp; cam.z += (-ix * sin + iz * cos) * sp; cam.y += iy * sp;
      cam.x = Math.max(-40, Math.min(136, cam.x)); cam.z = Math.max(-40, Math.min(136, cam.z)); cam.y = Math.max(W.STAND + 1, Math.min(90, cam.y));
    }
    camera.position.set(cam.x, cam.y, cam.z); camera.rotation.set(cam.pitch, cam.yaw, 0);
    if (Math.abs(camera.fov - 72) > 0.1) { camera.fov = 72; camera.updateProjectionMatrix(); }
  } else {
    const a = now * 0.00004;
    camera.position.set(48 + Math.cos(a) * 46, 30, 50 + Math.sin(a) * 46);
    camera.lookAt(48, 12, 48);
  }
  Sim.setObserver(camera.position.x, camera.position.z);
  // world visuals
  const wx = s.weather.drought ? 'clear' : s.weather.kind;
  const day = R.updateSky(s.t, camera.position, wx);
  R.updateRain(wx === 'rain', camera.position, dt);
  if ((flushT += dt) > 0.05) { flushT = 0; if (R.dirty.size) R.flushDirty(2); }
  playerAgent.x = P.x; playerAgent.z = P.z; playerAgent.dir = P.yaw + Math.PI; playerAgent.moving = false;
  R.syncNPCs(G.mode === 'watch' ? s.agents.concat([playerAgent]) : s.agents, now / 1000 * 10, dt, G.speed >= 10);
  if (G.heat && (heatT += dt) > 3) { heatT = 0; R.drawHeat(G.heat, s.heat[G.heat]); }
  renderer.render(scene, camera);
  if (G.mode !== 'title') { UI.updateLabels(camera, s.agents, P); UI.frame(dt); }
  Audio.update(dt, camera.position, day);
}
requestAnimationFrame(frame);
document.body.classList.add('hud-hide');
const obs = new MutationObserver(() => document.body.classList.toggle('hud-hide', !$('title').hidden));
obs.observe($('title'), { attributes: true });
updateAIStatus();
})(typeof window !== 'undefined' ? window : globalThis);
