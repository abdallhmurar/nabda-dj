(function(){
  'use strict';

  const $ = (id) => document.getElementById(id);
  const q = (sel) => document.querySelector(sel);
  const nowMs = () => Date.now();

  const css = `
    .dance-lock-note{margin:8px 0 0;color:#35d7c4;font-size:.72rem;line-height:1.5;unicode-bidi:plaintext}
    .dance-lock-note b{color:#ffb84d}
    .ai-dance-mark{box-shadow:0 0 0 1px #ffb84d,0 0 18px rgba(255,184,77,.30)!important;border-color:#ffb84d!important;filter:brightness(1.2)}
    .nextmix[data-autopilot="full"] .nextmix-badge::after{content:" · AUTO";color:#35d7c4}
    .nextmix[data-autopilot="full"] .nextmix-btn-execute{background:rgba(53,215,196,.22);border-color:#35d7c4;color:#35d7c4}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const MODE = {
    smooth:   { minDwell: 70, maxEnergyDrop: .13, maxBlend: 34, lookahead: 999, filter: .35, sampler: false, loop: false },
    club:     { minDwell: 38, maxEnergyDrop: .07, maxBlend: 24, lookahead: 999, filter: .62, sampler: true,  loop: true  },
    creative: { minDwell: 30, maxEnergyDrop: .11, maxBlend: 26, lookahead: 999, filter: .78, sampler: true,  loop: true  },
    safe:     { minDwell: 85, maxEnergyDrop: .03, maxBlend: 22, lookahead: 999, filter: .20, sampler: false, loop: false },
  };

  const state = {
    forcedOnce: false,
    lastPreparedSig: '',
    lastRejectedAt: 0,
    rejectCountBySig: Object.create(null),
    lastExecuteSig: '',
    lastExecuteAt: 0,
    lastFeatureSig: '',
    lastLoopSig: '',
    lastDancePulse: 0,
  };

  function dbg(){ return window.__djDebug || null; }
  function auto(){ const d = dbg(); return d && d.autoDj && d.autoDj.state ? d.autoDj.state : null; }
  function log(label, text, kind){
    const d = dbg();
    try {
      if (d && d.controlBus && d.controlBus.log) d.controlBus.log(label, text, kind || 'warn');
      const box = $('aiActions');
      const count = $('aiActionCount');
      if (box) {
        const item = document.createElement('div');
        item.className = 'ai-action ' + (kind || 'warn');
        item.innerHTML = '<strong>' + label + '</strong><span>' + text + '</span>';
        box.insertBefore(item, box.firstChild);
        while (box.children.length > 9) box.removeChild(box.lastChild);
        if (count) count.textContent = String(box.children.length);
      }
    } catch(e) {}
  }
  function mark(el){ if (!el) return; el.classList.add('ai-dance-mark'); clearTimeout(el.__danceMark); el.__danceMark = setTimeout(() => el.classList.remove('ai-dance-mark'), 900); }
  function setUiText(id, html){ const el=$(id); if(el) el.innerHTML = html; }
  function modeOf(a){ return (a && a.mode) || (($('aiMode') && $('aiMode').value) || 'club'); }
  function cfg(a){ return MODE[modeOf(a)] || MODE.club; }

  function setSlider(id, value){
    const el = $(id); if (!el) return;
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    mark(el);
  }
  function setEq(key, band, value){
    const d = dbg();
    try {
      if (d && d.actions && d.actions.setEq && band !== 'filter') d.actions.setEq(key, band, value);
      if (d && d.actions && d.actions.setColorFilter && band === 'filter') d.actions.setColorFilter(key, value);
    } catch(e) {}
    const suffix = band === 'high' ? 'Hi' : band === 'mid' ? 'Mid' : band === 'low' ? 'Low' : null;
    if (suffix) setSlider('eq' + suffix + key, value);
    if (band === 'filter') setSlider('color' + key, value);
  }
  function setPadMode(key, mode){
    const d = dbg();
    try { if (d && d.actions && d.actions.setPadMode) d.actions.setPadMode(key, mode); } catch(e) {}
    mark($('pads' + key)); mark($('padTabs' + key));
  }
  function sampler(key, index){
    const d = dbg();
    try { if (d && d.actions && d.actions.samplerAction) d.actions.samplerAction(key, index || 0); } catch(e) {}
    mark($('pads' + key));
  }
  function loop(key, beats){
    const d = dbg();
    try { if (d && d.actions && d.actions.toggleLoopSize) d.actions.toggleLoopSize(key, beats || 4); } catch(e) {}
    mark($('pads' + key));
  }
  function fx(key, name){
    const d = dbg();
    try { if (d && d.actions && d.actions.toggleFx) d.actions.toggleFx(key, name || 'echo'); } catch(e) {}
    mark($('pads' + key));
  }

  function deckMeta(d, key){ return d && d.decks && d.decks[key] ? d.decks[key].meta : null; }
  function elapsedOf(d, meta){ try { return d && d.elapsed && meta ? d.elapsed(meta, d.now()) : 0; } catch(e){ return 0; } }
  function trackEnergy(t){
    if (!t) return .5;
    if (typeof t.energy === 'number') return t.energy;
    if (t.structure && t.structure.loudness && isFinite(t.structure.loudness.rms)) return Math.max(0, Math.min(1, t.structure.loudness.rms * 8));
    if (isFinite(t.loudnessDb)) return Math.max(0, Math.min(1, (t.loudnessDb + 40) / 30));
    return .5;
  }
  function trackDuration(t){ return (t && (t.duration || (t.buffer && t.buffer.duration))) || 0; }
  function niceName(t){ return t && t.name ? t.name : '—'; }

  function nearestPhrase(track, target){
    const ph = track && track.phrases && (track.phrases.phrases8 || track.phrases.phrases16);
    if (!ph || !ph.length) return target;
    let best = target, err = Infinity;
    for (const x of ph) {
      if (x < 4 || x > trackDuration(track) - 24) continue;
      const e = Math.abs(x - target);
      if (e < err) { err = e; best = x; }
    }
    return best;
  }

  function hotMixOffset(track){
    const dur = trackDuration(track);
    if (!track || dur < 55) return 0;
    const sections = (track.structure && track.structure.sections) || [];
    const preferred = sections.find(s => s.start > 8 && s.start < dur - 30 && ['drop','intro-hot','buildup'].includes(s.label));
    if (preferred) return nearestPhrase(track, preferred.start);
    const energetic = sections
      .filter(s => s.start > 10 && s.start < dur - 35 && s.label !== 'outro' && s.energy)
      .sort((a,b) => b.energy - a.energy)[0];
    if (energetic) return nearestPhrase(track, energetic.start);
    return nearestPhrase(track, Math.min(Math.max(14, dur * 0.18), Math.max(8, dur - 45)));
  }

  function tunePlanForDance(a, d){
    if (!a || !a.nextTrack || !a.nextTrack.plan) return false;
    const plan = a.nextTrack.plan;
    const toTrack = a.nextTrack.track;
    const c = cfg(a);
    let changed = false;

    // لا ندخل من intro بارد: نروح لأقرب نقطة طاقة/Drop/phrase مناسبة.
    const hot = hotMixOffset(toTrack);
    if (hot && (!plan.incomingOffset || plan.incomingOffset < hot - 2)) {
      plan.incomingOffset = hot;
      changed = true;
    }

    // Dance lock: ما نخلي Blend طويل يبرد الناس. نخليه Club-sized مع Bass Swap واضح.
    if (plan.durationSeconds && plan.durationSeconds > c.maxBlend) {
      plan.durationSeconds = c.maxBlend;
      changed = true;
    }
    if (plan.strategy && (modeOf(a) === 'club' || modeOf(a) === 'creative')) {
      if (['LONG_BLEND','EQ_BLEND','SHORT_BLEND'].includes(plan.strategy.name) && !plan.vocalCollision) {
        plan.strategy = Object.assign({}, plan.strategy, {
          name: 'BASS_SWAP',
          durationBars: 16,
          curve: 'easeInOutCubic',
          reasons: ['dance_lock_keep_mood'].concat(plan.strategy.reasons || [])
        });
        changed = true;
      }
    }
    return changed;
  }

  function rejectEnergyDropIfNeeded(a, d){
    if (!a || !a.nextTrack || !a.liveKey) return false;
    const c = cfg(a);
    const liveMeta = deckMeta(d, a.liveKey);
    const current = liveMeta && liveMeta.track;
    const next = a.nextTrack.track;
    const curE = trackEnergy(current), nextE = trackEnergy(next);
    const sig = (next && (next.id || next.name)) + ':' + a.liveKey;
    const tooLow = nextE < curE - c.maxEnergyDrop;
    const tries = state.rejectCountBySig[sig] || 0;
    if (tooLow && tries < 2 && nowMs() - state.lastRejectedAt > 2500) {
      state.rejectCountBySig[sig] = tries + 1;
      state.lastRejectedAt = nowMs();
      try { d.autoDj.skip(); } catch(e) { try { $('nextMixSkip').click(); } catch(_) {} }
      log('DANCE LOCK', 'رفضت الأغنية القادمة لأنها بتنزل الطاقة أكثر من اللازم. بجيب بديل يحافظ على مود الرقص.', 'danger');
      return true;
    }
    return false;
  }

  function prepareIncomingDeck(a, d){
    if (!a || !a.nextTrack) return;
    const sig = (a.nextTrack.track && (a.nextTrack.track.id || a.nextTrack.track.name)) + ':' + a.nextTrack.key + ':' + a.liveKey;
    if (sig === state.lastPreparedSig) return;
    state.lastPreparedSig = sig;

    tunePlanForDance(a, d);
    const k = a.nextTrack.key;
    setPadMode(k, modeOf(a) === 'creative' ? 'sampler' : 'hotcue');
    setEq(k, 'low', -0.85);
    setEq(k, 'mid', 0.02);
    setEq(k, 'high', 0.08);
    setEq(k, 'filter', 0.12);
    log('PREP', 'حضّرت Deck ' + k + ': قطعت LOW، فتحت فلتر خفيف، واخترت نقطة دخول ساخنة بدل intro بارد.', 'warn');
  }

  function autoExecuteWhenReady(a, d){
    if (!a || !a.on || !a.nextTrack || a.transition || a.controlLevel < 75) return;
    const liveMeta = deckMeta(d, a.liveKey);
    if (!liveMeta || !liveMeta.playing) return;
    const elapsed = elapsedOf(d, liveMeta);
    const dur = trackDuration(liveMeta.track);
    const remaining = dur ? dur - elapsed : Infinity;
    const c = cfg(a);
    const sig = (a.nextTrack.track && (a.nextTrack.track.id || a.nextTrack.track.name)) + ':' + a.liveKey + ':' + a.nextTrack.key;

    if (elapsed < c.minDwell && remaining > 45) return;
    if (sig === state.lastExecuteSig && nowMs() - state.lastExecuteAt < 15000) return;

    tunePlanForDance(a, d);
    state.lastExecuteSig = sig;
    state.lastExecuteAt = nowMs();
    log('AUTO EXEC', 'نفّذت NEXT MIX لحالي — ما بدك تضغط EXECUTE. الهدف: الناس تضل ترقص ونحافظ على نفس الطاقة.', 'warn');
    try { d.autoDj.executeNow(); } catch(e) { try { $('nextMixExecute').click(); } catch(_) {} }
  }

  function useTransitionFeatures(a, d){
    if (!a || !a.transition || a.controlLevel < 75) return;
    const t = a.transition;
    const dur = Math.max(.5, t.duration || 1);
    const p = Math.max(0, Math.min(1, (d.now() - t.startedAt) / dur));
    const sig = t.fromKey + '>' + t.toKey + ':' + Math.round(t.startedAt || 0);
    const c = cfg(a);

    setEq(t.fromKey, 'filter', -p * c.filter);
    setEq(t.toKey, 'filter', Math.max(0, (1 - p) * 0.20));

    if (sig !== state.lastFeatureSig) {
      state.lastFeatureSig = sig;
      log('FEATURES', 'الانتقال يستخدم LOW / FLT / SYNC / Crossfader، ومع Club/Creative رح يستخدم Loop/Sampler/FX حسب الحاجة.', 'warn');
    }

    if (c.loop && p > .12 && p < .18 && state.lastLoopSig !== sig) {
      state.lastLoopSig = sig;
      loop(t.fromKey, 4);
      log('LOOP', 'فعّلت Loop قصير على الخارج حتى ما يصير فراغ قبل دخول الأغنية الجديدة.', 'warn');
    }

    if (c.sampler && p > .25 && p < .32 && state.lastFeatureSig === sig) {
      // نخليه مرة واحدة لكل انتقال: capture ثم play بعد لحظة.
      if (!state['sample_' + sig]) {
        state['sample_' + sig] = true;
        setPadMode(t.fromKey, 'sampler');
        sampler(t.fromKey, 0);
        setTimeout(() => { const aa = auto(); if (aa && aa.on && aa.transition) sampler(t.fromKey, 0); }, 650);
        log('SAMPLER', 'أخذت Sampler من نفس الأغنية وشغلته كـfill أثناء النقلة.', 'warn');
      }
    }

    if ((modeOf(a) === 'club' || modeOf(a) === 'creative') && p > .62 && p < .68 && !state['fx_' + sig]) {
      state['fx_' + sig] = true;
      fx(t.fromKey, 'echo');
      log('FX', 'Echo Out خفيف للخروج بدون ما يبرد مود الرقص.', 'warn');
    }
  }

  function keepDeckMoving(a, d){
    if (!a || !a.on || a.transition || a.controlLevel < 100) return;
    if (nowMs() - state.lastDancePulse < 6500) return;
    const live = deckMeta(d, a.liveKey);
    if (!live || !live.playing) return;
    state.lastDancePulse = nowMs();
    // حركة صغيرة مرئية فقط؛ لا نخرب الصوت. الهدف يبيّن أن البوت ماسك ومراقب.
    mark($('eqLow' + a.liveKey)); mark($('color' + a.liveKey)); mark($('tempo' + a.liveKey));
  }

  function ensureCockpit(a, d){
    const panel = $('nextMixPanel');
    if (panel) panel.dataset.autopilot = 'full';
    const exec = $('nextMixExecute');
    if (exec) exec.textContent = 'AUTO EXECUTE';
    const reason = $('aiReasonText') || $('agentReason');
    if (reason) {
      reason.innerHTML = a && a.on
        ? '<b>Dance Lock:</b> أنا بنفذ NEXT MIX لحالي، أتجنب نزول الطاقة، أدخل من نقطة ساخنة مش intro، وأستخدم EQ/FLT/Loop/Sampler/FX وقت اللزوم.'
        : '<b>جاهز:</b> شغّل AI TAKE OVER وأنا بمسك كل شيء أوتومات.';
    }
    const noteHost = $('aiCockpit') || $('agentCockpit');
    if (noteHost && !$('danceLockNote')) {
      noteHost.insertAdjacentHTML('beforeend','<div id="danceLockNote" class="dance-lock-note"><b>Dance Lock ON:</b> النقلة أوتومات، بدون ضغط EXECUTE، وبدون تهبيط المود.</div>');
    }
  }

  function forceFullAutoOnce(a, d){
    if (!a || state.forcedOnce) return;
    state.forcedOnce = true;
    // لأنك بدك يحافظ على الرقص، خلي البداية Club بدل Creative العشوائي.
    a.mode = 'club';
    a.controlLevel = 100;
    const m = $('aiMode'); if (m) { m.value = 'club'; m.dispatchEvent(new Event('change', { bubbles:true })); }
    const lvl = $('aiControlLevel'); if (lvl) { lvl.value = '100'; lvl.dispatchEvent(new Event('input', { bubbles:true })); }
    log('DANCE LOCK', 'فعلت Club + Full Control: البوت ينفذ لحاله، يحافظ على الطاقة، ويستخدم الفيتشرز.', 'warn');
  }

  function tick(){
    const d = dbg();
    const a = auto();
    if (d && a) {
      forceFullAutoOnce(a, d);
      ensureCockpit(a, d);
      if (a.on) {
        try { if (d.autoDj && d.autoDj.setTiming) d.autoDj.setTiming(cfg(a).lookahead, 1); } catch(e) {}
        if (!a.transition && a.nextTrack) {
          if (!rejectEnergyDropIfNeeded(a, d)) {
            prepareIncomingDeck(a, d);
            autoExecuteWhenReady(a, d);
          }
        }
        useTransitionFeatures(a, d);
        keepDeckMoving(a, d);
      }
    }
    requestAnimationFrame(tick);
  }

  tick();
})();
