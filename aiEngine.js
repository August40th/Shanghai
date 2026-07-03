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
        const subAreas      = window.getSubcontractSubAreas(playerIdx);

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

    // If laid down, every hand card is fair game — pick highest point value.
    if (laidDownPlayers.has(playerIdx)) {
      return _highestPoints(hand);
    }

    // Cards currently staged in subcontract areas — keyed by _id.
    const stagedIds = new Set(
      (subcontractCards[player] || []).map(c => c._id)
    );

    // Cards in hand that are NOT currently staged.
    const unstagedHand = hand.filter(c => !stagedIds.has(c._id));

    if (unstagedHand.length > 0) {
      // Filter out cards that either:
      // (a) would help complete a staged contract group, OR
      // (b) are part of a partial set/run entirely within the unstaged hand.
      const notUseful = unstagedHand.filter(c =>
        !_cardHelpsStaging(c, playerIdx) &&
        !_cardHelpsUnstagedHand(c, unstagedHand)
      );
      const pool = notUseful.length > 0 ? notUseful : unstagedHand;
      return _highestPoints(pool);
    }

    // Fallback: all cards are staged — discard from the overflow.
    return _highestPoints(hand);
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
      // Run check.
      const nonWilds = areaCards.filter(c => !isWild(c));
      if (nonWilds.length > 0 && (isWild(card) || card.suit === nonWilds[0].suit)) {
        if (isValidRun([...areaCards, card])) return true;
      }
    }
    return false;
  }

  // ─── Draw decision helper ─────────────────────────────────────────────────

  function _discardHelpsAI(card, hand, playerIdx, hasLaid) {
    const { players, subcontractCards, roundIndex } = getState();
    const contractCards = subcontractCards[players[playerIdx]] || [];

    if (hasLaid) {
      return !!window.validator.canPlayOnExistingContracts(card, playerIdx);
    }

    const required = ROUND_REQUIREMENTS[roundIndex] || { sets: 0, runs: 0 };
    const status   = _analyzeContractStatus(contractCards, required);
    const contractComplete = status.needsSets <= 0 && status.needsRuns <= 0;

    if (contractComplete) {
      return _canExtendStagedContract(card, contractCards);
    }

    return (
      _wouldCompleteContractGroup(card, contractCards, hand, status) ||
      _formsNewGroupInHand(card, hand, status)
    );
  }

  // ─── Staging algorithm ────────────────────────────────────────────────────
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
      if (cards.length < 2) return;
      const sorted = [...cards].sort((a, b) => (RANK_VAL[a.rank] || 0) - (RANK_VAL[b.rank] || 0));

      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 4; j <= sorted.length && j <= i + 8; j++) {
          const subset = sorted.slice(i, j);
          const gaps   = _countGaps(subset);
          if (gaps > availableWilds.length) continue;

          // Build candidate: place real cards in their natural positions,
          // insert wilds into gap positions so isValidRun's positional check passes.
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

    return bestRun;
  }

  // Inserts wilds into the gap positions of a sorted run subset so the
  // resulting array passes isValidRun's positional sequence check.
  function _buildRunWithWilds(sortedCards, wilds) {
    if (!sortedCards.length) return null;
    const result = [];
    let wildIdx  = 0;

    for (let i = 0; i < sortedCards.length; i++) {
      if (i > 0) {
        const prev = RANK_VAL[sortedCards[i - 1].rank] || 0;
        const curr = RANK_VAL[sortedCards[i].rank]     || 0;
        const gap  = curr - prev - 1;
        for (let g = 0; g < gap; g++) {
          if (wildIdx >= wilds.length) return null; // Not enough wilds.
          result.push(wilds[wildIdx++]);
        }
      }
      result.push(sortedCards[i]);
    }
    return result;
  }

  function _countGaps(sortedCards) {
    let gaps = 0;
    for (let i = 0; i < sortedCards.length - 1; i++) {
      const diff = (RANK_VAL[sortedCards[i + 1].rank] || 0) - (RANK_VAL[sortedCards[i].rank] || 0);
      gaps += Math.max(0, diff - 1);
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
    const byArea = {};
    contractCards.forEach(c => {
      if (!byArea[c.subArea]) byArea[c.subArea] = [];
      byArea[c.subArea].push(c);
    });

    for (const areaCards of Object.values(byArea)) {
      const anchor = areaCards.find(c => !isWild(c));
      if (!anchor) continue;

      // Set extension.
      if ((isWild(card) || card.rank === anchor.rank) && isValidSet([...areaCards, card])) return true;

      // Run extension.
      const nonWilds = areaCards.filter(c => !isWild(c));
      if (nonWilds.length > 0 && (isWild(card) || card.suit === nonWilds[0].suit)) {
        const testRun = [...areaCards, card];
        if (isValidRun(testRun)) return true;
      }
    }
    return false;
  }

  function _wouldCompleteContractGroup(card, contractCards, hand, status) {
    const sameRankInContract = contractCards.filter(c => c.rank === card.rank);

    // Would adding this card to staged same-rank group complete a set?
    if (sameRankInContract.length === 2 && status.needsSets > 0) return true;

    // Would adding to staged same-suit group complete a run?
    const sameSuitInContract = contractCards.filter(c => c.suit === card.suit);
    if (sameSuitInContract.length >= 3 && status.needsRuns > 0) {
      if (isValidRun([...sameSuitInContract, card])) return true;
    }

    // Would combining with hand cards complete a set?
    if (status.needsSets > 0) {
      const totalSameRank = hand.filter(c => c.rank === card.rank).length + sameRankInContract.length;
      if (totalSameRank >= 2 && isValidSet([...hand.filter(c => c.rank === card.rank), ...sameRankInContract, card])) return true;
    }

    // Would combining with hand cards complete a run?
    if (status.needsRuns > 0) {
      const sameSuitInHand = hand.filter(c => c.suit === card.suit);
      if (sameSuitInHand.length + sameSuitInContract.length >= 3) {
        if (isValidRun([...sameSuitInHand, ...sameSuitInContract, card])) return true;
      }
    }

    return false;
  }

  function _formsNewGroupInHand(card, hand, status) {
    if (status.needsSets > 0) {
      const sameRank = hand.filter(c => c.rank === card.rank);
      // Worth taking for a set only if there are already 2 of this rank
      // in hand (the new card would complete a 3-card set).
      if (sameRank.length >= 2 && isValidSet([...sameRank, card])) return true;
    }

    if (status.needsRuns > 0) {
      const sameSuit = hand.filter(c => c.suit === card.suit && !isWild(c));
      // A complete run is always worth taking.
      if (sameSuit.length >= 3 && isValidRun([...sameSuit, card])) return true;

      // Worth taking for a run if there is already at least 1 same-suit card
      // in hand — together they form a 2-card seed toward a run.
      // (Single-card seeds are too speculative; pairs are reasonable building blocks.)
      if (sameSuit.length >= 1) {
        const cardVal    = RANK_VAL[card.rank] || 0;
        const suitValues = sameSuit.map(c => RANK_VAL[c.rank] || 0);
        // Only take if the card is directly adjacent (gap of 1) to an
        // existing same-suit card — not just in the same suit at any position.
        if (suitValues.some(v => Math.abs(v - cardVal) <= 2)) return true;
      }
    }

    return false;
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  window.aiEngine = {
    executeAITurn,
  };

  // Back-compat alias.
  window.executeAITurn = executeAITurn;
})();
