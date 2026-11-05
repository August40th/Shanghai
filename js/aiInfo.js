// aiInfo.js
// Information layer for the AI. Records only PUBLIC events (things any player
// at the table sees) and answers questions about them:
//   - which cards each player took from the discard pile or bought
//   - which cards each player discarded
//   - who passed on a discarded card (declined to buy / take it)
//   - which card each player drew on their own turn (self knowledge)
// Blind draws by other players are never recorded.
// Reset at the start of every round.

(() => {
  const keyOf = c => c.rank + c.suit;
  const RV = { A:1, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, J:11, Q:12, K:13 };

  let taken = {};        // playerIdx -> [card]   taken/bought and not since discarded
  let discarded = {};    // playerIdx -> [card]   everything they discarded this round
  let passes = new Map();// card key -> Set(playerIdx) who passed on that card
  let justDrawn = {};    // playerIdx -> _id of the card they drew most recently

  function reset() { taken = {}; discarded = {}; passes = new Map(); justDrawn = {}; }

  function recordDraw(idx, card) { justDrawn[idx] = card._id; }

  function recordTake(idx, card) {
    (taken[idx] = taken[idx] || []).push(card);
    justDrawn[idx] = card._id;
  }

  function recordDiscard(idx, card) {
    (discarded[idx] = discarded[idx] || []).push(card);
    const t = taken[idx];
    if (t) {
      const i = t.findIndex(c => keyOf(c) === keyOf(card));
      if (i >= 0) t.splice(i, 1);
    }
  }

  function recordPass(idx, card) {
    const k = keyOf(card);
    if (!passes.has(k)) passes.set(k, new Set());
    passes.get(k).add(idx);
  }

  // What the current round's contract is made of. Same-rank interest only
  // means something when the round has sets; same-suit-neighbour interest only
  // when it has runs (e.g. a round of 3 sets never gives neighbour interest).
  function _roundHas(type) {
    try {
      const gs = window.gameState;
      const labels = gs.CONTRACT_SUB_AREAS[gs.getState().roundIndex] || [];
      return labels.some(l => String(l).toLowerCase().includes(type));
    } catch (e) { return true; }
  }

  // How strongly player `idx` appears to want `card`:
  //   2 = they took/bought the same rank (set rounds) or a same-suit
  //       neighbour (run rounds)
  //   0 = no sign, or they discarded/passed on it themselves
  function interest(idx, card) {
    if (window.validator?.isWild(card)) return 2;
    const t = taken[idx] || [];
    if (!t.length) return 0;
    const k = keyOf(card);
    if ((passes.get(k) || new Set()).has(idx)) return 0;
    const dis = discarded[idx] || [];
    if (_roundHas('set')) {
      const sameRankTaken = t.some(c => c.rank === card.rank);
      if (sameRankTaken && !dis.some(c => c.rank === card.rank)) return 2;
    }
    if (_roundHas('run')) {
      const nearSuit = t.some(c => c.suit === card.suit &&
        Math.abs(RV[c.rank] - RV[card.rank]) === 1 && keyOf(c) !== k);
      if (nearSuit && !dis.some(c => keyOf(c) === k)) return 2;
    }
    return 0;
  }

  // Number of OTHER players who passed on a card of this exact type.
  function passCount(card, exceptIdx) {
    const s = passes.get(keyOf(card));
    if (!s) return 0;
    let n = 0; s.forEach(i => { if (i !== exceptIdx) n++; });
    return n;
  }

  function wasJustDrawn(idx, card) { return justDrawn[idx] !== undefined && justDrawn[idx] === card._id; }

  // Everything player `idx` has discarded this round (public: it was seen).
  function discardedBy(idx) { return (discarded[idx] || []).slice(); }

  window.aiInfo = { reset, recordDraw, recordTake, recordDiscard, recordPass,
                    interest, passCount, wasJustDrawn, discardedBy };
})();
