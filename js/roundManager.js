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

  // Falls back to the localStorage mirror written by setup.js, because cookies
  // are not stored for pages opened directly from disk (file://).
  function getCookie(name) {
    if (document.cookie) {
      for (const pair of document.cookie.split('; ')) {
        const i = pair.indexOf('=');
        if (i === -1) continue;
        const k = pair.substring(0, i);
        if (k !== name) continue;
        try { return decodeURIComponent(pair.substring(i + 1)); }
        catch { return pair.substring(i + 1); }
      }
    }
    try { return localStorage.getItem('cookie:' + name); } catch {}
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
      if (!crStr) return {};
      const rules = JSON.parse(crStr);
      // Ensure wildType is always present — stale cookies may be missing it.
      if (!rules.wildType) rules.wildType = 'Classic';
      // "Extra" wilds are the 3s of the extra suit: without the extra suit there are none.
      if (/^extra$/i.test(rules.wildType) && !rules.extraSuitChk) rules.wildType = 'Classic';
      return rules;
    } catch { return {}; }
  }

  // ─── DOM references ───────────────────────────────────────────────────────

  let tableContainer, drawPileDiv, discardPileDiv, playersContainer, contractsContainer;
  let contracts = []; // contract DOM element per player index

  // ─── initTable ────────────────────────────────────────────────────────────
  // Entry point called from table.html with the player names from localStorage.

  async function initTable(playerNames) {
    _syncViewport();
    window.addEventListener('resize', () => { _syncViewport(); layoutPlayers(true); });
    window.addEventListener('orientationchange', () => setTimeout(() => { _syncViewport(); layoutPlayers(true); }, 250));
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
      wildType:      (rules.wildType  || 'classic').toLowerCase(),
      wildSwap:      (rules.wildSwap  || 'off').toLowerCase(),
      fastBuy:       rules.fastBuyChk !== false,
      optOut:        Boolean(rules.optOutChk),
      selfDiscard:   Boolean(rules.selfDiscardChk),
      buyClock:      Math.min(20, safeNumber(rules.buyClock, 16)),   // setup allows 5-20 s
      softShanghai:  Boolean(rules.softShanghaiChk),
      hardShanghai:  Boolean(rules.hardShanghaiChk),
      finalShanghai: Boolean(rules.finalShanghaiChk),
    };

    console.log('[Shanghai] gameRules:', JSON.stringify(window.gameRules));
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
    // Debug mode = nobody human at the table (computers only): every card is visible.
    window.gameDebug = Boolean(aiData?.isAI?.length) && aiData.isAI.every(Boolean);
    window.gameLog?.log({ cat: { label: 'Rules', color: '#f39c12' },
      html: `Wild type: <strong>${window.gameRules.wildType}</strong> | Wilds enabled: <strong>${window.gameRules.wildsEnabled}</strong> | Extra suit: <strong>${window.gameRules.extraSuit}</strong>` });
    _initRecentLog();

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
    _initHandView();   // before anything is shown: computer hands must never flash face-up

    window.dragDrop.setupDragDrop();

    // Show round 1 announcement, then start.
    window.gameLog.logRound(1, window.gameState.ROUND_CONTRACT_LABELS[0]);
    _resetAutoDecline();
    await window.scoring.showRoundPopup(1);
    await _preRoundClock(1);

    // Kick off AI turn if the starting player is an AI.
    if (aiData?.isAI?.[startIdx]) {
      setTimeout(() => window.aiEngine.executeAITurn(startIdx, aiData.difficulties[startIdx]), 500);
    }

  }

  // Mobile browsers report 100vh as the height WITH the address bar hidden, so anything
  // pinned to the bottom ends up off-screen.  The table is sized from the real visible height.
  function _syncViewport() {
    // innerHeight is the layout viewport: it follows the address bar but NOT pinch-zoom
    // (visualViewport.height shrinks when you zoom in, which would re-layout the table).
    const h = Math.round(window.innerHeight);
    document.documentElement.style.setProperty('--app-h', h + 'px');
  }

  // Auto-decline is switched off at the start of every round (you must opt in again).
  function _resetAutoDecline() {
    try { localStorage.setItem('shanghaiAutoDecline', '0'); } catch {}
    document.querySelectorAll('.auto-decline-input').forEach(cb => { cb.checked = false; });
  }

  // ─── Pre-round clock ──────────────────────────────────────────────────────
  // Before the first player may act, everybody gets a time equal to the buying clock to
  // study their hand and stage cards. Nothing can be drawn and no AI moves until it ends.
  function _preRoundClock(roundNum) {
    const secs = Math.max(1, Math.round(safeNumber(window.gameRules?.buyClock, 16)));
    return new Promise(resolve => {
      window.__preRoundClock = true;
      const box = document.createElement('div');
      box.id = 'pre-round-clock';
      box.className = 'pre-round-clock';
      const show = n => { box.textContent = `Round ${roundNum} starts in ${n}s \u2014 study your hand and stage cards`; };
      let left = secs;
      show(left);
      document.body.appendChild(box);
      // Every computer studies its hand and stages during the clock, each at its own moment.
      const nPl = getState().players.length;
      for (let i = 0; i < nPl; i++) {
        if (!window.aiData?.isAI?.[i]) continue;
        const at = Math.round(secs * (0.2 + Math.random() * 0.6) * 1000);
        setTimeout(() => window.aiEngine?.preStage?.(i), at);
      }
      const id = setInterval(() => {
        left--;
        if (left > 0) { show(left); return; }
        clearInterval(id);
        box.remove();
        window.__preRoundClock = false;
        resolve();
      }, 1000);
    });
  }

  // ─── startNextRound ───────────────────────────────────────────────────────

  async function startNextRound() {
    const { roundIndex, players } = getState();
    const nextRound = roundIndex + 1;
    if (nextRound > 7) return; // Should not happen — showScoresPopup guards this.

    revealAll(false, false);   // computers' cards are hidden again

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
      if (btn) { btn.disabled = true; btn.textContent = 'Lay Down'; btn.style.backgroundColor = ''; btn.classList.remove('laid-down'); }
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
    _resetAutoDecline();
    await window.scoring.showRoundPopup(nextRound);
    await _preRoundClock(nextRound);

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

  function drawCardFrom(source, playerIdx, suppressLog = false) {
    if (window.__preRoundClock) return;   // nobody draws until the analysis time is over
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
        // Keep the top (players - 1) discards on the pile so back-to-back buys / discard
        // draws cannot drain it; only older discards go back into the deck.
        const result = window.initDeckInstance.reshuffle(newDrawPile, newDiscardPile, state.players.length - 1);
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

    // Information layer: public record of discard-pile pickups; own draws are self-knowledge.
    if (source === 'discard') window.aiInfo?.recordTake(playerIdx, card);
    else window.aiInfo?.recordDraw(playerIdx, card);

    // Log the draw action (suppressed during buy operations to avoid duplicate entries).
    if (!suppressLog) window.gameLog?.logDraw(player, source, card);

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

    // Must keep a card in hand: it is the one you discard (or play after laying down).
    if (!state.hands[player]?.length) {
      btn.textContent = 'Keep a Card';
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
    btn.classList.add('laid-down');          // pastel amber (see table.css)
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

  // Buy / Decline buttons are always on screen; greyed out when no buying round is open.
  function _idleBuyButtons(holder) {
    if (!holder) return;
    const mk = (txt, extra) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'buy-clock-btn' + (extra ? ' ' + extra : '');
      b.textContent = txt; b.disabled = true;
      return b;
    };
    holder.replaceChildren(mk('Decline', 'buy-decline'), mk('Buy Discard'));
    holder.parentElement?.classList.remove('active');
  }

  // ─── Buy popup placement ──────────────────────────────────────────────────
  // Compact panel centred on the piles (the one area the layout keeps free of
  // seats and staging). The title bar drags it if it is still in the way.

  function _placeBuyPopup(container, handle) {
    const a = document.getElementById('drawPile')?.getBoundingClientRect();
    const b = document.getElementById('discardPile')?.getBoundingClientRect();
    let cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    if (a && b && a.width && b.width) {
      cx = (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2;
      cy = (Math.min(a.top, b.top) + Math.max(a.bottom, b.bottom)) / 2;
    }
    container.style.left = `${cx}px`;
    container.style.top  = `${cy}px`;
    // Keep fully on-screen.
    const r = container.getBoundingClientRect();
    const dx = Math.max(8 - r.left, 0) - Math.max(r.right - (window.innerWidth - 8), 0);
    const dy = Math.max(8 - r.top, 0)  - Math.max(r.bottom - (window.innerHeight - 8), 0);
    container.style.left = `${cx + dx}px`;
    container.style.top  = `${cy + dy}px`;

    handle.style.cursor = 'move';
    handle.title = 'Drag to move';
    handle.addEventListener('pointerdown', (e) => {
      const sx = e.clientX, sy = e.clientY;
      const l0 = parseFloat(container.style.left), t0 = parseFloat(container.style.top);
      const move = (ev) => {
        container.style.left = `${l0 + ev.clientX - sx}px`;
        container.style.top  = `${t0 + ev.clientY - sy}px`;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      e.preventDefault();
    });
  }

  // ─── Buy clock ────────────────────────────────────────────────────────────
  // Returns a Promise that resolves when the clock expires or all players act.
  // oldTurnIdx = the player who just discarded (whose card is up for buying)
  // newTurnIdx = the player whose turn is beginning (has veto right)

  async function _showBuyClockPopup(oldTurnIdx, newTurnIdx) {
    const state = getState();

    // Don't show if anyone has 0 cards (round just ended).
    // A player whose hand is empty only counts as "out" once laid down; a player
    // with everything staged (not yet laid down) still holds cards.
    const anyEmpty = state.players.some((p, i) =>
      (state.hands[p] || []).length === 0 && state.laidDownPlayers.has(i));
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
        // Card size follows the room available: fewer players = bigger card.
        const nBuy = buyPlayers.length;
        const baseW = nBuy <= 3 ? 112 : nBuy <= 5 ? 96 : nBuy <= 7 ? 80 : 64;
        const cw = Math.max(48, Math.min(baseW, Math.floor(window.innerHeight * 0.16)));
        const cardDiv = window.cardRenderer.createCardDiv(topDiscard, true, false,
          { w: cw, h: Math.round(cw * 152 / 112) });
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
        btnWrapper.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px 10px;';
      }

      const ctl = {};     // playerIndex -> { buyBtn, declBtn }
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
        buyBtn.textContent = isMyTurn ? 'Take Discard' : 'Buy Discard';
        wrap.appendChild(buyBtn);

        const declBtn = document.createElement('button');
        declBtn.type      = 'button';
        declBtn.className = 'buy-clock-btn';
        declBtn.textContent = 'Decline';
        declBtn.style.cssText = 'background-color:#c9302c;margin-top:6px;';
        wrap.appendChild(declBtn);

        const showClock = () => {
          countdownSpan.textContent = Math.max(0, buyTime);
          title.textContent = `Buying Round - Time left: ${Math.max(0, buyTime)}s`;
        };

        buyBtn.addEventListener('click', () => {
          if (buyBtn.disabled) return;
          if (isMyTurn) {
            // The next player's "Taking" halves the clock. It can ALWAYS be withdrawn with
            // Decline and declared again, whatever the opt-out setting says.
            if (buyingState[i]) return;
            buyingState[i] = true;
            declinedState[i] = false;
            buyBtn.textContent = 'Taking Discard';
            buyBtn.classList.add('buying');
            buyBtn.disabled = true;
            declBtn.disabled = false; declBtn.textContent = 'Decline';
            buyTime = Math.ceil(buyTime / 2);
            showClock();
          } else if (optOut) {
            buyingState[i] = !buyingState[i];
            buyBtn.textContent = buyingState[i] ? 'Buying' : 'Buy Discard';
            buyBtn.classList.toggle('buying', buyingState[i]);
            if (buyingState[i]) {
              declBtn.disabled = false; declBtn.textContent = 'Decline'; declinedState[i] = false;
              // Fast buy: priority goes to whoever declared FIRST. With opt-out on a buy can be
              // withdrawn and re-declared, so a re-declare goes to the back of the line.
              if (fastBuy && !clickOrder.includes(i)) clickOrder.push(i);
            } else {
              const k = clickOrder.indexOf(i);
              if (k >= 0) clickOrder.splice(k, 1);
            }
          } else {
            if (buyingState[i]) return;
            buyingState[i] = true;
            buyBtn.textContent = 'Buying';
            buyBtn.classList.add('buying');
            buyBtn.disabled = true;
            // Opt-out is off: a declared buy is final, so Decline can no longer cancel it.
            declBtn.disabled = true;
            if (fastBuy && !clickOrder.includes(i)) clickOrder.push(i);
          }
          if (allActed()) { buyTime = 0; showClock(); }
        });

        declBtn.addEventListener('click', () => {
          if (declBtn.disabled) return;
          if (!isMyTurn && buyingState[i] && !optOut) return;   // opt-out off: a declared buy is final
          const withdrewTake = isMyTurn && buyingState[i];
          declinedState[i] = true;
          declBtn.textContent = 'Declined';
          declBtn.disabled = true;
          if (buyingState[i]) {
            buyingState[i] = false;
            buyBtn.textContent = isMyTurn ? 'Take Discard' : 'Buy Discard';
            buyBtn.classList.remove('buying');
            const k = clickOrder.indexOf(i);
            if (k >= 0) clickOrder.splice(k, 1);
          }
          if (isMyTurn) {
            buyBtn.disabled = false;       // the next player may change their mind and Take after all
            buyBtn.textContent = 'Take Discard';
          }
          // Withdrawing a take gives the buyers their time back.
          if (withdrewTake) { buyTime = buyTimeOrig; showClock(); }
          if (allActed()) { buyTime = 0; showClock(); }
        });

        btnWrapper.appendChild(wrap);   // detached holder (keeps the name lookup working)

        // Mount the two buttons under this player's Lay Down button.
        ctl[i] = { buyBtn, declBtn };
        const slot = document.querySelector(`#player-${i} .buy-btns`);
        if (slot) {
          declBtn.style.cssText = '';
          declBtn.classList.add('buy-decline');
          slot.replaceChildren(declBtn, buyBtn);
          slot.parentElement.classList.add('active');
          slot.title = isMyTurn ? 'Take the discard as your draw' : 'Buy the discard';
        }
        // Human auto-decline (buys only; your own take decision is never automatic).
        if (!isMyTurn && !window.aiData?.isAI?.[i]) {
          let auto = false;
          try { auto = localStorage.getItem('shanghaiAutoDecline') === '1'; } catch {}
          if (auto) setTimeout(() => { if (!declBtn.disabled) declBtn.click(); }, 150);
        }
      });

      document.body.appendChild(container);
      _placeBuyPopup(container, title);

      // ── AI buy / take decisions ──────────────────────────────────────────
      // Each AI decides at once, but PRESSES its buy (or take) button only after a
      // random 2.0 s .. (buy clock - 1.8 s) (0.1 s steps), so a human has a fair chance to beat it.
      // Declines are immediate. A press that would land after the clock has run out
      // simply never happens.
      // Roll between 2.0 s and (buy clock - 1.8 s), in 0.1 s steps.
      const rollMax   = Math.max(2.0, buyTimeOrig - 1.8);
      const rollSteps = Math.round((rollMax - 2.0) * 10);
      const rollDelay = () => (20 + Math.floor(Math.random() * (rollSteps + 1))) / 10;
      const popupOpen = () => document.body.contains(container);
      setTimeout(() => {
        buyPlayers.forEach(({ playerIndex: i, isMyTurn }) => {
          const aiData = window.aiData;
          if (!aiData?.isAI?.[i]) return; // Skip human players.
          const topDiscard = getState().discardPile[getState().discardPile.length - 1];
          const c = ctl[i];
          if (!topDiscard || !c) return;

          let wants, why = null;
          if (isMyTurn) {
            // The AI whose turn it is decides whether to take the discard as their draw.
            const { hands, laidDownPlayers } = getState();
            const hand    = hands[getState().players[i]] || [];
            // Takes it because it helps, or (Ruthless) to veto a buyer.
            if (window.aiEngine._takeWhy) {
              const t = window.aiEngine._takeWhy(topDiscard, hand, i, laidDownPlayers.has(i));
              wants = t.take; why = t.why;
            } else {
              const takeFn = window.aiEngine._shouldTake || window.aiEngine._discardHelpsAI;
              wants = takeFn ? takeFn(topDiscard, hand, i, laidDownPlayers.has(i)) : false;
            }
          } else {
            if (c.buyBtn.disabled) return;
            if (window.aiEngine._buyDecision) {
              const b = window.aiEngine._buyDecision(i, topDiscard);
              wants = b.buy; why = b.why;
            } else wants = window.aiEngine.shouldBuy(i, topDiscard);
          }

          if (wants) {
            const delay = rollDelay();
            setTimeout(() => {
              if (!popupOpen() || c.buyBtn.disabled) return;
              if (why) window.gameLog?.logReason(getState().players[i], why);   // debug log only
              c.buyBtn.click();
              if (!isMyTurn && fastBuy && !clickOrder.includes(i)) clickOrder.push(i);
            }, Math.round(delay * 1000));
          } else {
            window.gameLog?.logDecline(getState().players[i]);
            if (!c.declBtn.disabled) c.declBtn.click();
          }
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
          document.querySelectorAll('.buy-btns').forEach(_idleBuyButtons);
          // Everyone eligible who did not buy/take has passed on this card.
          const passed = getState().discardPile[getState().discardPile.length - 1];
          if (passed) buyPlayers.forEach(p => { if (!buyingState[p.playerIndex]) window.aiInfo?.recordPass(p.playerIndex, passed); });
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
      drawCardFrom('discard', newTurnIdx, true); // suppressLog — logBuy is the entry
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
    // Suppress individual draw logs — logBuy above is the single entry.
    drawCardFrom('draw',    buyerIdx, true);
    drawCardFrom('discard', buyerIdx, true);
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
    if (_layoutObserver) { _layoutObserver.disconnect(); _layoutObserver = null; }
    if (typeof ResizeObserver !== 'undefined') {
      _layoutObserver = new ResizeObserver(() => _scheduleLayout());
    }

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
      if (window.aiData?.isAI?.[i]) playerDiv.classList.add('is-ai');
      if (i === _viewerIdx()) { playerDiv.classList.add('is-viewer'); playerDiv.style.width = `${VIEW_W}px`; }

      const nameplate = document.createElement('div');
      nameplate.className   = 'nameplate';
      nameplate.textContent = name;

      const layBtn = document.createElement('button');
      layBtn.className   = 'lay-down-btn';
      layBtn.type        = 'button';
      layBtn.textContent = 'Lay Down';
      layBtn.disabled    = true;
      layBtn.addEventListener('click', LayDownClick);

      // Stats sit in two columns (left: Buys / Cards, right: Held / Score) with the
      // buy controls sandwiched between them (see table.css .stats).
      const stats     = document.createElement('div');
      stats.className = 'stats';
      const leftCol   = document.createElement('div');
      leftCol.className = 'stats-col stats-left';
      const rightCol  = document.createElement('div');
      rightCol.className = 'stats-col stats-right';
      const buysDiv   = document.createElement('div');
      buysDiv.className   = 'stat-buys';
      buysDiv.textContent = 'Buys: 3';
      const cardsDiv  = document.createElement('div');
      cardsDiv.className   = 'stat-cards';
      cardsDiv.textContent = 'Cards: 0';
      const heldDiv   = document.createElement('div');
      heldDiv.className   = 'stat-held';
      heldDiv.textContent = 'Held: 0';
      const scoreDiv  = document.createElement('div');
      scoreDiv.className   = 'stat-score';
      scoreDiv.textContent = 'Score: 0';
      leftCol.append(buysDiv, cardsDiv);
      rightCol.append(heldDiv, scoreDiv);
      stats.append(leftCol, rightCol);

      const handArea    = document.createElement('div');
      handArea.className = 'hand-area';
      handArea.id        = `hand-${i}`;
      handArea.style.cssText = 'position:relative;display:flex;align-items:center;overflow:visible;';

      // Info card (nameplate / lay-down / stats) and the hand tray are separate boxes.
      const info = document.createElement('div');
      info.className = 'player-info';
      info.appendChild(nameplate);
      info.appendChild(layBtn);
      // Buy / Decline buttons: always visible (greyed out when no buying round is open).
      // Space is reserved so the seat never changes size. The human seat also gets
      // the auto-decline slider right beside the Decline button.
      const buyControls = document.createElement('div');
      buyControls.className = 'buy-controls';
      const buyBtns = document.createElement('div');
      buyBtns.className = 'buy-btns';
      buyControls.appendChild(buyBtns);
      _idleBuyButtons(buyBtns);
      if (!window.aiData?.isAI?.[i]) {
        // Undo Swap: visible only while a wild swap made BEFORE laying down is pending
        // (lay down this turn or the swap is undone).
        const undoBtn = document.createElement('button');
        undoBtn.type = 'button';
        undoBtn.className = 'buy-clock-btn swap-undo-btn';
        undoBtn.textContent = 'Undo Swap';
        undoBtn.title = 'Undo your wild swaps. A swap made before laying down must be followed by laying down this turn, otherwise it is undone.';
        undoBtn.hidden = true;
        undoBtn.addEventListener('click', () => window.dragDrop?.cancelWildSwaps(i, 'undone by the player'));
        buyControls.insertBefore(undoBtn, buyBtns);
        const auto = document.createElement('label');
        auto.className = 'auto-decline';
        auto.title = 'Automatically decline every buy offer (you can still take the discard on your own turn)';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'auto-decline-input';
        try { cb.checked = localStorage.getItem('shanghaiAutoDecline') === '1'; } catch {}
        cb.addEventListener('change', () => {
          try { localStorage.setItem('shanghaiAutoDecline', cb.checked ? '1' : '0'); } catch {}
        });
        const track = document.createElement('span');
        track.className = 'auto-decline-track';
        const txt = document.createElement('span');
        txt.textContent = 'Auto';
        auto.append(cb, track, txt);
        buyControls.insertBefore(auto, buyControls.firstChild);   // slider | Undo | Decline | Buy
      }
      stats.insertBefore(buyControls, rightCol);
      info.appendChild(stats);
      const tray = document.createElement('div');
      tray.className = 'hand-tray';
      tray.appendChild(handArea);
      playerDiv.appendChild(info);
      playerDiv.appendChild(tray);
      playersContainer.appendChild(playerDiv);

      // ── Contract area ─────────────────────────────────────────────────
      const contractDiv = document.createElement('div');
      contractDiv.className = 'contract-area';
      contractDiv.id        = `contract-${i}`;
      // Fixed seat width; sub-areas wrap inside it (see table.css).
      const maxW = i === _viewerIdx() ? VIEW_W : SEAT_W;
      contractDiv.style.cssText = `display:block;white-space:normal;width:${maxW}px;`;
      contractDiv.dataset.maxw = String(maxW);
      contractsContainer.appendChild(contractDiv);
      contracts[i] = contractDiv;
      if (_layoutObserver) { _layoutObserver.observe(playerDiv); _layoutObserver.observe(contractDiv); }
    });
  }

  // ─── Build contract sub-areas for a given round ───────────────────────────

  function _buildContractSubAreas(roundNum) {
    window.aiInfo?.reset();
    const { backColors } = getState();
    const labels  = CONTRACT_SUB_AREAS[roundNum] || [];
    _growNow = true;         // new round: the table may grow right away (smoothly)
    _scheduleLayout();
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
    const { currentTurnIdx: cur } = getState();
    drawPileDiv.style.cursor = (cur !== -1 && !window.aiData?.isAI?.[cur]) ? 'pointer' : 'default';
    drawPileDiv.onclick = () => {
      const { currentTurnIdx: idx, hasDrawn } = getState();
      if (window.aiData?.isAI?.[idx]) return;          // only a human may click, and only on their own turn
      if (idx !== -1 && !hasDrawn) drawCardFrom('draw', idx);
    };
  }

  // ─── Layout ───────────────────────────────────────────────────────────────

  // Seat geometry (design pixels, before scaling).
  const SEAT_W    = 400;   // opponent seat width; must match --player-width / --contract-width in table.css
  const VIEW_W    = 560;   // your seat is wider (hand + staging area)
  const VIEW_BOOST = 1.15; // ...and drawn this much larger than opponents (its hand cards are larger too)
  let   SEAT_GAP  = 9;     // panel -> contract gap          (tightened on short screens, see layoutPlayers)
  let   CELL_PAD  = 12;    // breathing room between neighbouring seats (same)
  const SHORT_SCREEN_H = 480;   // px: at or below this height the table uses the tight 'short-screen' spacing
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 1.15;
  const PILE_SPAN = 280;   // two 120px piles + 40px gap
  const PILE_H    = 195;   // pile height + "PLAYABLE" label
  let   LOG_H_REG = 46;    // room under the piles for the two-line "recent log" (regular games only)
  let   PILE_PS_MIN = 0.5; // smallest pile scale (smaller on short screens)
  let   PILE_PAD    = 20;  // free room kept around the piles
  let   LOG_STRIP = 44;    // strip kept free along the top while the Game Log is in its home corner    // room reserved under the piles for the collapsed Game Log tab

  // Table scale (one factor for the whole table).  It follows what fits, but calmly:
  //  - too big -> shrink at once (otherwise things overlap), with a little extra headroom so
  //    the next small change does not shrink it again;
  //  - room to spare -> grow only after it has stayed that way for GROW_DELAY, and only if
  //    the gain is worth it (GROW_RATIO);
  //  - a new round may grow immediately; a resize / rotation re-fits at once.
  // Every change is animated by a CSS transition (see .anim in table.css).
  const SHRINK_HEADROOM = 0.94, GROW_RATIO = 1.12, GROW_FACTOR = 0.97, GROW_DELAY = 2500;
  let _curScale  = null;
  let _growTimer = null, _growOK = false, _growNow = false, _snap = false;
  let _centre        = null;   // { x, y, ps } free centre of the table, set by layoutPlayers
  let _layoutObserver = null;
  let _layoutQueued  = false;
  let _animTimer     = null;

  function _scheduleLayout() {
    if (_layoutQueued) return;
    _layoutQueued = true;
    requestAnimationFrame(() => { _layoutQueued = false; layoutPlayers(false); });
  }

  function layoutPiles() {
    if (!tableContainer || !drawPileDiv || !discardPileDiv) return;
    const { backColors } = getState();
    const cw = tableContainer.clientWidth;
    const ch = tableContainer.clientHeight;
    const pileW     = drawPileDiv.offsetWidth  || 120;
    const pileH     = drawPileDiv.offsetHeight || 160;
    const ps        = _centre ? _centre.ps : 1;
    const spacing   = 160 * ps;
    const centerX   = _centre ? _centre.x : cw / 2;
    const centerY   = _centre ? _centre.y : ch / 2;

    [drawPileDiv, discardPileDiv].forEach(d => { d.style.transform = `scale(${ps})`; });
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

    // The two most recent log entries sit just under the piles, above your seat.
    if (_recentEl && _centre && _centre.logBeside) {
      // Short screen, piles above your seat: the recent log sits to the right of the discard pile.
      const left = centerX + spacing / 2 + (pileW * ps) / 2 + 10;
      const w = Math.max(100, Math.min(260, (_centre.right || cw) - left - 8));
      _recentEl.style.width = `${w}px`;
      _recentEl.style.left  = `${left}px`;
      _recentEl.style.top   = `${centerY - (pileH * ps) / 2}px`;
    } else if (_recentEl) {
      const w = Math.max(document.documentElement.classList.contains('short-screen') ? 120 : 240, Math.min(560, (_centre ? _centre.w : cw) - 16));
      _recentEl.style.width = `${w}px`;
      _recentEl.style.left  = `${centerX - w / 2}px`;
      _recentEl.style.top   = `${centerY + (pileH / 2) * ps + 8}px`;
    }
  }

  // ─── Recent-log strip (regular games) ─────────────────────────────────────
  let _recentEl = null;
  function _renderRecent() {
    if (!_recentEl) return;
    const rows = window.gameLog?.getRecent?.(2) || [];
    _recentEl.replaceChildren(...rows.map((e, i) => {
      const d = document.createElement('div');
      d.className = 'recent-log-row' + (i === rows.length - 1 ? ' newest' : '');
      d.innerHTML = e.html;
      d.title = d.textContent;
      return d;
    }));
    _recentEl.style.visibility = rows.length ? 'visible' : 'hidden';
  }
  function _initRecentLog() {
    if (window.gameDebug) return;                      // debug has no human seat; use the Game Log
    if (!_recentEl) {
      _recentEl = document.createElement('div');
      _recentEl.id = 'recent-log';
      tableContainer.appendChild(_recentEl);
      window.addEventListener('gamelog-changed', _renderRecent);
    }
    _renderRecent();
  }

  // ─── Round-end reveal ─────────────────────────────────────────────────────
  // When a round ends every computer's hand and staged cards are turned face-up.
  function revealAll(on, render = true) {
    window.__revealAll = !!on;
    if (!window.gameDebug) tableContainer?.classList.toggle('compact-hands', !on);
    if (render) {
      _renderHands();
      window.cardRenderer.renderAllSubcontractAreas();
    }
    _scheduleLayout();
  }

  // Which seat is "you" (bottom of the screen): the first human. -1 = nobody (debug mode,
  // computers only): there is no bottom seat and every seat is laid out as an opponent.
  // ─── Magnifier support (the lens itself lives in magnifier.js) ───────────
  let _viewSeat  = null;   // your seat's screen rect: the magnify buttons sit just outside its right edge
  let _obstacles = [];     // rects the buttons must not sit on

  function _viewerIdx() {
    const flags = window.aiData?.isAI;
    if (Array.isArray(flags)) { const i = flags.findIndex(f => !f); return i; }
    return 0;
  }

  // Does this arrangement fit at opponent scale s?
  //   t = opponents across the top, l / r = down the left / right sides,
  //   viewer = you, bottom centre between the side columns, drawn VIEW_BOOST x larger.
  // Room the recent-log needs under the piles.  On a short screen with the piles above your seat
  // the log sits beside the piles instead, so it costs no height.
  const _logH = (g) => (window.gameDebug || (g && g.compact && !g.sbs)) ? 0 : LOG_H_REG;

  function _fits(s, g) {
    const { W, H, cellW, cellH, vSeatW, vSeatH, t, l, r } = g;
    const cw = cellW * s, ch = cellH * s;
    const sv = s * VIEW_BOOST, vw = vSeatW * sv + (g.magPx || 0), vh = vSeatH * sv;   // + room for the magnify buttons
    if (t * cw > W) return false;
    const topH = t ? ch : 0;
    if (l * ch > H - topH || r * ch > H - topH) return false;
    const freeW = W - (l ? cw : 0) - (r ? cw : 0);
    const freeH = H - topH - vh;
    const ps = Math.max(PILE_PS_MIN, Math.min(1, s));
    if (g.sbs) {
      // Short, wide screen: the piles sit beside your seat, so you can use the full height.
      const bandH = H - topH;
      return vw + PILE_SPAN * ps + 16 <= freeW && vh <= bandH && PILE_H * ps + _logH(g) + 8 <= bandH;
    }
    return vw <= freeW && freeW >= PILE_SPAN * ps + PILE_PAD && freeH >= PILE_H * ps + _logH(g) + PILE_PAD;
  }

  function _bestScale(g) {
    if (!_fits(MIN_SCALE, g)) return 0;
    let lo = MIN_SCALE, hi = MAX_SCALE;
    if (_fits(hi, g)) return hi;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (_fits(mid, g)) lo = mid; else hi = mid;
    }
    return lo;
  }

  // First-person table layout.
  //   * You (viewer) sit bottom-centre: your hand is the bottom-most thing on
  //     screen and your staging / contract area sits "behind" it, above.
  //   * Opponents follow in turn order clockwise: up the left side, across the
  //     top, down the right side — at least one on each side when 2+ opponents.
  //   * One scale factor for all opponents; you are drawn VIEW_BOOST x larger.
  // Pass reset=true (resize) to let the scale grow again.
  function layoutPlayers(reset = false) {
    if (!tableContainer || !getState().players.length) return;
    // Short screens (a phone held sideways): tighten the gaps so the cards can be bigger.
    const compact = tableContainer.clientHeight <= SHORT_SCREEN_H;
    SEAT_GAP  = compact ? 3  : 9;
    CELL_PAD  = compact ? 4  : 12;
    LOG_H_REG = compact ? 26 : 46;
    LOG_STRIP = compact ? 30 : 44;
    PILE_PS_MIN = compact ? 0.4 : 0.5;
    PILE_PAD    = compact ? 6   : 20;
    document.documentElement.classList.toggle('short-screen', compact);
    const { players } = getState();
    const N = players.length;
    // While the Game Log sits in its home spot (top-left) keep a strip free for it.
    const OFF = window.gameLog?.isHome?.() ? LOG_STRIP : 0;
    const W = tableContainer.clientWidth;
    const H = tableContainer.clientHeight - OFF;
    if (!W || H <= 0) return;
    if (reset) {                           // resize / rotation: re-fit at once, without animating
      _snap = true;
      tableContainer.classList.remove('anim');
      clearTimeout(_animTimer);
      _animTimer = setTimeout(() => tableContainer && tableContainer.classList.add('anim'), 250);
    }

    const v = _viewerIdx();
    const hasV = v >= 0;                   // false in debug mode: no bottom seat at all
    if (!hasV) _viewSeat = null;
    const M = hasV ? N - 1 : N;            // opponents
    const order = [];                      // opponents in clockwise turn order from the viewer
    if (hasV) for (let k = 1; k <= M; k++) order.push((v + k) % N);
    else for (let k = 0; k < N; k++) order.push(k);

    // Measure (panel height, contract height) of every seat.
    const panelH = [], conH = [];
    let oppSeatH = 0;
    players.forEach((_, i) => {
      const pd = document.getElementById(`player-${i}`);
      panelH[i] = pd ? (pd.offsetHeight || 180) : 0;
      conH[i]   = contracts[i] ? contracts[i].offsetHeight : 0;
      if (i !== v) oppSeatH = Math.max(oppSeatH, panelH[i] + SEAT_GAP + conH[i]);
    });
    let   vSeatH = hasV ? panelH[v] + SEAT_GAP + conH[v] + CELL_PAD : 0;
    const vSeatW = hasV ? VIEW_W + CELL_PAD : 0;
    const cellW  = SEAT_W + CELL_PAD;
    const cellH  = oppSeatH + CELL_PAD;

    // Pick (l, t, r): >=1 on each side when there are 2+ opponents.
    // On a short, wide screen also try 'side-by-side' (piles beside your seat) and keep the bigger scale.
    const magPx = hasV ? (window.magnifier ? window.magnifier.RESERVE_PX : 0) : 0;   // screen px reserved beside your seat for the magnify buttons
    let best = null;
    const modes = (compact && hasV && W > H * 1.5 && !window.__noSbs) ? [false, true] : [false];
    for (const sbs of modes)
      for (let l = (M >= 2 ? 1 : 0); l <= M; l++)
        for (let r = (M >= 2 ? 1 : 0); r <= M - l; r++) {
          const t = M - l - r;
          const g = { W, H, cellW, cellH, vSeatW, vSeatH, t, l, r, sbs, compact, magPx };
          const sc = _bestScale(g);
          if (!sc) continue;
          // Piles above your seat (centred) are preferred; beside it only if that is a lot bigger.
          const score = sc * (sbs ? 0.8 : 1) - 0.01 * Math.abs(l - r);
          if (!best || score > best.score) best = { t, l, r, s: sc, score, sbs };
        }
    if (!best) best = { t: M, l: 0, r: 0, s: MIN_SCALE, sbs: false };
    const { t, l, r, sbs } = best;
    let s = best.s;
    if (_curScale === null || _snap) {
      _curScale = s; _snap = false;
      clearTimeout(_growTimer); _growTimer = null;
    } else if (s < _curScale) {                         // too big: shrink now, with headroom
      _curScale = s * SHRINK_HEADROOM;
      clearTimeout(_growTimer); _growTimer = null;
    } else if (s > _curScale * GROW_RATIO) {            // room to spare
      if (_growNow || _growOK) {
        _curScale = _growNow ? s : s * GROW_FACTOR;
        _growNow = _growOK = false;
        clearTimeout(_growTimer); _growTimer = null;
      } else if (!_growTimer) {                         // ...but only if it lasts
        _growTimer = setTimeout(() => { _growTimer = null; _growOK = true; layoutPlayers(false); }, GROW_DELAY);
      }
    } else {
      clearTimeout(_growTimer); _growTimer = null;
    }
    _growNow = false;
    s = _curScale;

    const cw = cellW * s, ch = cellH * s;
    const sv = s * VIEW_BOOST, vw = vSeatW * sv + magPx;   // vw includes the buttons' strip
    let vh = vSeatH * sv;
    const topH = t ? ch : 0;
    const colH = H - topH;                 // side columns run down to the screen bottom

    // Opponent slots, clockwise from the viewer's left: left column (bottom->top),
    // top row (left->right), right column (top->bottom).
    const slots = [];
    const gapL = (colH - l * ch) / (l + 1);
    for (let k = 0; k < l; k++) slots.push({ x: 0, y: H - (gapL * (k + 1) + (k + 1) * ch) });
    const gapT = (W - t * cw) / (t + 1);
    for (let k = 0; k < t; k++) slots.push({ x: gapT * (k + 1) + k * cw, y: 0 });
    const gapR = (colH - r * ch) / (r + 1);
    for (let k = 0; k < r; k++) slots.push({ x: W - cw, y: topH + gapR * (k + 1) + k * ch });

    const place = (i, x, y, sc, contractFirst, seatW) => {
      const pd = document.getElementById(`player-${i}`), cd = contracts[i];
      if (!pd) return;
      y += OFF;
      const pTop = contractFirst ? y + (conH[i] + SEAT_GAP) * sc : y;
      const cTop = contractFirst ? y : y + (panelH[i] + SEAT_GAP) * sc;
      pd.style.left = '0px'; pd.style.top = '0px'; pd.style.transformOrigin = '0 0';
      pd.style.transform = `translate(${x}px, ${pTop}px) scale(${sc})`;
      if (i === v) _viewSeat = { x, y: pTop, w: seatW * sc, h: panelH[i] * sc };
      if (cd) {
        cd.style.left = '0px'; cd.style.top = '0px'; cd.style.transformOrigin = '0 0';
        // The staging area is exactly as wide as its seat (nameplate), so it lines up with it.
        cd.style.transform = `translate(${x}px, ${cTop}px) scale(${sc})`;
      }
    };

    order.forEach((idx, k) => {
      const slot = slots[k];
      if (!slot) return;
      const pad = (CELL_PAD / 2) * s;
      place(idx, slot.x + pad, slot.y + pad, s, false, SEAT_W);
    });

    // Viewer: bottom-centre between the side columns; contract above, hand at the very bottom.
    const x0 = l ? cw : 0, x1 = W - (r ? cw : 0);
    const vpad = (CELL_PAD / 2) * sv;
    const psz = Math.max(PILE_PS_MIN, Math.min(1, s));
    const gm = { compact, sbs };
    if (hasV && sbs) {
      // Your seat on the left of the middle band, the piles (and recent log) to its right.
      const pilesW = PILE_SPAN * psz + 16;
      const gx = (x0 + x1) / 2 - (vw + pilesW) / 2;
      place(v, gx + vpad, H - vh + vpad, sv, true, VIEW_W);
      _centre = {
        x:  gx + vw + pilesW / 2,
        y:  OFF + topH + (H - topH) / 2 - _logH(gm) / 2,
        ps: psz,
        w:  pilesW,
        sbs: true,
      };
    } else {
      if (hasV) place(v, (x0 + x1) / 2 - (VIEW_W * sv + magPx) / 2, H - vh + vpad, sv, true, VIEW_W);   // seat + buttons centred as a group

      // Free rectangle in the middle -> piles (+ Game Log tab beneath them).
      const freeH = H - topH - vh;
      _centre = {
        x:  (x0 + x1) / 2,
        y:  OFF + topH + freeH / 2 - _logH(gm) / 2,
        ps: psz,
        w:  x1 - x0,
        right: x1,
        logBeside: compact,
        sbs: false,
      };
    }
    layoutPiles();

    // Rects the magnify controls must not sit on: the opponents' seats (and the piles, beside you).
    _obstacles = order.map((idx, k) => slots[k] && { x: slots[k].x, y: slots[k].y + OFF, w: cw, h: ch }).filter(Boolean);
    if (sbs && _centre) _obstacles.push({ x: _centre.x - _centre.w / 2, y: OFF + topH, w: _centre.w, h: H - topH });
    if (window.magnifier) window.magnifier.layout(tableContainer, hasV ? _viewSeat : null, _obstacles);
    // Animate later size changes (not the very first placement).
    if (!_animTimer) _animTimer = setTimeout(() => tableContainer && tableContainer.classList.add('anim'), 400);
  }

  // ─── Hand view: 'all' (debug, every card face-up) | 'compact' ────────────
  function setHandView(mode, remember = true) {
    const compact = mode === 'compact';
    tableContainer?.classList.toggle('compact-hands', compact);
    if (remember) { try { localStorage.setItem('shanghaiHandView', compact ? 'compact' : 'all'); } catch {} }
  }
  function _initHandView() {
    // Normal play: computer hands always show card backs. Only debug mode (computers only)
    // shows faces, and only there may the H key / ?hands= switch the view.
    if (!window.gameDebug) { setHandView('compact', false); return; }
    let mode = 'all';
    try {
      const q = new URLSearchParams(location.search).get('hands');
      mode = q || localStorage.getItem('shanghaiHandView') || 'all';
    } catch {}
    setHandView(mode);
    if (!window.__handViewKey) {
      window.__handViewKey = true;
      window.addEventListener('keydown', e => {
        if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey &&
            !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) {
          setHandView(tableContainer.classList.contains('compact-hands') ? 'all' : 'compact');
        }
      });
    }
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
    setHandView,
    refreshLayButtons,
    revealAll,
    viewerIdx: _viewerIdx,
  };

  // Back-compat aliases consumed by dragDrop.js, aiEngine.js, scoring.js.
  window.initTable        = initTable;
  window.startNextRound   = startNextRound;
  window.resetTurnState   = resetTurnState;
  window.drawCardFrom     = drawCardFrom;
  window.validateLayDown  = (idx) => window.cardRenderer.validateLayDown(idx);
  window.refreshLayButtons = refreshLayButtons;
})();
