// aiEngine.js
// All AI player decision logic: draw source selection, contract staging,
// lay-down, playing onto contracts, discard selection and buying.
//
// Phase 1 rewrite. The core idea is a single planner, _solvePlan(), that finds
// the best way to spread a set of cards over the round's contract areas and
// reports NEED = how many more cards the contract still lacks. Staging, discard,
// take and buy decisions all ask the planner instead of using separate
// heuristics, so they can no longer contradict each other.
//
// Information rule: the AI only reads its OWN cards plus what any player at the
// table can see (discard pile, laid-down contracts).
//
// Depends on:  gameState.js  validator.js  scoring.js
// Called by:   roundManager.js  (executeAITurn entry point)

(() => {
  const { getState, setState, ROUND_REQUIREMENTS } = window.gameState;
  const { isWild } = window.validator;

  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

  // Card rank values for sequence math (Ace = 1 low by default).
  const RANK_VAL = {
    'A':1, '2':2,  '3':3,  '4':4,  '5':5,  '6':6,  '7':7,
    '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13
  };

  // Point values for discard decisions — Ace is 15 pts, not 1.
  const POINT_VAL = {
    'A':15, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7,
    '8':8, '9':9, '10':10, 'J':10, 'Q':10, 'K':10, 'W':20
  };

  const SUIT_ORDER = { '♥':0, '♦':1, '♣':2, '♠':3, '★':4 };

  // ═════════════════════════════════════════════════════════════════════════
  //  DIFFICULTY PROFILES  (Phase 3)
  // ═════════════════════════════════════════════════════════════════════════
  // Every level plays CORRECTLY (it never makes a deliberate mistake); the
  // levels differ in how much they know and how hard they optimise. The
  // wording follows the tooltips on the setup screen.
  //   infoScope : which cards the AI counts as "seen" when it works out how
  //               many copies of a card are still unseen (outs)
  //                 'last5' = own hand + own discards + last 5 discards
  //                 'pile'  = own hand + the whole discard pile
  //                 'all'   = own hand + discard pile + laid-down contracts
  //   infer     : uses what other players took / bought / passed on to guess
  //               what they are collecting (gift check, passed cards)
  //   tableGift : avoids discarding a card an opponent can play at once onto
  //               a laid-down contract
  //   optimise  : chance, each turn, of the full optimiser: staging that also
  //               counts the cards it can dump onto laid-down contracts
  //   veto      : chance of taking a discard purely to stop another player's
  //               buy, when it infers that player needs the card (next player only)
  const PROFILES = {
    easy:     { infoScope: 'last5', infer: false, tableGift: false, optimise: 0,    veto: 0   },
    medium:   { infoScope: 'pile',  infer: false, tableGift: true,  optimise: 0.33, veto: 0   },
    hard:     { infoScope: 'all',   infer: true,  tableGift: true,  optimise: 0.75, veto: 0   },
    ruthless: { infoScope: 'all',   infer: true,  tableGift: true,  optimise: 0.75, veto: 0.5 },
  };

  // Holding a COMPLETE contract while the Shanghai window is open (nobody has
  // laid down) to chase a Hard Shanghai. Keyed by round, then level. A level
  // that is not listed never holds. maxExtra = most unstaged cards it will
  // sit on (it holds only with 2..maxExtra, because with 0-1 it can lay down
  // and go out this turn); maxTurns = most turns it will keep holding.
  // Round 4 (3 sets): ONLY Ruthless holds. Rounds 1-3 and 5-7 are not set yet
  // (they follow the rounds 4-7 walkthrough), so nobody holds in them.
  const HOLD_POLICY = {
    4: { ruthless: { maxExtra: 2, maxTurns: 2 } },
  };

  const _levels = {};   // playerIdx -> level text given to executeAITurn
  const _opt    = {};   // playerIdx -> this turn's optimiser roll
  const _held   = {};   // playerIdx -> turns spent holding this round
  let   _heldRound = null;

  function _levelOf(idx) {
    const raw = _levels[idx] ?? window.aiData?.difficulties?.[idx] ?? 'Hard';
    const k = String(raw).toLowerCase();
    return PROFILES[k] ? k : 'hard';
  }
  const _profile = idx => PROFILES[_levelOf(idx)];
  const _optimising = idx => (_opt[idx] === undefined ? _profile(idx).optimise > 0 : _opt[idx]);

  const keyOf = c => c.rank + c.suit;
  const ptsOf = c => (isWild(c) ? 20 : (POINT_VAL[c.rank] || 0));
  const idOf  = c => (c._id === undefined ? 0 : c._id);

  // Positions on the rank line: 1 = Ace low … 13 = King, 14 = Ace high.
  // With the wrap-around rule the line continues (K A 2 3 …) up to 27.
  const maxPos     = () => (window.gameRules?.wrapAround ? 27 : 14);
  const rankAtPos  = p => RANKS[(p - 1) % 13];

  // Turn token: starting a new AI turn (or a forced discard / skip) invalidates
  // any earlier turn that is still waiting on a timer.
  let _turnToken = 0;

  // ─── Main entry point ─────────────────────────────────────────────────────

  async function executeAITurn(playerIdx, difficulty) {
    const { players } = getState();
    const playerDiv = document.getElementById(`player-${playerIdx}`);
    if (!playerDiv) return;

    // Guard: only run if this player's turn is still active in gameState.
    if (getState().currentTurnIdx !== playerIdx) return;

    _levels[playerIdx] = difficulty;
    _opt[playerIdx]    = Math.random() < _profile(playerIdx).optimise;

    const token = ++_turnToken;
    const alive = () =>
      token === _turnToken &&
      getState().currentTurnIdx === playerIdx &&
      !getState().roundFinished;

    console.log(`AI Turn: Player ${playerIdx} (${players[playerIdx]}, ${difficulty}, optimiser ${_opt[playerIdx] ? 'on' : 'off'})`);

    await _aiDraw(playerIdx, alive);
    if (!alive()) return;

    if (window.validator.swapPolicy(playerIdx)) {       // wild swap on: look for a swap before staging
      await _aiPreSwap(playerIdx, alive);
      if (!alive()) return;
    }

    await _aiStage(playerIdx, alive);
    if (!alive()) return;

    const didLayDown = await _aiLayDown(playerIdx, alive);
    if (!alive()) return;

    if (getState().laidDownPlayers.has(playerIdx) || didLayDown) {
      await _aiPlayOnContracts(playerIdx, alive);
    }
    if (!alive()) return;

    await _aiDiscard(playerIdx, alive);
    console.log(`AI Turn complete: Player ${playerIdx}`);
  }

  // Small helper: run `fn` after `ms`, but only if this turn is still current.
  function _step(ms, alive, fn, fallback) {
    return new Promise(resolve => {
      setTimeout(() => {
        if (!alive()) { resolve(fallback); return; }
        try { resolve(fn()); }
        catch (err) { console.error('AI step error:', err); resolve(fallback); }
      }, ms);
    });
  }

  // ─── Step 1: Draw ─────────────────────────────────────────────────────────

  function _aiDraw(playerIdx, alive) {
    return _step(800, alive, () => {
      const state = getState();
      // Already drew (e.g. took the discard as a veto in the buy clock) — skip.
      if (state.hasDrawn && state.currentTurnIdx === playerIdx) return;

      const { players, hands, discardPile, laidDownPlayers } = state;
      const player     = players[playerIdx];
      const hand       = hands[player] || [];
      const hasLaid    = laidDownPlayers.has(playerIdx);
      const topDiscard = discardPile[discardPile.length - 1];

      const decision = topDiscard
        ? _takeDecision(topDiscard, hand, playerIdx, hasLaid)
        : { take: false };

      window.drawCardFrom(decision.take ? 'discard' : 'draw', playerIdx);
      window.gameLog?.logReason(player,
        decision.take ? decision.why : 'No useful discard — drew blind from the deck.');
    });
  }

  // ─── Step 2: Stage ────────────────────────────────────────────────────────

  function _aiStage(playerIdx, alive) {
    return _step(500, alive, () => _stageNow(playerIdx));
  }

  // Before the round starts every computer uses the analysis clock to stage its dealt hand
  // (called by roundManager at a random moment of the clock). Its own turn re-plans from
  // hand + staged cards after the draw, so nothing is locked in by staging early.
  function preStage(playerIdx) {
    if (!window.__preRoundClock) return;
    _levels[playerIdx] = window.aiData?.difficulties?.[playerIdx] ?? _levels[playerIdx];
    _opt[playerIdx]    = Math.random() < _profile(playerIdx).optimise;
    try { _stageNow(playerIdx); } catch (err) { console.error('AI pre-stage error:', err); }
  }

  function _stageNow(playerIdx) {
    {
      const { players, hands, subcontractCards, roundIndex, laidDownPlayers } = getState();
      if (laidDownPlayers.has(playerIdx)) return;

      const player   = players[playerIdx];
      const hand     = hands[player] || [];
      const staged   = subcontractCards[player] || [];
      const allCards = [...hand, ...staged];
      const subAreas = window.getSubcontractSubAreas(playerIdx);
      if (!subAreas.length) {
        console.warn(`AI ${playerIdx}: no subcontract areas found, skipping stage`);
        return;
      }

      let plan = _findOptimalStaging(allCards, roundIndex, subAreas, playerIdx);

      // Always keep at least one card OUT of the contract so there is something
      // to discard (otherwise a fully staged hand cannot end its turn).
      const usedIds = new Set(plan.flat().map(c => c._id));
      if (allCards.length && allCards.every(c => usedIds.has(c._id))) {
        const types = _areaTypes(subAreas);
        const pick  = _pickDiscard(allCards.filter(c => !isWild(c)), allCards, playerIdx, types);
        if (pick) {
          const rest = allCards.filter(c => c._id !== pick.card._id);
          plan = _findOptimalStaging(rest, roundIndex, subAreas, playerIdx);
        }
      }

      _applyStaging(playerIdx, plan);

      const labels = subAreas.map(s => s.dataset.label || '?');
      window.gameLog?.logStage(player, plan.map((cards, i) => ({
        label: labels[i] || `Area ${i}`, cards
      })));
      if (_stageWhy[playerIdx]) window.gameLog?.logReason(player, _stageWhy[playerIdx]);

      const handDiv = document.getElementById(`hand-${playerIdx}`);
      if (handDiv) {
        window.cardRenderer.renderCardArray(getState().hands[player], handDiv, false, playerIdx, 'hand');
      }
      window.cardRenderer.renderAllSubcontractAreas();
      window.refreshLayButtons?.();
    }
  }

  // ─── Step 3: Lay down ─────────────────────────────────────────────────────

  function _aiLayDown(playerIdx, alive) {
    return _step(400, alive, () => {
      const state = getState();
      const { laidDownPlayers, players, subcontractCards } = state;
      if (laidDownPlayers.has(playerIdx)) return false;
      if (!window.validator.hasCompleteStagedContracts(playerIdx)) return false;
      // Laying down needs a card left in hand: it is the one that gets discarded.
      if (!(state.hands[players[playerIdx]] || []).length) return false;

      // A wild swap made before laying down obliges the lay-down this turn.
      const swapForced = !!window.dragDrop?.hasPendingSwaps?.(playerIdx);
      if (!swapForced && _shouldHold(playerIdx)) {
        _held[playerIdx] = (_held[playerIdx] || 0) + 1;
        window.gameLog?.logReason(players[playerIdx],
          'Contract complete but holding it — the Shanghai window is open and one more useful card could let me lay down and go out in one turn.');
        return false;
      }

      console.log(`AI ${playerIdx}: laying down`);

      const subAreas = window.getSubcontractSubAreas(playerIdx);
      const flatSubs = subcontractCards[players[playerIdx]] || [];
      window.gameLog?.logLayDown(players[playerIdx], subAreas.map((sub, areaIdx) => ({
        label: sub.dataset.label || `Area ${areaIdx}`,
        cards: flatSubs.filter(c => c.subArea === areaIdx)
      })));
      window.gameLog?.logReason(players[playerIdx], 'Contract complete — laying down.');

      const alreadyLaidCount = laidDownPlayers.size;
      if (alreadyLaidCount === 0) window.scoring.activateShanghaiWindows();
      else if (alreadyLaidCount === 1) setState({ softWindow: false });

      const newSet = new Set(laidDownPlayers);
      newSet.add(playerIdx);
      setState({ laidDownPlayers: newSet });

      const playerDiv = document.getElementById(`player-${playerIdx}`);
      if (playerDiv) playerDiv.classList.add('HasLaidDown');
      const btn = playerDiv?.querySelector('.lay-down-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Laid Down'; btn.classList.add('laid-down'); }

      window.cardRenderer.renderAllSubcontractAreas();
      window.dragDrop.setupDragDrop();
      return true;
    }, false);
  }

  // ─── Step 4: Play onto contracts (and swap wilds) ─────────────────────────
  // Order of play: plain plays first, then wild swaps (only when a look-ahead
  // shows they shed more cards), then the wilds, each placed where it opens the
  // most follow-up plays (the optimiser) or at the first legal spot.

  function _aiPlayOnContracts(playerIdx, alive) {
    return _step(400, alive, () => {
      const { players, laidDownPlayers } = getState();
      if (!laidDownPlayers.has(playerIdx)) return;
      const player = players[playerIdx];
      const v      = window.validator;
      const smart  = _optimising(playerIdx);

      let useSwap = false;
      if (v.swapPolicy(playerIdx)) {
        const h0 = getState().hands[player] || [];
        useSwap = _playout(h0, playerIdx, true, smart).shed > _playout(h0, playerIdx, false, smart).shed;
      }

      for (let guard = 0; guard < 60; guard++) {
        const st   = getState();
        const hand = st.hands[player] || [];
        // A computer always ends its turn with a discard: it keeps its last card for it.
        if (hand.length <= 1) break;
        const step = _nextPlayStep(hand, playerIdx, st, useSwap, smart);
        if (!step) break;
        const card = step.card, target = step.target;
        const areaLabel = window.gameState.CONTRACT_SUB_AREAS[st.roundIndex]?.[target.areaIdx] || `Area ${target.areaIdx}`;

        if (step.kind === 'swap') {
          if (!window.dragDrop?.performWildSwap?.(playerIdx, card, target)) { useSwap = false; continue; }
          window.gameLog?.logReason(player,
            `swapped ${card.rank}${card.suit} for a wild in ${players[target.playerIdx]}'s ${areaLabel} — the wild can be played on.`);
          continue;
        }

        const newHands = { ...st.hands };
        newHands[player] = hand.filter(c => c._id !== card._id);
        const owner    = players[target.playerIdx];
        const newSub   = { ...st.subcontractCards };
        newSub[owner]  = [...(newSub[owner] || [])];
        _putOnTable({ players, subcontractCards: newSub }, target, card);
        setState({ hands: newHands, subcontractCards: newSub });
        window.gameLog?.logPlay(player, card, owner, areaLabel, target.areaIdx);
        console.log(`AI ${playerIdx}: played ${card.rank}${card.suit} onto player ${target.playerIdx} area ${target.areaIdx}`);
      }

      const handDiv = document.getElementById(`hand-${playerIdx}`);
      if (handDiv) {
        window.cardRenderer.renderCardArray(
          getState().hands[player], handDiv, false, playerIdx, 'hand'
        );
      }
      window.cardRenderer.renderAllSubcontractAreas();
      window.scoring.updatePlayerStats(getState().hands);
    });
  }

  // ─── Wild swap helpers ───────────────────────────────────────────────────
  // A swap replaces a wild in a laid-down group with the natural card it stands for
  // (any card of the rank in a set). The wild comes to the hand and can then be played.

  const _swappable = (card, idx) => !isWild(card) && window.validator.findSwapTargets(card, idx).length > 0;

  function _cloneTable(t) {
    const sub = {};
    t.players.forEach(n => { sub[n] = (t.subcontractCards[n] || []).slice(); });
    return { players: t.players, roundIndex: t.roundIndex, laidDownPlayers: t.laidDownPlayers, subcontractCards: sub };
  }

  // Put `card` onto the table copy exactly like a real play (sets/high end: after the
  // area's last card, run low end: before its first card).
  function _putOnTable(table, t, card) {
    const owner = table.players[t.playerIdx];
    const flat  = table.subcontractCards[owner];
    if (t.type === 'run' && t.insertEnd === 'low') {
      const first = flat.findIndex(c => c.subArea === t.areaIdx);
      flat.splice(first === -1 ? flat.length : first, 0, { ...card, subArea: t.areaIdx });
    } else {
      const last = flat.reduce((l, c, i) => (c.subArea === t.areaIdx ? i : l), -1);
      flat.splice(last + 1, 0, { ...card, subArea: t.areaIdx });
    }
  }

  // How many natural cards of H could be played in a row onto `table`.
  function _followUps(H, idx, table) {
    const tab = _cloneTable(table);
    let rest = H.slice(), n = 0, again = true;
    while (again) {
      again = false;
      for (const c of rest) {
        if (isWild(c)) continue;
        const t = window.validator.findPlayTargets(c, idx, tab)[0];
        if (t) { _putOnTable(tab, t, c); rest = rest.filter(x => x._id !== c._id); n++; again = true; break; }
      }
    }
    return n;
  }

  // Where to play a wild: the spot that lets the most other cards follow it (optimiser),
  // otherwise the first legal spot.
  function _bestWildTarget(wild, H, idx, table, smart) {
    const ts = window.validator.findPlayTargets(wild, idx, table);
    if (!ts.length) return null;
    if (!smart || ts.length === 1) return ts[0];
    const rest = H.filter(c => c._id !== wild._id);
    let best = ts[0], bestN = -1;
    for (const t of ts) {
      const tab = _cloneTable(table);
      _putOnTable(tab, t, wild);
      const n = _followUps(rest, idx, tab);
      if (n > bestN) { best = t; bestN = n; }
    }
    return best;
  }

  // The next thing a laid-down player does with `H` on `table`:
  //   { kind:'play', card, target } | { kind:'swap', card, target } | null
  function _nextPlayStep(H, idx, table, allowSwap, smart) {
    const v = window.validator;
    for (const c of H) {
      if (isWild(c)) continue;
      const t = v.findPlayTargets(c, idx, table)[0];
      if (t) return { kind: 'play', card: c, target: t };
    }
    if (allowSwap) {
      for (const c of H) {
        if (isWild(c)) continue;
        const t = v.findSwapTargets(c, idx, table)[0];
        if (t) return { kind: 'swap', card: c, target: t };
      }
    }
    const w = H.find(isWild);
    if (w) {
      const t = _bestWildTarget(w, H, idx, table, smart);
      if (t) return { kind: 'play', card: w, target: t };
    }
    return null;
  }

  // Dry run of a laid-down player's plays on a copy of the table:
  // { shed: cards that leave the hand, swaps, left }.
  function _playout(hand, idx, allowSwap, smart) {
    const table = _cloneTable(getState());
    let H = hand.slice();
    const start = H.length;
    let swaps = 0;
    for (let guard = 0; guard < 60; guard++) {
      const step = _nextPlayStep(H, idx, table, allowSwap, smart);
      if (!step) break;
      if (step.kind === 'swap') {
        const owner = table.players[step.target.playerIdx];
        const flat  = table.subcontractCards[owner];
        const gi    = flat.findIndex(c => c._id === step.target.wild._id);
        if (gi === -1) break;
        flat[gi] = { ...step.card, subArea: step.target.areaIdx };
        const w = { ...step.target.wild }; delete w.subArea;
        H = [...H.filter(c => c._id !== step.card._id), w];
        swaps++;
      } else {
        _putOnTable(table, step.target, step.card);
        H = H.filter(c => c._id !== step.card._id);
      }
    }
    return { shed: start - H.length, swaps, left: H };
  }

  // Before laying down: can swapping natural cards of `H` for wilds on the table
  // complete the contract? Returns the cards to swap (in order) or null. Any swap
  // made before laying down forces the lay-down, so the AI only swaps when this holds.
  function _swapPlan(H, idx, types) {
    const v = window.validator;
    if (!v.swapPolicy(idx)) return null;
    const wp = _wildProto();
    if (!wp) return null;
    const base = _needOf(H, types).need;
    if (base === 0) return [];
    if (base > 3) return null;
    const dfs = (Hc, used, plan, depth) => {
      const cur = _needOf(Hc, types).need;
      for (const x of Hc) {
        if (isWild(x)) continue;
        const targets = v.findSwapTargets(x, idx).filter(t => !used.has(t.wild._id));
        if (!targets.length) continue;
        const H2 = [...Hc.filter(c => c._id !== x._id), wp];
        const n  = _needOf(H2, types).need;
        const step = { card: x, wildId: targets[0].wild._id };
        if (n === 0) return [...plan, step];
        if (depth > 1 && n < cur) {
          const r = dfs(H2, new Set([...used, targets[0].wild._id]), [...plan, step], depth - 1);
          if (r) return r;
        }
      }
      return null;
    };
    return dfs(H, new Set(), [], Math.min(3, base));
  }

  // Step 1b: before staging, swap for wilds if that completes the contract (the player
  // then must lay down this turn), or - optimiser only - to shed spare cards for free.
  function _aiPreSwap(playerIdx, alive) {
    return _step(300, alive, () => {
      const v  = window.validator;
      const st = getState();
      if (st.laidDownPlayers.has(playerIdx) || !v.swapPolicy(playerIdx)) return;
      if (!window.dragDrop?.performWildSwap) return;
      const player = st.players[playerIdx];
      const types  = _contractTypes();
      const smart  = _optimising(playerIdx);
      const holdPossible = !!HOLD_POLICY[st.roundIndex]?.[_levelOf(playerIdx)];
      let done = 0;

      const doSwap = (card, why) => {
        const t = v.findSwapTargets(card, playerIdx)[0];
        if (!t) return false;
        const owner = getState().players[t.playerIdx];
        const label = window.gameState.CONTRACT_SUB_AREAS[getState().roundIndex]?.[t.areaIdx] || '';
        if (!window.dragDrop.performWildSwap(playerIdx, card, t)) return false;
        window.gameLog?.logReason(player, `swapped ${card.rank}${card.suit} for a wild in ${owner}'s ${label} — ${why}`);
        done++;
        return true;
      };

      // (a) swaps that complete the contract
      const H0 = _holding(st.hands[player] || [], playerIdx);
      const plan = _swapPlan(H0, playerIdx, types);
      if (plan && plan.length) {
        for (const step of plan) {
          const cur = _holding(getState().hands[player] || [], playerIdx).find(c => c._id === step.card._id);
          if (!cur || !doSwap(cur, 'needed to lay down this turn.')) break;
        }
      }
      // (b) optimiser: a spare card (contract complete without it) is free to swap
      if (smart && !holdPossible) {
        for (let guard = 0; guard < 6; guard++) {
          const H = _holding(getState().hands[player] || [], playerIdx);
          if (_needOf(H, types).need !== 0) break;
          const spare = H.filter(c => !isWild(c) && _swappable(c, playerIdx) &&
            _needOf(H.filter(x => x._id !== c._id), types).need === 0).sort(_byIdentity)[0];
          if (!spare || !doSwap(spare, 'a spare card for a wild, which can be played after laying down.')) break;
        }
      }
      if (done) {
        const handDiv = document.getElementById(`hand-${playerIdx}`);
        if (handDiv) window.cardRenderer.renderCardArray(getState().hands[player], handDiv, false, playerIdx, 'hand');
        window.cardRenderer.renderAllSubcontractAreas();
      }
    });
  }

  // ─── Step 5: Discard ──────────────────────────────────────────────────────

  function _aiDiscard(playerIdx, alive) {
    return _step(600, alive, () => {
      const { players, hands, roundFinished } = getState();
      if (roundFinished) return;

      const player = players[playerIdx];
      const hand   = [...(hands[player] || [])];
      if (hand.length === 0) return;

      const choice = _chooseDiscardDetailed(hand, playerIdx);
      if (!choice) return;

      window.gameLog?.logReason(player, choice.why);
      console.log(`AI ${playerIdx}: discarding ${choice.card.rank}${choice.card.suit}`);
      window.aiDiscard(choice.card, playerIdx);
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  THE PLANNER
  // ═════════════════════════════════════════════════════════════════════════
  // _solvePlan(cards, areaTypes, ctx) assigns cards to the contract areas.
  //   areaTypes : ['set','run',…] in area order
  //   ctx       : optional { unseen, unseenRank, playable } used only to break
  //               ties between plans that are equally close to complete.
  // Result: { need, done, areas, chosen }
  //   need  = cards still missing from the contract (0 = complete)
  //   done  = areas that are already complete
  //   areas = per-area arrays of card objects (set: naturals then wilds;
  //           run: ascending, wilds in their slot, missing slots left out)
  //
  // Rules built in:
  //   - a staged area must be a real partial: a set needs 2 cards (a natural
  //     plus a natural or wild), a run needs 2 slots of its 4-window filled.
  //     A lone single is never staged; the area stays empty instead.
  //   - runs are 4-card windows of one suit; an Ace is low or high; a wild
  //     placed in a window fills an inner gap first, then the LOW end, which
  //     keeps both ends of the run open when possible.
  //   - ties: fewest cards that could be played onto the table (kept out of
  //     the contract), then most outs, then most open run ends, then fewest
  //     wilds, then most points staged, then card identity (deterministic).

  const SET_COST = 3, RUN_COST = 4;
  const _solveCache = new Map();

  function _areaTypes(subAreas) {
    return subAreas.map(s => ((s.dataset?.label || '').toLowerCase().includes('set') ? 'set' : 'run'));
  }

  function _solvePlan(cards, areaTypes, ctx) {
    const light = !ctx;
    const nats = [], wilds = [];
    cards.forEach(c => (isWild(c) ? wilds : nats).push(c));
    nats.sort((a, b) => idOf(a) - idOf(b));
    const W = wilds.length;

    const pool = new Map();
    nats.forEach(c => {
      const k = keyOf(c);
      if (!pool.has(k)) pool.set(k, []);
      pool.get(k).push(c);
    });
    const avail = new Map();
    pool.forEach((a, k) => avail.set(k, a.length));

    const playable = (ctx && ctx.playable) || null;
    const unseen   = (ctx && ctx.unseen)   || (() => 0);
    const wantSet  = areaTypes.includes('set');
    const wantRun  = areaTypes.includes('run');
    let nextId = 0;

    // How useful a natural is to runs (neighbours of the same suit) — used so
    // sets give up their least run-useful suit first.
    const runValue = c => {
      const v = RANK_VAL[c.rank];
      let n = 0;
      nats.forEach(o => {
        if (o === c || o.suit !== c.suit) return;
        const w = RANK_VAL[o.rank];
        if (Math.abs(w - v) <= 3 || (c.rank === 'A' && w >= 11) || (o.rank === 'A' && v >= 11)) n++;
      });
      return n;
    };

    const mkOpt = (type, keys, w, deficit, extra) => {
      const use = new Map();
      keys.forEach(k => use.set(k, (use.get(k) || 0) + 1));
      let pen = 0, pts = 0;
      keys.forEach(k => {
        if (playable && playable.has(k)) pen++;
        pts += POINT_VAL[k.slice(0, -1)] || 0;
      });
      return Object.assign({ id: nextId++, type, keys, use, w, deficit, pen, pts,
                             outs: 0, ends: 0, empty: false }, extra || {});
    };

    // ── Set options ──
    const setOpts = [];
    if (wantSet) {
      const byRank = new Map();
      nats.forEach(c => {
        if (!byRank.has(c.rank)) byRank.set(c.rank, []);
        byRank.get(c.rank).push(c);
      });
      byRank.forEach((list, rank) => {
        list.sort((a, b) => (runValue(a) - runValue(b)) ||
                            (SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]) || (idOf(a) - idOf(b)));
        // Every distinct choice of which suits to use (a run may need one of them).
        for (let k = 1; k <= Math.min(3, list.length); k++) {
          const seenCombo = new Set();
          const pick = (from, chosenKeys) => {
            if (chosenKeys.length === k) {
              const keys = chosenKeys.slice();
              const sig = keys.slice().sort().join(',');
              if (seenCombo.has(sig)) return;
              seenCombo.add(sig);
              for (let w = 0; w <= Math.min(W, 3 - k); w++) {
                if (k + w < 2) continue;
                const deficit = SET_COST - k - w;
                const o = mkOpt('set', keys, w, deficit, { rank });
                if (!light && deficit > 0 && ctx.unseenRank) o.outs = ctx.unseenRank(rank);
                setOpts.push(o);
              }
              return;
            }
            for (let i = from; i < list.length; i++) {
              chosenKeys.push(keyOf(list[i]));
              pick(i + 1, chosenKeys);
              chosenKeys.pop();
            }
          };
          pick(0, []);
        }
      });
    }

    // ── Run options ──
    const runOpts = [];
    if (wantRun) {
      const mp = maxPos();
      const wrap = !!window.gameRules?.wrapAround;
      const suits = [...new Set(nats.map(c => c.suit))];
      const seen = new Set();
      suits.forEach(suit => {
        for (let p0 = 1; p0 + 3 <= mp; p0++) {
          const slots = [0, 1, 2, 3].map(i => {
            const rank = rankAtPos(p0 + i);
            return { rank, key: rank + suit, has: (avail.get(rank + suit) || 0) > 0 };
          });
          const hasIdx = slots.map((s, i) => (s.has ? i : -1)).filter(i => i >= 0);
          const m = hasIdx.length;
          if (!m) continue;
          const first = hasIdx[0], last = hasIdx[hasIdx.length - 1];
          const missing  = slots.map((s, i) => (s.has ? -1 : i)).filter(i => i >= 0);
          const internal = missing.filter(i => i > first && i < last);
          const below    = missing.filter(i => i < first).sort((a, b) => b - a);
          const above    = missing.filter(i => i > last).sort((a, b) => a - b);
          const order    = [...internal, ...below, ...above];
          const natKeys  = hasIdx.map(i => slots[i].key);
          for (let w = 0; w <= Math.min(W, missing.length); w++) {
            if (m + w < 2) continue;
            const wildAt = order.slice(0, w);
            const dedupe = suit + '|' + slots.map(s => s.rank).join('') + '|' + wildAt.join(',');
            if (seen.has(dedupe)) continue;
            seen.add(dedupe);
            const o = mkOpt('run', natKeys, w, missing.length - w, { suit, p0, slots, wildAt });
            o.ends = wrap ? 2 : ((p0 > 1 ? 1 : 0) + (p0 + 3 < mp ? 1 : 0));
            if (!light) {
              o.outs = missing.filter(i => !wildAt.includes(i))
                .reduce((s, i) => s + unseen(slots[i].key), 0);
            }
            runOpts.push(o);
          }
        }
      });
    }

    const cmpOpt = (a, b) => (a.deficit - b.deficit) || (b.keys.length - a.keys.length) ||
                             (b.pts - a.pts) || (a.id - b.id);
    setOpts.sort(cmpOpt);
    runOpts.sort(cmpOpt);
    const optsOf = { set: setOpts, run: runOpts };
    const EMPTY  = {
      set: { id: -1, type: 'set', keys: [], use: new Map(), w: 0, deficit: SET_COST, pen: 0, pts: 0, outs: 0, ends: 0, empty: true },
      run: { id: -1, type: 'run', keys: [], use: new Map(), w: 0, deficit: RUN_COST, pen: 0, pts: 0, outs: 0, ends: 0, empty: true },
    };

    // ── Search ──
    const n = areaTypes.length;
    const used = new Map();
    const chosen = new Array(n);
    let best = null;

    const betterThan = (t, sig, b) => {
      for (let i = 0; i < t.length; i++) if (t[i] !== b.t[i]) return t[i] < b.t[i];
      return sig < b.sig;
    };

    // When explaining (staging), also remember the best OTHER complete plan that tied on
    // need, so the log can say why this one was preferred. Costs nothing otherwise.
    const explain = !!(ctx && ctx.explain);
    let runner = null;
    // (A plan using the very same cards, only with the wild or the group order swapped, is
    // not a real alternative.)
    const cardSig = p => p.chosen.flatMap(o => o.keys).sort().join(',');
    const consider = (p, ref) => {
      if (cardSig(p) === cardSig(ref)) return;
      if (!runner || betterThan(p.t, p.sig, runner)) runner = p;
    };

    function rec(i, need, wUsed, prevIdx) {
      if (best && need > best.need) return;
      if (i === n) {
        let pen = 0, outs = 0, ends = 0, pts = 0;
        for (const o of chosen) { pen += o.pen; outs += o.outs; ends += o.ends; pts += o.pts; }
        const t = [need, pen, -outs, -ends, wUsed, -pts];
        const sig = chosen.map(o => o.id).join(',');
        const cand = { need, t, sig, chosen: chosen.slice(), wUsed };
        if (!best || betterThan(t, sig, best)) {
          const old = best;
          best = cand;
          if (explain && old) consider(old, best);
        } else if (explain) consider(cand, best);
        return;
      }
      const type = areaTypes[i];
      const list = optsOf[type];
      const start = (i > 0 && areaTypes[i - 1] === type) ? prevIdx : 0;
      for (let j = start; j <= list.length; j++) {
        const o = j < list.length ? list[j] : EMPTY[type];
        if (wUsed + o.w > W) continue;
        let ok = true;
        for (const [k, c] of o.use) {
          if ((used.get(k) || 0) + c > avail.get(k)) { ok = false; break; }
        }
        if (!ok) continue;
        for (const [k, c] of o.use) used.set(k, (used.get(k) || 0) + c);
        chosen[i] = o;
        rec(i + 1, need + o.deficit, wUsed + o.w, j);
        for (const [k, c] of o.use) used.set(k, used.get(k) - c);
      }
    }
    rec(0, 0, 0, 0);

    const done = best.chosen.filter(o => !o.empty && o.deficit === 0).length;
    const result = { need: best.need, done, chosen: best.chosen, areas: null, leftover: null,
                     bestT: best.t, runnerUp: runner };
    if (light) return result;

    // Materialise the chosen options into real card objects.
    const copies = new Map();
    pool.forEach((a, k) => copies.set(k, a.slice()));
    const spareWilds = wilds.slice();
    const usedIds = new Set();
    result.areas = best.chosen.map(o => {
      const out = [];
      if (o.empty) return out;
      if (o.type === 'set') {
        o.keys.forEach(k => out.push(copies.get(k).shift()));
        for (let w = 0; w < o.w; w++) out.push(spareWilds.shift());
      } else {
        let wi = 0;
        o.slots.forEach((s, i) => {
          if (s.has) out.push(copies.get(s.key).shift());
          else if (o.wildAt.includes(i)) { wi++; out.push(spareWilds.shift()); }
        });
      }
      out.forEach(c => usedIds.add(c._id));
      return out;
    });
    result.leftover = cards.filter(c => !usedIds.has(c._id));
    return result;
  }

  // Cheap cached "how many cards short is this collection of cards?".
  function _needOf(cards, areaTypes) {
    let w = 0;
    const ks = [];
    cards.forEach(c => { if (isWild(c)) w++; else ks.push(keyOf(c)); });
    ks.sort();
    const key = areaTypes.join('') + '#' + w + '#' + ks.join(',') +
                '#' + (window.gameRules?.wrapAround ? 1 : 0);
    let r = _solveCache.get(key);
    if (!r) {
      if (_solveCache.size > 4000) _solveCache.clear();
      r = _solvePlan(cards, areaTypes, null);
      _solveCache.set(key, r);
    }
    return r;
  }

  // Extend finished set areas with spare natural cards of the same rank (the
  // 4th+ card of a complete set is staged IN the set, not left in hand).
  // `leftover` only holds cards the plan did not need for another area, so a
  // card wanted by a separate set is never pulled in here. Wilds stay in hand.
  function _extendSets(plan, chosen, leftover) {
    const pool = leftover.filter(c => !isWild(c));
    chosen.forEach((o, ai) => {
      if (o.empty || o.type !== 'set' || o.deficit !== 0 || !o.rank) return;
      for (let i = pool.length - 1; i >= 0; i--) {
        if (pool[i].rank === o.rank) plan[ai].push(pool.splice(i, 1)[0]);
      }
    });
  }

  // Extend finished run areas with leftover cards that sit directly next to
  // them (e.g. 5-8♠ complete + a spare 9♠), i.e. the 5th+ card of a run.
  function _extendRuns(plan, chosen, leftover) {
    const mp = maxPos();
    const pool = new Map();
    leftover.forEach(c => {
      if (isWild(c)) return;
      const k = keyOf(c);
      if (!pool.has(k)) pool.set(k, []);
      pool.get(k).push(c);
    });
    chosen.forEach((o, ai) => {
      if (o.empty || o.type !== 'run' || o.deficit !== 0) return;
      let lo = o.p0, hi = o.p0 + 3;
      for (;;) {
        const k = rankAtPos(hi + 1) + o.suit;
        if (hi + 1 <= mp && pool.get(k)?.length) { plan[ai].push(pool.get(k).shift()); hi++; } else break;
      }
      for (;;) {
        const k = rankAtPos(lo - 1) + o.suit;
        if (lo - 1 >= 1 && pool.get(k)?.length) { plan[ai].unshift(pool.get(k).shift()); lo--; } else break;
      }
    });
  }

  // ─── Visible information ──────────────────────────────────────────────────

  function _decks() {
    const players = getState().players.length;
    let d = 2;
    if (players > 3) d += Math.floor((players - 3) / 2);
    return d + (window.gameRules?.extraDeck || 0);
  }

  // Build the planner context for `playerIdx` holding `cards`.
  // unseen(key) = copies of a card not yet visible to this player
  //             = decks − (own cards + discard pile + laid-down contracts).
  function _buildCtx(cards, playerIdx) {
    const st = getState();
    const decks = _decks();
    const seen = new Map();
    const ids  = new Set();
    const bump = c => {
      if (c._id !== undefined) { if (ids.has(c._id)) return; ids.add(c._id); }
      const k = keyOf(c); seen.set(k, (seen.get(k) || 0) + 1);
    };
    const prof = _profile(playerIdx);
    cards.forEach(bump);
    const pile = st.discardPile || [];
    if (prof.infoScope === 'last5') {
      // Own discards are remembered even once they are buried in the pile.
      (window.aiInfo?.discardedBy?.(playerIdx) || []).forEach(bump);
      pile.slice(-5).forEach(bump);
    } else {
      pile.forEach(bump);
    }
    if (prof.infoScope === 'all') {
      st.players.forEach((name, i) => {
        if (!st.laidDownPlayers.has(i)) return;
        if (i === playerIdx) return;
        (st.subcontractCards[name] || []).forEach(bump);
      });
    }
    const unseen = k => Math.max(0, decks - (seen.get(k) || 0));
    const suits = ['♥','♦','♣','♠'];
    if (window.gameRules?.extraSuit) suits.push('★');
    const unseenRank = r => suits.reduce((s, su) => s + unseen(r + su), 0);

    let playable = null;
    if (playerIdx !== undefined && playerIdx !== null && _optimising(playerIdx)) {
      playable = new Set();
      cards.forEach(c => {
        if (isWild(c)) return;
        const k = keyOf(c);
        if (playable.has(k)) return;
        const t = window.validator.canPlayOnExistingContracts(c, playerIdx);
        if (t && t.playerIdx !== playerIdx) playable.add(k);
      });
    }
    return { unseen, unseenRank, playable, suits, decks, seen };
  }

  // Number of unseen wild cards (pooled — any wild type helps equally).
  function _unseenWilds(ctx) {
    let total = 0, seen = 0;
    const ranks = [...RANKS, 'W'];
    ctx.suits.forEach(su => ranks.forEach(r => {
      if (isWild({ rank: r, suit: su })) { total += ctx.decks; seen += ctx.seen.get(r + su) || 0; }
    }));
    return Math.max(0, total - seen);
  }

  function _wildProto() {
    for (const su of ['♦','♥','♣','♠','★']) {
      for (const r of [...RANKS, 'W']) if (isWild({ rank: r, suit: su })) return { rank: r, suit: su, _id: 0 };
    }
    return null;
  }

  // Outs: unseen cards that would reduce `need` if drawn next (wild counted once).
  function _outsOf(H, areaTypes, ctx) {
    const base = _needOf(H, areaTypes).need;
    if (base === 0) return 0;
    const nats = H.filter(c => !isWild(c));
    const wantSet = areaTypes.includes('set'), wantRun = areaTypes.includes('run');
    let sum = 0;
    ctx.suits.forEach(su => RANKS.forEach(r => {
      const proto = { rank: r, suit: su, _id: 0 };
      if (isWild(proto)) return;
      const u = ctx.unseen(r + su);
      if (u <= 0) return;
      const relevant = nats.some(c =>
        (wantSet && c.rank === r) ||
        (wantRun && c.suit === su && (
          Math.abs(RANK_VAL[c.rank] - RANK_VAL[r]) <= 3 ||
          (r === 'A' && RANK_VAL[c.rank] >= 11) || (c.rank === 'A' && RANK_VAL[r] >= 11))));
      if (!relevant) return;
      if (_needOf([...H, proto], areaTypes).need < base) sum += u;
    }));
    const wp = _wildProto();
    const uw = _unseenWilds(ctx);
    if (wp && uw > 0 && _needOf([...H, wp], areaTypes).need < base) sum += uw;
    return sum;
  }

  // ─── Public staging function ──────────────────────────────────────────────

  // Why the AI staged what it did (debug log): the last staging decision per player.
  const _stageWhy = {};

  function _optText(o) {
    if (!o || o.empty) return 'nothing';
    if (o.type === 'set') return `set of ${o.rank}s (${o.keys.join(' ')}${o.w ? ` +${o.w} wild` : ''})`;
    return `${o.suit} run ${o.slots.map(s => s.rank).join('-')} (${o.keys.join(' ')}${o.w ? ` +${o.w} wild` : ''})`;
  }

  // Compare the chosen plan with the best alternative that tied on cards-short; name the
  // first criterion that separated them (same order the solver uses).
  function _stagingWhy(result) {
    const alt = result.runnerUp;
    if (!alt) return null;
    const sig = p => p.chosen.flatMap(o => o.keys).sort().join(',');
    if (sig(alt) === sig({ chosen: result.chosen })) return null;
    const bt = result.bestT, at = alt.t;
    const k = bt.findIndex((v, i) => v !== at[i]);
    const diff = result.chosen.map((o, a) => (o.id !== alt.chosen[a].id ? a : -1)).filter(a => a >= 0);
    if (!diff.length) return null;
    const mine  = diff.map(a => _optText(result.chosen[a])).join(' + ');
    const other = diff.map(a => _optText(alt.chosen[a])).join(' + ');
    let why;
    switch (k) {
      case 0: why = `fewer cards short of a complete contract (${bt[0]} vs ${at[0]})`; break;
      case 1: why = `it keeps more cards that can be played onto laid-down contracts later (stages ${bt[1]} such cards vs ${at[1]})`; break;
      case 2: why = `more outs, i.e. unseen cards that would finish it (${-bt[2]} vs ${-at[2]})`; break;
      case 3: why = `more open run ends (${-bt[3]} vs ${-at[3]})`; break;
      case 4: why = `it uses fewer wilds (${bt[4]} vs ${at[4]})`; break;
      case 5: why = `more points tied up in the groups (${-bt[5]} vs ${-at[5]})`; break;
      default: why = 'a tie on every measure, so the fixed card order decided';
    }
    return `chose ${mine} over ${other}: ${why}.`;
  }

  function _findOptimalStaging(allCards, roundIndex, subAreas, playerIdx) {
    const types = _areaTypes(subAreas);
    const ctx   = _buildCtx(allCards, playerIdx);
    ctx.explain = true;
    const plan  = _solvePlan(allCards, types, ctx);
    _stageWhy[playerIdx] = _stagingWhy(plan);
    _extendSets(plan.areas, plan.chosen, plan.leftover);
    _extendRuns(plan.areas, plan.chosen, plan.leftover);
    return plan.areas;
  }

  // Apply a staging to gameState (uses _id so duplicate cards survive).
  function _applyStaging(playerIdx, staging) {
    const { players, hands, subcontractCards } = getState();
    const player    = players[playerIdx];
    const stagedIds = new Set(staging.flat().map(c => c._id));

    const allCards = [...(hands[player] || []), ...(subcontractCards[player] || [])];
    const newHand  = allCards.filter(c => !stagedIds.has(c._id));
    const newSub   = [];
    staging.forEach((cards, areaIdx) => {
      cards.forEach(card => newSub.push({ ...card, subArea: areaIdx }));
    });

    setState({
      hands:            { ...hands, [player]: newHand },
      subcontractCards: { ...subcontractCards, [player]: newSub },
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  DISCARD
  // ═════════════════════════════════════════════════════════════════════════
  // Pre lay-down ranking (first rule that separates the candidates wins):
  //   1. the contract stays as close to complete as possible (lowest NEED
  //      after the card is removed)
  //   2. most outs (cards that would still advance the contract); plans within
  //      85% of the best count as equal
  //   3. not a gift: do not hand a laid-down opponent a card they can play
  //   4. least connected to the rest of the hand (pairs, same-suit neighbours)
  //   5. most points
  //   6. fixed card order (never array order)
  // Laid-down players: highest points that is not a gift.

  const cardOrderKey = c => (RANK_VAL[c.rank] || 0) * 100 + (SUIT_ORDER[c.suit] || 0) * 10;

  function _byIdentity(a, b) {
    return (cardOrderKey(b) - cardOrderKey(a)) || (idOf(a) - idOf(b));
  }

  function _connectivity(d, others, areaTypes) {
    let n = 0;
    const wantSet = areaTypes.includes('set'), wantRun = areaTypes.includes('run');
    others.forEach(o => {
      if (isWild(o)) return;
      if (wantSet && o.rank === d.rank) n += 2;
      if (wantRun && o.suit === d.suit) {
        const a = RANK_VAL[d.rank], b = RANK_VAL[o.rank];
        if (Math.abs(a - b) <= 2 || (d.rank === 'A' && b >= 12) || (o.rank === 'A' && a >= 12)) n += 1;
      }
    });
    return n;
  }

  // Choose the best card to discard from `cands`, given the full holding H.
  // Returns { card, why } or null.
  function _pickDiscard(cands, H, playerIdx, areaTypes) {
    if (!cands.length) return null;
    const ctx = _buildCtx(H, playerIdx);

    // One representative per distinct card type (copies are interchangeable).
    const reps = new Map();
    [...cands].sort(_byIdentity).forEach(c => { const k = keyOf(c); if (!reps.has(k)) reps.set(k, c); });
    let pool = [...reps.values()].map(c => {
      const Hd = H.filter(x => x._id !== c._id);
      return { card: c, Hd, need: _needOf(Hd, areaTypes).need };
    });

    let why = null;
    const bestNeed = Math.min(...pool.map(p => p.need));
    pool = pool.filter(p => p.need === bestNeed);
    const needAfter = bestNeed;

    // Hold on to cards that could swap for a wild on the table.
    if (pool.length > 1) {
      const keep = pool.filter(p => !_swappable(p.card, playerIdx));
      if (keep.length && keep.length < pool.length) pool = keep;
    }

    if (pool.length > 1 && bestNeed > 0) {
      pool.forEach(p => { p.outs = _outsOf(p.Hd, areaTypes, ctx); });
      const maxOuts = Math.max(...pool.map(p => p.outs));
      pool = pool.filter(p => p.outs >= 0.85 * maxOuts);
    }
    if (pool.length > 1) {
      const nonGift = pool.filter(p => !_isGiftCard(p.card, playerIdx));
      if (nonGift.length && nonGift.length < pool.length) { pool = nonGift; why = 'gift'; }
    }
    if (pool.length > 1) {
      const maxPass = Math.max(...pool.map(p => _passed(p.card, playerIdx)));
      if (maxPass > 0) pool = pool.filter(p => _passed(p.card, playerIdx) === maxPass);
    }
    if (pool.length > 1) {
      pool.forEach(p => { p.conn = _connectivity(p.card, p.Hd, areaTypes); });
      const minConn = Math.min(...pool.map(p => p.conn));
      pool = pool.filter(p => p.conn === minConn);
    }
    if (pool.length > 1 && window.aiInfo) {
      // A card just drawn/taken this turn is only discarded if nothing else is as good.
      const fresh = pool.filter(p => !window.aiInfo.wasJustDrawn(playerIdx, p.card));
      if (fresh.length && fresh.length < pool.length) pool = fresh;
    }
    if (pool.length > 1) {
      const maxPts = Math.max(...pool.map(p => ptsOf(p.card)));
      pool = pool.filter(p => ptsOf(p.card) === maxPts);
    }
    pool.sort((a, b) => _byIdentity(a.card, b.card));
    return { card: pool[0].card, needAfter, why };
  }

  function _chooseDiscardDetailed(hand, playerIdx) {
    const { players, subcontractCards, laidDownPlayers, roundIndex } = getState();
    const player  = players[playerIdx];
    const nonWild = hand.filter(c => !isWild(c));

    // Laid down: shed the highest-point card, avoiding gifts to other laid-down players.
    if (laidDownPlayers.has(playerIdx)) {
      // Cards that could still swap for a table wild are kept when anything else can go.
      const keepable = nonWild.filter(c => !_swappable(c, playerIdx));
      const base = keepable.length ? keepable : nonWild;
      const safe = base.filter(c => !_isGiftCard(c, playerIdx));
      const pool = (safe.length ? safe : base);
      if (!pool.length) {
        const c = hand.slice().sort(_byIdentity)[0];
        return c ? { card: c, why: `discarding ${c.rank}${c.suit} — only wilds left.` } : null;
      }
      const maxPts = Math.max(...pool.map(ptsOf));
      const top = pool.filter(c => ptsOf(c) === maxPts);
      const maxPass = Math.max(...top.map(c => _passed(c, playerIdx)));
      const safer = maxPass > 0 ? top.filter(c => _passed(c, playerIdx) === maxPass) : top;
      const card = safer.sort(_byIdentity)[0];
      const why = safe.length
        ? `discarding ${card.rank}${card.suit} (${ptsOf(card)}pts) — highest-value card with no play target.`
        : `discarding ${card.rank}${card.suit} (${ptsOf(card)}pts) — would gift to opponent; choosing lesser evil.`;
      return { card, why };
    }

    const staged = subcontractCards[player] || [];
    const labels = window.gameState.CONTRACT_SUB_AREAS[roundIndex] || [];
    const types  = labels.map(l => (l.toLowerCase().includes('set') ? 'set' : 'run'));
    const H = [...hand, ...staged];

    const pick = _pickDiscard(nonWild, H, playerIdx, types);
    if (!pick) {
      const c = hand.slice().sort(_byIdentity)[0];
      return c ? { card: c, why: `discarding ${c.rank}${c.suit} — only wilds left.` } : null;
    }
    const c = pick.card;
    let why;
    if (pick.needAfter === 0) {
      why = `discarding ${c.rank}${c.suit} (${ptsOf(c)}pts) — contract is complete without it.`;
    } else if (pick.why === 'gift') {
      why = `discarding ${c.rank}${c.suit} (${ptsOf(c)}pts) — not needed (still ${pick.needAfter} short); the alternatives would gift an opponent.`;
    } else {
      why = `discarding ${c.rank}${c.suit} (${ptsOf(c)}pts) — not needed; contract stays ${pick.needAfter} card${pick.needAfter === 1 ? '' : 's'} short without it.`;
    }
    return { card: c, why };
  }

  function _chooseDiscard(hand, playerIdx) {
    const r = _chooseDiscardDetailed(hand, playerIdx);
    return r ? r.card : null;
  }

  // True if discarding `card` would help an opponent: a laid-down player can
  // play it at once, or ANY opponent (laid down or not) has shown they collect
  // it by taking/buying the same rank or a same-suit neighbour this round.
  function _isGiftCard(card, discardingIdx) {
    const prof = _profile(discardingIdx);
    if (prof.tableGift) {
      const target = window.validator.canPlayOnExistingContracts(card, discardingIdx);
      if (target && target.playerIdx !== discardingIdx) return true;
    }
    const info = window.aiInfo;
    if (!info || !prof.infer) return false;
    const { players } = getState();
    for (let i = 0; i < players.length; i++) {
      if (i !== discardingIdx && info.interest(i, card) >= 2) return true;
    }
    return false;
  }

  // Cards other players already passed on are the safest to throw.
  const _passed = (c, idx) => (window.aiInfo && _profile(idx).infer ? window.aiInfo.passCount(c, idx) : 0);

  // ═════════════════════════════════════════════════════════════════════════
  //  TAKE (free draw from the discard pile) AND BUY
  // ═════════════════════════════════════════════════════════════════════════

  function _contractTypes() {
    const { roundIndex } = getState();
    return (window.gameState.CONTRACT_SUB_AREAS[roundIndex] || [])
      .map(l => (l.toLowerCase().includes('set') ? 'set' : 'run'));
  }

  function _holding(hand, playerIdx) {
    const { players, subcontractCards } = getState();
    return [...hand, ...(subcontractCards[players[playerIdx]] || [])];
  }

  // Does `card` sit directly next to a finished group of the current plan
  // (so it can be played onto it once laid down)?
  function _extendsPlan(card, plan) {
    if (isWild(card)) return false;
    return plan.chosen.some(o => {
      if (o.empty || o.deficit !== 0) return false;
      if (o.type === 'set') return o.rank === card.rank;
      if (o.suit !== card.suit) return false;
      const mp = maxPos();
      const hiOk = o.p0 + 4 <= mp && rankAtPos(o.p0 + 4) === card.rank;
      const loOk = o.p0 - 1 >= 1 && rankAtPos(o.p0 - 1) === card.rank;
      return hiOk || loOk;
    });
  }

  function _takeDecision(card, hand, playerIdx, hasLaid) {
    const name = `${card.rank}${card.suit}`;
    if (isWild(card)) return { take: true, why: `took ${name} from discards — a wild.` };

    if (hasLaid) {
      if (window.validator.canPlayOnExistingContracts(card, playerIdx)) {
        return { take: true, why: `took ${name} from discards — can play it directly onto a laid-down contract.` };
      }
      if (_cardExtendsHandSequence(card, hand, playerIdx)) {
        return { take: true, why: `took ${name} from discards — extends a hand sequence toward a laid-down run.` };
      }
      if (_swappable(card, playerIdx)) {
        const smart = _profile(playerIdx).optimise >= 0.75;
        const gain = _playout([...hand, card], playerIdx, true, smart).shed - _playout(hand, playerIdx, true, smart).shed;
        if (gain >= 1) return { take: true, why: `took ${name} from discards — it swaps for a wild on the table, which can be played on.` };
      }
      return { take: false };
    }

    const types = _contractTypes();
    const H     = _holding(hand, playerIdx);
    const base  = _needOf(H, types);
    const withC = _needOf([...H, card], types);

    if (withC.need < base.need) {
      let why;
      if (withC.need === 0) why = `took ${name} from discards — completes the contract.`;
      else if (withC.done > base.done) why = `took ${name} from discards — completes a group (still ${withC.need} short).`;
      else why = `took ${name} from discards — advances the contract (${base.need} short → ${withC.need}).`;
      return { take: true, why };
    }
    if (base.need === 0 && (_extendsPlan(card, base) || _cardExtendsHandSequence(card, hand, playerIdx))) {
      return { take: true, why: `took ${name} from discards — extends a finished group (can be played after lay-down).` };
    }
    if (base.need > 0 && _swappable(card, playerIdx)) {
      const plan = _swapPlan([...H, card], playerIdx, types);
      if (plan && plan.some(s => s.card._id === card._id) && !_swapPlan(H, playerIdx, types)) {
        return { take: true, why: `took ${name} from discards — it swaps for a wild on the table, which completes the contract (lay down this turn).` };
      }
    }
    return { take: false };
  }

  function _discardHelpsAI(card, hand, playerIdx, hasLaid) {
    return _takeDecision(card, hand, playerIdx, hasLaid).take;
  }

  // Returns true if `card` combines with same-suit hand cards into a sequence
  // that could be played onto a laid-down run ("holding 4-5♥, discard is 6♥").
  function _cardExtendsHandSequence(card, hand, playerIdx) {
    const { laidDownPlayers, players, subcontractCards } = getState();

    const sameSuitHand = isWild(card) ? hand : hand.filter(c => !isWild(c) && c.suit === card.suit);
    if (!sameSuitHand.length) return false;
    const combined = [...sameSuitHand, card];

    for (const [pi, pname] of players.entries()) {
      if (!laidDownPlayers.has(pi)) continue;
      const subAreas = window.getSubcontractSubAreas(pi);
      for (let areaIdx = 0; areaIdx < subAreas.length; areaIdx++) {
        const label = (subAreas[areaIdx].dataset.label || '').toLowerCase();
        if (!label.includes('run')) continue;
        const areaCards = (subcontractCards[pname] || []).filter(c => c.subArea === areaIdx);
        const nonWilds  = areaCards.filter(c => !isWild(c));
        if (!nonWilds.length) continue;
        if (!isWild(card) && card.suit !== nonWilds[0].suit) continue;
        const lowVal  = Math.min(...nonWilds.map(c => RANK_VAL[c.rank] || 0));
        const highVal = Math.max(...nonWilds.map(c => RANK_VAL[c.rank] || 0));
        const span    = combined.length;
        const relevant = combined.filter(c => {
          if (isWild(c)) return true;
          const v = RANK_VAL[c.rank] || 0;
          const vHigh = c.rank === 'A' ? 14 : v;
          return (v >= lowVal - span && v <= highVal + span) ||
                 (vHigh >= lowVal - span && vHigh <= highVal + span);
        });
        if (relevant.length >= 2) return true;
      }
    }
    return false;
  }

  // How many cards in `hand` can be played onto any laid-down contract now.
  function _countPlayableCards(hand, playerIdx) {
    let count = 0;
    for (const card of hand) {
      if (window.validator.canPlayOnExistingContracts(card, playerIdx)) count++;
    }
    return count;
  }

  // Buying costs a buy and brings in the card PLUS one extra card from the deck,
  // so it must be worth two cards:
  //   before lay-down: only when the card completes the contract or finishes a
  //                    group (never just to make a pair); a wild always.
  //   after lay-down : only when it adds at least 2 NEW plays (plays the hand
  //                    already had do not count).
  function shouldBuy(playerIdx, card) { return _buyDecision(playerIdx, card).buy; }

  // { buy, why } - the same decision with the reason (shown in the debug log).
  function _buyDecision(playerIdx, card) {
    const { players, hands, laidDownPlayers } = getState();
    const hand    = hands[players[playerIdx]] || [];
    const hasLaid = laidDownPlayers.has(playerIdx);
    const name    = `${card.rank}${card.suit}`;
    const yes = why => ({ buy: true, why: `bought ${name} - ${why}` });
    const no  = { buy: false, why: null };

    if (isWild(card)) return yes('a wild.');

    if (hasLaid) {
      const delta = _countPlayableCards([...hand, card], playerIdx) - _countPlayableCards(hand, playerIdx);
      if (delta >= 2) return yes(`it adds ${delta} new plays onto laid-down contracts.`);
      if (delta >= 1 && _cardExtendsHandSequence(card, hand, playerIdx)) {
        return yes('it adds a play and extends a hand sequence toward a laid-down run.');
      }
      // Buying a card only to swap it for a wild is usually not worth the extra card;
      // it is when the wild then opens plays for at least two OTHER cards in hand
      // (the swapped card itself, plus those two: a gain of 3).
      if (_swappable(card, playerIdx)) {
        const smart = _profile(playerIdx).optimise >= 0.75;
        const gain = _playout([...hand, card], playerIdx, true, smart).shed - _playout(hand, playerIdx, true, smart).shed;
        if (gain >= 3) return yes(`it swaps for a wild on the table, which opens ${gain} plays in total.`);
      }
      return no;
    }

    const types = _contractTypes();
    const H     = _holding(hand, playerIdx);
    const base  = _needOf(H, types);
    const withC = _needOf([...H, card], types);
    if (withC.need === 0 && base.need > 0) return yes('it completes the contract.');
    if (withC.need < base.need && withC.done > base.done) return yes(`it completes a group (still ${withC.need} short).`);
    // Swapping the card for a wild on the table completes the contract.
    if (base.need > 0 && _swappable(card, playerIdx)) {
      const plan = _swapPlan([...H, card], playerIdx, types);
      if (plan && plan.some(s => s.card._id === card._id) && !_swapPlan(H, playerIdx, types)) {
        return yes('it swaps for a wild on the table, which completes the contract.');
      }
    }
    return no;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  HOLDING A COMPLETE CONTRACT / VETO  (Phase 3)
  // ═════════════════════════════════════════════════════════════════════════

  // Should this player keep a complete contract staged this turn instead of
  // laying down? Only while the Shanghai window is open, only when the round
  // and level allow it (HOLD_POLICY), and only with 2..maxExtra unstaged
  // cards (with 0-1 the player lays down and goes out right now).
  function _shouldHold(playerIdx) {
    const st = getState();
    const rules = window.gameRules || {};
    const { roundIndex, players, hands } = st;
    if (_heldRound !== roundIndex) {
      _heldRound = roundIndex;
      Object.keys(_held).forEach(k => delete _held[k]);
    }
    if (st.laidDownPlayers.size > 0) return false;                 // window already closed
    const hardOn = roundIndex === 7 ? (rules.finalShanghai || rules.hardShanghai) : rules.hardShanghai;
    if (!hardOn) return false;                                     // nothing to chase
    const pol = HOLD_POLICY[roundIndex]?.[_levelOf(playerIdx)];
    if (!pol) return false;
    if ((_held[playerIdx] || 0) >= pol.maxTurns) return false;
    const extra = (hands[players[playerIdx]] || []).filter(c => !isWild(c)).length;
    return extra >= 2 && extra <= pol.maxExtra;
  }

  // A veto is the next player taking the top discard only to stop a buyer.
  // Ruthless, a % of the time, when another player who could still buy it has
  // shown (by taking/buying the same rank or a neighbour) that they collect it.
  function _vetoWanted(card, playerIdx) {
    const chance = _profile(playerIdx).veto;
    if (!chance || !window.aiInfo) return false;
    const st = getState();
    const n = st.players.length;
    const discarder = (playerIdx - 1 + n) % n;
    const selfDiscard = !!window.gameRules?.selfDiscard;
    const target = st.players.some((_, j) => {
      if (j === playerIdx) return false;
      if (j === discarder && !selfDiscard) return false;
      const buysEl = document.getElementById(`player-${j}`)?.querySelector('.stat-buys');
      const buys = buysEl ? Number(buysEl.textContent.split(':')[1]) : 3;
      if (!(buys > 0)) return false;
      return window.aiInfo.interest(j, card) >= 2;
    });
    return target && Math.random() < chance;
  }

  // The next player's whole decision in the buy window: take the card because
  // it helps, or (Ruthless) to veto a buyer.
  function _shouldTake(card, hand, playerIdx, hasLaid) {
    return _takeWhy(card, hand, playerIdx, hasLaid).take;
  }

  // { take, why } - same decision with the reason (the veto roll happens exactly once).
  function _takeWhy(card, hand, playerIdx, hasLaid) {
    const t = _takeDecision(card, hand, playerIdx, hasLaid);
    if (t.take) return t;
    if (_vetoWanted(card, playerIdx)) {
      return { take: true, why: `took ${card.rank}${card.suit} from discards only to veto a buyer - another player appears to be collecting it.` };
    }
    return { take: false };
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  window.aiEngine = {
    executeAITurn,
    preStage,
    shouldBuy,
    _buyDecision,
    _takeWhy,
    _discardHelpsAI,
    _shouldTake,
  };

  // Back-compat alias.
  window.executeAITurn = executeAITurn;
})();
