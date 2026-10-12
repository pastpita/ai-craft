/* AI CRAFT \u2014 ui.js
   In-world HUD: village panel, live feed (events + minds), resident inspector with structured decision
   summaries, cognition icons over heads, dialogue (actions go to the host), papers, graph, logs, settings. */
(function (root) {
'use strict';
const AV = root.AV;
const W = root.World;
const Sim = AV.Sim;
const UI = AV.UI = {};
const $ = id => document.getElementById(id);
const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = () => Sim.S();
const G = () => AV.Game;
const Net = () => AV.Net;
const nm = id => Sim.nameOf(id);
const pct = v => Math.round(v * 100) + '%';
const PID = () => Net().pid;
const me = () => S().players[PID()] || { money: 0, inv: { bread: 0 }, known: {} };
const CAT = {
  ITEM_STOLEN: 'crime', THEFT_DISCOVERED: 'crime', ARREST: 'crime', CLEARED: 'crime', EVIDENCE_FOUND: 'crime', FALSE_TESTIMONY: 'crime', CASE_COLD: 'crime', SEEN_AT_NIGHT: 'crime', PROPERTY_DAMAGE: 'crime', FRAUD_NOTICED: 'crime', ARGUMENT: 'social',
  ELECTION_RESULT: 'politics', ELECTION_STARTED: 'politics', POLICY_CHANGED: 'politics', PROTEST: 'politics', CORRUPTION_FOUND: 'politics',
  PRICE_CHANGED: 'economy', JOB_CHANGE: 'economy', BUILDING_CREATED: 'economy', CONSTRUCTION_STARTED: 'economy', MISSED_SHIFT: 'economy', TRADE: 'economy', BUSINESS_OPENED: 'economy', HIRED: 'economy', GOLD_FOUND: 'economy', PROPERTY_SOLD: 'economy', LOAN: 'economy', DEFAULT: 'economy',
  COUPLE: 'social', HELP: 'social', SECRET_EXPOSED: 'social', SECRET_TOLD: 'social', RUMOR_CREATED: 'social', RUMOR_DISTORTED: 'social', LEFT_VILLAGE: 'social', NPC_INJURED: 'social', NPC_SICK: 'social', MIGRATION: 'social',
  NEWSPAPER: 'news', PLAYER_INTERACTION: 'you', WORLD_EVENT: 'world', TIER_UP: 'world',
};
const CAT_LABEL = { crime: 'CRIME', politics: 'POLITICS', economy: 'ECONOMY', social: 'SOCIAL', news: 'PAPER', you: 'YOU', world: 'WORLD' };
UI.esc = esc; UI.CAT = CAT; UI.CAT_LABEL = CAT_LABEL;
UI.vcol = vid => (W.VBY[vid] && W.VBY[vid].color) || '#8a8371';
UI.vname = vid => (W.VBY[vid] && W.VBY[vid].name) || 'the wilds';
UI.vtag = vid => vid && W.VBY[vid] ? `<span class="vtag" style="background:${UI.vcol(vid)}">${esc(UI.vname(vid).toUpperCase())}</span>` : '';
UI.feedMode = 'events';


// ---------------- pixel icons (12x12, drawn in code) ----------------
const ICO_PAL = { k: '#1b1b1b', w: '#fff8e8', g: '#6fb043', G: '#3f7a25', y: '#e6c34a', Y: '#b8902c', b: '#8a6140', B: '#4d3320', s: '#a3a39e', S: '#5f5f5a', p: '#c4955a', P: '#8f6a3b', r: '#d0453a', R: '#8f2a22', o: '#f2d040', c: '#8cc4ee', i: '#e4e4dc', d: '#7b5434' };
const ICONS = {
  axe: ['............', '......SSS...', '.....SsssS..', '....SsssiS..', '.....SsssS..', '.....PSSS...', '....Pb......', '...Pb.......', '..Pb........', '.Pb.........', 'Pb..........', '............'],
  pick: ['..SSSSSSSS..', '.SsssssssiS.', 'Ss..SbbS..sS', 'S...Pb.....S', '....Pb......', '....Pb......', '....Pb......', '....Pb......', '....Pb......', '....Pb......', '....PB......', '............'],
  hoe: ['.....SSSSS..', '.....SssiS..', '......SSPb..', '.......Pb...', '......Pb....', '......Pb....', '.....Pb.....', '.....Pb.....', '....Pb......', '....Pb......', '...PB.......', '............'],
  hammer: ['.SSSSSSSS...', '.SiisssssS..', '.SSSSSSSS...', '....Pb......', '....Pb......', '....Pb......', '....Pb......', '....Pb......', '....Pb......', '....Pb......', '....PB......', '............'],
  wheat: ['.....yY.....', '....yYyY....', '.....yY.....', '....yYyY....', '.....yY.....', '....yYyY....', '.....gG.....', '....gGgG....', '.....gG.....', '.....gG.....', '.....gG.....', '............'],
  sprout: ['............', '............', '............', '.....g......', '....gGg.....', '...g.G.g....', '.....G......', '.....G......', 'dddddddddddd', 'BdBdBdBdBdBd', 'dBdBdBdBdBdB', 'BBBBBBBBBBBB'],
  log: ['...BBBBBB...', '..BbppppbB..', '.BbpPPPPpbB.', '.BpPpppPPpB.', '.BpPpPPpPpB.', '.BpPpPPpPpB.', '.BpPpppPPpB.', '.BbpPPPPpbB.', '..BbppppbB..', '...BBBBBB...', '............', '............'],
  stone: ['SSSSSSSSSSSS', 'SssSssssSssS', 'SssSssssSssS', 'SSSSSSSSSSSS', 'SsssSssSsssS', 'SsssSssSsssS', 'SSSSSSSSSSSS', 'SssSssssSssS', 'SssSssssSssS', 'SSSSSSSSSSSS', '............', '............'],
  mem: ['.BBBBBBBBBB.', '.BwwwwwwwwB.', '.BwkkkkkkwB.', '.BwwwwwwwwB.', '.BwkkkkwwwB.', '.BwwwwwwwwB.', '.BwkkkkkkwB.', '.BwwwwwwwwB.', '.BwkkkwwwwB.', '.BBBBBBBBBB.', '............', '............'],
  belief: ['...wwwwww...', '..wccccccw..', '.wcwwccwwcw.', '.wccccccccw.', '.wcwwwwwccw.', '..wccccccw..', '...wwwwww...', '....ww......', '...ww.......', '..w.........', '............', '............'],
  need: ['............', '.rr....rr...', 'rrrr..rrrr..', 'rwrrrrrrrrr.', 'rrrrrrrrrrr.', '.rrrrrrrrr..', '..rrrrrrr...', '...rrrrr....', '....rrr.....', '.....r......', '............', '............'],
  goal: ['.kggggggg...', '.kggggggggg.', '.kgggggggg..', '.kggggg.....', '.k..........', '.k..........', '.k..........', '.k..........', '.k..........', 'kkk.........', '............', '............'],
  coin: ['............', '....oooo....', '..ooYYYYoo..', '.oYoooooYYo.', '.oYoYYYoYYo.', '.oYoYooYYYo.', '.oYoYYYoYYo.', '.oYoooooYYo.', '..ooYYYYoo..', '....oooo....', '............', '............'],
  bread: ['............', '............', '...yyyyyy...', '.yyYyyYyyy..', 'yyYyyYyyYyy.', 'yyyyyyyyyyy.', 'YyyyyyyyyyY.', '.YYYYYYYYY..', '............', '............', '............', '............'],
  house: ['.....rr.....', '....rrrr....', '...rrrrrr...', '..rrrrrrrr..', '.rrrrrrrrrr.', '..pppppppp..', '..pPPpppPp..', '..pPPpBBpp..', '..ppppBBpp..', '..ppppBBpp..', '..pppPBBpp..', '............'],
};
const icoCache = {};
UI.icon = function (name, scale) {
  const k = name + ':' + (scale || 4);
  if (icoCache[k]) return icoCache[k];
  const rows = ICONS[name] || ICONS.goal; const sc = scale || 4;
  const cv = document.createElement('canvas'); cv.width = 12 * sc; cv.height = 12 * sc;
  const g = cv.getContext('2d');
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = ICO_PAL[row[x]]; if (!c) continue; g.fillStyle = c; g.fillRect(x * sc, y * sc, sc, sc); } });
  return (icoCache[k] = cv.toDataURL());
};
UI.ico = (name, cls) => `<img class="${cls || 'pix'}" src="${UI.icon(name)}" alt="" width="24" height="24">`;

// ---------------- init ----------------
UI.init = function () {
  const hb = $('hotbar');
  G().hotbar.forEach((bid, i) => {
    const s = document.createElement('button'); s.className = 'slot'; s.title = W.BLOCKS[bid].name; s.setAttribute('aria-label', W.BLOCKS[bid].name);
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
    const t = W.BLOCKS[bid].tex[1];
    cv.getContext('2d').drawImage(AV.Render.atlasCanvas, (t % 8) * 16, Math.floor(t / 8) * 16, 16, 16, 0, 0, 16, 16);
    s.appendChild(cv); const k = document.createElement('b'); k.textContent = i + 1; s.appendChild(k);
    s.onclick = () => G().selectSlot(i); hb.appendChild(s);
  });
  $('feedFilter').innerHTML = '<option value="all">All villages</option>' + W.VILLAGES.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('');
  $('mPlay').onclick = () => G().setMode('play');
  $('mWatch').onclick = () => G().setMode('watch');
  $('bPost').onclick = () => UI.openPost();
  $('bGraph').onclick = () => UI.openGraph();
  $('bHeat').onclick = () => G().toggleHeat();
  $('bThink').onclick = () => { G().showThoughts = !G().showThoughts; $('bThink').classList.toggle('on', G().showThoughts); };
  $('bDev').onclick = () => UI.openDev();
  $('bMenu').onclick = () => UI.openMenu();
  $('fEvents').onclick = () => { UI.feedMode = 'events'; UI.feedSig = ''; $('fEvents').classList.add('on'); $('fMinds').classList.remove('on'); UI.renderFeed(); };
  $('fMinds').onclick = () => { UI.feedMode = 'minds'; UI.feedSig = ''; $('fMinds').classList.add('on'); $('fEvents').classList.remove('on'); UI.renderFeed(); };
  $('inspClose').onclick = () => UI.closeInspector();
  $('feedFilter').onchange = () => { UI.feedSig = ''; UI.renderFeed(); };
  $('clock').onclick = e => { if (window.innerWidth < 760 && !e.target.closest('button')) $('clock').classList.toggle('open'); };
  document.querySelectorAll('.modal [data-close]').forEach(b => b.onclick = () => UI.closeModal(b.closest('.modal').id));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m) UI.closeModal(m.id); }));
  $('dlgClose').onclick = () => UI.closeDialog();
  $('dlgForm').onsubmit = e => { e.preventDefault(); const v = $('dlgInput').value.trim(); if (v) { $('dlgInput').value = ''; UI.freeText(v); } };
  $('gCore').onclick = () => { UI.graphAll = false; $('gCore').classList.add('on'); $('gAll').classList.remove('on'); UI.layoutGraph(); };
  $('gAll').onclick = () => { UI.graphAll = true; $('gAll').classList.add('on'); $('gCore').classList.remove('on'); UI.layoutGraph(); };
  $('graphCv').addEventListener('click', UI.graphClick);
  UI.labels = {};
};

