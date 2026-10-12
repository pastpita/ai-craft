/* AI VILLAGE — ui.js
   HUD, feed, inspector (player vs spectator views), dialogue, the Village Post,
   relationship graph, developer tools, away screen and overhead labels. */
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
const nm = id => Sim.nameOf(id);
const pct = v => Math.round(v * 100) + '%';
const CAT = {
  ITEM_STOLEN: 'crime', THEFT_DISCOVERED: 'crime', ARREST: 'crime', CLEARED: 'crime', EVIDENCE_FOUND: 'crime', FALSE_TESTIMONY: 'crime', CASE_COLD: 'crime', SEEN_AT_NIGHT: 'crime', PROPERTY_DAMAGE: 'crime', FRAUD_NOTICED: 'crime', ARGUMENT: 'social',
  ELECTION_RESULT: 'politics', ELECTION_STARTED: 'politics', POLICY_CHANGED: 'politics', PROTEST: 'politics', CORRUPTION_FOUND: 'politics',
  PRICE_CHANGED: 'economy', DROUGHT: 'economy', DROUGHT_END: 'economy', JOB_CHANGE: 'economy', BUILDING_CREATED: 'economy', CONSTRUCTION_STARTED: 'economy', MISSED_SHIFT: 'economy',
  COUPLE: 'social', HELP: 'social', SECRET_EXPOSED: 'social', SECRET_TOLD: 'social', RUMOR_CREATED: 'social', RUMOR_DISTORTED: 'social', LEFT_VILLAGE: 'social', NPC_INJURED: 'social', NPC_SICK: 'social',
  NEWSPAPER: 'news', PLAYER_INTERACTION: 'you',
};
const CAT_LABEL = { crime: 'CRIME', politics: 'POLITICS', economy: 'ECONOMY', social: 'SOCIAL', news: 'POST', you: 'YOU' };
UI.esc = esc;

// ---------------- init ----------------
UI.init = function () {
  const sp = $('speed');
  [['II', 0], ['1x', 1], ['2x', 2], ['5x', 5], ['10x', 10]].forEach(([l, v]) => {
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = l; b.dataset.v = v; b.setAttribute('aria-label', v ? 'Speed ' + l : 'Pause');
    b.onclick = () => G().setSpeed(v); sp.appendChild(b);
  });
  // hotbar
  const hb = $('hotbar');
  G().hotbar.forEach((bid, i) => {
    const s = document.createElement('button'); s.className = 'slot'; s.title = W.BLOCKS[bid].name; s.setAttribute('aria-label', W.BLOCKS[bid].name);
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
    const t = W.BLOCKS[bid].tex[1];
    cv.getContext('2d').drawImage(AV.Render.atlasCanvas, (t % 8) * 16, Math.floor(t / 8) * 16, 16, 16, 0, 0, 16, 16);
    s.appendChild(cv); const k = document.createElement('b'); k.textContent = i + 1; s.appendChild(k);
    s.onclick = () => G().selectSlot(i); hb.appendChild(s);
  });
  $('mPlay').onclick = () => G().setMode('play');
  $('mWatch').onclick = () => G().setMode('watch');
  $('bPost').onclick = () => UI.openPost();
  $('bGraph').onclick = () => UI.openGraph();
  $('bHeat').onclick = () => G().toggleHeat();
  $('bThink').onclick = () => { G().showThoughts = !G().showThoughts; $('bThink').classList.toggle('on', G().showThoughts); };
  $('bDev').onclick = () => UI.openDev();
  $('bMenu').onclick = () => UI.openMenu();
  $('inspClose').onclick = () => UI.closeInspector();
  $('feedFilter').onchange = () => { UI.feedSig = ''; UI.renderFeed(); };
  $('clock').onclick = e => { if (window.innerWidth < 760 && !e.target.closest('button')) $('clock').classList.toggle('open'); };
  document.querySelectorAll('.modal [data-close]').forEach(b => b.onclick = () => UI.closeModal(b.closest('.modal').id));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m && m.id !== 'title') UI.closeModal(m.id); }));
  $('dlgClose').onclick = () => UI.closeDialog();
  $('dlgForm').onsubmit = e => { e.preventDefault(); const v = $('dlgInput').value.trim(); if (v) { $('dlgInput').value = ''; UI.freeText(v); } };
  $('gCore').onclick = () => { UI.graphAll = false; $('gCore').classList.add('on'); $('gAll').classList.remove('on'); UI.layoutGraph(); };
  $('gAll').onclick = () => { UI.graphAll = true; $('gAll').classList.add('on'); $('gCore').classList.remove('on'); UI.layoutGraph(); };
  $('graphCv').addEventListener('click', UI.graphClick);
  UI.labels = {};
  UI.thinkOn = false;
};

UI.toast = function (msg, ms) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(UI._tt); UI._tt = setTimeout(() => { t.hidden = true; }, ms || 2600);
};
UI.modalOpen = () => [...document.querySelectorAll('.modal')].some(m => !m.hidden);
UI.openModal = id => { $(id).hidden = false; G().onModal(true); };
UI.closeModal = id => { $(id).hidden = true; if (id === 'title') return; G().onModal(UI.modalOpen()); };

