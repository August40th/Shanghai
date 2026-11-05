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
    // Match the size of the cards already in this row (your hand uses larger cards).
    const ref = container.querySelector('.card');
    const phW = ref ? ref.offsetWidth  : window.gameState.CARD_WIDTH;
    const phH = ref ? ref.offsetHeight : window.gameState.CARD_HEIGHT;
    ph.style.cssText = `position:relative;width:${phW}px;height:${phH}px;margin-left:-${Math.floor(phW / 2)}px;border:2px dashed #aaa;box-sizing:border-box;`;
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

  // ─── Wild swap ────────────────────────────────────────────────────────────
  // Rules (from the game's owner):
  //  • A swap = drop a natural card ONTO a specific wild in a laid-down group; the
  //    wild goes to the swapper's hand. Any number of swaps per turn.
  //  • Sets: any card of the set's rank. Runs: only the card the wild stands for
  //    (it takes the wild's own slot - order matters). All-wild groups: the first
  //    natural fixes the rank / suit. (validator.canSwapWild does the matching.)
  //  • Wild Swap "Pre": only players who have NOT laid down may swap.
  //    "Post": everybody may. (validator.swapPolicy)
  //  • A swap made before the player has laid down obliges them to lay down that
  //    turn; otherwise every swap is undone: the Undo Swap button, or automatically
  //    when they discard without having laid down. Laying down makes them permanent.
  const _wildSwaps = new Map(); // playerName → [undo record]

  function _hasPending(playerName) { return (_wildSwaps.get(playerName) || []).length > 0; }

  // Show the Undo Swap button only for the player whose swaps are pending.
  function _syncUndoButton() {
    const { players, currentTurnIdx } = getState();
    document.querySelectorAll('.swap-undo-btn').forEach(btn => {
      const idx = Number((btn.closest('.player')?.id || '').split('-')[1]);
      btn.hidden = !(idx === currentTurnIdx && _hasPending(players[idx]));
    });
  }

  // Perform a swap for player myIdx: `card` (hand or own staged cards) replaces
  // target.wild. target = { playerIdx, areaIdx, wildIdx }. Returns true on success.
  // Used by the human drop handler and by the AI.
  function performWildSwap(myIdx, card, target) {
    const { isWild, canSwapWild, swapPolicy } = window.validator;
    const state = getState();
    if (!swapPolicy(myIdx)) return false;
    const me    = state.players[myIdx];
    const owner = state.players[target.playerIdx];
    if (!state.laidDownPlayers.has(target.playerIdx)) return false;
    const labels   = (window.gameState.CONTRACT_SUB_AREAS || {})[state.roundIndex] || [];
    const ownerFlat = [...(state.subcontractCards[owner] || [])];
    const areaCards = ownerFlat.filter(c => c.subArea === target.areaIdx);
    const wild = areaCards[target.wildIdx];
    if (!wild || !isWild(wild)) return false;

    // Locate the real card: hand first, then (before lay-down) own staged cards.
    const hand = [...(state.hands[me] || [])];
    let real, fromSub = null;
    const hi = hand.findIndex(c => c._id === card._id);
    if (hi !== -1) real = hand[hi];
    const hasLaid = state.laidDownPlayers.has(myIdx);
    const myFlat0 = me === owner ? ownerFlat : [...(state.subcontractCards[me] || [])];
    if (!real && !hasLaid) {
      const si = myFlat0.findIndex(c => c._id === card._id);
      if (si !== -1) { real = myFlat0[si]; fromSub = { idx: si, subArea: real.subArea }; }
    }
    if (!real) return false;
    if (!canSwapWild(areaCards, labels[target.areaIdx], real, target.wildIdx)) return false;

    // Take the real card out of where it was.
    const subs = { ...state.subcontractCards };
    let myFlat = me === owner ? ownerFlat : myFlat0;
    if (fromSub) myFlat.splice(fromSub.idx, 1); else hand.splice(hi, 1);
    // Put it into the wild's own slot (in place - order matters).
    const gi = ownerFlat.findIndex(c => c._id === wild._id);
    if (gi === -1) return false;
    const placed = { ...real, subArea: target.areaIdx };
    ownerFlat[gi] = placed;
    subs[owner] = ownerFlat;
    if (me !== owner) subs[me] = myFlat;
    // The wild goes to the swapper's hand.
    const wildToHand = { ...wild }; delete wildToHand.subArea;
    hand.push(wildToHand);
    setState({ hands: { ...state.hands, [me]: hand }, subcontractCards: subs });

    // Before lay-down the swap is provisional: remember how to undo it.
    if (!hasLaid) {
      const recs = _wildSwaps.get(me) || [];
      recs.push({ owner, areaIdx: target.areaIdx, wildId: wild._id, realId: real._id, fromSub });
      _wildSwaps.set(me, recs);
    }
    window.gameLog?.logWildSwap?.(me, real, wild, owner, labels[target.areaIdx] || `Area ${target.areaIdx}`);
    _syncUndoButton();
    return true;
  }

  // Undo every provisional swap the player made this turn (exactly, in reverse order).
  function _cancelWildSwaps(myIdx, reason) {
    const state = getState();
    if (myIdx === undefined || myIdx === null) myIdx = state.currentTurnIdx;
    if (myIdx < 0) return false;
    const me   = state.players[myIdx];
    const recs = _wildSwaps.get(me);
    if (!recs || !recs.length) return false;
    if (state.laidDownPlayers.has(myIdx)) { _wildSwaps.delete(me); _syncUndoButton(); return false; }

    const subs = { ...state.subcontractCards };
    const hand = [...(state.hands[me] || [])];
    const myFlat = [...(subs[me] || [])];
    let undone = 0;
    for (const r of [...recs].reverse()) {
      // The wild is still in the hand, or the player staged it.
      let wild;
      const wi = hand.findIndex(c => c._id === r.wildId);
      if (wi !== -1) wild = hand.splice(wi, 1)[0];
      else {
        const si = myFlat.findIndex(c => c._id === r.wildId);
        if (si !== -1) wild = myFlat.splice(si, 1)[0];
      }
      const ownerFlat = [...(subs[r.owner] || [])];
      const gi = ownerFlat.findIndex(c => c._id === r.realId);
      if (!wild || gi === -1) {
        console.warn('wild swap undo: could not restore one swap', r);
        if (wild) hand.push(wild);
        continue;
      }
      const real = { ...ownerFlat[gi] };
      ownerFlat[gi] = { ...wild, subArea: r.areaIdx };
      subs[r.owner] = ownerFlat;
      delete real.subArea;
      if (r.fromSub) myFlat.splice(Math.min(r.fromSub.idx, myFlat.length), 0, { ...real, subArea: r.fromSub.subArea });
      else hand.push(real);
      undone++;
    }
    subs[me] = myFlat;
    setState({ hands: { ...state.hands, [me]: hand }, subcontractCards: subs });
    _wildSwaps.delete(me);
    window.gameLog?.logWildSwapUndo?.(me, undone, reason);
    _syncUndoButton();
    _reRender();
    window.validateLayDown?.(myIdx);
    window.scoring?.updatePlayerStats?.(getState().hands);
    return true;
  }

  // Swaps become permanent (the player laid down).
  function _confirmWildSwaps(myIdx) {
    const { players, currentTurnIdx } = getState();
    if (myIdx === undefined || myIdx === null) myIdx = currentTurnIdx;
    if (myIdx < 0) return;
    _wildSwaps.delete(players[myIdx]);
    _syncUndoButton();
  }

  window.addEventListener('playerLaidDown', ev => _confirmWildSwaps(ev.detail?.playerIndex));

  // Highlight the wild under the pointer when the dragged card may replace it.
  let _dragCardId = null, _swapMarked = null;
  function _clearSwapMark() {
    if (_swapMarked) { _swapMarked.classList.remove('swap-target'); _swapMarked = null; }
  }
  document.addEventListener('dragstart', e => {
    const id = e.target?.dataset?.cardId;
    _dragCardId = id === undefined ? null : id;
  }, true);
  document.addEventListener('dragend', () => { _dragCardId = null; _clearSwapMark(); }, true);

  function _markSwapTarget(e, myIdx, ownerIdx, areaIdx, sub) {
    const el = e.target?.closest ? e.target.closest('.card') : null;
    if (el === _swapMarked) return;
    _clearSwapMark();
    if (!el || !sub.contains(el) || _dragCardId === null) return;
    const st = getState();
    const me = st.players[myIdx], owner = st.players[ownerIdx];
    const dragged = [...(st.hands[me] || []), ...(st.subcontractCards[me] || [])]
      .find(c => String(c._id) === String(_dragCardId));
    const labels = (window.gameState.CONTRACT_SUB_AREAS || {})[st.roundIndex] || [];
    const areaCards = (st.subcontractCards[owner] || []).filter(c => c.subArea === areaIdx);
    const wi = areaCards.findIndex(c => String(c._id) === String(el.dataset.cardId));
    if (dragged && wi !== -1 && window.validator.swapPolicy(myIdx) &&
        window.validator.canSwapWild(areaCards, labels[areaIdx], dragged, wi)) {
      el.classList.add('swap-target');
      _swapMarked = el;
    }
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
    // The human may arrange their hand and stage cards while somebody else is playing.
    const v = window.roundManager?.viewerIdx?.();
    if (v !== undefined && v >= 0 && v !== currentTurnIdx && !window.aiData?.isAI?.[v]) {
      _wireHandDrop(v);
      _wireOwnSubcontractDrop(v);
    }
    window.cardRenderer.updateDiscardPlayableIndicator();
    _syncUndoButton();
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
  // Normal play needs a lay-down first. Wild swaps follow the Wild Swap setting
  // (see "Wild swap" above): drop the card onto the wild it replaces.

  function _wireLaidDownContractDrops(myTurnIdx) {
    const state          = getState();
    const myPlayer       = state.players[myTurnIdx];
    const myHandDiv      = document.getElementById(`hand-${myTurnIdx}`);

    state.players.forEach((owner, playerIdx) => {
      if (!state.laidDownPlayers.has(playerIdx)) return;

      const subAreas = window.getSubcontractSubAreas(playerIdx);
      subAreas.forEach((sub, subAreaIdx) => {
        sub.ondragover = e => {
          const st      = getState();
          const hasLaid = st.laidDownPlayers.has(myTurnIdx);
          // Allowed if the player has laid down (normal play, plus swaps under Post),
          // or the setting lets them swap before laying down (Pre and Post).
          if (!hasLaid && !window.validator.swapPolicy(myTurnIdx)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          sub.classList.add('drop-target');
          _markSwapTarget(e, myTurnIdx, playerIdx, subAreaIdx, sub);
        };
        sub.ondragleave = () => { sub.classList.remove('drop-target'); _clearSwapMark(); };
        sub.ondrop = e => {
          e.preventDefault();
          sub.classList.remove('drop-target');
          _clearSwapMark();

          // ── Live state reads ─────────────────────────────────────────
          const st      = getState();
          const hasLaid = st.laidDownPlayers.has(myTurnIdx);

          // Must have drawn before playing or swapping.
          if (!st.hasDrawn) return;

          const raw = e.dataTransfer.getData('text/plain');
          if (!raw) return;
          const data = JSON.parse(raw);
          // For pre-laydown wild swap, the card may come from hand OR subcontract.
          // For normal post-laydown play, must come from hand only.
          const fromHand       = data.from === 'hand';
          const fromSubcontract = data.from === 'subcontract';
          if (!data.card || data.playerIndex !== myTurnIdx) return;
          // Before laying down the card may also come from the player's own staged cards (swap only).
          if (!fromHand && !(fromSubcontract && !hasLaid)) return;

          const flatOwner    = [...(st.subcontractCards[owner] || [])];
          const subAreaCards = flatOwner.filter(c => c.subArea === subAreaIdx);
          const label        = (sub.dataset.label || '').toLowerCase();

          // ── Wild swap: drop ONTO the wild itself ─────────────────────
          const wildEl   = e.target?.closest ? e.target.closest('.card') : null;
          const wildKey  = wildEl && sub.contains(wildEl) ? wildEl.dataset.cardId : undefined;
          const wildIdx  = wildKey === undefined ? -1
            : subAreaCards.findIndex(c => String(c._id) === String(wildKey));
          if (wildIdx !== -1 && window.validator.isWild(subAreaCards[wildIdx]) &&
              window.validator.swapPolicy(myTurnIdx)) {
            if (performWildSwap(myTurnIdx, data.card, { playerIdx, areaIdx: subAreaIdx, wildIdx })) {
              _reRender();
              window.validateLayDown(myTurnIdx);
              window.scoring.updatePlayerStats(getState().hands);
              return;
            }
          }

          // ── Normal play (requires lay-down first) ────────────────────
          if (!hasLaid) {
            // Not a valid swap (drop the card onto the wild it may replace) — nothing else is allowed before lay-down.
            sub.style.outline = '2px solid red';
            setTimeout(() => { sub.style.outline = ''; }, 800);
            return;
          }

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

          // Log the play.
          window.gameLog?.logPlay(myPlayer, data.card, owner, sub.dataset.label || `Area ${subAreaIdx}`, subAreaIdx);

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
      let state    = getState();
      if (!state.hasDrawn) return;

      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data.card || data.playerIndex !== myTurnIdx) return;

      // Swapped before laying down but about to discard without laying down
      // (e.g. to keep the swapped wild): every swap is undone first.
      if (!state.laidDownPlayers.has(myTurnIdx) && _hasPending(state.players[myTurnIdx])) {
        _cancelWildSwaps(myTurnIdx, 'discarded without laying down');
        state = getState();
      }

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

      // Log the discard.
      window.gameLog?.logDiscard(myPlayer, card);

      // Push to discard pile.
      const newDiscard = [...state.discardPile, card];
      window.aiInfo?.recordDiscard(myTurnIdx, card);
      setState({ hands: newHands, subcontractCards: newSubs, discardPile: newDiscard });

      _confirmWildSwaps(myTurnIdx);

      // Re-render.
      if (myHandDiv) {
        window.cardRenderer.renderCardArray(
          getState().hands[myPlayer], myHandDiv, true, myTurnIdx, 'hand'
        );
      }
      window.cardRenderer.renderAllSubcontractAreas();
      window.cardRenderer.renderDiscardPile();

      // Run scoring/round-end check FIRST — must happen before any early return.
      const freshState  = getState();
      const hasLaidNow  = freshState.laidDownPlayers.has(myTurnIdx);
      const handCount   = (freshState.hands[myPlayer] || []).length;
      const subCount    = (freshState.subcontractCards[myPlayer] || []).length;
      const totalCards  = hasLaidNow ? handCount : handCount + subCount;

      const roundEnded  = window.scoring.updatePlayerStats(freshState.hands);

      if (roundEnded || getState().roundFinished) return;

      // If player truly has zero cards (hand + subcontract both empty and not
      // laid down) endRound should have fired inside updatePlayerStats above.
      // If it somehow didn't (edge case), don't advance — game is over.
      if (totalCards === 0) return;

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

    discardPileDiv.style.cursor = window.aiData?.isAI?.[myTurnIdx] ? 'default' : '';
    discardPileDiv.onclick = e => {
      if (e.defaultPrevented) return;
      if (window.aiData?.isAI?.[myTurnIdx]) return;   // only on a human's own turn
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
    // Safety net: an AI never ends a turn holding provisional swaps.
    if (!getState().laidDownPlayers.has(playerIdx) && _hasPending(getState().players[playerIdx])) {
      _cancelWildSwaps(playerIdx, 'discarded without laying down');
    }
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

    window.gameLog?.logDiscard(myPlayer, discarded);   // was: logDiscard(player, ...) — ReferenceError

    const newDiscard = [...state.discardPile, discarded];
    window.aiInfo?.recordDiscard(playerIdx, discarded);
    setState({ hands: newHands, discardPile: newDiscard });

    window.cardRenderer.renderCardArray(hand, document.getElementById(`hand-${playerIdx}`), false, playerIdx, 'hand');
    window.cardRenderer.renderDiscardPile();

    // Use same total-card count as human discard path and updatePlayerStats.
    const freshState  = getState();
    const hasLaid     = freshState.laidDownPlayers.has(playerIdx);
    const totalCards  = hasLaid
      ? (freshState.hands[myPlayer] || []).length
      : (freshState.hands[myPlayer] || []).length +
        (freshState.subcontractCards[myPlayer] || []).length;

    const roundEnded = window.scoring.updatePlayerStats(freshState.hands);

    if (totalCards === 0 || roundEnded || getState().roundFinished) return;

    // Advance turn — this triggers the buy clock via resetTurnState.
    const nextIdx = (playerIdx + 1) % state.players.length;
    window.resetTurnState(nextIdx);
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
    performWildSwap,
    hasPendingSwaps: (idx) => _hasPending(getState().players[idx]),
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
