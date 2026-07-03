// scoring.js
// Owns all point calculation, end-of-round accounting, Shanghai window
// resolution, score display, and the round/game winner popups.
//
// Depends on:  gameState.js  validator.js
// Called by:   roundManager.js  (startNextRound, resetTurnState)
//              dragDrop.js       (after a discard that empties a hand)

(() => {
  const { getState, setState }  = window.gameState;
  const { isWild }              = window.validator;

  // ─── Point values ─────────────────────────────────────────────────────────
  // Rules:  Aces = 15 | Face cards (10,J,Q,K) = 10 | Number cards = face value
  //         Wilds = 20 (regardless of their underlying rank)
  // Note:   When wilds are the classic/extra 3♦ / 3♥ / 3★, those cards score
  //         20 if they ARE wild and 3 if they are NOT (i.e. wilds disabled).

  function calculateCardPoints(card) {
    if (isWild(card)) return 20;
    // Non-wild 3s score face value (3 pts) even if other 3s are wild.
    const rank = card.rank;
    if (rank === 'A')  return 15;
    if (['10','J','Q','K'].includes(rank)) return 10;
    if (['2','3','4','5','6','7','8','9'].includes(rank)) return Number(rank);
    // W-rank cards that aren't wild (e.g. joker type disabled) score 20 by
    // convention — they have no natural face value.
    if (rank === 'W') return 20;
    return 0;
  }

  // ─── Live hand stats (cards count + held points) ──────────────────────────
  // Called after every hand mutation so nameplate stats stay current.
  // Also the trigger point for round-end detection (player reaches 0 cards).
  // Returns true if a round-end was triggered to let the caller bail early.

  function updatePlayerStats(handsObj) {
    const { players, subcontractCards, laidDownPlayers } = getState();

    let roundEndTriggered = false;

    players.forEach((player, i) => {
      const playerDiv = document.getElementById(`player-${i}`);
      if (!playerDiv) return;
      const stats = playerDiv.querySelector('.stats');
      if (!stats) return;

      const hasLaid     = laidDownPlayers.has(i);
      const hand        = handsObj[player] || [];
      const subcontract = subcontractCards[player] || [];

      // After laying down the subcontract area is on the table and no longer
      // counts toward the held-card total.
      const cardsForStats = hasLaid ? hand : [...hand, ...subcontract];

      let heldPoints = 0;
      cardsForStats.forEach(card => { heldPoints += calculateCardPoints(card); });

      const heldDiv  = stats.querySelector('.stat-held');
      const cardsDiv = stats.querySelector('.stat-cards');
      if (heldDiv)  heldDiv.textContent  = `Held: ${heldPoints}`;
      if (cardsDiv) cardsDiv.textContent = `Cards: ${cardsForStats.length}`;

      if (!roundEndTriggered && cardsForStats.length === 0) {
        roundEndTriggered = true;
        endRound(player);
      }
    });

    return roundEndTriggered;
  }

  // ─── End-of-round accounting ──────────────────────────────────────────────
  // BUG FIX #4: Hard Shanghai must only fire when the player who first laid
  // down also goes out on that same turn (lays down + empties hand in one
  // turn).  hardWindow is set true at lay-down, then cleared at the start of
  // every subsequent discard (see clearHardWindowIfNeeded, exposed below and
  // called by dragDrop.js before resetTurnState).
  //
  // BUG FIX #5: finalShanghai uses its own independent window check so it can
  // fire on round 7 even when hardShanghai is off for rounds 1-6.

  function endRound(triggerPlayer) {
    const state = getState();
    if (state.roundFinished) return;
    setState({ roundFinished: true });

    const {
      players, roundIndex,
      softWindow, hardWindow,
      roundHistory
    } = getState();

    const rules = window.gameRules || {};
    const roundScores = [];

    players.forEach((p, i) => {
      const playerDiv = document.getElementById(`player-${i}`);
      const stats     = playerDiv?.querySelector('.stats');
      if (!stats) { roundScores.push(0); return; }

      const heldDiv  = stats.querySelector('.stat-held');
      const scoreDiv = stats.querySelector('.stat-score');
      const buysDiv  = playerDiv.querySelector('.stat-buys');

      // Reset buy counter display for next round.
      if (buysDiv) buysDiv.textContent = 'Buys: 3';

      let heldVal = heldDiv ? Number(heldDiv.textContent.split(':')[1]?.trim()) || 0 : 0;

      // Apply Shanghai bonuses (only to players who still have cards, i.e.
      // anyone other than the round winner who scored 0).
      if (heldVal > 0) {
        const isFinalRound = roundIndex === 7;

        // Final Shanghai check — independent of hardShanghai setting.
        // Uses its own window flag (finalWindow, derived from hardWindow when
        // finalShanghai is enabled) so it can activate on round 7 even if
        // hardShanghai is off for rounds 1–6.
        if (isFinalRound && rules.finalShanghai && hardWindow) {
          heldVal += 100;
        } else if (!isFinalRound && rules.hardShanghai && hardWindow) {
          heldVal += 50;
        } else if (rules.softShanghai && softWindow) {
          heldVal += 25;
        }
      }

      // Accumulate onto running score.
      let scoreVal = scoreDiv ? Number(scoreDiv.textContent.split(':')[1]?.trim()) || 0 : 0;
      scoreVal += heldVal;
      if (scoreDiv) scoreDiv.textContent = `Score: ${scoreVal}`;
      roundScores.push(heldVal);
    });

    // Persist round scores into gameState so showGameWinnerPopup can read from
    // state rather than re-querying a removed DOM element.
    const newHistory = [...roundHistory, { round: roundIndex, scores: roundScores }];
    setState({ roundHistory: newHistory });

    // Build winner popup text.
    let winnerText;
    const isFinal = roundIndex === 7 && rules.finalShanghai && hardWindow;
    if (isFinal)             winnerText = `${triggerPlayer} won Round ${roundIndex} with a Final Shanghai! +100 to everyone else!`;
    else if (hardWindow && rules.hardShanghai) winnerText = `${triggerPlayer} won Round ${roundIndex} with a Shanghai! +50 to everyone else!`;
    else if (softWindow && rules.softShanghai) winnerText = `${triggerPlayer} won Round ${roundIndex} with a Soft Shanghai! +25 to everyone else!`;
    else                     winnerText = `${triggerPlayer} won Round ${roundIndex}!`;

    _showRoundWinnerPopup(winnerText);
  }

  // ─── BUG FIX #4 helper ────────────────────────────────────────────────────
  // Called by dragDrop.js immediately after a HasLaidDown player discards
  // but BEFORE updatePlayerStats fires.
  // If the discarding player still has cards left after the discard, Hard
  // Shanghai cannot apply — they did not go out the same turn they laid down.

  function clearHardWindowIfNeeded(playerIdx) {
    const { laidDownPlayers, hands, players } = getState();
    if (!laidDownPlayers.has(playerIdx)) return;
    const remaining = (hands[players[playerIdx]] || []).length;
    // remaining is the count BEFORE the discard card is removed from the hand
    // (dragDrop removes it after calling this).  So remaining > 1 means the
    // player will still hold at least one card after discarding.
    if (remaining > 1) {
      setState({ hardWindow: false });
    }
  }

  // ─── BUG FIX #5 helper ────────────────────────────────────────────────────
  // Called by roundManager when the first player lays down.
  // Sets softWindow and/or hardWindow according to active rule toggles.
  // hardWindow is set if hardShanghai OR finalShanghai is on, so that
  // Final Shanghai can fire on round 7 even when hardShanghai is off for
  // earlier rounds.

  function activateShanghaiWindows() {
    const rules   = window.gameRules || {};
    const { roundIndex } = getState();
    const soft  = rules.softShanghai  ? true : false;
    // Hard window also activates for finalShanghai so it can fire on round 7.
    const hard  = (rules.hardShanghai || (rules.finalShanghai && roundIndex === 7)) ? true : false;
    setState({ softWindow: soft, hardWindow: hard });
  }

  // ─── Scores popup ─────────────────────────────────────────────────────────
  // Rebuilt from gameState.roundHistory each time — no stale DOM dependency.

  function showScoresPopup() {
    setState({ scorePopupOpen: true });

    const { players, roundHistory, roundIndex } = getState();

    let container = document.getElementById('scores-popup');
    if (!container) {
      container = document.createElement('div');
      container.id = 'scores-popup';
      container.className = 'scores-popup';
      document.body.appendChild(container);
    }
    container.innerHTML = '';

    // Title
    const title = document.createElement('div');
    title.className = 'scores-title';
    title.textContent = 'Scores';
    title.style.cssText = 'text-align:center;font-weight:bold;margin-bottom:8px;';
    container.appendChild(title);

    // Header row
    const header = document.createElement('div');
    header.className = 'scores-header';
    header.innerHTML =
      `<div class="cell corner"></div>` +
      players.map(p => `<div class="cell player-name">${p}</div>`).join('');
    container.appendChild(header);

    // One row per round from history
    roundHistory.forEach(rh => {
      const row = document.createElement('div');
      row.className = 'scores-row';
      row.innerHTML =
        `<div class="cell round-index">Round ${rh.round}</div>` +
        rh.scores.map(s => `<div class="cell score">${s}</div>`).join('');
      container.appendChild(row);
    });

    // Totals row — computed from gameState, never from DOM
    const totals = players.map((_, i) =>
      roundHistory.reduce((sum, rh) => sum + (rh.scores[i] ?? 0), 0)
    );
    const minTotal   = Math.min(...totals);
    const totalRow   = document.createElement('div');
    totalRow.className = 'scores-row scores-total-row';
    totalRow.innerHTML =
      `<div class="cell round-index">Total</div>` +
      totals.map((t, i) =>
        `<div class="cell score${t === minTotal ? ' lowest-score' : ''}">${t}</div>`
      ).join('');
    container.appendChild(totalRow);

    const close = () => {
      container.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
      container.remove();
      setState({ scorePopupOpen: false });
      if (roundIndex < 7) {
        window.startNextRound();
      } else {
        _showGameWinnerPopup(totals);
      }
    };
    container.addEventListener('click', close);
    window.addEventListener('keydown', close);
  }

  // ─── Game winner popup ────────────────────────────────────────────────────
  // BUG FIX: previously re-read totals from a DOM element that had already
  // been removed by the scores popup close handler.  Now receives totals
  // directly as a parameter computed before the DOM was torn down.

  function _showGameWinnerPopup(totals) {
    const { players } = getState();
    const minScore  = Math.min(...totals);
    const winners   = players.filter((_, i) => totals[i] === minScore);
    const winnerName = winners.length === 1 ? winners[0] : winners.join(' & ');

    const finalPopup = document.createElement('div');
    finalPopup.className = 'game-winner-popup';
    finalPopup.textContent = `🏆 ${winnerName} won the game with ${minScore} points!`;
    document.body.appendChild(finalPopup);

    const close = () => {
      finalPopup.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
      finalPopup.remove();
    };
    finalPopup.addEventListener('click', close);
    window.addEventListener('keydown', close);
  }

  // ─── Round winner popup ───────────────────────────────────────────────────

  function _showRoundWinnerPopup(message) {
    const popup = document.createElement('div');
    popup.className = 'round-winner-popup';
    popup.textContent = message;
    document.body.appendChild(popup);

    const close = () => {
      popup.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
      popup.remove();
      showScoresPopup();
    };
    popup.addEventListener('click', close);
    window.addEventListener('keydown', close);
  }

  // ─── Round announcement popup ─────────────────────────────────────────────
  // Returns a Promise that resolves when the player dismisses the popup.

  function showRoundPopup(roundNum) {
    return new Promise(resolve => {
      const { ROUND_CONTRACT_LABELS } = window.gameState;
      const contractText = ROUND_CONTRACT_LABELS[roundNum - 1] || `Round ${roundNum}`;
      const popup = document.createElement('div');
      popup.id = 'round-popup';
      popup.className = 'round-popup';

      const roundLine    = document.createElement('div');
      roundLine.textContent = `Round ${roundNum}`;
      const contractLine = document.createElement('div');
      contractLine.textContent = contractText;
      popup.appendChild(roundLine);
      popup.appendChild(contractLine);
      document.body.appendChild(popup);

      function closePopup() {
        if (popup.parentNode) popup.parentNode.removeChild(popup);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('click',   onClick);
        resolve();
      }
      function onKey()   { closePopup(); }
      function onClick() { closePopup(); }
      window.addEventListener('keydown', onKey);
      window.addEventListener('click',   onClick);
    });
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  window.scoring = {
    calculateCardPoints,
    updatePlayerStats,
    endRound,
    showScoresPopup,
    showRoundPopup,
    clearHardWindowIfNeeded,
    activateShanghaiWindows,
  };

  // Back-compat alias used by roundManager and dragDrop during migration.
  window.updatePlayerStats       = updatePlayerStats;
  window.endRound                = endRound;
  window.showRoundPopup          = showRoundPopup;
  window.clearHardWindowIfNeeded = clearHardWindowIfNeeded;
  window.activateShanghaiWindows = activateShanghaiWindows;
})();