UI.toast = function (msg, ms) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(UI._tt); UI._tt = setTimeout(() => { t.hidden = true; }, ms || 2600);
};
UI.banner = function (head, text, ms) {
  $('bannerH').textContent = head; $('bannerT').textContent = text || ''; $('banner').hidden = false;
  clearTimeout(UI._bt); UI._bt = setTimeout(() => { $('banner').hidden = true; }, ms || 6500);
};
UI.modalOpen = () => [...document.querySelectorAll('.modal')].some(m => !m.hidden);
UI.openModal = id => { $(id).hidden = false; G().onModal(true); };
UI.closeModal = id => { $(id).hidden = true; G().onModal(UI.modalOpen()); };

// the village the viewer is in (or nearest)
UI.hereVid = function () {
  const p = G().viewPos(); const v = W.villageAt(p.x, p.z, 14);
  if (v) return v;
  let best = null, bd = 1e9; for (const vv of W.VILLAGES) { const d = Math.hypot(p.x - vv.cx, p.z - vv.cz); if (d < bd) { bd = d; best = vv.id; } }
  return best;
};

// ---------------- frame updates ----------------
let slowT = 0;
UI.frame = function (dt) {
  const s = S();
  slowT += dt;
  $('cDay').textContent = 'DAY ' + Sim.dayOf(s.t);
  $('cTime').textContent = Sim.fmtClock(s.t);
  if (slowT > 0.5) {
    slowT = 0;
    UI.renderStats();
    UI.renderFeed();
    if (!$('inspector').hidden) UI.renderInspector();
    const p = me();
    $('pCoins').textContent = Math.floor(p.money || 0);
    $('pBread').textContent = (p.inv && p.inv.bread) || 0;
    $('mPlay').classList.toggle('on', G().mode === 'play'); $('mWatch').classList.toggle('on', G().mode === 'watch');
    $('bHeat').classList.toggle('on', !!G().heat);
  }
};