// ---------------- frame updates ----------------
let slowT = 0;
UI.frame = function (dt) {
  const s = S();
  slowT += dt;
  $('cDay').textContent = 'DAY ' + Sim.dayOf(s.t);
  $('cTime').textContent = Sim.fmtClock(s.t);
  if (slowT > 0.4) {
    slowT = 0;
    UI.renderStats();
    UI.renderFeed();
    if (!$('inspector').hidden) UI.renderInspector();
    $('pCoins').textContent = Math.floor(s.player.money);
    $('pBread').textContent = s.player.inv.bread;
    document.querySelectorAll('#speed .btn').forEach(b => b.classList.toggle('on', +b.dataset.v === G().speed));
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
  const s = S(); const st = Sim.stats();
  const wx = s.weather.drought ? 'drought' : s.weather.kind;
  $('cWx').innerHTML = wxIcon(wx) + esc(wx.toUpperCase());
  const h = s.econ.hist; const prev = h[h.length - 1];
  const ch = prev ? (st.bread - prev.bread) / prev.bread : 0;
  const poll = Object.entries(st.poll).sort((a, b) => b[1] - a[1]);
  const elec = st.electionIn === 0 ? 'TODAY' : 'in ' + st.electionIn + 'd';
  const rows = [
    ['Population', st.pop],
    ['Bread', st.bread.toFixed(1) + 'c <span class="' + (ch > 0.02 ? 'up' : ch < -0.02 ? 'down' : '') + '">' + (ch > 0.02 ? '+' : '') + (Math.abs(ch) > 0.02 ? Math.round(ch * 100) + '%' : '') + '</span>'],
    ['Food', st.food + ' days'],
    ['Happiness', st.happy + '/100'],
    ['Crime', st.crime + ' (3 days)'],
    ['Trust', st.trust],
    ['Mayor', esc(nm(s.town.mayor))],
    ['Election', elec + (poll.length ? ' · ' + esc(nm(poll[0][0])) + ' leads' : '')],
    ['Treasury', st.treasury + 'c'],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
};

UI.renderFeed = function () {
  const s = S(); const g = G();
  const f = $('feedFilter').value;
  const watch = g.mode !== 'play';
  const list = s.feed.filter(e => (watch || e.public || e.playerSaw || e.actor === 'you') && (f === 'all' || CAT[e.type] === f) && (watch || !e.secretive || e.playerSaw)).slice(0, 60);
  const sig = (list[0] ? list[0].id : 0) + ':' + list.length + ':' + watch + ':' + f;
  if (sig === UI.feedSig) return;
  UI.feedSig = sig;
  $('feedTitle').textContent = watch ? 'Village feed' : 'What you know';
  $('feedList').innerHTML = list.map(e => {
    const c = CAT[e.type] || 'social';
    const truth = watch && e.truth ? `<span class="truth">${esc(e.truth)}</span>` : '';
    return `<button class="ev" data-ev="${e.id}"><time>${e.day !== Sim.dayOf(s.t) ? 'D' + e.day : Sim.fmtClock(e.t)}</time><span><span class="tag t-${c}">${CAT_LABEL[c] || ''}</span>${esc(e.text)}${truth}</span></button>`;
  }).join('') || '<div class="ev" style="color:var(--dim)">Nothing yet. Give it a few minutes.</div>';
  $('feedList').querySelectorAll('[data-ev]').forEach(b => b.onclick = () => UI.focusEvent(+b.dataset.ev));
};
UI.focusEvent = function (id) {
  const s = S(); const e = s.events.find(x => x.id === id) || s.feed.find(x => x.id === id) || s.away.find(x => x.id === id); if (!e) return;
  const who = [e.actor, e.about, e.target].find(x => x && s.byId[x]);
  if (who) { UI.openInspector(who); if (G().mode === 'watch') G().lookAt(s.byId[who]); }
  else if (e.x !== undefined && G().mode === 'watch') G().lookAtPoint(e.x, e.z);
  if (e.type === 'NEWSPAPER') UI.openPost();
};

// ---------------- labels ----------------
UI.updateLabels = function (camera, agents, player) {
  const g = G(); const s = S();
  const wv = new AV.THREE.Vector3();
  const cam = camera.position;
  const W2 = window.innerWidth / 2, H2 = window.innerHeight / 2;
  const seen = new Set();
  const watch = g.mode !== 'play';
  const cand = [];
  for (const a of agents) {
    if (a.left) continue;
    const n = AV.Render.npcs[a.id]; if (!n || !n.G.visible) continue;
    const d = Math.hypot(n.rx - cam.x, n.rz - cam.z, n.vy - cam.y);
    const range = watch ? 46 : 22;
    if (d > range && g.selected !== a.id) continue;
    cand.push([a, n, d]);
  }
  cand.sort((x, y) => x[2] - y[2]);
  const nowMs = performance.now();
  let thoughtsShown = 0, bubbles = 0;
  for (const [a, n, d] of cand.slice(0, 22)) {
    // hide labels for villagers hidden behind walls and roofs (checked a few times a second)
    if (!n._visT || nowMs - n._visT > 250) { n._visT = nowMs; n._vis = g.selected === a.id || W.los(cam.x, cam.y, cam.z, n.rx, n.vy + 1.7, n.rz); }
    if (!n._vis) continue;
    wv.set(n.rx, n.vy + 2.05 * (a.look.h || 1), n.rz);
    wv.project(camera);
    if (wv.z > 1 || wv.z < -1 || Math.abs(wv.x) > 1.2 || Math.abs(wv.y) > 1.2) continue;
    let el = UI.labels[a.id];
    if (!el) { el = document.createElement('div'); el.className = 'lbl'; el.innerHTML = '<div class="think" hidden></div><div class="say" hidden></div><div class="nm"></div>'; $('labels').appendChild(el); UI.labels[a.id] = el; }
    seen.add(a.id);
    el.style.transform = `translate(${(wv.x * W2 + W2).toFixed(1)}px, ${(-wv.y * H2 + H2).toFixed(1)}px) translate(-50%, -100%)`;
    const showName = d < (watch ? 34 : 14) || g.selected === a.id;
    const nmEl = el.children[2];
    const known = watch || (s.player.known[a.id] && s.player.known[a.id].length) || (a.rel.you && a.rel.you[7] > 5);
    const label = (known ? a.name : (AV.JOBS[a.job] ? AV.JOBS[a.job].label : 'Villager')) + (watch && a.plan ? ' <em>' + esc(planWord(a)) + '</em>' : '');
    if (nmEl._l !== label) { nmEl.innerHTML = label; nmEl._l = label; }
    nmEl.hidden = !showName;
    const say = el.children[1];
    const bub = a.bubble && d < (watch ? 40 : 22) && (bubbles < 6 || g.selected === a.id) ? a.bubble.text : '';
    if (bub) bubbles++;
    if (say._t !== bub) { say.textContent = bub; say._t = bub; }
    say.hidden = !bub;
    const th = el.children[0];
    const tt = watch && g.showThoughts && a.thought && !bub && d < 34 && (thoughtsShown < 4 || g.selected === a.id) ? a.thought.text : '';
    if (tt) thoughtsShown++;
    if (th._t !== tt) { th.textContent = tt; th._t = tt; }
    th.hidden = !tt;
    el.style.opacity = d > 30 ? 0.75 : 1;
    el.style.zIndex = String(1000 - Math.round(d));
  }
  for (const id in UI.labels) if (!seen.has(id)) { UI.labels[id].remove(); delete UI.labels[id]; }
};
function planWord(a) {
  if (a.sleeping) return 'asleep';
  if (a.jailUntil > S().t) return 'in jail';
  if (a.convo) return 'talking';
  const p = a.plan; if (!p) return '';
  const map = { work: 'working', eat: 'eating', socialize: 'socialising', rest: 'resting', gossip: 'gossiping', talk_to: 'talking', campaign: 'campaigning', investigate: 'investigating', steal: 'sneaking', help: 'helping', protest: 'protesting', vote: 'voting', visit: 'wandering', clinic: 'at the clinic', follow: 'following', commission: 'at town hall', buy: 'shopping', mediate: 'mediating', jail: 'in jail', sleep: 'heading home' };
  return map[p.type] || p.type;
}
UI.planWord = planWord;

// ---------------- inspector ----------------
UI.openInspector = function (id) {
  const a = S().byId[id]; if (!a) return;
  G().selected = id;
  UI.inspTab = UI.inspTab || 'overview';
  $('inspector').hidden = false;
  document.body.classList.add('insp-open');
  UI.placeInspector();
  const cv = AV.Render.faceCanvas(a, 6); const fc = $('inspFace'); fc.width = cv.width; fc.height = cv.height; fc.getContext('2d').drawImage(cv, 0, 0);
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
  const tabs = watch ? [['overview', 'Overview'], ['mind', 'Mind'], ['social', 'Social'], ['decide', 'Decisions']] : [['overview', 'What you see'], ['known', 'What you know']];
  if (!tabs.some(t => t[0] === UI.inspTab)) UI.inspTab = tabs[0][0];
  const tabSig = tabs.map(t => t[0]).join() + UI.inspTab;
  if ($('inspTabs')._sig !== tabSig) {
    $('inspTabs')._sig = tabSig;
    $('inspTabs').innerHTML = tabs.map(([k, l]) => `<button class="btn ${UI.inspTab === k ? 'on' : ''}" data-t="${k}">${l}</button>`).join('');
    $('inspTabs').querySelectorAll('button').forEach(b => b.onclick = () => { UI.inspTab = b.dataset.t; $('inspTabs')._sig = ''; UI.renderInspector(); });
  }
  const job = AV.JOBS[a.job] ? AV.JOBS[a.job].label : a.job;
  const knownName = watch || (s.player.known[a.id] && s.player.known[a.id].length);
  $('inspName').textContent = knownName ? a.name + (a.surname ? ' ' + a.surname : '') : 'A ' + job.toLowerCase();
  $('inspSub').textContent = job + (watch ? ' · age ' + a.age + ' · LOD ' + a.lod : '') + ' · ' + a.moodLabel;
  const body = $('inspBody');
  const keepScroll = body.scrollTop;
  let h = '';
  const relRow = (id, r) => `<li><button class="rowbtn" data-insp="${esc(id)}">${esc(nm(id))}</button> <span style="color:var(--dim)">trust ${Math.round(r[0])}, affection ${Math.round(r[1])}${r[5] > 20 ? ', resentment ' + Math.round(r[5]) : ''}</span>${a.summaries[id] ? '<br><span style="color:var(--muted)">' + esc(a.summaries[id]) + '</span>' : ''}</li>`;
  if (UI.inspTab === 'overview') {
    const p = a.plan;
    const doing = planWord(a) + (p && p.place ? ' · ' + Sim.placeName(p.place) : '') + (p && p.target ? ' · ' + nm(p.target) : '');
    h += `<div class="kv"><span>Doing</span><span>${esc(doing)}</span>`;
    if (watch) h += `<span>Why</span><span>${esc(p ? p.reason : '')}${p && p.src === 'llm' ? ' <span class="pill">Claude</span>' : ''}</span><span>Money</span><span>${Math.round(a.money)} coins${a.debt ? ' · owes ' + a.debt : ''}</span><span>Carrying</span><span>${a.inv.bread} bread${a.inv.tools ? ', tools' : ''}</span>`;
    h += `</div>`;
    if (watch && a.thought) h += `<h4>Current thought</h4><div class="thought">"${esc(a.thought.text)}"</div>`;
    if (watch) {
      const pg = a.goals.find(g => g.primary) || a.goals[0];
      h += `<h4>Goals</h4><ul class="list">${a.goals.map(g => `<li>${g === pg ? '<b>' : ''}${esc(g.type.replace(/_/g, ' ').toLowerCase())}${g.target ? ' (' + esc(nm(g.target)) + ')' : ''}${g === pg ? '</b>' : ''}</li>`).join('')}</ul>`;
      h += `<h4>Needs</h4><div class="bars">${Object.entries(a.needs).map(([k, v]) => `<span>${k}</span><div class="bar"><i style="width:${pct(Math.max(0, v))}"></i></div>`).join('')}</div>`;
      const traits = Object.entries(a.p).sort((x, y) => Math.abs(y[1] - 0.5) - Math.abs(x[1] - 0.5)).slice(0, 7);
      h += `<h4>Personality</h4><div class="bars">${traits.map(([k, v]) => `<span>${k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span><div class="bar"><i style="width:${pct(v)}"></i></div>`).join('')}</div>`;
      const vals = Object.entries(a.v).sort((x, y) => y[1] - x[1]).slice(0, 4);
      h += `<h4>Cares most about</h4><div>${vals.map(([k]) => `<span class="pill">${k}</span>`).join('')}</div>`;
      if (a.bio) h += `<h4>Bio</h4><div style="color:var(--muted)">${esc(a.bio)}</div>`;
      h += `<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn" id="iFollow">${G().follow === a.id ? 'Stop following' : 'Follow'}</button><button class="btn" id="iAsk">Ask Claude what ${esc(a.name)} does next</button></div><div id="iAskOut" style="margin-top:6px;font-size:13px;color:var(--muted)"></div>`;
    } else {
      const r = a.rel.you || [0, 0, 0, 0, 0, 0, 0, 0];
      const standing = r[0] > 35 ? 'trusts you' : r[0] > 10 ? 'is warming to you' : r[0] < -30 ? 'distrusts you' : r[0] < -10 ? 'is wary of you' : 'does not know what to make of you yet';
      h += `<h4>Your standing</h4><div>${esc(knownName ? a.name : 'This villager')} ${standing}.${r[5] > 25 ? ' There is resentment there.' : ''}${r[1] > 35 ? ' They like you.' : ''}</div>`;
      h += `<h4>What you can see</h4><div style="color:var(--muted)">${esc(a.moodLabel)} · ${esc(planWord(a))}</div>`;
      h += `<p style="color:var(--dim);font-size:12.5px;margin-top:10px">Switch to WATCH to read minds, beliefs and secrets.</p>`;
    }
  } else if (UI.inspTab === 'known') {
    const k = s.player.known[a.id] || [];
    h += `<h4>Things you have learned</h4>` + (k.length ? `<ul class="list">${k.map(x => `<li><span style="color:var(--dim)">D${Sim.dayOf(x.t)} ${Sim.fmtClock(x.t)}</span> ${esc(x.text)}</li>`).join('')}</ul>` : '<div style="color:var(--muted)">Nothing yet. Talk to them.</div>');
  } else if (UI.inspTab === 'mind') {
    h += `<h4>Beliefs (not facts)</h4>`;
    const bels = a.beliefs.slice().sort((x, y) => y.conf - x.conf).slice(0, 14);
    h += bels.length ? `<ul class="list">${bels.map(b => {
      const tr = b.chain ? Sim.truthOf(b.chain, b.level) : null;
      const tag = tr === true ? '<span class="pill good">true</span>' : tr === false ? '<span class="pill bad">false</span>' : '';
      const src = b.src === 'self' ? 'own judgement' : b.src === 'witness' ? 'saw it' : b.src === 'news' ? 'the Post' : 'from ' + nm(b.src);
      return `<li>${esc(Sim.cap(Sim.claimText(b, b.level)))} <span style="color:var(--dim)">${pct(b.conf)} · ${esc(src)}${b.hops ? ' · ' + b.hops + ' hops' : ''}</span> ${tag}${b.chain ? ` <button class="rowbtn" data-chain="${b.chain}">trace</button>` : ''}</li>`;
    }).join('')}</ul>` : '<div style="color:var(--muted)">No strong beliefs yet.</div>';
    const sem = Object.entries(a.traitsBelief);
    if (sem.length) h += `<h4>Settled opinions</h4><div>${sem.slice(0, 8).map(([id, t]) => `<span class="pill ${t === 'dishonest' ? 'bad' : 'good'}">${esc(nm(id))}: ${t}</span>`).join(' ')}</div>`;
    h += `<h4>Recent memories</h4><ul class="list">${a.memories.slice(-10).reverse().map(m => `<li><span style="color:var(--dim)">D${Sim.dayOf(m.t)} ${Sim.fmtClock(m.t)} · str ${Sim.strength(m).toFixed(2)}</span><br>${esc(m.text)}</li>`).join('')}</ul>`;
    if (a.secrets.length) h += `<h4>Secrets</h4>${a.secrets.map(id => { const sc = s.secrets[id]; return `<div class="secret">${esc(sc.text)}<br><span style="color:var(--dim)">${sc.exposed ? 'Exposed: everyone knows.' : 'Known by ' + sc.knownBy.length + ': ' + esc(sc.knownBy.slice(0, 6).map(nm).join(', ') || 'nobody')}</span></div>`; }).join('')}`;
  } else if (UI.inspTab === 'social') {
    const top = Sim.topRelations(a, 4);
    h += `<h4>Closest</h4><ul class="list">${top.friends.map(f => relRow(f.id, f.r)).join('')}</ul>`;
    h += `<h4>Friction</h4>` + (top.rivals.length ? `<ul class="list">${top.rivals.map(f => relRow(f.id, f.r)).join('')}</ul>` : '<div style="color:var(--muted)">Nobody in particular.</div>');
    const r = a.rel.you;
    h += `<h4>Opinion of you</h4><div class="kv"><span>Trust</span><span>${Math.round(r[0])}</span><span>Respect</span><span>${Math.round(r[2])}</span><span>Fear</span><span>${Math.round(r[3])}</span><span>Familiarity</span><span>${Math.round(r[7])}</span></div>`;
    const mem = a.memories.filter(m => m.about === 'you' || m.actor === 'you').slice(-3);
    if (mem.length) h += `<ul class="list">${mem.map(m => `<li>${esc(m.text)}</li>`).join('')}</ul>`;
    const cands = s.election.candidates;
    if (cands.length) { const sc = Sim.voteScores(a); const best = Object.entries(sc).sort((x, y) => y[1] - x[1])[0]; h += `<h4>Vote leaning</h4><div>${best ? esc(nm(best[0])) : '?'} <span style="color:var(--dim)">(${Object.entries(sc).map(([c, v]) => nm(c) + ' ' + v.toFixed(2)).join(', ')})</span></div>`; }
    if (a.couple) h += `<h4>Partner</h4><div>${esc(nm(a.couple))}</div>`;
  } else if (UI.inspTab === 'decide') {
    h += `<h4>Why ${esc(a.name)} does what they do</h4><ul class="list">${a.decisions.map(d => `<li><span style="color:var(--dim)">D${Sim.dayOf(d.t)} ${Sim.fmtClock(d.t)}</span> <b>${esc(d.chosen)}</b> ${d.src === 'llm' ? '<span class="pill">Claude</span>' : ''}<br><span style="color:var(--muted)">${esc(d.reason)}</span><br><span style="color:var(--dim)">${d.top.map(t => esc(t[0]) + ' ' + t[1] + (t[2] ? ' (' + esc(t[2]) + ')' : '')).join(' · ')}</span></li>`).join('')}</ul>`;
    h += `<p style="color:var(--dim);font-size:12.5px">Cognition level ${a.lod}: ${['asleep, schedule only', 'far away, needs and goals', 'nearby, social simulation', 'close, full detail'][a.lod]}. Scores come from personality, values, goals, needs, beliefs and relationships. Claude is only asked when you press the button or talk to someone.</p>`;
  }
  body.innerHTML = h;
  body.scrollTop = keepScroll;
  body.querySelectorAll('[data-insp]').forEach(b => b.onclick = () => UI.openInspector(b.dataset.insp));
  body.querySelectorAll('[data-chain]').forEach(b => b.onclick = () => UI.openDev('rumors', b.dataset.chain));
  const fb = $('iFollow'); if (fb) fb.onclick = () => { G().follow = G().follow === a.id ? null : a.id; UI.renderInspector(); };
  const ab = $('iAsk'); if (ab) ab.onclick = () => G().askDecision(a);
};

// ---------------- dialogue ----------------
UI.openDialog = function (id) {
  const s = S(); const a = s.byId[id]; if (!a) return;
  UI.dlg = { id, history: [] };
  $('dialog').hidden = false;
  const cv = AV.Render.faceCanvas(a, 6); const fc = $('dlgFace'); fc.width = cv.width; fc.height = cv.height; fc.getContext('2d').drawImage(cv, 0, 0);
  $('dlgLog').innerHTML = '';
  G().onDialog(true, a);
  UI.dlgHeader();
  UI.addLines(Sim.playerGreet(id));
  UI.dlgActions();
  $('dlgFoot').textContent = AV.LLM.ready() ? 'Free text is answered by Claude in ' + a.name + '\'s voice, using only what ' + a.name + ' knows. Replies are checked before they change the village.' : 'Free text uses the built-in responder. Turn on Claude in the ? menu for open conversation.';
  setTimeout(() => $('dlgInput').focus(), 30);
};
UI.dlgHeader = function () {
  const s = S(); const a = s.byId[UI.dlg.id];
  const known = (s.player.known[a.id] && s.player.known[a.id].length) || a.rel.you[7] > 5;
  $('dlgName').textContent = known ? a.name : 'A ' + (AV.JOBS[a.job] ? AV.JOBS[a.job].label.toLowerCase() : 'villager');
  const r = a.rel.you; const st = r[0] > 35 ? 'trusts you' : r[0] > 10 ? 'warming to you' : r[0] < -30 ? 'distrusts you' : r[0] < -10 ? 'wary of you' : 'unsure of you';
  $('dlgSub').textContent = (AV.JOBS[a.job] ? AV.JOBS[a.job].label : '') + ' · ' + a.moodLabel + ' · ' + st;
};
UI.addLines = function (lines) {
  const s = S(); const log = $('dlgLog');
  for (const l of lines) {
    const d = document.createElement('div');
    if (l.who === 'you') { d.className = 'me'; d.textContent = l.text; }
    else if (l.who === 'sys') { d.className = 'sys'; d.textContent = l.text; }
    else { d.className = 'them'; d.innerHTML = '<b>' + esc(nm(l.who)) + '</b>' + esc(l.text); const a = s.byId[l.who]; if (a) Sim.sayBubble(a, l.text); }
    log.appendChild(d);
    if (UI.dlg && l.who !== 'sys') UI.dlg.history.push({ who: l.who === 'you' ? 'you' : 'them', text: l.text });
  }
  log.scrollTop = log.scrollHeight;
  if (UI.dlg) UI.dlgHeader();
};
UI.closeDialog = function () { if (!UI.dlg) return; $('dialog').hidden = true; G().onDialog(false, S().byId[UI.dlg.id]); UI.dlg = null; };
function optPeople(excl) { return S().agents.filter(a => !a.left && a.id !== excl).sort((x, y) => (y.core - x.core) || x.name.localeCompare(y.name)).map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join(''); }
UI.dlgActions = function () {
  const s = S(); const a = s.byId[UI.dlg.id]; const d = Sim.dayOf(s.t);
  const acts = [['news', 'What is new?'], ['ask', 'Ask about someone'], ['tell', 'Tell them something'], ['case', 'Ask about the thefts']];
  if (s.player.inv.bread > 0) acts.push(['bread', 'Give bread']);
  if (s.player.money >= 5) acts.push(['coins', 'Give 5 coins']);
  if (['baker', 'shopkeeper', 'merchant', 'bartender'].includes(a.job) || Object.values(s.shops).some(sh => sh.owner === a.id && sh.sells.some(g => g === 'bread' || g === 'meal'))) acts.push(['buy', 'Buy bread']);
  if (['farmer', 'miner', 'builder', 'baker', 'blacksmith'].includes(a.job)) acts.push(['work', 'Help with work (1h)']);
  if (a.job === 'guard' || a.job === 'nightguard') acts.push(['accuse', 'Report a suspect']);
  if (s.election.candidates.length) acts.push(['support', 'Ask for their vote']);
  if (d === s.election.day && s.player.votedDay !== d) s.election.candidates.forEach(c => acts.push(['vote:' + c, 'Cast my vote: ' + nm(c)]));
  $('dlgActions').innerHTML = acts.map(([k, l]) => `<button class="pbtn" data-a="${k}">${esc(l)}</button>`).join('');
  $('dlgActions').querySelectorAll('button').forEach(b => b.onclick = () => UI.dlgDo(b.dataset.a));
  $('dlgSub2').innerHTML = '';
};
UI.dlgDo = function (k) {
  const s = S(); const id = UI.dlg.id; const a = s.byId[id];
  const sub = $('dlgSub2');
  const say = t => UI.addLines([{ who: 'you', text: t }]);
  if (k === 'news') { say('What is new around here?'); UI.addLines(Sim.playerNews(id)); }
  else if (k === 'case') { say('Do you know anything about the thefts?'); UI.addLines(Sim.playerCase(id)); }
  else if (k === 'bread') { say('Here, have some bread.'); UI.addLines(Sim.playerGive(id, 'bread')); }
  else if (k === 'coins') { say('Take these coins.'); UI.addLines(Sim.playerGive(id, 'coins')); }
  else if (k === 'buy') { say('One loaf, please.'); UI.addLines(Sim.playerBuy(id)); }
  else if (k === 'work') { say('Need a hand?'); const r = Sim.playerWork(id); UI.addLines(r.lines); if (r.minutes) { G().skipTime(r.minutes); UI.addLines([{ who: 'sys', text: 'An hour passes.' }]); } }
  else if (k.startsWith('vote:')) { const c = k.slice(5); UI.addLines([{ who: 'sys', text: Sim.playerVote(c) }]); }
  else if (k === 'ask') {
    sub.innerHTML = `<label for="sAsk">About</label><select id="sAsk">${optPeople(null)}<option value="you">me</option></select><button class="pbtn" id="sAskGo">Ask</button>`;
    $('sAskGo').onclick = () => { const v = $('sAsk').value; say(v === 'you' ? 'What do you think of me?' : 'What do you make of ' + nm(v) + '?'); UI.addLines(v === 'you' ? Sim.playerOpinion(id, 'you') : Sim.playerOpinion(id, v)); sub.innerHTML = ''; };
    return UI.dlgActions2();
  } else if (k === 'tell') {
    const places = ['bakery', 'store', 'market', 'tavern', 'forge'].concat(Object.keys(s.shops).filter(x => x.startsWith('shop_')));
    sub.innerHTML = `<select id="tWho" aria-label="Who">${optPeople(null)}</select><select id="tWhat" aria-label="Claim"><option value="theft:0">was near the place at night</option><option value="theft:2">probably stole from</option><option value="theft:3">robbed</option><option value="fraud:1">cheats customers</option><option value="liar:1">lies a lot</option><option value="skips:1">keeps skipping work</option><option value="corrupt:2">steals from the treasury</option><option value="helped:1">is generous</option><option value="innocent:0">was wrongly accused</option></select><select id="tWhere" aria-label="Place">${places.map(p => `<option value="${p}">${esc(Sim.placeName(p))}</option>`).join('')}</select><button class="pbtn" id="tGo">Say it</button>`;
    $('tGo').onclick = () => {
      const [type, lv] = $('tWhat').value.split(':'); const about = $('tWho').value; const place = $('tWhere').value;
      const claim = { type, about, level: +lv, place: (type === 'theft' || type === 'innocent') ? place : null };
      say(Sim.cap(Sim.claimText(claim, +lv)) + '.');
      UI.addLines(Sim.playerTell(id, claim)); sub.innerHTML = '';
    };
    return;
  } else if (k === 'accuse') {
    sub.innerHTML = `<label for="aWho">Suspect</label><select id="aWho">${optPeople(id)}</select><button class="pbtn" id="aGo">Report</button>`;
    $('aGo').onclick = () => { const v = $('aWho').value; say('I think ' + nm(v) + ' is behind the theft.'); UI.addLines(Sim.playerAccuse(id, v)); sub.innerHTML = ''; };
    return;
  } else if (k === 'support') {
    sub.innerHTML = `<label for="vWho">Vote for</label><select id="vWho">${s.election.candidates.map(c => `<option value="${c}">${esc(nm(c))}</option>`).join('')}</select><button class="pbtn" id="vGo">Ask</button>`;
    $('vGo').onclick = () => { const v = $('vWho').value; say('You should vote for ' + nm(v) + '.'); UI.addLines(Sim.playerSupport(id, v)); sub.innerHTML = ''; };
    return;
  }
  UI.dlgActions();
};
UI.dlgActions2 = function () {};

UI.freeText = async function (text) {
  const s = S(); const id = UI.dlg.id; const a = s.byId[id];
  UI.addLines([{ who: 'you', text }]);
  if (AV.LLM.ready()) {
    const wait = document.createElement('div'); wait.className = 'sys'; wait.textContent = a.name + ' is thinking...'; $('dlgLog').appendChild(wait);
    $('dlgInput').disabled = true;
    try {
      const prompt = Sim.buildDialoguePrompt(a, text, UI.dlg.history.slice(0, -1));
      const j = await AV.LLM.json(prompt, { tier: 'quick' });
      const r = Sim.applyDialogue(a, text, j);
      S().llmLog.push({ t: s.t, kind: 'dialogue', agent: a.id, prompt, response: j, result: r.ok ? 'ok' : r.error });
      wait.remove();
      if (!r.ok) throw { code: 'invalid', message: r.error };
      UI.addLines([{ who: a.id, text: r.reply }]);
      if (r.applied.length) UI.addLines([{ who: 'sys', text: a.name + ' took note: ' + r.applied.join('; ') + '.' }]);
    } catch (e) {
      wait.remove();
      if (e && (e.code === 'not_granted' || e.code === 'sampling_disabled')) AV.LLM.disable();
      UI.addLines([{ who: 'sys', text: e && e.code === 'rate_limited' ? 'Claude is busy. Using the built-in responder.' : 'Claude could not answer, so the built-in responder took over.' }]);
      UI.addLines(fallbackReply(a, text));
    }
    $('dlgInput').disabled = false; $('dlgInput').focus();
  } else UI.addLines(fallbackReply(a, text));
  UI.dlgActions();
};

// rule-based understanding for when Claude is unavailable
function fallbackReply(a, text) {
  const s = S(); const t = text.toLowerCase();
  const who = s.agents.filter(x => !x.left && t.includes(x.name.toLowerCase())).map(x => x.id);
  const place = ['bakery', 'store', 'market', 'tavern', 'forge', 'treasury'].find(p => t.includes(p)) || (t.includes('shop') ? 'store' : null);
  const about = who.find(x => x !== a.id) || who[0];
  if (about && /(stole|steal|thief|rob|took)/.test(t)) return Sim.playerTell(a.id, { type: 'theft', about, level: /(robbed|stole|thief)/.test(t) ? 3 : 2, place: place && place !== 'treasury' ? place : 'store' });
  if (about && /(chalk|cheat|fraud|rip)/.test(t)) return Sim.playerTell(a.id, { type: 'fraud', about, level: 1 });
  if (about && /(treasury|skim|corrupt|embezzl)/.test(t)) return Sim.playerTell(a.id, { type: 'corrupt', about, level: 2 });
  if (about && /(lie|liar|lying)/.test(t)) return Sim.playerTell(a.id, { type: 'liar', about, level: 1 });
  if (about && /(lazy|skip|never work)/.test(t)) return Sim.playerTell(a.id, { type: 'skips', about, level: 1 });
  if (about && /(kind|generous|helped|good person)/.test(t)) return Sim.playerTell(a.id, { type: 'helped', about, level: 1 });
  if (about && /(innocent|didn't|did not|framed)/.test(t)) return Sim.playerTell(a.id, { type: 'innocent', about, level: 0, place: place || 'store' });
  if (about && /(think|opinion|feel|like|trust|know)/.test(t)) return Sim.playerOpinion(a.id, about);
  if (/(news|new|heard|gossip|rumou?r|happen)/.test(t)) return Sim.playerNews(a.id);
  if (/(theft|robbery|stolen|crime)/.test(t)) return Sim.playerCase(a.id);
  if (/(vote|elect|mayor)/.test(t)) { const sc = Sim.voteScores(a); const best = Object.entries(sc).sort((x, y) => y[1] - x[1])[0]; return [{ who: a.id, text: best ? (best[0] === a.id ? 'I am voting for myself, obviously.' : 'I lean towards ' + nm(best[0]) + '.') : 'Politics. Ugh.' }]; }
  if (/(how are you|how's it|you ok|feeling)/.test(t)) return [{ who: a.id, text: { hungry: 'Hungry, honestly.', exhausted: 'Dead on my feet.', angry: 'Do not ask.', lonely: 'Glad someone stopped to talk.', cheerful: 'Good! Really good.', gloomy: 'Could be better.', anxious: 'On edge. Things keep going missing.', smug: 'Never better.', unwell: 'Not well at all.', jailed: 'How do you think?' }[a.moodLabel] || 'Getting by.' }];
  if (/(job|work|do you do)/.test(t)) return [{ who: a.id, text: 'I am the ' + (AV.JOBS[a.job] ? AV.JOBS[a.job].label.toLowerCase() : 'villager') + '. ' + Sim.line(a, 'small', {}) }];
  if (/(bye|later|see you)/.test(t)) return [{ who: a.id, text: Sim.line(a, 'bye', {}) }];
  Sim.relAdj(a, 'you', 'familiarity', 2);
  return [{ who: a.id, text: Sim.line(a, 'small', { name: 'you' }) || 'Hm.' }];
}

// ---------------- the village post ----------------
UI.openPost = function (idx) {
  const s = S(); if (!s.news.length) { UI.toast('The first issue goes out at 06:00.'); return; }
  const i = idx === undefined ? s.news.length - 1 : idx;
  const n = s.news[i]; UI.postIdx = i;
  const ed = s.byId[n.by];
  const [lead, ...rest] = n.headlines;
  let h = `<div class="masthead"><div class="name">THE VILLAGE POST</div><div class="meta"><span>No. ${n.no}</span><span>Day ${n.day}</span><span>One coin</span><span>${ed ? 'Edited by ' + esc(ed.name) : ''}</span></div></div>`;
  h += `<div class="lead"><h3>${esc(lead.h)}</h3><p>${esc(lead.body)}</p></div>`;
  if (rest.length) h += `<div class="cols">${rest.map(x => `<div><h4>${esc(x.h)}</h4><p>${esc(x.body)}</p></div>`).join('')}</div>`;
  if (!n.missing) h += `<div class="column"><div class="by">From the editor's desk</div><div id="colText"><p>${esc(n.column || '')}</p></div><button class="pbtn" id="colBtn">${n.column ? 'Rewrite' : 'Read ' + (ed ? esc(ed.name) + '\'s' : 'the') + ' column'}</button></div>`;
  $('paper').innerHTML = h;
  $('issues').innerHTML = s.news.map((x, k) => `<button class="pbtn" data-i="${k}" ${k === i ? 'disabled' : ''}>No. ${x.no}</button>`).join('') + '<button class="pbtn" id="postClose">Close</button>';
  $('issues').querySelectorAll('[data-i]').forEach(b => b.onclick = () => UI.openPost(+b.dataset.i));
  $('postClose').onclick = () => UI.closeModal('post');
  const cb = $('colBtn'); if (cb) cb.onclick = () => UI.writeColumn(n);
  UI.openModal('post');
};
UI.writeColumn = async function (n) {
  const out = $('colText'); const s = S(); const ed = s.byId[n.by];
  if (!AV.LLM.ready()) {
    const lead = n.headlines[0];
    n.column = 'Another day, another headline. ' + Sim.cap(lead.h.toLowerCase()) + '. ' + (n.headlines[1] ? 'Elsewhere: ' + n.headlines[1].h.toLowerCase() + '. ' : '') + 'I report what I can confirm and print what I cannot as rumour, clearly marked. Keep talking to me. ' + (ed ? ed.name : '');
    out.innerHTML = '<p>' + esc(n.column) + '</p>';
    return;
  }
  out.innerHTML = '<p><i>' + esc(ed ? ed.name : 'The editor') + ' is writing...</i></p>';
  try {
    const prompt = Sim.columnPrompt(n);
    const r = await AV.LLM.text(prompt, { tier: 'quick', onText: t => { out.innerHTML = '<p>' + esc(t) + '</p>'; } });
    n.column = r.slice(0, 1200);
    out.innerHTML = '<p>' + esc(n.column) + '</p>';
    s.llmLog.push({ t: s.t, kind: 'column', prompt, response: n.column, result: 'ok' });
  } catch (e) { out.innerHTML = '<p>The column could not be written right now.</p>'; }
};

// ---------------- relationship graph ----------------
UI.openGraph = function () { UI.openModal('graph'); requestAnimationFrame(() => UI.layoutGraph()); };
UI.layoutGraph = function () {
  const s = S(); const cv = $('graphCv'); const r = cv.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const people = s.agents.filter(a => !a.left && (UI.graphAll || a.core));
  const idx = {}; people.forEach((a, i) => { idx[a.id] = i; });
  const edges = [];
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    const a = people[i], b = people[j]; const ra = a.rel[b.id], rb = b.rel[a.id]; if (!ra || !rb) continue;
    const aff = (ra[1] + rb[1]) / 2, tr = (ra[0] + rb[0]) / 2, res = Math.max(ra[5], rb[5]), att = Math.max(ra[6], rb[6]);
    let kind = null, w = 0;
    if (a.couple === b.id || att > 45) { kind = 'romance'; w = att; }
    else if (a.family.includes(b.id)) { kind = 'family'; w = 60; }
    else if (res > 35 || tr < -28) { kind = 'rivalry'; w = Math.max(res, -tr); }
    else if ((a.support[b.id] || 0) > 0.5 || (b.support[a.id] || 0) > 0.5) { kind = 'politics'; w = 50; }
    else if (aff > (UI.graphAll ? 38 : 22)) { kind = 'friend'; w = aff; }
    if (kind) edges.push([i, j, kind, w]);
  }
  // force layout
  const N = people.length, Wd = cv.width, Hd = cv.height;
  const P = people.map((a, i) => ({ x: Wd / 2 + Math.cos(i / N * Math.PI * 2) * Wd * 0.33, y: Hd / 2 + Math.sin(i / N * Math.PI * 2) * Hd * 0.33, vx: 0, vy: 0 }));
  for (let it = 0; it < 260; it++) {
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = P[j].x - P[i].x, dy = P[j].y - P[i].y, d2 = dx * dx + dy * dy + 0.01, f = (UI.graphAll ? 2400 : 9000) * dpr * dpr / d2;
      const d = Math.sqrt(d2); P[i].vx -= f * dx / d; P[i].vy -= f * dy / d; P[j].vx += f * dx / d; P[j].vy += f * dy / d;
    }
    for (const [i, j, k, w] of edges) {
      const dx = P[j].x - P[i].x, dy = P[j].y - P[i].y; const d = Math.hypot(dx, dy) + 0.01;
      const target = (k === 'rivalry' ? 260 : 120) * dpr * (UI.graphAll ? 0.6 : 1); const f = (d - target) * 0.012 * (0.4 + w / 120);
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
    const p = P[i]; const sz = (a.core ? 10 : 6) * dpr;
    g.fillStyle = a.id === s.town.mayor ? '#d8b14a' : a.jailUntil > s.t ? '#c0503e' : '#ebdcb6';
    g.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
    g.fillStyle = '#efe7d3'; g.font = `${(a.core ? 13 : 10) * dpr}px "Pixelify Sans", monospace`; g.textAlign = 'center';
    g.fillText(a.name, p.x, p.y - sz / 2 - 4 * dpr);
  });
};
UI.graphClick = function (e) {
  if (!UI.graph) return; const r = e.target.getBoundingClientRect(); const x = (e.clientX - r.left) * UI.graph.dpr, y = (e.clientY - r.top) * UI.graph.dpr;
  let best = -1, bd = 22 * UI.graph.dpr;
  UI.graph.P.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } });
  if (best >= 0) { UI.closeModal('graph'); UI.openInspector(UI.graph.people[best].id); }
};

// ---------------- developer tools ----------------
UI.openDev = function (tab, arg) {
  UI.devTab = tab || UI.devTab || 'events'; UI.devArg = arg;
  const tabs = [['events', 'Event log'], ['decisions', 'Decision log'], ['agents', 'Agents'], ['memory', 'Memory'], ['rumors', 'Rumors'], ['economy', 'Economy'], ['prompts', 'Prompts']];
  $('devTabs').innerHTML = tabs.map(([k, l]) => `<button class="btn ${UI.devTab === k ? 'on' : ''}" data-t="${k}">${l}</button>`).join('');
  $('devTabs').querySelectorAll('button').forEach(b => b.onclick = () => UI.openDev(b.dataset.t));
  UI.renderDev();
  UI.openModal('dev');
};
UI.renderDev = function () {
  const s = S(); let h = '';
  const sel = s.byId[G().selected] || s.byId.ada;
  if (UI.devTab === 'events') {
    h += `<div class="tbl-wrap"><table class="tbl"><tr><th>When</th><th>Type</th><th>What happened</th><th>World truth</th></tr>${s.events.slice(-140).reverse().map(e => `<tr><td>D${e.day} ${Sim.fmtClock(e.t)}</td><td>${esc(e.type)}</td><td style="white-space:normal">${esc(e.text)}</td><td style="white-space:normal;color:var(--ember)">${esc(e.truth || '')}</td></tr>`).join('')}</table></div>`;
  } else if (UI.devTab === 'decisions') {
    h += `<div class="tbl-wrap"><table class="tbl"><tr><th>Villager</th><th>When</th><th>Chose</th><th>Reason</th><th>Top options (utility)</th></tr>${s.agents.filter(a => a.decisions[0]).map(a => { const d = a.decisions[0]; return `<tr><td><button class="rowbtn" data-insp="${a.id}">${esc(a.name)}</button></td><td>${Sim.fmtClock(d.t)}</td><td>${esc(d.chosen)}${d.src === 'llm' ? ' (Claude)' : ''}</td><td style="white-space:normal">${esc(d.reason)}</td><td style="white-space:normal">${d.top.map(t => esc(t[0]) + ' ' + t[1]).join(' · ')}</td></tr>`; }).join('')}</table></div>`;
  } else if (UI.devTab === 'agents') {
    h += `<div class="tbl-wrap"><table class="tbl"><tr><th>Name</th><th>Job</th><th>Mood</th><th>Coins</th><th>Bread</th><th>LOD</th><th>Doing</th><th>Beliefs</th><th>Memories</th></tr>${s.agents.map(a => `<tr><td><button class="rowbtn" data-insp="${a.id}">${esc(a.name)}</button></td><td>${esc(a.job)}</td><td>${esc(a.moodLabel)}</td><td>${Math.round(a.money)}</td><td>${a.inv.bread}</td><td>${a.lod}</td><td>${esc(planWord(a))}</td><td>${a.beliefs.length}</td><td>${a.memories.length}</td></tr>`).join('')}</table></div>`;
  } else if (UI.devTab === 'memory') {
    h += `<p>Memories of <b>${esc(sel.name)}</b> (select someone to switch). Strength = importance × emotion × recency; weak ones are pruned at midnight and summarised.</p>`;
    h += `<div class="tbl-wrap"><table class="tbl"><tr><th>When</th><th>Kind</th><th>Imp</th><th>Strength</th><th>Memory</th></tr>${sel.memories.slice().reverse().map(m => `<tr><td>D${Sim.dayOf(m.t)} ${Sim.fmtClock(m.t)}</td><td>${esc(m.kind)}</td><td>${(m.imp || 0).toFixed(2)}</td><td>${Sim.strength(m).toFixed(3)}</td><td style="white-space:normal">${esc(m.text)}</td></tr>`).join('')}</table></div>`;
    h += `<h4 class="pixel">Social summaries</h4><pre>${esc(Object.entries(sel.summaries).map(([k, v]) => nm(k) + ': ' + v).join('\n') || 'none yet (written at midnight)')}</pre>`;
  } else if (UI.devTab === 'rumors') {
    const list = Object.values(s.rumors).filter(r => r.hops.length).sort((a, b) => b.hops.length - a.hops.length).slice(0, 40);
    const cur = s.rumors[UI.devArg] || list[0];
    h += `<p>Every claim keeps its provenance: who started it, whether it was true, and how it changed hop by hop.</p><div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:12px"><div class="tbl-wrap"><table class="tbl"><tr><th>Rumor</th><th>Hops</th><th>Truth</th></tr>${list.map(r => `<tr><td style="white-space:normal"><button class="rowbtn" data-chain="${r.id}">${esc(Sim.claimText({ type: r.type, about: r.about, place: r.place, other: r.other, secretId: r.secretId, level: r.origin.level }, r.origin.level))}</button></td><td>${r.hops.length}</td><td>${r.origin.truth === true ? 'true' : r.origin.truth === false ? 'FALSE' : '?'}</td></tr>`).join('')}</table></div><div>`;
    if (cur) {
      h += `<h4 class="pixel">Trace</h4><p>Started by <b>${esc(cur.origin.by === 'witness' ? 'witnesses' : nm(cur.origin.by))}</b> (${esc(cur.origin.how || '')}) on day ${Sim.dayOf(cur.origin.t)}. Origin was ${cur.origin.truth === true ? 'true' : cur.origin.truth === false ? '<b style="color:var(--blood)">false</b>' : 'unverified'}.</p>`;
      h += `<ol class="list">${cur.hops.slice(0, 60).map(x => `<li>${esc(x.from === 'event' ? 'seen' : nm(x.from))} &rarr; ${esc(nm(x.to))}: "${esc(Sim.claimText({ type: cur.type, about: cur.about, place: cur.place, other: cur.other, secretId: cur.secretId }, x.level))}" <span style="color:var(--dim)">conf ${x.conf}${x.mut ? ' · <b style="color:var(--ember)">embellished</b>' : ''}${x.cat ? ' · ' + esc(x.cat) : ''}</span></li>`).join('')}</ol>`;
    }
    h += `</div></div>`;
  } else if (UI.devTab === 'economy') {
    const hist = s.econ.hist;
    h += `<p>Prices react to stock. Farmers and miners sell to the treasury, bakers and the smith buy from it, shops mark up by their owner's greed and empathy.</p>`;
    h += `<canvas class="spark" id="spBread"></canvas><canvas class="spark" id="spTreas"></canvas>`;
    h += `<div class="tbl-wrap"><table class="tbl"><tr><th>Shop</th><th>Owner</th><th>Stock</th><th>Bread price</th><th>Open</th></tr>${Object.values(s.shops).map(sh => `<tr><td>${esc(sh.name)}</td><td>${esc(nm(sh.owner))}</td><td>${esc(JSON.stringify(sh.stock))}</td><td>${sh.sells.includes('tools') && !sh.sells.includes('bread') ? Sim.shopPrice(sh.id, 'tools').toFixed(1) + ' (tools)' : Sim.shopPrice(sh.id, sh.sells.includes('meal') ? 'meal' : 'bread').toFixed(2)}</td><td>${sh.open[0]}-${sh.open[1]}</td></tr>`).join('')}</table></div>`;
    h += `<div class="kv" style="margin-top:10px"><span>Grain in granary</span><span>${Math.round(s.econ.grain)} (price ${Sim.grainPrice().toFixed(2)})</span><span>Ore</span><span>${Math.round(s.econ.ore)} (price ${Sim.orePrice().toFixed(2)})</span><span>Tax</span><span>${Math.round(s.town.tax * 100)}%</span><span>Guard budget</span><span>${Math.round(s.town.guardBudget * 100)}%</span><span>Bread subsidy</span><span>${Math.round(s.town.subsidy * 100)}%</span><span>Treasury</span><span>${Math.round(s.town.treasury)} coins</span></div>`;
    h += `<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><tr><th>Day</th><th>Bread</th><th>Grain</th><th>Ore</th><th>Tools</th><th>Baked</th><th>Sold</th><th>Treasury</th></tr>${hist.slice().reverse().map(r => `<tr><td>${r.day}</td><td>${r.bread}</td><td>${r.grain}</td><td>${r.ore}</td><td>${r.tools}</td><td>${r.baked === undefined ? '' : r.baked}</td><td>${r.sold === undefined ? '' : r.sold}</td><td>${r.treasury}</td></tr>`).join('')}</table></div>`;
  } else if (UI.devTab === 'prompts') {
    const L = s.llmLog.slice(-6).reverse();
    h += `<p>${AV.LLM.ready() ? 'Claude is connected. ' : 'Claude is not active; the village runs on its own rules. '}Every model reply is parsed as JSON and validated before it touches the simulation. Rejected replies fall back to deterministic behaviour.</p>`;
    h += L.length ? L.map(x => `<h4 class="pixel">${esc(x.kind)} · ${esc(nm(x.agent) || '')} · D${Sim.dayOf(x.t)} ${Sim.fmtClock(x.t)} · ${esc(x.result)}</h4><pre>${esc(x.prompt)}</pre><h4 class="pixel">Response</h4><pre>${esc(typeof x.response === 'string' ? x.response : JSON.stringify(x.response, null, 2))}</pre>`).join('') : `<h4 class="pixel">Example prompt for ${esc(sel.name)}</h4><pre>${esc(Sim.buildDecisionPrompt(sel))}</pre>`;
  }
  $('devBody').innerHTML = h;
  $('devBody').querySelectorAll('[data-insp]').forEach(b => b.onclick = () => { UI.closeModal('dev'); UI.openInspector(b.dataset.insp); });
  $('devBody').querySelectorAll('[data-chain]').forEach(b => b.onclick = () => { UI.devArg = b.dataset.chain; UI.renderDev(); });
  if (UI.devTab === 'economy') { spark($('spBread'), s.econ.hist.map(r => r.bread), 'Bread price', '#d8b14a'); spark($('spTreas'), s.econ.hist.map(r => r.treasury), 'Treasury', '#8bb3d1'); }
};
function spark(cv, vals, label, color) {
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
}

// ---------------- away screen, menu ----------------
UI.showAway = function (events, minutes, before) {
  const s = S();
  const top = events.filter(e => e.type !== 'DAY_START').sort((a, b) => (b.imp || 0) - (a.imp || 0)).slice(0, 7).sort((a, b) => a.t - b.t);
  const hrs = Math.round(minutes / 60);
  const after = Sim.stats();
  const lines = [];
  if (before) {
    if (before.mayor !== s.town.mayor) lines.push(nm(s.town.mayor) + ' is now mayor.');
    const ch = (after.bread - before.bread) / before.bread;
    if (Math.abs(ch) > 0.05) lines.push('Bread ' + (ch > 0 ? 'rose ' : 'fell ') + Math.round(Math.abs(ch) * 100) + '% to ' + after.bread.toFixed(1) + ' coins.');
    const papers = s.news.filter(n => n.day > before.day).length; if (papers) lines.push(nm('rose') + ' published ' + papers + ' issue' + (papers > 1 ? 's' : '') + ' of the Post.');
  }
  $('awayMeta').textContent = 'You were gone for ' + (hrs >= 24 ? Math.round(hrs / 24 * 10) / 10 + ' village days' : hrs + ' village hours') + '. ' + lines.join(' ');
  $('awayList').innerHTML = top.map(e => `<li><button data-ev="${e.id}">${esc(e.text)}<small>Day ${e.day}, ${Sim.fmtClock(e.t)} · ${esc(CAT_LABEL[CAT[e.type]] || '')}</small></button></li>`).join('') || '<li>It was quiet. Mostly.</li>';
  $('awayList').querySelectorAll('[data-ev]').forEach(b => b.onclick = () => { UI.closeModal('away'); G().setMode('watch'); UI.focusEvent(+b.dataset.ev); });
  UI.openModal('away');
};
UI.openMenu = function () {
  const llm = AV.LLM;
  $('menuBody').innerHTML = `
  <p>Every villager runs the same loop: perceive, remember, interpret, decide, act. Needs, schedules, money and movement are plain simulation code. What they believe is their own: nobody sees world truth, only what they witnessed, were told, or read in the Post. Rumours carry their source and can grow in the retelling.</p>
  <p>The village keeps running in your browser's storage. Come back later and it simulates the time you missed in coarse steps, then tells you what happened.</p>
  <h4 class="pixel">Claude</h4>
  <p>${llm.available() ? 'Claude can voice villagers when you type to them, write the editor\'s column, and make a decision for any villager from the inspector. Each reply is parsed and checked before it changes anything. It uses your Claude usage, only when you ask.' : 'Claude is not available in this view, so conversations use the built-in responder. The village works the same either way.'}</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="btn ${llm.enabled ? 'on' : ''}" id="mLLM" ${llm.available() ? '' : 'disabled'}>Claude conversations: ${llm.enabled && llm.available() ? 'on' : 'off'}</button><button class="btn ${G().sound ? 'on' : ''}" id="mSnd">Sound: ${G().sound ? 'on' : 'off'}</button></div>
  <h4 class="pixel">Keys</h4>
  <div class="keys" style="display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px"><span><kbd>WASD</kbd> move</span><span><kbd>Space</kbd> jump / fly up</span><span><kbd>Shift</kbd> sprint / fly down</span><span><kbd>E</kbd> talk</span><span><kbd>Q</kbd> inspect</span><span><kbd>LMB</kbd> break</span><span><kbd>RMB</kbd> place</span><span><kbd>1-9</kbd> block</span><span><kbd>Tab</kbd> play / watch</span><span><kbd>F</kbd> follow selected</span><span><kbd>T</kbd> thoughts</span><span><kbd>N</kbd> paper</span><span><kbd>G</kbd> graph</span><span><kbd>H</kbd> heatmap</span><span><kbd>L</kbd> logs</span><span><kbd>[ ]</kbd> speed</span></div>
  <h4 class="pixel">Start over</h4>
  <p>This replaces your village with a fresh one. Everyone forgets you.</p>
  <button class="btn" id="mReset">New village</button> <span id="mResetConfirm"></span>`;
  $('mLLM').onclick = () => { llm.enabled = !llm.enabled; G().saveSettings(); UI.openMenu(); };
  $('mSnd').onclick = () => { G().toggleSound(); UI.openMenu(); };
  $('mReset').onclick = () => { $('mResetConfirm').innerHTML = '<button class="btn primary" id="mResetYes">Yes, start over</button>'; $('mResetYes').onclick = () => { G().resetWorld(); UI.closeModal('menu'); }; };
  UI.openModal('menu');
};
})(typeof window !== 'undefined' ? window : globalThis);
