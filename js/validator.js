// validator.js
// Single canonical implementation of all card-validity logic.
// Previously duplicated (with subtle differences) between tableManager.js
// and cardManager.js.  Every other module imports from window.validator.

(() => {
  const { RANK_ORDER } = window.gameState;

  // ─── Wild detection ───────────────────────────────────────────────────────
  // Uses window.gameRules which is set by roundManager.initTable().
  // Joker type: ALL W-rank cards are wild (both suits), matching the deck
  // construction in initDeck.js which creates W cards for every suit.
  function isWild(card) {
    const rules = window.gameRules || {};
    if (!rules.wildsEnabled) return false;
    const type = (rules.wildType || 'classic').toLowerCase();
    if (type === 'classic') return card.rank === '3' && (card.suit === '♦' || card.suit === '♥');
    if (type === 'extra')   return card.rank === '3' && (card.suit === '♦' || card.suit === '♥' || card.suit === '★');
    if (type === 'joker')   return card.rank === 'W';
    return false;
  }

  // ─── Set validation ───────────────────────────────────────────────────────
  // A valid set is 3+ cards of the same rank (wilds fill any missing slots).
  // At least one non-wild card is required to anchor the set's rank.
  function isValidSet(cards) {
    if (!cards || cards.length < 3) return false;
    const wildCnt  = cards.filter(isWild).length;
    const nonWilds = cards.filter(c => !isWild(c));
    // An all-wild set (3+ wilds) is legal, a rare edge case: it stays open and the
    // first natural card played onto it fixes its rank.
    const distinctRanks = [...new Set(nonWilds.map(c => c.rank))];
    if (distinctRanks.length > 1) return false;
    const needed = Math.max(0, 3 - nonWilds.length);
    return wildCnt >= needed;
  }

  // ─── Run validation ───────────────────────────────────────────────────────
  // A valid run is 4+ cards of the same suit in sequential order.
  // Cards must already be arranged in the order they will be validated —
  // the rules explicitly state "sequential order" and the drag UI enforces
  // player intent via physical placement.
  // Wilds fill positional gaps: a wild at index i substitutes for seq[i].
  function isValidRun(cards) {
    if (!cards) return false;
    const wildCnt  = cards.filter(isWild).length;
    const nonWilds = cards.filter(c => !isWild(c));
    const totalLen = nonWilds.length + wildCnt;
    if (totalLen < 4) return false;
    // An all-wild run (4+ wilds) is legal, a rare edge case: it stays open and the
    // first natural card played onto it fixes its suit and position.

    const distinctSuits = [...new Set(nonWilds.map(c => c.suit))];
    if (distinctSuits.length > 1) return false;
    const runSuit = distinctSuits[0];

    // matchesSequence: checks whether the card array aligns with a given
    // rank sequence, treating wilds as positional placeholders.
    const matchesSequence = (seq) => {
      let usedWilds = 0;
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (isWild(card)) { usedWilds++; continue; }
        if (card.rank !== seq[i] || card.suit !== runSuit) return false;
      }
      return usedWilds <= wildCnt;
    };

    const wrapAround = window.gameRules?.wrapAround ?? false;

    if (wrapAround) {
      // Double the rank sequence so K-A-2-3 and similar wraps are found
      // naturally as contiguous slices.
      const extended = [
        'A','2','3','4','5','6','7','8','9','10','J','Q','K',
        'A','2','3','4','5','6','7','8','9','10','J','Q','K','A'
      ];
      const maxStart = extended.length - totalLen;
      for (let start = 0; start <= maxStart; start++) {
        const ascSeq  = extended.slice(start, start + totalLen);
        if (matchesSequence(ascSeq))              return true;
        if (matchesSequence([...ascSeq].reverse())) return true;
      }
      return false;
    }

    // Standard (non-wrap) path uses RANK_ORDER from gameState.
    const maxStart = RANK_ORDER.length - totalLen;
    for (let start = 0; start <= maxStart; start++) {
      const ascSeq  = RANK_ORDER.slice(start, start + totalLen);
      if (matchesSequence(ascSeq))              return true;
      if (matchesSequence([...ascSeq].reverse())) return true;
    }
    return false;
  }

  // ─── Discard-pile extension helpers ──────────────────────────────────────
  // Used by dragDrop.js and the discard-playable indicator to decide whether
  // the top discard card can legally extend a staged or laid-down contract.

  function _getSubAreaCards(playerIdx, areaIdx) {
    const { players, subcontractCards } = window.gameState.getState();
    return (subcontractCards[players[playerIdx]] || []).filter(c => c.subArea === areaIdx);
  }

  function _getSubAreas(playerIdx) {
    return window.getSubcontractSubAreas(playerIdx);
  }

  // Can `card` extend a staged (pre-lay-down) set area for playerIdx?
  function canExtendStagedSet(card, playerIdx) {
    const subAreas = _getSubAreas(playerIdx);
    for (let areaIdx = 0; areaIdx < subAreas.length; areaIdx++) {
      const label = (subAreas[areaIdx].dataset.label || '').toLowerCase();
      if (!label.includes('set')) continue;
      const areaCards = _getSubAreaCards(playerIdx, areaIdx);
      if (areaCards.length < 3) continue;
      // Require at least one non-wild to anchor the set's rank before
      // allowing a wild extension.
      const anchor = areaCards.find(c => !isWild(c));
      if (!anchor) {   // all-wild set: any card may join; a natural fixes the rank
        if (isValidSet([...areaCards, card])) return { type: 'set', areaIdx };
        continue;
      }
      if (isWild(card) || card.rank === anchor.rank) {
        if (isValidSet([...areaCards, card])) return { type: 'set', areaIdx };
      }
    }
    return null;
  }

  // Can `card` extend a staged (pre-lay-down) run area for playerIdx?
  function canExtendStagedRun(card, playerIdx) {
    const RVAL = { 'A':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,
                   '8':8,'9':9,'10':10,'J':11,'Q':12,'K':13 };
    const subAreas = _getSubAreas(playerIdx);
    for (let areaIdx = 0; areaIdx < subAreas.length; areaIdx++) {
      const label = (subAreas[areaIdx].dataset.label || '').toLowerCase();
      if (!label.includes('run')) continue;
      const areaCards = _getSubAreaCards(playerIdx, areaIdx);
      if (areaCards.length < 4) continue;
      const nonWilds = areaCards.filter(c => !isWild(c));
      if (nonWilds.length === 0) {   // all-wild run: a natural fixes suit and position
        if (isValidRun([...areaCards, card])) return { type: 'run', areaIdx };
        continue;
      }
      if (!isWild(card) && card.suit !== nonWilds[0].suit) continue;
      const lowVal      = Math.min(...nonWilds.map(c => RVAL[c.rank] || 0));
      const highVal     = Math.max(...nonWilds.map(c => RVAL[c.rank] || 0));
      const cardValLow  = RVAL[card.rank] || 0;
      const cardValHigh = card.rank === 'A' ? 14 : cardValLow;
      if (isWild(card) || cardValLow === lowVal - 1 || cardValHigh === highVal + 1) {
        return { type: 'run', areaIdx };
      }
    }
    return null;
  }

  // Every place `card` could be played on the laid-down contracts of the table.
  // Returns [{ playerIdx, areaIdx, type, insertEnd }] where insertEnd is 'low'
  // (prepend) or 'high' (append) for runs, null for sets. `table` is optional
  // ({ players, subcontractCards, laidDownPlayers, roundIndex }); the AI passes a
  // virtual copy to look ahead without touching the real game.
  function findPlayTargets(card, myIdx, table) {
    const { players, subcontractCards, laidDownPlayers, roundIndex } = table || window.gameState.getState();
    const labels = window.gameState.CONTRACT_SUB_AREAS;
    const out = [];
    for (let i = 0; i < players.length; i++) {
      if (!laidDownPlayers.has(i)) continue;
      // Use gameState labels as primary source; fall back to DOM.
      const roundLabels = labels[roundIndex] || [];
      const numAreas    = roundLabels.length || _getSubAreas(i).length;
      for (let areaIdx = 0; areaIdx < numAreas; areaIdx++) {
        const label     = (roundLabels[areaIdx] || _getSubAreas(i)[areaIdx]?.dataset?.label || '').toLowerCase();
        const areaCards = (subcontractCards[players[i]] || []).filter(c => c.subArea === areaIdx);
        if (label.includes('set')) {
          if (isValidSet([...areaCards, card]))
            out.push({ playerIdx: i, areaIdx, type: 'set', insertEnd: null });
        }
        if (label.includes('run')) {
          if (areaCards.every(isWild)) {   // all-wild run: a card that fits once it has 4+ cards
            if (areaCards.length >= 4 && isValidRun([...areaCards, card]))
              out.push({ playerIdx: i, areaIdx, type: 'run', insertEnd: 'high' });
            continue;
          }
          // Positional check: the run is an ordered row, so try the card at either
          // end and let isValidRun decide (this also lets a card follow a wild that
          // already stands at the end, e.g. 4 5 6 7 [wild=8] then a 9).
          if (isValidRun([...areaCards, card]))
            out.push({ playerIdx: i, areaIdx, type: 'run', insertEnd: 'high' });
          if (isValidRun([card, ...areaCards]))
            out.push({ playerIdx: i, areaIdx, type: 'run', insertEnd: 'low' });
        }
      }
    }
    return out;
  }

  // Can `card` be played onto any already-laid-down contract on the table?
  // Returns the first { playerIdx, areaIdx, type, insertEnd } or null.
  function canPlayOnExistingContracts(card, myIdx) {
    return findPlayTargets(card, myIdx)[0] || null;
  }

  // Does a player have all required contracts fully staged?
  // Uses gameState.CONTRACT_SUB_AREAS labels directly — not DOM data-label —
  // so it works correctly during AI turns when DOM may be mid-render.
  function hasCompleteStagedContracts(playerIdx) {
    const { roundIndex, players, subcontractCards } = window.gameState.getState();
    const required = window.gameState.ROUND_REQUIREMENTS[roundIndex];
    if (!required) return false;
    const labels   = window.gameState.CONTRACT_SUB_AREAS[roundIndex];
    if (!labels || !labels.length) return false;
    const player   = players[playerIdx];
    const flat     = subcontractCards[player] || [];
    let setsOk = 0, runsOk = 0;
    labels.forEach((label, areaIdx) => {
      const areaCards  = flat.filter(c => c.subArea === areaIdx);
      const lowerLabel = label.toLowerCase();
      if (lowerLabel.includes('set') && isValidSet(areaCards))  setsOk++;
      else if (lowerLabel.includes('run') && isValidRun(areaCards)) runsOk++;
    });
    return setsOk >= required.sets && runsOk >= required.runs;
  }

  // ─── Wild swap ────────────────────────────────────────────────────────────
  // A natural card may replace a wild that sits in a LAID-DOWN group, and the
  // wild goes to the swapper's hand.
  //   Sets : any card of the set's rank (an all-wild set: the first natural fixes the rank).
  //   Runs : only the card the wild stands for. Order matters, so the wild's slot is fixed by
  //          where it was placed; the card replaces it IN PLACE (an all-wild run: the first
  //          natural fixes suit and position, as long as the result is a valid run).
  // Both rules reduce to: swap in place, then re-validate the group.
  function canSwapWild(areaCards, label, card, wildIdx) {
    if (!card || isWild(card)) return false;
    if (!areaCards || !areaCards[wildIdx] || !isWild(areaCards[wildIdx])) return false;
    const candidate = areaCards.slice();
    candidate[wildIdx] = card;
    const l = String(label || '').toLowerCase();
    if (l.includes('set')) return isValidSet(candidate);
    if (l.includes('run')) return isValidRun(candidate);
    return false;
  }

  // Is player myIdx allowed to swap at all right now (setting + lay-down status)?
  //   off  : never.   pre : only before laying down.   post : always.
  function swapPolicy(myIdx, table) {
    const mode = String(window.gameRules?.wildSwap || 'off').toLowerCase();
    if (mode === 'off') return false;
    const { laidDownPlayers } = table || window.gameState.getState();
    if (mode === 'pre') return !laidDownPlayers.has(myIdx);
    return mode === 'post';
  }

  // Every wild on the table that `card` could replace.
  // Returns [{ playerIdx, areaIdx, wildIdx, wild }], wildIdx = position inside the area.
  function findSwapTargets(card, myIdx, table) {
    const out = [];
    if (!card || isWild(card) || !swapPolicy(myIdx, table)) return out;
    const { players, subcontractCards, laidDownPlayers, roundIndex } = table || window.gameState.getState();
    const labels = (window.gameState.CONTRACT_SUB_AREAS || {})[roundIndex] || [];
    for (let i = 0; i < players.length; i++) {
      if (!laidDownPlayers.has(i)) continue;
      labels.forEach((label, areaIdx) => {
        const areaCards = (subcontractCards[players[i]] || []).filter(c => c.subArea === areaIdx);
        areaCards.forEach((w, wildIdx) => {
          if (isWild(w) && canSwapWild(areaCards, label, card, wildIdx))
            out.push({ playerIdx: i, areaIdx, wildIdx, wild: w });
        });
      });
    }
    return out;
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  window.validator = {
    isWild,
    isValidSet,
    isValidRun,
    canSwapWild,
    swapPolicy,
    findSwapTargets,
    findPlayTargets,
    canExtendStagedSet,
    canExtendStagedRun,
    canPlayOnExistingContracts,
    hasCompleteStagedContracts,
  };

  // Back-compat aliases consumed by legacy call-sites before full migration
  window.isWild    = isWild;
  window.isValidSet = isValidSet;
  window.isValidRun = isValidRun;
})();
