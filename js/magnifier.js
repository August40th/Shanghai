// magnifier.js — a rectangular magnifying lens for the contract (staging) areas.
//
// A toggle button (just outside the right edge of your hand tray) switches the lens on; the
// "-" and "+" buttons under it set how strong it is.  While it is on:
//   * mouse:  hovering any contract area shows a lens centred on the pointer; it follows the
//             pointer and disappears when the pointer leaves the contract area;
//   * touch:  touching a contract area puts the lens there (drag to move it); it stays until you
//             tap anywhere else.
// The lens never intercepts the pointer, so dragging cards and dropping them works as usual
// underneath it.  On/off and strength are remembered in the browser.
//
// roundManager.js calls magnifier.layout() after every table layout (to place the buttons) and
// reserves magnifier.RESERVE_PX of width beside your seat for them.

(function () {
  'use strict';

  const LEVEL_MIN = 1.5, LEVEL_MAX = 5, LEVEL_STEP = 0.5, LEVEL_DEFAULT = 2.5;
  const BTN_W = 54;
  const RESERVE_PX = BTN_W + 10;
  const REFRESH_MS = 150;

  const state = { on: false, level: LEVEL_DEFAULT };
  try {
    const m = JSON.parse(localStorage.getItem('shanghaiMagnify') || 'null');
    if (m && typeof m.level === 'number') {
      state.on = !!m.on;
      state.level = Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, m.level));
    }
  } catch (e) { /* storage unavailable */ }

  let box = null;          // the button cluster
  let lens = null;         // the lens element (in <body>, above everything on the table)
  let inner = null;        // holds the magnified clone
  let clone = null;
  let src = null;          // contract area being magnified
  let px = 0, py = 0;      // last pointer position (screen px)
  let timer = null;
  let touchLens = false;   // true when the lens was placed by touch (stays put until tapped away)
  let activeTouches = 0;

  function save() {
    try { localStorage.setItem('shanghaiMagnify', JSON.stringify({ on: state.on, level: state.level })); } catch (e) {}
  }

  // ── Buttons ────────────────────────────────────────────────────────────────
  function syncUI() {
    if (!box) return;
    const t = box.querySelector('.mag-toggle');
    t.classList.toggle('on', state.on);
    t.setAttribute('aria-pressed', state.on ? 'true' : 'false');
    box.querySelector('.mag-level').textContent = state.level.toFixed(1).replace(/\.0$/, '') + '×';
    box.querySelector('.mag-minus').disabled = state.level <= LEVEL_MIN + 1e-6;
    box.querySelector('.mag-plus').disabled  = state.level >= LEVEL_MAX - 1e-6;
  }

  function setState(patch) {
    Object.assign(state, patch);
    state.level = Math.round(Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, state.level)) / LEVEL_STEP) * LEVEL_STEP;
    if (!state.on) hideLens();
    else if (src) render();
    save();
    syncUI();
  }

  function buildButtons(container) {
    if (box) box.remove();
    box = document.createElement('div');
    box.id = 'mag-controls';
    box.className = 'mag-controls';
    box.style.width = BTN_W + 'px';
    const mk = (cls, text, title, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = cls; b.textContent = text; b.title = title;
      b.addEventListener('click', fn);
      return b;
    };
    const toggle = mk('mag-toggle', '', 'Magnifier on / off: hover (or touch) a contract area to magnify it',
                      () => setState({ on: !state.on }));
    toggle.innerHTML = '<span class="mag-icon">🔍</span><span class="mag-level"></span>';
    const row = document.createElement('div');
    row.className = 'mag-row';
    row.append(
      mk('mag-minus', '−', 'Magnify less', () => setState({ level: state.level - LEVEL_STEP })),
      mk('mag-plus',  '+', 'Magnify more', () => setState({ level: state.level + LEVEL_STEP }))
    );
    box.append(toggle, row);
    container.appendChild(box);
    syncUI();
  }

  // Called after every table layout: keep the buttons just outside the right edge of your
  // hand tray (left edge if there is no room), clear of the opponents' seats.
  function layout(container, seat, obstacles) {
    if (!seat) { if (box) { box.remove(); box = null; } hideLens(); return; }
    if (!box || !box.isConnected) buildButtons(container);
    const bw = box.offsetWidth || BTN_W, bh = box.offsetHeight || 92;
    const Wc = container.clientWidth;
    const bottom = seat.y + seat.h, top = bottom - bh;
    const cand = [seat.x + seat.w + 6, seat.x - bw - 6];
    const hit = (l) => (obstacles || []).some(o => l < o.x + o.w && l + bw > o.x && top < o.y + o.h && bottom > o.y);
    let left = cand.find(l => l >= 2 && l + bw <= Wc - 2 && !hit(l));
    if (left === undefined) left = Math.min(Wc - bw - 2, Math.max(2, cand[0]));
    box.style.left = left + 'px';
    box.style.top = top + 'px';
  }

  // ── Lens ───────────────────────────────────────────────────────────────────
  function ensureLens() {
    if (lens) return;
    lens = document.createElement('div');
    lens.id = 'mag-lens';
    inner = document.createElement('div');
    inner.className = 'mag-lens-inner';
    lens.appendChild(inner);
    document.body.appendChild(lens);
  }

  function lensSize() {
    return {
      w: Math.round(Math.min(Math.max(170, window.innerWidth * 0.34), 320)),
      h: Math.round(Math.min(Math.max(100, window.innerHeight * 0.32), 190))
    };
  }

  // Rebuild the magnified copy (the contract area changes as cards are staged / played).
  function refresh() {
    if (!src || !src.isConnected) { hideLens(); return; }
    ensureLens();
    const c = src.cloneNode(true);
    c.removeAttribute('id');
    c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    c.querySelectorAll('[draggable]').forEach(n => n.removeAttribute('draggable'));
    c.style.cssText = `position:absolute;left:0;top:0;margin:0;transform-origin:0 0;` +
                      `width:${src.offsetWidth}px;height:${src.offsetHeight}px;pointer-events:none;transition:none;`;
    inner.replaceChildren(c);
    clone = c;
  }

  // Place the lens and set what it shows.  The point under the pointer is shown at the lens
  // centre, enlarged `level` times beyond the contract area's current on-screen size.
  function render() {
    if (!src || !lens || !clone) return;
    const { w, h } = lensSize();
    const r = src.getBoundingClientRect();
    const T = (r.width / (src.offsetWidth || 1)) || 1;         // on-screen scale of the contract area
    const u = (px - r.left) / T, v = (py - r.top) / T;          // pointer position in its own units
    const M = T * state.level;
    clone.style.transform = `translate(${w / 2 - u * M}px, ${h / 2 - v * M}px) scale(${M})`;

    // Mouse: centred on the pointer.  Touch: above the finger so it is not hidden by it.
    let cx = px, cy = touchLens ? py - h / 2 - Math.min(48, h * 0.35) : py;
    let left = cx - w / 2, top = cy - h / 2;
    left = Math.min(window.innerWidth  - w - 4, Math.max(4, left));
    top  = Math.min(window.innerHeight - h - 4, Math.max(4, top));
    lens.style.cssText = `display:block;width:${w}px;height:${h}px;left:${left}px;top:${top}px;`;
  }

  function showLens(contract, x, y) {
    px = x; py = y;
    if (contract !== src) { src = contract; refresh(); }
    if (!timer) timer = setInterval(() => { refresh(); render(); }, REFRESH_MS);
    render();
  }

  function hideLens() {
    src = null; clone = null; touchLens = false;
    clearInterval(timer); timer = null;
    if (lens) lens.style.display = 'none';
  }

  const contractAt = (el) => (el && el.closest) ? el.closest('.contract-area') : null;
  const dragging = () => !!(window.touchDrag && window.touchDrag.isDragging());

  // ── Pointer handling ───────────────────────────────────────────────────────
  document.addEventListener('pointermove', e => {
    if (!state.on) return;
    if (e.pointerType === 'mouse') {
      if (e.buttons) { hideLens(); return; }                   // dragging with the mouse button down
      const c = contractAt(e.target);
      if (c) { touchLens = false; showLens(c, e.clientX, e.clientY); } else if (src) hideLens();
    } else if (touchLens && src && activeTouches === 1 && !dragging()) {
      showLens(src, e.clientX, e.clientY);                     // finger dragging on the lens' contract
    } else if (dragging()) {
      hideLens();
    }
  }, true);

  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    activeTouches++;
    if (!state.on) return;
    if (activeTouches > 1) { hideLens(); return; }             // pinch
    if (e.target.closest && e.target.closest('#mag-controls')) return;
    const c = contractAt(e.target);
    if (c) { touchLens = true; showLens(c, e.clientX, e.clientY); }
    else hideLens();                                           // tap anywhere else removes the lens
  }, true);

  const touchEnd = e => { if (e.pointerType !== 'mouse') activeTouches = Math.max(0, activeTouches - 1); };
  window.addEventListener('pointerup', touchEnd, true);
  window.addEventListener('pointercancel', touchEnd, true);

  document.addEventListener('dragstart', hideLens, true);       // HTML5 drag (mouse) started
  document.addEventListener('mouseleave', () => { if (!touchLens) hideLens(); });
  window.addEventListener('resize', hideLens);
  window.addEventListener('orientationchange', hideLens);

  window.magnifier = { layout, RESERVE_PX, state, hide: hideLens, setState };
})();