function wxIcon(kind) {
  const c = kind === 'rain' ? ['#8bb3d1', '#5c6b7a'] : kind === 'cloudy' ? ['#c9c3b3', '#8a8371'] : kind === 'drought' ? ['#e09444', '#c0503e'] : ['#f2d06a', '#e09444'];
  if (kind === 'rain') return `<svg width="16" height="16" viewBox="0 0 8 8" aria-hidden="true"><rect x="1" y="1" width="6" height="3" fill="${c[1]}"/><rect x="2" y="5" width="1" height="2" fill="${c[0]}"/><rect x="5" y="5" width="1" height="2" fill="${c[0]}"/></svg>`;
  if (kind === 'cloudy') return `<svg width="16" height="16" viewBox="0 0 8 8" aria-hidden="true"><rect x="1" y="3" width="6" height="3" fill="${c[0]}"/><rect x="2" y="2" width="3" height="1" fill="${c[0]}"/></svg>`;
  return `<svg width="16" height="16" viewBox="0 0 8 8" aria-hidden="true"><rect x="2" y="2" width="4" height="4" fill="${c[0]}"/><rect x="3" y="0" width="2" height="1" fill="${c[1]}"/><rect x="3" y="7" width="2" height="1" fill="${c[1]}"/><rect x="0" y="3" width="1" height="2" fill="${c[1]}"/><rect x="7" y="3" width="1" height="2" fill="${c[1]}"/></svg>`;
}
UI.renderStats = function () {
  const s = S(); const vid = UI.hereVid(); if (!vid) return;
  const st = Sim.stats(vid); const V = s.villages[vid];
  const p = G().viewPos(); const inside = W.villageAt(p.x, p.z, 8) === vid;
  const wx = V.flags.drought > 0 ? 'drought' : s.weather.kind;
  $('cWx').innerHTML = wxIcon(wx) + esc(wx.toUpperCase());
  $('where').innerHTML = (inside ? 'In ' : 'Near ') + '<b>' + esc(V.name) + '</b> \u00B7 ' + esc(V.tier) + ' \u00B7 tech ' + V.tech;
  const h = V.econ.hist; const prev = h[h.length - 1];
  const ch = prev ? (st.bread - prev.bread) / prev.bread : 0;
  const poll = Object.entries(st.poll).sort((a, b) => b[1] - a[1]);
  const elec = st.electionIn === 0 ? 'TODAY' : st.electionIn > 0 ? 'in ' + st.electionIn + 'd' : '-';
  const rows = [
    ['Residents', st.pop],
    ['Bread', st.bread.toFixed(1) + 'c <span class="' + (ch > 0.02 ? 'up' : ch < -0.02 ? 'down' : '') + '">' + (ch > 0.02 ? '+' : '') + (Math.abs(ch) > 0.02 ? Math.round(ch * 100) + '%' : '') + '</span>'],
    ['Food', st.food + ' days'],
    ['Happiness', st.happy + '/100'],
    ['Crime', st.crime + ' (3 days)'],
    ['Avg mind', st.cognition],
    ['Mayor', esc(nm(st.mayor))],
    ['Election', elec + (poll.length ? ' \u00B7 ' + esc(nm(poll[0][0])) + ' leads' : '')],
    ['Treasury', st.treasury + 'c'],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  if (!$('inspector').hidden) UI.placeInspector();
};

UI.renderFeed = function () {
  const s = S(); const g = G();
  const f = $('feedFilter').value;
  if (UI.feedMode === 'minds') {
    const list = s.mindFeed.filter(m => f === 'all' || m.vid === f).slice(0, 50);
    const sig = 'm' + (list[0] ? list[0].id : 0) + ':' + list.length + f;
    if (sig === UI.feedSig) return; UI.feedSig = sig;
    $('feedList').innerHTML = list.map(m => `<button class="ev" data-who="${esc(m.agent || '')}"><time>${m.t && Sim.dayOf(m.t) !== Sim.dayOf(s.t) ? 'D' + Sim.dayOf(m.t) : Sim.fmtClock(m.t)}</time><span><span class="kind k-${esc(m.kind)}">${esc(String(m.kind || '').toUpperCase())}</span>${esc(m.text)}</span></button>`).join('') || '<div class="ev" style="display:block;color:var(--dim)">Minds are quiet. Give it a moment.</div>';
    $('feedList').querySelectorAll('[data-who]').forEach(b => b.onclick = () => { const id = b.dataset.who; if (s.byId[id]) { UI.openInspector(id); if (g.mode === 'watch') g.lookAt(s.byId[id]); } });
    return;
  }
  const watch = g.mode !== 'play';
  const pid = PID();
  const list = s.feed.filter(e => (watch || e.public || (e.seenBy && e.seenBy.includes(pid)) || e.actor === pid) && (f === 'all' || e.vid === f || e.to === f) && (watch || !e.secretive)).slice(0, 60);
  const sig = (list[0] ? list[0].id : 0) + ':' + list.length + ':' + watch + ':' + f;
  if (sig === UI.feedSig) return;
  UI.feedSig = sig;
  $('feedList').innerHTML = list.map(e => {
    const c = CAT[e.type] || 'social';
    const truth = watch && e.truth ? `<span class="truth">${esc(e.truth)}</span>` : '';
    return `<button class="ev" data-ev="${e.id}"><time>${e.day !== Sim.dayOf(s.t) ? 'D' + e.day : Sim.fmtClock(e.t)}</time><span><span class="tag t-${c}">${CAT_LABEL[c] || ''}</span>${esc(e.text)}${f === 'all' && e.vid ? ' <span style="color:var(--dim);font-size:12px">\u00B7 ' + esc(UI.vname(e.vid)) + '</span>' : ''}${truth}</span></button>`;
  }).join('') || '<div class="ev" style="display:block;color:var(--dim)">Nothing yet. Give it a few minutes.</div>';
  $('feedList').querySelectorAll('[data-ev]').forEach(b => b.onclick = () => UI.focusEvent(+b.dataset.ev));
};
UI.focusEvent = function (id) {
  const s = S(); const e = s.events.find(x => x.id === id) || s.feed.find(x => x.id === id); if (!e) return;
  const who = [e.actor, e.about, e.target].find(x => x && s.byId[x]);
  if (who) { UI.openInspector(who); if (G().mode === 'watch') G().lookAt(s.byId[who]); }
  else if (e.x !== undefined && G().mode === 'watch') G().lookAtPoint(e.x, e.z);
  if (e.type === 'NEWSPAPER') UI.openPost(undefined, e.vid);
};

// ---------------- cognition icons ----------------
// \u25CF deciding now  \u25CE language model reasoning  \u2194 in conversation  ! alarmed  Z asleep  \u25CB going about the day
UI.cogIcon = function (a) {
  const s = S();
  if (a.sleeping) return ['Z', 'i-sleep', 'asleep'];
  if (a.thinking === 'llm') return ['\u25CE', 'i-llm', 'the language model is reasoning for them'];
  if (a.convo) return ['\u2194', 'i-talk', 'in conversation'];
  const d = a.decisions && a.decisions[0];
  if (a.thinking === 'think' || (d && s.t - d.t < 2.5)) return ['\u25CF', 'i-think', 'deciding'];
  if (a.sick || a.injured || (a.plan && (a.plan.type === 'protest' || a.plan.type === 'investigate' || a.plan.type === 'clinic')) || (a.jailUntil > s.t)) return ['!', 'i-alert', 'alarmed'];
  return ['\u25CB', 'i-idle', 'going about the day'];
};

// ---------------- labels ----------------
UI.updateLabels = function (camera, agents, visitors, cinema) {
  const g = G(); const s = S();
  const wv = new AV.THREE.Vector3();
  const cam = camera.position;
  const W2 = window.innerWidth / 2, H2 = window.innerHeight / 2;
  const seen = new Set();
  const watch = g.mode !== 'play' || cinema;
  const cand = [];
  for (const a of agents.concat(visitors || [])) {
    if (a.left || a.hidden) continue;
    const n = AV.Render.npcs[a.id]; if (!n || !n.G.visible) continue;
    const d = Math.hypot(n.rx - cam.x, n.rz - cam.z, n.vy - cam.y);
    const range = cinema ? 42 : watch ? 46 : 22;
    if (d > range && g.selected !== a.id) continue;
    cand.push([a, n, d]);
  }
  cand.sort((x, y) => x[2] - y[2]);
  const nowMs = performance.now();
  let thoughtsShown = 0, bubbles = 0, tasks = 0;
  // on the homepage, keep labels off the text panels
  const avoid = cinema ? [...document.querySelectorAll('.hero3 .pitch, .hero3 .livecol')].map(e => e.getBoundingClientRect()) : [];
  const pid = PID();
  const known = (a) => watch || (me().known && me().known[a.id] && me().known[a.id].length) || (a.rel && a.rel[pid] && a.rel[pid][7] > 5);
  for (const [a, n, d] of cand.slice(0, 24)) {
    if (!n._visT || nowMs - n._visT > 250) { n._visT = nowMs; n._vis = g.selected === a.id || W.los(cam.x, cam.y, cam.z, n.rx, n.vy + 1.7, n.rz); }
    if (!n._vis) continue;
    wv.set(n.rx, n.vy + 2.05 * ((a.look && a.look.h) || 1), n.rz);
    wv.project(camera);
    if (wv.z > 1 || wv.z < -1 || Math.abs(wv.x) > 1.2 || Math.abs(wv.y) > 1.2) continue;
    if (avoid.length) { const sx = wv.x * W2 + W2, sy = -wv.y * H2 + H2; if (avoid.some(r => sx > r.left - 90 && sx < r.right + 90 && sy > r.top - 10 && sy < r.bottom + 50)) continue; }
    let el = UI.labels[a.id];
    if (!el) { el = document.createElement('div'); el.className = 'lbl'; el.innerHTML = '<div class="think" hidden></div><div class="say" hidden></div><div class="task" hidden></div><div class="nm"></div>'; $('labels').appendChild(el); UI.labels[a.id] = el; }
    seen.add(a.id);
    el.style.transform = `translate(${(wv.x * W2 + W2).toFixed(1)}px, ${(-wv.y * H2 + H2).toFixed(1)}px) translate(-50%, -100%)`;
    const showName = d < (watch ? 34 : 14) || g.selected === a.id;
    const nmEl = el.children[3];
    let label;
    if (a.visitor) { label = esc(a.name || 'Visitor') + ' <em>visitor</em>'; nmEl.classList.add('visitor'); }
    else {
      const ic = UI.cogIcon(a);
      label = (watch ? `<span class="ico ${ic[1]}" title="${ic[2]}">${ic[0]}</span>` : '') + esc(known(a) ? a.name : (AV.JOBS[a.job] ? AV.JOBS[a.job].label : 'Resident')) + (watch && !cinema ? ' <em>' + esc(planWord(a)) + '</em>' : cinema ? ' <em>' + esc(AV.JOBS[a.job] ? AV.JOBS[a.job].label.toLowerCase() : '') + '</em>' : '');
    }
    if (nmEl._l !== label) { nmEl.innerHTML = label; nmEl._l = label; }
    nmEl.hidden = !showName;
    const say = el.children[1];
    const bub = a.bubble && s.t - a.bubble.t < 6 && d < (watch ? 40 : 22) && (bubbles < 6 || g.selected === a.id) ? a.bubble.text : '';
    if (bub) bubbles++;
    if (say._t !== bub) { say.textContent = bub; say._t = bub; }
    say.hidden = !bub;
    const th = el.children[0];
    const tk = el.children[2];
    const taskTxt = !bub && !a.visitor && a.task && !a.sleeping && ((cinema && tasks < 7 && d < 40) || (watch && !cinema && tasks < 5 && d < 26 && !(g.showThoughts && a.thought))) ? a.task.t : '';
    if (taskTxt) tasks++;
    if (tk._t !== taskTxt) { tk.innerHTML = taskTxt ? '<b>\u25B8</b> ' + esc(taskTxt) : ''; tk._t = taskTxt; }
    tk.hidden = !taskTxt;
    const tt = watch && !cinema && g.showThoughts && a.thought && !bub && d < 34 && (thoughtsShown < 4 || g.selected === a.id) ? a.thought.text : '';
    if (tt) thoughtsShown++;
    if (th._t !== tt) { th.textContent = tt; th._t = tt; }
    th.hidden = !tt;
    el.style.opacity = d > 30 ? 0.75 : 1;
    el.style.zIndex = String(1000 - Math.round(d));
  }
  for (const id in UI.labels) if (!seen.has(id)) { UI.labels[id].remove(); delete UI.labels[id]; }
};
UI.clearLabels = function () { for (const id in UI.labels) UI.labels[id].remove(); UI.labels = {}; };
function planWord(a) {
  const s = S();
  if (a.sleeping) return 'asleep';
  if (a.jailUntil > s.t) return 'in jail';
  if (a.convo) return 'talking';
  const act = a.acting;
  if (act) return { wood: 'chopping wood', stone: 'quarrying', iron: 'mining iron', coal: 'mining coal', gold: 'digging for gold', food: 'harvesting', fish: 'fishing', clay: 'digging clay', wool: 'shearing', build: 'placing blocks', haul: 'hauling', plant: 'planting', till: 'tilling', tend: 'tending crops' }[act] || act;
  if (a.carryN || (a.carry && Object.keys(a.carry).length)) return 'carrying a load';
  const p = a.plan; if (!p) return '';
  const map = { work: 'working', eat: 'eating', socialize: 'socialising', rest: 'resting', gossip: 'gossiping', talk_to: 'talking', campaign: 'campaigning', investigate: 'investigating', steal: 'sneaking', help: 'helping', protest: 'protesting', vote: 'voting', visit: 'wandering', clinic: 'at the clinic', follow: 'following', commission: 'at the town hall', buy: 'shopping', mediate: 'mediating', jail: 'in jail', sleep: 'heading home', learn: 'studying', travel: 'travelling' };
  return map[p.type] || p.type;
}
UI.planWord = planWord;

// ---------------- structured decision summary (no hidden reasoning, just the inputs and the choice) ----------------
UI.decisionBlock = function (a, d) {
  d = d || (a.decisions && a.decisions[0]);
  if (!d) return '<div class="decision"><div class="row"><span>STATUS</span><span>No decision recorded yet.</span></div></div>';
  const w = d.why || {};
  const src = d.src === 'llm' ? '<span class="srcbadge ai">AI REASONING</span>' : '<span class="srcbadge eng">BEHAVIOR ENGINE</span>';
  const rows = [['PERCEIVED', w.perceived], ['BELIEVED', w.believed], ['GOAL', w.goal], ['RELATIONSHIP', w.rel], ['DECISION', w.decision || d.chosen], ['REASON', w.reason || d.reason]];
  return `<div class="decision">${rows.filter(r => r[1]).map(([k, v]) => `<div class="row${k === 'DECISION' ? ' dec' : ''}"><span>${k}</span><span>${esc(v)}</span></div>`).join('')}<div class="row"><span>SOURCE</span><span>${src} <span style="color:var(--dim);font-size:12.5px">${d.src === 'llm' ? 'the language model chose this, the engine checked it' : 'utility scores' + (w.margin !== undefined ? ', margin ' + w.margin : '') + (w.alt ? ', runner-up: ' + esc(w.alt) : '')} \u00B7 D${Sim.dayOf(d.t)} ${Sim.fmtClock(d.t)}</span></span></div></div>`;
};

// ---------------- inspection building blocks ----------------
UI.goalText = function (g) {
  if (!g) return 'get through the day';
  const t = g.type.replace(/_/g, ' ').toLowerCase();
  const tgt = g.target ? (S().byId[g.target] ? nm(g.target) : W.VBY[g.target] ? W.VBY[g.target].name : g.target) : '';
  return t + (tgt ? ' ' + tgt : '');
};
UI.taskBlock = function (a, big) {
  const t = a.task || { t: planWord(a), r: a.plan && a.plan.reason };
  return `<div class="${big ? 'taskbox' : 'itask'}"><div class="k">CURRENT TASK</div><div class="v">${esc(t.t || '')}</div><div class="k">REASON</div><div class="v r">${esc(t.r || '')}</div></div>`;
};
const CARRY_ICO = { wood: 'log', stone: 'stone', iron: 'stone', coal: 'stone', gold: 'coin', food: 'wheat', clay: 'stone', wool: 'mem' };
UI.inventory = function (a) {
  const items = [['coin', Math.round(a.money)], ['bread', a.inv.bread]];
  for (const [k, q] of Object.entries(a.carry || {})) if (q > 0) items.push([CARRY_ICO[k] || 'stone', q, k]);
  if (a.inv.tools) items.push(['pick', a.inv.tools]);
  return `<div class="inv" style="margin:6px 0 8px">${items.map(([ic, q, k]) => `<span class="it" title="${esc(k || ic)}"><img src="${UI.icon(ic)}" alt=""><b>${q}</b></span>`).join('')}</div>`;
};
const TRAIT_WORDS = { openness: ['curious', 'conventional'], conscientiousness: ['diligent', 'careless'], extraversion: ['outgoing', 'reserved'], agreeableness: ['kind', 'prickly'], neuroticism: ['anxious', 'calm'], ambition: ['ambitious', 'content'], greed: ['greedy', 'generous'], honesty: ['honest', 'deceitful'], empathy: ['empathetic', 'cold'], courage: ['brave', 'timid'], laziness: ['lazy', 'hard-working'], riskTolerance: ['bold', 'cautious'], sociability: ['sociable', 'solitary'], loyalty: ['loyal', 'fickle'], jealousy: ['jealous', 'secure'], curiosity: ['inquisitive', 'incurious'] };
UI.traitChips = function (a, n) {
  const list = Object.entries(a.p).filter(([k]) => TRAIT_WORDS[k]).sort((x, y) => Math.abs(y[1] - 0.5) - Math.abs(x[1] - 0.5)).slice(0, n || 4);
  return list.map(([k, v], i) => `<span class="chip ${['g', 'p', 's', ''][i % 4]}">${esc(TRAIT_WORDS[k][v >= 0.5 ? 0 : 1])}</span>`).join('');
};
UI.skillBars = function (a, n) {
  const sk = Object.entries(a.skills || {}).sort((x, y) => y[1] - x[1]).slice(0, n || 4);
  return `<div class="skillbars">${sk.map(([k, v]) => `<span>${esc(k)}</span><span class="bar"><i style="width:${Math.round(v)}%"></i></span><b>${Math.round(v)}</b>`).join('')}</div>`;
};

// ---------------- inspector ----------------
UI.openInspector = function (id) {
  const a = S().byId[id]; if (!a) return;
  G().selected = id;
  UI.inspTab = UI.inspTab || 'overview';
  $('inspector').hidden = false;
  document.body.classList.add('insp-open');
  UI.placeInspector();
  const cv = AV.Render.faceCanvas(a, 6); const fc = $('inspFace'); fc.width = cv.width; fc.height = cv.height; fc.getContext('2d').drawImage(cv, 0, 0);
  $('inspTabs')._sig = '';
  UI.renderInspector();
};
UI.placeInspector = function () {
  const el = $('inspector'); if (window.innerWidth < 760) { el.style.top = ''; el.style.maxHeight = ''; return; }
  const top = $('clock').getBoundingClientRect().bottom + 12;
  el.style.top = top + 'px'; el.style.maxHeight = 'calc(100vh - ' + (top + 14) + 'px)';
};
window.addEventListener('resize', () => { if (!$('inspector').hidden) UI.placeInspector(); });
UI.closeInspector = function () { $('inspector').hidden = true; document.body.classList.remove('insp-open'); G().selected = null; if (G().follow) G().follow = null; };
UI.renderInspector = function () {
  const s = S(); const a = s.byId[G().selected]; if (!a) return UI.closeInspector();
  const watch = G().mode !== 'play';
  const pid = PID();
  const tabs = watch ? [['overview', 'Overview'], ['why', 'Why'], ['mind', 'Mind'], ['social', 'Social']] : [['overview', 'What you see'], ['known', 'What you know']];
  if (!tabs.some(t => t[0] === UI.inspTab)) UI.inspTab = tabs[0][0];
  const tabSig = tabs.map(t => t[0]).join() + UI.inspTab;
  if ($('inspTabs')._sig !== tabSig) {
    $('inspTabs')._sig = tabSig;
    $('inspTabs').innerHTML = tabs.map(([k, l]) => `<button class="btn ${UI.inspTab === k ? 'on' : ''}" data-t="${k}">${l}</button>`).join('');
    $('inspTabs').querySelectorAll('button').forEach(b => b.onclick = () => { UI.inspTab = b.dataset.t; $('inspTabs')._sig = ''; UI.renderInspector(); });
  }
  const job = AV.JOBS[a.job] ? AV.JOBS[a.job].label : a.job;
  const p0 = me();
  const knownName = watch || (p0.known && p0.known[a.id] && p0.known[a.id].length);
  $('inspName').textContent = knownName ? a.name + (a.surname ? ' ' + a.surname : '') : 'A ' + job.toLowerCase();
  $('inspSub').textContent = job + ' \u00B7 ' + UI.vname(a.vid) + (watch && a.mind ? ' \u00B7 ' + a.mind.label : '') + ' \u00B7 ' + a.moodLabel;
  const body = $('inspBody');
  const keepScroll = body.scrollTop;
  let h = '';
  const relRow = (id, r) => `<li><button class="rowbtn" data-insp="${esc(id)}">${esc(nm(id))}</button> <span style="color:var(--dim)">trust ${Math.round(r[0])}, affection ${Math.round(r[1])}${r[5] > 20 ? ', resentment ' + Math.round(r[5]) : ''}</span>${a.summaries && a.summaries[id] ? '<br><span style="color:var(--muted)">' + esc(a.summaries[id]) + '</span>' : ''}</li>`;
  if (UI.inspTab === 'overview') {
    const p = a.plan;
    if (watch) {
      h += UI.taskBlock(a);
      h += UI.inventory(a);
      const need = Object.entries(a.needs).sort((x, y) => x[1] - y[1])[0];
      h += `<div class="kv"><span>Most needs</span><span>${esc(need[0])} (${pct(Math.max(0, need[1]))})</span><span>Money</span><span>${Math.round(a.money)} coins${a.debt ? ' \u00B7 owes ' + Math.round(a.debt) : ''}</span><span>Home</span><span>${esc(Sim.placeName(a.home))}</span></div>`;
      h += `<h4>Personality</h4><div style="display:flex;flex-wrap:wrap;gap:4px">${UI.traitChips(a)}</div>`;
      h += `<h4>Skills</h4>` + UI.skillBars(a, 4);
      const mems = a.memories.slice(-3).reverse();
      if (mems.length) h += `<h4>Recent memory</h4><ul class="list">${mems.map(m => `<li><span style="color:var(--dim)">${Sim.fmtClock(m.t)}</span> ${esc(m.text)}</li>`).join('')}</ul>`;
      const top = Sim.topRelations(a, 2);
      h += `<h4>Relationships</h4><ul class="list">${top.friends.map(f => relRow(f.id, f.r)).join('')}${top.rivals.slice(0, 1).map(f => relRow(f.id, f.r)).join('')}</ul>`;
      if (a.thought) h += `<h4>Current thought</h4><div class="thought">"${esc(a.thought.text)}"</div>`;
      h += `<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn" id="iFollow">${G().follow === a.id ? 'Stop following' : 'Follow'}</button><button class="btn" id="iProfile">Mind profile</button><button class="btn" id="iAsk">Ask the AI what ${esc(a.name)} does next</button></div><div id="iAskOut" style="margin-top:6px;font-size:13px;color:var(--muted)"></div>`;
    } else {
      const doing = planWord(a) + (p && p.place ? ' \u00B7 ' + Sim.placeName(p.place) : '');
      h += `<div class="kv"><span>Doing</span><span>${esc(doing)}</span></div>`;
      const r = a.rel[pid] || [0, 0, 0, 0, 0, 0, 0, 0];
      const standing = r[0] > 35 ? 'trusts you' : r[0] > 10 ? 'is warming to you' : r[0] < -30 ? 'distrusts you' : r[0] < -10 ? 'is wary of you' : 'does not know what to make of you yet';
      h += `<h4>Your standing</h4><div>${esc(knownName ? a.name : 'This resident')} ${standing}.${r[5] > 25 ? ' There is resentment there.' : ''}${r[1] > 35 ? ' They like you.' : ''}</div>`;
      h += `<h4>What you can see</h4><div style="color:var(--muted)">${esc(a.moodLabel)} \u00B7 ${esc(planWord(a))}</div>`;
      h += `<p style="color:var(--dim);font-size:12.5px;margin-top:10px">Switch to WATCH to read minds, beliefs and secrets.</p>`;
    }
  } else if (UI.inspTab === 'known') {
    const k = (p0.known && p0.known[a.id]) || [];
    h += `<h4>Things you have learned</h4>` + (k.length ? `<ul class="list">${k.map(x => `<li><span style="color:var(--dim)">D${Sim.dayOf(x.t)} ${Sim.fmtClock(x.t)}</span> ${esc(x.text)}</li>`).join('')}</ul>` : '<div style="color:var(--muted)">Nothing yet. Talk to them.</div>');
  } else if (UI.inspTab === 'why') {
    h += `<h4>Recent decisions</h4>` + (a.decisions || []).slice(0, 5).map(d => UI.decisionBlock(a, d)).join('<div style="height:8px"></div>');
    const pg = (a.goals || []).find(g => g.primary) || (a.goals || [])[0];
    h += `<h4>Goals</h4><ul class="list">${(a.goals || []).map(g => `<li>${g === pg ? '<b>' : ''}${esc(UI.goalText(g))}${g === pg ? '</b>' : ''}</li>`).join('')}</ul>`;
    h += `<h4>Needs</h4><div class="bars">${Object.entries(a.needs).map(([k, v]) => `<span>${k}</span><div class="bar"><i style="width:${pct(Math.max(0, v))}"></i></div>`).join('')}</div>`;
    h += `<p style="color:var(--dim);font-size:12.5px">Decisions come from the behavior engine (utility over needs, goals, beliefs, relationships and personality) unless marked AI REASONING. Think interval ${a.mind ? a.mind.think : '?'} min.</p>`;
  } else if (UI.inspTab === 'mind') {
    h += `<h4>Beliefs (not facts)</h4>`;
    const bels = a.beliefs.slice().sort((x, y) => y.conf - x.conf).slice(0, 14);
    h += bels.length ? `<ul class="list">${bels.map(b => {
      const tr = b.chain ? Sim.truthOf(b.chain, b.level) : null;
      const tag = tr === true ? '<span class="pill good">true</span>' : tr === false ? '<span class="pill bad">false</span>' : '';
      const src = b.src === 'self' ? 'own judgement' : b.src === 'witness' ? 'saw it' : b.src === 'news' ? 'the paper' : 'from ' + nm(b.src);
      return `<li>${esc(Sim.cap(Sim.claimText(b, b.level)))} <span style="color:var(--dim)">${pct(b.conf)} \u00B7 ${esc(src)}${b.hops ? ' \u00B7 ' + b.hops + ' hops' : ''}</span> ${tag}${b.chain ? ` <button class="rowbtn" data-chain="${b.chain}">trace</button>` : ''}</li>`;
    }).join('')}</ul>` : '<div style="color:var(--muted)">No strong beliefs yet.</div>';
    h += `<h4>Recent memories</h4><ul class="list">${a.memories.slice(-10).reverse().map(m => `<li><span style="color:var(--dim)">D${Sim.dayOf(m.t)} ${Sim.fmtClock(m.t)} \u00B7 str ${Sim.strength(m).toFixed(2)}</span><br>${esc(m.text)}</li>`).join('')}</ul>`;
    if (a.secrets.length) h += `<h4>Secrets</h4>${a.secrets.map(id => { const sc = s.secrets[id]; if (!sc) return ''; return `<div class="secret">${esc(sc.text)}<br><span style="color:var(--dim)">${sc.exposed ? 'Exposed: everyone knows.' : 'Known by ' + sc.knownBy.length + ': ' + esc(sc.knownBy.slice(0, 6).map(nm).join(', ') || 'nobody')}</span></div>`; }).join('')}`;
  } else if (UI.inspTab === 'social') {
    const top = Sim.topRelations(a, 4);
    h += `<h4>Closest</h4><ul class="list">${top.friends.map(f => relRow(f.id, f.r)).join('')}</ul>`;
    h += `<h4>Friction</h4>` + (top.rivals.length ? `<ul class="list">${top.rivals.map(f => relRow(f.id, f.r)).join('')}</ul>` : '<div style="color:var(--muted)">Nobody in particular.</div>');
    const r = a.rel[pid];
    if (r) h += `<h4>Opinion of you</h4><div class="kv"><span>Trust</span><span>${Math.round(r[0])}</span><span>Respect</span><span>${Math.round(r[2])}</span><span>Fear</span><span>${Math.round(r[3])}</span><span>Familiarity</span><span>${Math.round(r[7])}</span></div>`;
    const el = s.villages[a.vid] && s.villages[a.vid].election;
    if (el && el.candidates && el.candidates.length) { Sim.useVillage(a.vid); const sc = Sim.voteScores(a); const best = Object.entries(sc).sort((x, y) => y[1] - x[1])[0]; h += `<h4>Vote leaning</h4><div>${best ? esc(nm(best[0])) : '?'} <span style="color:var(--dim)">(${Object.entries(sc).map(([c, v]) => nm(c) + ' ' + v.toFixed(2)).join(', ')})</span></div>`; }
    if (a.couple) h += `<h4>Partner</h4><div>${esc(nm(a.couple))}</div>`;
  }
  body.innerHTML = h;
  body.scrollTop = keepScroll;
  body.querySelectorAll('[data-insp]').forEach(b => b.onclick = () => UI.openInspector(b.dataset.insp));
  body.querySelectorAll('[data-chain]').forEach(b => b.onclick = () => UI.openDev('rumors', b.dataset.chain));
  const fb = $('iFollow'); if (fb) fb.onclick = () => { G().follow = G().follow === a.id ? null : a.id; UI.renderInspector(); };
  const pb = $('iProfile'); if (pb) pb.onclick = () => AV.Pages.go('mind', a.id);
  const ab = $('iAsk'); if (ab) ab.onclick = () => G().askDecision(a, $('iAskOut'));
};

// ---------------- dialogue (actions run on the host; replies come back) ----------------
UI.openDialog = function (id) {
  const s = S(); const a = s.byId[id]; if (!a) return;
  if (!Net().canWrite && Net().shared()) { UI.toast('Viewers can watch. Ask the owner for Contributor access to talk to residents.', 4200); return; }
  UI.dlg = { id, history: [] };
  $('dialog').hidden = false;
  const cv = AV.Render.faceCanvas(a, 6); const fc = $('dlgFace'); fc.width = cv.width; fc.height = cv.height; fc.getContext('2d').drawImage(cv, 0, 0);
  $('dlgLog').innerHTML = '';
  G().onDialog(true, a);
  UI.dlgHeader();
  UI.act('greet', [id]);
  UI.dlgActions();
  $('dlgFoot').textContent = AV.LLM.ready() ? 'Free text is answered by the language model in ' + a.name + '\'s voice, using only what ' + a.name + ' knows. Replies are checked before they change the world.' : 'Free text uses the built-in responder. Turn on AI conversations in the ? menu for open conversation.';
  setTimeout(() => $('dlgInput').focus(), 30);
};
UI.act = async function (op, args) {
  const r = await Net().rpc(op, args);
  if (!UI.dlg) return r;
  if (!r || !r.ok) { UI.addLines([{ who: 'sys', text: r && r.error === 'spectator' ? 'You are watching as a viewer, so residents cannot hear you.' : 'No answer (' + ((r && r.error) || 'offline') + ').' }]); return r; }
  const res = r.result;
  if (Array.isArray(res)) UI.addLines(res);
  else if (res && Array.isArray(res.lines)) UI.addLines(res.lines);
  else if (typeof res === 'string') UI.addLines([{ who: 'sys', text: res }]);
  UI.dlgActions();
  return r;
};
UI.dlgHeader = function () {
  const s = S(); const a = s.byId[UI.dlg.id]; const pid = PID();
  const r = a.rel[pid] || [0, 0, 0, 0, 0, 0, 0, 0];
  const known = (me().known && me().known[a.id] && me().known[a.id].length) || r[7] > 5;
  $('dlgName').textContent = known ? a.name : 'A ' + (AV.JOBS[a.job] ? AV.JOBS[a.job].label.toLowerCase() : 'resident');
  const st = r[0] > 35 ? 'trusts you' : r[0] > 10 ? 'warming to you' : r[0] < -30 ? 'distrusts you' : r[0] < -10 ? 'wary of you' : 'unsure of you';
  $('dlgSub').textContent = (AV.JOBS[a.job] ? AV.JOBS[a.job].label : '') + ' \u00B7 ' + UI.vname(a.vid) + ' \u00B7 ' + a.moodLabel + ' \u00B7 ' + st;
};
UI.addLines = function (lines) {
  const s = S(); const log = $('dlgLog'); const pid = PID();
  for (const l of lines) {
    const d = document.createElement('div');
    if (l.who === 'you' || l.who === pid) { d.className = 'me'; d.textContent = l.text; }
    else if (l.who === 'sys') { d.className = 'sys'; d.textContent = l.text; }
    else { d.className = 'them'; d.innerHTML = '<b>' + esc(nm(l.who)) + '</b>' + esc(l.text); const a = s.byId[l.who]; if (a) a.bubble = { text: l.text, t: s.t }; }
    log.appendChild(d);
    if (UI.dlg && l.who !== 'sys') UI.dlg.history.push({ who: l.who === 'you' || l.who === pid ? 'you' : 'them', text: l.text });
  }
  log.scrollTop = log.scrollHeight;
  if (UI.dlg) UI.dlgHeader();
};
UI.closeDialog = function () { if (!UI.dlg) return; $('dialog').hidden = true; G().onDialog(false, S().byId[UI.dlg.id]); UI.dlg = null; };
function optPeople(excl, vid) { return S().agents.filter(a => !a.left && a.id !== excl && (!vid || a.vid === vid)).sort((x, y) => ((y.core ? 1 : 0) - (x.core ? 1 : 0)) || x.name.localeCompare(y.name)).map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join(''); }
UI.dlgActions = function () {
  if (!UI.dlg) return;
  const s = S(); const a = s.byId[UI.dlg.id]; const d = Sim.dayOf(s.t); const p = me();
  const el = s.villages[a.vid].election;
  const acts = [['news', 'What is new?'], ['ask', 'Ask about someone'], ['tell', 'Tell them something'], ['case', 'Ask about the thefts']];
  if (p.inv && p.inv.bread > 0) acts.push(['bread', 'Give bread']);
  if (p.money >= 5) acts.push(['coins', 'Give 5 coins']);
  if (['baker', 'shopkeeper', 'merchant', 'bartender'].includes(a.job) || Object.values(s.shops).some(sh => sh.owner === a.id && sh.sells.some(g => g === 'bread' || g === 'meal'))) acts.push(['buy', 'Buy bread']);
  if (AV.JOBS[a.job] && (AV.JOBS[a.job].gather || ['builder', 'baker', 'blacksmith'].includes(a.job))) acts.push(['work', 'Help with work']);
  if (a.job === 'guard' || a.job === 'nightguard') acts.push(['accuse', 'Report a suspect']);
  if (el.candidates.length) acts.push(['support', 'Ask for their vote']);
  if (d === el.day && p.votedDay !== d) el.candidates.forEach(c => acts.push(['vote:' + c, 'Cast my vote: ' + nm(c)]));
  $('dlgActions').innerHTML = acts.map(([k, l]) => `<button class="pbtn" data-a="${k}">${esc(l)}</button>`).join('');
  $('dlgActions').querySelectorAll('button').forEach(b => b.onclick = () => UI.dlgDo(b.dataset.a));
};
UI.dlgDo = function (k) {
  const s = S(); const id = UI.dlg.id; const a = s.byId[id];
  const sub = $('dlgSub2');
  const say = t => UI.addLines([{ who: 'you', text: t }]);
  if (k === 'news') { say('What is new around here?'); UI.act('news', [id]); }
  else if (k === 'case') { say('Do you know anything about the thefts?'); UI.act('case', [id]); }
  else if (k === 'bread') { say('Here, have some bread.'); UI.act('give', [id, 'bread']); }
  else if (k === 'coins') { say('Take these coins.'); UI.act('give', [id, 'coins']); }
  else if (k === 'buy') { say('One loaf, please.'); UI.act('buy', [id]); }
  else if (k === 'work') { say('Need a hand?'); UI.act('work', [id]); }
  else if (k.startsWith('vote:')) { UI.act('vote', [k.slice(5)]); }
  else if (k === 'ask') {
    sub.innerHTML = `<label for="sAsk">About</label><select id="sAsk">${optPeople(null, a.vid)}<option value="you">me</option></select><button class="pbtn" id="sAskGo">Ask</button>`;
    $('sAskGo').onclick = () => { const v = $('sAsk').value; say(v === 'you' ? 'What do you think of me?' : 'What do you make of ' + nm(v) + '?'); UI.act('opinion', [id, v === 'you' ? PID() : v]); sub.innerHTML = ''; };
    return;
  } else if (k === 'tell') {
    const places = ['bakery', 'store', 'market', 'tavern', 'forge'].map(x => Sim.vp(x, a.vid)).filter(Boolean);
    sub.innerHTML = `<select id="tWho" aria-label="Who">${optPeople(null, a.vid)}</select><select id="tWhat" aria-label="Claim"><option value="theft:0">was near the place at night</option><option value="theft:2">probably stole from</option><option value="theft:3">robbed</option><option value="fraud:1">cheats customers</option><option value="liar:1">lies a lot</option><option value="skips:1">keeps skipping work</option><option value="corrupt:2">steals from the treasury</option><option value="helped:1">is generous</option><option value="innocent:0">was wrongly accused</option></select><select id="tWhere" aria-label="Place">${places.map(p => `<option value="${p}">${esc(Sim.placeName(p))}</option>`).join('')}</select><button class="pbtn" id="tGo">Say it</button>`;
    $('tGo').onclick = () => {
      const [type, lv] = $('tWhat').value.split(':'); const about = $('tWho').value; const place = $('tWhere').value;
      const claim = { type, about, level: +lv, place: (type === 'theft' || type === 'innocent') ? place : null };
      say(Sim.cap(Sim.claimText(claim, +lv)) + '.');
      UI.act('tell', [id, claim]); sub.innerHTML = '';
    };
    return;
  } else if (k === 'accuse') {
    sub.innerHTML = `<label for="aWho">Suspect</label><select id="aWho">${optPeople(id, a.vid)}</select><button class="pbtn" id="aGo">Report</button>`;
    $('aGo').onclick = () => { const v = $('aWho').value; say('I think ' + nm(v) + ' is behind the theft.'); UI.act('accuse', [id, v]); sub.innerHTML = ''; };
    return;
  } else if (k === 'support') {
    const el = s.villages[a.vid].election;
    sub.innerHTML = `<label for="vWho">Vote for</label><select id="vWho">${el.candidates.map(c => `<option value="${c}">${esc(nm(c))}</option>`).join('')}</select><button class="pbtn" id="vGo">Ask</button>`;
    $('vGo').onclick = () => { const v = $('vWho').value; say('You should vote for ' + nm(v) + '.'); UI.act('support', [id, v]); sub.innerHTML = ''; };
    return;
  }
};

UI.freeText = async function (text) {
  const s = S(); const id = UI.dlg.id; const a = s.byId[id];
  UI.addLines([{ who: 'you', text }]);
  if (AV.LLM.ready()) {
    const wait = document.createElement('div'); wait.className = 'sys'; wait.textContent = a.name + ' is thinking...'; $('dlgLog').appendChild(wait);
    $('dlgInput').disabled = true;
    a.thinking = 'llm';
    try {
      const prompt = Sim.buildDialoguePrompt(PID(), a, text, UI.dlg.history.slice(0, -1));
      const j = await AV.LLM.json(prompt, { tier: 'quick' });
      const r = await Net().rpc('dialogue', [id, text, j]);
      wait.remove();
      if (!r || !r.ok) throw { code: 'invalid', message: r && r.error };
      UI.addLines([{ who: a.id, text: r.reply }]);
      if (r.applied && r.applied.length) UI.addLines([{ who: 'sys', text: a.name + ' took note: ' + r.applied.join('; ') + '.' }]);
    } catch (e) {
      wait.remove();
      if (e && (e.code === 'not_granted' || e.code === 'sampling_disabled')) AV.LLM.disable();
      UI.addLines([{ who: 'sys', text: e && e.code === 'rate_limited' ? 'The language model is busy. Using the built-in responder.' : 'The language model could not answer, so the built-in responder took over.' }]);
      await fallbackReply(a, text);
    }
    a.thinking = null;
    $('dlgInput').disabled = false; $('dlgInput').focus();
  } else await fallbackReply(a, text);
  UI.dlgActions();
};

// rule-based understanding when the language model is unavailable; every effect still goes through the host
function fallbackReply(a, text) {
  const s = S(); const t = text.toLowerCase(); const id = a.id;
  const who = s.agents.filter(x => !x.left && t.includes(x.name.toLowerCase())).map(x => x.id);
  const placeKind = ['bakery', 'store', 'market', 'tavern', 'forge', 'treasury'].find(p => t.includes(p)) || (t.includes('shop') ? 'store' : null);
  const place = placeKind && placeKind !== 'treasury' ? Sim.vp(placeKind, a.vid) : Sim.vp('store', a.vid);
  const about = who.find(x => x !== a.id) || who[0];
  if (about && /(stole|steal|thief|rob|took)/.test(t)) return UI.act('tell', [id, { type: 'theft', about, level: /(robbed|stole|thief)/.test(t) ? 3 : 2, place }]);
  if (about && /(chalk|cheat|fraud|rip)/.test(t)) return UI.act('tell', [id, { type: 'fraud', about, level: 1 }]);
  if (about && /(treasury|skim|corrupt|embezzl)/.test(t)) return UI.act('tell', [id, { type: 'corrupt', about, level: 2 }]);
  if (about && /(lie|liar|lying)/.test(t)) return UI.act('tell', [id, { type: 'liar', about, level: 1 }]);
  if (about && /(lazy|skip|never work)/.test(t)) return UI.act('tell', [id, { type: 'skips', about, level: 1 }]);
  if (about && /(kind|generous|helped|good person)/.test(t)) return UI.act('tell', [id, { type: 'helped', about, level: 1 }]);
  if (about && /(innocent|didn't|did not|framed)/.test(t)) return UI.act('tell', [id, { type: 'innocent', about, level: 0, place }]);
  if (about && /(think|opinion|feel|like|trust|know)/.test(t)) return UI.act('opinion', [id, about]);
  if (/(news|new|heard|gossip|rumou?r|happen)/.test(t)) return UI.act('news', [id]);
  if (/(theft|robbery|stolen|crime)/.test(t)) return UI.act('case', [id]);
  if (/(how are you|how's it|you ok|feeling)/.test(t)) { UI.addLines([{ who: a.id, text: { hungry: 'Hungry, honestly.', exhausted: 'Dead on my feet.', angry: 'Do not ask.', lonely: 'Glad someone stopped to talk.', cheerful: 'Good! Really good.', gloomy: 'Could be better.', anxious: 'On edge. Things keep going missing.', smug: 'Never better.', unwell: 'Not well at all.', jailed: 'How do you think?' }[a.moodLabel] || 'Getting by.' }]); return; }
  if (/(job|work|do you do)/.test(t)) { UI.addLines([{ who: a.id, text: 'I am the ' + (AV.JOBS[a.job] ? AV.JOBS[a.job].label.toLowerCase() : 'resident') + ' here in ' + UI.vname(a.vid) + '.' }]); return; }
  return UI.act('greet', [id]);
}

// ---------------- papers (one per village) ----------------
UI.openPost = function (idx, vid) {
  const s = S(); vid = vid || UI.postVid || UI.hereVid();
  const list = s.news.filter(n => n.vid === vid);
  if (!list.length) { UI.toast('The first issue of ' + (Sim.PAPERS[vid] || 'the paper') + ' goes out at 06:00.'); return; }
  UI.postVid = vid;
  const i = idx === undefined ? list.length - 1 : Math.max(0, Math.min(list.length - 1, idx));
  const n = list[i];
  const ed = s.byId[n.by];
  const [lead, ...rest] = n.headlines;
  let h = `<div class="masthead"><div class="name">${esc((n.paper || Sim.PAPERS[vid] || 'THE POST').toUpperCase())}</div><div class="meta"><span>No. ${n.no}</span><span>Day ${n.day}</span><span>${esc(UI.vname(vid))}</span><span>${ed ? 'Edited by ' + esc(ed.name) : ''}</span></div></div>`;
  h += `<div class="lead"><h3>${esc(lead.h)}</h3><p>${esc(lead.body)}</p></div>`;
  if (rest.length) h += `<div class="cols">${rest.map(x => `<div><h4>${esc(x.h)}</h4><p>${esc(x.body)}</p></div>`).join('')}</div>`;
  if (!n.missing) h += `<div class="column"><div class="by">From the editor's desk</div><div id="colText"><p>${esc(n.column || '')}</p></div><button class="pbtn" id="colBtn">${n.column ? 'Rewrite' : 'Read ' + (ed ? esc(ed.name) + '\'s' : 'the') + ' column'}</button></div>`;
  $('paper').innerHTML = h;
  $('issues').innerHTML = W.VILLAGES.map(v => `<button class="pbtn" data-v="${v.id}" ${v.id === vid ? 'disabled' : ''}>${esc(v.name)}</button>`).join('') + ' \u00B7 ' + list.map((x, k) => `<button class="pbtn" data-i="${k}" ${k === i ? 'disabled' : ''}>No. ${x.no}</button>`).join('') + '<button class="pbtn" id="postClose">Close</button>';
  $('issues').querySelectorAll('[data-i]').forEach(b => b.onclick = () => UI.openPost(+b.dataset.i, vid));
  $('issues').querySelectorAll('[data-v]').forEach(b => b.onclick = () => UI.openPost(undefined, b.dataset.v));
  $('postClose').onclick = () => UI.closeModal('post');
  const cb = $('colBtn'); if (cb) cb.onclick = () => UI.writeColumn(n);
  UI.openModal('post');
};
UI.writeColumn = async function (n) {
  const out = $('colText'); const s = S(); const ed = s.byId[n.by];
  if (!AV.LLM.ready()) {
    const lead = n.headlines[0];
    n.column = 'Another day, another headline. ' + Sim.cap(lead.h.toLowerCase()) + '. ' + (n.headlines[1] ? 'Elsewhere: ' + n.headlines[1].h.toLowerCase() + '. ' : '') + 'I report what I can confirm and print what I cannot as rumour, clearly marked. ' + (ed ? ed.name : '');
    out.innerHTML = '<p>' + esc(n.column) + '</p>';
    return;
  }
  out.innerHTML = '<p><i>' + esc(ed ? ed.name : 'The editor') + ' is writing...</i></p>';
  try {
    const prompt = Sim.columnPrompt(n);
    const r = await AV.LLM.text(prompt, { tier: 'quick', onText: t => { out.innerHTML = '<p>' + esc(t) + '</p>'; } });
    n.column = r.slice(0, 1200);
    out.innerHTML = '<p>' + esc(n.column) + '</p>';
  } catch (e) { out.innerHTML = '<p>The column could not be written right now.</p>'; }
};

// ---------------- relationship graph (one village, or the featured minds of all five) ----------------
UI.openGraph = function () { UI.openModal('graph'); requestAnimationFrame(() => UI.layoutGraph()); };
UI.layoutGraph = function () {
  const s = S(); const cv = $('graphCv'); const r = cv.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const vid = UI.hereVid();
  $('gCore').textContent = UI.vname(vid);
  const people = s.agents.filter(a => !a.left && (UI.graphAll ? (a.core || a.featured) : a.vid === vid));
  const edges = [];
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    const a = people[i], b = people[j]; const ra = a.rel[b.id], rb = b.rel[a.id]; if (!ra || !rb) continue;
    const aff = (ra[1] + rb[1]) / 2, tr = (ra[0] + rb[0]) / 2, res = Math.max(ra[5], rb[5]), att = Math.max(ra[6], rb[6]);
    let kind = null, w = 0;
    if (a.couple === b.id || att > 45) { kind = 'romance'; w = att; }
    else if (a.family.includes(b.id)) { kind = 'family'; w = 60; }
    else if (res > 35 || tr < -28) { kind = 'rivalry'; w = Math.max(res, -tr); }
    else if ((a.support[b.id] || 0) > 0.5 || (b.support[a.id] || 0) > 0.5) { kind = 'politics'; w = 50; }
    else if (aff > 26) { kind = 'friend'; w = aff; }
    if (kind) edges.push([i, j, kind, w]);
  }
  const N = people.length, Wd = cv.width, Hd = cv.height;
  const P = people.map((a, i) => ({ x: Wd / 2 + Math.cos(i / N * Math.PI * 2) * Wd * 0.33, y: Hd / 2 + Math.sin(i / N * Math.PI * 2) * Hd * 0.33, vx: 0, vy: 0 }));
  for (let it = 0; it < 260; it++) {
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = P[j].x - P[i].x, dy = P[j].y - P[i].y, d2 = dx * dx + dy * dy + 0.01, f = 7000 * dpr * dpr / d2;
      const d = Math.sqrt(d2); P[i].vx -= f * dx / d; P[i].vy -= f * dy / d; P[j].vx += f * dx / d; P[j].vy += f * dy / d;
    }
    for (const [i, j, k, w] of edges) {
      const dx = P[j].x - P[i].x, dy = P[j].y - P[i].y; const d = Math.hypot(dx, dy) + 0.01;
      const target = (k === 'rivalry' ? 260 : 120) * dpr; const f = (d - target) * 0.012 * (0.4 + w / 120);
      P[i].vx += f * dx / d; P[i].vy += f * dy / d; P[j].vx -= f * dx / d; P[j].vy -= f * dy / d;
    }
    for (const p of P) { p.vx += (Wd / 2 - p.x) * 0.004; p.vy += (Hd / 2 - p.y) * 0.004; p.x += p.vx * 0.5; p.y += p.vy * 0.5; p.vx *= 0.55; p.vy *= 0.55; p.x = Math.max(40 * dpr, Math.min(Wd - 40 * dpr, p.x)); p.y = Math.max(30 * dpr, Math.min(Hd - 30 * dpr, p.y)); }
  }
  UI.graph = { people, P, edges, dpr };
  const g = cv.getContext('2d'); g.clearRect(0, 0, Wd, Hd);
  const col = { friend: '#7d9b52', romance: '#e07aa0', rivalry: '#c0503e', politics: '#8bb3d1', family: '#d8b14a' };
  for (const [i, j, k, w] of edges) { g.strokeStyle = col[k]; g.globalAlpha = 0.75; g.lineWidth = Math.max(1, w / 22) * dpr; g.beginPath(); g.moveTo(P[i].x, P[i].y); g.lineTo(P[j].x, P[j].y); g.stroke(); }
  g.globalAlpha = 1;
  people.forEach((a, i) => {
    const p = P[i]; const sz = (a.core || a.featured ? 10 : 7) * dpr;
    g.fillStyle = s.villages[a.vid].town.mayor === a.id ? '#d8b14a' : a.jailUntil > s.t ? '#c0503e' : UI.graphAll ? UI.vcol(a.vid) : '#ebdcb6';
    g.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
    g.fillStyle = '#efe7d3'; g.font = `${11 * dpr}px "Pixelify Sans", monospace`; g.textAlign = 'center';
    g.fillText(a.name, p.x, p.y - sz / 2 - 4 * dpr);
  });
};
UI.graphClick = function (e) {
  if (!UI.graph) return; const r = e.target.getBoundingClientRect(); const x = (e.clientX - r.left) * UI.graph.dpr, y = (e.clientY - r.top) * UI.graph.dpr;
  let best = -1, bd = 22 * UI.graph.dpr;
  UI.graph.P.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } });
  if (best >= 0) { UI.closeModal('graph'); UI.openInspector(UI.graph.people[best].id); }
};

