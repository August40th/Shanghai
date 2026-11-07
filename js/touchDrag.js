// touchDrag.js — touch / pen drag-and-drop for the table.
//
// The game's drag-and-drop uses the browser's HTML5 drag events (dragstart / dragover /
// drop ...).  Browsers do not fire those for a finger, so this file turns a touch drag
// into the SAME events and sends them to the existing handlers in cardRenderer.js and
// dragDrop.js.  Mouse input is left completely alone (pointerType 'mouse' is ignored), so
// mouse drag-and-drop works exactly as before and every drop rule stays in one place.
//
// Load this file BEFORE dragDrop.js (it must register its capture listener first).

(function () {
  'use strict';

  const MOVE_THRESHOLD = 8;     // px a finger must travel before a touch becomes a drag
  const LIFT_MAX       = 44;    // px the card is drawn above the fingertip so it stays visible

  let lastType = 'mouse';       // pointer type of the most recent pointerdown
  let g = null;                 // the active touch gesture, or null
  let suppressClickUntil = 0;

  // ── Pointer type tracking ──────────────────────────────────────────────────
  document.addEventListener('pointerdown', e => { lastType = e.pointerType || 'mouse'; }, true);

  // A browser may start its own native drag after a long press.  We handle touch ourselves,
  // so cancel the native one (our synthetic dragstart is not trusted, so it passes through).
  document.addEventListener('dragstart', e => {
    if (e.isTrusted && lastType !== 'mouse') { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // No long-press context menu / callout on cards and piles with touch.
  document.addEventListener('contextmenu', e => {
    if (lastType !== 'mouse' && e.target.closest && e.target.closest('.card, .pile')) e.preventDefault();
  }, true);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function makeDataTransfer() {
    const store = {};
    return {
      effectAllowed: 'all', dropEffect: 'move', types: [], files: [], items: [],
      setData(t, v) { store[t] = String(v); },
      getData(t)    { return store[t] === undefined ? '' : store[t]; },
      clearData()   { for (const k in store) delete store[k]; },
      setDragImage() { /* the ghost below replaces the drag image */ }
    };
  }

  function fire(type, target, x, y) {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window });
    ev.dataTransfer = g.dt;
    target.dispatchEvent(ev);
    return ev;
  }

  // The element under the aim point and the nearest ancestor that accepts drops.
  function hit(x, y) {
    const el = document.elementFromPoint(x, y);
    let zone = el;
    while (zone && zone !== document.body && typeof zone.ondrop !== 'function') zone = zone.parentElement;
    return { el, zone: (zone && typeof zone.ondrop === 'function') ? zone : null };
  }

  function aimPoint(e) { return { x: e.clientX, y: e.clientY - g.lift }; }

  // Seats are scaled with CSS transforms, so a card's layout size (offsetWidth) is not its
  // on-screen size.  Multiply the scales of all ancestors to get the real factor.
  function visualScale(el) {
    let k = 1;
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const t = getComputedStyle(n).transform;
      if (t && t !== 'none') { const m = new DOMMatrix(t); k *= Math.hypot(m.a, m.b) || 1; }
    }
    return k;
  }

  // The ghost keeps the card's design size and is shrunk/grown with a transform about its centre.
  function placeGhost(x, y) {
    g.ghost.style.left = (x - g.w / 2) + 'px';
    g.ghost.style.top  = (y - g.h / 2) + 'px';
  }

  function cleanup() {
    if (g && g.ghost) g.ghost.remove();
    if (g && g.src) g.src.classList.remove('touch-dragging');
    g = null;
  }

  // ── Gesture ────────────────────────────────────────────────────────────────
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || g || !e.isPrimary) return;
    const card = e.target.closest && e.target.closest('.card[draggable="true"]');
    if (!card) return;
    g = { id: e.pointerId, src: card, x0: e.clientX, y0: e.clientY, started: false,
          zone: null, el: null, dt: null, ghost: null, w: 0, h: 0, k: 1, lift: 0 };
  }, true);

  function begin() {
    g.dt = makeDataTransfer();
    const ev = fire('dragstart', g.src, g.x0, g.y0);        // card handler fills the data
    if (ev.defaultPrevented) return false;                    // e.g. not allowed right now
    g.w = g.src.offsetWidth  || g.src.getBoundingClientRect().width;
    g.h = g.src.offsetHeight || g.src.getBoundingClientRect().height;
    g.k = visualScale(g.src);                                 // on-screen size = layout size * g.k
    g.lift = Math.min(LIFT_MAX, g.h * g.k * 0.4);
    const ghost = g.src.cloneNode(true);
    ghost.removeAttribute('draggable');
    ghost.classList.add('touch-drag-ghost');
    ghost.style.cssText += `;position:fixed;left:0;top:0;width:${g.w}px;height:${g.h}px;margin:0;` +
      `z-index:100000;pointer-events:none;transform:scale(${g.k * 1.1}) rotate(4deg);transform-origin:50% 50%;`;
    document.body.appendChild(ghost);
    g.ghost = ghost;
    g.src.classList.add('touch-dragging');
    g.started = true;
    return true;
  }

  window.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    if (!g.started) {
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < MOVE_THRESHOLD) return;
      if (!begin()) { g = null; return; }
    }
    const { x, y } = aimPoint(e);
    placeGhost(x, y);
    const { el, zone } = hit(x, y);
    if (zone !== g.zone) {
      if (g.zone) fire('dragleave', g.zone, x, y);
      g.zone = zone;
      if (zone) fire('dragenter', el, x, y);
    }
    if (zone) fire('dragover', el, x, y);
    g.el = el;
  }, { passive: true });

  function finish(e, cancelled) {
    if (!g || e.pointerId !== g.id) return;
    if (!g.started) {                                           // it was only a tap
      const card = g.src; g = null;
      tapCard(card, e);
      return;
    }
    const { x, y } = aimPoint(e);
    const { el, zone } = hit(x, y);
    if (!cancelled && zone) {
      if (zone !== g.zone) {                                     // moved onto a new zone in one jump
        if (g.zone) fire('dragleave', g.zone, x, y);
        fire('dragenter', el, x, y);
      }
      fire('dragover', el, x, y);
      fire('drop', el, x, y);
    } else if (g.zone) {
      fire('dragleave', g.zone, x, y);
    }
    // dragend: the source card may have been re-rendered by the drop, so fall back to <body>.
    const end = new MouseEvent('dragend', { bubbles: true, cancelable: false, clientX: x, clientY: y, view: window });
    end.dataTransfer = g.dt;
    (g.src.isConnected ? g.src : document.body).dispatchEvent(end);
    suppressClickUntil = Date.now() + 350;
    cleanup();
  }
  window.addEventListener('pointerup',     e => finish(e, false), true);
  window.addEventListener('pointercancel', e => finish(e, true),  true);

  // A drag that ends over a button must not also "click" it.
  document.addEventListener('click', e => {
    if (Date.now() < suppressClickUntil) { e.stopPropagation(); e.preventDefault(); }
  }, true);


  // ── Tap to select, tap to place ────────────────────────────────────────────
  // A second way to move cards on a touch screen: tap a card (it lifts and glows), then tap
  // the staging area, your hand or the discard pile where it should go.  This reuses the same
  // drop handlers as dragging, so every rule is enforced in one place.  Tap the card again,
  // or tap empty table, to cancel.
  let sel = null;                       // the selected card element
  let tapDown = null;                   // where the current touch started

  function clearSel() { if (sel) sel.classList.remove('touch-selected'); sel = null; }

  function tapCard(card, e) {
    if (sel === card) { clearSel(); return; }
    if (sel && sel.isConnected) {
      // Tapping a card that sits in a DIFFERENT zone (e.g. a card already staged) places the
      // selected card there; tapping another card in the same zone just changes the selection.
      const a = hit(e.clientX, e.clientY).zone, b = hit(sel.getBoundingClientRect().x + 2, sel.getBoundingClientRect().y + 2).zone;
      if (a && a !== b && dropSelected(e.clientX, e.clientY)) { suppressClickUntil = Date.now() + 350; return; }
    }
    clearSel();
    sel = card;
    card.classList.add('touch-selected');
  }

  // Place the selected card on whatever zone is at (x, y). Returns true if a drop was attempted.
  function dropSelected(x, y) {
    if (!sel || !sel.isConnected) { clearSel(); return false; }
    const { el, zone } = hit(x, y);
    if (!zone) return false;
    const card = sel;
    g = { dt: makeDataTransfer() };
    try {
      const ds = fire('dragstart', card, x, y);
      if (!ds.defaultPrevented) {
        fire('dragenter', el, x, y);
        fire('dragover', el, x, y);
        fire('drop', el, x, y);
      }
      const end = new MouseEvent('dragend', { bubbles: true, cancelable: false, clientX: x, clientY: y, view: window });
      end.dataTransfer = g.dt;
      (card.isConnected ? card : document.body).dispatchEvent(end);
    } finally { g = null; }
    clearSel();                         // the table re-renders after a move; start fresh
    return true;
  }

  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    tapDown = { x: e.clientX, y: e.clientY, t: Date.now(),
                onCard: !!(e.target.closest && e.target.closest('.card[draggable="true"]')) };
  }, true);

  window.addEventListener('pointerup', e => {
    if (e.pointerType === 'mouse' || !sel || !tapDown) return;
    const d = tapDown; tapDown = null;
    if (g) return;                                           // a real drag just ended
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > MOVE_THRESHOLD || Date.now() - d.t > 700) return;
    if (d.onCard) return;                                    // card taps are handled in finish()
    // Buttons (Lay Down, Buy ...) keep working; selection is just dropped.
    if (e.target.closest && e.target.closest('button, input, .game-log, #game-log-panel')) { clearSel(); return; }
    if (dropSelected(e.clientX, e.clientY)) suppressClickUntil = Date.now() + 350;
    else clearSel();
  }, true);

  // The selection must not outlive a re-render of its card.
  setInterval(() => { if (sel && !sel.isConnected) sel = null; }, 500);

  // ── Full-screen button (touch devices) ─────────────────────────────────────
  // A phone held sideways has only ~250 px of height once the status bar and address bar
  // are showing.  Full screen hides both and gives the table about 40% more room.
  function initFullscreenButton() {
    const root = document.documentElement;
    const canFs = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    if (!canFs || !window.matchMedia('(pointer: coarse)').matches) return;
    const btn = document.createElement('button');
    btn.id = 'fs-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle full screen');
    const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    const sync = () => { btn.textContent = isFs() ? '✕' : '⛶'; btn.title = isFs() ? 'Exit full screen' : 'Full screen'; };
    btn.addEventListener('click', async () => {
      try {
        if (isFs()) {
          await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else {
          await (root.requestFullscreen || root.webkitRequestFullscreen).call(root, { navigationUI: 'hide' });
          if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
        }
      } catch (e) { /* the browser refused (e.g. iPhone Safari): nothing to do */ }
    });
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    sync();
    document.body.appendChild(btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFullscreenButton);
  else initFullscreenButton();

  window.touchDrag = { isDragging: () => !!(g && g.started), hasSelection: () => !!sel };
})();
