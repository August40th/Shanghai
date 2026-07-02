// dragDrop.js
// All drag-and-drop event handlers plus the discard pile click handler.
//
// KEY ARCHITECTURAL FIX:
// All state reads happen LIVE inside event handlers (e.g. ondrop) rather than
// being captured as closure variables at setupDragDrop() call time.
// Previously `myHasLaidDown` was captured once at setup and baked into every
// handler — after a lay-down it was always true, permanently blocking all
// subcontract and hand↔subcontract drops (the staging freeze).
//
// CARD IDENTITY FIX:
// Cards are located by `card._id` (stamped by gameState.stampCards) rather
// than by rank+suit string. This correctly handles duplicate cards in
// multi-deck games where two identical cards would previously both be removed.
//
// Depends on:  gameState.js  validator.js  cardRenderer.js  scoring.js
// Called by:   roundManager.js  (setupDragDrop exposed on window)

(() => {
  const { getState, setState } = window.gameState;

  // ─── Placeholder (drop position indicator) ───────────────────────────────

  function _showPlaceholder(container, clientX) {
    const old = container.querySelector('.placeholder');
    if (old) old.remove();
    const ph = document.createElement('div');
    ph.className = 'placeholder';
    ph.style.cssText = `position:relative;width:${window.gameState.CARD_WIDTH}px;height:${window.gameState.CARD_HEIGHT}px;margin-left:-${Math.floor(window.gameState.CARD_WIDTH / 2)}px;border:2px dashed #aaa;box-sizing:border-box;`;
    const idx   = _getInsertIndex(container, clientX);
    const cards = container.querySelectorAll('.card');
    if (idx >= cards.length) container.appendChild(ph);
    else container.insertBefore(ph, cards[idx]);
  }

  function _getInsertIndex(container, clientX) {
    const cards = [...container.querySelectorAll('.card')];
    if (!cards.length) return 0;
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return i;
    }
    return cards.length;
  }

  // ─── Wild swap helpers ────────────────────────────────────────────────────

  const _wildSwaps = new Map(); // playerName → [{subArea, globalWildIdx, wildCard, swapCard}]

  function _getWildSwapSetting() {
    try {
      const row = document.cookie.split('; ').find(r => r.startsWith('customRules='));
      if (!row) return 'off';
      const cr = JSON.parse(decodeURIComponent(row.split('=').slice(1).join('=')));
      return (cr.wildSwap || 'off').toLowerCase();
    } catch { return 'off'; }
  }

  // myPlayer  = active player (whose hand card is played)
  // areaOwner = player who owns the subcontract area (may differ on cross-player plays)
  function _tryWildSwap(data, subAreaCards, subAreaIdx, sub, myPlayer, areaOwner) {
    const { isWild } = window.validator;
    const wildIndices = subAreaCards
      .map((c, i) => (isWild(c) ? i : -1))
      .filter(i => i !== -1);
    if (!wildIndices.length) return false;

    const label    = (sub.dataset.label || '').toLowerCase();
    const state    = getState();
    const flatSubs = [...(state.subcontractCards[areaOwner] || [])];

    for (const wildIdx of wildIndices) {
      const candidate = subAreaCards.slice();
      candidate[wildIdx] = data.card;
      const valid =
        (label.includes('set') && window.validator.isValidSet(candidate)) ||
        (label.includes('run') && window.validator.isValidRun(candidate));
      if (!valid) continue;

      // Find the global index of this wild card in flatSubs.
      let countInArea = -1, globalWildIdx = -1;
      for (let i = 0; i < flatSubs.length; i++) {
        if (flatSubs[i].subArea === subAreaIdx) countInArea++;
        if (countInArea === wildIdx) { globalWildIdx = i; break; }
      }
      if (globalWildIdx === -1) return false;

      const wildCard = flatSubs[globalWildIdx];

      // Mutate copies — never mutate arrays in place.
      const newSubs  = { ...state.subcontractCards };
      const newFlat  = [...flatSubs];
      newFlat.splice(globalWildIdx, 1, { ...data.card, subArea: subAreaIdx });
      newSubs[areaOwner] = newFlat;

      const newHands = { ...state.hands };
      const newHand  = [...(state.hands[myPlayer] || [])];
      // Remove the played card by _id.
      const playedIdx = newHand.findIndex(c => c._id === data.card._id);
      if (playedIdx !== -1) newHand.splice(playedIdx, 1);
      newHand.push(wildCard);
      newHands[myPlayer] = newHand;

      setState({ hands: newHands, subcontractCards: newSubs });

      // Track swap for potential cancellation. Store areaOwner so we can
      // restore the correct player's subcontract on cancel.
      const swaps = _wildSwaps.get(myPlayer) || [];
      swaps.push({ subArea: subAreaIdx, globalWildIdx, wildCard, swapCard: data.card, areaOwner });
      _wildSwaps.set(myPlayer, swaps);

      return true;
    }
    return false;
  }

  function _cancelWildSwaps() {
    const { currentTurnIdx, players, laidDownPlayers } = getState();
    if (currentTurnIdx === -1) return;
    const myPlayer = players[currentTurnIdx];
    const swaps    = _wildSwaps.get(myPlayer);
    if (!swaps || !swaps.length) return;
    if (laidDownPlayers.has(currentTurnIdx)) return;

    const state    = getState();
    const newSubs  = { ...state.subcontractCards };
    const newHands = { ...state.hands };
    const newHand  = [...(state.hands[myPlayer] || [])];

    swaps.forEach(({ subArea, globalWildIdx, wildCard, swapCard, areaOwner }) => {
      // Restore the wild card into the owner's subcontract area.
      const ownerFlat = [...(newSubs[areaOwner] || [])];
      ownerFlat[globalWildIdx] = wildCard;
      newSubs[areaOwner] = ownerFlat;
      // Return the swapped card back to the active player's hand.
      const swapCardIdx = newHand.findIndex(c => c._id === swapCard._id);
      if (swapCardIdx !== -1) newHand.splice(swapCardIdx, 1);
      newHand.push(swapCard);
    });

    newHands[myPlayer] = newHand;
    setState({ hands: newHands, subcontractCards: newSubs });
    _wildSwaps.delete(myPlayer);

    _reRender();
  }

  function _confirmWildSwaps() {
    const { currentTurnIdx, players } = getState();
    if (currentTurnIdx === -1) return;
    _wildSwaps.delete(players[currentTurnIdx]);
  }

  // ─── Shared re-render helper ──────────────────────────────────────────────

  function _reRender() {
    const { players, hands, currentTurnIdx } = getState();
    players.forEach((p, i) => {
      const handDiv = document.getElementById(`hand-${i}`);
      if (!handDiv) return;
      window.cardRenderer.renderCardArray(hands[p], handDiv, i === currentTurnIdx, i, 'hand');
    });
    window.cardRenderer.renderAllSubcontractAreas();
    window.cardRenderer.renderDiscardPile();
  }

  // ─── Main setup ───────────────────────────────────────────────────────────
  // Called after every state change that might affect what's draggable.
  // Clears all existing handlers first, then re-wires only what's valid for
  // the current turn.

  function setupDragDrop() {
    const { players, currentTurnIdx } = getState();

    // Clear all previous handlers on every player's hand and subcontract areas.
    players.forEach((_, i) => {
      const handDiv = document.getElementById(`hand-${i}`);
      if (handDiv) {
        handDiv.ondragover = handDiv.ondrop =
        handDiv.ondragenter = handDiv.ondragleave = null;
      }
      window.getSubcontractSubAreas(i).forEach(sub => {
        sub.ondragover = sub.ondrop =
        sub.ondragenter = sub.ondragleave = null;
      });
    });

    if (currentTurnIdx === -1) return;

    const discardPileDiv = document.getElementById('discardPile');
    _wireHandDrop(currentTurnIdx);
    _wireOwnSubcontractDrop(currentTurnIdx);
    _wireLaidDownContractDrops(currentTurnIdx);
    _wireDiscardDrop(currentTurnIdx, discardPileDiv);
    _wireDiscardClick(currentTurnIdx, discardPileDiv);
    window.cardRenderer.updateDiscardPlayableIndicator();
  }

  // ─── Hand drop target ─────────────────────────────────────────────────────
  // Accepts: hand→hand (reorder), subcontract→hand (move back, pre-laydown only)

  function _wireHandDrop(myTurnIdx) {
    const myHandDiv = document.getElementById(`hand-${myTurnIdx}`);
    if (!myHandDiv) return;

    myHandDiv.ondragover = e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      myHandDiv.classList.add('drop-target');
      _showPlaceholder(myHandDiv, e.clientX);
    };
    myHandDiv.ondragleave = () => {
      myHandDiv.classList.remove('drop-target');
      const ph = myHandDiv.querySelector('.placeholder');
      if (ph) ph.remove();
    };
    myHandDiv.ondrop = e => {
      e.preventDefault();
      myHandDiv.classList.remove('drop-target');
      const ph = myHandDiv.querySelector('.placeholder');
      if (ph) ph.remove();

      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data.card || data.playerIndex !== myTurnIdx) return;

      // Live reads — no stale closures.
      const state     = getState();
      const myPlayer  = state.players[myTurnIdx];
      const hasLaid   = state.laidDownPlayers.has(myTurnIdx);
      const insertIdx = _getInsertIndex(myHandDiv, e.clientX);

      const newHands = { ...state.hands };
      const newSubs  = { ...state.subcontractCards };

      if (data.from === 'hand') {
        const hand = [...(newHands[myPlayer] || [])];
        const cardIdx = hand.findIndex(c => c._id === data.card._id);
        if (cardIdx === -1) return;
        hand.splice(cardIdx, 1);
        hand.splice(insertIdx > cardIdx ? insertIdx - 1 : insertIdx, 0, data.card);
        newHands[myPlayer] = hand;

      } else if (data.from === 'subcontract') {
        // Cannot move back from subcontract once laid down.
        if (hasLaid) return;
        const flat     = [...(newSubs[myPlayer] || [])];
        const flatIdx  = flat.findIndex(c => c._id === data.card._id);
        if (flatIdx === -1) return;
        flat.splice(flatIdx, 1);
        newSubs[myPlayer] = flat;
        const hand = [...(newHands[myPlayer] || [])];
        const cardToInsert = { ...data.card };
        delete cardToInsert.subArea;
        hand.splice(insertIdx, 0, cardToInsert);
        newHands[myPlayer] = hand;

      } else return;

      setState({ hands: newHands, subcontractCards: newSubs });
      _reRender();
      window.validateLayDown(myTurnIdx);
    };
  }

  // ─── Own subcontract drop target (pre-laydown staging) ───────────────────
  // Accepts: hand→subcontract, subcontract→subcontract (reorder/move between areas)
  // Blocked after lay-down.

  function _wireOwnSubcontractDrop(myTurnIdx) {
    const subAreas = window.getSubcontractSubAreas(myTurnIdx);
    const myHandDiv = document.getElementById(`hand-${myTurnIdx}`);

    subAreas.forEach((sub, targetAreaIdx) => {
      sub.ondragover = e => {
        // Live check — block if already laid down.
        if (getState().laidDownPlayers.has(myTurnIdx)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        sub.classList.add('drop-target');
      };
      sub.ondragleave = () => sub.classList.remove('drop-target');
      sub.ondrop = e => {
        e.preventDefault();
        sub.classList.remove('drop-target');

        // ── Live state read ──────────────────────────────────────────────
        const state    = getState();
        const myPlayer = state.players[myTurnIdx];
        const hasLaid  = state.laidDownPlayers.has(myTurnIdx);

        // Hard block after lay-down — the area is on the table.
        if (hasLaid) return;

        const raw = e.dataTransfer.getData('text/plain');
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data.card || data.playerIndex !== myTurnIdx) return;

        const newHands = { ...state.hands };
        const newSubs  = { ...state.subcontractCards };
        const flat     = [...(newSubs[myPlayer] || [])];

        // Calculate insertion position within this area.
        const container      = sub.lastChild;
        const insertInArea   = container ? _getInsertIndex(container, e.clientX) : 0;
        const globalInsertIdx = _globalInsertIdxForArea(flat, targetAreaIdx, insertInArea);

        if (data.from === 'hand') {
          const hand    = [...(newHands[myPlayer] || [])];
          const cardIdx = hand.findIndex(c => c._id === data.card._id);
          if (cardIdx === -1) return;
          hand.splice(cardIdx, 1);
          newHands[myPlayer] = hand;
          const cardToStage = { ...data.card, subArea: targetAreaIdx };
          flat.splice(globalInsertIdx, 0, cardToStage);

        } else if (data.from === 'subcontract') {
          const flatIdx = flat.findIndex(c => c._id === data.card._id);
          if (flatIdx === -1) return;
          flat.splice(flatIdx, 1);
          const adjusted = flatIdx < globalInsertIdx ? globalInsertIdx - 1 : globalInsertIdx;
          flat.splice(adjusted, 0, { ...data.card, subArea: targetAreaIdx });

        } else return;

        newSubs[myPlayer] = flat;
        setState({ hands: newHands, subcontractCards: newSubs });

        // Re-render hand and subcontracts.
        if (myHandDiv) {
          window.cardRenderer.renderCardArray(
            getState().hands[myPlayer], myHandDiv, true, myTurnIdx, 'hand'
          );
        }
        window.cardRenderer.renderAllSubcontractAreas();
        window.validateLayDown(myTurnIdx);
      };
    });
  }

  // ─── Laid-down contract drop targets (post-laydown plays) ─────────────────
  // Any player's laid-down area accepts cards from the active player's hand,
  // provided the play is valid (extends the set/run or wild-swaps).
  // The active player must have laid down themselves first.

  function _wireLaidDownContractDrops(myTurnIdx) {
    const state    = getState();
    const myPlayer = state.players[myTurnIdx];
    const myHandDiv = document.getElementById(`hand-${myTurnIdx}`);
    const wildSwapSetting = _getWildSwapSetting();

    state.players.forEach((owner, playerIdx) => {
      if (!state.laidDownPlayers.has(playerIdx)) return;

      const subAreas = window.getSubcontractSubAreas(playerIdx);
      subAreas.forEach((sub, subAreaIdx) => {
        sub.ondragover = e => {
          // Active player must have laid down to play on any contract.
          if (!getState().laidDownPlayers.has(myTurnIdx)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          sub.classList.add('drop-target');
        };
        sub.ondragleave = () => sub.classList.remove('drop-target');
        sub.ondrop = e => {
          e.preventDefault();
          sub.classList.remove('drop-target');

          // ── Live state reads ─────────────────────────────────────────
          const st        = getState();
          const hasLaid   = st.laidDownPlayers.has(myTurnIdx);
          if (!hasLaid) return;

          const raw = e.dataTransfer.getData('text/plain');
          if (!raw) return;
          const data = JSON.parse(raw);
          if (!data.card || data.from !== 'hand' || data.playerIndex !== myTurnIdx) return;

          const flatOwner  = [...(st.subcontractCards[owner] || [])];
          const subAreaCards = flatOwner.filter(c => c.subArea === subAreaIdx);
          const label        = (sub.dataset.label || '').toLowerCase();

          // ── Wild swap attempt ────────────────────────────────────────
          const allowWildSwap =
            wildSwapSetting === 'post' ||
            (wildSwapSetting === 'pre' && !st.laidDownPlayers.has(myTurnIdx));

          if (allowWildSwap && window.validator.isWild) {
            if (_tryWildSwap(data, subAreaCards, subAreaIdx, sub, myPlayer, owner)) {
              _reRender();
              window.validateLayDown(myTurnIdx);
              window.scoring.updatePlayerStats(getState().hands);
              return;
            }
          }

          // ── Normal play ──────────────────────────────────────────────
          // Cannot play on own un-laid-down contract from another player's
          // area if the active player has not laid down.
          // (Already guarded above — hasLaid must be true to reach here.)

          const container    = sub.lastChild;
          const insertInArea = container ? _getInsertIndex(container, e.clientX) : subAreaCards.length;
          const simulated    = [...subAreaCards];
          simulated.splice(insertInArea, 0, { ...data.card, subArea: subAreaIdx });

          const valid =
            (label.includes('set') && window.validator.isValidSet(simulated)) ||
            (label.includes('run') && window.validator.isValidRun(simulated));

          if (!valid) {
            sub.style.outline = '2px solid red';
            setTimeout(() => { sub.style.outline = ''; }, 800);
            return;
          }

          // Commit: remove from hand, add to target sub-area.
          const newHands = { ...st.hands };
          const newHand  = [...(newHands[myPlayer] || [])];
          const cardIdx  = newHand.findIndex(c => c._id === data.card._id);
          if (cardIdx === -1) return;
          newHand.splice(cardIdx, 1);
          newHands[myPlayer] = newHand;

          const newSubs    = { ...st.subcontractCards };
          const newFlat    = [...(newSubs[owner] || [])];
          const globalInsertIdx = _globalInsertIdxForArea(newFlat, subAreaIdx, insertInArea);
          newFlat.splice(globalInsertIdx, 0, { ...data.card, subArea: subAreaIdx });
          newSubs[owner] = newFlat;

          setState({ hands: newHands, subcontractCards: newSubs });

          // Check if this was the final card (player goes out by playing, not discarding).
          const remaining = getState().hands[myPlayer].length;
          if (myHandDiv) {
            window.cardRenderer.renderCardArray(
              getState().hands[myPlayer], myHandDiv, true, myTurnIdx, 'hand'
            );
          }
          window.cardRenderer.renderAllSubcontractAreas();
          window.validateLayDown(myTurnIdx);
          window.scoring.updatePlayerStats(getState().hands);

          if (remaining === 0) {
            window.scoring.endRound(myPlayer);
          }
        };
      });
    });
  }

  // ─── Discard pile drop (human discard) ────────────────────────────────────

  function _wireDiscardDrop(myTurnIdx, discardPileDiv) {
    if (!discardPileDiv) return;
    const myHandDiv = document.getElementById(`hand-${myTurnIdx}`);

    discardPileDiv.ondragover = e => {
      if (!getState().hasDrawn) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      discardPileDiv.classList.add('drop-target');
    };
    discardPileDiv.ondragleave = () => discardPileDiv.classList.remove('drop-target');
    discardPileDiv.ondrop = e => {
      e.preventDefault();
      discardPileDiv.classList.remove('drop-target');

      // ── Live state reads ─────────────────────────────────────────────
      const state    = getState();
      if (!state.hasDrawn) return;

      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data.card || data.playerIndex !== myTurnIdx) return;

      const myPlayer = state.players[myTurnIdx];
      const newHands = { ...state.hands };
      const newSubs  = { ...state.subcontractCards };
      let card;

      if (data.from === 'hand') {
        const hand    = [...(newHands[myPlayer] || [])];
        const cardIdx = hand.findIndex(c => c._id === data.card._id);
        if (cardIdx === -1) return;
        card = hand.splice(cardIdx, 1)[0];
        newHands[myPlayer] = hand;

      } else if (data.from === 'subcontract') {
        // Cannot discard from subcontract after lay-down.
        if (state.laidDownPlayers.has(myTurnIdx)) return;
        const flat    = [...(newSubs[myPlayer] || [])];
        const flatIdx = flat.findIndex(c => c._id === data.card._id);
        if (flatIdx === -1) return;
        card = flat.splice(flatIdx, 1)[0];
        delete card.subArea;
        newSubs[myPlayer] = flat;

      } else return;

      // BUG FIX #4: Clear hardWindow if this HasLaidDown player still has
      // cards remaining — they did not go out the same turn they laid down.
      window.scoring.clearHardWindowIfNeeded(myTurnIdx);

      // Push to discard pile.
      const newDiscard = [...state.discardPile, card];
      setState({ hands: newHands, subcontractCards: newSubs, discardPile: newDiscard });

      _confirmWildSwaps();

      // Re-render.
      if (myHandDiv) {
        window.cardRenderer.renderCardArray(
          getState().hands[myPlayer], myHandDiv, true, myTurnIdx, 'hand'
        );
      }
      window.cardRenderer.renderAllSubcontractAreas();
      window.cardRenderer.renderDiscardPile();

      // Count total cards the same way updatePlayerStats does:
      // hand + subcontract for non-laid-down players; hand only after lay-down.
      const freshState  = getState();
      const hasLaidDown = freshState.laidDownPlayers.has(myTurnIdx);
      const totalCards  = hasLaidDown
        ? (freshState.hands[myPlayer] || []).length
        : (freshState.hands[myPlayer] || []).length +
          (freshState.subcontractCards[myPlayer] || []).length;

      const roundEnded = window.scoring.updatePlayerStats(freshState.hands);

      // Only advance turn if the player still has cards — otherwise endRound
      // was already triggered inside updatePlayerStats.
      if (totalCards === 0 || roundEnded || getState().roundFinished) return;

      // Advance turn.
      const nextIdx = (myTurnIdx + 1) % freshState.players.length;
      window.resetTurnState(nextIdx);
    };
  }

  // ─── Discard pile click (draw from discard) ───────────────────────────────
  // Pre-draw: takes the discard as the draw card for this turn.
  // Post-draw (HasDrawn): only allowed if the card can extend a contract.

  function _wireDiscardClick(myTurnIdx, discardPileDiv) {
    if (!discardPileDiv) return;

    discardPileDiv.onclick = e => {
      if (e.defaultPrevented) return;
      const state    = getState();
      const hasLaid  = state.laidDownPlayers.has(myTurnIdx);
      const { discardPile, hasDrawn } = state;

      if (!hasDrawn) {
        // Normal pre-draw take.
        window.drawCardFrom('discard', myTurnIdx);
        return;
      }

      // Post-draw: only allow if the top card can extend a contract.
      if (!discardPile.length) return;
      const topCard = discardPile[discardPile.length - 1];

      if (hasLaid) {
        if (window.validator.canPlayOnExistingContracts(topCard, myTurnIdx)) {
          window.drawCardFrom('discard', myTurnIdx);
        }
      } else {
        if (
          window.validator.hasCompleteStagedContracts(myTurnIdx) &&
          (window.validator.canExtendStagedSet(topCard, myTurnIdx) ||
           window.validator.canExtendStagedRun(topCard, myTurnIdx))
        ) {
          window.drawCardFrom('discard', myTurnIdx);
        }
      }
    };
  }

  // ─── AI discard path ──────────────────────────────────────────────────────
  // Called by aiEngine._aiDiscard so all downstream effects fire identically
  // to a human discard (buy clock, round-end detection, hard window clearing).

  function aiDiscard(card, playerIdx) {
    const state    = getState();
    const myPlayer = state.players[playerIdx];
    const newHands = { ...state.hands };
    const hand     = [...(newHands[myPlayer] || [])];
    const cardIdx  = hand.findIndex(c => c._id === card._id);
    if (cardIdx === -1) {
      console.warn(`aiDiscard: card ${card.rank}${card.suit} not found in hand`);
      return;
    }
    const discarded = hand.splice(cardIdx, 1)[0];
    newHands[myPlayer] = hand;

    // BUG FIX #4: clear hardWindow if AI still has cards.
    window.scoring.clearHardWindowIfNeeded(playerIdx);

    const newDiscard = [...state.discardPile, discarded];
    setState({ hands: newHands, discardPile: newDiscard });

    window.cardRenderer.renderCardArray(hand, document.getElementById(`hand-${playerIdx}`), false, playerIdx, 'hand');
    window.cardRenderer.renderDiscardPile();
    window.scoring.updatePlayerStats(getState().hands);

    if (!getState().roundFinished) {
      const nextIdx = (playerIdx + 1) % state.players.length;
      window.resetTurnState(nextIdx);
    }
  }

  // ─── Global insert index helper ───────────────────────────────────────────
  // Given a flat subcontractCards array, find where to splice a new card at
  // position `insertInArea` within `targetAreaIdx`.

  function _globalInsertIdxForArea(flat, targetAreaIdx, insertInArea) {
    let globalInsertIdx = -1;
    let lastIdx         = -1;
    let countInArea     = 0;

    for (let i = 0; i < flat.length; i++) {
      if (flat[i].subArea === targetAreaIdx) {
        if (countInArea === insertInArea) { globalInsertIdx = i; break; }
        lastIdx = i;
        countInArea++;
      } else if (flat[i].subArea > targetAreaIdx && globalInsertIdx === -1) {
        globalInsertIdx = i;
        break;
      }
    }
    if (globalInsertIdx === -1) globalInsertIdx = lastIdx + 1;
    return globalInsertIdx;
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  window.dragDrop = {
    setupDragDrop,
    cancelWildSwaps: _cancelWildSwaps,
    confirmWildSwaps: _confirmWildSwaps,
    aiDiscard,
  };

  // Back-compat aliases.
  window.setupDragDrop    = setupDragDrop;
  window.aiDiscard        = aiDiscard;
  window.cancelWildSwaps  = _cancelWildSwaps;
  window.confirmWildSwaps = _confirmWildSwaps;

  // Shim cardManager.setupDragDrop so old call-sites keep working.
  window.cardManager = window.cardManager || {};
  window.cardManager.setupDragDrop = setupDragDrop;
})();
