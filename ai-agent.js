
(function(){
  'use strict';

  const $ = (id) => document.getElementById(id);
  const q = (sel) => document.querySelector(sel);
  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
  const raf = window.requestAnimationFrame.bind(window);

  /*
    AI DJ Stabilizer / Dance-Lock Controller

    Purpose:
    - The original V7 Auto DJ can plan a transition but may leave a large
      "EXECUTE" panel waiting for the user and can start the next song too cold.
    - This layer keeps the DJ in full-auto club mode: it shortens excessive wait
      time, rewrites cold entry offsets to hotter musical sections when possible,
      visibly prepares the incoming deck, and uses existing EQ/Filter/FX controls
      through the public __djDebug action bus. It does not replace the audio
      engine; it steers the same UI/actions a human would use.
  */

  const css = `
    .agent-cockpit{
      margin:0 0 10px;
      background:linear-gradient(180deg,rgba(53,215,196,.11),rgba(255,184,77,.05)),#16171d;
      border:1px solid rgba(53,215,196,.28);
      border-radius:16px;
      padding:10px 12px;
      display:grid;
      grid-template-columns:.78fr 1.05fr 1fr;
      gap:10px;
      box-shadow:0 24px 60px -34px rgba(53,215,196,.42);
    }
    @media(max-width:900px){.agent-cockpit{grid-template-columns:1fr}}
    .agent-card{
      background:rgba(29,31,39,.82);
      border:1px solid rgba(255,255,255,.08);
      border-radius:12px;
      padding:9px 10px;
      min-width:0;
    }
    .agent-title{
      display:flex;align-items:center;justify-content:space-between;gap:8px;
      font-family:'JetBrains Mono',monospace;font-size:.61rem;font-weight:900;
      letter-spacing:.65px;color:#ffb84d;margin-bottom:7px;
    }
    .agent-badge{
      font-family:'JetBrains Mono',monospace;font-size:.56rem;font-weight:900;
      letter-spacing:.55px;border:1px solid rgba(255,255,255,.16);
      border-radius:999px;padding:2px 7px;color:#8b8d99;background:rgba(255,255,255,.035);
      white-space:nowrap;
    }
    .agent-badge.on{color:#35d7c4;border-color:#35d7c4;background:rgba(53,215,196,.15)}
    .agent-badge.warn{color:#ffb84d;border-color:#ffb84d;background:rgba(255,184,77,.13)}
    .agent-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0}
    .agent-row label{font-size:.67rem;color:#8b8d99;font-weight:800;white-space:nowrap}
    .agent-select{
      min-width:126px;flex:1;background:#262832;color:#eef0f4;border:1px solid rgba(255,255,255,.15);
      border-radius:9px;padding:6px 8px;font-family:'Cairo',system-ui,sans-serif;font-size:.71rem;
    }
    .agent-row input[type=range]{flex:1}
    .agent-pill{font-family:'JetBrains Mono',monospace;font-size:.65rem;color:#35d7c4;min-width:44px;text-align:left}
    .agent-metrics{display:grid;grid-template-columns:1fr 1fr;gap:7px}
    .agent-metric{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:7px;min-width:0}
    .agent-metric .k{font-size:.58rem;color:#565964;font-family:'JetBrains Mono',monospace;letter-spacing:.4px}
    .agent-metric .v{font-size:.73rem;color:#eef0f4;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;unicode-bidi:plaintext}
    .agent-reason{font-size:.70rem;color:#8b8d99;line-height:1.55;unicode-bidi:plaintext}
    .agent-reason b{color:#eef0f4}
    .agent-actions{display:flex;flex-direction:column;gap:5px;max-height:135px;overflow:auto}
    .agent-action{display:grid;grid-template-columns:58px 1fr;gap:7px;align-items:start;font-size:.67rem;color:#8b8d99;line-height:1.35;padding:6px 7px;border-radius:8px;background:rgba(255,255,255,.032)}
    .agent-action strong{font-family:'JetBrains Mono',monospace;color:#35d7c4;font-size:.56rem;letter-spacing:.4px}
    .agent-action.warn strong{color:#ffb84d}.agent-action.danger strong{color:#ef4a56}
    .agent-ai-mark{box-shadow:0 0 0 1px #ffb84d,0 0 18px rgba(255,184,77,.25)!important;border-color:#ffb84d!important;filter:brightness(1.18)}
    .agent-deck-badge{position:absolute;top:-8px;inset-inline-start:12px;z-index:2;font-family:'JetBrains Mono',monospace;font-size:.55rem;font-weight:900;letter-spacing:.55px;padding:2px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:#16171d;color:#565964}
    .deck{position:relative}.agent-deck-badge.live-a{color:#35d7c4;border-color:#35d7c4}.agent-deck-badge.live-b{color:#ef4a56;border-color:#ef4a56}.agent-deck-badge.next{color:#ffb84d;border-color:#ffb84d}.agent-deck-badge.mix{color:#ffb84d;border-color:#ffb84d;box-shadow:0 0 16px rgba(255,184,77,.22)}
    #nextMixPanel.agent-auto-locked{border-color:rgba(53,215,196,.42);box-shadow:0 0 0 1px rgba(53,215,196,.08),0 24px 60px -40px rgba(53,215,196,.6)}
    #nextMixPanel.agent-auto-locked .nextmix-badge{color:#35d7c4;border-color:#35d7c4;background:rgba(53,215,196,.12)}
    #nextMixExecute.agent-auto-btn{background:rgba(53,215,196,.16)!important;border-color:#35d7c4!important;color:#35d7c4!important}
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const profiles = {
    club: 'Club / Dance Lock: ينفذ لحاله، لا ينتظر EXECUTE، يحافظ على الطاقة، ويدخل من مقطع قوي.',
    smooth: 'Smooth: نفس الأتمتة لكن انتقالات أهدأ وفلتر أقل.',
    creative: 'Creative: يضيف Sampler/FX أكثر، لكنه ما يترك المود ينزل.',
    safe: 'Safe: أقل مخاطرة، يتجنب تصادم الغناء ويقلل FX.'
  };

  function injectUi(){
    if ($('agentCockpit')) return;
    const panel = document.createElement('section');
    panel.className = 'agent-cockpit';
    panel.id = 'agentCockpit';
    panel.innerHTML = `
      <div class="agent-card">
        <div class="agent-title"><span>AI DJ AGENT</span><span class="agent-badge on" id="agentBadge">DANCE LOCK</span></div>
        <div class="agent-row">
          <label>الوضع</label>
          <select class="agent-select" id="agentMode">
            <option value="club" selected>Club / Dance Lock</option>
            <option value="smooth">Smooth</option>
            <option value="creative">Creative</option>
            <option value="safe">Safe</option>
          </select>
        </div>
        <div class="agent-row">
          <label>تحكم البوت</label>
          <input type="range" id="agentLevel" min="0" max="100" step="5" value="100">
          <span class="agent-pill" id="agentLevelText">100%</span>
        </div>
        <div class="agent-reason" id="agentModeExplain">${profiles.club}</div>
      </div>
      <div class="agent-card">
        <div class="agent-title"><span>AI BRAIN</span><span class="agent-badge on" id="agentBrainBadge">AUTO</span></div>
        <div class="agent-metrics">
          <div class="agent-metric"><div class="k">LIVE</div><div class="v" id="agentLive">—</div></div>
          <div class="agent-metric"><div class="k">NEXT</div><div class="v" id="agentNext">—</div></div>
          <div class="agent-metric"><div class="k">STRATEGY</div><div class="v" id="agentStrategy">—</div></div>
          <div class="agent-metric"><div class="k">WAIT</div><div class="v" id="agentWait">—</div></div>
        </div>
        <div class="agent-reason" id="agentReason" style="margin-top:8px">أراقب الخطة وأدخل تلقائيًا من نقطة أقوى بدل الانتظار الطويل.</div>
      </div>
      <div class="agent-card">
        <div class="agent-title"><span>AI ACTIONS</span><span class="agent-badge" id="agentActionCount">0</span></div>
        <div class="agent-actions" id="agentActions">
          <div class="agent-action"><strong>READY</strong><span>Dance Lock جاهز، شغّل AI وأنا بنفذ لحالي.</span></div>
        </div>
      </div>`;
    const next = $('nextMixPanel');
    const mixer = $('mixer') || q('.mixer');
    if (next && next.parentNode) next.parentNode.insertBefore(panel, next);
    else if (mixer && mixer.parentNode) mixer.parentNode.insertBefore(panel, mixer);
    else document.body.prepend(panel);

    [['A','.deck-a'],['B','.deck-b']].forEach(([k,sel])=>{
      const d = q(sel);
      if(d && !$('agentDeck'+k)){
        d.insertAdjacentHTML('afterbegin', `<div class="agent-deck-badge" id="agentDeck${k}">IDLE</div>`);
      }
    });

    const m = $('agentMode');
    if (m) m.addEventListener('change', e => { mode = e.target.value; log('MODE', profiles[mode] || profiles.club, 'warn'); });
    const l = $('agentLevel');
    if (l) l.addEventListener('input', e => { level = parseInt(e.target.value, 10) || 0; log('LEVEL', 'مستوى تحكم البوت: ' + level + '%.', level>=75?'warn':''); });
  }

  let mode = 'club';
  let level = 100;
  let actions = [];
  let lastPlanKey = '';
  let lastExecutedKey = '';
  let lastFeatureKey = '';
  let lastArmedKey = '';
  let lastClickAt = 0;
  let lastUiPatchAt = 0;
  let stableProblems = [];

  function dbg(){ return window.__djDebug || null; }
  function auto(){
    const d = dbg();
    return d && d.autoDj && d.autoDj.state ? d.autoDj.state : null;
  }
  function now(){
    const d = dbg();
    return d && d.now ? d.now() : null;
  }
  function deckName(d,k){
    const meta = d && d.decks && d.decks[k] && d.decks[k].meta;
    return meta && meta.track ? meta.track.name : '—';
  }
  function deckMeta(d,k){
    return d && d.decks && d.decks[k] ? d.decks[k].meta : null;
  }

  function log(label,text,kind){
    actions.unshift({label,text,kind:kind||''});
    actions = actions.slice(0,10);
    renderActions();
  }
  function renderActions(){
    const box = $('agentActions');
    const count = $('agentActionCount');
    if(count) count.textContent = String(actions.length);
    if(!box) return;
    box.innerHTML = (actions.length ? actions : [{label:'READY',text:'Dance Lock جاهز.',kind:''}])
      .map(a => `<div class="agent-action ${a.kind||''}"><strong>${a.label}</strong><span>${a.text}</span></div>`)
      .join('');
  }
  function mark(el){
    if(!el) return;
    el.classList.add('agent-ai-mark');
    clearTimeout(el.__agentMark);
    el.__agentMark = setTimeout(() => el.classList.remove('agent-ai-mark'), 850);
  }
  function setRange(id,val){
    const el = $(id);
    if(!el) return false;
    const min = el.min !== '' ? parseFloat(el.min) : -Infinity;
    const max = el.max !== '' ? parseFloat(el.max) : Infinity;
    const v = clamp(Number(val), min, max);
    if (Math.abs(Number(el.value) - v) < 0.005) return true;
    el.value = String(v);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    mark(el);
    return true;
  }
  function click(id){
    const el = $(id);
    if(!el || el.disabled) return false;
    mark(el);
    el.click();
    return true;
  }
  function setEq(deck, band, value){
    const prefix = band === 'high' ? 'eqHi' : band === 'mid' ? 'eqMid' : band === 'low' ? 'eqLow' : 'color';
    return setRange(prefix + deck, value);
  }
  function setTempo(deck, value){ return setRange('tempo' + deck, value); }
  function callAction(name, ...args){
    const d = dbg();
    const fn = d && d.actions && d.actions[name];
    if (typeof fn === 'function') {
      try { return fn(...args); } catch(e) {}
    }
    return null;
  }

  function bpmOf(d,k){
    const m = deckMeta(d,k);
    return m ? (m.effectiveBpm || (m.track && m.track.bpm) || 120) : 120;
  }
  function elapsedOf(d,k){
    const m = deckMeta(d,k);
    try { return (d && d.elapsed && m) ? d.elapsed(m, d.now()) : 0; } catch(e) { return 0; }
  }
  function barsUntilPlan(d,a){
    if(!d || !a || !a.nextTrack || !a.nextTrack.plan || !a.liveKey) return null;
    const live = deckMeta(d, a.liveKey);
    if(!live) return null;
    const bpm = bpmOf(d, a.liveKey);
    const beatLen = 60 / Math.max(50, bpm);
    const elapsed = elapsedOf(d, a.liveKey);
    const trigger = Number(a.nextTrack.plan.trigger);
    if(!Number.isFinite(trigger)) return null;
    return Math.max(0, Math.round((trigger - elapsed) / (beatLen * 4)));
  }
  function currentTransitionProgress(d,a){
    if(!d || !a || !a.transition) return null;
    const t = a.transition;
    const n = d.now ? d.now() : null;
    if(!Number.isFinite(n) || !Number.isFinite(t.startedAt) || !Number.isFinite(t.duration) || t.duration <= 0) return null;
    return clamp((n - t.startedAt) / t.duration, 0, 1);
  }

  function normalizeEnergy(section){
    const e = Number(section && section.energy);
    return Number.isFinite(e) ? e : 0;
  }
  function findHotEntry(track){
    if(!track) return 0;
    const duration = Number(track.duration || (track.audioBuffer && track.audioBuffer.duration) || 0);
    const minStart = Math.min(Math.max(16, duration * 0.08), 45);
    const maxStart = duration > 80 ? duration - 40 : duration;
    const sections = track.structure && Array.isArray(track.structure.sections) ? track.structure.sections : [];
    const preferred = ['drop','buildup','intro-hot','verse'];
    let candidates = [];
    for (const s of sections) {
      if (!s || !Number.isFinite(s.start)) continue;
      if (s.start < minStart || s.start > maxStart) continue;
      if (/outro|breakdown/i.test(s.label || '')) continue;
      const rank = preferred.indexOf(s.label);
      candidates.push({pos:s.start, rank: rank === -1 ? 10 : rank, energy: normalizeEnergy(s), label:s.label || 'section'});
    }
    if (candidates.length) {
      candidates.sort((a,b) => (a.rank-b.rank) || (b.energy-a.energy) || (a.pos-b.pos));
      return Math.max(0, candidates[0].pos);
    }
    const phrases = track.phrases && (track.phrases.phrases16 || track.phrases.phrases8 || track.phrases.phrases32);
    if (Array.isArray(phrases) && phrases.length) {
      const p = phrases.find(x => x >= minStart && x <= maxStart);
      if (Number.isFinite(p)) return p;
    }
    if (duration) return clamp(duration * 0.22, 12, Math.max(12, duration - 45));
    return 0;
  }
  function patchPlanToHotEntry(d,a){
    if(!a || !a.nextTrack || !a.nextTrack.plan || !a.nextTrack.track) return false;
    const plan = a.nextTrack.plan;
    const hot = findHotEntry(a.nextTrack.track);
    const cur = Number(plan.incomingOffset || 0);
    const shouldSkipIntro = cur < 12 || cur < hot - 10;
    if (hot > 0 && shouldSkipIntro) {
      plan.incomingOffset = hot;
      const key = (a.nextTrack.track.name || '') + '@' + Math.round(hot);
      if (key !== lastPlanKey) {
        lastPlanKey = key;
        log('HOT-IN', 'تجاوزت بداية الأغنية ودخلت من مقطع أقوى عند ' + Math.round(hot) + 's.', 'warn');
      }
      return true;
    }
    return false;
  }

  function setNextMixAutoUi(d,a){
    const panel = $('nextMixPanel');
    if(!panel) return;
    panel.classList.add('agent-auto-locked');
    const badge = panel.querySelector('.nextmix-badge');
    if (badge) badge.textContent = 'NEXT MIX • AUTO';
    const btn = $('nextMixExecute');
    if(btn){
      btn.textContent = 'AUTO EXECUTE';
      btn.classList.add('agent-auto-btn');
    }
    const reason = $('nextMixReason');
    const bars = barsUntilPlan(d,a);
    if(reason && a && a.on && a.nextTrack){
      const extra = [];
      if (bars != null && bars > maxAllowedBars()) extra.push('اختصرت الانتظار الطويل');
      extra.push('Dance Lock يحافظ على طاقة الرقص');
      reason.textContent = 'السبب: ' + extra.join('، ') + ' — التنفيذ تلقائي بدون ضغط.';
    }
  }

  function maxAllowedBars(){
    if(level < 75) return 999;
    if(mode === 'safe') return 12;
    if(mode === 'smooth') return 16;
    return 8; // club + creative
  }
  function minBarsBeforeForcedStart(){
    if(mode === 'safe') return 4;
    if(mode === 'smooth') return 6;
    return 2;
  }
  function prepareIncomingDeck(d,a){
    if(!a || !a.nextTrack || !a.nextTrack.key || !a.on) return;
    const to = a.nextTrack.key;
    const plan = a.nextTrack.plan;
    if(!plan) return;
    const key = to + ':' + (a.nextTrack.track && a.nextTrack.track.name || '');
    if(key === lastArmedKey) return;
    lastArmedKey = key;

    setEq(to,'low',-1);
    setEq(to,'filter', mode === 'smooth' || mode === 'safe' ? 0.08 : 0.18);
    if(Number.isFinite(plan.rate)){
      setTempo(to, (plan.rate - 1) * 100);
    }
    log('ARM', 'جهّزت Deck ' + to + ': Bass مقطوع، Filter جاهز، Tempo مضبوط قبل الدخول.', 'warn');
  }
  function maybeForceAutoExecute(d,a){
    if(!d || !a || !a.on || !a.nextTrack || a.transition || level < 75) return;
    const bars = barsUntilPlan(d,a);
    if(bars == null) return;
    patchPlanToHotEntry(d,a);
    prepareIncomingDeck(d,a);

    const elapsed = elapsedOf(d, a.liveKey);
    const tooLong = bars > maxAllowedBars() && elapsed > 12;
    const dueSoon = bars <= minBarsBeforeForcedStart();
    const key = (a.liveKey || '') + '>' + (a.nextTrack.key || '') + ':' + (a.nextTrack.track && a.nextTrack.track.name || '') + ':' + Math.floor(elapsed / 10);
    const enoughCooldown = Date.now() - lastClickAt > 4500;

    if ((tooLong || dueSoon) && enoughCooldown && key !== lastExecutedKey) {
      lastExecutedKey = key;
      lastClickAt = Date.now();
      const label = tooLong ? 'FAST-MIX' : 'AUTO';
      log(label, tooLong ? ('الانتظار ' + bars + ' bars طويل؛ بدأت النقلة الآن حتى ما يبرد المود.') : 'بدأت النقلة تلقائيًا.', 'warn');
      click('nextMixExecute');
    }
  }

  function maybeUseFeaturesDuringTransition(d,a){
    if(!d || !a || !a.on || !a.transition || level < 75) return;
    const t = a.transition;
    const p = currentTransitionProgress(d,a);
    if(p == null) return;
    const from = t.fromKey, to = t.toKey;
    const featureKey = from + '>' + to + ':' + Math.round(t.startedAt || 0);

    // Always visible: use filter as a musical feature, not random motion.
    if(mode !== 'safe'){
      setEq(from,'filter', -0.10 - p * (mode === 'creative' ? 0.62 : 0.44));
      setEq(to,'filter', Math.max(0, (1 - p) * 0.18));
    }

    if(featureKey !== lastFeatureKey && p > 0.18) {
      lastFeatureKey = featureKey;
      if(mode === 'club' || mode === 'creative') {
        try { callAction('toggleLoopSize', from, 4); } catch(e) {}
        log('LOOP', 'Loop قصير على الخارج حتى تظل الإيقاعة ماسكة أثناء النقل.', 'warn');
      }
    }

    if((mode === 'club' || mode === 'creative') && p > 0.62 && p < 0.74 && !t.__agentEcho){
      t.__agentEcho = true;
      callAction('toggleFx', from, 'echo');
      log('FX', 'Echo Out خفيف للخروج بدون ما يقطع الرقص.', 'warn');
    }

    if(mode === 'creative' && p > 0.35 && p < 0.48 && !t.__agentSampler){
      t.__agentSampler = true;
      try {
        callAction('setPadMode', from, 'sampler');
        callAction('samplerAction', from, 0);
        setTimeout(()=>{ try { callAction('samplerAction', from, 0); } catch(e){} }, 600);
        log('PAD', 'استخدمت Sampler قصير كـfill بين الأغنيتين.', 'warn');
      } catch(e){}
    }
  }

  function statusFor(k,a,d){
    if(a && a.transition && (a.transition.fromKey === k || a.transition.toKey === k)) return 'MIXING';
    if(a && a.liveKey === k) return 'LIVE';
    if(a && a.nextTrack && a.nextTrack.key === k) return 'NEXT';
    const m = deckMeta(d,k);
    return m ? (m.playing ? 'PLAYING' : 'CUED') : 'IDLE';
  }
  function renderDeckBadges(d,a){
    ['A','B'].forEach(k => {
      const el = $('agentDeck' + k);
      if(!el) return;
      const st = statusFor(k,a,d);
      el.textContent = st;
      let cls = 'agent-deck-badge ';
      if(st === 'MIXING') cls += 'mix';
      else if(st === 'LIVE') cls += (k === 'A' ? 'live-a' : 'live-b');
      else if(st === 'NEXT') cls += 'next';
      el.className = cls;
    });
  }
  function renderAgent(d,a){
    injectUi();
    const on = !!(a && a.on);
    const badge = $('agentBadge');
    if(badge){
      badge.textContent = on ? 'DANCE LOCK ON' : 'STANDBY';
      badge.className = 'agent-badge ' + (on ? 'on' : '');
    }
    const brain = $('agentBrainBadge');
    if(brain){
      brain.textContent = level >= 75 ? 'FULL AUTO' : level >= 50 ? 'SEMI AUTO' : level >= 25 ? 'SUGGEST' : 'MANUAL';
      brain.className = 'agent-badge ' + (level >= 75 ? 'on' : 'warn');
    }
    if($('agentLevelText')) $('agentLevelText').textContent = level + '%';
    if($('agentModeExplain')) $('agentModeExplain').textContent = profiles[mode] || profiles.club;
    if($('agentLive')) $('agentLive').textContent = a && a.liveKey ? ('Deck ' + a.liveKey + ' · ' + deckName(d,a.liveKey)) : '—';
    if($('agentNext')) $('agentNext').textContent = a && a.nextTrack ? ('Deck ' + a.nextTrack.key + ' · ' + a.nextTrack.track.name) : '—';
    if($('agentStrategy')) {
      $('agentStrategy').textContent =
        a && a.transition ? a.transition.strategy.name :
        a && a.nextTrack && a.nextTrack.plan ? a.nextTrack.plan.strategy.name :
        (mode.toUpperCase());
    }
    const bars = barsUntilPlan(d,a);
    if($('agentWait')) $('agentWait').textContent = bars == null ? '—' : (bars + ' bars');
    if($('agentReason')) {
      $('agentReason').innerHTML = on
        ? '<b>Auto حقيقي:</b> أختصر الانتظار الطويل، أدخل من مقطع أقوى، وأستخدم LOW/FLT/FX/Loop حسب الحاجة.'
        : '<b>Manual:</b> اضغط AI TAKE OVER حتى أستلم؛ TAKE CONTROL يوقف الأتمتة فورًا.';
    }
    renderDeckBadges(d,a);
  }

  function patchAutoButton(){
    const btn = $('autoDjBtn');
    if(!btn || btn.__agentPatched) return;
    btn.__agentPatched = true;
    btn.addEventListener('click', () => {
      setTimeout(() => {
        const a = auto();
        if(a && a.on) log('ON', 'استلمت بالكامل: التنفيذ تلقائي، Dance Lock، وبدون انتظار EXECUTE.', 'warn');
        else log('MANUAL', 'TAKE CONTROL: أوقفت الأتمتة وتركت الصوت والقيم مكانها.', 'danger');
      }, 80);
    }, {capture:true});
  }

  function auditVisualProblems(d,a){
    stableProblems = [];
    const bars = barsUntilPlan(d,a);
    if (bars != null && bars > 16) stableProblems.push('انتظار طويل جدًا قبل النقلة: ' + bars + ' bars');
    if (a && a.nextTrack && a.nextTrack.plan && a.nextTrack.plan.incomingOffset < 10) stableProblems.push('خطة الدخول من بداية/intro بارد');
    if (a && a.on && a.nextTrack && !a.transition && $('nextMixExecute')) stableProblems.push('زر EXECUTE ظاهر رغم أن المطلوب Auto');
    return stableProblems;
  }

  function loop(){
    const d = dbg();
    const a = auto();

    injectUi();
    patchAutoButton();

    // Keep the base UI honest.
    if(Date.now() - lastUiPatchAt > 500){
      lastUiPatchAt = Date.now();
      setNextMixAutoUi(d,a);
      const status = $('autoDjStatus');
      if(status && a && a.on){
        status.style.display = 'block';
        status.textContent = 'Dance Lock: البوت ينفذ لوحده، يدخل من مقطع قوي، ويحافظ على الطاقة. TAKE CONTROL يرجعك Manual.';
      }
    }

    if(d && a){
      auditVisualProblems(d,a);
      maybeForceAutoExecute(d,a);
      maybeUseFeaturesDuringTransition(d,a);
    }
    renderAgent(d,a);

    raf(loop);
  }

  window.__agentTakeover = {
    setMode:m => { mode = m; const el=$('agentMode'); if(el) el.value=m; log('MODE', profiles[mode] || String(mode), 'warn'); },
    setLevel:v => { level = clamp(parseInt(v,10)||0,0,100); const el=$('agentLevel'); if(el) el.value=level; log('LEVEL', 'مستوى تحكم البوت: ' + level + '%.', 'warn'); },
    executeNow:() => click('nextMixExecute'),
    hotEntry:findHotEntry,
    problems:() => stableProblems.slice(),
    log
  };

  injectUi();
  log('PATCH', 'فعّلت نسخة مستقرة: AUTO حقيقي + Dance Lock + Hot-in + استخدام فيتشرز بدون فوضى.', 'warn');
  loop();

})();
