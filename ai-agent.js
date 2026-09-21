(function(){
  'use strict';

  /*
    V12 STABILIZATION ROLLBACK
    ------------------------------------------------------------
    The experimental AI/remix overlay was harming the product:
    - bad transitions
    - over-aggressive automation
    - ugly/unclear buttons
    - sound changes that did not feel musical

    This file intentionally stops controlling the audio engine, buttons,
    EQ, filters, loops, pads, sampler, and crossfader.

    The original V7/Vercel app remains in control. This is the safe baseline
    before rebuilding a proper remix engine inside the core audio code instead
    of patching the UI from an external overlay.
  */

  const log = '[Nabda DJ] V12 stabilization active: experimental AI overlay disabled.';
  try { console.info(log); } catch (e) {}

  function addStabilityNote(){
    if (document.getElementById('stabilityNote')) return;
    const header = document.querySelector('.topbar') || document.body;
    const box = document.createElement('div');
    box.id = 'stabilityNote';
    box.style.cssText = 'font-family:Cairo,system-ui,sans-serif;font-size:12px;line-height:1.45;color:#8b8d99;max-width:360px;text-align:right;opacity:.9';
    box.textContent = 'تم إيقاف طبقة الريمكس التجريبية مؤقتًا. الصوت والأزرار رجعوا للوضع المستقر قبل إعادة بناء محرك DJ حقيقي.';
    try { header.appendChild(box); } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addStabilityNote);
  else addStabilityNote();

  window.__nabdaStabilized = true;
})();
