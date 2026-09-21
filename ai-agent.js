
(function(){
  'use strict';

  const $ = (id) => document.getElementById(id);
  const q = (sel) => document.querySelector(sel);
  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
  const raf = window.requestAnimationFrame.bind(window);

  /*
    V11 — Mix Quality Fix + Performance Pad Redesign
    ------------------------------------------------
    The previous experimental remix layer was too aggressive. V11 makes the
    bot useful first: no random loop/sampler spam, no arbitrary cold jumps,
    phrase-safe auto execution, clean bass handoff / filter sweep, and much
    clearer premium pad/button styling.
  */

  const css = `
  .nextmix{max-height:96px;overflow:hidden;opacity:.72}
  .nextmix .nextmix-actions{display:none!important}
  .nextmix-badge{font-size:0!important}
  .nextmix-badge:after{content:"AUTO MIX · READY";font-size:.66rem;color:#35d7c4}
  .nextmix-tracks{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

  .qbot-panel{
    margin:0 0 14px;
    background:
      radial-gradient(700px 260px at 0% 0%,rgba(53,215,196,.10),transparent 62%),
      radial-gradient(700px 260px at 100% 0%,rgba(239,74,86,.09),transparent 62%),
      linear-gradient(180deg,#171922,#12131a);
    border:1px solid rgba(255,255,255,.16);
    border-radius:20px;
    padding:12px;
    display:grid;
    grid-template-columns:1fr 1.1fr 1fr;
    gap:10px;
    box-shadow:0 26px 60px -34px rgba(0,0,0,.85)
  }
  @media(max-width:900px){.qbot-panel{grid-template-columns:1fr}}
  .qbot-card{background:rgba(29,31,39,.90);border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:11px 12px;min-width:0}
  .qbot-title{display:flex;align-items:center;justify-content:space-between;gap:8px;font-family:'JetBrains Mono',monospace;font-size:.62rem;font-weight:900;letter-spacing:.7px;color:#ffb84d;margin-bottom:9px}
  .qbot-badge{font-family:'JetBrains Mono',monospace;font-size:.56rem;font-weight:900;letter-spacing:.55px;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:2px 7px;color:#8b8d99;background:rgba(255,255,255,.035);white-space:nowrap}
  .qbot-badge.on{color:#35d7c4;border-color:#35d7c4;background:rgba(53,215,196,.14)}
  .qbot-badge.warn{color:#ffb84d;border-color:#ffb84d;background:rgba(255,184,77,.13)}
  .qbot-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:7px 0}
  .qbot-row label{font-size:.68rem;color:#8b8d99;font-weight:800;white-space:nowrap}
  .qbot-select{min-width:132px;flex:1;background:#262832;color:#eef0f4;border:1px solid rgba(255,255,255,.15);border-radius:9px;padding:6px 8px;font-family:'Cairo',system-ui,sans-serif;font-size:.72rem}
  .qbot-row input[type=range]{flex:1}
  .qbot-pill{font-family:'JetBrains Mono',monospace;font-size:.66rem;color:#35d7c4;min-width:46px;text-align:left}
  .qbot-note{font-size:.71rem;color:#9a9da8;line-height:1.55;unicode-bidi:plaintext}.qbot-note b{color:#eef0f4}
  .qbot-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
  .qbot-metric{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px;min-width:0}
  .qbot-metric .k{font-size:.59rem;color:#565964;font-family:'JetBrains Mono',monospace;letter-spacing:.4px}
  .qbot-metric .v{font-size:.77rem;color:#eef0f4;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;unicode-bidi:plaintext}
  .qbot-actions{display:flex;flex-direction:column;gap:5px;max-height:160px;overflow:auto}
  .qbot-step{display:grid;grid-template-columns:64px 1fr;gap:7px;align-items:start;font-size:.69rem;color:#9a9da8;line-height:1.35;padding:6px 7px;border-radius:9px;background:rgba(255,255,255,.035)}
  .qbot-step strong{font-family:'JetBrains Mono',monospace;color:#35d7c4;font-size:.58rem;letter-spacing:.4px}
  .qbot-step.warn strong{color:#ffb84d}.qbot-step.danger strong{color:#ef4a56}.qbot-step.live strong{color:#35d7c4}
  .qbot-ai-mark{box-shadow:0 0 0 1px #35d7c4,0 0 18px rgba(53,215,196,.22)!important;border-color:#35d7c4!important;filter:brightness(1.18)}
  .qbot-deck-badge{position:absolute;top:-8px;inset-inline-start:12px;z-index:4;font-family:'JetBrains Mono',monospace;font-size:.55rem;font-weight:900;letter-spacing:.6px;padding:2px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:#16171d;color:#565964}
  .deck{position:relative}.qbot-deck-badge.live-a{color:#35d7c4;border-color:#35d7c4}.qbot-deck-badge.live-b{color:#ef4a56;border-color:#ef4a56}.qbot-deck-badge.next{color:#ffb84d;border-color:#ffb84d}.qbot-deck-badge.mix{color:#ffb84d;border-color:#ffb84d;background:rgba(255,184,77,.12)}

  .deck-transport{gap:9px!important}
  .dbtn{
    min-height:58px!important;
    border-radius:14px!important;
    border:1px solid rgba(255,255,255,.15)!important;
    background:linear-gradient(180deg,#242733,#181a22)!important;
    color:#dfe3ec!important;
    font-size:.72rem!important;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 10px 20px -18px #000!important
  }
  .dbtn:hover:not(:disabled){filter:brightness(1.13)}
  .dbtn.play.is-on{background:linear-gradient(180deg,rgba(53,215,196,.22),rgba(53,215,196,.08))!important;border-color:#35d7c4!important;color:#35d7c4!important}
  .deck-b .dbtn.play.is-on,.deck.deck-b .dbtn.play.is-on{background:linear-gradient(180deg,rgba(239,74,86,.22),rgba(239,74,86,.08))!important;border-color:#ef4a56!important;color:#ef4a56!important}

  .pad-tabs{gap:7px!important;margin-top:2px}
  .ptab{
    height:34px!important;
    border-radius:10px!important;
    border:1px solid rgba(255,255,255,.12)!important;
    background:linear-gradient(180deg,#252936,#171922)!important;
    color:#9fa3b0!important;
    font-size:.68rem!important;
    font-weight:900!important
  }
  .ptab.active{
    background:linear-gradient(180deg,rgba(255,184,77,.20),rgba(255,184,77,.06))!important;
    border-color:#ffb84d!important;
    color:#ffb84d!important
  }
  .pad-grid{gap:8px!important}
  .pad{
    position:relative!important;
    height:52px!important;
    border-radius:13px!important;
    border:1px solid rgba(255,255,255,.17)!important;
    color:#fff!important;
    font-size:0!important;
    font-family:'JetBrains Mono',monospace!important;
    font-weight:900!important;
    overflow:hidden!important;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 12px 24px -20px #000!important;
    opacity:1!important
  }
  .pad:disabled{opacity:.72!important;filter:saturate(.75) brightness(.72)!important}
  .pad:nth-child(1){background:linear-gradient(135deg,#34d7c4,#167e78)!important}
  .pad:nth-child(2){background:linear-gradient(135deg,#6ca8ff,#314fce)!important}
  .pad:nth-child(3){background:linear-gradient(135deg,#c973ff,#6d2bc7)!important}
  .pad:nth-child(4){background:linear-gradient(135deg,#ffb84d,#d35b20)!important}
  .pad:nth-child(1):after{content:"DROP"}
  .pad:nth-child(2):after{content:"LOOP"}
  .pad:nth-child(3):after{content:"FILL"}
  .pad:nth-child(4):after{content:"FX"}
  .pad:after{
    position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    font-size:.70rem;letter-spacing:.7px;text-shadow:0 1px 3px rgba(0,0,0,.55)
  }
  .knob-row .kslider{height:7px!important;border-radius:999px!important}
  .knob-row .kslider::-webkit-slider-thumb{width:15px!important;height:15px!important;border-radius:50%!important}
  `;

  const profiles = {
    quality: 'Quality Mix: نظيف، موسيقي، بدون حركات عشوائية. الأفضل الآن.',
    club: 'Club Mix: Bass swap أوضح وفلتر أقوى، لكن بدون تخريب.',
    performance: 'Performance: يضيف FX خفيف فقط عند اللحظة الصح.',
    safe: 'Safe: أقل مخاطرة، انتقالات مضمونة.'
  };

  const s = {
    profile:'quality',
    level:90,
    actions:[],
    routineKey:'',
    lastAuto:0,
    lastLog:'',
    flags:Object.create(null),
    installed:false
  };

  function dbg(){return window.__djDebug||null}
  function auto(){const x=dbg(); return x&&x.autoDj&&x.autoDj.state?x.autoDj.state:null}
  function acts(){const x=dbg(); return x&&x.actions?x.actions:{}}
  function deck(key){const x=dbg(); return x&&x.decks?x.decks[key]:null}
  function now(){const x=dbg(); return x&&typeof x.now==='function'?(x.now()||0):0}

  function install(){
    if(s.installed) return;
    const style=document.createElement('style'); style.textContent=css; document.head.appendChild(style);
    const html = `<section class="qbot-panel" id="qbotPanel">
      <div class="qbot-card">
        <div class="qbot-title"><span>V11 QUALITY DJ BOT</span><span class="qbot-badge on" id="qbotStatus">CLEAN MIX</span></div>
        <div class="qbot-row"><label>نوع الأداء</label><select class="qbot-select" id="qbotProfile">
          <option value="quality" selected>Quality Mix</option>
          <option value="club">Club Mix</option>
          <option value="performance">Performance Mix</option>
          <option value="safe">Safe Mix</option>
        </select></div>
        <div class="qbot-row"><label>قوة التحكم</label><input type="range" id="qbotLevel" min="0" max="100" step="5" value="90"><span class="qbot-pill" id="qbotLevelText">90%</span></div>
        <div class="qbot-note" id="qbotExplain">${profiles.quality}</div>
      </div>
      <div class="qbot-card">
        <div class="qbot-title"><span>TRANSITION BRAIN</span><span class="qbot-badge warn" id="qbotRoutineBadge">PHRASE SAFE</span></div>
        <div class="qbot-metrics">
          <div class="qbot-metric"><div class="k">LIVE</div><div class="v" id="qbotLive">—</div></div>
          <div class="qbot-metric"><div class="k">NEXT</div><div class="v" id="qbotNext">—</div></div>
          <div class="qbot-metric"><div class="k">ROUTINE</div><div class="v" id="qbotRoutine">—</div></div>
          <div class="qbot-metric"><div class="k">WAIT</div><div class="v" id="qbotWait">—</div></div>
        </div>
        <div class="qbot-note" id="qbotReason" style="margin-top:8px"><b>الإصلاح:</b> ألغيت الحركات العشوائية. البوت الآن يشتغل مثل DJ مرتب: Bass handoff + Filter sweep + Phrase timing.</div>
      </div>
      <div class="qbot-card">
        <div class="qbot-title"><span>ACTIONS</span><span class="qbot-badge" id="qbotCount">0</span></div>
        <div class="qbot-actions" id="qbotActions"><div class="qbot-step"><strong>READY</strong><span>جاهز لانتقال نظيف.</span></div></div>
      </div>
    </section>`;
    const target=$('nextMixPanel')||q('.mixer')||document.body;
    if(target&&target.parentNode) target.insertAdjacentHTML('afterend',html);
    [['A','.deck-a'],['B','.deck-b']].forEach(([k,sel])=>{
      const el=q(sel); if(el&&!$('qbotDeck'+k)) el.insertAdjacentHTML('afterbegin',`<div class="qbot-deck-badge" id="qbotDeck${k}">IDLE</div>`);
    });
    $('qbotProfile')?.addEventListener('change',e=>{s.profile=e.target.value; log('MODE','الوضع: '+profiles[s.profile],'warn')});
    $('qbotLevel')?.addEventListener('input',e=>{s.level=parseInt(e.target.value,10)||0; log('LEVEL','قوة التحكم '+s.level+'%.',s.level>70?'warn':'')});
    const btn=$('autoDjBtn'); if(btn){ btn.textContent='TAKE CONTROL'; }
    log('FIX','طبقت إصلاح الانتقال والأزرار: بدون حركات عشوائية، Pads أوضح، Mix أنظف.','warn');
    s.installed=true;
  }

  function log(label,text,kind){
    const sig=label+':'+text;
    if(sig===s.lastLog) return;
    s.lastLog=sig;
    s.actions.unshift({label,text,kind:kind||''});
    s.actions=s.actions.slice(0,10);
    renderActions();
  }

  function renderActions(){
    const box=$('qbotActions'); if(!box) return;
    $('qbotCount') && ($('qbotCount').textContent=String(s.actions.length));
    box.innerHTML=s.actions.map(x=>`<div class="qbot-step ${x.kind||''}"><strong>${x.label}</strong><span>${x.text}</span></div>`).join('');
  }

  function mark(el){
    if(!el) return;
    el.classList.add('qbot-ai-mark');
    clearTimeout(el.__qbotMark);
    el.__qbotMark=setTimeout(()=>el.classList.remove('qbot-ai-mark'),650);
  }

  function setRange(id,val){
    const el=$(id); if(!el) return;
    const old=parseFloat(el.value);
    if(Math.abs(old-val)<0.015) return;
    el.value=String(val);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    mark(el);
  }

  function setEq(k,band,val){
    const prefix = band==='high'?'eqHi':band==='mid'?'eqMid':band==='low'?'eqLow':band==='filter'?'color':'tempo';
    setRange(prefix+k,val);
  }

  function click(id){ const el=$(id); if(el&&!el.disabled){mark(el); el.click(); return true;} return false; }
  function action(name,args){ const fn=acts()[name]; if(typeof fn!=='function') return false; try{fn.apply(null,args||[]); return true;}catch(e){return false;} }
  function fx(k,name){ const ok=action('toggleFx',[k,name]); mark(k==='A'?$('padsA'):$('padsB')); return ok; }

  function nameOf(k){ const dk=deck(k); return dk&&dk.meta&&dk.meta.track?dk.meta.track.name:'—'; }
  function liveTrack(){ const au=auto(); if(!au||!au.liveKey) return null; const dk=deck(au.liveKey); return dk&&dk.meta?dk.meta.track:null; }
  function elapsed(k){ const x=dbg(),dk=deck(k); if(!x||!dk||!dk.meta||typeof x.elapsed!=='function') return 0; try{return x.elapsed(dk.meta, now());}catch(e){return 0;} }
  function barLen(track){ const bpm=(track&&track.bpm)||120; return (60/Math.max(60,bpm))*4; }

  function barsUntil(){
    const au=auto(); if(!au||!au.nextTrack||!au.nextTrack.plan||!au.liveKey) return null;
    const lt=liveTrack(); if(!lt) return null;
    const bars=(au.nextTrack.plan.trigger - elapsed(au.liveKey))/barLen(lt);
    return isFinite(bars)?bars:null;
  }

  function sectionScore(label){
    label=String(label||'');
    if(label==='drop') return 100;
    if(label==='intro-hot') return 82;
    if(label.indexOf('buildup')>=0) return 78;
    if(label.indexOf('chorus')>=0) return 70;
    if(label.indexOf('verse')>=0) return 48;
    if(label.indexOf('breakdown')>=0) return 26;
    if(label.indexOf('intro')>=0) return 16;
    if(label.indexOf('outro')>=0) return 8;
    return 35;
  }

  function bestEntry(track){
    if(!track) return {pos:0,label:'start',score:0};
    const dur=track.duration || (track.audioBuffer&&track.audioBuffer.duration) || 180;
    let best={pos:Math.min(12,dur*.06),label:'clean phrase',score:28};
    const sections=track.structure&&Array.isArray(track.structure.sections)?track.structure.sections:[];
    sections.forEach(sec=>{
      if(!sec||!isFinite(sec.start)) return;
      if(sec.start<6 || sec.start>dur-24) return;
      const score=sectionScore(sec.label)+(sec.energy||0)*16+(sec.start>12?6:0);
      if(score>best.score) best={pos:sec.start,label:sec.label||'section',score};
    });
    return best;
  }

  function prepareIncoming(){
    const au=auto(); if(!au||!au.nextTrack||!au.nextTrack.key) return;
    const k=au.nextTrack.key, tr=au.nextTrack.track, plan=au.nextTrack.plan;
    if(!plan) return;
    const entry=bestEntry(tr);
    const key='entry:'+k+':'+(tr&&tr.name);
    if(!s.flags[key] && entry.score>=50 && Math.abs((plan.incomingOffset||0)-entry.pos)>4){
      plan.incomingOffset=entry.pos;
      s.flags[key]=true;
      log('ENTRY','الدخول من '+entry.label+' عند '+Math.round(entry.pos)+'s بدل البداية الباردة.','warn');
    }
    setEq(k,'low',-0.90);
    setEq(k,'filter', s.profile==='club' ? 0.12 : 0.06);
    if(plan.rate) setEq(k,'tempo',clamp((plan.rate-1)*100,-8,8));
  }

  function autoExecuteGuard(){
    const au=auto(); if(!au||!au.on||!au.nextTrack||au.transition) return;
    const bars=barsUntil(); if(bars==null) return;
    const threshold = s.profile==='safe' ? 4 : s.profile==='smooth' ? 5 : 6;
    if(bars <= threshold && bars >= -0.5 && Date.now()-s.lastAuto>5000){
      s.lastAuto=Date.now();
      log('AUTO','تنفيذ تلقائي عند نافذة موسيقية قريبة ('+Math.max(0,Math.round(bars))+' bars).','live');
      click('nextMixExecute');
    }
  }

  function transitionKey(au){
    if(!au||!au.transition) return '';
    const t=au.transition;
    return t.fromKey+'>'+t.toKey+':'+Math.round((t.startedAt||0)*10);
  }

  function runCleanTransition(){
    const au=auto(); if(!au||!au.transition) return;
    const t=au.transition, key=transitionKey(au);
    if(key!==s.routineKey){
      s.routineKey=key;
      s.flags=Object.create(null);
      log('MIX','بدأ انتقال نظيف: Bass handoff + Filter sweep بدون تخبيص Pads.','warn');
    }
    const p=clamp((now()-(t.startedAt||now()))/Math.max(.5,t.duration||16),0,1);
    const from=t.fromKey, to=t.toKey;
    const toLow = p<.58 ? -0.90 : -0.90 + ((p-.58)/.30)*0.90;
    const fromLow = p<.48 ? 0 : -((p-.48)/.35)*0.85;
    setEq(to,'low',clamp(toLow,-.90,0));
    setEq(from,'low',clamp(fromLow,-.85,0));
    const strength = s.profile==='club' ? .32 : s.profile==='performance' ? .24 : .16;
    setEq(from,'filter',clamp(-p*strength,-.45,0));
    setEq(to,'filter',clamp((1-p)*0.10,0,.12));
    if((s.profile==='club'||s.profile==='performance') && p>.74 && !s.flags[key+':echo']){
      s.flags[key+':echo']=true;
      fx(from,'echo');
      log('FX','Echo خفيف فقط قرب النهاية، مش طول الانتقال.','live');
    }
    if(p>.92 && !s.flags[key+':reset']){
      s.flags[key+':reset']=true;
      setEq(to,'low',0); setEq(to,'filter',0);
      setEq(from,'filter',0);
      log('OPEN','فتح Bass/Filter للديك الجديد بعد انتهاء النقلة.','live');
    }
  }

  function polish(){
    const ex=$('nextMixExecute'); if(ex) ex.textContent='AUTO';
    const p=$('nextMixPanel'); if(p) p.title='الانتقال ينفذ تلقائيًا عند نافذة موسيقية؛ لا تضغط EXECUTE.';
  }

  function render(){
    install(); polish();
    const au=auto(), on=!!(au&&au.on), bars=barsUntil();
    if($('qbotStatus')){
      $('qbotStatus').textContent=on?'QUALITY AUTO':'MANUAL';
      $('qbotStatus').classList.toggle('on',on);
    }
    if($('qbotProfile')) $('qbotProfile').value=s.profile;
    if($('qbotLevel')) $('qbotLevel').value=String(s.level);
    if($('qbotLevelText')) $('qbotLevelText').textContent=s.level+'%';
    if($('qbotExplain')) $('qbotExplain').textContent=profiles[s.profile];
    if($('qbotLive')) $('qbotLive').textContent=au&&au.liveKey?('Deck '+au.liveKey+' · '+nameOf(au.liveKey)):'—';
    if($('qbotNext')) $('qbotNext').textContent=au&&au.nextTrack?('Deck '+au.nextTrack.key+' · '+bestEntry(au.nextTrack.track).label):'—';
    if($('qbotRoutine')) $('qbotRoutine').textContent=au&&au.transition?'Clean Bass Swap':'Phrase-safe Auto';
    if($('qbotWait')) $('qbotWait').textContent=bars==null?'—':Math.max(0,Math.round(bars))+' bars';
    if($('qbotReason')) $('qbotReason').innerHTML=on?'<b>شغال:</b> لا أضغط عشوائيًا؛ أنتظر نافذة قريبة، أجهز الديك، وأعمل Bass handoff نظيف.':'<b>Manual:</b> شغل Auto حتى أستلم.';
    ['A','B'].forEach(k=>{
      const el=$('qbotDeck'+k); if(!el) return;
      let st='IDLE';
      if(au&&au.transition&&(au.transition.fromKey===k||au.transition.toKey===k)) st='MIX';
      else if(au&&au.liveKey===k) st='LIVE';
      else if(au&&au.nextTrack&&au.nextTrack.key===k) st='NEXT';
      else if(deck(k)&&deck(k).meta) st=deck(k).meta.playing?'PLAYING':'CUED';
      el.textContent=st;
      el.className='qbot-deck-badge '+(st==='LIVE'?(k==='A'?'live-a':'live-b'):st==='NEXT'?'next':st==='MIX'?'mix':'');
    });
    if(on && s.level>=60){
      prepareIncoming();
      autoExecuteGuard();
      runCleanTransition();
    }
    raf(render);
  }

  function boot(){
    install();
    log('READY','V11 جاهز: أصلحت شكل الأزرار وخليت الانتقال أنظف وأقل تخبيص.','warn');
    render();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();

  window.__qualityDjV11={state:s,bestEntry,autoExecuteGuard,runCleanTransition,setProfile:p=>{s.profile=p},setLevel:v=>{s.level=clamp(v,0,100)}};
})();
