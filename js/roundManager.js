// roundManager.js
// Owns the game lifecycle: table initialisation, player creation, layout,
// the draw action, turn transitions, the buy clock, lay-down handling, and
// round-to-round progression.
//
// After the refactor this file is the orchestrator — it calls into
// validator.js, scoring.js, cardRenderer.js, dragDrop.js, and aiEngine.js
// but contains no validation, rendering, scoring, or AI logic itself.
//
// Depends on:  gameState.js  validator.js  scoring.js
//              cardRenderer.js  dragDrop.js  aiEngine.js  initDeck.js
// Loaded by:   table.html

(() => {
  const { getState, setState, stampCards, CONTRACT_SUB_AREAS } = window.gameState;

  // ─── Cookie helper ────────────────────────────────────────────────────────
  // Uses indexOf('=') to correctly handle JSON values that contain '=' chars.
  // (The setup.js version used split('=')[0] which truncated such values.)

  function getCookie(name) {
    if (!document.cookie) return null;
    for (const pair of document.cookie.split('; ')) {
      const i = pair.indexOf('=');
      if (i === -1) continue;
      const k = pair.substring(0, i);
      if (k !== name) continue;
      try { return decodeURIComponent(pair.substring(i + 1)); }
      catch { return pair.substring(i + 1); }
    }
    return null;
  }

  // ─── Utility helpers ──────────────────────────────────────────────────────

  function safeNumber(val, fallback) {
    const n = Number(val);
    return Number.isNaN(n) ? fallback : n;
  }

  // ─── Customisation loaders ────────────────────────────────────────────────

  function _setDefaultSuitColors() {
    return {
      diamonds: { symbol: '#ffff5c', background: '#bbb', outline: '#444' },
      clubs:    { symbol: '#00e9f1', background: '#bbb', outline: '#444' },
      hearts:   { symbol: '#e97311', background: '#bbb', outline: '#444' },
      spades:   { symbol: '#01ff05', background: '#bbb', outline: '#444' },
      stars:    { symbol: 'white',   background: '#bbb', outline: '#444' }
    };
  }

  function _setDefaultBackColors() {
    return {
      center: '#f9d71c', edge1: '#e39e13', edge2: '#cf7518',
      edge3: '#a05108', outline: '#3a2e01', edgeWidth: 6
    };
  }

  function _loadCustomization() {
    try {
      const ccStr = getCookie('cardCustom');
      if (!ccStr) {
        setState({ suitColors: _setDefaultSuitColors(), backColors: _setDefaultBackColors() });
        return;
      }
      const cc = JSON.parse(ccStr);

      // setup.js stores suitColors as { diamonds: { symbol, background }, ... }
      // without an outline field. We derive a sensible outline from the background.
      const suitColors = cc.suitColors
        ? Object.fromEntries(
            Object.entries(cc.suitColors).map(([k, v]) => [k, {
              symbol:     v.symbol     || 'white',
              background: v.background || '#000',
              outline:    v.outline    || v.background || '#000',
            }])
          )
        : _setDefaultSuitColors();

      const backColors = cc.backColors
        ? { ..._setDefaultBackColors(), ...cc.backColors, edgeWidth: safeNumber(cc.backColors?.edgeWidth, 6) }
        : _setDefaultBackColors();

      setState({
        suitColors,
        backColors,
        suitSize: safeNumber(cc.suitSize, 90),
        rankSize:  safeNumber(cc.rankSize, 65),
      });
    } catch (e) {
      console.warn('Failed to parse cardCustom cookie', e);
      setState({ suitColors: _setDefaultSuitColors(), backColors: _setDefaultBackColors() });
    }
  }

  function _loadRules() {
    try {
      const crStr = getCookie('customRules');
      return crStr ? JSON.parse(crStr) : {};
    } catch { return {}; }
  }

  // ─── DOM references ───────────────────────────────────────────────────────

  let tableContainer, drawPileDiv, discardPileDiv, playersContainer, contractsContainer;
  let contracts = []; // contract DOM element per player index

  // ─── initTable ────────────────────────────────────────────────────────────
  // Entry point called from table.html with the player names from localStorage.

  async function initTable(playerNames) {
    tableContainer    = document.getElementById('table-container');
    drawPileDiv       = document.getElementById('drawPile');
    discardPileDiv    = document.getElementById('discardPile');
    playersContainer  = document.getElementById('playersContainer');
    contractsContainer = document.getElementById('contractsContainer');

    if (!tableContainer || !drawPileDiv || !discardPileDiv) {
      console.error('roundManager: required DOM elements missing');
      return;
    }

    // Load customisation into gameState before any rendering.
    _loadCustomization();

    const rules = _loadRules();
    window.gameRules = {
      extraDeck:     Boolean(rules.extraDeckChk),
      extraSuit:     Boolean(rules.extraSuitChk),
      wrapAround:    Boolean(rules.wrapRunsChk),
      wildsEnabled:  rules.wildCardsChk !== false,
      wildType:      rules.wildType  || 'classic',
      wildSwap:      rules.wildSwap  || 'off',
      fastBuy:       rules.fastBuyChk !== false,
      optOut:        Boolean(rules.optOutChk),
      selfDiscard:   Boolean(rules.selfDiscardChk),
      buyClock:      safeNumber(rules.buyClock, 16),
      softShanghai:  Boolean(rules.softShanghaiChk),
      hardShanghai:  Boolean(rules.hardShanghaiChk),
      finalShanghai: Boolean(rules.finalShanghaiChk),
    };

    // AI data (isAI[], difficulties[]) is stored inside gameSetup by setup.js.
    let aiData = null;
    try {
      const raw = localStorage.getItem('gameSetup');
      if (raw) {
        const gs  = JSON.parse(raw);
        if (gs.isAI && gs.difficulties) {
          aiData = { isAI: gs.isAI, difficulties: gs.difficulties };
        }
      }
    } catch {}
    window.aiData = aiData;

    // Randomise starting player.
    const startIdx = Math.floor(Math.random() * playerNames.length);

    // Initialise gameState with players.
    const subcontractCards = {};
    const hands            = {};
    playerNames.forEach(p => { subcontractCards[p] = []; hands[p] = []; });
    setState({
      players:          playerNames,
      hands,
      subcontractCards,
      roundIndex:       1,
      currentTurnIdx:   startIdx,
      roundStarterIdx:  startIdx,
      laidDownPlayers:  new Set(),
      roundFinished:    false,
      softWindow:       false,
      hardWindow:       false,
      roundHistory:     [],
    });

    // Create player DOM elements and contract areas.
    _createPlayers(playerNames);
    layoutPiles();
    layoutPlayers();

    // Build and deal deck.
    const deckInst = new window.initDeck();
    window.initDeckInstance = deckInst;
    deckInst.createDeck(playerNames.length);
    stampCards(deckInst.drawPile);
    const dealt = deckInst.dealCards(playerNames);

    // Apply initial hand sort — rounds 1 & 4 (sets only) sort by rank;
    // all other rounds sort by suit then rank.
    playerNames.forEach(p => { dealt[p] = _sortHand(dealt[p], 1); });

    // Push dealt hands and piles into gameState.
    setState({
      hands:       dealt,
      drawPile:    deckInst.drawPile,
      discardPile: [],
    });

    // Render initial state.
    layoutPiles();
    layoutPlayers();
    _buildContractSubAreas(1);
    _renderHands();
    window.cardRenderer.renderDiscardPile();
    window.cardRenderer.renderAllSubcontractAreas();
    window.scoring.updatePlayerStats(getState().hands);

    // Log every player's starting hand.
    const dealtState = getState();
    dealtState.players.forEach(p => {
      window.gameLog?.log({
        cat: { label: 'Dealt', color: '#f39c12' },
        html: `<strong>${p}</strong>: ${window.gameLog.fmtCards(dealtState.hands[p])}`
      });
    });

    // Mark starting player's turn.
    const startDiv = document.getElementById(`player-${startIdx}`);
    if (startDiv) startDiv.classList.add('MyTurn');
    setState({ currentTurnIdx: startIdx, hasDrawn: false });

    // Wire draw pile click — must happen here for turn 1 and again in
    // resetTurnState for every subsequent turn.
    _wireDrawPileClick();

    window.dragDrop.setupDragDrop();

    // Show round 1 announcement, then start.
    window.gameLog.logRound(1, window.gameState.ROUND_CONTRACT_LABELS[0]);
    await window.scoring.showRoundPopup(1);

    // Kick off AI turn if the starting player is an AI.
    if (aiData?.isAI?.[startIdx]) {
      setTimeout(() => window.aiEngine.executeAITurn(startIdx, aiData.difficulties[startIdx]), 500);
    }

    window.addEventListener('resize', () => { layoutPiles(); layoutPlayers(); });
  }

  // ─── startNextRound ───────────────────────────────────────────────────────

  async function startNextRound() {
    const { roundIndex, players } = getState();
    const nextRound = roundIndex + 1;
    if (nextRound > 7) return; // Should not happen — showScoresPopup guards this.

    // Reset per-round gameState.
    const subcontractCards = {};
    const hands            = {};
    players.forEach(p => { subcontractCards[p] = []; hands[p] = []; });
    setState({
      roundIndex:      nextRound,
      hasDrawn:        false,
      laidDownPlayers: new Set(),
      roundFinished:   false,
      softWindow:      false,
      hardWindow:      false,
      subcontractCards,
    });

    // Remove all HasLaidDown / MyTurn / HasDrawn / Idiscarded classes.
    players.forEach((_, i) => {
      const div = document.getElementById(`player-${i}`);
      if (!div) return;
      div.classList.remove('HasLaidDown', 'MyTurn', 'HasDrawn', 'Idiscarded');
      const btn = div.querySelector('.lay-down-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Lay Down'; btn.style.backgroundColor = ''; }
      const buysDiv = div.querySelector('.stat-buys');
      if (buysDiv) buysDiv.textContent = 'Buys: 3';
    });

    // Rebuild deck using initDeck — respects all gameRules including extraDeck.
    const deckInst = window.initDeckInstance || new window.initDeck();
    window.initDeckInstance = deckInst;
    deckInst.createDeck(players.length);
    stampCards(deckInst.drawPile);
    const dealt = deckInst.dealCards(players);
    players.forEach(p => { dealt[p] = _sortHand(dealt[p], nextRound); });
    setState({
      hands:       dealt,
      drawPile:    deckInst.drawPile,
      discardPile: [],
    });

    _buildContractSubAreas(nextRound);
    _renderHands();
    window.cardRenderer.renderDiscardPile();
    window.cardRenderer.renderAllSubcontractAreas();
    window.scoring.updatePlayerStats(getState().hands);

    // Log every player's starting hand for the new round.
    const { hands: dealtHands, players: pnames } = getState();
    pnames.forEach(p => {
      window.gameLog?.log({
        cat: { label: 'Dealt', color: '#f39c12' },
        html: `<strong>${p}</strong>: ${window.gameLog.fmtCards(dealtHands[p])}`
      });
    });

    // Rotate start player.
    const { roundStarterIdx } = getState();
    const nextStartIdx = (roundStarterIdx + 1) % players.length;
    setState({ roundStarterIdx: nextStartIdx, currentTurnIdx: nextStartIdx });

    const startDiv = document.getElementById(`player-${nextStartIdx}`);
    if (startDiv) startDiv.classList.add('MyTurn');

    _wireDrawPileClick();
    window.dragDrop.setupDragDrop();

    window.gameLog.logRound(nextRound, window.gameState.ROUND_CONTRACT_LABELS[nextRound - 1]);
    await window.scoring.showRoundPopup(nextRound);

    // Kick off AI if starting player is AI.
    const aiData = window.aiData;
    if (aiData?.isAI?.[nextStartIdx]) {
      setTimeout(() => window.aiEngine.executeAITurn(nextStartIdx, aiData.difficulties[nextStartIdx]), 500);
    }
  }

  // ─── resetTurnState ───────────────────────────────────────────────────────
  // Called after every discard (human or AI) to advance to the next player.

  async function resetTurnState(newTurnIdx) {
    const { players } = getState();

    setState({ hasDrawn: false });

    // Find who just discarded (was MyTurn) and mark them as Idiscarded.
    const oldTurnIdx = getState().currentTurnIdx;
    players.forEach((_, i) => {
      const div = document.getElementById(`player-${i}`);
      if (!div) return;
      div.classList.remove('HasDrawn', 'Idiscarded');
      if (i === oldTurnIdx) div.classList.add('Idiscarded');
      div.classList.remove('MyTurn');
    });

    setState({ currentTurnIdx: newTurnIdx });

    const newDiv = document.getElementById(`player-${newTurnIdx}`);
    if (newDiv) newDiv.classList.add('MyTurn');

    // Re-render all hands with correct draggability for the new turn player.
    _renderHands();
    window.cardRenderer.renderAllSubcontractAreas();
    window.scoring.updatePlayerStats(getState().hands);

    // Re-wire draw pile click for the new player.
    if (drawPileDiv) {
      const fresh = drawPileDiv.cloneNode(true);
      drawPileDiv.replaceWith(fresh);
      drawPileDiv = fresh;
      // Re-apply back colour styling after clone.
      layoutPiles();
    }
    _wireDrawPileClick();

    // Buy clock then AI/human continuation.
    const aiData = window.aiData;
    const isAI   = aiData?.isAI?.[newTurnIdx] ?? false;

    await _showBuyClockPopup(oldTurnIdx, newTurnIdx);

    window.dragDrop.setupDragDrop();
    window.cardRenderer.updateDiscardPlayableIndicator();

    if (isAI) {
      setTimeout(() => window.aiEngine.executeAITurn(newTurnIdx, aiData.difficulties[newTurnIdx]), 800);
    }
  }

  // ─── drawCardFrom ─────────────────────────────────────────────────────────
  // Shared draw path used by human clicks, buy clock, and AI draw step.

  function drawCardFrom(source, playerIdx) {
    const state = getState();
    if (playerIdx === undefined) playerIdx = state.currentTurnIdx;
    if (playerIdx < 0) return;

    // Guard: don't draw twice as the active player.
    if (state.hasDrawn && playerIdx === state.currentTurnIdx) return;

    let card = null;
    const newDrawPile    = [...state.drawPile];
    const newDiscardPile = [...state.discardPile];

    if (source === 'draw') {
      // Reshuffle discard into draw when only 1 card remains.
      if (newDrawPile.length <= 1 && newDiscardPile.length > 1) {
        const result = window.initDeckInstance.reshuffle(newDrawPile, newDiscardPile);
        if (result) {
          newDrawPile.splice(0, newDrawPile.length, ...result.drawPile);
          newDiscardPile.splice(0, newDiscardPile.length, ...result.discardPile);
        }
      }
      if (!newDrawPile.length) return;
      card = newDrawPile.pop();
    } else if (source === 'discard') {
      if (!newDiscardPile.length) return;
      card = newDiscardPile.pop();
    }

    if (!card) return;

    // Stamp _id if somehow missing (e.g. reshuffled cards from old sessions).
    stampCards([card]);

    const newHands  = { ...state.hands };
    const player    = state.players[playerIdx];
    newHands[player] = [...(newHands[player] || []), card];

    // Log the draw action.
    window.gameLog?.logDraw(player, source, card);

    const patch = {
      hands:       newHands,
      drawPile:    newDrawPile,
      discardPile: newDiscardPile,
    };

    // Mark hasDrawn only for the active player.
    if (playerIdx === state.currentTurnIdx) {
      patch.hasDrawn = true;
    }

    setState(patch);

    // DOM feedback for the active player's HasDrawn state.
    if (playerIdx === state.currentTurnIdx) {
      const div = document.getElementById(`player-${playerIdx}`);
      if (div) div.classList.add('HasDrawn');
    }

    // Re-render.
    const handDiv = document.getElementById(`hand-${playerIdx}`);
    if (handDiv) {
      window.cardRenderer.renderCardArray(
        getState().hands[player], handDiv,
        playerIdx === getState().currentTurnIdx, playerIdx, 'hand'
      );
    }
    window.cardRenderer.renderDiscardPile();
    window.scoring.updatePlayerStats(getState().hands);
    window.cardRenderer.updateDiscardPlayableIndicator();

    // Refresh lay-down button validity after drawing.
    window.cardRenderer.validateLayDown(playerIdx);
  }

  // ─── LayDownClick ─────────────────────────────────────────────────────────

  function LayDownClick(event) {
    const btn = event?.target?.closest('.lay-down-btn');
    if (!btn) return;
    const playerDiv = btn.closest('.player');
    if (!playerDiv) return;
    const playerIdx = Number(playerDiv.id.split('-')[1]);
    if (isNaN(playerIdx) || playerIdx < 0) return;

    const state = getState();

    // Only the active player can lay down.
    if (state.currentTurnIdx !== playerIdx) return;

    // Must have drawn first.
    if (!state.hasDrawn) {
      btn.textContent = 'Must Draw First';
      setTimeout(() => { btn.textContent = 'Lay Down'; }, 1500);
      return;
    }

    const player = state.players[playerIdx];

    // Must have cards in hand.
    if (!state.hands[player]?.length) {
      btn.textContent = 'No Cards to Lay';
      setTimeout(() => { btn.textContent = 'Lay Down'; }, 1500);
      return;
    }

    // Validate all subcontract areas.
    const subAreas   = window.getSubcontractSubAreas(playerIdx);
    const flatSubs   = state.subcontractCards[player] || [];
    const allValid   = subAreas.every((sub, areaIdx) => {
      const label      = (sub.dataset.label || '').toLowerCase();
      const areaCards  = flatSubs.filter(c => c.subArea === areaIdx);
      if (label.includes('set')) return window.validator.isValidSet(areaCards);
      if (label.includes('run')) return window.validator.isValidRun(areaCards);
      return false;
    });

    if (!allValid) {
      btn.textContent = 'Invalid Lay‑Down';
      setTimeout(() => { btn.textContent = 'Lay Down'; }, 1500);
      return;
    }

    // Activate Shanghai windows — BUG FIX #4/#5 delegated to scoring.js.
    const alreadyLaidCount = state.laidDownPlayers.size;
    if (alreadyLaidCount === 0) {
      window.scoring.activateShanghaiWindows();
    } else if (alreadyLaidCount === 1) {
      // Second player to lay down closes the soft window.
      setState({ softWindow: false });
    }

    // Mark laid down in gameState (not just DOM).
    const newLaid = new Set(state.laidDownPlayers);
    newLaid.add(playerIdx);
    setState({ laidDownPlayers: newLaid });

    playerDiv.classList.add('HasLaidDown');
    btn.disabled = true;
    btn.style.backgroundColor = '';
    btn.textContent = 'Laid Down';

    // Log the lay-down with each area's cards.
    const logAreas = subAreas.map((sub, areaIdx) => ({
      label: sub.dataset.label || `Area ${areaIdx}`,
      cards: flatSubs.filter(c => c.subArea === areaIdx)
    }));
    window.gameLog?.logLayDown(player, logAreas);

    window.cardRenderer.renderAllSubcontractAreas();
    window.dragDrop.setupDragDrop();

    window.dispatchEvent(new CustomEvent('playerLaidDown', { detail: { playerIndex: playerIdx } }));
  }

  // ─── refreshLayButtons ────────────────────────────────────────────────────
  // Called by aiEngine after staging to update the Lay Down button state for
  // the active player without a full re-render.

  function refreshLayButtons() {
    const { currentTurnIdx } = getState();
    if (currentTurnIdx === -1) return;
    window.cardRenderer.validateLayDown(currentTurnIdx);
  }

  // ─── Buy clock ────────────────────────────────────────────────────────────
  // Returns a Promise that resolves when the clock expires or all players act.
  // oldTurnIdx = the player who just discarded (whose card is up for buying)
  // newTurnIdx = the player whose turn is beginning (has veto right)

  async function _showBuyClockPopup(oldTurnIdx, newTurnIdx) {
    const state = getState();

    // Don't show if anyone has 0 cards (round just ended).
    const anyEmpty = state.players.some((p) => (state.hands[p] || []).length === 0);
    if (anyEmpty || state.roundFinished) return;

    // Reset hardWindow at each turn boundary — it will be re-set only if
    // the first player to lay down goes out that same turn.
    if (window.gameRules.hardShanghai || window.gameRules.finalShanghai) {
      // Only reset if no-one has laid down yet — once set by LayDownClick it
      // should persist until clearHardWindowIfNeeded clears it on each discard.
      // (The window is already managed by clearHardWindowIfNeeded in dragDrop.)
    }

    const rules      = window.gameRules;
    const buyTimeOrig = safeNumber(rules.buyClock, 16);
    let   buyTime    = buyTimeOrig;
    const optOut     = Boolean(rules.optOut);
    const selfDiscard = Boolean(rules.selfDiscard);
    const fastBuy    = Boolean(rules.fastBuy !== false);
    const clickOrder = [];

    const { discardPile } = state;
    if (!discardPile.length) return; // No card to buy.

    // Build list of eligible players.
    // newTurnIdx always appears (veto right, unlimited).
    // Others: must have buys remaining; excluded if they just discarded and
    // selfDiscard is off.
    const buyPlayers = state.players.map((name, i) => {
      const div    = document.getElementById(`player-${i}`);
      const buysEl = div?.querySelector('.stat-buys');
      const buys   = safeNumber(buysEl?.textContent?.split(':')[1]?.trim(), 0);
      const justDiscarded = i === oldTurnIdx;

      if (i === newTurnIdx) {
        return { playerIndex: i, name, buys, isMyTurn: true };
      }
      if (buys === 0) return null;
      if (justDiscarded && !selfDiscard) return null;
      return { playerIndex: i, name, buys, isMyTurn: false };
    }).filter(Boolean);

    // Only show if there's at least one other potential buyer besides newTurnIdx.
    const hasOtherBuyers = buyPlayers.some(p => !p.isMyTurn);
    if (!hasOtherBuyers) return;

    return new Promise(resolve => {
      const container = document.createElement('div');
      container.id    = 'buy-clock-popup';
      container.className = 'buy-clock-popup';

      const title = document.createElement('h2');
      title.className = 'buy-clock-title';
      title.textContent = `Buying Round - Time left: ${buyTime}s`;
      container.appendChild(title);

      // Show the card being offered.
      const discardWrapper = document.createElement('div');
      discardWrapper.className = 'buy-clock-discard-wrapper';
      const topDiscard = discardPile[discardPile.length - 1];
      if (topDiscard) {
        const cardDiv = window.cardRenderer.createCardDiv(topDiscard, true);
        cardDiv.classList.add('buy-clock-discard-card');
        discardWrapper.appendChild(cardDiv);
      }
      const countdownSpan = document.createElement('span');
      countdownSpan.className = 'buy-clock-countdown';
      countdownSpan.textContent = buyTime;
      discardWrapper.appendChild(countdownSpan);
      container.appendChild(discardWrapper);

      // Build player buttons.
      const btnWrapper = document.createElement('div');
      btnWrapper.className = 'buy-clock-buttons-wrapper';
      if (state.players.length >= 7) {
        btnWrapper.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:20px 24px;';
      }

      const buyingState   = {};
      const declinedState = {};
      state.players.forEach((_, i) => { buyingState[i] = false; declinedState[i] = false; });

      const activePIs = buyPlayers.map(p => p.playerIndex);
      const allActed  = () => activePIs.every(i => buyingState[i] || declinedState[i]);

      buyPlayers.forEach(({ playerIndex: i, name, isMyTurn }) => {
        const wrap = document.createElement('div');
        wrap.className = 'buy-clock-player-wrap';

        const lbl = document.createElement('div');
        lbl.className   = 'buy-clock-player-name';
        lbl.textContent = name;
        wrap.appendChild(lbl);

        const buyBtn = document.createElement('button');
        buyBtn.type      = 'button';
        buyBtn.className = 'buy-clock-btn';
        buyBtn.textContent = isMyTurn ? 'Not Taking' : 'Not Buying';
        wrap.appendChild(buyBtn);

        const declBtn = document.createElement('button');
        declBtn.type      = 'button';
        declBtn.className = 'buy-clock-btn';
        declBtn.textContent = 'Decline';
        declBtn.style.cssText = 'background-color:#c9302c;margin-top:6px;';
        wrap.appendChild(declBtn);

        buyBtn.addEventListener('click', () => {
          if (buyBtn.disabled) return;
          if (optOut) {
            buyingState[i] = !buyingState[i];
            buyBtn.textContent = buyingState[i]
              ? (isMyTurn ? 'Taking' : 'Buying')
              : (isMyTurn ? 'Not Taking' : 'Not Buying');
            buyBtn.classList.toggle('buying', buyingState[i]);
            if (buyingState[i]) { declBtn.disabled = false; declBtn.textContent = 'Decline'; declinedState[i] = false; }
          } else {
            if (buyingState[i]) return;
            buyingState[i] = true;
            buyBtn.textContent = isMyTurn ? 'Taking' : 'Buying';
            buyBtn.classList.add('buying');
            buyBtn.disabled = true;
            if (fastBuy && !clickOrder.includes(i)) clickOrder.push(i);
          }
          if (isMyTurn && buyingState[i]) {
            buyTime = Math.ceil(buyTime / 2);
            countdownSpan.textContent = buyTime;
            title.textContent = `Buying Round - Time left: ${buyTime}s`;
          }
          if (allActed()) { buyTime = 0; countdownSpan.textContent = '0'; title.textContent = 'Buying Round - Time left: 0s'; }
        });

        declBtn.addEventListener('click', () => {
          if (declBtn.disabled) return;
          declinedState[i] = true;
          declBtn.textContent = 'Declined';
          declBtn.disabled = true;
          if (buyingState[i]) {
            buyingState[i] = false;
            buyBtn.textContent = isMyTurn ? 'Not Taking' : 'Not Buying';
            buyBtn.classList.remove('buying');
            if (!optOut) buyBtn.disabled = true;
          }
          if (allActed()) { buyTime = 0; countdownSpan.textContent = '0'; title.textContent = 'Buying Round - Time left: 0s'; }
        });

        btnWrapper.appendChild(wrap);
      });

      container.appendChild(btnWrapper);
      document.body.appendChild(container);

      // ── AI auto-buy decisions ────────────────────────────────────────────
      // Fire immediately after the popup renders. Each AI player evaluates
      // whether to buy using aiEngine.shouldBuy, then simulates a button
      // click on their own buy/decline button.
      // We use a short delay so the popup is visible to the human player
      // before AI decisions collapse the clock.
      setTimeout(() => {
        buyPlayers.forEach(({ playerIndex: i, isMyTurn }) => {
          const aiData = window.aiData;
          if (!aiData?.isAI?.[i]) return; // Skip human players.
          if (isMyTurn) return;           // myTurn player veto handled separately.

          const topDiscard = getState().discardPile[getState().discardPile.length - 1];
          if (!topDiscard) return;

          const wantsToBuy = window.aiEngine.shouldBuy(i, topDiscard);
          // Find this player's button wrap and trigger the appropriate button.
          const wraps = btnWrapper.querySelectorAll('.buy-clock-player-wrap');
          wraps.forEach(wrap => {
            const lbl = wrap.querySelector('.buy-clock-player-name');
            if (lbl?.textContent !== getState().players[i]) return;
            const btn = wrap.querySelector('.buy-clock-btn');
            if (!btn || btn.disabled) return;
            if (wantsToBuy) {
              window.gameLog?.logBuy(getState().players[i], topDiscard, false);
              btn.click();
              if (fastBuy && !clickOrder.includes(i)) clickOrder.push(i);
            } else {
              window.gameLog?.logDecline(getState().players[i]);
              const declBtn = wrap.querySelectorAll('.buy-clock-btn')[1];
              if (declBtn && !declBtn.disabled) declBtn.click();
            }
          });
        });
      }, 300);

      const intervalId = setInterval(() => {
        buyTime--;
        if (buyTime >= 0) {
          countdownSpan.textContent = buyTime;
          title.textContent = `Buying Round - Time left: ${buyTime}s`;
        }
        if (buyTime <= 0) {
          clearInterval(intervalId);
          container.remove();
          _processBuyResults(buyingState, newTurnIdx, fastBuy, clickOrder);
          resolve();
        }
      }, 1000);
    });
  }

  // ─── Process buy results ──────────────────────────────────────────────────

  function _processBuyResults(buyingState, newTurnIdx, fastBuy, clickOrder) {
    const state   = getState();
    const buyers  = Object.entries(buyingState)
      .filter(([, v]) => v)
      .map(([k]) => Number(k));
    if (!buyers.length) return;

    const myBuying     = buyingState[newTurnIdx];
    const otherBuyers  = buyers.filter(i => i !== newTurnIdx);

    // newTurnIdx "taking" the discard = their draw for this turn.
    // No buy decrement; no extra draw-pile card.
    if (myBuying) {
      const topCard = state.discardPile[state.discardPile.length - 1];
      window.gameLog?.logBuy(state.players[newTurnIdx], topCard, true);
      drawCardFrom('discard', newTurnIdx);
      return;
    }

    if (!otherBuyers.length) return;

    // Determine winner among other buyers.
    let buyerIdx;
    if (fastBuy) {
      buyerIdx = clickOrder.find(i => otherBuyers.includes(i));
      if (buyerIdx === undefined) buyerIdx = Math.min(...otherBuyers);
    } else {
      const order   = state.players.map((_, i) => i);
      const shifted = order.slice(newTurnIdx + 1).concat(order.slice(0, newTurnIdx + 1));
      buyerIdx = shifted.find(i => otherBuyers.includes(i));
    }
    if (buyerIdx === undefined) return;

    const boughtCard = state.discardPile[state.discardPile.length - 1];
    window.gameLog?.logBuy(state.players[buyerIdx], boughtCard, false);

    // Buyer gets discard + draw-pile card and spends a buy.
    drawCardFrom('draw',    buyerIdx);
    drawCardFrom('discard', buyerIdx);
    _decrementBuys(buyerIdx);

    // Remove HasDrawn from buyer (they bought between turns).
    const buyerDiv = document.getElementById(`player-${buyerIdx}`);
    if (buyerDiv) buyerDiv.classList.remove('HasDrawn');

    _renderHands();
    window.cardRenderer.renderDiscardPile();
    window.cardRenderer.renderAllSubcontractAreas();
  }

  function _decrementBuys(playerIdx) {
    const div    = document.getElementById(`player-${playerIdx}`);
    const buysEl = div?.querySelector('.stat-buys');
    if (!buysEl) return;
    const val = Math.max(0, safeNumber(buysEl.textContent.split(':')[1]?.trim(), 0) - 1);
    buysEl.textContent = `Buys: ${val}`;
  }

  // ─── Player + contract DOM creation ──────────────────────────────────────

  function _createPlayers(playerNames) {
    if (playersContainer)  playersContainer.innerHTML  = '';
    if (contractsContainer) contractsContainer.innerHTML = '';
    contracts = [];

    // Inject a one-time style for hand-area min-width.
    const st = document.createElement('style');
    st.textContent = '.hand-area{min-width:40px;}';
    document.head.appendChild(st);

    playerNames.forEach((name, i) => {
      // ── Player panel ──────────────────────────────────────────────────
      const playerDiv = document.createElement('div');
      playerDiv.className = 'player';
      playerDiv.id        = `player-${i}`;
      playerDiv.style.position = 'absolute';

      const nameplate = document.createElement('div');
      nameplate.className   = 'nameplate';
      nameplate.textContent = name;

      const layBtn = document.createElement('button');
      layBtn.className   = 'lay-down-btn';
      layBtn.type        = 'button';
      layBtn.textContent = 'Lay Down';
      layBtn.disabled    = true;
      layBtn.addEventListener('click', LayDownClick);

      const stats     = document.createElement('div');
      stats.className = 'stats';
      const topRow    = document.createElement('div');
      topRow.style.cssText = 'display:flex;justify-content:space-between;width:100%;';
      const buysDiv   = document.createElement('div');
      buysDiv.className   = 'stat-buys';
      buysDiv.textContent = 'Buys: 3';
      const heldDiv   = document.createElement('div');
      heldDiv.className   = 'stat-held';
      heldDiv.textContent = 'Held: 0';
      topRow.appendChild(buysDiv);
      topRow.appendChild(heldDiv);

      const bottomRow = document.createElement('div');
      bottomRow.style.cssText = 'display:flex;justify-content:space-between;width:100%;';
      const cardsDiv  = document.createElement('div');
      cardsDiv.className   = 'stat-cards';
      cardsDiv.textContent = 'Cards: 0';
      const scoreDiv  = document.createElement('div');
      scoreDiv.className   = 'stat-score';
      scoreDiv.textContent = 'Score: 0';
      bottomRow.appendChild(cardsDiv);
      bottomRow.appendChild(scoreDiv);

      stats.appendChild(topRow);
      stats.appendChild(bottomRow);

      const handArea    = document.createElement('div');
      handArea.className = 'hand-area';
      handArea.id        = `hand-${i}`;
      handArea.style.cssText = 'position:relative;display:flex;align-items:center;margin-top:8px;overflow:visible;';

      playerDiv.appendChild(nameplate);
      playerDiv.appendChild(layBtn);
      playerDiv.appendChild(stats);
      playerDiv.appendChild(handArea);
      playersContainer.appendChild(playerDiv);

      // ── Contract area ─────────────────────────────────────────────────
      const contractDiv = document.createElement('div');
      contractDiv.className = 'contract-area';
      contractDiv.id        = `contract-${i}`;
      contractDiv.style.cssText = 'display:inline-block;white-space:nowrap;';
      contractsContainer.appendChild(contractDiv);
      contracts[i] = contractDiv;
    });
  }

  // ─── Build contract sub-areas for a given round ───────────────────────────

  function _buildContractSubAreas(roundNum) {
    const { backColors } = getState();
    const labels  = CONTRACT_SUB_AREAS[roundNum] || [];
    contracts.forEach((contractDiv, i) => {
      if (!contractDiv) return;
      contractDiv.innerHTML = '';
      const wrapper = document.createElement('div');
      wrapper.className = 'contract-subareas-wrapper';
      wrapper.style.borderColor = backColors?.outline || '#3a2e01';
      contractDiv.appendChild(wrapper);
      labels.forEach(label => {
        const sub = document.createElement('div');
        sub.className          = 'contract-subarea';
        sub.dataset.label      = label;
        sub.dataset.playerIndex = String(i);
        const lbl = document.createElement('span');
        lbl.textContent = label;
        sub.appendChild(lbl);
        wrapper.appendChild(sub);
      });
    });
  }

  // ─── Hand sort ────────────────────────────────────────────────────────────
  // Rounds 1 & 4 (sets-only contracts): sort by rank then suit.
  // All other rounds: sort by suit then rank within suit.

  function _sortHand(cards, roundNum) {
    const { RANK_ORDER, SUIT_ORDER } = window.gameState;
    const rankIdx = c => {
      const i = RANK_ORDER.indexOf(c.rank);
      return i === -1 ? 99 : i;
    };
    const suitIdx = c => {
      const i = SUIT_ORDER.indexOf(c.suit);
      return i === -1 ? 99 : i;
    };
    const setsOnlyRounds = new Set([1, 4]);
    if (setsOnlyRounds.has(roundNum)) {
      // Sort by rank first, then suit for tiebreak.
      return [...cards].sort((a, b) => rankIdx(a) - rankIdx(b) || suitIdx(a) - suitIdx(b));
    }
    // All other rounds: group by suit, sort by rank within suit.
    return [...cards].sort((a, b) => suitIdx(a) - suitIdx(b) || rankIdx(a) - rankIdx(b));
  }

  // ─── Draw pile click wiring ───────────────────────────────────────────────
  // Called from initTable (turn 1) and resetTurnState (every subsequent turn).
  // Uses the current drawPileDiv reference — must be called after any
  // cloneNode/replaceWith so it attaches to the live element.

  function _wireDrawPileClick() {
    if (!drawPileDiv) return;
    drawPileDiv.style.cursor = 'pointer';
    drawPileDiv.onclick = () => {
      const { currentTurnIdx: idx, hasDrawn } = getState();
      if (idx !== -1 && !hasDrawn) drawCardFrom('draw', idx);
    };
  }

  // ─── Layout ───────────────────────────────────────────────────────────────

  function layoutPiles() {
    if (!tableContainer || !drawPileDiv || !discardPileDiv) return;
    const { backColors } = getState();
    const cw = tableContainer.clientWidth;
    const ch = tableContainer.clientHeight;
    const spacing   = 160;
    const pileW     = drawPileDiv.offsetWidth  || 120;
    const pileH     = drawPileDiv.offsetHeight || 160;
    const centerX   = cw / 2;
    const centerY   = ch / 2;

    drawPileDiv.style.left  = `${centerX - spacing / 2 - pileW / 2}px`;
    drawPileDiv.style.top   = `${centerY - pileH / 2}px`;
    discardPileDiv.style.left = `${centerX + spacing / 2 - pileW / 2}px`;
    discardPileDiv.style.top  = `${centerY - pileH / 2}px`;

    const c    = backColors || {};
    const grad = `radial-gradient(circle at center,${c.center||'#000'} 0%,${c.edge1||'#333'} 25%,${c.edge2||'#666'} 50%,${c.edge3||'#999'} 75%,${c.edge3||'#999'} 80%)`;
    drawPileDiv.style.background  = grad;
    drawPileDiv.style.border      = `${c.edgeWidth || 6}px solid ${c.outline || '#fff'}`;
    drawPileDiv.style.borderRadius = '10px';
    drawPileDiv.style.boxSizing   = 'border-box';
    drawPileDiv.style.lineHeight  = `${pileH}px`;
    drawPileDiv.style.userSelect  = 'none';
  }

  function layoutPlayers() {
    if (!tableContainer || !getState().players.length) return;
    const { players } = getState();
    const w = tableContainer.clientWidth;
    const h = tableContainer.clientHeight;
    const marginH        = 180;
    const marginVTop     = 180;
    const marginVBottom  = 270;
    const topLen         = Math.max(0, w - 2 * marginH);
    const rightLen       = Math.max(0, h - marginVTop - marginVBottom);
    const perimeter      = topLen * 2 + rightLen * 2;
    const cornerInset    = players.length >= 8 ? 110 : 90;

    players.forEach((_, i) => {
      const playerDiv   = document.getElementById(`player-${i}`);
      const contractDiv = contracts[i];
      if (!playerDiv) return;

      let dist      = (i / players.length) * perimeter;
      let sideIndex = 0;
      const sides   = [topLen, rightLen, topLen, rightLen];
      while (sideIndex < 4 && dist > sides[sideIndex]) {
        dist -= sides[sideIndex];
        sideIndex++;
      }

      let x = 0, y = 0;
      switch (sideIndex) {
        case 0: x = marginH + dist;            y = marginVTop;              break;
        case 1: x = w - marginH;               y = marginVTop + dist;       break;
        case 2:
          if      (dist < cornerInset)          x = w - marginH - cornerInset + dist;
          else if (dist > topLen - cornerInset) x = marginH + (dist - (topLen - cornerInset));
          else                                  x = w - marginH - dist;
          y = h - marginVBottom;
          break;
        case 3: x = marginH;                   y = h - marginVBottom - dist; break;
      }

      playerDiv.style.left = `${x}px`;
      playerDiv.style.top  = `${y}px`;

      // Position contract area just below the player panel.
      // offsetHeight may be 0 before first paint — fall back to 180.
      const ph = playerDiv.offsetHeight || 180;
      if (contractDiv) {
        contractDiv.style.left = `${x}px`;
        contractDiv.style.top  = `${y + ph / 2 + 9}px`;
      }
    });
  }

  // ─── Render all hands ────────────────────────────────────────────────────

  function _renderHands() {
    const { players, hands, currentTurnIdx } = getState();
    players.forEach((p, i) => {
      const handDiv = document.getElementById(`hand-${i}`);
      if (!handDiv) return;
      window.cardRenderer.renderCardArray(hands[p], handDiv, i === currentTurnIdx, i, 'hand');
    });
  }

  // ─── Exports ──────────────────────────────────────────────────────────────
  window.roundManager = {
    initTable,
    startNextRound,
    resetTurnState,
    drawCardFrom,
    layoutPiles,
    layoutPlayers,
    refreshLayButtons,
  };

  // Back-compat aliases consumed by dragDrop.js, aiEngine.js, scoring.js.
  window.initTable        = initTable;
  window.startNextRound   = startNextRound;
  window.resetTurnState   = resetTurnState;
  window.drawCardFrom     = drawCardFrom;
  window.validateLayDown  = (idx) => window.cardRenderer.validateLayDown(idx);
  window.refreshLayButtons = refreshLayButtons;
})();
