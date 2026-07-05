// gameLog.js
// Moveable, resizable action log panel that records every game event
// with timestamps and AI strategic reasoning.
//
// Public API:  window.gameLog.log(entry)
//              window.gameLog.clear()
//              window.gameLog.show()
//              window.gameLog.hide()
//
// Called by:  roundManager.js  dragDrop.js  aiEngine.js

(() => {
  // ─── Card formatting helper ───────────────────────────────────────────────
  function fmt(card) {
    if (!card) return '?';
    const suitColors = {
      '♥': '#e74c3c', '♦': '#e74c3c',
      '♣': '#2c3e50', '♠': '#2c3e50', '★': '#8e44ad'
    };
    const color = suitColors[card.suit] || '#fff';
    return `<span style="color:${color};font-weight:700">${card.rank}${card.suit}</span>`;
  }

  function fmtCards(cards) {
    if (!cards || !cards.length) return '(none)';
    return cards.map(fmt).join(' ');
  }

  function fmtName(name) {
    return `<strong>${name}</strong>`;
  }

  // ─── Categories ───────────────────────────────────────────────────────────
  const CAT = {
    DRAW:    { label: 'Draw',    color: '#3498db' },
    DISCARD: { label: 'Discard', color: '#e67e22' },
    BUY:     { label: 'Buy',     color: '#9b59b6' },
    LAYDOWN: { label: 'Lay Down',color: '#27ae60' },
    PLAY:    { label: 'Play',    color: '#1abc9c' },
    STAGE:   { label: 'Stage',   color: '#7f8c8d' },
    ROUND:   { label: 'Round',   color: '#f39c12' },
    REASON:  { label: 'AI',      color: '#95a5a6' },
    SWAP:    { label: 'Swap',    color: '#e91e63' },
  };

  // ─── State ────────────────────────────────────────────────────────────────
  let entries   = [];
  let panel     = null;
  let logBody   = null;
  let visible   = true;
  let dragging  = false;
  let resizing  = false;
  let dragOffX  = 0, dragOffY  = 0;
  let panelX    = null, panelY = null;
  let panelW    = 340, panelH  = 420;

  // ─── Build panel ──────────────────────────────────────────────────────────
  function _build() {
    if (panel) return;

    // Default position: bottom-left corner.
    panelX = 12;
    panelY = window.innerHeight - panelH - 12;

    panel = document.createElement('div');
    panel.id = 'game-log-panel';
    panel.style.cssText = `
      position: fixed;
      left: ${panelX}px;
      top: ${panelY}px;
      width: ${panelW}px;
      height: ${panelH}px;
      background: rgba(7,20,15,0.96);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.7);
      display: flex;
      flex-direction: column;
      z-index: 20000;
      font-family: Arial, sans-serif;
      font-size: 12px;
      color: #ddd;
      user-select: none;
      min-width: 220px;
      min-height: 160px;
      overflow: hidden;
    `;

    // ── Header ───────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = `
      background: rgba(0,0,0,0.5);
      padding: 6px 10px;
      border-radius: 10px 10px 0 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: grab;
      flex-shrink: 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    `;

    const title = document.createElement('span');
    title.textContent = '📋 Game Log';
    title.style.cssText = 'font-weight:700;font-size:13px;color:#fff;';

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:6px;align-items:center;';

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = `
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: #ccc;
      border-radius: 4px;
      padding: 2px 7px;
      cursor: pointer;
      font-size: 11px;
    `;
    clearBtn.onclick = () => clear();

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.title = 'Copy log to clipboard';
    copyBtn.style.cssText = `
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: #ccc;
      border-radius: 4px;
      padding: 2px 7px;
      cursor: pointer;
      font-size: 11px;
    `;
    copyBtn.onclick = () => {
      const text = entries.map(e => {
        const plain = e.html.replace(/<[^>]+>/g, '');
        return `[${e.time}] [${e.cat.label}] ${plain}`;
      }).join('\n');
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      }).catch(() => {
        // Fallback for non-https.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      });
    };

    const hideBtn = document.createElement('button');
    hideBtn.textContent = '−';
    hideBtn.title = 'Minimise';
    hideBtn.style.cssText = `
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: #ccc;
      border-radius: 4px;
      padding: 2px 7px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 700;
      line-height: 1;
    `;
    hideBtn.onclick = () => _toggleMinimise();

    btns.appendChild(clearBtn);
    btns.appendChild(copyBtn);
    btns.appendChild(hideBtn);
    header.appendChild(title);
    header.appendChild(btns);

    // ── Log body ─────────────────────────────────────────────────────────
    logBody = document.createElement('div');
    logBody.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 6px 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      scroll-behavior: smooth;
    `;
    logBody.style.scrollbarWidth = 'thin';
    logBody.style.scrollbarColor = 'rgba(255,255,255,0.2) transparent';

    // ── Resize handle ────────────────────────────────────────────────────
    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = `
      position: absolute;
      bottom: 0;
      right: 0;
      width: 16px;
      height: 16px;
      cursor: se-resize;
      opacity: 0.4;
    `;
    resizeHandle.innerHTML = `<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
      <line x1="2" y1="10" x2="10" y2="2" stroke="white" stroke-width="1.5"/>
      <line x1="5" y1="10" x2="10" y2="5" stroke="white" stroke-width="1.5"/>
      <line x1="8" y1="10" x2="10" y2="8" stroke="white" stroke-width="1.5"/>
    </svg>`;

    panel.appendChild(header);
    panel.appendChild(logBody);
    panel.appendChild(resizeHandle);
    document.body.appendChild(panel);

    // ── Drag ────────────────────────────────────────────────────────────
    header.addEventListener('mousedown', e => {
      if (e.target !== header && e.target !== title) return;
      dragging = true;
      dragOffX = e.clientX - panel.getBoundingClientRect().left;
      dragOffY = e.clientY - panel.getBoundingClientRect().top;
      header.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (dragging) {
        panelX = Math.max(0, Math.min(window.innerWidth  - panelW, e.clientX - dragOffX));
        panelY = Math.max(0, Math.min(window.innerHeight - 40,     e.clientY - dragOffY));
        panel.style.left = `${panelX}px`;
        panel.style.top  = `${panelY}px`;
      }
      if (resizing) {
        const rect = panel.getBoundingClientRect();
        panelW = Math.max(220, e.clientX - rect.left);
        panelH = Math.max(160, e.clientY - rect.top);
        panel.style.width  = `${panelW}px`;
        panel.style.height = `${panelH}px`;
      }
    });

    document.addEventListener('mouseup', () => {
      dragging = resizing = false;
      header.style.cursor = 'grab';
    });

    resizeHandle.addEventListener('mousedown', e => {
      resizing = true;
      e.preventDefault();
    });

    // Restore entries if any exist (e.g. after a re-render).
    _rebuildEntries();
  }

  let _minimised = false;
  function _toggleMinimise() {
    _minimised = !_minimised;
    logBody.style.display = _minimised ? 'none' : 'flex';
    panel.style.height     = _minimised ? 'auto' : `${panelH}px`;
    panel.querySelector('button[title="Minimise"]').textContent = _minimised ? '+' : '−';
  }

  // ─── Render one entry row ─────────────────────────────────────────────────
  function _renderEntry(entry) {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      gap: 6px;
      align-items: flex-start;
      padding: 3px 4px;
      border-radius: 4px;
      line-height: 1.4;
      ${entry.cat === CAT.REASON
        ? 'background:rgba(255,255,255,0.03);border-left:2px solid rgba(149,165,166,0.4);margin-left:8px;'
        : ''}
    `;

    // Timestamp.
    const ts = document.createElement('span');
    ts.textContent = entry.time;
    ts.style.cssText = 'color:rgba(255,255,255,0.3);flex-shrink:0;font-size:10px;margin-top:1px;';

    // Category badge.
    const badge = document.createElement('span');
    badge.textContent = entry.cat.label;
    badge.style.cssText = `
      color: ${entry.cat.color};
      font-weight: 700;
      font-size: 10px;
      flex-shrink: 0;
      min-width: 52px;
      margin-top: 1px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    `;

    // Message.
    const msg = document.createElement('span');
    msg.innerHTML = entry.html;
    msg.style.cssText = 'flex:1;word-break:break-word;user-select:text;cursor:text;';

    row.appendChild(ts);
    row.appendChild(badge);
    row.appendChild(msg);
    return row;
  }

  function _rebuildEntries() {
    if (!logBody) return;
    logBody.innerHTML = '';
    entries.forEach(e => logBody.appendChild(_renderEntry(e)));
    logBody.scrollTop = logBody.scrollHeight;
  }

  // ─── Public: log an entry ────────────────────────────────────────────────
  function log(entry) {
    // entry = { cat, html }
    if (!panel) _build();
    const now  = new Date();
    const time = `${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    const full = { ...entry, time };
    entries.push(full);

    // Keep at most 500 entries to avoid memory bloat.
    if (entries.length > 500) entries.shift();

    if (logBody) {
      const row = _renderEntry(full);
      logBody.appendChild(row);
      // Auto-scroll if near the bottom.
      const atBottom = logBody.scrollHeight - logBody.scrollTop - logBody.clientHeight < 60;
      if (atBottom) logBody.scrollTop = logBody.scrollHeight;
    }
  }

  function clear() {
    entries = [];
    if (logBody) logBody.innerHTML = '';
  }

  function show() {
    if (!panel) _build();
    panel.style.display = 'flex';
    visible = true;
  }

  function hide() {
    if (panel) panel.style.display = 'none';
    visible = false;
  }

  // ─── Convenience log helpers ──────────────────────────────────────────────
  // These are called from roundManager, dragDrop, and aiEngine.

  function logDraw(playerName, source, card) {
    if (source === 'draw') {
      log({ cat: CAT.DRAW,
            html: `${fmtName(playerName)} drew from the deck.` });
    } else {
      log({ cat: CAT.DRAW,
            html: `${fmtName(playerName)} drew ${fmt(card)} from the discard pile.` });
    }
  }

  function logDiscard(playerName, card) {
    log({ cat: CAT.DISCARD,
          html: `${fmtName(playerName)} discarded ${fmt(card)}.` });
  }

  function logBuy(playerName, card, isVeto) {
    if (isVeto) {
      log({ cat: CAT.BUY,
            html: `${fmtName(playerName)} took ${fmt(card)} as their draw (veto).` });
    } else {
      log({ cat: CAT.BUY,
            html: `${fmtName(playerName)} bought ${fmt(card)} (+1 draw from deck).` });
    }
  }

  function logDecline(playerName) {
    log({ cat: CAT.BUY,
          html: `${fmtName(playerName)} declined to buy.` });
  }

  function logLayDown(playerName, subAreas) {
    const parts = subAreas.map(({ label, cards }) =>
      `${label}: ${fmtCards(cards)}`
    ).join(' | ');
    log({ cat: CAT.LAYDOWN,
          html: `${fmtName(playerName)} laid down — ${parts}` });
  }

  function logPlay(playerName, card, ownerName, areaLabel) {
    log({ cat: CAT.PLAY,
          html: `${fmtName(playerName)} played ${fmt(card)} onto ${fmtName(ownerName)}'s ${areaLabel}.` });
  }

  function logWildSwap(playerName, realCard, wildCard, ownerName, areaLabel) {
    log({ cat: CAT.SWAP,
          html: `${fmtName(playerName)} swapped ${fmt(realCard)} for wild ${fmt(wildCard)} in ${fmtName(ownerName)}'s ${areaLabel}.` });
  }

  function logStage(playerName, stagedByArea) {
    // stagedByArea = [{ label, cards }]
    const parts = stagedByArea
      .filter(a => a.cards.length > 0)
      .map(a => `${a.label}: ${fmtCards(a.cards)}`)
      .join(' | ');
    if (parts) {
      log({ cat: CAT.STAGE,
            html: `${fmtName(playerName)} staged — ${parts}` });
    }
  }

  function logReason(playerName, reason) {
    log({ cat: CAT.REASON,
          html: `<em style="color:#bdc3c7">${fmtName(playerName)}: ${reason}</em>` });
  }

  function logRound(roundNum, contractLabel) {
    log({ cat: CAT.ROUND,
          html: `<strong style="color:#f39c12">── Round ${roundNum}: ${contractLabel} ──</strong>` });
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  window.gameLog = {
    log,
    clear,
    show,
    hide,
    logDraw,
    logDiscard,
    logBuy,
    logDecline,
    logLayDown,
    logPlay,
    logWildSwap,
    logStage,
    logReason,
    logRound,
    fmt,
    fmtCards,
  };

  // Build on load.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _build);
  } else {
    _build();
  }
})();
