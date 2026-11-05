// cardRenderer.js
// Pure DOM construction — takes data in, updates DOM elements.
// No drag logic, no game-state writes.
//
// BUG FIX (staging freeze): renderAllSubcontractAreas now renders ALL players'
// subcontract areas, not just the current-turn player's. This was the root
// cause of opponents' laid-down contracts not updating visually when cards
// were played onto them.
//
// Depends on:  gameState.js  validator.js
// Called by:   roundManager.js  dragDrop.js  aiEngine.js

(() => {
  const { getState, CARD_WIDTH, CARD_HEIGHT, CARD_OVERLAP } = window.gameState;
  const { isWild, isValidSet, isValidRun } = window.validator;

  // ─── Suit helpers ─────────────────────────────────────────────────────────
  function suitToKey(suit) {
    switch (suit) {
      case '♦': return 'diamonds';
      case '♥': return 'hearts';
      case '♣': return 'clubs';
      case '♠': return 'spades';
      case '★': return 'stars';
      default:   return 'hearts';
    }
  }
  function isRedSuit(suit) { return suit === '♦' || suit === '♥'; }

  // ─── createCardDiv ────────────────────────────────────────────────────────
  // Builds a single card DOM element.
  // scaleDiscard = true → card is sized to fill the discard pile area.

  function createCardDiv(card, scaleDiscard = false, big = false, size = null) {
    const { suitColors, backColors, suitSize, rankSize } = getState();

    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.dataset.rank = card.rank;
    cardDiv.dataset.suit = card.suit;
    // Store _id on the element so drag handlers can find the card object by
    // identity rather than by rank+suit string (fixes duplicate-card bugs).
    if (card._id !== undefined) cardDiv.dataset.cardId = card._id;

    const key = suitToKey(card.suit);
    const sc  = suitColors[key] || {
      background: 'white',
      symbol:     isRedSuit(card.suit) ? '#c9302c' : '#111',
      outline:    '#444'
    };

    cardDiv.style.backgroundColor = sc.background || 'white';
    // Card face border uses the suit's own outline (or a neutral dark) —
    // NOT the back-design outline colour which belongs to the card back only.
    cardDiv.style.border       = `2px solid ${sc.outline || '#333'}`;
    cardDiv.style.borderRadius = '8px';
    cardDiv.style.boxShadow        = '0 2px 4px rgba(0,0,0,0.4)';
    cardDiv.style.display          = 'flex';
    cardDiv.style.justifyContent   = 'center';
    cardDiv.style.alignItems       = 'center';
    cardDiv.style.fontWeight       = 'bold';
    cardDiv.style.fontFamily       = 'Arial, sans-serif';
    cardDiv.style.boxSizing        = 'border-box';
    cardDiv.style.position         = 'relative';
    cardDiv.style.userSelect       = 'none';

    const discardPileDiv = document.getElementById('discardPile');

    if (scaleDiscard) {
      const pad = 8;
      // `size` {w,h} overrides the pile size (used by the buy window).
      const dw  = size ? size.w + pad : (discardPileDiv?.clientWidth  || 120);
      const dh  = size ? size.h + pad : (discardPileDiv?.clientHeight || 160);
      cardDiv.style.position      = 'absolute';
      cardDiv.style.top           = '0';
      cardDiv.style.left          = '0';
      cardDiv.style.width         = `${dw - pad}px`;
      cardDiv.style.height        = `${dh - pad}px`;
      cardDiv.style.margin        = '0';
      cardDiv.style.cursor        = 'default';
      cardDiv.style.pointerEvents = 'none';
      cardDiv.style.zIndex        = '100';
    } else {
      cardDiv.style.cursor  = 'grab';
      cardDiv.style.zIndex  = 'auto';
    }

    // Fonts scale with the card: 0.65 at pile size (112 wide), 0.40 hand, 0.28 table.
    const factor = scaleDiscard ? 0.65 * ((size ? size.w : 112) / 112) : (big ? 0.40 : 0.28);

    const rankDiv = document.createElement('div');
    rankDiv.className        = 'rank';
    rankDiv.textContent      = card.rank;
    rankDiv.style.color      = sc.symbol || (isRedSuit(card.suit) ? '#c9302c' : '#111');
    rankDiv.style.position   = 'absolute';
    rankDiv.style.top        = '6%';
    rankDiv.style.right      = '7%';
    rankDiv.style.fontSize   = `${Math.round(rankSize * factor)}px`;
    rankDiv.style.lineHeight = '1';
    rankDiv.style.userSelect = 'none';
    rankDiv.style.pointerEvents = 'none';
    cardDiv.appendChild(rankDiv);

    const suitDiv = document.createElement('div');
    suitDiv.className        = 'suit';
    suitDiv.textContent      = card.suit;
    suitDiv.style.color      = sc.symbol || (isRedSuit(card.suit) ? '#c9302c' : '#111');
    suitDiv.style.fontSize   = `${Math.round(suitSize * factor)}px`;
    suitDiv.style.pointerEvents = 'none';
    suitDiv.style.userSelect = 'none';
    cardDiv.appendChild(suitDiv);

    return cardDiv;
  }

  // ─── Adaptive card overlap ────────────────────────────────────────────────
  // Cards normally overlap by CARD_OVERLAP. When a row of n cards would be
  // wider than the space available, the overlap grows (down to MIN_STEP px of
  // each card showing) so the row always fits inside its panel / contract.
  const MIN_STEP = 14;
  // Your own hand uses larger cards with the same 3:4 shape as the piles.
  const VIEW_CARD_W = 72, VIEW_CARD_H = 96;
  // Fan of your hand: tilt of the outermost cards (deg), top margin, extra room for the dip.
  const FAN_MAX_DEG = 10, FAN_TOP = 4, FAN_ROOM = 30;
  function _overlapFor(n, avail, cw = CARD_WIDTH) {
    const k       = cw / CARD_WIDTH;                       // size ratio vs. a normal card
    const defOver = CARD_OVERLAP * k;
    if (n <= 1 || !avail || avail <= 0) return defOver;
    const defStep = cw - defOver;
    const step    = Math.max(MIN_STEP * k, Math.min(defStep, (avail - cw) / (n - 1)));
    return cw - step;
  }

  // The human at the table may arrange their hand and stage cards during OTHER
  // players' turns too (staging is a private, reversible action).
  function _isViewer(idx) {
    try { return window.roundManager?.viewerIdx?.() === idx && !window.aiData?.isAI?.[idx]; }
    catch { return false; }
  }

  // Computer players' cards are hidden (card backs) unless this is debug mode (computers
  // only), until a round ends (everything is revealed). A computer's staged groups turn
  // face-up once it has laid down.
  function _hiddenFromYou(idx) {
    return !window.gameDebug && !window.__revealAll && !!window.aiData?.isAI?.[idx];
  }

  // Publish the player's card-back design as CSS variables for .face-down cards.
  function _syncBackVars() {
    const b = getState().backColors || {};
    const rs = document.documentElement.style;
    rs.setProperty('--card-back', `radial-gradient(circle at center, ${b.center || '#000'} 0%, ${b.edge1 || '#333'} 25%, ${b.edge2 || '#666'} 50%, ${b.edge3 || '#999'} 75%, ${b.edge3 || '#999'} 80%)`);
    rs.setProperty('--card-back-outline', b.outline || '#fff');
  }

  // One-row fit for a seat's staging area: the card step (px between card left edges) at
  // which ALL groups sit side by side in one row, or null when that would need cards
  // overlapped tighter than MIN_ROW_STEP (then groups wrap onto extra rows as before).
  // This keeps the seat's height steady while computers stage and play cards, so the table
  // scale is not dragged down every time a group gets one card longer.
  const MIN_ROW_STEP = 21;
  function _rowFitStep(subAreas, cards, cw) {
    const first = subAreas[0];
    const contractEl = first && first.closest ? first.closest('.contract-area') : null;
    const seatW = contractEl ? (parseFloat(contractEl.dataset.maxw) || contractEl.clientWidth) : 0;
    if (!seatW) return null;
    const budget = seatW - 20 /* contract padding + border */ - 10 /* wrapper */ - 6;
    const k = subAreas.length;
    const counts = subAreas.map((_, a) => Math.max(1, cards.filter(c => c.subArea === a).length));
    const fixed = counts.length * (cw + 6) + 6 * (k - 1);
    const gaps  = counts.reduce((t, n) => t + (n - 1), 0);
    const defStep = cw - CARD_OVERLAP;
    if (!gaps) return defStep;
    const st = Math.min(defStep, (budget - fixed) / gaps);
    return st >= MIN_ROW_STEP ? st : null;
  }

  // ─── renderCardArray ──────────────────────────────────────────────────────
  // Renders an array of cards into a container element.
  // draggable controls whether dragstart listeners are attached.
  // areaType: 'hand' | 'subcontract' | 'discard'

  function renderCardArray(cardsArr, container, draggable, playerIndex, areaType) {
    container.innerHTML = '';
    if (!cardsArr || cardsArr.length === 0) {
      container.style.width = '';
      return;
    }

    if (areaType === 'discard') {
      cardsArr.forEach((card, i) => {
        const cardDiv = createCardDiv(card, true);
        cardDiv.style.position = 'absolute';
        cardDiv.style.top      = '0';
        cardDiv.style.left     = '0';
        cardDiv.style.zIndex   = i;
        container.appendChild(cardDiv);
      });
      container.style.width  = `${CARD_WIDTH + 10}px`;
      container.style.height = '160px';
      return;
    }

    _syncBackVars();
    const hideCards = areaType === 'hand' && _hiddenFromYou(playerIndex);
    const big       = areaType === 'hand' && !!container.closest?.('.is-viewer');
    const cwid      = big ? VIEW_CARD_W : CARD_WIDTH;
    const chgt      = big ? VIEW_CARD_H : CARD_HEIGHT;
    // Width available to the hand = the tray's padded width minus padding
    // (24px), the 10px slack added to the container below and, for the fanned
    // hand, room for the outer cards' tilt.
    const handAvail = container.parentElement
      ? container.parentElement.clientWidth - 24 - 10 - (big ? 30 : 0) : 0;
    const overlap   = _overlapFor(cardsArr.length, handAvail, cwid);

    cardsArr.forEach((card, idx) => {
      const cardDiv = createCardDiv(card, false, big);
      if (hideCards) cardDiv.classList.add('face-down');
      cardDiv.style.position   = 'relative';
      cardDiv.style.width      = `${cwid}px`;
      cardDiv.style.height     = `${chgt}px`;
      cardDiv.style.marginLeft = idx === 0 ? '0px' : `-${overlap}px`;
      cardDiv.style.zIndex     = cardsArr.length - idx;

      if (big) {
        // Hold the hand like a real fan: cards pivot about their bottom edge,
        // the middle card sits highest and the outer cards dip and tilt.
        const n    = cardsArr.length;
        const half = (n - 1) / 2;
        const t    = half ? (idx - half) / half : 0;          // -1 .. +1 across the hand
        const maxA = Math.min(FAN_MAX_DEG, 1.2 * n);
        cardDiv.style.transformOrigin = '50% 100%';
        cardDiv.style.transform = `translateY(${FAN_TOP + t * t * maxA * 0.9}px) rotate(${t * maxA}deg)`;
      }

      if (draggable || (areaType === 'hand' && _isViewer(playerIndex))) {
        cardDiv.draggable = true;
        cardDiv.addEventListener('dragstart', e => {
          // Live check — draggability is confirmed at drag time against
          // gameState, not captured at render time.
          if (getState().currentTurnIdx !== playerIndex && !_isViewer(playerIndex)) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', JSON.stringify({
            card,
            from:        areaType,
            playerIndex,
            originIdx:   idx,
            cardId:      card._id,
          }));
          const crt = cardDiv.cloneNode(true);
          crt.style.position = 'absolute'; crt.style.top = '-1000px'; crt.style.left = '-1000px'; crt.style.marginLeft = '0px'; crt.style.transform = 'none';
          document.body.appendChild(crt);
          e.dataTransfer.setDragImage(crt, 20, 20);
          setTimeout(() => document.body.removeChild(crt), 0);
        });
        cardDiv.addEventListener('dragend', () => {});
      }

      container.appendChild(cardDiv);
    });

    const width = cwid + Math.max(0, cardsArr.length - 1) * (cwid - overlap);
    container.style.width  = `${Math.ceil(width + 10)}px`;
    container.style.height = `${big ? chgt + FAN_ROOM : chgt}px`;
    container.style.alignItems = big ? 'flex-start' : '';
  }

  // ─── renderAllSubcontractAreas ────────────────────────────────────────────
  // BUG FIX: the original version only rendered the current-turn player's
  // subcontract areas. This meant that when an opponent laid down or a card
  // was played onto another player's contract, it never appeared visually.
  // Now renders ALL players' areas unconditionally.
  //
  // Draggability within subcontract areas is determined live at drag time
  // by checking gameState.currentTurnIdx and laidDownPlayers — not captured
  // as a closure at render time (this was the root cause of the staging freeze).

  function renderAllSubcontractAreas() {
    const { players, subcontractCards, laidDownPlayers, currentTurnIdx } = getState();
    _syncBackVars();

    players.forEach((player, playerIdx) => {
      const subAreas = getSubcontractSubAreas(playerIdx);
      if (!subAreas.length) return;

      const cards       = subcontractCards[player] || [];
      const isActive    = playerIdx === currentTurnIdx;
      const hasLaid     = laidDownPlayers.has(playerIdx);
      // A computer's staged cards show only their backs until it lays down.
      const hideStaged  = _hiddenFromYou(playerIdx) && !hasLaid;
      const rowStep     = _rowFitStep(subAreas, cards, CARD_WIDTH);

      subAreas.forEach((sub, areaIdx) => {
        // Preserve the label child (first child), remove everything else.
        while (sub.childNodes.length > 1) sub.removeChild(sub.lastChild);

        const container = document.createElement('div');
        container.style.position    = 'relative';
        // Staging areas use the normal card size for every player, human or AI.
        const sw = CARD_WIDTH;
        const sh = CARD_HEIGHT;
        container.style.height      = `${sh}px`;
        container.style.display     = 'inline-flex';
        sub.appendChild(container);

        const cardsForArea = cards.filter(c => c.subArea === areaIdx);

        // Fit the group inside the contract area: available width is the
        // contract's inner width less wrapper/sub-area chrome and the label.
        const contractEl = sub.closest ? sub.closest('.contract-area') : null;
        const labelW     = 0;   // the label now sits below the cards, so it takes no width
        const seatW      = contractEl ? (parseFloat(contractEl.dataset.maxw) || contractEl.clientWidth) : 0;
        const subAvail   = seatW ? seatW - 16 - 14 - 10 - labelW - 8 : 0;
        // Prefer squeezing every group onto ONE row (so the seat does not grow taller and
        // the whole table does not have to shrink); fall back to the old per-group fit.
        const subOverlap = rowStep !== null ? sw - rowStep : _overlapFor(cardsForArea.length, subAvail, sw);

        // Colour the subarea background to indicate validity.
        // (Hidden staging never lights up green: that would reveal a valid group.)
        const areaIsValid = !hideStaged && _subAreaIsValid(sub, cardsForArea);
        sub.classList.toggle('isValid', areaIsValid);

        cardsForArea.forEach((card, localIdx) => {
          const cardDiv = createCardDiv(card, false);
          if (hideStaged) cardDiv.classList.add('face-down');
          cardDiv.style.position   = 'relative';
          cardDiv.style.width      = `${sw}px`;
          cardDiv.style.height     = `${sh}px`;
          cardDiv.style.marginLeft = localIdx === 0 ? '0px' : `-${subOverlap}px`;
          cardDiv.style.zIndex     = cardsForArea.length - localIdx;

          // Subcontract cards are draggable only for the active player before
          // they have laid down. After lay-down the area is "locked" on the
          // table. Draggability is set live here so it reflects the actual
          // state regardless of when renderAllSubcontractAreas is called.
          const canDrag = (isActive || _isViewer(playerIdx)) && !hasLaid;
          if (canDrag) {
            cardDiv.draggable = true;
            cardDiv.addEventListener('dragstart', e => {
              // Confirm still active at drag time.
              const s = getState();
              if ((s.currentTurnIdx !== playerIdx && !_isViewer(playerIdx)) || s.laidDownPlayers.has(playerIdx)) {
                e.preventDefault();
                return;
              }
              const globalIdx = (s.subcontractCards[player] || []).findIndex(c => c._id === card._id);
              if (globalIdx === -1) { e.preventDefault(); return; }
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', JSON.stringify({
                card,
                from:        'subcontract',
                playerIndex: playerIdx,
                originIdx:   globalIdx,
                subArea:     areaIdx,
                cardId:      card._id,
              }));
              const crt = cardDiv.cloneNode(true);
              crt.style.position = 'absolute'; crt.style.top = '-1000px'; crt.style.left = '-1000px'; crt.style.marginLeft = '0px'; crt.style.transform = 'none';
              document.body.appendChild(crt);
              e.dataTransfer.setDragImage(crt, 20, 20);
              setTimeout(() => document.body.removeChild(crt), 0);
            });
          }

          container.appendChild(cardDiv);
        });
      });
    });
  }

  // ─── validateLayDown ──────────────────────────────────────────────────────
  // Colours subcontract sub-areas green/neutral and enables/disables the
  // Lay Down button based on whether all required contract groups are valid.
  // Reads state live — safe to call from any context.

  function validateLayDown(playerIdx) {
    const { players, subcontractCards, laidDownPlayers, roundIndex } = getState();
    if (laidDownPlayers.has(playerIdx)) return; // Already laid down.

    const btn = document.querySelector(`#player-${playerIdx} .lay-down-btn`);
    if (!btn) return;

    const subAreas   = getSubcontractSubAreas(playerIdx);
    const cards      = subcontractCards[players[playerIdx]] || [];
    const required   = window.gameState.ROUND_REQUIREMENTS[roundIndex];
    if (!required) return;

    let setsOk = 0, runsOk = 0;

    subAreas.forEach((sub, areaIdx) => {
      const label      = (sub.dataset.label || '').toLowerCase();
      const areaCards  = cards.filter(c => c.subArea === areaIdx);
      const valid      = _subAreaIsValid(sub, areaCards);
      sub.classList.toggle('isValid', valid && !_hiddenFromYou(playerIdx));
      if (valid) {
        if (label.includes('set')) setsOk++;
        if (label.includes('run')) runsOk++;
      }
    });

    // The areas still show green off-turn (staging is allowed any time), but you can
    // only lay down on your own turn.
    // ...and a card must stay in hand (it is discarded, or played after laying down), so
    // with every card staged the player has to unstage one first.
    const allComplete = setsOk >= required.sets && runsOk >= required.runs &&
                        getState().currentTurnIdx === playerIdx &&
                        (getState().hands[players[playerIdx]] || []).length > 0;
    btn.disabled    = !allComplete;
    btn.style.backgroundColor = allComplete ? '#2ecc71' : '';
    btn.style.cursor          = allComplete ? 'pointer' : 'not-allowed';
  }

  // ─── renderDiscardPile ────────────────────────────────────────────────────

  function renderDiscardPile() {
    const discardPileDiv = document.getElementById('discardPile');
    if (!discardPileDiv) return;
    discardPileDiv.innerHTML = '';

    const { discardPile } = getState();
    if (!discardPile.length) {
      discardPileDiv.textContent = 'Discard';
      return;
    }

    const topCard = discardPile[discardPile.length - 1];
    discardPileDiv.appendChild(createCardDiv(topCard, true));
    updateDiscardPlayableIndicator();
  }

  // ─── updateDiscardPlayableIndicator ──────────────────────────────────────
  // Deliberately a no-op now: the game no longer tells the player that the top
  // discard is playable (spotting it is part of the game). Kept so existing
  // call-sites keep working; it only clears a stale highlight.

  function updateDiscardPlayableIndicator() {
    const discardPileDiv = document.getElementById('discardPile');
    if (!discardPileDiv) return;
    discardPileDiv.classList.remove('playable-discard');
    discardPileDiv.title = 'Discard pile';
  }

  // ─── createCardBackDiv ────────────────────────────────────────────────────
  // Used by setup.html's card customisation preview — no game state needed.

  function createCardBackDiv(width, height, backColors, radialStops) {
    const div = document.createElement('div');
    div.style.width        = `${width}px`;
    div.style.height       = `${height}px`;
    div.style.borderRadius = '12px';
    div.style.boxShadow    = '0 0 10px rgba(0,0,0,0.6)';
    div.style.border       = `3px solid ${backColors?.outline || '#ffffff'}`;

    const stops = radialStops || [
      backColors?.center || '#000000',
      backColors?.edge1  || '#333333',
      backColors?.edge2  || '#666666',
      backColors?.edge3  || '#999999',
    ];
    div.style.background = `radial-gradient(circle, ${stops.join(', ')})`;
    return div;
  }

  // ─── getSubcontractSubAreas ───────────────────────────────────────────────
  // DOM helper used by validator.js, aiEngine.js, and roundManager.js.
  // Exposed both on window and on the cardRenderer export so each consumer
  // can call it without caring which module owns it.

  function getSubcontractSubAreas(playerIndex) {
    const contractDiv = document.getElementById(`contract-${playerIndex}`);
    if (!contractDiv) return [];
    return Array.from(contractDiv.querySelectorAll('.contract-subarea'));
  }

  // ─── Internal helper ──────────────────────────────────────────────────────

  function _subAreaIsValid(sub, areaCards) {
    if (!areaCards.length) return false;
    const label = (sub.dataset.label || '').toLowerCase();
    if (label.includes('set')) return isValidSet(areaCards);
    if (label.includes('run')) return isValidRun(areaCards);
    return false;
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  window.cardRenderer = {
    createCardDiv,
    renderCardArray,
    renderAllSubcontractAreas,
    validateLayDown,
    renderDiscardPile,
    updateDiscardPlayableIndicator,
    createCardBackDiv,
    getSubcontractSubAreas,
  };

  // Back-compat aliases — old code calling window.cardManager.* or
  // window.createCardDiv still works during migration.
  window.createCardDiv              = createCardDiv;
  window.getSubcontractSubAreas     = getSubcontractSubAreas;
  window.updateDiscardPlayableIndicator = updateDiscardPlayableIndicator;
  window.validateLayDown            = validateLayDown;

  // cardManager shim so existing call-sites like
  // cardManager.renderCardArray(...) keep working.
  window.cardManager = window.cardManager || {};
  Object.assign(window.cardManager, {
    renderCardArray,
    renderAllSubcontractAreas,
    renderDiscardPile,
    validateLayDown,
    updateDiscardPlayableIndicator,
    createCardDiv,
  });
})();
