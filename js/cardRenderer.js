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

  function createCardDiv(card, scaleDiscard = false) {
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
      const dw  = discardPileDiv?.clientWidth  || 120;
      const dh  = discardPileDiv?.clientHeight || 160;
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

    const factor = scaleDiscard ? 0.65 : 0.28;

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

    cardsArr.forEach((card, idx) => {
      const cardDiv = createCardDiv(card, false);
      cardDiv.style.position   = 'relative';
      cardDiv.style.width      = `${CARD_WIDTH}px`;
      cardDiv.style.height     = `${CARD_HEIGHT}px`;
      cardDiv.style.marginLeft = idx === 0 ? '0px' : `-${CARD_OVERLAP}px`;
      cardDiv.style.zIndex     = cardsArr.length - idx;

      if (draggable) {
        cardDiv.draggable = true;
        cardDiv.addEventListener('dragstart', e => {
          // Live check — draggability is confirmed at drag time against
          // gameState, not captured at render time.
          if (getState().currentTurnIdx !== playerIndex) {
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
          crt.style.cssText = 'position:absolute;top:-1000px;left:-1000px;';
          document.body.appendChild(crt);
          e.dataTransfer.setDragImage(crt, 20, 20);
          setTimeout(() => document.body.removeChild(crt), 0);
        });
        cardDiv.addEventListener('dragend', () => {});
      }

      container.appendChild(cardDiv);
    });

    const width = CARD_WIDTH + Math.max(0, cardsArr.length - 1) * (CARD_WIDTH - CARD_OVERLAP);
    container.style.width  = `${Math.ceil(width + 10)}px`;
    container.style.height = `${CARD_HEIGHT}px`;
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

    players.forEach((player, playerIdx) => {
      const subAreas = getSubcontractSubAreas(playerIdx);
      if (!subAreas.length) return;

      const cards       = subcontractCards[player] || [];
      const isActive    = playerIdx === currentTurnIdx;
      const hasLaid     = laidDownPlayers.has(playerIdx);

      subAreas.forEach((sub, areaIdx) => {
        // Preserve the label child (first child), remove everything else.
        while (sub.childNodes.length > 1) sub.removeChild(sub.lastChild);

        const container = document.createElement('div');
        container.style.position    = 'relative';
        container.style.height      = `${CARD_HEIGHT}px`;
        container.style.display     = 'inline-flex';
        sub.appendChild(container);

        const cardsForArea = cards.filter(c => c.subArea === areaIdx);

        // Colour the subarea background to indicate validity.
        const areaIsValid = _subAreaIsValid(sub, cardsForArea);
        sub.classList.toggle('isValid', areaIsValid);

        cardsForArea.forEach((card, localIdx) => {
          const cardDiv = createCardDiv(card, false);
          cardDiv.style.position   = 'relative';
          cardDiv.style.width      = `${CARD_WIDTH}px`;
          cardDiv.style.height     = `${CARD_HEIGHT}px`;
          cardDiv.style.marginLeft = localIdx === 0 ? '0px' : `-${CARD_OVERLAP}px`;
          cardDiv.style.zIndex     = cardsForArea.length - localIdx;

          // Subcontract cards are draggable only for the active player before
          // they have laid down. After lay-down the area is "locked" on the
          // table. Draggability is set live here so it reflects the actual
          // state regardless of when renderAllSubcontractAreas is called.
          const canDrag = isActive && !hasLaid;
          if (canDrag) {
            cardDiv.draggable = true;
            cardDiv.addEventListener('dragstart', e => {
              // Confirm still active at drag time.
              const s = getState();
              if (s.currentTurnIdx !== playerIdx || s.laidDownPlayers.has(playerIdx)) {
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
              crt.style.cssText = 'position:absolute;top:-1000px;left:-1000px;';
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
      sub.classList.toggle('isValid', valid);
      if (valid) {
        if (label.includes('set')) setsOk++;
        if (label.includes('run')) runsOk++;
      }
    });

    const allComplete = setsOk >= required.sets && runsOk >= required.runs;
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
  // Adds/removes the green-pulse class on the discard pile to signal the
  // active player that the top card can extend one of their contracts.
  // Now uses gameState and validator instead of DOM class checks.

  function updateDiscardPlayableIndicator() {
    const discardPileDiv = document.getElementById('discardPile');
    if (!discardPileDiv) return;
    discardPileDiv.classList.remove('playable-discard');

    const { currentTurnIdx, discardPile, laidDownPlayers, hasDrawn } = getState();
    if (currentTurnIdx === -1 || !hasDrawn) return;
    if (!discardPile.length) return;

    const topCard   = discardPile[discardPile.length - 1];
    const hasLaid   = laidDownPlayers.has(currentTurnIdx);
    let   isPlayable = false;

    if (hasLaid) {
      isPlayable = !!window.validator.canPlayOnExistingContracts(topCard, currentTurnIdx);
    } else {
      isPlayable = !!window.validator.hasCompleteStagedContracts(currentTurnIdx) &&
                   (!!window.validator.canExtendStagedSet(topCard, currentTurnIdx) ||
                    !!window.validator.canExtendStagedRun(topCard, currentTurnIdx));
    }

    if (isPlayable) {
      discardPileDiv.classList.add('playable-discard');
      discardPileDiv.title = 'Click to draw — extends your contracts!';
    } else {
      discardPileDiv.title = 'Discard pile';
    }
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
