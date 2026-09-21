
(function(){
  'use strict';

  const $ = (id) => document.getElementById(id);
  const q = (sel) => document.querySelector(sel);
  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
  const raf = window.requestAnimationFrame.bind(window);

  /*
    V10 REMIX DJ BOT — Human Performance Engine
    ------------------------------------------------------------
    This file is intentionally a runtime layer on top of the current
    browser DJ engine. It does NOT fake audio. It steers the same public
    __djDebug action bus a human uses: EQ, color filter, tempo, loops,
    FX, sampler pads, hot jumps, and the existing transition executor.

    Goal:
    - Move from "Auto Mix" to "human-like remix routines".
    - Keep dance-floor energy: no long waiting, no cold intro entry.
    - Execute routines automatically; user should not need to press EXECUTE.
    - Show the actual routine steps instead of a boring NEXT MIX panel.
  */

  const css = `
  .nextmix .nextmix-actions{display:none!important}
  .nextmix{opacity:.62;max-height:90px;overflow:hidden}
  .nextmix:before{content:"AUTO ROUTINE — no manual execute needed";display:inline-block;color:#35d7c4;font-family:'JetBrains Mono',monospace;font-size:.62rem;font-weight:900;letter-spacing:.7px;margin-bottom:4px}
  .remix-cockpit{
    margin:0 0 14px;
    background:
      radial-gradient(700px 240px at 0% 0%,rgba(53,215,196,.12),transparent 60%),
      radial-gradient(700px 260px at 100% 0%,rgba(239,74,86,.10),transparent 60%),
      #14161c;
    border:1px solid rgba(255,255,255,.18);
    border-radius:20px;
    padding:12px;
    display:grid;
    grid-template-columns:.9fr 1.15fr 1fr;
    gap:10px;
    box-shadow:0 30px 70px -30px rgba(0,0,0,.75)
  }
  @media(max-width:900px){.remix-cockpit{grid-template-columns:1fr}}
  .remix-card{background:rgba(29,31,39,.90);border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:11px 12px;min-width:0}
  .remix-title{display:flex;align-items:center;justify-content:space-between;gap:8px;font-family:'JetBrains Mono',monospace;font-size:.62rem;font-weight:900;letter-spacing:.75px;color:#ffb84d;margin-bottom:9px}
  .remix-badge{font-family:'JetBrains Mono',monospace;font-size:.56rem;font-weight:900;letter-spacing:.55px;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:2px 7px;color:#8b8d99;background:rgba(255,255,255,.035);white-space:nowrap}
  .remix-badge.on{color:#35d7c4;border-color:#35d7c4;background:rgba(53,215,196,.15)}
  .remix-badge.hot{color:#ffb84d;border-color:#ffb84d;background:rgba(255,184,77,.13)}
  .remix-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:7px 0}
  .remix-row label{font-size:.68rem;color:#8b8d99;font-weight:800;white-space:nowrap}
  .remix-select{min-width:136px;flex:1;background:#262832;color:#eef0f4;border:1px solid rgba(255,255,255,.15);border-radius:9px;padding:6px 8px;font-family:'Cairo',system-ui,sans-serif;font-size:.72rem}
  .remix-row input[type=range]{flex:1}
  .remix-pill{font-family:'JetBrains Mono',monospace;font-size:.66rem;color:#35d7c4;min-width:46px;text-align:left}
  .remix-mini{font-size:.70rem;color:#8b8d99;line-height:1.55;unicode-bidi:plaintext}
  .remix-mini b{color:#eef0f4}
  .remix-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
  .remix-metric{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px;min-width:0}
  .remix-metric .k{font-size:.59rem;color:#565964;font-family:'JetBrains Mono',monospace;letter-spacing:.4px}
  .remix-metric .v{font-size:.77rem;color:#eef0f4;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;unicode-bidi:plaintext}
  .routine-stack{display:flex;flex-direction:column;gap:5px;max-height:166px;overflow:auto}
  .routine-step{display:grid;grid-template-columns:62px 1fr;gap:7px;align-items:start;font-size:.69rem;color:#8b8d99;line-height:1.35;padding:6px 7px;border-radius:8px;background:rgba(255,255,255,.032)}
  .routine-step strong{font-family:'JetBrains Mono',monospace;color:#35d7c4;font-size:.58rem;letter-spacing:.4px}
  .routine-step.hot strong{color:#ffb84d}.routine-step.danger strong{color:#ef4a56}.routine-step.live strong{color:#35d7c4}
  .remix-ai-mark{box-shadow:0 0 0 1px #ffb84d,0 0 20px rgba(255,184,77,.26)!important;border-color:#ffb84d!important;filter:brightness(1.18)}
  .remix-pulse{animation:remixPulse .8s ease-in-out 1}
  @keyframes remixPulse{0%{filter:brightness(1)}50%{filter:brightness(1.45)}100%{filter:brightness(1)}}
  .remix-deck-badge{position:absolute;top:-8px;inset-inline-start:12px;z-index:3;font-family:'JetBrains Mono',monospace;font-size:.55rem;font-weight:900;letter-spacing:.6px;padding:2px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:#16171d;color:#565964}
  .deck{position:relative}.remix-deck-badge.live-a{color:#35d7c4;border-color:#35d7c4}.remix-deck-badge.live-b{color:#ef4a56;border-color:#ef4a56}.remix-deck-badge.next{color:#ffb84d;border-color:#ffb84d}.remix-deck-badge.routine{color:#ffb84d;border-color:#ffb84d;background:rgba(255,184,77,.12)}
  `;

  const profiles = {
    club: 'Club: Drop/Bass routines, short waits, keeps dance energy locked.',
    remix: 'Remix: loop rolls, echo fills, sampler chops, hot cue jumping.',
    smooth: 'Smooth: musical but safer, long blends and less FX.',
    safe: 'Safe: avoids risky tricks; still automatic, but conservative.'
  };

  const state = {
    profile:'remix',
    level:100,
    actions:[],
    currentRoutine:null,
    routineId:'',
    flags:Object.create(null),
    lastAutoClick:0,
    lastHotRewrite:0,
    lastLiveMove:0,
    rendered:false
  };

  function d(){ return window.__djDebug || null; }
  function a(){ const x=d(); return x && x.autoDj && x.autoDj.state ? x.autoDj.state : null; }
  function decks(){ const x=d(); return x && x.decks ? x.decks : {}; }
  function actions(){ const x=d(); return x && x.actions ? x.actions : {}; }
  function timeNow(){ const x=d(); return x && typeof x.now==='function' ? (x.now() || 0) : 0; }

  function installUI(){
    if($('remixCockpit')) return;
    const style=document.createElement('style'); style.textContent=css; document.head.appendChild(style);
    const html = `
    <section class="remix-cockpit" id="remixCockpit">
      <div class="remix-card">
        <div class="remix-title"><span>V10 REMIX DJ BOT</span><span class="remix-badge on" id="remixStatus">DANCE LOCK</span></div>
        <div class="remix-row"><label>وضع الأداء</label>
          <select class="remix-select" id="remixProfile">
            <option value="club">Club DJ</option>
            <option value="remix" selected>Remix DJ</option>
            <option value="smooth">Smooth DJ</option>
            <option value="safe">Safe DJ</option>
          </select>
        </div>
        <div class="remix-row"><label>قوة التحكم</label><input type="range" id="remixLevel" min="0" max="100" step="5" value="100"><span class="remix-pill" id="remixLevelText">100%</span></div>
        <div class="remix-mini" id="remixExplain">${profiles.remix}</div>
      </div>
      <div class="remix-card">
        <div class="remix-title"><span>HUMAN PERFORMANCE ENGINE</span><span class="remix-badge hot" id="remixRoutineBadge">ROUTINE READY</span></div>
        <div class="remix-metrics">
          <div class="remix-metric"><div class="k">LIVE</div><div class="v" id="remixLive">—</div></div>
          <div class="remix-metric"><div class="k">NEXT HOT CUE</div><div class="v" id="remixNext">—</div></div>
          <div class="remix-metric"><div class="k">ROUTINE</div><div class="v" id="remixRoutine">—</div></div>
          <div class="remix-metric"><div class="k">WAIT</div><div class="v" id="remixWait">—</div></div>
        </div>
        <div class="remix-mini" id="remixReason" style="margin-top:8px"><b>هدف البوت:</b> يحافظ على الرقص، يدخل من نقاط ساخنة، ويعمل ريمكس مسموع.</div>
      </div>
      <div class="remix-card">
        <div class="remix-title"><span>ROUTINE TIMELINE</span><span class="remix-badge" id="remixActionCount">0</span></div>
        <div class="routine-stack" id="remixActions"><div class="routine-step"><strong>READY</strong><span>جاهز ينفذ Loop / FX / Bass / Sampler تلقائيًا.</span></div></div>
      </div>
    </section>`;
    const target = $('nextMixPanel') || q('.mixer') || document.body;
    if(target && target.parentNode){
      target.insertAdjacentHTML('afterend', html);
    }
    [['A','.deck-a'],['B','.deck-b']].forEach(([k,sel])=>{
      const el=q(sel);
      if(el && !$('remixDeck'+k)) el.insertAdjacentHTML('afterbegin',`<div class="remix-deck-badge" id="remixDeck${k}">IDLE</div>`);
    });

    $('remixProfile')?.addEventListener('change',e=>{
      state.profile=e.target.value;
      log('MODE','تحولت لشخصية '+state.profile+' — '+profiles[state.profile],'hot');
    });
    $('remixLevel')?.addEventListener('input',e=>{
      state.level=parseInt(e.target.value,10)||0;
      log('LEVEL','قوة التحكم الآن '+state.level+'%.', state.level>=75?'hot':'');
    });

    const btn=$('autoDjBtn');
    if(btn){
      btn.textContent = 'TAKE CONTROL';
      btn.addEventListener('click',()=>{
        setTimeout(()=>{
          if(a() && a().on) log('TAKEOVER','Remix Bot ماسك الجهاز: حركات/FX/Loops/Sampler تلقائيًا.','hot');
          else log('MANUAL','TAKE CONTROL: تركت الصوت وكل القيم مكانها.','danger');
        },50);
      },{capture:true});
    }
    state.rendered=true;
  }

  function log(label,text,kind){
    state.actions.unshift({label,text,kind:kind||''});
    state.actions=state.actions.slice(0,10);
    renderActions();
  }

  function renderActions(){
    const box=$('remixActions'); if(!box) return;
    $('remixActionCount') && ($('remixActionCount').textContent=String(state.actions.length));
    box.innerHTML = state.actions.map(x=>`<div class="routine-step ${x.kind||''}"><strong>${x.label}</strong><span>${x.text}</span></div>`).join('') || '<div class="routine-step"><strong>READY</strong><span>جاهز.</span></div>';
  }

  function mark(el){
    if(!el) return;
    el.classList.add('remix-ai-mark','remix-pulse');
    clearTimeout(el.__remixMark);
    el.__remixMark=setTimeout(()=>el.classList.remove('remix-ai-mark','remix-pulse'),900);
  }

  function setRange(id,val){
    const el=$(id); if(!el) return;
    el.value=String(val);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    mark(el);
  }

  function setEq(deck,band,val){
    const map={high:'eqHi',mid:'eqMid',low:'eqLow',filter:'color',tempo:'tempo'};
    setRange((map[band]||band)+deck, val);
  }

  function click(id){
    const el=$(id);
    if(el && !el.disabled){
      mark(el);
      el.click();
      return true;
    }
    return false;
  }

  function useAction(name,args){
    const fn=actions()[name];
    if(typeof fn !== 'function') return false;
    try{ fn.apply(null,args||[]); return true; } catch(e){ return false; }
  }

  function setPadMode(deck,mode){ return useAction('setPadMode',[deck,mode]); }
  function toggleLoop(deck,beats){ const ok=useAction('toggleLoopSize',[deck,beats||4]); mark(deck==='A'?$('padsA'):$('padsB')); return ok; }
  function fx(deck,name){ const ok=useAction('toggleFx',[deck,name]); mark(deck==='A'?$('padsA'):$('padsB')); return ok; }
  function sampler(deck,i){ setPadMode(deck,'sampler'); const ok=useAction('samplerAction',[deck,i||0]); mark(deck==='A'?$('padsA'):$('padsB')); return ok; }

  function deckName(key){
    const m=decks()[key] && decks()[key].meta;
    return m && m.track ? m.track.name : '—';
  }

  function liveTrack(){
    const au=a(); if(!au||!au.liveKey) return null;
    return decks()[au.liveKey] && decks()[au.liveKey].meta ? decks()[au.liveKey].meta.track : null;
  }

  function barLenForTrack(track){
    const bpm = track && (track.bpm || track.effectiveBpm) || 120;
    return (60 / Math.max(60,bpm)) * 4;
  }

  function deckElapsed(key){
    const x=d(), dk=decks()[key];
    if(!x || !dk || !dk.meta || typeof x.elapsed!=='function') return 0;
    try { return x.elapsed(dk.meta, timeNow()); } catch(e){ return 0; }
  }

  function barsUntilTrigger(){
    const au=a();
    if(!au || !au.nextTrack || !au.nextTrack.plan || !au.liveKey) return null;
    const lt=liveTrack(); if(!lt) return null;
    const plan=au.nextTrack.plan;
    const elapsed=deckElapsed(au.liveKey);
    const bars=(plan.trigger - elapsed)/barLenForTrack(lt);
    return isFinite(bars) ? bars : null;
  }

  function sectionScore(label){
    label = String(label||'');
    if(label === 'drop') return 100;
    if(label === 'intro-hot') return 85;
    if(label.indexOf('buildup') >= 0) return 78;
    if(label.indexOf('chorus') >= 0) return 74;
    if(label.indexOf('verse') >= 0) return 45;
    if(label.indexOf('breakdown') >= 0) return 20;
    if(label.indexOf('outro') >= 0) return 10;
    if(label.indexOf('intro') >= 0) return 15;
    return 35;
  }

  function hotCueFor(track){
    if(!track) return {pos:0,label:'start'};
    const dur = track.duration || (track.audioBuffer && track.audioBuffer.duration) || 180;
    let best = {pos: Math.min(16, dur*0.08), label:'safe phrase', score:30};

    const sections = track.structure && Array.isArray(track.structure.sections) ? track.structure.sections : [];
    sections.forEach((s)=>{
      if(!s || !isFinite(s.start)) return;
      if(s.start < 4) return;
      if(s.start > dur - 20) return;
      const score = sectionScore(s.label) + Math.min(20, (s.energy||0)*20) + (s.start>12?8:0);
      if(score > best.score) best={pos:s.start,label:s.label||'section',score};
    });

    const ph = track.phrases || {};
    const candidates = []
      .concat(ph.phrases32||[])
      .concat(ph.phrases16||[])
      .concat(ph.phrases8||[]);
    candidates.forEach((p)=>{
      const v = typeof p === 'number' ? p : (p && (p.time || p.start));
      if(!isFinite(v) || v < 8 || v > dur-20) return;
      const score = 55 + (v>20?10:0);
      if(score > best.score && best.score < 80) best={pos:v,label:'phrase hot jump',score};
    });

    return best;
  }

  function rewriteIncomingHotCue(){
    const au=a();
    if(!au || !au.on || !au.nextTrack || !au.nextTrack.plan) return;
    const plan = au.nextTrack.plan;
    const track = au.nextTrack.track;
    if(!track || plan.__remixHotCueLocked) return;

    const hot = hotCueFor(track);
    if(hot.pos && isFinite(hot.pos)){
      const old = plan.incomingOffset || 0;
      if(Math.abs(old - hot.pos) > 3){
        plan.incomingOffset = hot.pos;
        plan.__remixHotCueLocked = true;
        log('HOT CUE','تجاوزت بداية الأغنية: الدخول من '+hot.label+' عند '+Math.round(hot.pos)+'s بدل intro بارد.','hot');
      }
    }
  }

  function chooseRoutine(){
    const au=a();
    if(!au || !au.nextTrack || !au.nextTrack.plan) return 'WAITING';
    const st = au.nextTrack.plan.strategy && au.nextTrack.plan.strategy.name || '';
    const track = au.nextTrack.track;
    const hot = hotCueFor(track).label;
    if(state.profile === 'safe') return 'SAFE ENERGY BLEND';
    if(state.profile === 'smooth') return 'SMOOTH PHRASE BLEND';
    if(st.indexOf('DROP') >= 0 || hot.indexOf('drop') >= 0 || state.profile==='remix') return 'LOOP ROLL → ECHO → DROP';
    if(st.indexOf('BASS') >= 0) return 'BASS KILL → DROP OPEN';
    return 'FILTER SWEEP → BASS SWAP';
  }

  function armIncomingDeck(){
    const au=a();
    if(!au || !au.nextTrack || !au.nextTrack.key) return;
    const k = au.nextTrack.key;
    if(state.flags['armed:'+k+':'+(au.nextTrack.track && au.nextTrack.track.name)]) return;
    state.flags['armed:'+k+':'+(au.nextTrack.track && au.nextTrack.track.name)] = true;
    setEq(k,'low',-0.95);
    setEq(k,'filter',0.20);
    if(au.nextTrack.plan && au.nextTrack.plan.rate) setEq(k,'tempo', clamp((au.nextTrack.plan.rate-1)*100, -8, 8));
    log('ARM','جهزت Deck '+k+': Bass مقطوع + Filter مفتوح + Tempo مضبوط قبل الدخول.','live');
  }

  function forceAutoExecuteIfNeeded(){
    const au=a();
    if(!au || !au.on || !au.nextTrack || au.transition || state.level < 75) return;
    const bars = barsUntilTrigger();
    if(bars == null) return;

    const maxWait = state.profile==='safe' ? 12 : state.profile==='smooth' ? 10 : 8;
    if(bars > maxWait && Date.now() - state.lastAutoClick > 6500){
      state.lastAutoClick = Date.now();
      log('AUTO GO','الانتظار '+Math.round(bars)+' bars طويل؛ نفذت الدخول الآن حتى ما يبرد الرقص.','hot');
      click('nextMixExecute');
    }
  }

  function routineKey(au){
    if(!au || !au.transition) return '';
    const t=au.transition;
    return t.fromKey+'>'+t.toKey+':'+Math.round((t.startedAt||0)*10);
  }

  function flag(name){ if(state.flags[name]) return true; state.flags[name]=true; return false; }

  function runTransitionRoutine(){
    const au=a();
    if(!au || !au.transition || state.level < 50) return;
    const t=au.transition;
    const key=routineKey(au);
    if(key !== state.routineId){
      state.routineId = key;
      state.flags = Object.create(null);
      state.currentRoutine = chooseRoutine();
      log('ROUTINE',state.currentRoutine+' — بدأت تنفيذ ريمكس فعلي على الديكات.','hot');
    }

    const now = timeNow();
    const dur = Math.max(0.5, t.duration || 16);
    const p = clamp((now - (t.startedAt||now)) / dur, 0, 1);
    const from=t.fromKey, to=t.toKey;

    if(state.profile !== 'safe'){
      const fromFilter = p < .55 ? -0.12*p : -0.12 - (p-.55)*1.15;
      const toFilter = p < .28 ? 0.22*(1-p/.28) : 0;
      setEq(from,'filter',clamp(fromFilter,-.85,.3));
      setEq(to,'filter',clamp(toFilter,0,.25));
    }

    const toLow = p < .55 ? -0.95 : -0.95 + ((p-.55)/.25);
    const fromLow = p < .48 ? 0 : -((p-.48)/.25);
    setEq(to,'low',clamp(toLow,-.95,0));
    setEq(from,'low',clamp(fromLow,-.95,0));

    if(state.profile !== 'safe' && p>.10 && !flag(key+':loop4')){
      toggleLoop(from,4);
      log('LOOP','Loop Roll 4 beats على الأغنية الخارجة لخلق build-up.','hot');
    }
    if((state.profile==='remix' || state.profile==='club') && p>.24 && !flag(key+':loop2')){
      toggleLoop(from,2);
      log('ROLL','ضغطت اللووب إلى 2 beats قبل الفتح على الدروب.','hot');
    }
    if(state.profile==='remix' && p>.32 && !flag(key+':sampler-capture')){
      sampler(from,0);
      log('SAMPLE','التقطت hit/loop قصير من نفس الأغنية على Pad 1.','live');
    }
    if(state.profile==='remix' && p>.43 && !flag(key+':sampler-play')){
      sampler(from,0);
      log('PAD','شغلت الـsample كـfill قبل دخول الأغنية الجديدة.','live');
    }
    if((state.profile==='club'||state.profile==='remix') && p>.68 && !flag(key+':echo')){
      fx(from,'echo');
      log('ECHO','Echo Out على Deck '+from+' حتى الخروج يكون موسيقي مش قطع ناشف.','hot');
    }
    if(p>.86 && !flag(key+':open-bass')){
      setEq(to,'low',0);
      setEq(to,'filter',0);
      log('DROP','فتحت Bass/Filter للديك الجديد — حافظت على مود الرقص.','hot');
    }
  }

  function liveRemixMove(){
    const au=a();
    if(!au || !au.on || au.transition || !au.liveKey || state.level < 90) return;
    if(Date.now() - state.lastLiveMove < (state.profile==='remix'?14000:22000)) return;
    const lt=liveTrack(); if(!lt) return;
    state.lastLiveMove = Date.now();
    const k=au.liveKey;

    if(state.profile==='remix'){
      sampler(k,0);
      log('LIVE PAD','حضرت Pad من الأغنية الحالية لاستخدامه كـfill لاحقًا.','live');
      setTimeout(()=>{ if(a() && a().on && !a().transition){ sampler(k,0); log('FILL','تشغيل fill صغير من الـPad بدون كسر الرقص.','live'); } }, 1200);
    } else if(state.profile==='club'){
      setEq(k,'filter',0.12);
      log('SWEEP','فلتر sweep خفيف مثل DJ بشري كل فترة.','live');
      setTimeout(()=>setEq(k,'filter',0), 900);
    }
  }

  function polishNativeUI(){
    const ex=$('nextMixExecute');
    if(ex && ex.textContent !== 'AUTO RUNNING') ex.textContent = 'AUTO RUNNING';
    const badge=q('.nextmix-badge');
    if(badge && badge.textContent !== 'AI ROUTINE · AUTO') badge.textContent='AI ROUTINE · AUTO';
    const panel=$('nextMixPanel');
    if(panel) panel.title='البوت ينفذ تلقائيًا؛ لا تحتاج تضغط EXECUTE.';
  }

  function render(){
    installUI();
    polishNativeUI();

    const au=a();
    const on=!!(au&&au.on);
    const bars=barsUntilTrigger();
    const routine=chooseRoutine();

    if($('remixStatus')){
      $('remixStatus').textContent = on ? 'DANCE LOCK ON' : 'MANUAL';
      $('remixStatus').classList.toggle('on', on);
    }
    if($('remixProfile')) $('remixProfile').value=state.profile;
    if($('remixLevel')) $('remixLevel').value=String(state.level);
    if($('remixLevelText')) $('remixLevelText').textContent=state.level+'%';
    if($('remixExplain')) $('remixExplain').textContent=profiles[state.profile];

    if($('remixLive')) $('remixLive').textContent = au&&au.liveKey ? ('Deck '+au.liveKey+' · '+deckName(au.liveKey)) : '—';
    if($('remixNext')) $('remixNext').textContent = au&&au.nextTrack ? (hotCueFor(au.nextTrack.track).label+' · Deck '+au.nextTrack.key) : '—';
    if($('remixRoutine')) $('remixRoutine').textContent = au&&au.transition ? (state.currentRoutine||routine) : routine;
    if($('remixWait')) $('remixWait').textContent = bars==null ? '—' : (Math.max(0,Math.round(bars))+' bars');

    if($('remixReason')){
      $('remixReason').innerHTML = on
        ? '<b>شغال:</b> أقصر الانتظار الطويل، أدخل من Hot Cue، وأستخدم Loop/FX/Bass/Sampler للحفاظ على الرقص.'
        : '<b>Manual:</b> اضغط AUTO DJ/AI TAKE OVER حتى أستلم الأداء.';
    }

    ['A','B'].forEach(k=>{
      const el=$('remixDeck'+k); if(!el) return;
      let st='IDLE';
      if(au && au.transition && (au.transition.fromKey===k||au.transition.toKey===k)) st='ROUTINE';
      else if(au && au.liveKey===k) st='LIVE';
      else if(au && au.nextTrack && au.nextTrack.key===k) st='NEXT';
      else if(decks()[k] && decks()[k].meta) st = decks()[k].meta.playing ? 'PLAYING' : 'CUED';
      el.textContent=st;
      el.className='remix-deck-badge '+(st==='LIVE'?(k==='A'?'live-a':'live-b'):st==='NEXT'?'next':st==='ROUTINE'?'routine':'');
    });

    if(on){
      rewriteIncomingHotCue();
      armIncomingDeck();
      forceAutoExecuteIfNeeded();
      runTransitionRoutine();
      liveRemixMove();
    }

    raf(render);
  }

  function boot(){
    installUI();
    log('BOOT','V10 Remix Engine جاهز: Routine Planner + Hot Cue + Loop Roll + FX + Sampler.','hot');
    render();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();

  window.__remixBotV10 = {
    state,
    hotCueFor,
    forceAutoExecuteIfNeeded,
    rewriteIncomingHotCue,
    runTransitionRoutine,
    setProfile:(p)=>{state.profile=p; log('MODE','Profile forced: '+p,'hot');},
    setLevel:(v)=>{state.level=clamp(v,0,100); log('LEVEL','Level forced: '+state.level,'hot');}
  };
})();
