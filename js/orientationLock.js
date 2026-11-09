// orientationLock.js — keep phones and tablets in landscape.
//
// Browsers only allow a page to lock the screen orientation while it is full screen (or
// installed as an app), so this does three things:
//   1. asks for a landscape lock on the first tap and whenever full screen is entered
//      (the full-screen button in touchDrag.js also asks);
//   2. otherwise, while a touch device is held upright, covers the table with a
//      "Please rotate your device" screen (its CSS is injected here, so any page can use this file);
//   3. the web-app manifest (manifest.webmanifest) asks for landscape when the game is
//      installed to the home screen.
// Desktop (mouse) browsers are not affected.

(function () {
  'use strict';

  const touchDevice = window.matchMedia('(pointer: coarse)').matches;
  if (!touchDevice) return;

  const mq = window.matchMedia('(orientation: portrait)');

  function tryLock() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => { /* not allowed outside full screen */ });
      }
    } catch (e) { /* unsupported */ }
  }

  function sync() {
    document.documentElement.classList.toggle('need-landscape', mq.matches);
  }

  function build() {
    if (document.getElementById('rotate-overlay')) return;
    const st = document.createElement('style');
    st.textContent =
      '#rotate-overlay{display:none;position:fixed;inset:0;z-index:2147483647;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:18px;background:#0b3d1c;color:#fff;' +
      'font:bold 20px Arial,sans-serif;text-align:center;padding:24px}' +
      '#rotate-overlay .rotate-icon{font-size:64px;display:inline-block;animation:rotate-hint 2.4s ease-in-out infinite}' +
      'html.need-landscape #rotate-overlay{display:flex}' +
      '@keyframes rotate-hint{0%,25%{transform:rotate(0deg)}60%,100%{transform:rotate(-90deg)}}';
    document.head.appendChild(st);
    const o = document.createElement('div');
    o.id = 'rotate-overlay';
    o.setAttribute('role', 'alert');
    o.innerHTML = '<div class="rotate-icon" aria-hidden="true">📱</div>' +
                  '<div class="rotate-text">Please rotate your device to landscape</div>';
    document.body.appendChild(o);
    sync();
  }

  if (mq.addEventListener) mq.addEventListener('change', sync); else mq.addListener(sync);
  window.addEventListener('orientationchange', sync);
  window.addEventListener('resize', sync);
  document.addEventListener('fullscreenchange', tryLock);
  document.addEventListener('webkitfullscreenchange', tryLock);
  document.addEventListener('pointerdown', tryLock, { once: true, capture: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
  tryLock();
})();
