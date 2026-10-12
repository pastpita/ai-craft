/* AI CRAFT \u2014 pages.js
   The site around the world: brain-first home, MINDS leaderboard, Mind Profiles, villages (map + rankings),
   the brain network and the permanent history. Every number is read from the live simulation. */
(function (root) {
'use strict';
const AV = root.AV, W = root.World;
const Sim = AV.Sim, UI = AV.UI, Net = AV.Net;
const $ = id => document.getElementById(id);
const S = () => Sim.S();
const esc = s => UI.esc(s);
const nm = id => Sim.nameOf(id);
const G = () => AV.Game;
const Pages = AV.Pages = { current: null, arg: null };
const SC = [['cognition', 'Cognition'], ['memory', 'Memory'], ['socialIQ', 'Social IQ'], ['strategy', 'Strategy'], ['creativity', 'Creativity'], ['adaptability', 'Adaptability'], ['influence', 'Influence'], ['accuracy', 'Accuracy'], ['deception', 'Deception'], ['resourcefulness', 'Resourceful'], ['survival', 'Survival']];
const HKEY = { cognition: 'c', memory: 'm', socialIQ: 's', strategy: 'st', creativity: 'cr', adaptability: 'ad', influence: 'i', accuracy: 'ac', deception: 'de', resourcefulness: 'r', survival: 'su' };
const IDENT = {
  highvale: 'Politics and learning. Home of the Academy and the oldest families.',
  ironridge: 'Mines, forges and money. Iron, coal and the odd seam of gold.',
  rivergate: 'Traders on the river. Fish, clay and everybody\'s news.',
  greenhollow: 'Farms and wool. A cooperative that feeds the region.',
  ashfield: 'Poor, restless and quick with a knife. Stone, scrub and grudges.',
};
const faces = {};
Pages.face = function (a, scale) {
  const k = a.id + ':' + (scale || 4);
  if (!faces[k]) { try { faces[k] = AV.Render.faceCanvas(a, scale || 4).toDataURL(); } catch (e) { faces[k] = ''; } }
  return faces[k];
};
const faceImg = (a, cls) => `<img src="${Pages.face(a)}" alt="" width="24" height="24" class="${cls || ''}" style="image-rendering:pixelated">`;
const alive = () => S().agents.filter(a => !a.left);
const sec = (p) => document.querySelector('#page [data-p="' + p + '"]');

// ---------------- navigation ----------------
Pages.init = function () {
  document.querySelectorAll('#nav button').forEach(b => b.onclick = () => Pages.go(b.dataset.page));
  $('brand').onclick = () => Pages.go('home');
  $('page').style.touchAction = 'pan-y';
};
Pages.go = function (p, arg) {
  if (p === 'mind' && !S().byId[arg]) p = 'minds';
  Pages.current = p; Pages.arg = arg;
  document.querySelectorAll('#nav button').forEach(b => b.toggleAttribute('aria-current', b.dataset.page === p || (p === 'mind' && b.dataset.page === 'minds')));
  document.querySelectorAll('#nav button[aria-current]').forEach(b => b.setAttribute('aria-current', 'page'));
  $('page').hidden = p === 'world';
  document.querySelectorAll('#page > .wrap').forEach(w => { w.hidden = w.dataset.p !== p; });
  G().onPage(p);
  if (p !== 'world') { $('page').scrollTop = 0; render(p, true); }
  try { history.replaceState(null, '', '#' + (p === 'mind' ? 'minds' : p)); } catch (e) { /* sandboxed */ }
};
function render(p, first) {
  if (p === 'home') renderHome(first);
  else if (p === 'minds') renderMinds(first);
  else if (p === 'mind') renderMind(first);
  else if (p === 'villages') renderVillages(first);
  else if (p === 'network') renderNetwork(first);
  else if (p === 'history') renderHistory(first);
  const w = sec(p);
  if (w && p !== 'home' && !w.querySelector(':scope > .foot')) w.insertAdjacentHTML('beforeend', Pages.footer());
}
let tick = 0;
Pages.frame = function (dt) {
  tick += dt;
  if (Pages.current === 'network') netFrame(dt);
  if (Pages.current === 'villages') mapFrame(dt);
  if (Pages.current === 'home') pumpThoughts(dt);
  if (tick > 1) { tick = 0; render(Pages.current, false); }
};
Pages.bar = function () {
  const s = S(); if (!s) return;
  const role = Net.role;
  $('liveDot').className = role === 'host' || role === 'follower' ? 'on' : role === 'projection' || role === 'local' ? 'proj' : '';
  $('liveLbl').innerHTML = esc(Net.label());
  $('onlineN').textContent = Net.shared() ? Net.online + (Net.online === 1 ? ' viewer' : ' viewers') : '';
  $('barClock').textContent = 'DAY ' + Sim.dayOf(s.t) + ' \u00B7 ' + Sim.fmtClock(s.t);
};
Pages.onBeat = function (hb) { if (heroMark && Pages.current === 'home') heroMark.beat(0.5 + Math.min(0.7, (hb.dd || 0) / 12)); };

// ---------------- shared bits ----------------
// ---------------- HOME: the live village first ----------------
Pages.LINKS = { x: 'https://x.com/AiCraftGame', xHandle: '@AiCraftGame', github: '' };
const XSVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 2h3l3.4 4.6L12.3 2H14l-4.8 5.6L14.5 14h-3l-3.7-5-4.2 5H2l5.3-6.2z"/></svg>';
Pages.footer = function () {
  return `<footer class="foot"><span class="fmark"><img src="${Pages.markUrl()}" alt="">AI CRAFT</span><a href="${Pages.LINKS.x}" target="_blank" rel="noopener">X ${Pages.LINKS.xHandle}</a>${Pages.LINKS.github ? `<a href="${Pages.LINKS.github}" target="_blank" rel="noopener">GitHub</a>` : ''}<span>World day ${Sim.dayOf(S().t)}</span><span class="note">An independent project. Original art, code and characters; not affiliated with any game studio.</span></footer>`;
};
Pages.markUrl = () => (document.getElementById('markImg') && document.getElementById('markImg').src) || '';
const KIND = (a) => {
  const act = a.acting; const carrying = a.carryN || (a.carry && Object.keys(a.carry).some(k => a.carry[k] > 0));
  if (act === 'build') return ['hammer', 'build'];
  if (act === 'till' || act === 'plant' || act === 'tend') return ['hoe', 'farm'];
  if (act === 'food') return ['wheat', 'farm'];
  if (act === 'wood') return ['axe', 'wood'];
  if (act === 'stone' || act === 'iron' || act === 'coal' || act === 'gold' || act === 'clay') return ['pick', 'mine'];
  if (carrying) return ['log', 'carry'];
  return null;
};
// one villager per kind of work, the busiest first
function workingNow(n) {
  const L = alive().filter(a => !a.sleeping && !a.hidden && a.task);
  const by = {};
  for (const a of L) { const k = KIND(a); if (!k) continue; (by[k[1]] = by[k[1]] || []).push(a); }
  const out = [];
  for (const k of ['build', 'farm', 'wood', 'carry', 'mine']) if (by[k] && by[k].length) out.push(by[k][Math.floor((performance.now() / 9000) % by[k].length)]);
  for (const k in by) for (const a of by[k]) if (out.length < n && !out.includes(a)) out.push(a);
  return out.slice(0, n);
}
let homeT = 0, heroMark = null, lastMindId = 0, lastEvId = 0, lastFireId = 0, lastFireEv = 0;
const delta7 = (a, k) => { const h = a.scoreHist || []; if (h.length < 2) return 0; const old = h[Math.max(0, h.length - 8)]; return Math.round((a.scores[k] - (old[HKEY[k]] !== undefined ? old[HKEY[k]] : a.scores[k])) * 10) / 10; };
const fmtN = n => Math.round(n).toLocaleString('en-US');
// decisions per real minute: the median heartbeat, so a catch-up burst does not count
function decPerMin() { const h = (Net.hbHist || []).slice(-30).filter(x => x >= 0).sort((x, y) => x - y); if (!h.length) return 0; return Math.round(h[h.length >> 1] * 60); }
function sparkSVG(vals, w, h, color) {
  if (!vals || vals.length < 2) return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * (w - 4) + 2, h - 3 - ((v - mn) / sp) * (h - 6)]);
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="2" points="${pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}"/><rect x="${(last[0] - 2).toFixed(1)}" y="${(last[1] - 2).toFixed(1)}" width="4" height="4" fill="${color}"/></svg>`;
}
function mindCard(a) {
  const hist = (a.scoreHist || []).map(h => h.c);
  return `<button class="mcard" data-mind="${a.id}"><img src="${Pages.face(a)}" alt="" width="44" height="44"><span class="n">${esc(a.name)}</span><span class="t">${esc(a.mind ? a.mind.label : '')} \u00B7 ${esc(UI.vname(a.vid))}</span><span class="sc"><span><small>COGNITION</small><br><b>${Math.round(a.scores.cognition)}</b></span>${sparkSVG(hist, 90, 26, '#8fd05a')}</span></button>`;
}
function bindMinds(el) { if (el) el.querySelectorAll('[data-mind]').forEach(b => b.onclick = () => Pages.go('mind', b.dataset.mind)); }
function streamItem(m, isNew) {
  const a = S().byId[m.agent];
  const txt = a ? String(m.text).replace(new RegExp('^' + a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'), '') : m.text;
  return `<li class="${isNew ? 'new' : ''}"><time>${Sim.fmtClock(m.t)}</time>${a ? `<img src="${Pages.face(a)}" alt="" width="24" height="24">` : '<span></span>'}<span><span class="kind k-${esc(m.kind)}">${esc(String(m.kind || 'mind').toUpperCase())}</span>${a ? `<button class="who" data-mind="${a.id}">${esc(a.name)}</button> ` : ''}${esc(txt)}</span></li>`;
}
function eventItem(e, isNew) {
  const c = (UI.CAT && UI.CAT[e.type]) || 'social';
  return `<li class="${isNew ? 'new' : ''}"><time>${e.day !== Sim.dayOf(S().t) ? 'D' + e.day : Sim.fmtClock(e.t)}</time><span class="tag t-${c}">${esc((UI.CAT_LABEL && UI.CAT_LABEL[c]) || c.toUpperCase())}</span><span>${esc(e.text)}${e.vid ? UI.vtag(e.vid) : ''}</span></li>`;
}
// thought cards rising off the brain where a real decision lands
const thoughtQ = [];
function queueThought(m) { thoughtQ.push(m); if (thoughtQ.length > 6) thoughtQ.shift(); }
let thoughtT = 0;
function pumpThoughts(dt) {
  thoughtT -= dt; if (thoughtT > 0 || !heroMark || !thoughtQ.length) return;
  const box = $('hThoughts'); if (!box) return;
  if (box.children.length >= 3) return;
  const m = thoughtQ.shift(); const a = S().byId[m.agent]; if (!a) return;
  thoughtT = 1.4;
  const res = heroMark.fire({ kind: m.kind, agent: a.id, visible: true });
  const txt = String(m.text).replace(new RegExp('^' + a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'), '');
  setTimeout(() => {
    if (!heroMark || !box.isConnected) return;
    const p = heroMark.project(res.end); const W2 = box.clientWidth;
    const card = document.createElement('button'); card.className = 'thought k-' + (m.kind || 'decision');
    card.style.setProperty('--c', AV.Brain.KIND_COL[m.kind] || AV.Brain.KIND_COL.decision);
    card.innerHTML = `<img src="${Pages.face(a)}" alt=""><span><b>${esc(a.name)}</b><small>${esc(String(m.kind || 'decision').toUpperCase())}</small><br>${esc(txt.length > 72 ? txt.slice(0, 70) + '\u2026' : txt)}</span>`;
    const left = Math.max(6, Math.min(W2 - 236, p.x - (p.x > W2 / 2 ? 216 : 20)));
    let top = Math.max(4, p.y - 64);
    for (const o of box.children) { const ol = parseFloat(o.style.left), ot = parseFloat(o.style.top); if (Math.abs(ol - left) < 230 && Math.abs(ot - top) < 62) top = ot + 66; }
    card.style.left = left + 'px'; card.style.top = Math.min(box.clientHeight - 70, top) + 'px';
    card.style.setProperty('--ax', Math.max(8, Math.min(220, p.x - left)) + 'px');
    card.onclick = () => Pages.go('mind', a.id);
    box.appendChild(card);
    setTimeout(() => card.remove(), 5200);
  }, Math.min(1400, res.ms));
}
function renderHome(first) {
  const el = sec('home'); const s = S();
  if (first || !el.dataset.built) {
    el.dataset.built = '1';
    el.innerHTML = `
    <section class="hero4">
      <div class="pitch">
        <p class="kicker"><i class="dot"></i>LIVE \u00B7 <span id="hPop">120</span> MINDS \u00B7 5 VILLAGES \u00B7 ONE CLOCK</p>
        <h1>EVERY VILLAGER <em>THINKS</em> FOR ITSELF</h1>
        <p class="lede">A living block world. AI villagers remember, plan, farm, chop, mine and build their own villages. Not scripted NPCs: autonomous minds you can watch, inspect and influence.</p>
        <div class="cta"><button class="btn big grass" id="goPlay">ENTER THE WORLD</button><button class="btn big plank" id="goWatch">WATCH THE VILLAGE</button></div>
        <div class="social"><a class="xlink" href="${Pages.LINKS.x}" target="_blank" rel="noopener">${XSVG}<span>Follow ${Pages.LINKS.xHandle}</span></a><span id="hLive"></span></div>
      </div>
      <div class="stage" id="hStage">
        <canvas id="heroBrain" aria-label="The block brain. Each flash of light is a decision a villager just made."></canvas>
        <div class="thoughts" id="hThoughts" aria-live="off"></div>
        <span class="hovername" id="hHover" hidden></span>
        <div class="readout"><div><b id="rThink">0</b><span>AWAKE NOW</span></div><div><b id="rDpm">0</b><span>DECISIONS / MIN</span></div><div><b id="rMem">0</b><span>MEMORIES</span></div><div><b id="rDay">1</b><span>WORLD DAY</span></div></div>
        <p class="hint">Every flash is a real decision<span class="dk"> \u00B7 click the brain \u00B7 click a face</span></p>
      </div>
    </section>
    <div class="rest"><div class="inner">
      <section><p class="eyebrow"><span class="live-tag">\u25A0 LIVE</span> THE WORLD RIGHT NOW</p><h2 class="sec">One shared world, counted live</h2><div class="metrics2" id="hMetrics"></div></section>
      <section class="live3">
        <div><p class="eyebrow">WORKING RIGHT NOW <span id="hClock" style="margin-left:auto"></span></p><div id="hWork" class="workcol"></div></div>
        <div><p class="eyebrow"><span class="live-tag">\u25A0</span> WHAT THEY ARE THINKING</p><ul class="stream" id="hStream"></ul></div>
        <div><p class="eyebrow">WHAT JUST HAPPENED</p><ul class="stream evs" id="hEvents"></ul></div>
      </section>
      <section><p class="eyebrow">HOW IT WORKS</p><h2 class="sec">Memory + needs + beliefs + goals = a decision</h2>
        <div class="recipe">
          <div class="cgrid"><div class="cslot"><img src="${UI.icon('mem')}" alt="">MEMORY</div><div class="cslot"><img src="${UI.icon('need')}" alt="">NEEDS</div><div class="cslot"><img src="${UI.icon('belief')}" alt="">BELIEFS</div><div class="cslot"><img src="${UI.icon('goal')}" alt="">GOALS</div></div>
          <div class="arrow" aria-hidden="true">\u2192</div>
          <div style="display:flex;align-items:center;gap:22px;flex-wrap:wrap"><div class="cslot out"><img src="${UI.icon('hammer')}" alt="">TASK</div>
          <div class="steps"><div><b>Memory</b>What they saw, heard and did, weighted by importance and fading with time. Each mind keeps only as much as it can hold.</div><div><b>Needs</b>Hunger, energy, company, safety and comfort pull at every choice.</div><div><b>Beliefs</b>Not facts: what they think is true about others, including rumours that grew in the retelling.</div><div><b>Goals</b>Build a bigger home, open a shop, become mayor, feed the village. Goals turn into tasks.</div></div></div>
        </div>
      </section>
      <section><p class="eyebrow">THE WORK</p><h2 class="sec">They build, farm and mine. For real.</h2><p class="lede" style="margin-bottom:16px">Every block you see placed, tilled or dug was placed, tilled or dug by a villager. Resources are walked to, gathered, carried and stored before anything gets built. When a material runs out, builders change the plan.</p><div class="work3" id="hWork3"></div></section>
      <section><p class="eyebrow">TOP MINDS <button class="btn" id="hAll" style="margin-left:auto">Full leaderboard</button></p><h2 class="sec">Sharpest minds right now</h2><div class="minds-grid" id="hTop"></div></section>
      <section><p class="eyebrow">LIVING VILLAGERS</p><h2 class="sec">Different minds, different lives</h2><div class="vill-grid" id="hVill"></div></section>
      <section><p class="eyebrow">VILLAGES <button class="btn" id="hMap" style="margin-left:auto">Map and rankings</button></p><h2 class="sec">Five places, five temperaments</h2><div class="vgrid" id="hVgrid"></div></section>
      <section><p class="eyebrow">INSPECT THE MIND</p><h2 class="sec">Click any villager and see why</h2><div class="inspect"><div id="hInspect"></div>
        <ul class="points"><li><img src="${UI.icon('hammer')}" alt=""><span><b>Current task and reason</b>Not a vague mood: "Placing blocks: walls of Ivo's cottage (54/143)" because "Ivo saved 180 coins for a cottage".</span></li><li><img src="${UI.icon('mem')}" alt=""><span><b>Memory and beliefs</b>What they remember, what they believe and whether it is actually true.</span></li><li><img src="${UI.icon('pick')}" alt=""><span><b>Skills that grow</b>Farming, building, mining, trading and more rise with practice, from 0 to 100.</span></li><li><img src="${UI.icon('belief')}" alt=""><span><b>Honest labels</b>Every decision is marked BEHAVIOR ENGINE, or AI REASONING when a language model chose it.</span></li></ul></div></section>
      <section><p class="eyebrow">PERSISTENT WORLD</p><h2 class="sec">The world keeps going without you</h2><div class="world2"><div class="daybox" id="hDay"></div><div id="hHist"></div></div></section>
      <section class="community"><div><h2>Follow the villages grow</h2><p>New homes, new fields, elections, feuds and the occasional theft. Updates and clips from the world are posted on X.</p></div><div class="acts"><a class="btn big grass" style="text-decoration:none;display:inline-flex;align-items:center;gap:8px" href="${Pages.LINKS.x}" target="_blank" rel="noopener">${XSVG.replace('<svg', '<svg style="width:16px;height:16px"')} ${Pages.LINKS.xHandle}</a>${Pages.LINKS.github ? `<a class="btn big plank" style="text-decoration:none" href="${Pages.LINKS.github}" target="_blank" rel="noopener">GitHub</a>` : ''}</div></section>
      ${Pages.footer()}
    </div></div>`;
    $('goPlay').onclick = () => { G().setMode('play'); };
    $('goWatch').onclick = () => { const f = workingNow(1)[0]; if (f) G().jumpTo(f.id); else { Pages.go('world'); G().setMode('watch'); } };
    $('hAll').onclick = () => Pages.go('minds');
    $('hMap').onclick = () => Pages.go('villages');
    if (heroMark) heroMark.destroy();
    heroMark = null;
    try {
      heroMark = AV.Brain.hero($('heroBrain'), {
        onPick: (id) => Pages.go('mind', id),
        onHover: (id) => { const h = $('hHover'); if (!h) return; h.hidden = !id; if (id) { const a = S().byId[id]; h.textContent = nm(id) + ' \u00B7 ' + (a && a.mind ? a.mind.label : '') + ' \u00B7 cognition ' + (a ? Math.round(a.scores.cognition) : ''); } },
      });
      heroMark.setOrbit(alive().slice().sort((x, y) => y.scores.cognition - x.scores.cognition).slice(0, 36));
    } catch (e) { console.warn('hero brain', e); }
    lastMindId = 0; lastEvId = 0;
    lastFireId = s.mindFeed[0] ? s.mindFeed[0].id : 0; lastFireEv = s.feed[0] ? s.feed[0].id : 0;
    // open with a few of the latest thoughts
    for (const m of s.mindFeed.slice(0, 3).reverse()) if (m.agent) queueThought(m);
    thoughtT = 2.8;
    homeT = 99;
  }
  const L = alive();
  const awake = L.filter(a => !a.sleeping).length;
  const dpm = decPerMin();
  $('hPop').textContent = L.length;
  $('hClock').textContent = 'DAY ' + Sim.dayOf(s.t) + ' \u00B7 ' + Sim.fmtClock(s.t);
  $('hLive').textContent = Net.shared() ? Net.online + ' watching now' : '';
  $('rThink').textContent = awake; $('rDpm').textContent = dpm; $('rMem').textContent = fmtN((s.counters || {}).memories || 0); $('rDay').textContent = Sim.dayOf(s.t);
  // the brain fires for every new thought and every notable event
  if (heroMark) {
    heroMark.setRate(Math.max(0.8, dpm / 60));
    const fresh = s.mindFeed.filter(m => m.id > lastFireId).slice(0, 8);
    if (fresh.length) { lastFireId = fresh[0].id; for (const m of fresh.reverse()) if (m.agent) queueThought(m); }
    const evs = s.feed.filter(e => e.id > lastFireEv).slice(0, 10);
    if (evs.length) { lastFireEv = evs[0].id; for (const e of evs) { const c = (UI.CAT && UI.CAT[e.type]) || ''; heroMark.fire({ kind: c === 'crime' ? 'crime' : c === 'politics' ? 'politics' : c === 'economy' ? 'trade' : (e.type || '').startsWith('CONSTRUCTION') || e.type === 'BUILDING_CREATED' ? 'build' : 'social', len: 12 + Math.floor((e.imp || 0.4) * 14) }); } }
  }
  // the working-now slots refresh every couple of seconds
  homeT += 1;
  const wk = workingNow(6);
  const sig = wk.map(a => a.id + (a.task ? a.task.t : '')).join('|');
  if ($('hWork').dataset.sig !== sig) {
    $('hWork').dataset.sig = sig;
    $('hWork').innerHTML = wk.map(a => { const k = KIND(a) || ['goal']; return `<button class="workslot" data-jump="${a.id}"><img src="${Pages.face(a)}" alt=""><span><span class="who">${esc(a.name)}</span> <span style="color:var(--dim);font-size:12px">${esc(AV.JOBS[a.job] ? AV.JOBS[a.job].label : '')} \u00B7 ${esc(UI.vname(a.vid))}</span><br><span class="what">${esc(a.task.t)}</span></span><img class="ico8" src="${UI.icon(k[0])}" alt=""></button>`; }).join('') || '<div class="workslot" style="display:block">' + (Sim.hourOf(s.t) >= 20 || Sim.hourOf(s.t) < 6 ? 'Night in the villages: everyone is asleep. Work starts at 06:00, in about ' + Math.max(1, Math.round((((6 * 60 - (s.t % 1440)) + 1440) % 1440) / 1.2 / 60)) + ' real minutes.' : 'Between jobs: villagers are eating, talking or walking to work.') + '</div>';
    $('hWork').querySelectorAll('[data-jump]').forEach(b => b.onclick = () => G().jumpTo(b.dataset.jump));
  }
  // live streams
  const mf = s.mindFeed.slice(0, 12);
  if (!mf.length || mf[0].id !== lastMindId) { $('hStream').innerHTML = mf.map(m => streamItem(m, lastMindId && m.id > lastMindId)).join('') || '<li><span></span><span></span><span style="color:var(--dim)">The minds are waking up.</span></li>'; lastMindId = mf[0] ? mf[0].id : 0; bindMinds($('hStream')); }
  const ev = s.feed.filter(e => (e.imp || 0) >= 0.45 && e.type !== 'DAY_START').slice(0, 12);
  if (!ev.length || ev[0].id !== lastEvId) { $('hEvents').innerHTML = ev.map(e => eventItem(e, lastEvId && e.id > lastEvId)).join('') || '<li><span></span><span></span><span style="color:var(--dim)">Quiet so far.</span></li>'; lastEvId = ev[0] ? ev[0].id : 0; }
  if (homeT < 4 && !first) return;
  homeT = 0;
  // the world in numbers
  const c = s.counters || {}, W0 = c.work || {}, D0 = c.workDay || {};
  const today = k => Math.max(0, (W0[k] || 0) - (D0[k] || 0));
  const ws = Sim.worldStats(); const H = s.statsHist || [];
  const series = k => H.map(h => h[k]).concat([ws[k]]);
  const coins = L.reduce((x, a) => x + (a.money || 0), 0);
  const metrics = [
    ['brain', 'MINDS ONLINE', L.length, '', 1],
    ['need', 'AWAKE NOW', awake, L.length - awake + ' asleep', 1],
    ['goal', 'DECISIONS / MIN', dpm, sparkSVG((Net.hbHist || []).slice(-30), 90, 22, '#8fd05a'), 1],
    ['goal', 'DECISIONS MADE', fmtN(c.decisions || 0), ''],
    ['mem', 'MEMORIES FORMED', fmtN(c.memories || 0), fmtN(ws.memories) + ' held now'],
    ['belief', 'CONVERSATIONS', fmtN(c.convos || 0), ''],
    ['belief', 'BELIEFS HELD', fmtN(ws.beliefs), sparkSVG(series('beliefs'), 90, 22, '#e0773a')],
    ['need', 'STRONG BONDS', fmtN(ws.relationships), sparkSVG(series('relationships'), 90, 22, '#7fb8e6')],
    ['hammer', 'BLOCKS PLACED', fmtN(W0.blocks || 0), today('blocks') + ' today'],
    ['wheat', 'WHEAT HARVESTED', fmtN(W0.harvested || 0), today('harvested') + ' today'],
    ['house', 'BUILDINGS', fmtN(ws.buildings), s.projects.filter(p => !p.done).length + ' underway'],
    ['coin', 'COINS IN POCKETS', fmtN(coins), ''],
  ];
  $('hMetrics').innerHTML = metrics.map(([ic, k, v, sub, brainy]) => `<div class="metric2 ${brainy ? 'brainy' : ''}"><img src="${UI.icon(ic === 'brain' ? 'mem' : ic)}" alt=""><span class="k">${k}</span><b>${esc(v)}</b><span class="sub">${sub && sub.startsWith('<svg') ? sub : esc(sub)}</span></div>`).join('');
  // build / farm / mine
  const cols = [
    ['hammer', 'BUILD', [['blocks', 'blocks placed today', today('blocks')], ['proj', 'buildings underway', s.projects.filter(p => !p.done).length]], 'build'],
    ['hoe', 'FARM', [['planted', 'seeds planted today', today('planted')], ['harvested', 'wheat harvested today', today('harvested')]], 'farm'],
    ['pick', 'MINE & CHOP', [['wood', 'wood brought in today', today('wood')], ['stone', 'stone and ore today', today('stone')]], 'mine'],
  ];
  const busy = {}; for (const a of L) { const k = KIND(a); if (!k) continue; const cc = k[1] === 'wood' || k[1] === 'carry' ? 'mine' : k[1]; (busy[cc] = busy[cc] || []).push(a); }
  $('hWork3').innerHTML = cols.map(([ic, title, nums, key]) => `<div class="wcol"><div class="head"><img src="${UI.icon(ic)}" alt=""><b>${title}</b></div><div class="nums">${nums.map(([, l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div><ul>${(busy[key] || []).slice(0, 4).map(a => `<li><button data-jump="${a.id}"><img src="${Pages.face(a)}" alt=""><span><b>${esc(a.name)}</b> ${esc(a.task ? a.task.t : '')}</span></button></li>`).join('') || '<li style="color:var(--dim);font-size:13px;padding:4px 2px">Nobody at it right now.</li>'}</ul></div>`).join('');
  $('hWork3').querySelectorAll('[data-jump]').forEach(b => b.onclick = () => G().jumpTo(b.dataset.jump));
  // top minds
  const top = L.slice().sort((x, y) => y.scores.cognition - x.scores.cognition).slice(0, 8);
  const tsig = top.map(a => a.id + Math.round(a.scores.cognition)).join();
  if ($('hTop').dataset.sig !== tsig) { $('hTop').dataset.sig = tsig; $('hTop').innerHTML = top.map(mindCard).join(''); bindMinds($('hTop')); }
  // living villagers: a spread of personalities
  const featured = L.filter(a => a.core || a.featured).sort((x, y) => (y.scores.cognition) - (x.scores.cognition));
  const pickV = []; const types = new Set(); for (const a of featured) { if (pickV.length >= 8) break; const t = a.mind ? a.mind.type : ''; if (!types.has(t) || pickV.length >= 5) { types.add(t); pickV.push(a); } }
  $('hVill').innerHTML = pickV.map(a => `<button class="vcard2" data-mind="${a.id}"><span class="top"><img src="${Pages.face(a, 6)}" alt=""><span><span class="n">${esc(a.name)}</span><br><span class="r">${esc(AV.JOBS[a.job] ? AV.JOBS[a.job].label : '')} in ${esc(UI.vname(a.vid))} \u00B7 ${esc(a.mind ? a.mind.label : '')}</span></span></span><span class="traits">${UI.traitChips(a, 3)}</span><span class="task"><small>NOW</small>${esc(a.task ? a.task.t : UI.planWord(a))}</span></button>`).join('');
  bindMinds($('hVill'));
  // villages
  $('hVgrid').innerHTML = W.VILLAGES.map(v => villageCard(v.id)).join('');
  $('hVgrid').querySelectorAll('[data-v]').forEach(b => b.onclick = () => { Pages.focusVillage = b.dataset.v; Pages.go('villages'); });
  // inspection example: the most interesting worker
  const ex = workingNow(1)[0] || featured[0];
  if (ex) {
    const tr = Sim.topRelations(ex, 2);
    $('hInspect').innerHTML = `<div class="icard"><div class="h"><img src="${Pages.face(ex, 8)}" alt=""><span><b>${esc(ex.name)}</b><span>${esc(AV.JOBS[ex.job] ? AV.JOBS[ex.job].label : '')} \u00B7 ${esc(UI.vname(ex.vid))} \u00B7 ${esc(ex.moodLabel)}</span></span><button class="btn" data-jump="${ex.id}">INSPECT IN WORLD</button></div><div class="body">${UI.taskBlock(ex, true)}<div class="kv2"><span>PERSONALITY</span><span>${UI.traitChips(ex, 4)}</span><span>GOAL</span><span>${esc(UI.goalText(((ex.goals || []).find(g => g.primary) || (ex.goals || [])[0])))}</span><span>MEMORY</span><span>${esc((ex.memories[ex.memories.length - 1] || { text: 'Nothing worth remembering yet today.' }).text)}</span><span>FRIENDS</span><span>${esc(tr.friends.map(f => nm(f.id)).join(', ') || '-')}</span></div>${UI.inventory(ex)}${UI.skillBars(ex, 4)}</div></div>`;
    $('hInspect').querySelectorAll('[data-jump]').forEach(b => b.onclick = () => G().jumpTo(b.dataset.jump));
  }
  // persistent world
  const tiers = W.VILLAGES.map(v => [v, s.villages[v.id]]);
  $('hDay').innerHTML = `<div class="big"><small>WORLD DAY</small>${Sim.dayOf(s.t)}</div><div style="color:var(--muted);font-size:14.5px;line-height:1.5">One clock for everyone: a world day lasts 20 real minutes. Close the tab and the villages keep working; come back to what changed.</div>${tiers.map(([v, Vv]) => `<div class="tierrow"><span>${esc(v.name)}</span><span class="bar"><i style="width:${Math.min(100, Math.round((Vv.tierScore || 0) / 58 * 100))}%;background:${v.color}"></i></span><b class="mono" style="font-size:12px">${esc(Vv.tier)}</b></div>`).join('')}`;
  const hist = s.history.filter(h => !h.minor).slice(-6).reverse();
  $('hHist').innerHTML = `<ul class="timeline">${hist.map(h => `<li class="major"><span class="d">DAY ${h.day} \u00B7 ${esc(String(h.kind || '').toUpperCase())}</span>${h.vid ? UI.vtag(h.vid) : ''}<div class="tx">${esc(h.text)}</div></li>`).join('')}</ul><button class="btn plank" id="hHistAll" style="margin-top:10px">Full world history</button>`;
  $('hHistAll').onclick = () => Pages.go('history');
}
Pages.heroFrame = function (dt) { if (Pages.current === 'home') pumpThoughts(dt); };

function villageCard(vid) {
  const s = S(); const V = s.villages[vid]; const st = Sim.stats(vid);
  return `<button class="vcard" data-v="${vid}"><span class="band" style="background:${UI.vcol(vid)}"></span><span class="in"><h3>${esc(V.name)} <small>${esc(V.tier.toUpperCase())}</small></h3><p>${esc(IDENT[vid])}</p><dl><dt>Residents</dt><dd>${st.pop}</dd><dt>Mayor</dt><dd>${esc(nm(st.mayor))}</dd><dt>Happiness</dt><dd>${st.happy}</dd><dt>Avg mind</dt><dd>${st.cognition}</dd><dt>Bread</dt><dd>${st.bread.toFixed(1)}c</dd></dl></span></button>`;
}

// ---------------- MINDS leaderboard ----------------
const lb = { sort: 'cognition', dir: -1, vid: 'all', q: '', type: 'all' };
function renderMinds(first) {
  const el = sec('minds');
  if (first || !el.dataset.built) {
    el.dataset.built = '1';
    el.innerHTML = `<section><p class="eyebrow">MINDS \u00B7 LEADERBOARD</p><h2 class="sec">Every resident, ranked by how well they think</h2>
      <p class="lede">Scores come from personality and from what each resident actually did: memories they kept and used, people they read correctly, goals they reached, beliefs that turned out true, lies that worked. They move at most two points a day.</p></section>
      <section><div class="toolbar"><label for="lbQ">FIND</label><input id="lbQ" placeholder="Name or job" autocomplete="off"><label for="lbV">VILLAGE</label><select id="lbV"><option value="all">All</option>${W.VILLAGES.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select><label for="lbT">MIND TYPE</label><select id="lbT"><option value="all">All</option>${AV.Civ.TYPES.map(t => `<option value="${t}">${esc(t.toLowerCase())}</option>`).join('')}</select></div>
      <div class="lb-wrap"><table class="lb"><thead><tr id="lbHead"></tr></thead><tbody id="lbBody"></tbody></table></div></section>`;
    $('lbQ').oninput = () => { lb.q = $('lbQ').value.trim().toLowerCase(); drawLB(); };
    $('lbV').onchange = () => { lb.vid = $('lbV').value; drawLB(); };
    $('lbT').onchange = () => { lb.type = $('lbT').value; drawLB(); };
    drawLB();
  } else if (tick === 0) drawLB();
}
function drawLB() {
  const cols = [['rank', '#'], ['name', 'Resident'], ['vid', 'Village'], ['type', 'Mind type']].concat(SC).concat([['d7', '7-day']]);
  $('lbHead').innerHTML = cols.map(([k, l]) => `<th ${lb.sort === k ? `aria-sort="${lb.dir < 0 ? 'descending' : 'ascending'}"` : ''}>${k === 'rank' ? l : `<button data-sort="${k}">${l}${lb.sort === k ? (lb.dir < 0 ? ' \u25BC' : ' \u25B2') : ''}</button>`}</th>`).join('');
  $('lbHead').querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { const k = b.dataset.sort; if (lb.sort === k) lb.dir = -lb.dir; else { lb.sort = k; lb.dir = k === 'name' || k === 'vid' || k === 'type' ? 1 : -1; } drawLB(); });
  const byCog = alive().slice().sort((x, y) => y.scores.cognition - x.scores.cognition);
  const rank = {}; byCog.forEach((a, i) => { rank[a.id] = i + 1; });
  let L = byCog.filter(a => (lb.vid === 'all' || a.vid === lb.vid) && (lb.type === 'all' || (a.mind && a.mind.type === lb.type)) && (!lb.q || (a.name + ' ' + a.job).toLowerCase().includes(lb.q)));
  const val = (a, k) => k === 'name' ? a.name : k === 'vid' ? a.vid : k === 'type' ? (a.mind ? a.mind.type : '') : k === 'd7' ? delta7(a, 'cognition') : a.scores[k];
  L.sort((x, y) => { const p = val(x, lb.sort), q = val(y, lb.sort); return (p < q ? -1 : p > q ? 1 : 0) * lb.dir; });
  $('lbBody').innerHTML = L.map(a => {
    const d = delta7(a, 'cognition');
    return `<tr data-mind="${a.id}" tabindex="0"><td class="rank">${rank[a.id]}</td><td><span class="who">${faceImg(a)}<span>${esc(a.name)}<br><small style="color:var(--dim)">${esc(AV.JOBS[a.job] ? AV.JOBS[a.job].label : a.job)}</small></span></span></td><td><span class="vtag" style="background:${UI.vcol(a.vid)};margin:0">${esc(UI.vname(a.vid).toUpperCase())}</span></td><td>${esc(a.mind ? a.mind.label : '')}</td>${SC.map(([k]) => `<td class="${k === 'cognition' ? 'cog' : ''}">${Math.round(a.scores[k])}${k === 'cognition' ? '' : `<span class="cell-bar"><i style="width:${Math.round(a.scores[k])}%"></i></span>`}</td>`).join('')}<td class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' : ''}${d}</td></tr>`;
  }).join('') || `<tr><td colspan="${cols.length}" style="text-align:left;color:var(--dim)">Nobody matches.</td></tr>`;
  $('lbBody').querySelectorAll('[data-mind]').forEach(r => { r.onclick = () => Pages.go('mind', r.dataset.mind); r.onkeydown = (e) => { if (e.key === 'Enter') Pages.go('mind', r.dataset.mind); }; });
}

// ---------------- MIND PROFILE ----------------
let profSig = '';
function renderMind(first) {
  const el = sec('mind'); const s = S(); const a = s.byId[Pages.arg]; if (!a) return;
  const sig = a.id + ':' + (a.decisions[0] ? a.decisions[0].t : 0) + ':' + Math.round(a.scores.cognition * 10) + ':' + a.memories.length + ':' + (a.mind ? a.mind.version : '');
  if (!first && sig === profSig) return;
  profSig = sig;
  const keep = $('page').scrollTop;
  const job = AV.JOBS[a.job] ? AV.JOBS[a.job].label : a.job;
  const V = s.villages[a.vid];
  const m = a.mind || {};
  const props = a.owns.map(id => s.properties[id]).filter(Boolean);
  const biz = Object.values(s.businesses).filter(b => b.owner === a.id);
  const rank = alive().slice().sort((x, y) => y.scores.cognition - x.scores.cognition).findIndex(x => x.id === a.id) + 1;
  const bels = a.beliefs.slice().sort((x, y) => y.conf - x.conf).slice(0, 10);
  const top = Sim.topRelations(a, 5);
  const skills = Object.entries(a.skills || {}).sort((x, y) => y[1] - x[1]).slice(0, 10);
  el.innerHTML = `
  <section class="prof-head"><img src="${Pages.face(a, 14)}" alt="" class="pf">
    <div><p class="eyebrow">MIND PROFILE \u00B7 RANK ${rank} OF ${alive().length}</p><h1>${esc(a.name)}${a.surname ? ' <span style="color:var(--muted);font-size:0.6em">' + esc(a.surname) + '</span>' : ''}</h1><div class="sub">${esc(job)} in ${esc(V.name)} \u00B7 age ${a.age} \u00B7 ${esc(a.moodLabel)}${V.town.mayor === a.id ? ' \u00B7 <b style="color:var(--gold)">Mayor</b>' : ''}</div></div>
    <div class="actions"><button class="btn lime" id="pJump">WATCH IN WORLD</button><button class="btn" id="pBack">All minds</button></div></section>
  <div class="specs"><div><span>Mind type</span><b class="lime">${esc(m.label || '')}</b></div><div><span>Mind version</span><b>${esc(m.version || 'v1.0')}</b></div><div><span>Think interval</span><b>${m.think || '?'} min</b></div><div><span>Memory capacity</span><b>${m.capacity || '?'} items</b></div><div><span>Reasoning depth</span><b>${esc(m.depth || '')}</b></div><div><span>Social model</span><b>${esc(m.smodel || '')}</b></div><div><span>Memories held</span><b>${a.memories.length}</b></div><div><span>Beliefs</span><b>${a.beliefs.length}</b></div></div>
  <section class="twocol">
    <div><p class="eyebrow">SCORES</p><div class="scores" style="grid-template-columns:minmax(0,1fr)">${SC.map(([k, l]) => { const d = delta7(a, k); return `<div class="score ${k === 'cognition' ? 'cog' : ''}"><span class="lbl2">${l}</span><div class="bar"><i style="width:${Math.round(a.scores[k])}%"></i></div><b>${Math.round(a.scores[k])}<small style="color:${d > 0 ? 'var(--moss)' : d < 0 ? 'var(--blood)' : 'var(--dim)'};font-size:11px;margin-left:3px">${d ? (d > 0 ? '+' : '') + d : ''}</small></b></div>`; }).join('')}</div>
      ${a.lastScoreNote ? `<p style="color:var(--muted);font-size:13.5px;margin-top:10px">Last change: ${esc(a.lastScoreNote.k)} ${a.lastScoreNote.d > 0 ? '+' : ''}${Math.round(a.lastScoreNote.d * 10) / 10}, because ${esc(a.name)} ${esc(a.lastScoreNote.why)}.</p>` : ''}</div>
    <div><p class="eyebrow">COGNITION OVER TIME</p><div class="chartbox"><canvas id="pChart"></canvas></div><p style="color:var(--dim);font-size:12.5px;margin-top:6px">One point per world day. Scores move toward what the resident's traits and behavior justify, at most two points a day.</p></div>
  </section>
  <section><p class="eyebrow">LATEST DECISION</p>${UI.decisionBlock(a)}<p style="color:var(--dim);font-size:12.5px;margin-top:6px">These are the inputs and the outcome the engine logged, not a transcript of private reasoning. AI REASONING appears only when the language model actually chose the action.</p></section>
  <section class="twocol">
    <div><p class="eyebrow">RECENT DECISIONS</p><ul class="plist">${a.decisions.slice(0, 8).map(d => `<li><small>D${Sim.dayOf(d.t)} ${Sim.fmtClock(d.t)} \u00B7 ${d.src === 'llm' ? 'AI REASONING' : 'BEHAVIOR ENGINE'}</small><br><b>${esc(d.why ? d.why.decision : d.chosen)}</b> \u00B7 ${esc(d.reason)}</li>`).join('') || '<li>None yet.</li>'}</ul></div>
    <div><p class="eyebrow">BELIEFS (NOT FACTS)</p><ul class="plist">${bels.map(b => { const tr = b.chain ? Sim.truthOf(b.chain, b.level) : null; return `<li>${esc(Sim.cap(Sim.claimText(b, b.level)))} <small>${Math.round(b.conf * 100)}% \u00B7 ${esc(b.src === 'self' ? 'own judgement' : b.src === 'witness' ? 'saw it' : b.src === 'news' ? 'the paper' : 'from ' + nm(b.src))}</small> ${tr === true ? '<span class="pill good">true</span>' : tr === false ? '<span class="pill bad">false</span>' : ''}</li>`; }).join('') || '<li>No strong beliefs.</li>'}</ul></div>
  </section>
  <section class="twocol">
    <div><p class="eyebrow">MEMORIES</p><ul class="plist">${a.memories.slice(-8).reverse().map(mm => `<li><small>D${Sim.dayOf(mm.t)} ${Sim.fmtClock(mm.t)} \u00B7 importance ${(mm.imp || 0).toFixed(2)}</small><br>${esc(mm.text)}</li>`).join('') || '<li>Nothing remembered yet.</li>'}</ul></div>
    <div><p class="eyebrow">RELATIONSHIPS</p><ul class="plist">${top.friends.map(f => `<li><button class="rowbtn" data-mind="${f.id}">${esc(nm(f.id))}</button> <small>${esc(UI.vname(s.byId[f.id] && s.byId[f.id].vid))} \u00B7 trust ${Math.round(f.r[0])} \u00B7 affection ${Math.round(f.r[1])}</small>${a.summaries[f.id] ? '<br>' + esc(a.summaries[f.id]) : ''}</li>`).join('')}${top.rivals.map(f => `<li><button class="rowbtn" data-mind="${f.id}">${esc(nm(f.id))}</button> <small style="color:var(--blood)">friction \u00B7 trust ${Math.round(f.r[0])} \u00B7 resentment ${Math.round(f.r[5])}</small></li>`).join('')}</ul></div>
  </section>
  <section class="twocol">
    <div><p class="eyebrow">SKILLS (0-100)</p><div class="skills">${skills.map(([k, v]) => `<div class="score"><span class="lbl2">${esc(k)}</span><div class="bar"><i style="width:${Math.round(v)}%"></i></div><b>${Math.round(v)}</b></div>`).join('')}</div></div>
    <div><p class="eyebrow">PROPERTY AND WORK</p><ul class="plist"><li>Money: <b class="mono">${Math.round(a.money)}</b> coins${a.debt ? ' \u00B7 owes ' + Math.round(a.debt) : ''}</li><li>Home: ${esc(Sim.placeName(a.home))}${a.renting ? ' (renting)' : ''}</li>${props.map(p => `<li>Owns ${esc(p.kind === 'house' ? (p.tier || 'a') + ' house' : p.kind)} \u00B7 value ${p.value} \u00B7 condition ${Math.round(p.condition * 100)}%${p.forSale ? ' \u00B7 for sale' : ''}</li>`).join('')}${biz.map(b => `<li>Runs <b>${esc(b.name)}</b> \u00B7 ${b.staff ? b.staff.length : 0} staff \u00B7 cash ${Math.round(b.cash || 0)}</li>`).join('')}<li>Goals: ${esc(a.goals.map(g => g.type.replace(/_/g, ' ').toLowerCase()).join(', ') || 'none')}</li></ul>${a.bio ? `<p style="color:var(--muted);font-size:14px;margin-top:10px">${esc(a.bio)}</p>` : ''}</div>
  </section>`;
  $('page').scrollTop = first ? 0 : keep;
  $('pJump').onclick = () => G().jumpTo(a.id);
  $('pBack').onclick = () => Pages.go('minds');
  bindMinds(el);
  drawHistChart($('pChart'), a);
}
function drawHistChart(cv, a) {
  if (!cv) return;
  const r = cv.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(10, r.width * dpr); cv.height = r.height * dpr;
  const g = cv.getContext('2d'); const H = a.scoreHist || [];
  const L = 34 * dpr, B = 22 * dpr, T = 10 * dpr, Rr = 10 * dpr;
  const w = cv.width - L - Rr, h = cv.height - T - B;
  g.font = `${11 * dpr}px "IBM Plex Mono", monospace`; g.fillStyle = '#8a8371'; g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
  for (const v of [0, 25, 50, 75, 100]) { const y = T + h - v / 100 * h; g.beginPath(); g.moveTo(L, y); g.lineTo(L + w, y); g.stroke(); g.textAlign = 'right'; g.fillText(String(v), L - 6 * dpr, y + 4 * dpr); }
  if (H.length < 2) { g.textAlign = 'left'; g.fillText('History starts after the first full day.', L + 6 * dpr, T + h / 2); return; }
  const d0 = H[0].d, d1 = H[H.length - 1].d, span = Math.max(1, d1 - d0);
  const X = d => L + (d - d0) / span * w;
  g.textAlign = 'center'; g.fillText('day ' + d0, X(d0) + 16 * dpr, T + h + 16 * dpr); g.fillText('day ' + d1, X(d1) - 16 * dpr, T + h + 16 * dpr);
  const line = (key, col, wd) => { g.strokeStyle = col; g.lineWidth = wd * dpr; g.beginPath(); H.forEach((p, i) => { const x = X(p.d), y = T + h - (p[key] / 100) * h; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
  line('ac', 'rgba(95,208,214,0.55)', 1.5); line('s', 'rgba(216,177,74,0.55)', 1.5); line('c', '#b6e35a', 2.5);
  const lp = H[H.length - 1]; g.fillStyle = '#b6e35a'; g.fillRect(X(lp.d) - 3 * dpr, T + h - lp.c / 100 * h - 3 * dpr, 6 * dpr, 6 * dpr);
  g.textAlign = 'left'; g.fillStyle = '#b6e35a'; g.fillText('cognition', L + 6 * dpr, T + 12 * dpr); g.fillStyle = '#5fd0d6'; g.fillText('accuracy', L + 84 * dpr, T + 12 * dpr); g.fillStyle = '#d8b14a'; g.fillText('social IQ', L + 160 * dpr, T + 12 * dpr);
}

// ---------------- VILLAGES ----------------
const BCOL = ['#000', '#6c9a3f', '#7a5636', '#8d8f8a', '#6b4a2c', '#b48a54', '#a8d0dc', '#9c4a35', '#b55a3a', '#d8c48c', '#3f6f9e', '#5a3c22', '#c9b04a', '#9a8070', '#8a6438', '#ffb440', '#7b5530', '#a68a5c', '#4d7a2e', '#9a9c96', '#e4dccb', '#5c6b7a', '#a8423a', '#6b4a2c', '#7a3a2a', '#3a3a3e', '#e8c840', '#9aa3ae', '#ebe6da', '#8f918b', '#c9a65a'];
let mapBase = null, mapState = { t: 0 };
function buildMapBase() {
  const cv = document.createElement('canvas'); cv.width = W.W; cv.height = W.D;
  const g = cv.getContext('2d'); const img = g.createImageData(W.W, W.D);
  for (let z = 0; z < W.D; z++) for (let x = 0; x < W.W; x++) {
    const [y, b] = W.topBlockColor(x, z);
    const c = BCOL[b] || '#555';
    const n = parseInt(c.slice(1), 16); const sh = 0.72 + Math.min(0.5, (y - W.GROUND) * 0.045);
    const i = (z * W.W + x) * 4; img.data[i] = Math.min(255, (n >> 16 & 255) * sh); img.data[i + 1] = Math.min(255, (n >> 8 & 255) * sh); img.data[i + 2] = Math.min(255, (n & 255) * sh); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}
function renderVillages(first) {
  const el = sec('villages'); const s = S();
  if (first || !el.dataset.built) {
    el.dataset.built = '1';
    el.innerHTML = `<section><p class="eyebrow">VILLAGES \u00B7 WORLD MAP</p><h2 class="sec">Five settlements on one river valley</h2><p class="lede">Roads meet at the crossroads. Merchants walk them with goods, travellers carry news, migrants move when life sours. Click the map to fly there.</p></section>
    <section class="mapwrap"><div><canvas id="mapCv" width="624" height="624" aria-label="Top-down map of the world"></canvas><div class="legend2">${W.VILLAGES.map(v => `<span><i style="background:${v.color}"></i>${esc(v.name)}</span>`).join('')}<span><i style="background:#fff"></i>visitor</span></div></div>
      <div><p class="eyebrow">RANKINGS</p><div class="lb-wrap"><table class="lb" style="min-width:0"><thead><tr><th>#</th><th>Village</th><th>Tier</th><th>Score</th><th>Pop</th><th>Wealth</th><th>Happy</th><th>Mind</th></tr></thead><tbody id="vRank"></tbody></table></div>
      <p class="eyebrow" style="margin-top:22px">RELATIONS BETWEEN VILLAGES</p><div class="relbars" id="vRel"></div></div></section>
    <section><p class="eyebrow">DETAIL</p><div class="vgrid" id="vCards" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))"></div></section>`;
    mapBase = mapBase || buildMapBase();
    $('mapCv').onclick = (e) => { const r = e.target.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * W.W, z = (e.clientY - r.top) / r.height * W.D; Pages.go('world'); G().setMode('watch'); G().lookAtPoint(x, z); };
  }
  if (!first && tick !== 0) return;
  const rows = W.VILLAGES.map(v => ({ v, st: Sim.stats(v.id), V: s.villages[v.id] })).sort((a, b) => (b.V.tierScore || 0) - (a.V.tierScore || 0));
  $('vRank').innerHTML = rows.map((r, i) => `<tr data-v="${r.v.id}"><td class="rank">${i + 1}</td><td><span class="vtag" style="background:${r.v.color};margin:0">${esc(r.v.name.toUpperCase())}</span></td><td>${esc(r.V.tier)}</td><td>${Math.round(r.V.tierScore || 0)}</td><td>${r.st.pop}</td><td>${r.st.wealth.toLocaleString('en-US')}</td><td>${r.st.happy}</td><td>${r.st.cognition}</td></tr>`).join('');
  const pairs = []; for (let i = 0; i < W.VILLAGES.length; i++) for (let j = i + 1; j < W.VILLAGES.length; j++) pairs.push([W.VILLAGES[i], W.VILLAGES[j], AV.Civ.villageRel(W.VILLAGES[i].id, W.VILLAGES[j].id)]);
  pairs.sort((a, b) => b[2] - a[2]);
  $('vRel').innerHTML = pairs.map(([a, b, v]) => `<div><span>${esc(a.name)} \u2194 ${esc(b.name)}</span><span class="track"><i style="${v >= 0 ? `left:50%;width:${Math.min(50, v / 2)}%;background:var(--moss)` : `right:50%;width:${Math.min(50, -v / 2)}%;background:var(--blood)`}"></i></span><b class="mono" style="text-align:right">${v > 0 ? '+' : ''}${Math.round(v)}</b></div>`).join('');
  $('vCards').innerHTML = W.VILLAGES.map(v => {
    const V = s.villages[v.id]; const st = Sim.stats(v.id);
    const el2 = V.election; const poll = Object.entries(st.poll).sort((a, b) => b[1] - a[1]);
    return `<div class="vcard" style="cursor:default"><span class="band" style="background:${v.color}"></span><span class="in"><h3>${esc(V.name)} <small>${esc(V.tier.toUpperCase())} \u00B7 TECH ${V.tech}</small></h3><p>${esc(IDENT[v.id])}</p><dl>
      <dt>Mayor</dt><dd>${esc(nm(st.mayor))}</dd><dt>Election</dt><dd>${st.electionIn >= 0 ? (st.electionIn === 0 ? 'today' : 'in ' + st.electionIn + 'd') : '-'}${poll.length ? ' \u00B7 ' + esc(nm(poll[0][0])) + ' leads' : ''}</dd>
      <dt>Treasury</dt><dd>${st.treasury}c \u00B7 tax ${Math.round(V.town.tax * 100)}%</dd><dt>Bread</dt><dd>${st.bread.toFixed(2)}c</dd><dt>Food</dt><dd>${st.food} days</dd><dt>Crime</dt><dd>${st.crime} in 3 days</dd><dt>Trust</dt><dd>${st.trust}</dd>
      <dt>Output</dt><dd>${st.output}/day</dd><dt>Influence</dt><dd>${st.influence}</dd>
      <dt>Stock</dt><dd style="white-space:normal">${Sim.GOODS.map(g => g + ' ' + Math.round(V.econ.stock[g] || 0)).join(', ')}</dd>
      <dt>Building</dt><dd style="white-space:normal">${esc(s.projects.filter(p => !p.done && p.vid === v.id).map(p => p.label + ' (' + AV.Civ.stageOf(p) + ')').join(', ') || 'nothing')}</dd>
      <dt>Paper</dt><dd>${esc(Sim.PAPERS[v.id])}</dd></dl>
      <span style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><button class="btn" data-fly="${v.id}">Fly there</button><button class="btn" data-paper="${v.id}">Read the paper</button></span></span></div>`;
  }).join('');
  $('vCards').querySelectorAll('[data-fly]').forEach(b => b.onclick = () => { const v = W.VBY[b.dataset.fly]; Pages.go('world'); G().setMode('watch'); G().lookAtPoint(v.cx, v.cz); });
  $('vCards').querySelectorAll('[data-paper]').forEach(b => b.onclick = () => { Pages.go('world'); UI.openPost(undefined, b.dataset.paper); });
}
function mapFrame(dt) {
  const cv = $('mapCv'); if (!cv || !mapBase) return;
  mapState.t += dt; if (mapState.t < 0.25) return; mapState.t = 0;
  const g = cv.getContext('2d'); const k = cv.width / W.W;
  g.imageSmoothingEnabled = false; g.drawImage(mapBase, 0, 0, cv.width, cv.height);
  // projects being built
  for (const p of S().projects) if (!p.done) { g.strokeStyle = '#efe7d3'; g.lineWidth = 1; g.setLineDash([3, 2]); g.strokeRect(p.lot.x * k, p.lot.z * k, p.lot.w * k, p.lot.d * k); g.setLineDash([]); }
  for (const a of S().agents) { if (a.left || a.hidden) continue; g.fillStyle = UI.vcol(a.vid); g.fillRect(a.x * k - 2, a.z * k - 2, 4, 4); g.fillStyle = '#0a0907'; g.fillRect(a.x * k - 1, a.z * k - 1, 2, 2); }
  for (const p of Net.peers) if (p.pid && p.mode === 'play' && p.x) { g.fillStyle = '#ffffff'; g.fillRect(p.x * k - 3, p.z * k - 3, 6, 6); }
  g.font = 'bold 15px "Pixelify Sans", monospace'; g.textAlign = 'center';
  for (const v of W.VILLAGES) { const t = v.name.toUpperCase(); g.fillStyle = 'rgba(10,9,7,0.75)'; const w = g.measureText(t).width + 10; g.fillRect(v.cx * k - w / 2, (v.cz - v.r - 4) * k - 14, w, 19); g.fillStyle = v.color; g.fillText(t, v.cx * k, (v.cz - v.r - 4) * k); }
}

// ---------------- BRAIN NETWORK ----------------
const net = { nodes: [], edges: [], pulses: [], hover: null, built: 0 };
function renderNetwork(first) {
  const el = sec('network');
  if (first || !el.dataset.built) {
    el.dataset.built = '1';
    el.innerHTML = `<section><p class="eyebrow"><span class="live-tag">\u25A0 LIVE</span> BRAIN NETWORK</p><h2 class="sec">The civilization as one brain</h2><p class="lede">Each square is a resident, placed near their village and sized by influence. Lines are the strongest bonds and feuds. A light runs along a line when those two talk; a square flashes when that mind makes a decision.</p></section>
    <section><canvas id="netCv" aria-label="Network of residents"></canvas><div class="legend2"><span><i style="background:#7d9b52"></i>bond</span><span><i style="background:#c0503e"></i>feud</span><span><i style="background:#5fd0d6"></i>across villages</span><span><i style="background:#b6e35a"></i>deciding now</span><span id="netInfo" style="margin-left:auto;color:var(--parch)"></span></div></section>`;
    const cv = $('netCv');
    cv.onmousemove = (e) => { const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) * net.dpr, y = (e.clientY - r.top) * net.dpr; let best = null, bd = 14 * net.dpr; for (const n of net.nodes) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n; } } net.hover = best; cv.style.cursor = best ? 'pointer' : ''; $('netInfo').textContent = best ? best.a.name + ' \u00B7 ' + (best.a.mind ? best.a.mind.label : '') + ' \u00B7 ' + UI.vname(best.a.vid) : ''; };
    cv.onclick = () => { if (net.hover) Pages.go('mind', net.hover.a.id); };
    net.built = 0;
  }
  if (!net.built || performance.now() - net.built > 15000) layoutNet();
}
function layoutNet() {
  const cv = $('netCv'); if (!cv) return;
  const r = cv.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(10, r.width * dpr); cv.height = Math.max(10, r.height * dpr); net.dpr = dpr;
  const s = S(); const L = alive();
  const Wd = cv.width, Hd = cv.height;
  const pad = 60 * dpr;
  const old = {}; for (const n of net.nodes) old[n.a.id] = n;
  net.nodes = L.map((a, i) => {
    const v = W.VBY[a.vid]; const peers = L.filter(o => o.vid === a.vid); const k = peers.indexOf(a);
    const ang = k / peers.length * Math.PI * 2 + (v.cx * 0.01); const rr = (18 + (k % 3) * 16) * dpr * Math.min(Wd, Hd) / 700 * 1.6;
    const cx = pad + v.cx / W.W * (Wd - pad * 2), cz = pad + v.cz / W.D * (Hd - pad * 2);
    const tx = cx + Math.cos(ang) * rr, ty = cz + Math.sin(ang) * rr;
    const o = old[a.id];
    return { a, x: o ? o.x : tx, y: o ? o.y : ty, tx, ty, size: (4 + (a.scores.influence || 30) / 14) * dpr, flash: o ? o.flash : 0 };
  });
  const idx = {}; net.nodes.forEach((n, i) => { idx[n.a.id] = i; });
  const edges = [];
  for (const n of net.nodes) {
    const a = n.a; const rows = Object.entries(a.rel).filter(([id]) => idx[id] !== undefined);
    const bonds = rows.filter(([, r]) => r[1] > 30 || r[0] > 40).sort((x, y) => (y[1][1] + y[1][0]) - (x[1][1] + x[1][0])).slice(0, 2);
    const feuds = rows.filter(([, r]) => r[5] > 30 || r[0] < -25).sort((x, y) => y[1][5] - x[1][5]).slice(0, 1);
    for (const [id, r] of bonds) if (a.id < id || !(s.byId[id].rel[a.id] && s.byId[id].rel[a.id][1] > 30)) edges.push([idx[a.id], idx[id], s.byId[id].vid !== a.vid ? 'cross' : 'bond', r[1]]);
    for (const [id, r] of feuds) edges.push([idx[a.id], idx[id], 'feud', r[5]]);
  }
  net.edges = edges; net.idx = idx; net.built = performance.now();
}
Net.on('event', (e) => {
  if (Pages.current !== 'network' || !net.idx) return;
  const a = net.idx[e.actor], b = net.idx[e.about] !== undefined ? net.idx[e.about] : net.idx[e.target];
  if (a !== undefined && b !== undefined && a !== b) net.pulses.push({ a, b, t: 0 });
});
Net.on('mind', (m) => { if (Pages.current !== 'network' || !net.idx) return; const i = net.idx[m.agent]; if (i !== undefined) net.nodes[i].flash = 1; });
let netT = 0;
function netFrame(dt) {
  const cv = $('netCv'); if (!cv || !net.nodes.length) return;
  const g = cv.getContext('2d'); const s = S();
  netT += dt;
  // residents in a conversation pulse along their link, decisions flash
  if (netT > 0.6) { netT = 0; for (const n of net.nodes) { const d = n.a.decisions && n.a.decisions[0]; if (d && s.t - d.t < 1.5) n.flash = 1; if (n.a.convo && Math.random() < 0.25) { const rel = Object.keys(n.a.rel).find(id => net.idx[id] !== undefined && s.byId[id].convo && Math.hypot(s.byId[id].x - n.a.x, s.byId[id].z - n.a.z) < 4); if (rel) net.pulses.push({ a: net.idx[n.a.id], b: net.idx[rel], t: 0 }); } } }
  g.fillStyle = '#0d0c0a'; g.fillRect(0, 0, cv.width, cv.height);
  const dpr = net.dpr;
  for (const v of W.VILLAGES) { const pad = 60 * dpr; const cx = pad + v.cx / W.W * (cv.width - pad * 2), cz = pad + v.cz / W.D * (cv.height - pad * 2); g.fillStyle = v.color; g.globalAlpha = 0.08; g.beginPath(); g.arc(cx, cz, 70 * dpr * Math.min(cv.width, cv.height) / 700 * 1.4, 0, Math.PI * 2); g.fill(); g.globalAlpha = 0.85; g.font = `${13 * dpr}px "Pixelify Sans", monospace`; g.textAlign = 'center'; g.fillText(v.name.toUpperCase(), cx, cz - 76 * dpr * Math.min(cv.width, cv.height) / 700 * 1.4); g.globalAlpha = 1; }
  for (const n of net.nodes) { n.x += (n.tx - n.x) * 0.08; n.y += (n.ty - n.y) * 0.08; }
  for (const [i, j, k, w] of net.edges) {
    const a = net.nodes[i], b = net.nodes[j]; if (!a || !b) continue;
    g.strokeStyle = k === 'feud' ? 'rgba(192,80,62,0.55)' : k === 'cross' ? 'rgba(95,208,214,0.45)' : 'rgba(125,155,82,0.45)';
    g.lineWidth = Math.max(1, w / 30) * dpr; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
  net.pulses = net.pulses.filter(p => (p.t += dt * 0.9) < 1);
  for (const p of net.pulses) { const a = net.nodes[p.a], b = net.nodes[p.b]; if (!a || !b) continue; const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t; g.fillStyle = '#efe7d3'; g.fillRect(x - 3 * dpr, y - 3 * dpr, 6 * dpr, 6 * dpr); }
  for (const n of net.nodes) {
    const sz = n.size; n.flash *= 0.94;
    g.fillStyle = UI.vcol(n.a.vid); g.globalAlpha = n.a.sleeping ? 0.4 : 1;
    g.fillRect(n.x - sz / 2, n.y - sz / 2, sz, sz); g.globalAlpha = 1;
    if (n.flash > 0.05) { g.strokeStyle = `rgba(182,227,90,${n.flash})`; g.lineWidth = 2 * dpr; g.strokeRect(n.x - sz / 2 - 3 * dpr, n.y - sz / 2 - 3 * dpr, sz + 6 * dpr, sz + 6 * dpr); }
    if (net.hover === n) { g.strokeStyle = '#efe7d3'; g.lineWidth = 2 * dpr; g.strokeRect(n.x - sz / 2 - 2, n.y - sz / 2 - 2, sz + 4, sz + 4); }
  }
}

// ---------------- HISTORY ----------------
const hf = { vid: 'all', kind: 'major' };
function renderHistory(first) {
  const el = sec('history'); const s = S();
  if (first || !el.dataset.built) {
    el.dataset.built = '1';
    el.innerHTML = `<section><p class="eyebrow">PERMANENT WORLD HISTORY</p><h2 class="sec">Everything that changed the world</h2><p class="lede">Elections, new homes and businesses, migrations, fires, droughts, discoveries and villages that grew. Written as it happens and never reset.</p></section>
    <section><div class="toolbar"><label for="hV">VILLAGE</label><select id="hV"><option value="all">All</option>${W.VILLAGES.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select><label for="hK">SHOW</label><select id="hK"><option value="major">Major events</option><option value="all">Everything</option><option value="politics">Politics</option><option value="growth">Growth</option><option value="build">Building</option><option value="business">Business</option><option value="migration">Migration</option><option value="event">World events</option><option value="social">Social</option></select><span id="hCount" style="color:var(--dim);font-size:13px"></span></div><div id="hList"></div></section>`;
    $('hV').onchange = () => { hf.vid = $('hV').value; drawHist(); };
    $('hK').onchange = () => { hf.kind = $('hK').value; drawHist(); };
    drawHist();
  } else if (tick === 0 && s.history.length !== (el._n || 0)) drawHist();
}
function drawHist() {
  const s = S(); const el = sec('history'); el._n = s.history.length;
  const L = s.history.filter(h => (hf.vid === 'all' || h.vid === hf.vid || !h.vid) && (hf.kind === 'all' || (hf.kind === 'major' ? !h.minor : h.kind === hf.kind))).slice().reverse();
  $('hCount').textContent = L.length + ' entries';
  const byDay = []; for (const h of L) { const last = byDay[byDay.length - 1]; if (last && last.day === h.day) last.items.push(h); else byDay.push({ day: h.day, items: [h] }); }
  $('hList').innerHTML = byDay.slice(0, 120).map(d => `<h3 class="pixel" style="margin:18px 0 6px;color:var(--muted);font-size:15px">DAY ${d.day}</h3><ul class="timeline">${d.items.map(h => `<li class="${h.minor ? '' : 'major'}"><span class="d">${h.t !== undefined ? Sim.fmtClock(h.t) : ''} \u00B7 ${esc(String(h.kind || '').toUpperCase())}</span>${h.vid ? UI.vtag(h.vid) : ''}<div class="tx">${esc(h.text)}</div></li>`).join('')}</ul>`).join('') || '<p style="color:var(--dim)">Nothing recorded yet.</p>';
}
})(typeof window !== 'undefined' ? window : globalThis);
