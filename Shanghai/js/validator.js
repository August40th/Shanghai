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
    // A set consisting entirely of wilds is not valid — rank must be established
    // by at least one real card.
    if (nonWilds.length === 0) return false;
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
    // A run consisting entirely of wilds is not valid — suit and at least one
    // rank position must be established by a real card.
    if (nonWilds.length === 0) return false;

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
      if (!anchor) continue;
      if (isWild(card) || card.rank === anchor.rank) {
        if (isValidSet([...areaCards, card])) return { type: 'set', areaIdx };
      }
    }
    return null;
  }

  // Can `card` extend a staged (pre-lay-down) run area for playerIdx?
  function canExtendStagedRun(card, playerIdx) {
    const rankValues = { 'A':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,
                         '8':8,'9':9,'10':10,'J':11,'Q':12,'K':13 };
    const subAreas = _getSubAreas(playerIdx);
    for (let areaIdx = 0; areaIdx < subAreas.length; areaIdx++) {
      const label = (subAreas[areaIdx].dataset.label || '').toLowerCase();
      if (!label.includes('run')) continue;
      const areaCards = _getSubAreaCards(playerIdx, areaIdx);
      // A staged run needs at least 4 cards to be valid and extendable.
      if (areaCards.length < 4) continue;
      const nonWilds = areaCards.filter(c => !isWild(c));
      if (nonWilds.length === 0) continue;
      const lowVal  = Math.min(...nonWilds.map(c => rankValues[c.rank] || 0));
      const highVal = Math.max(...nonWilds.map(c => rankValues[c.rank] || 0));
      const cardVal = rankValues[card.rank] || 0;
      if (isWild(card) || card.suit === nonWilds[0].suit) {
        if (isWild(card) || cardVal === lowVal - 1 || cardVal === highVal + 1) {
          return { type: 'run', areaIdx };
        }
      }
    }
    return null;
  }

  // Can `card` be played onto any already-laid-down contract on the table?
  // Returns { playerIdx, areaIdx, type, insertEnd } where insertEnd is
  // 'low' (prepend) or 'high' (append) for runs, null for sets.
  function canPlayOnExistingContracts(card, myIdx) {
    const { players, subcontractCards, laidDownPlayers } = window.gameState.getState();
    const rankValues = { 'A':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,
                         '8':8,'9':9,'10':10,'J':11,'Q':12,'K':13 };
    for (let i = 0; i < players.length; i++) {
      if (!laidDownPlayers.has(i)) continue;
      const subAreas = _getSubAreas(i);
      for (let areaIdx = 0; areaIdx < subAreas.length; areaIdx++) {
        const label     = (subAreas[areaIdx].dataset.label || '').toLowerCase();
        const areaCards = (subcontractCards[players[i]] || []).filter(c => c.subArea === areaIdx);
        if (label.includes('set')) {
          if (isValidSet([...areaCards, card]))
            return { playerIdx: i, areaIdx, type: 'set', insertEnd: null };
        }
        if (label.includes('run')) {
          const nonWilds = areaCards.filter(c => !isWild(c));
          if (nonWilds.length === 0) continue;
          if (!isWild(card) && card.suit !== nonWilds[0].suit) continue;
          const lowVal  = Math.min(...nonWilds.map(c => rankValues[c.rank] || 0));
          const highVal = Math.max(...nonWilds.map(c => rankValues[c.rank] || 0));
          const cardVal = rankValues[card.rank] || 0;
          if (isWild(card)) {
            // Wilds extend the high end by convention.
            return { playerIdx: i, areaIdx, type: 'run', insertEnd: 'high' };
          }
          if (cardVal === lowVal - 1)
            return { playerIdx: i, areaIdx, type: 'run', insertEnd: 'low' };
          if (cardVal === highVal + 1)
            return { playerIdx: i, areaIdx, type: 'run', insertEnd: 'high' };
        }
      }
    }
    return null;
  }

  // Does a player have all required contracts fully staged?
  function hasCompleteStagedContracts(playerIdx) {
    const { roundIndex } = window.gameState.getState();
    const required  = window.gameState.ROUND_REQUIREMENTS[roundIndex];
    if (!required) return false;
    const subAreas  = _getSubAreas(playerIdx);
    let setsOk = 0, runsOk = 0;
    for (let areaIdx = 0; areaIdx < subAreas.length; areaIdx++) {
      const label     = (subAreas[areaIdx].dataset.label || '').toLowerCase();
      const areaCards = _getSubAreaCards(playerIdx, areaIdx);
      if (label.includes('set') && isValidSet(areaCards))  setsOk++;
      else if (label.includes('run') && isValidRun(areaCards)) runsOk++;
    }
    return setsOk >= required.sets && runsOk >= required.runs;
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  window.validator = {
    isWild,
    isValidSet,
    isValidRun,
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
