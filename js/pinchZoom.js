// pinchZoom.js — pinch / mouse-wheel zoom and drag-to-pan for the table.
//
// The table is laid out to fit the screen, so on a phone everything is small.  This zooms the
// whole table (#table-container) with two fingers, and once zoomed a one-finger drag on empty
// felt pans it.  On a desktop the mouse wheel zooms about the pointer and a drag on empty
// felt pans.  A small "1x" button (next to the full-screen button) or a double-click on
// empty felt resets the view; resizing / rotating the device resets it as well.
//
// Cards keep working while zoomed: drag-and-drop and tap-to-select read on-screen coordinates,
// which already include the zoom.  Load this file AFTER touchDrag.js.

(function () {
  'use strict';

  const MAX_ZOOM = 4;
  const PAN_THRESHOLD = 8;

  const box = document.getElementById('table-container');
  if (!box) return;

  let z = 1, tx = 0, ty = 0;
  const ptrs = new Map();            // active touch pointers: id -> {x, y}
  let pinch = null;                  // {d0, z0, px, py} while two fingers are down
  let pan = null;                    // {x0, y0, tx0, ty0, active} for a one-finger pan
  let resetBtn = null;

  // The browser must not pinch/scroll the page itself on the table (we do it); buttons and
  // cards still receive their normal taps.
  box.style.touchAction = 'none';   // (touch only; the mouse is unaffected)
  box.style.transformOrigin = '0 0';

  function clamp() {
    const W = box.offsetWidth, H = box.offsetHeight;
    tx = Math.min(0, Math.max(W - W * z, tx));
    ty = Math.min(0, Math.max(H - H * z, ty));
  }
  function apply() {
    if (z <= 1.001) { z = 1; tx = 0; ty = 0; box.style.transform = ''; }
    else { clamp(); box.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`; }
    if (resetBtn) resetBtn.hidden = z <= 1.001;
  }
  function reset() { z = 1; tx = ty = 0; apply(); }

  function two() { const a = [...ptrs.values()]; return a.length >= 2 ? a : null; }

  function startPinch() {
    const a = two(); if (!a) return;
    const cx = (a[0].x + a[1].x) / 2, cy = (a[0].y + a[1].y) / 2;
    pinch = { d0: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, z0: z,
              px: (cx - tx) / z, py: (cy - ty) / z };      // table point under the fingers
    pan = null;
    if (window.touchDrag && window.touchDrag.cancel) window.touchDrag.cancel();
  }

  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !box.contains(e.target)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) startPinch();
    else if (ptrs.size === 1 && z > 1 && !(e.target.closest && e.target.closest('.card[draggable="true"], button, input, label'))) {
      pan = { x0: e.clientX, y0: e.clientY, tx0: tx, ty0: ty, active: false };
    }
  }, true);

  window.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch) {
      const a = two(); if (!a) return;
      const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
      const cx = (a[0].x + a[1].x) / 2, cy = (a[0].y + a[1].y) / 2;
      z = Math.min(MAX_ZOOM, Math.max(1, pinch.z0 * d / pinch.d0));
      tx = cx - pinch.px * z;
      ty = cy - pinch.py * z;
      apply();
    } else if (pan) {
      if (!pan.active && Math.hypot(e.clientX - pan.x0, e.clientY - pan.y0) < PAN_THRESHOLD) return;
      pan.active = true;
      tx = pan.tx0 + (e.clientX - pan.x0);
      ty = pan.ty0 + (e.clientY - pan.y0);
      apply();
    }
  }, true);

  function up(e) {
    if (!ptrs.delete(e.pointerId)) return;
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) pan = null;
  }
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);

  // ── Mouse: wheel zooms about the pointer, drag on empty felt pans ─────────
  const NO_PAN = '.card, button, input, label, .pile, .player, .contract-area, #recent-log';
  box.addEventListener('wheel', e => {
    if (e.ctrlKey) return;                                   // leave the browser's own zoom alone
    e.preventDefault();
    const px = (e.clientX - tx) / z, py = (e.clientY - ty) / z;
    const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? 400 : 1);
    z = Math.min(MAX_ZOOM, Math.max(1, z * Math.exp(-e.deltaY * unit * 0.0015)));
    tx = e.clientX - px * z;
    ty = e.clientY - py * z;
    apply();
  }, { passive: false });

  let mpan = null;
  box.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || z <= 1 || (e.target.closest && e.target.closest(NO_PAN))) return;
    mpan = { x0: e.clientX, y0: e.clientY, tx0: tx, ty0: ty };
    box.style.cursor = 'grabbing';
  });
  window.addEventListener('pointermove', e => {
    if (!mpan || e.pointerType !== 'mouse') return;
    tx = mpan.tx0 + (e.clientX - mpan.x0);
    ty = mpan.ty0 + (e.clientY - mpan.y0);
    apply();
  });
  window.addEventListener('pointerup', e => { if (mpan && e.pointerType === 'mouse') { mpan = null; box.style.cursor = ''; } });
  box.addEventListener('dblclick', e => {
    if (z > 1 && !(e.target.closest && e.target.closest(NO_PAN))) reset();
  });

  // Reset button
  function initButton() {
    resetBtn = document.createElement('button');
    resetBtn.id = 'zoom-reset-btn';
    resetBtn.type = 'button';
    resetBtn.textContent = '1×';
    resetBtn.title = 'Reset zoom';
    resetBtn.hidden = true;
    resetBtn.addEventListener('click', reset);
    document.body.appendChild(resetBtn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initButton);
  else initButton();

  window.addEventListener('resize', reset);
  window.addEventListener('orientationchange', reset);

  window.pinchZoom = { reset, zoom: () => z };
})();
