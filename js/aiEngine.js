// aiEngine.js
// All AI player decision logic: draw source selection, optimal contract
// staging, lay-down, playing onto contracts, and discard selection.
//
// Previously scattered through tableManager.js with Steps 3-5 unimplemented,
// causing the game to soft-lock on any AI turn (AI drew and staged but never
// discarded, freezing the turn loop permanently).
//
// Depends on:  gameState.js  validator.js  scoring.js
// Called by:   roundManager.js  (executeAITurn entry point)

(() => {
  const { getState, setState, ROUND_REQUIREMENTS } = window.gameState;
  const { isWild, isValidSet, isValidRun }         = window.validator;

  // ─── Rank numeric values (used throughout for gap / sequence math) ─────────
  const RANK_VAL = {
    'A':1, '2':2,  '3':3,  '4':4,  '5':5,  '6':6,  '7':7,
    '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13
  };

  // ─── Main entry point ─────────────────────────────────────────────────────
  // Executes a full AI turn in sequence:
  //   1. Draw (from draw pile or discard)
  //   2. Stage cards toward the contract
  //   3. Lay down if contract is complete
  //   4. Play onto any laid-down contracts (own or others')
  //   5. Discard the least-valuable card
  //
  // Each step is wrapped in a small setTimeout so the browser can render
  // intermediate states and the human player can follow what the AI is doing.

  async function executeAITurn(playerIdx, difficulty) {
    const { players, laidDownPlayers } = getState();
    const playerDiv = document.getElementById(`player-${playerIdx}`);
    if (!playerDiv) return;

    // Guard: only run if this player's turn is still active in gameState.
    if (getState().currentTurnIdx !== playerIdx) return;

    console.log(`AI Turn: Player ${playerIdx} (${players[playerIdx]}, ${difficulty})`);

    // ── Step 1: Draw ──────────────────────────────────────────────────────
    await _aiDraw(playerIdx);

    // Re-read state after draw since hand has changed.
    if (getState().roundFinished) return;

    // ── Step 2: Stage ─────────────────────────────────────────────────────
    await _aiStage(playerIdx);

    if (getState().roundFinished) return;

    // ── Step 3: Lay down if contract is complete ──────────────────────────
    const didLayDown = await _aiLayDown(playerIdx);

    if (getState().roundFinished) return;

    // ── Step 4: Play onto contracts (only if laid down this turn or earlier)
    if (laidDownPlayers.has(playerIdx) || didLayDown) {
      await _aiPlayOnContracts(playerIdx);
    }

    if (getState().roundFinished) return;

    // ── Step 5: Discard ───────────────────────────────────────────────────
    await _aiDiscard(playerIdx);

    console.log(`AI Turn complete: Player ${playerIdx}`);
  }

  // ─── Step 1: Draw decision ────────────────────────────────────────────────
  // Takes from the discard pile if the top card meaningfully helps the
  // contract; otherwise draws from the draw pile.

  async function _aiDraw(playerIdx) {
    return new Promise(resolve => {
      setTimeout(() => {
        const { players, hands, subcontractCards, discardPile, laidDownPlayers } = getState();
        const player   = players[playerIdx];
        const hand     = hands[player] || [];
        const hasLaid  = laidDownPlayers.has(playerIdx);
        const topDiscard = discardPile[discardPile.length - 1];

        let drawSource = 'draw';
        if (topDiscard && _discardHelpsAI(topDiscard, hand, playerIdx, hasLaid)) {
          drawSource = 'discard';
          console.log(`AI ${playerIdx}: taking discard ${topDiscard.rank}${topDiscard.suit}`);
        }

        window.drawCardFrom(drawSource, playerIdx);
        resolve();
      }, 800);
    });
  }

  // ─── Step 2: Stage cards ──────────────────────────────────────────────────
  // Finds the optimal assignment of hand cards into subcontract areas and
  // applies it, then re-renders the player's hand and subcontract areas.
  // BUG FIX: renderCardArray is now called with the correct draggable value
  // (false for AI — their hand is never directly interacted with by the human).
  // The human player's hand draggability is governed by gameState.currentTurnIdx,
  // not by this call, so passing false here is correct and safe.

  async function _aiStage(playerIdx) {
    return new Promise(resolve => {
      setTimeout(() => {
        const { players, hands, subcontractCards, roundIndex, laidDownPlayers } = getState();

        // Never re-stage after lay-down — the contract is on the table and
        // must not be rearranged. Only stage during the pre-laydown phase.
        if (laidDownPlayers.has(playerIdx)) { resolve(); return; }

        const player        = players[playerIdx];
        const hand          = hands[player] || [];
        const currentStaged = subcontractCards[player] || [];
        const allCards      = [...hand, ...currentStaged];
        const subAreas = window.getSubcontractSubAreas(playerIdx);
        if (!subAreas.length) {
          console.warn(`AI ${playerIdx}: no subcontract areas found, skipping stage`);
          resolve();
          return;
        }

        const optimalStaging = _findOptimalStaging(allCards, roundIndex, subAreas);
        _applyStaging(playerIdx, optimalStaging);

        // Re-render this player's hand (non-draggable — AI cards)
        const handDiv = document.getElementById(`hand-${playerIdx}`);
        if (handDiv) {
          window.cardRenderer.renderCardArray(
            getState().hands[player], handDiv, false, playerIdx, 'hand'
          );
        }
        window.cardRenderer.renderAllSubcontractAreas();
        window.refreshLayButtons?.();

        resolve();
      }, 500);
    });
  }

  // ─── Step 3: Lay down ─────────────────────────────────────────────────────
  // Checks whether the staged contract is complete and valid; if so, triggers
  // the lay-down and activates the Shanghai windows.
  // Returns true if lay-down happened this step.

  async function _aiLayDown(playerIdx) {
    return new Promise(resolve => {
      setTimeout(() => {
        const { laidDownPlayers } = getState();
        // Don't lay down twice.
        if (laidDownPlayers.has(playerIdx)) { resolve(false); return; }

        const isComplete = window.validator.hasCompleteStagedContracts(playerIdx);
        if (!isComplete) { resolve(false); return; }

        console.log(`AI ${playerIdx}: laying down`);

        // Mark laid down in gameState.
        const newSet = new Set(getState().laidDownPlayers);
        newSet.add(playerIdx);

        // Activate Shanghai windows if this is the first lay-down this round.
        const alreadyLaidCount = getState().laidDownPlayers.size;
        if (alreadyLaidCount === 0) {
          window.scoring.activateShanghaiWindows();
        } else if (alreadyLaidCount === 1) {
          // Second layer closes the softWindow.
          setState({ softWindow: false });
        }

        setState({ laidDownPlayers: newSet });

        // Update DOM to reflect lay-down.
        const playerDiv = document.getElementById(`player-${playerIdx}`);
        if (playerDiv) playerDiv.classList.add('HasLaidDown');
        const btn = playerDiv?.querySelector('.lay-down-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Laid Down'; }

        window.cardRenderer.renderAllSubcontractAreas();
        window.dragDrop.setupDragDrop();

        resolve(true);
      }, 400);
    });
  }

  // ─── Step 4: Play onto contracts ──────────────────────────────────────────
  // After laying down, the AI plays any cards from its hand that extend any
  // already-laid-down contract on the table (own or others').
  // Loops until no more playable cards remain.

  async function _aiPlayOnContracts(playerIdx) {
    return new Promise(resolve => {
      setTimeout(() => {
        const { players, laidDownPlayers } = getState();
        if (!laidDownPlayers.has(playerIdx)) { resolve(); return; }

        let played = true;
        while (played) {
          played = false;
          const { hands } = getState();
          const player = players[playerIdx];
          const hand   = [...(hands[player] || [])];

          for (let ci = 0; ci < hand.length; ci++) {
            const card = hand[ci];
            const target = window.validator.canPlayOnExistingContracts(card, playerIdx);
            if (!target) continue;

            // Remove card from hand.
            const newHands = { ...getState().hands };
            newHands[player] = newHands[player].filter(c => c._id !== card._id);

            // Insert card at the correct position in the target sub-area.
            // For sets: order doesn't matter, append.
            // For runs: insertEnd 'low' means prepend, 'high' means append.
            const newSub   = { ...getState().subcontractCards };
            const owner    = players[target.playerIdx];
            const flatOwner = [...(newSub[owner] || [])];

            if (target.type === 'run' && target.insertEnd === 'low') {
              // Find the first card in this area and insert before it.
              const firstInArea = flatOwner.findIndex(c => c.subArea === target.areaIdx);
              if (firstInArea === -1) {
                flatOwner.push({ ...card, subArea: target.areaIdx });
              } else {
                flatOwner.splice(firstInArea, 0, { ...card, subArea: target.areaIdx });
              }
            } else {
              // Append after the last card in this area.
              const lastInArea = flatOwner.reduce((last, c, i) =>
                c.subArea === target.areaIdx ? i : last, -1);
              flatOwner.splice(lastInArea + 1, 0, { ...card, subArea: target.areaIdx });
            }

            newSub[owner] = flatOwner;
            setState({ hands: newHands, subcontractCards: newSub });
            console.log(`AI ${playerIdx}: played ${card.rank}${card.suit} onto player ${target.playerIdx} area ${target.areaIdx}`);
            played = true;
            break; // Restart loop with fresh hand after each play.
          }
        }

        // Re-render after all plays.
        const handDiv = document.getElementById(`hand-${playerIdx}`);
        if (handDiv) {
          window.cardRenderer.renderCardArray(
            getState().hands[players[playerIdx]], handDiv, false, playerIdx, 'hand'
          );
        }
        window.cardRenderer.renderAllSubcontractAreas();
        window.scoring.updatePlayerStats(getState().hands);

        resolve();
      }, 400);
    });
  }

  // ─── Step 5: Discard ──────────────────────────────────────────────────────
  // Selects the highest-point card that does NOT contribute to any staged or
  // playable contract, and discards it.
  // BUG FIX: This was entirely missing, causing the game to permanently freeze
  // on any AI turn — the turn loop waited for a discard that never came.

  async function _aiDiscard(playerIdx) {
    return new Promise(resolve => {
      setTimeout(() => {
        const { players, hands, roundFinished } = getState();
        if (roundFinished) { resolve(); return; }

        const player = players[playerIdx];
        const hand   = [...(hands[player] || [])];
        if (hand.length === 0) { resolve(); return; }

        const cardToDiscard = _chooseDiscard(hand, playerIdx);
        if (!cardToDiscard) { resolve(); return; }

        console.log(`AI ${playerIdx}: discarding ${cardToDiscard.rank}${cardToDiscard.suit}`);

        // Use the shared discard path so resetTurnState, buy clock,
        // and round-end detection all fire correctly.
        window.aiDiscard(cardToDiscard, playerIdx);

        resolve();
      }, 600);
    });
  }

  // ─── Discard card selection ───────────────────────────────────────────────
  // Priority (descending):
  //   1. Cards that are NOT part of any staged contract group.
  //   2. Among those, prefer highest point value (gets rid of the most
  //      dangerous held points).
  //   3. If all cards are staged, discard from the least-complete area
  //      (staging is fungible at this point).

  function _chooseDiscard(hand, playerIdx) {
    const { players, subcontractCards, laidDownPlayers } = getState();
    const player = players[playerIdx];

    // Wilds are never discarded — always worth keeping.
    const nonWilds = hand.filter(c => !isWild(c));

    // If laid down, pick highest point non-wild card, but avoid gifting a card
    // that another laid-down player can immediately play on their contract.
    if (laidDownPlayers.has(playerIdx)) {
      const safe = nonWilds.filter(c => !_isGiftCard(c, playerIdx));
      return _highestPoints(safe.length ? safe : nonWilds) || _highestPoints(hand);
    }

    const stagedIds = new Set(
      (subcontractCards[player] || []).map(c => c._id)
    );
    const unstagedHand = nonWilds.filter(c => !stagedIds.has(c._id));

    if (unstagedHand.length > 0) {
      const notUseful = unstagedHand.filter(c =>
        !_cardHelpsStaging(c, playerIdx) &&
        !_cardHelpsUnstagedHand(c, unstagedHand)
      );
      // Also try to avoid gifting a card to a laid-down opponent.
      const notGifts   = notUseful.filter(c => !_isGiftCard(c, playerIdx));
      const pool = notGifts.length > 0 ? notGifts
                 : notUseful.length > 0 ? notUseful
                 : unstagedHand;
      return _highestPoints(pool);
    }

    return _highestPoints(nonWilds) || null;
  }

  // Returns true if discarding `card` would gift it directly to a laid-down
  // opponent who can immediately play it on their contract.
  function _isGiftCard(card, discardingIdx) {
    const target = window.validator.canPlayOnExistingContracts(card, discardingIdx);
    if (!target) return false;
    // Only a gift if the beneficiary is a different player.
    return target.playerIdx !== discardingIdx;
  }

  // Returns true if `card` is part of a partial group within the unstaged hand.
  // Protects cards involved in pairs (for sets) or adjacent same-suit runs.
  function _cardHelpsUnstagedHand(card, unstagedHand) {
    const others = unstagedHand.filter(c => c._id !== card._id);

    // Set potential: at least one other card of the same rank.
    if (others.some(c => c.rank === card.rank)) return true;

    // Run potential: at least one other non-wild card of the same suit
    // within 3 ranks (adjacent enough to be worth keeping).
    if (!isWild(card)) {
      const cardVal   = RANK_VAL[card.rank] || 0;
      const sameSuit  = others.filter(c => !isWild(c) && c.suit === card.suit);
      if (sameSuit.some(c => Math.abs((RANK_VAL[c.rank] || 0) - cardVal) <= 3)) return true;
    }

    // Wild cards are always worth keeping.
    if (isWild(card)) return true;

    return false;
  }

  function _highestPoints(cards) {
    if (!cards.length) return null;
    return cards.reduce((best, c) =>
      window.scoring.calculateCardPoints(c) >= window.scoring.calculateCardPoints(best) ? c : best
    );
  }

  // Returns true if `card` would contribute to completing a contract group
  // when added to what's currently staged for this player.
  function _cardHelpsStaging(card, playerIdx) {
    const { players, subcontractCards } = getState();
    const player   = players[playerIdx];
    const staged   = subcontractCards[player] || [];

    // Group staged cards by subArea.
    const byArea = {};
    staged.forEach(c => {
      if (!byArea[c.subArea]) byArea[c.subArea] = [];
      byArea[c.subArea].push(c);
    });

    for (const areaCards of Object.values(byArea)) {
      const anchor = areaCards.find(c => !isWild(c));
      if (!anchor) continue;
      // Set check.
      if (card.rank === anchor.rank && isValidSet([...areaCards, card])) return true;
      // Run check — sort by rank before validating so positional check passes.
      const nonWilds = areaCards.filter(c => !isWild(c));
      if (nonWilds.length > 0 && (isWild(card) || card.suit === nonWilds[0].suit)) {
        const withCard = [...areaCards, card];
        const wilds    = withCard.filter(isWild);
        const sorted   = withCard
          .filter(c => !isWild(c))
          .sort((a, b) => (RANK_VAL[a.rank] || 0) - (RANK_VAL[b.rank] || 0));
        // Reinsert wilds into gaps.
        const reordered = _buildRunWithWilds(sorted, wilds);
        if (reordered && isValidRun(reordered)) return true;
        // Also check if the card simply extends either end.
        const lowVal  = Math.min(...nonWilds.map(c => RANK_VAL[c.rank] || 0));
        const highVal = Math.max(...nonWilds.map(c => RANK_VAL[c.rank] || 0));
        const cardVal = RANK_VAL[card.rank] || 0;
        const cardHigh = card.rank === 'A' ? 14 : cardVal;
        if (cardVal === lowVal - 1 || cardHigh === highVal + 1) return true;
      }
    }
    return false;
  }

  // ─── Draw decision helper ─────────────────────────────────────────────────
  // Decides whether the top discard card is worth taking over drawing blind.
  // Strategy extends beyond active contract building — a laid-down player
  // should take a card that extends what they can play on contracts this turn
  // or in future turns (e.g. holding 4-5♥ with a laid-down 7-8-9-10♥ run,
  // a 6♥ in the discard is absolutely worth taking even though it doesn't
  // directly extend the laid-down run yet).

  function _discardHelpsAI(card, hand, playerIdx, hasLaid) {
    const { players, subcontractCards, roundIndex } = getState();
    const contractCards = subcontractCards[players[playerIdx]] || [];

    if (hasLaid) {
      // Can the card be played directly onto any laid-down contract now?
      if (window.validator.canPlayOnExistingContracts(card, playerIdx)) return true;

      // Can the card combine with cards currently in hand to extend a
      // laid-down contract in a future play sequence?
      // e.g. holding 4-5♥, laid-down run is 7-8-9-10♥, discard is 6♥ →
      // taking 6♥ means next turn we play 4-5-6♥ onto the run.
      if (_cardExtendsHandSequence(card, hand, playerIdx)) return true;

      return false;
    }

    const required       = ROUND_REQUIREMENTS[roundIndex] || { sets: 0, runs: 0 };
    const status         = _analyzeContractStatus(contractCards, required);
    const contractComplete = status.needsSets <= 0 && status.needsRuns <= 0;

    if (contractComplete) {
      // Contract already staged — only take if card extends a staged group
      // or helps build a playable sequence for post-laydown.
      return _canExtendStagedContract(card, contractCards) ||
             _cardExtendsHandSequence(card, hand, playerIdx);
    }

    return (
      _wouldCompleteContractGroup(card, contractCards, hand, status) ||
      _formsNewGroupInHand(card, hand, status)
    );
  }

  // Returns true if `card` combines with cards in `hand` to form a sequence
  // that could be played onto any currently laid-down contract on the table.
  // This captures the "holding 4-5♥ + discard is 6♥" pattern.
  function _cardExtendsHandSequence(card, hand, playerIdx) {
    const { players, subcontractCards, laidDownPlayers } = getState();
    const rankValues = { 'A':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,
                         '8':8,'9':9,'10':10,'J':11,'Q':12,'K':13 };

    // Build potential plays: the new card combined with same-suit hand cards.
    const sameSuitHand = isWild(card) ? hand : hand.filter(c =>
      !isWild(c) && c.suit === card.suit
    );
    if (!sameSuitHand.length) return false;

    const combined = [...sameSuitHand, card];

    // Check if this combined group, or any subset of it, can be played
    // sequentially onto any laid-down run.
    for (const [pi, pname] of getState().players.entries()) {
      if (!laidDownPlayers.has(pi)) continue;
      const subAreas = window.getSubcontractSubAreas(pi);
      for (let areaIdx = 0; areaIdx < subAreas.length; areaIdx++) {
        const label     = (subAreas[areaIdx].dataset.label || '').toLowerCase();
        if (!label.includes('run')) continue;
        const areaCards = (getState().subcontractCards[pname] || []).filter(c => c.subArea === areaIdx);
        if (!areaCards.length) continue;
        const nonWilds  = areaCards.filter(c => !isWild(c));
        if (!nonWilds.length) continue;
        const runSuit   = nonWilds[0].suit;
        if (!isWild(card) && card.suit !== runSuit) continue;
        const lowVal    = Math.min(...nonWilds.map(c => rankValues[c.rank] || 0));
        const highVal   = Math.max(...nonWilds.map(c => rankValues[c.rank] || 0));
        const cardVal   = isWild(card) ? 0 : (rankValues[card.rank] || 0);
        // The drawn card plus same-suit hand cards form a bridge to the run.
        const relevant  = combined.filter(c =>
          isWild(c) ||
          ((rankValues[c.rank] || 0) >= lowVal - combined.length &&
           (rankValues[c.rank] || 0) <= highVal + combined.length)
        );
        if (relevant.length >= 2) return true;
      }
    }
    return false;
  }

  // ─── Contract status helpers ──────────────────────────────────────────────

  function _analyzeContractStatus(contractCards, required) {
    const byArea = {};
    contractCards.forEach(c => {
      if (!byArea[c.subArea]) byArea[c.subArea] = [];
      byArea[c.subArea].push(c);
    });

    let validSets = 0, validRuns = 0;
    Object.values(byArea).forEach(areaCards => {
      if (isValidSet(areaCards))      validSets++;
      else if (isValidRun(areaCards)) validRuns++;
    });

    return {
      validSets, validRuns,
      needsSets: required.sets - validSets,
      needsRuns: required.runs - validRuns
    };
  }

  function _canExtendStagedContract(card, contractCards) {
    const rankValues = { 'A':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,
                         '8':8,'9':9,'10':10,'J':11,'Q':12,'K':13 };
    const byArea = {};
    contractCards.forEach(c => {
      if (!byArea[c.subArea]) byArea[c.subArea] = [];
      byArea[c.subArea].push(c);
    });

    for (const areaCards of Object.values(byArea)) {
      const anchor   = areaCards.find(c => !isWild(c));
      if (!anchor) continue;

      // Set extension — rank must match anchor.
      if (isWild(card) || card.rank === anchor.rank) {
        if (isValidSet([...areaCards, card])) return true;
      }

      // Run extension — check low and high ends explicitly with gap validation.
      const nonWilds = areaCards.filter(c => !isWild(c));
      if (!nonWilds.length) continue;
      const runSuit  = nonWilds[0].suit;
      if (!isWild(card) && card.suit !== runSuit) continue;
      const lowVal   = Math.min(...nonWilds.map(c => rankValues[c.rank] || 0));
      const highVal  = Math.max(...nonWilds.map(c => rankValues[c.rank] || 0));
      const cardValLow  = rankValues[card.rank] || 0;
      const cardValHigh = card.rank === 'A' ? 14 : cardValLow;
      // Count wilds available in the area (can fill internal gaps).
      const areaWilds = areaCards.filter(c => isWild(c)).length;

      if (cardValLow === lowVal - 1 || cardValHigh === highVal + 1 || isWild(card)) {
        // Verify the resulting run has no unfillable gaps.
        const testVals = [...nonWilds.map(c => rankValues[c.rank] || 0)];
        if (!isWild(card)) testVals.push(cardValLow === lowVal - 1 ? cardValLow : cardValHigh);
        testVals.sort((a, b) => a - b);
        const gaps = _gapsInSortedVals(testVals);
        if (gaps <= areaWilds) return true;
      }
    }
    return false;
  }

  function _wouldCompleteContractGroup(card, contractCards, hand, status) {
    const rankValues = { 'A':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,
                         '8':8,'9':9,'10':10,'J':11,'Q':12,'K':13 };

    // Set completion — needs matching rank cards in staged + hand.
    if (status.needsSets > 0) {
      const sameRankStaged = contractCards.filter(c => !isWild(c) && c.rank === card.rank);
      const sameRankHand   = hand.filter(c => !isWild(c) && c.rank === card.rank);
      const totalSameRank  = sameRankStaged.length + sameRankHand.length;
      // Drawing this card means we have totalSameRank+1 of this rank — enough for a set?
      if (totalSameRank >= 2) return true; // completes a 3-card set minimum
    }

    // Run completion — check whether the card slots into a staged run group
    // at either end AND the resulting run is achievable (all gaps fillable
    // with wilds currently in hand or staged).
    if (status.needsRuns > 0) {
      const byArea = {};
      contractCards.forEach(c => {
        if (!byArea[c.subArea]) byArea[c.subArea] = [];
        byArea[c.subArea].push(c);
      });

      // Count wilds available — in hand plus already staged.
      const wildCount = [...hand, ...contractCards].filter(c => isWild(c)).length;

      for (const areaCards of Object.values(byArea)) {
        const nonWilds = areaCards.filter(c => !isWild(c));
        if (!nonWilds.length) continue;
        const runSuit  = nonWilds[0].suit;
        if (!isWild(card) && card.suit !== runSuit) continue;
        const lowVal   = Math.min(...nonWilds.map(c => rankValues[c.rank] || 0));
        const highVal  = Math.max(...nonWilds.map(c => rankValues[c.rank] || 0));
        const cardValLow  = rankValues[card.rank] || 0;
        const cardValHigh = card.rank === 'A' ? 14 : cardValLow;

        // Card extends at low end.
        if (!isWild(card) && cardValLow === lowVal - 1) {
          // Check all gaps in the resulting run are coverable.
          const allVals  = [...nonWilds.map(c => rankValues[c.rank] || 0), cardValLow].sort((a, b) => a - b);
          const gaps     = _gapsInSortedVals(allVals);
          if (gaps <= wildCount) return true;
        }
        // Card extends at high end (Ace treated as 14 for K-high runs).
        if (cardValHigh === highVal + 1) {
          const allVals  = [...nonWilds.map(c => rankValues[c.rank] || 0), cardValHigh].sort((a, b) => a - b);
          const gaps     = _gapsInSortedVals(allVals);
          if (gaps <= wildCount) return true;
        }
        // Wild always extends if gaps are coverable.
        if (isWild(card)) {
          const allVals  = nonWilds.map(c => rankValues[c.rank] || 0).sort((a, b) => a - b);
          const gaps     = _gapsInSortedVals(allVals);
          if (gaps <= wildCount) return true;
        }
      }

      // Does the card combine with same-suit hand cards to form or extend a run?
      if (!isWild(card)) {
        const sameSuitHand = hand.filter(c => !isWild(c) && c.suit === card.suit);
        if (sameSuitHand.length >= 2) {
          const cardValLow  = rankValues[card.rank] || 0;
          const cardValHigh = card.rank === 'A' ? 14 : cardValLow;
          const vals    = sameSuitHand.map(c => rankValues[c.rank] || 0).sort((a, b) => a - b);
          const low     = vals[0];
          const high    = vals[vals.length - 1];
          if (cardValLow === low - 1 || cardValHigh === high + 1 ||
              (cardValLow > low && cardValLow < high)) return true;
        }
      }
    }

    return false;
  }

  function _formsNewGroupInHand(card, hand, status) {
    // Sets: worth taking if there is already 1+ of the same rank in hand —
    // builds a pair which is one step from a complete set.
    if (status.needsSets > 0) {
      const sameRank = hand.filter(c => !isWild(c) && c.rank === card.rank);
      if (sameRank.length >= 1) return true;
    }

    // Runs: worth taking if the card is within 3 ranks of a same-suit card
    // in hand — reasonable run seed even at early stages.
    if (status.needsRuns > 0 && !isWild(card)) {
      const sameSuit = hand.filter(c => !isWild(c) && c.suit === card.suit);
      if (sameSuit.length >= 1) {
        const cardVal    = RANK_VAL[card.rank] || 0;
        const suitValues = sameSuit.map(c => RANK_VAL[c.rank] || 0);
        if (suitValues.some(v => Math.abs(v - cardVal) <= 3)) return true;
      }
    }

    return false;
  }
  // Finds the optimal assignment of cards to contract sub-areas by trying all
  // sensible wild allocations across run and set slots, then picking the
  // combination that satisfies the most contract requirements.
  //
  // Previously the greedy "runs consume all wilds first" approach caused two bugs:
  //   1. Wilds weren't split optimally between runs and sets (e.g. 1 wild
  //      needed for a diamond run, 1 for a tens set — greedy gave both to
  //      the run).
  //   2. Ace-swap: rank-group iteration order determined which Ace went into
  //      the set vs the run, leading to sub-optimal choices.

  function _findOptimalStaging(allCards, roundIndex, subAreas) {
    const numAreas   = subAreas.length;
    const areaLabels = subAreas.map(sub => {
      const label = (sub.dataset.label || '').toLowerCase();
      return { isSet: label.includes('set'), isRun: label.includes('run') };
    });

    const setAreas = areaLabels.map((l, i) => l.isSet ? i : -1).filter(i => i !== -1);
    const runAreas = areaLabels.map((l, i) => l.isRun ? i : -1).filter(i => i !== -1);

    const wilds    = allCards.filter(isWild).map(c => ({ ...c }));
    const regulars = allCards.filter(c => !isWild(c)).map(c => ({ ...c }));
    const totalWilds = wilds.length;

    // Pre-compute: for each number of wilds allocated to runs (0..totalWilds),
    // find the best run(s) that can be built, and the best set(s) with the
    // remaining wilds. Score = (completeRuns * 1000) + (completeSets * 100) +
    // partial credit. Pick the allocation with the highest score.

    let bestScore   = -1;
    let bestStaging = Array.from({ length: numAreas }, () => []);

    // We only need to try allocating 0..totalWilds wilds to runs.
    const maxWildsForRuns = Math.min(totalWilds, runAreas.length * 2);

    for (let wildsForRuns = 0; wildsForRuns <= maxWildsForRuns; wildsForRuns++) {
      const runWilds  = wilds.slice(0, wildsForRuns);
      const setWilds  = wilds.slice(wildsForRuns);

      const staging   = Array.from({ length: numAreas }, () => []);
      const usedIds   = new Set();
      let score       = 0;

      // ── Assign runs ────────────────────────────────────────────────────
      runAreas.forEach(areaIdx => {
        const available     = regulars.filter(c => !usedIds.has(c._id));
        const availRunWilds = runWilds.filter(c => !usedIds.has(c._id));
        const bestRun       = _findBestRun(available, availRunWilds);
        if (bestRun) {
          staging[areaIdx] = bestRun.cards;
          bestRun.cards.forEach(c => usedIds.add(c._id));
          const complete = isValidRun(bestRun.cards);
          score += complete ? 1000 : bestRun.cards.length * 5;
        } else {
          // No complete or wild-fillable run found — stage the best partial
          // (largest group of same-suit cards) as a work-in-progress.
          const partial = _findBestPartialRun(available);
          if (partial.length >= 2) {
            staging[areaIdx] = partial;
            partial.forEach(c => usedIds.add(c._id));
            score += partial.length * 2;
          } else if (partial.length === 1) {
            // Even a single card is worth staging to show intent and protect
            // it from being discarded.
            staging[areaIdx] = partial;
            partial.forEach(c => usedIds.add(c._id));
            score += 1;
          }
        }
      });

      // ── Assign sets ────────────────────────────────────────────────────
      // Group remaining regular cards by rank.
      const rankGroups = {};
      regulars.filter(c => !usedIds.has(c._id)).forEach(c => {
        if (!rankGroups[c.rank]) rankGroups[c.rank] = [];
        rankGroups[c.rank].push(c);
      });

      // Build set candidates sorted by completeness then point value.
      const remainingSetWilds = setWilds.filter(c => !usedIds.has(c._id));
      const setCandidates = [];
      Object.entries(rankGroups).forEach(([rank, cards]) => {
        const base = RANK_VAL[rank] || 5;
        if (cards.length >= 3) {
          setCandidates.push({ rank, cards: cards.slice(0, 3), complete: true,  score: base * 10 + 100, wildsNeeded: 0 });
        } else if (cards.length === 2 && remainingSetWilds.length >= 1) {
          setCandidates.push({ rank, cards: [...cards, remainingSetWilds[0]], complete: true,  score: base * 10 + 90, wildsNeeded: 1 });
        } else if (cards.length === 2) {
          setCandidates.push({ rank, cards: [...cards], complete: false, score: base * 5, wildsNeeded: 0 });
        } else if (cards.length === 1 && remainingSetWilds.length >= 2) {
          setCandidates.push({ rank, cards: [cards[0], remainingSetWilds[0], remainingSetWilds[1]], complete: true, score: base * 10 + 80, wildsNeeded: 2 });
        } else if (cards.length === 1) {
          setCandidates.push({ rank, cards: [...cards], complete: false, score: base * 2, wildsNeeded: 0 });
        }
      });
      setCandidates.sort((a, b) => b.score - a.score);

      let wildsUsedInSets = 0;
      setAreas.forEach(areaIdx => {
        for (const candidate of setCandidates) {
          if (candidate.assigned) continue;
          if (wildsUsedInSets + candidate.wildsNeeded > remainingSetWilds.length) continue;
          const allAvailable = candidate.cards.every(c => !usedIds.has(c._id));
          if (!allAvailable) continue;
          staging[areaIdx] = [...candidate.cards];
          candidate.cards.forEach(c => usedIds.add(c._id));
          candidate.assigned = true;
          wildsUsedInSets += candidate.wildsNeeded;
          score += candidate.complete ? 100 : candidate.cards.length * 2;
          break;
        }
      });

      // Fill empty set areas with best partial.
      setAreas.forEach(areaIdx => {
        if (staging[areaIdx].length > 0) return;
        for (const candidate of setCandidates) {
          if (candidate.assigned) continue;
          const allAvailable = candidate.cards
            .filter(c => !isWild(c))
            .every(c => !usedIds.has(c._id));
          if (!allAvailable) continue;
          staging[areaIdx] = [...candidate.cards.filter(c => !isWild(c))];
          staging[areaIdx].forEach(c => usedIds.add(c._id));
          candidate.assigned = true;
          score += staging[areaIdx].length;
          break;
        }
      });

      if (score > bestScore) {
        bestScore   = score;
        bestStaging = staging.map(a => [...a]);
      }
    }

    return bestStaging;
  }

  // ─── Apply staging to gameState ───────────────────────────────────────────
  // BUG FIX: uses _id for deduplication — previously used rank+suit string
  // which silently destroyed duplicate cards in multi-deck games.

  function _applyStaging(playerIdx, staging) {
    const { players, hands, subcontractCards } = getState();
    const player    = players[playerIdx];
    const stagedIds = new Set(staging.flat().map(c => c._id));

    const currentHand   = hands[player]            || [];
    const currentStaged = subcontractCards[player]  || [];
    const allCards      = [...currentHand, ...currentStaged];

    const newHand = allCards.filter(c => !stagedIds.has(c._id));
    const newSub  = [];
    staging.forEach((cards, areaIdx) => {
      cards.forEach(card => newSub.push({ ...card, subArea: areaIdx }));
    });

    const newHands = { ...hands, [player]: newHand };
    const newSubs  = { ...subcontractCards, [player]: newSub };
    setState({ hands: newHands, subcontractCards: newSubs });
  }

  // ─── Run-finding helpers ──────────────────────────────────────────────────

  function _findBestRun(availableCards, availableWilds) {
    const bySuit = {};
    availableCards.forEach(c => {
      if (!bySuit[c.suit]) bySuit[c.suit] = [];
      bySuit[c.suit].push(c);
    });

    let bestRun = null, bestValue = 0;

    Object.entries(bySuit).forEach(([suit, cards]) => {
      if (!cards.length) return;

      // Try Ace as both low (1) and high (14) by generating two sorted
      // versions for each suit when Aces are present.
      const sortedVersions = _getSortedVariants(cards);

      sortedVersions.forEach(sorted => {
        // Try all subsets. The minimum real-card subset is 1 card (if we have
        // enough wilds to reach 4 total), max is all cards up to length 8.
        for (let i = 0; i < sorted.length; i++) {
          for (let j = i + 1; j <= sorted.length && j <= i + 8; j++) {
            const subset    = sorted.slice(i, j);
            const gaps      = _countGaps(subset);
            const totalLen  = subset.length + gaps; // real cards + gap fills
            // Need at least 4 total (real + wilds filling gaps).
            if (totalLen < 4) continue;
            // Need enough wilds to fill all gaps.
            if (gaps > availableWilds.length) continue;

            const wildsToUse = availableWilds.slice(0, gaps);
            const runCards   = _buildRunWithWilds(subset, wildsToUse);

            if (runCards && isValidRun(runCards)) {
              const value = _runValue(runCards);
              if (value > bestValue) {
                bestValue = value;
                bestRun   = { cards: runCards, wildsUsed: wildsToUse.length };
              }
            }
          }
        }
      });
    });

    return bestRun;
  }

  // Finds the best partial run seed from available cards — the largest group
  // of same-suit cards sorted by rank, used when no complete run is achievable.
  // Returns cards sorted in ascending rank order ready for staging.
  function _findBestPartialRun(availableCards) {
    const bySuit = {};
    availableCards.forEach(c => {
      if (!bySuit[c.suit]) bySuit[c.suit] = [];
      bySuit[c.suit].push(c);
    });

    let best = [];
    Object.values(bySuit).forEach(cards => {
      if (cards.length <= best.length) return;
      // Sort by rank value ascending.
      const sorted = [...cards].sort((a, b) => (RANK_VAL[a.rank] || 0) - (RANK_VAL[b.rank] || 0));
      // Find the longest consecutive-ish run seed (cards within 3 ranks of each other).
      // This picks the most connected group, not just all same-suit cards.
      let bestChain = [sorted[0]];
      let currentChain = [sorted[0]];
      for (let i = 1; i < sorted.length; i++) {
        const gap = (RANK_VAL[sorted[i].rank] || 0) - (RANK_VAL[sorted[i - 1].rank] || 0);
        if (gap <= 3) {
          currentChain.push(sorted[i]);
        } else {
          if (currentChain.length > bestChain.length) bestChain = currentChain;
          currentChain = [sorted[i]];
        }
      }
      if (currentChain.length > bestChain.length) bestChain = currentChain;
      if (bestChain.length > best.length) best = bestChain;
    });

    return best;
  }

  // Returns one or two sorted versions of a suit's cards — always low-ace
  // order, plus a high-ace version (Ace = 14) when Aces are present.
  // This lets _findBestRun find J-Q-K-A runs correctly.
  function _getSortedVariants(cards) {
    const lowSort  = [...cards].sort((a, b) => (RANK_VAL[a.rank] || 0) - (RANK_VAL[b.rank] || 0));
    const hasAce   = cards.some(c => c.rank === 'A');
    if (!hasAce) return [lowSort];

    // High-ace sort: treat Ace as 14.
    const highAceVal = c => c.rank === 'A' ? 14 : (RANK_VAL[c.rank] || 0);
    const highSort = [...cards].sort((a, b) => highAceVal(a) - highAceVal(b));
    return [lowSort, highSort];
  }

  // Inserts wilds into the gap positions of a sorted run subset so the
  // resulting array passes isValidRun's positional sequence check.
  // Uses the same high-ace detection as _countGaps.
  function _buildRunWithWilds(sortedCards, wilds) {
    if (!sortedCards.length) return null;
    const result = [];
    let wildIdx  = 0;

    const adjustedVals = sortedCards.map((c, i) => {
      if (c.rank !== 'A') return RANK_VAL[c.rank] || 0;
      const prevVal = i > 0 ? (RANK_VAL[sortedCards[i - 1].rank] || 0) : 0;
      return prevVal >= 10 ? 14 : 1;
    });

    for (let i = 0; i < sortedCards.length; i++) {
      if (i > 0) {
        const gap = adjustedVals[i] - adjustedVals[i - 1] - 1;
        for (let g = 0; g < gap; g++) {
          if (wildIdx >= wilds.length) return null;
          result.push(wilds[wildIdx++]);
        }
      }
      result.push(sortedCards[i]);
    }
    return result;
  }

  function _countGaps(sortedCards) {
    // Detect high Aces: if an Ace appears after a card with value >= 10
    // in the sorted array, treat it as 14 (high).
    const adjustedVals = sortedCards.map((c, i) => {
      if (c.rank !== 'A') return RANK_VAL[c.rank] || 0;
      const prevVal = i > 0 ? (RANK_VAL[sortedCards[i - 1].rank] || 0) : 0;
      return prevVal >= 10 ? 14 : 1;
    });
    let gaps = 0;
    for (let i = 0; i < adjustedVals.length - 1; i++) {
      gaps += Math.max(0, adjustedVals[i + 1] - adjustedVals[i] - 1);
    }
    return gaps;
  }

  function _gapsInSortedVals(sortedVals) {
    let gaps = 0;
    for (let i = 0; i < sortedVals.length - 1; i++) {
      gaps += Math.max(0, sortedVals[i + 1] - sortedVals[i] - 1);
    }
    return gaps;
  }

  function _runValue(cards) {
    const nonWilds = cards.filter(c => !isWild(c));
    const avgRank  = nonWilds.length
      ? nonWilds.reduce((s, c) => s + (RANK_VAL[c.rank] || 5), 0) / nonWilds.length
      : 5;
    return cards.length * 15 + avgRank;
  }

  // ─── Buy decision ─────────────────────────────────────────────────────────
  // Called by roundManager._showBuyClockPopup for each AI player in the buy
  // window. Returns true if the AI should buy the top discard card.
  //
  // Buying gives you the discard card PLUS an extra card from the draw pile,
  // so you end the buy with 2 more cards than you started with (before your
  // own turn draw). This means buying only makes sense when the bought card
  // allows you to play AT LEAST 2 cards onto contracts that turn — otherwise
  // you're net +1 card after plays, which is bad.
  //
  // Exception: a wild or a card that completes a contract group is always
  // worth buying regardless of the net-card math, because those have
  // overwhelming strategic value.

  function shouldBuy(playerIdx, card) {
    const { players, hands, subcontractCards, laidDownPlayers, roundIndex } = getState();
    const player   = players[playerIdx];
    const hand     = hands[player] || [];
    const hasLaid  = laidDownPlayers.has(playerIdx);

    // Never buy a wild — they never appear in the discard pile.
    // But if somehow one does, always buy it.
    if (isWild(card)) return true;

    if (hasLaid) {
      // Post-laydown: count how many cards we could play onto contracts
      // with our current hand PLUS the bought card. Need >= 2 to justify
      // the extra draw card that comes with the buy.
      const handWithCard  = [...hand, card];
      const playsNow      = _countPlayableCards(handWithCard, playerIdx);

      // Also check if the card extends a hand sequence toward a contract
      // (the 4-5♥ + 6♥ pattern) — but only if COMBINED with existing hand
      // cards we can already play, giving us 2+ total plays.
      const directPlay    = !!window.validator.canPlayOnExistingContracts(card, playerIdx);
      const sequencePlay  = _cardExtendsHandSequence(card, hand, playerIdx);

      // Must be able to play 2+ cards to justify the buy.
      if (playsNow >= 2) return true;

      // If card only enables 1 direct play, not worth buying (net +1 card).
      if (directPlay && playsNow < 2) return false;

      // Sequence play (future value) — only worth buying if we already have
      // 1+ playable card this turn too (so combined plays >= 2).
      if (sequencePlay && playsNow >= 1) return true;

      return false;
    }

    // Pre-laydown: evaluate using the same draw logic but with a stricter
    // net-card threshold.
    const contractCards = subcontractCards[player] || [];
    const required      = ROUND_REQUIREMENTS[roundIndex] || { sets: 0, runs: 0 };
    const status        = _analyzeContractStatus(contractCards, required);

    // Always buy if the card completes the contract (enables lay-down).
    if (_wouldCompleteContract(card, contractCards, hand, status)) return true;

    // Buy if card advances a contract group AND we have enough unstaged
    // cards to absorb the extra draw without becoming unmanageable.
    // "Unmanageable" = more than 2 unstaged non-contract cards in hand
    // after the buy (those cards have to be discarded over future turns).
    const stagedIds   = new Set(contractCards.map(c => c._id));
    const unstagedCnt = hand.filter(c => !stagedIds.has(c._id) && !isWild(c)).length;

    // Extra draw means 2 extra unstaged cards to absorb — too many if
    // hand is already bloated.
    if (unstagedCnt > 3) return false;

    // Card directly advances a contract group?
    if (_discardHelpsAI(card, hand, playerIdx, false)) return true;

    return false;
  }

  // Returns how many cards in `hand` can be played onto any currently
  // laid-down contract on the table.
  function _countPlayableCards(hand, playerIdx) {
    const { players, subcontractCards, laidDownPlayers } = getState();
    const rankValues = { 'A':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,
                         '8':8,'9':9,'10':10,'J':11,'Q':12,'K':13 };
    let count = 0;
    const usedCardIds = new Set();

    // Simulate plays greedily — each card at most once.
    for (const card of hand) {
      if (usedCardIds.has(card._id)) continue;
      const target = window.validator.canPlayOnExistingContracts(card, playerIdx);
      if (target) { count++; usedCardIds.add(card._id); }
    }
    return count;
  }

  // Returns true if buying `card` would complete the full contract
  // (all required sets and runs become valid), enabling lay-down.
  function _wouldCompleteContract(card, contractCards, hand, status) {
    // Simulate adding card to hand and re-running staging analysis.
    const allCards   = [...hand, card, ...contractCards];
    const { roundIndex } = getState();
    const required   = ROUND_REQUIREMENTS[roundIndex] || { sets: 0, runs: 0 };

    // Quick check: does the card satisfy a needed set slot?
    if (status.needsSets > 0) {
      const sameRankStaged = contractCards.filter(c => !isWild(c) && c.rank === card.rank);
      const sameRankHand   = hand.filter(c => !isWild(c) && c.rank === card.rank);
      if (sameRankStaged.length + sameRankHand.length >= 2) return status.needsSets === 1 && status.needsRuns <= 0;
    }

    // Does the card fill the last gap in a needed run slot?
    if (status.needsRuns > 0) {
      const byArea = {};
      contractCards.forEach(c => {
        if (!byArea[c.subArea]) byArea[c.subArea] = [];
        byArea[c.subArea].push(c);
      });
      for (const areaCards of Object.values(byArea)) {
        const nonWilds = areaCards.filter(c => !isWild(c));
        if (!nonWilds.length) continue;
        if (!isWild(card) && card.suit !== nonWilds[0].suit) continue;
        const rankValues = { 'A':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,
                             '8':8,'9':9,'10':10,'J':11,'Q':12,'K':13 };
        const lowVal  = Math.min(...nonWilds.map(c => rankValues[c.rank] || 0));
        const highVal = Math.max(...nonWilds.map(c => rankValues[c.rank] || 0));
        const cardVal = rankValues[card.rank] || 0;
        if (isWild(card) || cardVal === lowVal - 1 || cardVal === highVal + 1) {
          if (status.needsRuns === 1 && status.needsSets <= 0) return true;
        }
      }
    }

    return false;
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  window.aiEngine = {
    executeAITurn,
    shouldBuy,
  };

  // Back-compat alias.
  window.executeAITurn = executeAITurn;
})();
