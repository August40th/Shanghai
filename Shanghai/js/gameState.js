// gameState.js
// Single source of truth for all mutable game state.
// Every module reads from here; every mutation goes through setState().
// No direct DOM class sniffing for game logic — state lives here, not in classList.

(() => {
  // ─── Card dimensions (shared constants, never magic-numbered elsewhere) ───
  const CARD_WIDTH    = 45;
  const CARD_HEIGHT   = 65;
  const OVERLAP_PCT   = 0.35;
  const CARD_OVERLAP  = Math.floor(CARD_WIDTH * OVERLAP_PCT);

  // ─── Round contract definitions ───────────────────────────────────────────
  const CONTRACT_SUB_AREAS = {
    1: ['Set 1', 'Set 2'],
    2: ['Set 1', 'Run 1'],
    3: ['Run 1', 'Run 2'],
    4: ['Set 1', 'Set 2', 'Set 3'],
    5: ['Set 1', 'Set 2', 'Run 1'],
    6: ['Set 1', 'Run 1', 'Run 2'],
    7: ['Run 1', 'Run 2', 'Run 3']
  };

  const ROUND_CONTRACT_LABELS = [
    '2 Sets',
    '1 Set + 1 Run',
    '2 Runs',
    '3 Sets',
    '2 Sets + 1 Run',
    '1 Set + 2 Runs',
    '3 Runs'
  ];

  const ROUND_REQUIREMENTS = {
    1: { sets: 2, runs: 0 },
    2: { sets: 1, runs: 1 },
    3: { sets: 0, runs: 2 },
    4: { sets: 3, runs: 0 },
    5: { sets: 2, runs: 1 },
    6: { sets: 1, runs: 2 },
    7: { sets: 0, runs: 3 }
  };

  // ─── Sort orders ──────────────────────────────────────────────────────────
  // 'A' appears at index 0 (low) AND index 13 (high) intentionally.
  // indexOf() always returns index 0, so aces sort low by default.
  // The duplicate 'A' at 13 supports wrap-around run detection in validator.js.
  const RANK_ORDER = ['A','2','3','4','5','6','7','8','9','10','J','Q','K','A','W'];
  const SUIT_ORDER = ['♦','♥','♣','♠','★'];

  // ─── Internal state object ────────────────────────────────────────────────
  function _makeInitialState() {
    return {
      // players
      players:          [],       // string[] — player names in seat order
      currentTurnIdx:   -1,       // index into players[]
      roundStarterIdx:  0,
      hasDrawn:         false,    // true once the active player has drawn this turn
      laidDownPlayers:  new Set(),// Set<number> of player indices who have laid down this round
      roundFinished:    false,

      // cards
      hands:            {},       // { [playerName]: card[] }
      subcontractCards: {},       // { [playerName]: card[] } — each card has .subArea
      drawPile:         [],
      discardPile:      [],

      // round
      roundIndex:       0,
      roundHistory:     [],       // [{ round, scores: number[] }]
      scorePopupOpen:   false,

      // Shanghai windows — true means "first layer is active this round"
      softWindow:       false,
      hardWindow:       false,

      // visual customisation (loaded from cookies)
      suitColors:       {},
      backColors:       {
        center: '#000000', edge1: '#333333', edge2: '#666666',
        edge3: '#999999', outline: '#ffffff', edgeWidth: 6
      },
      suitSize:         90,
      rankSize:         65,
    };
  }

  let _state = _makeInitialState();

  // ─── Subscriber registry ──────────────────────────────────────────────────
  const _subscribers = new Set();

  function subscribe(fn) {
    _subscribers.add(fn);
    return () => _subscribers.delete(fn);
  }

  function _notify(changedKeys) {
    _subscribers.forEach(fn => {
      try { fn(changedKeys, _state); }
      catch (e) { console.error('gameState subscriber error', e); }
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  function getState() {
    return _state;
  }

  // Shallow-merge patch into state, then notify subscribers with the list of
  // changed keys.  Deep objects (hands, subcontractCards, etc.) are replaced
  // by reference — callers must pass a new object / array when mutating them.
  function setState(patch) {
    const changed = Object.keys(patch);
    Object.assign(_state, patch);
    _notify(changed);
  }

  // Full reset between games (keeps roundHistory for a rematch flow if desired)
  function resetState() {
    _state = _makeInitialState();
    _notify(['*']);
  }

  // Convenience: add a unique numeric ID to every card in an array.
  // Called by initDeck before dealing so that identical rank+suit pairs are
  // distinguishable by object identity when tracking staged cards.
  let _nextCardId = 0;
  function stampCards(cards) {
    cards.forEach(c => { if (c._id === undefined) c._id = _nextCardId++; });
    return cards;
  }

  // ─── Read helpers (avoid recalculating in every consumer) ─────────────────

  function getPlayerHand(playerName) {
    return _state.hands[playerName] || [];
  }

  function getPlayerSubcontract(playerName) {
    return _state.subcontractCards[playerName] || [];
  }

  function isMyTurn(playerIdx) {
    return _state.currentTurnIdx === playerIdx;
  }

  function hasLaidDown(playerIdx) {
    return _state.laidDownPlayers.has(playerIdx);
  }

  function currentPlayerName() {
    return _state.players[_state.currentTurnIdx] ?? null;
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  window.gameState = {
    getState,
    setState,
    resetState,
    stampCards,
    subscribe,
    // read helpers
    getPlayerHand,
    getPlayerSubcontract,
    isMyTurn,
    hasLaidDown,
    currentPlayerName,
    // constants (read-only)
    CARD_WIDTH,
    CARD_HEIGHT,
    CARD_OVERLAP,
    OVERLAP_PCT,
    CONTRACT_SUB_AREAS,
    ROUND_CONTRACT_LABELS,
    ROUND_REQUIREMENTS,
    RANK_ORDER,
    SUIT_ORDER,
  };
})();