// ---------------- logs ----------------
UI.openDev = function (tab, arg) {
  UI.devTab = tab || UI.devTab || 'events'; UI.devArg = arg;
  const tabs = [['events', 'Event log'], ['decisions', 'Decision log'], ['agents', 'Residents'], ['memory', 'Memory'], ['rumors', 'Rumors'], ['economy', 'Economy'], ['sync', 'Shared world'], ['prompts', 'Prompts']];
  $('devTabs').innerHTML = tabs.map(([k, l]) => `<button class="btn ${UI.devTab === k ? 'on' : ''}" data-t="${k}">${l}</button>`).join('');
  $('devTabs').querySelectorAll('button').forEach(b => b.onclick = () => UI.openDev(b.dataset.t));
  UI.renderDev();
  UI.openModal('dev');
};
UI.renderDev = function () {
  const s = S(); let h = '';
  const sel = s.byId[G().selected] || s.byId.ada || s.agents[0];
  const vid = UI.hereVid(); const V = s.villages[vid];
  if (UI.devTab === 'events') {
    h += `<div class="tbl-wrap"><table class="tbl"><tr><th>When</th><th>Village</th><th>Type</th><th>What happened</th><th>World truth</th></tr>${s.events.slice(-140).reverse().map(e => `<tr><td>D${e.day} ${Sim.fmtClock(e.t)}</td><td>${esc(UI.vname(e.vid))}</td><td>${esc(e.type)}</td><td style="white-space:normal">${esc(e.text)}</td><td style="white-space:normal;color:var(--ember)">${esc(e.truth || '')}</td></tr>`).join('')}</table></div>`;
  } else if (UI.devTab === 'decisions') {
    h += `<div class="tbl-wrap"><table class="tbl"><tr><th>Resident</th><th>When</th><th>Chose</th><th>Source</th><th>Reason</th><th>Top options (utility)</th></tr>${s.agents.filter(a => a.decisions && a.decisions[0]).sort((x, y) => y.decisions[0].t - x.decisions[0].t).slice(0, 80).map(a => { const d = a.decisions[0]; return `<tr><td><button class="rowbtn" data-insp="${a.id}">${esc(a.name)}</button></td><td>${Sim.fmtClock(d.t)}</td><td>${esc(d.chosen)}</td><td>${d.src === 'llm' ? 'AI REASONING' : 'BEHAVIOR ENGINE'}</td><td style="white-space:normal">${esc(d.reason)}</td><td style="white-space:normal">${(d.top || []).map(t => esc(t[0]) + ' ' + t[1]).join(' \u00B7 ')}</td></tr>`; }).join('')}</table></div>`;
  } else if (UI.devTab === 'agents') {
    h += `<div class="tbl-wrap"><table class="tbl"><tr><th>Name</th><th>Village</th><th>Job</th><th>Mood</th><th>Coins</th><th>Doing</th><th>Beliefs</th><th>Memories</th><th>Mind</th></tr>${s.agents.filter(a => !a.left).map(a => `<tr><td><button class="rowbtn" data-insp="${a.id}">${esc(a.name)}</button></td><td>${esc(UI.vname(a.vid))}</td><td>${esc(a.job)}</td><td>${esc(a.moodLabel)}</td><td>${Math.round(a.money)}</td><td>${esc(planWord(a))}</td><td>${a.beliefs.length}</td><td>${a.memories.length}</td><td>${a.scores ? Math.round(a.scores.cognition) : ''}</td></tr>`).join('')}</table></div>`;
  } else if (UI.devTab === 'memory') {
    h += `<p>Memories of <b>${esc(sel.name)}</b> (select someone to switch). Strength = importance \u00D7 emotion \u00D7 recency; the weakest are pruned at midnight down to this mind's capacity (${sel.mind ? sel.mind.capacity : '?'}).</p>`;
    h += `<div class="tbl-wrap"><table class="tbl"><tr><th>When</th><th>Kind</th><th>Imp</th><th>Strength</th><th>Memory</th></tr>${sel.memories.slice().reverse().map(m => `<tr><td>D${Sim.dayOf(m.t)} ${Sim.fmtClock(m.t)}</td><td>${esc(m.kind)}</td><td>${(m.imp || 0).toFixed(2)}</td><td>${Sim.strength(m).toFixed(3)}</td><td style="white-space:normal">${esc(m.text)}</td></tr>`).join('')}</table></div>`;
  } else if (UI.devTab === 'rumors') {
    const list = Object.values(s.rumors).filter(r => r.hops && r.hops.length).sort((a, b) => b.hops.length - a.hops.length).slice(0, 40);
    const cur = s.rumors[UI.devArg] || list[0];
    h += `<p>Every claim keeps its provenance: who started it, whether it was true, and how it changed hop by hop.</p><div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:12px"><div class="tbl-wrap"><table class="tbl"><tr><th>Rumor</th><th>Hops</th><th>Truth</th></tr>${list.map(r => `<tr><td style="white-space:normal"><button class="rowbtn" data-chain="${r.id}">${esc(Sim.claimText({ type: r.type, about: r.about, place: r.place, other: r.other, secretId: r.secretId, level: r.origin.level }, r.origin.level))}</button></td><td>${r.hops.length}</td><td>${r.origin.truth === true ? 'true' : r.origin.truth === false ? 'FALSE' : '?'}</td></tr>`).join('')}</table></div><div>`;
    if (cur) {
      h += `<h4 class="pixel">Trace</h4><p>Started by <b>${esc(cur.origin.by === 'witness' ? 'witnesses' : nm(cur.origin.by))}</b> (${esc(cur.origin.how || '')}) on day ${Sim.dayOf(cur.origin.t)}. Origin was ${cur.origin.truth === true ? 'true' : cur.origin.truth === false ? '<b style="color:var(--blood)">false</b>' : 'unverified'}.</p>`;
      h += `<ol class="list">${(cur.hops || []).slice(0, 60).map(x => `<li>${esc(x.from === 'event' ? 'seen' : nm(x.from))} &rarr; ${esc(nm(x.to))}: "${esc(Sim.claimText({ type: cur.type, about: cur.about, place: cur.place, other: cur.other, secretId: cur.secretId }, x.level))}" <span style="color:var(--dim)">conf ${x.conf}${x.mut ? ' \u00B7 <b style="color:var(--ember)">embellished</b>' : ''}${x.cat ? ' \u00B7 ' + esc(x.cat) : ''}</span></li>`).join('')}</ol>`;
    }
    h += `</div></div>`;
  } else if (UI.devTab === 'economy') {
    const hist = V.econ.hist;
    h += `<p><b>${esc(V.name)}</b>. Gatherers walk to resource sites, carry up to 8 units and are paid by the storehouse. Prices follow stock. Bakers and smiths buy from the storehouse; builders draw materials for every block they place.</p>`;
    h += `<canvas class="spark" id="spBread"></canvas><canvas class="spark" id="spTreas"></canvas>`;
    h += `<div class="tbl-wrap"><table class="tbl"><tr><th>Good</th><th>Stock</th><th>Target</th><th>Price</th></tr>${Sim.GOODS.map(g => `<tr><td>${g}</td><td>${Math.round(V.econ.stock[g] || 0)}</td><td>${Sim.TARGET ? Sim.TARGET[g] : ''}</td><td>${Sim.priceOf(g, vid).toFixed(2)}</td></tr>`).join('')}</table></div>`;
    h += `<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><tr><th>Shop</th><th>Owner</th><th>Stock</th><th>Open</th></tr>${Object.values(s.shops).filter(sh => sh.vid === vid).map(sh => `<tr><td>${esc(sh.name)}</td><td>${esc(nm(sh.owner))}</td><td>${esc(JSON.stringify(sh.stock))}</td><td>${sh.open[0]}-${sh.open[1]}</td></tr>`).join('')}</table></div>`;
    h += `<div class="kv" style="margin-top:10px"><span>Tax</span><span>${Math.round(V.town.tax * 100)}%</span><span>Bread subsidy</span><span>${Math.round((V.town.subsidy || 0) * 100)}%</span><span>Treasury</span><span>${Math.round(V.town.treasury)} coins</span></div>`;
  } else if (UI.devTab === 'sync') {
    const N = Net();
    h += `<div class="kv"><span>Transport</span><span>${esc(N.transport)}</span><span>Role</span><span>${esc(N.label())}</span><span>World</span><span>${esc(N.meta && N.meta.worldId)}</span><span>Clock</span><span>1 world day = 20 real minutes (${AV.Sync.RATE} world min / s)</span><span>Open views</span><span>${N.online}</span><span>Last frame</span><span>${N.frameAt ? Math.round((performance.now() - N.frameAt) / 1000) + ' s ago' : (N.role === 'host' ? 'this tab sends them' : 'none')}</span><span>Last save</span><span>${N.lastSave ? Math.round((Date.now() - N.lastSave) / 1000) + ' s ago' : (N.meta && N.meta.savedAt ? Math.round((Date.now() - N.meta.savedAt) / 1000) + ' s ago (host)' : '-')}</span><span>Block edits</span><span>${Object.keys(W.edits).length}</span></div>`;
    h += `<p style="margin-top:12px">State lives in the shared store as documents: world/meta, world/core, world/feed, world/rumors, agents/s0..s${AV.Sync.shards(s) - 1} (${AV.Sync.SHARD} residents each), edits/e0..e3 and history pages. One open tab with write access holds a 20-second lease and runs the simulation; the others draw its 1 Hz frames. If it closes, the next writer takes over and replays the gap.</p>`;
  } else if (UI.devTab === 'prompts') {
    const L = (s.llmLog || []).slice(-6).reverse();
    h += `<p>${AV.LLM.ready() ? 'The language model is connected in this tab. ' : 'The language model is not active in this tab; the world runs on its own rules. '}Every model reply is parsed as JSON and validated before it touches the simulation. Rejected replies fall back to the behavior engine.</p>`;
    h += L.length ? L.map(x => `<h4 class="pixel">${esc(x.kind)} \u00B7 ${esc(nm(x.agent || x.who) || '')} \u00B7 D${Sim.dayOf(x.t)} ${Sim.fmtClock(x.t)}</h4><pre>${esc(x.prompt)}</pre><h4 class="pixel">Response</h4><pre>${esc(typeof x.response === 'string' ? x.response : JSON.stringify(x.response || x.raw, null, 2))}</pre>`).join('') : `<h4 class="pixel">Example prompt for ${esc(sel.name)}</h4><pre>${esc(Sim.buildDecisionPrompt(sel))}</pre>`;
  }
  $('devBody').innerHTML = h;
  $('devBody').querySelectorAll('[data-insp]').forEach(b => b.onclick = () => { UI.closeModal('dev'); UI.openInspector(b.dataset.insp); });
  $('devBody').querySelectorAll('[data-chain]').forEach(b => b.onclick = () => { UI.devArg = b.dataset.chain; UI.renderDev(); });
  if (UI.devTab === 'economy') { UI.spark($('spBread'), V.econ.hist.map(r => r.bread), 'Bread price', '#d8b14a'); UI.spark($('spTreas'), V.econ.hist.map(r => r.treasury), 'Treasury', '#8bb3d1'); }
};
UI.spark = function (cv, vals, label, color) {
  if (!cv || !vals.length) return;
  const r = cv.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = r.width * dpr; cv.height = r.height * dpr; const g = cv.getContext('2d');
  const pad = 22 * dpr, w = cv.width - pad * 2, h = cv.height - pad * 1.6;
  const mn = Math.min(...vals), mx = Math.max(...vals), span = mx - mn || 1;
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
  for (let i = 0; i <= 2; i++) { const y = pad * 0.6 + h * i / 2; g.beginPath(); g.moveTo(pad, y); g.lineTo(pad + w, y); g.stroke(); }
  g.fillStyle = '#b3ab95'; g.font = `${11 * dpr}px "Pixelify Sans", monospace`; g.fillText(label + '  ' + vals[vals.length - 1] + '  (range ' + Math.round(mn * 10) / 10 + '-' + Math.round(mx * 10) / 10 + ')', pad, 13 * dpr);
  g.strokeStyle = color; g.lineWidth = 2 * dpr; g.beginPath();
  vals.forEach((v, i) => { const x = pad + (vals.length < 2 ? w : w * i / (vals.length - 1)), y = pad * 0.6 + h - (v - mn) / span * h; i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
  const lx = pad + w, ly = pad * 0.6 + h - (vals[vals.length - 1] - mn) / span * h; g.fillStyle = color; g.fillRect(lx - 3 * dpr, ly - 3 * dpr, 6 * dpr, 6 * dpr);
};

// ---------------- since you were last here ----------------
UI.showAway = function (items, meta) {
  $('awayMeta').textContent = meta;
  $('awayList').innerHTML = items.map(e => `<li><button data-ev="${e.id || ''}" data-who="${esc(e.actor || '')}">${esc(e.text)}<small>Day ${e.day}${e.t !== undefined ? ', ' + Sim.fmtClock(e.t) : ''}${e.vid ? ' \u00B7 ' + esc(UI.vname(e.vid)) : ''}</small></button></li>`).join('') || '<li>It was quiet. Mostly.</li>';
  $('awayList').querySelectorAll('button').forEach(b => b.onclick = () => { UI.closeModal('away'); const id = +b.dataset.ev; if (id) { AV.Pages.go('world'); G().setMode('watch'); UI.focusEvent(id); } });
  UI.openModal('away');
};
UI.openMenu = function () {
  const llm = AV.LLM; const N = Net();
  $('menuBody').innerHTML = `
  <p>Every resident runs the same loop: perceive, remember, interpret, decide, act. Needs, work, money and movement are simulation code. What they believe is their own: nobody sees world truth, only what they witnessed, were told, or read in the paper. Rumours carry their source and can grow in the retelling.</p>
  <p><b>One shared world.</b> Everyone who opens this page sees the same five villages, the same clock (a world day is 20 real minutes) and the same history. ${esc(N.label())}. ${N.role === 'projection' ? 'Nobody with write access has the page open, so this view runs a local projection from the last saved state; it rejoins the shared world when a host appears.' : ''} ${!N.canWrite && N.shared() ? 'You are viewing: you can watch everything, but only Contributors can talk to residents or build.' : ''}</p>
  <h4 class="pixel">Your name in the world</h4>
  <form id="nameForm" style="display:flex;gap:6px;flex-wrap:wrap"><label class="hidden-lbl" for="nameIn">Name</label><input id="nameIn" maxlength="24" value="${esc(N.name || '')}" placeholder="Traveller" style="font:15px var(--f-body);padding:7px 9px;border:0;background:var(--stone-lo);color:var(--text)"><button class="btn" type="submit">Save name</button></form>
  <h4 class="pixel">Language model</h4>
  <p>${llm.available() ? 'The language model can voice residents when you type to them, write editor columns, and make a decision for a resident from the inspector. Each reply is parsed and checked before it changes anything, and those decisions are labelled AI REASONING. It uses your own model usage, only when you ask.' : 'A language model is not available in this view, so conversations use the built-in responder. The world works the same either way.'}</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="btn ${llm.enabled ? 'on' : ''}" id="mLLM" ${llm.available() ? '' : 'disabled'}>AI conversations: ${llm.enabled && llm.available() ? 'on' : 'off'}</button><button class="btn ${llm.auto ? 'on' : ''}" id="mAuto" ${llm.available() ? '' : 'disabled'}>While I host, the model thinks for featured minds: ${llm.auto ? 'on' : 'off'}</button><button class="btn ${G().sound ? 'on' : ''}" id="mSnd">Sound: ${G().sound ? 'on' : 'off'}</button></div>
  <h4 class="pixel">Keys</h4>
  <div class="keys" style="display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px"><span><kbd>WASD</kbd> move</span><span><kbd>Space</kbd> jump / fly up</span><span><kbd>Shift</kbd> sprint / fly down</span><span><kbd>E</kbd> talk</span><span><kbd>Q</kbd> inspect</span><span><kbd>LMB</kbd> break</span><span><kbd>RMB</kbd> place</span><span><kbd>1-9</kbd> block</span><span><kbd>Tab</kbd> play / watch</span><span><kbd>F</kbd> follow selected</span><span><kbd>T</kbd> thoughts</span><span><kbd>N</kbd> paper</span><span><kbd>G</kbd> graph</span><span><kbd>H</kbd> heatmap</span><span><kbd>L</kbd> logs</span><span><kbd>M</kbd> minds</span></div>`;
  $('mLLM').onclick = () => { llm.enabled = !llm.enabled; G().saveSettings(); UI.openMenu(); };
  $('mAuto').onclick = () => { llm.auto = !llm.auto; G().saveSettings(); UI.openMenu(); };
  $('mSnd').onclick = () => { G().toggleSound(); UI.openMenu(); };
  $('nameForm').onsubmit = (e) => { e.preventDefault(); N.setName($('nameIn').value.trim()).then(() => UI.toast('Residents will know you as ' + (N.name || 'Traveller') + '.')); };
  UI.openModal('menu');
};
})(typeof window !== 'undefined' ? window : globalThis);
