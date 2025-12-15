(() => {
  const tableContainer = document.getElementById('table-container');
  const playersContainer = document.getElementById('playersContainer');
  const contractsContainer = document.getElementById('contractsContainer');
  const drawPileDiv = document.getElementById('drawPile');
  const discardPileDiv = document.getElementById('discardPile');
  const suitOrder = ['♦', '♥', '♣', '♠', '★'];
  const rankOrder = ['A','2','3','4','5','6','7','8','9','10','J','Q','K','A','W'];
  const roundHistory = [];
  
  const OVERLAP_PCT = 0.35; // 35% overlap
  let players = [];
  let contracts = [];
  let hands = {};
  let subcontractCards = {}; // flat arrays of cards per player including subArea property
  let drawPile = [];
  let discardPile = [];
  let hasDrawn = false;
  window.hasDrawn = hasDrawn;
  let RoundStarter = 0;
  let roundFinished = false;

  // Customization defaults & variables
  let suitColors = {};
  let backColors = { center: "#000000", edge1: "#333333", edge2: "#666666", edge3: "#999999", outline: "#ffffff", edgeWidth: 6 };
  let suitSize = 90;
  let rankSize = 65;

  // Round index variable
  let roundIndex = 0;
  let Softwindow = false;
  let Hardwindow = false;

  // Contracts text by round
  const roundContracts = [
    "2 Sets",
    "1 Set + 1 Run",
    "2 Runs",
    "3 Sets",
    "2 Sets + 1 Run",
    "1 Set + 2 Runs",
    "3 Runs"
  ];
  
  const CONTRACT_SUB_AREAS = {
    1: ['Set 1', 'Set 2'],
    2: ['Set 1', 'Run 1'],
    3: ['Run 1', 'Run 2'],
    4: ['Set 1', 'Set 2', 'Set 3'],
    5: ['Set 1', 'Set 2', 'Run 1'],
    6: ['Set 1', 'Run 1', 'Run 2'],
    7: ['Run 1', 'Run 2', 'Run 3']
  };
  
  function getMyTurnPlayerIndex() {
    return players.findIndex((_, i) => {
      const el = document.getElementById(`player-${i}`);
      return el?.classList.contains('MyTurn');
    });
  }
  
  function isWild(card) {
    const rules = window.gameRules || {};
    if (!rules.wildsEnabled) return false;
  
    const type = (rules.wildType || 'classic').toLowerCase();
  
    if (type === 'classic')
      return card.rank === '3' && (card.suit === '♦' || card.suit === '♥');
  
    if (type === 'extra')
      return (
        card.rank === '3' &&
        (card.suit === '♦' || card.suit === '♥' || card.suit === '★')
      );
  
    if (type === 'joker')
      return card.rank === 'W';
  
    return false;
  }
  
  function isValidSet(cards) {
    const wildCnt   = cards.filter(isWild).length;
    const nonWild   = cards.filter(c => !isWild(c));
  
    // If there are no non‑wild cards, we need at least 3 wilds.
    if (nonWild.length === 0) return wildCnt >= 3;
  
    // Gather the distinct ranks among the non‑wild cards.
    const distinctRanks = [...new Set(nonWild.map(c => c.rank))];
  
    // More than one rank → cannot be a single set.
    if (distinctRanks.length > 1) return false;
  
    // All non‑wild cards share the same rank.
    const needed = Math.max(0, 3 - nonWild.length); // how many wilds we need
    return wildCnt >= needed;
  }
  
  function isValidRun(cards) {
    // --------------------------------------------------------------
    // 1️⃣  Split wilds from the rest.
    // --------------------------------------------------------------
    const wildCnt   = cards.filter(isWild).length;
    const nonWild   = cards.filter(c => !isWild(c));
  
    const totalLen = nonWild.length + wildCnt;   // exact length of the run
    if (totalLen < 4) return false;             // need ≥4 cards
  
    // If there are no non‑wild cards, any 4+ wilds are a valid run.
    if (nonWild.length === 0) return wildCnt >= 4;
  
    // --------------------------------------------------------------
    // 2️⃣  All non‑wild cards must share one suit.
    // --------------------------------------------------------------
    const distinctSuits = [...new Set(nonWild.map(c => c.suit))];
    if (distinctSuits.length > 1) return false;
    const runSuit = distinctSuits[0];
    
      // Choose rank order with possible wrapAround
      const wrapAround = window.gameRules?.wrapAround ?? false;
      let extendedRankOrder = rankOrder;
      if (wrapAround) {
        // For wrapAround, extend rankOrder to allow Q-K-A-2 sequences
        // rankOrder is ['A','2','3',...,'K','A','W']
        // We create a cycle by appending '2','3','4' at the end so Q-K-A-2 is valid
        extendedRankOrder = ['A','2','3','4','5','6','7','8','9','10','J','Q','K','A','2','3','4','5','6','7','8','9','10','J','Q','K','A'];
        const maxStart = extendedRankOrder.length - totalLen;
  
        const matchesSequence = (seq) => {
          let usedWilds = 0;
          for (let i = 0; i < cards.length; ++i) {
            const card = cards[i];
            if (isWild(card)) {
              usedWilds++;
              continue;
            }
            if (card.rank !== seq[i] || card.suit !== runSuit) return false;
          }
          return usedWilds <= wildCnt;
        };
      
        for (let start = 0; start <= maxStart; ++start) {
          // Ascending e.g. 5-6-7-8 or wrap e.g. Q-K-A-2
          const ascSeq = extendedRankOrder.slice(start, start + totalLen);
          if (matchesSequence(ascSeq)) return true;
      
          // Descending sequence (reverse)
          const descSeq = [...ascSeq].reverse();
          if (matchesSequence(descSeq)) return true;
        }
        return false;
      }
  
    // --------------------------------------------------------------
    // 3️⃣  Build every possible *ordered* rank sequence that could
    //     represent a run of length `totalLen`.  We generate both
    //     forward (ascending) and backward (descending) sequences.
    // --------------------------------------------------------------
    const maxStart = rankOrder.length - totalLen; // inclusive upper bound
  
    // Helper: does the container match the supplied rank sequence?
    const matchesSequence = (seq) => {
      let usedWilds = 0;
  
      for (let i = 0; i < cards.length; ++i) {
        const card = cards[i];
  
        if (isWild(card)) {
          // Wild can always fill the current slot.
          usedWilds++;
          continue;
        }
  
        // Concrete card must match the expected rank *and* the run suit.
        if (card.rank !== seq[i] || card.suit !== runSuit) return false;
      }
  
      // We must not have used more wilds than we actually have.
      return usedWilds <= wildCnt;
    };
  
    // --------------------------------------------------------------
    // 4️⃣  Try every start position in both directions.
    // --------------------------------------------------------------
    for (let start = 0; start <= maxStart; ++start) {
      // ----- Ascending (e.g. 5‑6‑7‑8) -----
      const ascSeq = rankOrder.slice(start, start + totalLen);
      if (matchesSequence(ascSeq)) return true;
  
      // ----- Descending (e.g. 8‑7‑6‑5) -----
      const descSeq = [...ascSeq].reverse(); // reverse of the same slice
      if (matchesSequence(descSeq)) return true;
    }
  
    // No possible ordered sequence fits → not a valid run.
    return false;
  }
  window.isValidSet = isValidSet;
  window.isValidRun = isValidRun;
  
  function validateLayDown(playerIdx) {
    const player = players[playerIdx];
    const subAreas = getSubcontractSubAreas(playerIdx);   // <-- now uses the API wrapper
    const roundNum = roundIndex;                         // current round (global)
    const expectedLabelst = CONTRACT_SUB_AREAS[roundNum] || [];
  
    // Reset all sub‑area colours first
    subAreas.forEach(sa => (sa.style.backgroundColor = '#fff'));
  
    // Validate each sub‑area individually
    subAreas.forEach((sub, areaIdx) => {
      const label = sub.dataset.label || '';
      const cardsInArea = (subcontractCards[player] || []).filter(
        c => c.subArea === areaIdx
      );
  
      let ok = false;
      if (label.toLowerCase().includes('set')) ok = isValidSet(cardsInArea);
      else if (label.toLowerCase().includes('run')) ok = isValidRun(cardsInArea);
      
      sub.style.backgroundColor = ok ? '#c8e6c9' : '#fff';
    });
  }
  
  function populateContractSubAreas(roundNum) {
    const labels = CONTRACT_SUB_AREAS[roundNum] || [];

    contracts.forEach((contractDiv, i) => {
      if (!contractDiv) return;

      // Clear previous sub-areas before populating (prevent duplicates on new rounds)
      contractDiv.innerHTML = '';

      // Build a non-wrapping flex container for the sub-areas
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'row';
      wrapper.style.flexWrap = 'nowrap'; // prevent vertical wrap
      wrapper.style.gap = '8px'; // visible separation between sub-areas
      wrapper.style.padding = '4px';
      wrapper.style.border = `1px dashed ${backColors.outline}`;
      wrapper.style.borderRadius = '6px';
      wrapper.style.minWidth = '0'; // allow the wrapper to shrink if needed
      contractDiv.appendChild(wrapper);

      labels.forEach(label => {
        const sub = document.createElement('div');
        sub.className = 'contract-subarea';
        sub.dataset.label = label;
        sub.dataset.playerIndex = i;

        sub.dataset.myTurn = (players[i] &&
          document.getElementById(`player-${i}`).classList.contains('MyTurn'))
          ? 'true' : 'false';

        sub.style.flex = '0 0 auto'; // fixed width to content
        sub.style.flexShrink = '0'; 
        sub.style.maxWidth = 'none';
        sub.style.minWidth = '0';

        sub.style.padding = '2px';
        sub.style.borderRadius = '4px';
        sub.style.border = '1px solid #000';
        sub.style.backgroundColor = '#fff';
        sub.style.display = 'flex';
        sub.style.alignItems = 'center';
        sub.style.justifyContent = 'space-between';
        sub.style.fontSize = '0.85rem';
        sub.style.fontWeight = '500';
        sub.style.boxSizing = 'border-box';
        sub.style.minHeight = '75px';
        sub.style.userSelect = 'none';

        const lbl = document.createElement('span');
        lbl.textContent = label;
        sub.appendChild(lbl);

        const placeholder = document.createElement('span');
        placeholder.textContent = '';
        sub.appendChild(placeholder);

        wrapper.appendChild(sub);
      });
    });
  }

  function getCookie(name) {
    if (!document.cookie) return null;
    const cookies = document.cookie.split('; ');
    for (let pair of cookies) {
      const i = pair.indexOf('=');
      if (i === -1) continue;
      const k = pair.substring(0, i);
      if (k === name) {
        try {
          return decodeURIComponent(pair.substring(i + 1));
        } catch {
          return pair.substring(i + 1);
        }
      }
    }
    return null;
  }

  function suitToKey(suit) {
    switch (suit) {
      case '♦': return 'diamonds';
      case '♥': return 'hearts';
      case '♣': return 'clubs';
      case '♠': return 'spades';
      case '★': return 'stars';
      default: return 'hearts';
    }
  }
  function isRedSuit(suit) { return suit === '♦' || suit === '♥'; }

  function safeNumber(val, fallback) {
    if (val === undefined || val === null) return fallback;
    const n = Number(val);
    return Number.isNaN(n) ? fallback : n;
  }

  function setDefaultSuitColors() {
    suitColors = {
      diamonds: { symbol: '#ffff5c', background: '#bbb', outline: '#444' },
      clubs: { symbol: '#00e9f1', background: '#bbb', outline: '#444' },
      hearts: { symbol: '#e97311', background: '#bbb', outline: '#444' },
      spades: { symbol: '#01ff05', background: '#bbb', outline: '#444' },
      stars: { symbol: 'white', background: '#bbb', outline: '#444' }
    };
  }
  function setDefaultBackColors() {
    backColors = {
      center: '#f9d71c',
      edge1: '#e39e13',
      edge2: '#cf7518',
      edge3: '#a05108',
      outline: '#3a2e01',
      edgeWidth: 6
    };
  }

  function loadCustomization() {
    try {
      const ccStr = getCookie('cardCustom');
      if (!ccStr) {
        setDefaultSuitColors();
        setDefaultBackColors();
        return;
      }
      const cc = JSON.parse(ccStr);

      if (cc.suitColors) {
        suitColors = {};
        for (let key in cc.suitColors) {
          if (!Object.prototype.hasOwnProperty.call(cc.suitColors, key)) continue;
          const entry = cc.suitColors[key];
          suitColors[key] = {
            symbol: entry.symbol || 'white',
            background: entry.background || '#bbb',
            outline: entry.outline || 'green'
          };
        }
      } else {
        setDefaultSuitColors();
      }

      if (cc.backColors) {
        backColors = Object.assign({}, backColors, cc.backColors);
        backColors.edgeWidth = safeNumber(backColors.edgeWidth, backColors.edgeWidth);
      } else {
        setDefaultBackColors();
      }

      suitSize = safeNumber(cc.suitSize, 90);
      rankSize = safeNumber(cc.rankSize, 65);

    } catch (e) {
      console.warn("Failed to parse cardCustom cookie", e);
      setDefaultSuitColors();
      setDefaultBackColors();
    }
  }

  function loadRules() {
    try {
      const crStr = getCookie('customRules');
      if (!crStr) return {};
      return JSON.parse(crStr);
    } catch {
      return {};
    }
  }

  function createPlayers(playerNames) {
    players = playerNames;
    contracts = new Array(playerNames.length).fill(null);
    subcontractCards = {};
    playerNames.forEach(p => subcontractCards[p] = []);

    for (let i = 0; i < players.length; i++) {
      const playerDiv = document.createElement('div');
      playerDiv.className = 'player';
      playerDiv.id = `player-${i}`;
      playerDiv.style.position = 'absolute';

      const nameplate = document.createElement('div');
      nameplate.className = 'nameplate';
      nameplate.textContent = players[i];
      
      const layBtn = document.createElement('button');
      layBtn.className = 'lay-down-btn';
      layBtn.type = 'button';
      layBtn.textContent = 'Lay Down';
      // Initial state – will be refreshed later by `refreshLayButtons()`
      layBtn.disabled = true;
      layBtn.addEventListener('click', LayDownClick);

      const stats = document.createElement('div');
      stats.className = 'stats';

      const topRow = document.createElement('div');
      topRow.style.display = 'flex';
      topRow.style.justifyContent = 'space-between';
      topRow.style.width = '100%';

      const buysDiv = document.createElement('div');
      buysDiv.className = 'stat-buys';
      buysDiv.textContent = 'Buys: 3';

      const heldPointsDiv = document.createElement('div');
      heldPointsDiv.className = 'stat-held';
      heldPointsDiv.textContent = 'Held: 0';

      topRow.appendChild(buysDiv);
      topRow.appendChild(heldPointsDiv);

      const bottomRow = document.createElement('div');
      bottomRow.style.display = 'flex';
      bottomRow.style.justifyContent = 'space-between';
      bottomRow.style.width = '100%';

      const cardsDiv = document.createElement('div');
      cardsDiv.className = 'stat-cards';
      cardsDiv.textContent = 'Cards: 0';

      const scoreDiv = document.createElement('div');
      scoreDiv.className = 'stat-score';
      scoreDiv.textContent = 'Score: 0';

      bottomRow.appendChild(cardsDiv);
      bottomRow.appendChild(scoreDiv);

      stats.appendChild(topRow);
      stats.appendChild(bottomRow);

      const handArea = document.createElement('div');
      handArea.className = 'hand-area';
      handArea.id = `hand-${i}`;
      handArea.style.position = 'relative';
      handArea.style.display = 'flex';
      handArea.style.alignItems = 'center';
      handArea.style.marginTop = '8px';

      const _handStyle = document.createElement('style');
      _handStyle.textContent = `.hand-area{min-width:40px;}`;
      document.head.appendChild(_handStyle);

      playerDiv.appendChild(nameplate);
      playerDiv.appendChild(layBtn); 
      playerDiv.appendChild(stats);
      playerDiv.appendChild(handArea);

      if (playersContainer) playersContainer.appendChild(playerDiv);

      // contract area
      const contractDiv = document.createElement('div');
      contractDiv.className = 'contract-area';
      contractDiv.id = `contract-${i}`;
      contractDiv.style.display = 'inline-block';
      contractDiv.style.whiteSpace = 'nowrap';
      if (contractsContainer) contractsContainer.appendChild(contractDiv);
      contracts[i] = contractDiv;
    }
  }

  function layoutPiles() {
    if (!tableContainer || !drawPileDiv || !discardPileDiv) return;
    const centerX = tableContainer.clientWidth / 2;
    const centerY = tableContainer.clientHeight / 2;
    const spacing = 160;
    const pileWidth = drawPileDiv.offsetWidth || 120;
    const pileHeight = drawPileDiv.offsetHeight || 160;

    drawPileDiv.style.left = (centerX - spacing / 2 - pileWidth / 2) + "px";
    drawPileDiv.style.top = (centerY - pileHeight / 2) + "px";
    discardPileDiv.style.left = (centerX + spacing / 2 - pileWidth / 2) + "px";
    discardPileDiv.style.top = (centerY - pileHeight / 2) + "px";

    const c = backColors;
    const grad = `radial-gradient(circle at center,
      ${c.center} 0%,
      ${c.edge1} 25%,
      ${c.edge2} 50%,
      ${c.edge3} 75%,
      ${c.edge3} 80%
    )`;
    [drawPileDiv].forEach(pile => {
      if (!pile) return;
      pile.style.background = grad;
      pile.style.border = `${c.edgeWidth}px solid ${c.outline}`;
      pile.style.borderRadius = '10px';
      pile.style.boxSizing = 'border-box';
      pile.style.lineHeight = `${pileHeight}px`;
      pile.style.userSelect = 'none';
      pile.style.cursor = 'default';
    });
  }

  function drawCardFrom(source, playerIdx) {
    if (playerIdx === undefined) {
      playerIdx = getMyTurnPlayerIndex();
    }
    if (playerIdx < 0) return;                // no player to draw for

    // Block draw if player already drew on their turn
    if (hasDrawn && playerIdx === getMyTurnPlayerIndex()) return;

    let card = null;

    if (source === 'draw') {
      // If there is only one card left, try reshuffle discard pile into draw pile
      if (drawPile && drawPile.length === 1) {
        if (window.initDeckInstance && typeof window.initDeckInstance.reshuffle === 'function') {
          const result = window.initDeckInstance.reshuffle(drawPile, discardPile);
          drawPile = result.drawPile;
          discardPile = result.discardPile;
        } else {
          console.warn("Fallback shuffle");
          // fallback shuffle logic omitted for brevity
        }
      }
      if (drawPile.length === 0) return;  // no card to draw
      card = drawPile.pop();
    } else if (source === 'discard') {
      if (discardPile.length === 0) return;
      card = discardPile.pop();
    }

    if (!card) return;

    hands[players[playerIdx]].push(card);

    // Mark drawn only for the current turn player
    if (playerIdx === getMyTurnPlayerIndex()) {
      hasDrawn = true;
      window.hasDrawn = true;
      const playerDiv = document.getElementById(`player-${playerIdx}`);
      if (playerDiv) playerDiv.classList.add('HasDrawn');
    }

    cardManager.setupDragDrop();
    renderHands(hands);

    if (source === 'discard') {
      cardManager.renderDiscardPile();
    }
  }
  window.drawCardFrom = drawCardFrom;

  function calculateCardPoints(card, wildCardsEnabled, wildType) {
    const rank = card.rank;
    const suit = card.suit;

    function isWildCard() {
      if (!wildCardsEnabled) return false;
      if (wildType === 'classic') return (rank === '3' && (suit === '♦' || suit === '♥'));
      if (wildType === 'extra') return (rank === '3' && (suit === '♦' || suit === '♥' || suit === '★'));
      if (wildType === 'joker') return (rank === 'W' && (suit === '♥' || suit === '♠'));
      return false;
    }
    if (isWildCard()) return 20;
    if (rank === '3') return 3;
    if (rank === 'A') return 15;
    if (['10', 'J', 'Q', 'K'].includes(rank)) return 10;
    if ('2 4 5 6 7 8 9'.split(' ').includes(rank)) return Number(rank);
    if (rank === 'W') return 20;
    return 0;
  }

  // UPDATED HERE - count subcontract cards also for Cards and Held stats
  function updatePlayerStats(handsObj) {
    window.updatePlayerStats = updatePlayerStats;
    const customRulesStr = getCookie('customRules');
    let wildCardsEnabled = true;
    let wildType = 'classic';
    try {
      if (customRulesStr) {
        const cr = JSON.parse(customRulesStr);
        wildCardsEnabled = cr.wildCardsChk ?? true;
        wildType = (cr.wildType || 'classic').toLowerCase();
      }
    } catch {}
  
    players.forEach((player, i) => {
      const hand = handsObj[player] || [];
      const playerDiv = document.getElementById(`player-${i}`);
      if (!playerDiv) return;
      const stats = playerDiv.querySelector('.stats');
      if (!stats) return;
  
      // ----- CARDS & HELD -----
      // If the player has already laid down, we *exclude* subcontract cards
      // from the stats calculations.
      const hasLaidDown = playerDiv.classList.contains('HasLaidDown');
  
      const subcontract = subcontractCards[player] || [];
      const cardsForStats = hasLaidDown ? hand : hand.concat(subcontract);
  
      // Count points
      let heldPoints = 0;
      cardsForStats.forEach(card => {
        heldPoints += calculateCardPoints(card, wildCardsEnabled, wildType);
      });
  
      const heldPointsDiv = stats.querySelector('.stat-held');
      if (heldPointsDiv) heldPointsDiv.textContent = `Held: ${heldPoints}`;
  
      const cardsDiv = stats.querySelector('.stat-cards');
      if (cardsDiv) cardsDiv.textContent = `Cards: ${cardsForStats.length}`;

      const stillMyTurn = playerDiv.classList.contains('MyTurn');
      if (cardsForStats.length === 0) {
          endRound(player);
          }
    });
  }
  
  function endRound(triggerPlayer) {
    if (roundFinished) return;
    roundFinished = true;  
    const roundScores = []; 
    players.forEach((p, i) => {
      const playerDiv = document.getElementById(`player-${i}`);
      const stats = playerDiv?.querySelector('.stats');
      if (!stats) return;
  
      const heldDiv  = stats.querySelector('.stat-held');
      const scoreDiv = stats.querySelector('.stat-score');
      const buysDiv = playerDiv.querySelector('.stat-buys');
      if (buysDiv) {
        // Set the displayed text to “Buys: 3”
        buysDiv.textContent = 'Buys: 3';
      }
      // ----- read numbers ----------------------------------------------------
      let heldVal = heldDiv
        ? Number(heldDiv.textContent.split(':')[1].trim())
        : 0
      if (window.gameRules.finalShanghai && Hardwindow && roundIndex === 7 && heldVal > 0) {
        heldVal += 100;
      } else if (Hardwindow && heldVal > 0) {
        heldVal += 50;
      } else if (Softwindow && heldVal > 0) {
        heldVal += 25;
      }
  
      let scoreVal = scoreDiv
        ? Number(scoreDiv.textContent.split(':')[1].trim())
        : 0;
  
      // ----- accumulate -------------------------------------------------------
      scoreVal = scoreVal + heldVal;
  
      // ----- write back -------------------------------------------------------
      if (scoreDiv) {
        scoreDiv.textContent = `Score: ${scoreVal}`;
      }
  
      // Save this round’s held value for the history table
      roundScores.push(heldVal);
    });
  
    // -----------------------------------------------------------------------
    // 2️⃣ Store the round in the global history array
    // -----------------------------------------------------------------------
    roundHistory.push({
      round: roundIndex,   // the round that just finished
      scores: roundScores // array of held values, one per player (same order as `players`)
    });
  
    // 2️⃣ Show “Round‑Winner” popup
    const roundWinnerPopup = document.createElement('div');
    roundWinnerPopup.className = 'round-winner-popup';
    if (Hardwindow && roundIndex === 7){
      roundWinnerPopup.textContent = `${triggerPlayer} won the FINAL Round with a Shanghai! +100 points to everyone else!`;
    } else if (Hardwindow) {
        roundWinnerPopup.textContent = `${triggerPlayer} won the Round with a Shanghai! +50 points to everyone else!`;
    } else if (Softwindow) {
          roundWinnerPopup.textContent = `${triggerPlayer} won the Round with a Soft Shanghai! +25 points to everyone else!`;
    } else {
          roundWinnerPopup.textContent = `${triggerPlayer} won the Round!`;
    }
    document.body.appendChild(roundWinnerPopup);
  
    const closeRoundWinner = () => {
      roundWinnerPopup.removeEventListener('click', closeRoundWinner);
      window.removeEventListener('keydown', closeRoundWinner);
      roundWinnerPopup.remove();
  
      // 3️⃣ Record scores & show the cumulative scores grid
      showScoresPopup();
  
      // 4️⃣ Decide what happens next (next round or game over)
      if (roundIndex >= 7) {
        // Game finished – highlight lowest total & announce winner
        showGameWinnerPopup();
      } else {
        // Continue – start next round after the scores popup is dismissed
        startNextRound();
      }
    };
  
    roundWinnerPopup.addEventListener('click', closeRoundWinner);
    window.addEventListener('keydown', closeRoundWinner);
  }
  
  function showScoresPopup() {
    let container = document.getElementById('scores-popup');
    if (!container) {
      container = document.createElement('div');
      container.id = 'scores-popup';
      container.className = 'scores-popup';
      document.body.appendChild(container);
    }
    
    let title = container.querySelector('.scores-title');
    if (!title) {
      title = document.createElement('div');
      title.className = 'scores-title';
      title.textContent = 'Player Scores';
      title.style.textAlign = 'center';
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '8px';
      container.prepend(title);
    }
    
    let header = container.querySelector('.scores-header');
    if (!header) {
      header = document.createElement('div');
      header.className = 'scores-header';
      const headerHTML =
        `<div class="cell corner"></div>` +
        players.map(p => `<div class="cell player-name">${p}</div>`).join('');
      header.innerHTML = headerHTML;
      container.appendChild(header);
    }
  
    // Clear previous rows except header and title
    [...container.querySelectorAll('.scores-row')].forEach(row => row.remove());
    const totalRow = container.querySelector('.scores-total-row');
    if (totalRow) totalRow.remove();
  
    // Add all rounds from roundHistory
    roundHistory.forEach(rh => {
      const row = document.createElement('div');
      row.className = 'scores-row';
  
      const roundCell = `<div class="cell round-index">Round ${rh.round}</div>`;
      const scoreCells = rh.scores.map(score => `<div class="cell score">${score}</div>`).join('');
      
      row.innerHTML = roundCell + scoreCells;
      container.appendChild(row);
    });
  
    // Calculate total for each player summing rounds from roundHistory
    const totals = players.map((_, i) => {
      return roundHistory.reduce((sum, rh) => sum + (rh.scores[i] || 0), 0);
    });
  
    const totalLabel = `<div class="cell round-index">Total</div>`;
    const totalCells = totals.map(totalScore => `<div class="cell score">${totalScore}</div>`).join('');
    const totalHTML = totalLabel + totalCells;
  
    const newTotalRow = document.createElement('div');
    newTotalRow.className = 'scores-row scores-total-row';
    newTotalRow.innerHTML = totalHTML;
    container.appendChild(newTotalRow);
  
    const close = () => {
      container.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
      container.remove();
    };
    container.addEventListener('click', close);
    window.addEventListener('keydown', close);
  }
  
  function showGameWinnerPopup() {
    // First compute total scores per player across all rounds
    const totals = players.map((p, i) => {
      let sum = 0;
      // Walk through every scores‑row that was added to the scores‑popup
      const rows = document.querySelectorAll('#scores-popup .scores-row');
      rows.forEach(r => {
        const cells = r.querySelectorAll('.cell.score');
        const val = Number(cells[i].textContent.trim());
        sum += val;
      });
      return sum;
    });
  
    const minScore = Math.min(...totals);
    const winners = players.filter((_, i) => totals[i] === minScore);
    const winnerName = winners.length === 1 ? winners[0] : winners.join(', ');
  
    // Highlight the lowest total in the grid (add a CSS class)
    const rows = document.querySelectorAll('#scores-popup .scores-row');
    rows.forEach(r => {
      const cells = r.querySelectorAll('.cell.score');
      cells.forEach((c, idx) => {
        if (totals[idx] === minScore) c.classList.add('lowest-score');
      });
    });
  
    // Show the final popup
    const finalPopup = document.createElement('div');
    finalPopup.className = 'game-winner-popup';
    finalPopup.textContent = `${winnerName} won the game!`;
    document.body.appendChild(finalPopup);
  
    const closeFinal = () => {
      finalPopup.removeEventListener('click', closeFinal);
      window.removeEventListener('keydown', closeFinal);
      finalPopup.remove();
      // Optional: you could reset the whole UI here or offer a “New Game” button.
    };
    finalPopup.addEventListener('click', closeFinal);
    window.addEventListener('keydown', closeFinal);
  }
  
  async function startNextRound() {
    roundFinished = false; 
    Softwindow = false;  
    Hardwindow = false;  
    roundIndex++;
    await showRoundPopup(roundIndex);
    // 1️⃣ Gather every card back into a single array
    const allCards = [];
    
    players.forEach((_, i) => {
      const playerDiv = document.getElementById(`player-${i}`);
      if (playerDiv) {
        playerDiv.classList.remove('MyTurn', 'HasDrawn', 'HasLaidDown');
      }
    });
  
    players.forEach((p) => {
      const hand = hands[p] || [];
      allCards.push(...hand);
      hands[p] = []; // clear hand for next round
      const sub = subcontractCards[p] || [];
      allCards.push(...sub);
      subcontractCards[p] = []; // clear
      const playerDiv = document.getElementById(`player-${p}`);
    });
    hasDrawn = false;
    
    if (drawPile && drawPile.length) {
    allCards.push(...drawPile);
    drawPile = [];
  }
  
    if (discardPile && discardPile.length) {
      allCards.push(...discardPile);
      //discardPile = [];
      discardPile.length = 0;
    }
  
    if (window.initDeckInstance && typeof window.initDeckInstance.shuffle === 'function') {
      drawPile = window.initDeckInstance.shuffle(allCards);
    }
  
    populateContractSubAreas(roundIndex);
    
    if (RoundStarter >= players.length - 1) {
      RoundStarter = -1;
    }
    RoundStarter++;
    const firstPlayerDiv = document.getElementById(`player-${RoundStarter}`);
    if (firstPlayerDiv) {
      firstPlayerDiv.classList.add('round-starter');
      firstPlayerDiv.classList.add('MyTurn');
      hasDrawn = false;
      //window.hasDrawn = false;
    }
  
    // 5️⃣ Deal 10 cards to each player (mirroring initTable logic)
    players.forEach(p => {
      const dealt = [];
      for (let i = 0; i < 10 && drawPile.length; i++) {
        dealt.push(drawPile.pop());
      }
      hands[p] = dealt;
      subcontractCards[p] = [];
      if (roundIndex === 1 || roundIndex === 4) {
        hands[p] = sortByRank(hands[p]);
      } else {
        hands[p] = sortBySuitThenRank(hands[p]);
      }
    });
    cardManager.renderAllSubcontractAreas();
    cardManager.setupDragDrop();
  
    // 6️⃣ Refresh UI – re‑render hands, discard pile, subcontract areas,
    //    lay‑down buttons and player stats.
    renderHands(hands);
    cardManager.renderDiscardPile();
    refreshLayButtons();
  }

  function renderHands(handsObj) {
    players.forEach((_, i) => {
      const handArea = document.getElementById(`hand-${i}`);
      if (!handArea) return;
      handArea.innerHTML = '';

      const draggable = playerHasMyTurn(i);
      cardManager.renderCardArray(handsObj[players[i]], handArea, draggable, i, 'hand');
    });
    updatePlayerStats(handsObj);
  }

  function sortByRank(cards) {
    return cards.sort((a, b) => rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank));
  }
  function sortBySuitThenRank(cards) {
    return cards.sort((a,b) => {
      const suitDiff = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
      return suitDiff !== 0 ? suitDiff : rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
    });
  }

  function showRoundPopup(roundNum) {
    return new Promise((resolve) => {
      const popup = document.createElement('div');
      popup.id = 'round-popup';
      popup.classList.add('round-popup');
  
      const contractText = roundContracts[roundNum - 1] || `Round ${roundNum}: Unknown Contract`;
      popup.textContent = `Round ${roundNum}:\n${contractText}`;
  
      const lines = popup.textContent.split('\n');
      popup.textContent = '';
      lines.forEach(line => {
        const lineDiv = document.createElement('div');
        lineDiv.textContent = line;
        popup.appendChild(lineDiv);
      });
  
      document.body.appendChild(popup);
  
      function closePopup() {
        if (popup.parentNode) popup.parentNode.removeChild(popup);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('click', onClick);
        resolve(); // Resolve the Promise when popup closes
      }
      function onKeyDown() { closePopup(); }
      function onClick() { closePopup(); }
  
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('click', onClick);
    });
  }

  function layoutPlayers() {
    if (!tableContainer || players.length === 0) return;

    const w = tableContainer.clientWidth;
    const h = tableContainer.clientHeight;

    const marginH = 180;
    const marginVTop = 180;
    const marginVBottom = 270;

    const topLen = Math.max(0, w - 2 * marginH);
    const rightLen = Math.max(0, h - marginVTop - marginVBottom);
    const perimeter = topLen * 2 + rightLen * 2;
    const cornerInset = players.length >= 8 ? 110 : 90;

    players.forEach((_, i) => {
      const playerDiv = document.getElementById(`player-${i}`);
      const contractDiv = contracts[i];
      if (!playerDiv) return;

      let dist = i / players.length * perimeter;
      let sideIndex = 0;
      const sides = [topLen, rightLen, topLen, rightLen];
      while (sideIndex < 4 && dist > sides[sideIndex]) {
        dist -= sides[sideIndex];
        sideIndex++;
      }

      let x = 0, y = 0;
      switch (sideIndex) {
        case 0:
          x = marginH + dist;
          y = marginVTop;
          break;
        case 1:
          x = w - marginH;
          y = marginVTop + dist;
          break;
        case 2:
          if (dist < cornerInset) {
            x = w - marginH - cornerInset + dist;
          } else if (dist > topLen - cornerInset) {
            x = marginH + (dist - (topLen - cornerInset));
          } else {
            x = w - marginH - dist;
          }
          y = h - marginVBottom;
          break;
        case 3:
          x = marginH;
          y = h - marginVBottom - dist;
          break;
      }

      playerDiv.style.left = `${x}px`;
      playerDiv.style.top = `${y}px`;

      const ph = playerDiv.offsetHeight || 180;
      if (contractDiv) {
        contractDiv.style.left = `${x}px`;
        contractDiv.style.top = `${y + ph / 2 + 9}px`;
      }
    });
  }

  function playerHasMyTurn(i) {
    const el = document.getElementById(`player-${i}`);
    return el?.classList.contains('MyTurn');
  }

  function renderAllSubcontractAreas() {
    cardManager.renderAllSubcontractAreas();
  }
  function renderDiscardPile() {
    cardManager.renderDiscardPile();
  }

  async function initTable(playerNames) {
    loadCustomization();
    createPlayers(playerNames);

    RoundStarter = Math.floor(Math.random() * players.length);
    const firstPlayerDiv = document.getElementById(`player-${RoundStarter}`);
    if (firstPlayerDiv) {
      firstPlayerDiv.classList.add('round-starter');
      firstPlayerDiv.classList.add('MyTurn');
      hasDrawn = false;
      window.hasDrawn = false;
    }

    const customRules = loadRules();

    window.gameRules = {
      extraDeck: customRules.extraDeckChk ? 1 : 0,
      extraSuit: customRules.extraSuitChk ?? false,
      wildType: (customRules.wildType || 'classic').toLowerCase(),
      wildsEnabled: customRules.wildCardsChk ?? true,
      wrapAround: customRules.wrapRunsChk ?? false,
      softShanghai: customRules.softShanghaiChk,
      hardShanghai: customRules.hardShanghaiChk,
      finalShanghai: customRules.finalShanghaiChk
    };

    try {
      if (typeof window.initDeck === 'function') {
        const deck = new window.initDeck();
        window.initDeckInstance = deck;

        drawPile = deck.createDeck(playerNames.length);
        hands = deck.dealCards(playerNames);
        discardPile = deck.discardPile || [];
      } else {
        drawPile = [];
        hands = {};
      }
    } catch (e) {
      console.error('initDeck error:', e);
      drawPile = [];
      hands = {};
    }

    roundIndex++;

    await showRoundPopup(roundIndex);

    populateContractSubAreas(roundIndex);

    layoutPiles();
    if (drawPileDiv) {
      drawPileDiv.style.cursor = 'pointer';
      drawPileDiv.addEventListener('click', () => {
        window.drawCardFrom('draw', RoundStarter);
      });
    }
    layoutPlayers();

    players.forEach(p => {
      subcontractCards[p] = [];
      if (roundIndex === 1 || roundIndex === 4) {
        hands[p] = sortByRank(hands[p]);
      } else {
        hands[p] = sortBySuitThenRank(hands[p]);
      }
    });

    cardManager.setData({ players, hands, subcontractCards, discardPile, suitColors, backColors, suitSize, rankSize });

    cardManager.renderDiscardPile();

    players.forEach((p,i) => {
      const handDiv = document.getElementById(`hand-${i}`);
      if (!handDiv) return;
      const draggable = playerHasMyTurn(i);
      cardManager.renderCardArray(hands[p], handDiv, draggable, i, 'hand');
    });

    cardManager.renderAllSubcontractAreas();

    cardManager.setupDragDrop();

    players.forEach((p,i) => {
      const handDiv = document.getElementById(`hand-${i}`);
      if (!handDiv) return;
      const draggable = playerHasMyTurn(i);
      cardManager.renderCardArray(hands[p], handDiv, draggable, i, 'hand');
    });
    cardManager.renderAllSubcontractAreas();

    updatePlayerStats(hands);
    refreshLayButtons();
  }

  (function setupDynamicHover() {
    const table = document.getElementById('table-container');
    if (!table) return;

    const HOVER_CLASS = 'hover‑raise';

    const style = document.createElement('style');
    style.textContent = `
      .${HOVER_CLASS} {
        z-index: 9999 !important;
      }
    `;
    document.head.appendChild(style);

    table.addEventListener('mouseover', event => {
      const card = event.target.closest('.card');
      if (!card) return;

      const playerDiv = card.closest('.player');
      if (!playerDiv?.classList.contains('MyTurn')) return;
      if (card.dataset.dragging === 'true') return;
      if (!card.dataset.origBorder) {
        card.dataset.origBorder = getComputedStyle(card).border;
      }

      card.classList.add(HOVER_CLASS);

      const borderColor = getComputedStyle(card).borderColor;
      const rgb = borderColor.match(/\d+/g);
      if (rgb) {
        const r = 255 - Number(rgb[0]);
        const g = 255 - Number(rgb[1]);
        const b = 255 - Number(rgb[2]);
        const inverted = `rgb(${r},${g},${b})`;

        const bw = getComputedStyle(card).borderWidth || '3px';
        const bs = getComputedStyle(card).borderStyle || 'solid';
        card.style.border = `${bw} ${bs} ${inverted}`;
      }
    });

    table.addEventListener('mouseout', event => {
      const card = event.target.closest('.card');
      if (!card) return;

      const playerDiv = card.closest('.player');
      if (!playerDiv?.classList.contains('MyTurn')) return;

      card.classList.remove(HOVER_CLASS);

      if (card.dataset.origBorder !== undefined) {
        card.style.border = card.dataset.origBorder;
      }
    });
  })();
  
  function refreshLayButtons() {
    players.forEach((_, i) => {
      const btn = document.querySelector(`#player-${i} .lay-down-btn`);
      if (!btn) return;
      btn.disabled = false;
      btn.textContent = 'Lay Down';
    });
  }
  
  async function resetTurnState(newTurnIdx) {
    hasDrawn = false;
    window.hasDrawn = false;
    players.forEach((_, i) => {
      const pDiv = document.getElementById(`player-${i}`);
      if (pDiv && pDiv.classList.contains('HasDrawn')) {
        pDiv.classList.remove('HasDrawn');
      }
    });

    const oldTurnIdx = players.findIndex((_, i) => {
      const el = document.getElementById(`player-${i}`);
      return el?.classList.contains('MyTurn');
    });

    players.forEach((_p, i) => {
      const pDiv = document.getElementById(`player-${i}`);
      if (pDiv && pDiv.classList.contains('Idiscarded')) {
        pDiv.classList.remove('Idiscarded');
      }
    });

    if (oldTurnIdx !== -1) {
      const oldDiv = document.getElementById(`player-${oldTurnIdx}`);
      if (oldDiv) {
        oldDiv.classList.remove('MyTurn');
        oldDiv.classList.add('Idiscarded');
      }
    }

    // Give the next player MyTurn
    const newDiv = document.getElementById(`player-${newTurnIdx}`);
    if (newDiv) newDiv.classList.add('MyTurn');

    // Show Buy clock popup before MyTurn player draws
    await showBuyClockPopup();

    // Now enable MyTurn player to draw normally...

    cardManager.setupDragDrop();

    // Render hands with drag enabled for the current MyTurn player only
    players.forEach((p, i) => {
      const handDiv = document.getElementById(`hand-${i}`);
      if (!handDiv) return;
      const canDrag = document.getElementById(`player-${i}`).classList.contains('MyTurn');
      cardManager.renderCardArray(hands[p], handDiv, canDrag, i, 'hand');
    });

    cardManager.renderAllSubcontractAreas();

    if (typeof window.updatePlayerStats === 'function') {
      window.updatePlayerStats(hands);
    }

    if (drawPileDiv) {
      // Replace the element with a clone to wipe old listeners (defensive)
      drawPileDiv.replaceWith(drawPileDiv.cloneNode(true));
      const freshDrawPileDiv = document.getElementById('drawPile');
      if (freshDrawPileDiv) {
        freshDrawPileDiv.style.cursor = 'pointer';
        freshDrawPileDiv.addEventListener('click', () => {
          const currentIdx = getMyTurnPlayerIndex();
          if (currentIdx !== -1) {
            drawCardFrom('draw', currentIdx);
          }
        });
      }
    }
  }
  
  // Show the BuyClock popup and wait for countdown or immediate resolution
  async function showBuyClockPopup() {
    
    const clickOrder = [];
    const anyPlayerHasZeroCards = players.some((_, i) => {
      const playerDiv = document.getElementById(`player-${i}`);
      if (!playerDiv) return false;
      const cardsDiv = playerDiv.querySelector('.stat-cards');
      if (!cardsDiv) return false;
      const cardCount = Number(cardsDiv.textContent.split(':')[1].trim()) || 0;
      console.error(cardCount);
      return cardCount === 0;
    });
    if (anyPlayerHasZeroCards) {
      return; // exit entire showBuyClockPopup early if any player has 0 cards
    }
    if (window.gameRules.hardShanghai) Hardwindow = false;
    
    let customRules = {};
    try {
      const crStr = getCookie('customRules');
      if (crStr) customRules = JSON.parse(crStr);
    } catch {}
  
    const buyTimeOrig = parseInt(customRules.buyClock) || 16;
    let buyTime = buyTimeOrig;
    const optOut = Boolean(customRules.optOutChk ?? false);
    const selfDiscard = Boolean(customRules.selfDiscardChk ?? false);
    const fastBuy = Boolean(customRules.fastBuyChk ?? true);
    const myTurnIdx = players.findIndex((_, i) => {
      const div = document.getElementById(`player-${i}`);
      return div?.classList.contains('MyTurn');
    });
    if (myTurnIdx === -1) return;
    
    const myTurnPlayerDiv = document.getElementById(`player-${myTurnIdx}`);
  
    // Determine which players get buy buttons
    const buyPlayers = players.map((p, i) => {
      const playerDiv = document.getElementById(`player-${i}`);
      const buysDiv = playerDiv?.querySelector('.stat-buys')?.textContent || 'Buys: 0';
      const buyStat = Number(buysDiv.split(':')[1].trim()) || 0;
      const isIdiscarded = playerDiv?.classList.contains('Idiscarded') ?? false;
  
      // MyTurn player always gets a buy button regardless of Buys stat
      if (i === myTurnIdx) {
        return {
          playerIndex: i,
          name: players[i],
          buyStat,
          isMyTurn: true,
          isIdiscarded,
        };
      }
      if (buyStat === 0) return null; // no button for others with zero buys
      if (!selfDiscard && isIdiscarded) return null; // exclude if selfDiscard false
  
      return {
        playerIndex: i,
        name: players[i],
        buyStat,
        isMyTurn: false,
        isIdiscarded,
      };
    }).filter(x => x !== null);
  
    if (buyPlayers.length === 0) return; // no buttons — skip popup
  
    const container = document.createElement('div');
    container.id = 'buy-clock-popup';
    container.classList.add('buy-clock-popup');
  
    // Popup title with countdown
    const title = document.createElement('h2');
    title.textContent = `Buying Round - Time left: ${buyTime}s`;
    title.classList.add('buy-clock-title');
    container.appendChild(title);
  
    // Show top discard card with countdown
    const discardWrapper = document.createElement('div');
    discardWrapper.classList.add('buy-clock-discard-wrapper');
  
    const topDiscard = discardPile[discardPile.length - 1];
    if (topDiscard) {
      const cardDiv = window.createCardDiv(topDiscard, true);
      cardDiv.classList.add('buy-clock-discard-card');
      discardWrapper.appendChild(cardDiv);
    }
  
    const countdownSpan = document.createElement('span');
    countdownSpan.classList.add('buy-clock-countdown');
    countdownSpan.textContent = buyTime;
    discardWrapper.appendChild(countdownSpan);
  
    container.appendChild(discardWrapper);
  
    // Buttons wrapper: flex by default, grid with 2 rows if 7+ players
    const btnWrapper = document.createElement('div');
    btnWrapper.classList.add('buy-clock-buttons-wrapper');
    if (players.length >= 7) {
      btnWrapper.style.display = 'grid';
      btnWrapper.style.gridTemplateColumns = 'repeat(auto-fill, minmax(110px, 1fr))';
      btnWrapper.style.gridTemplateRows = 'repeat(2, auto)';
      btnWrapper.style.gap = '20px 24px';
    } else {
      btnWrapper.style.display = 'flex';
      btnWrapper.style.flexWrap = 'nowrap';
      btnWrapper.style.gap = '24px';
    }
  
    /* ---- state objects (keyed by player index) ---- */
    const buyingState   = {};
    const declinedState = {};
    const activePlayers = [];   // indices that actually get a button
  
    players.forEach((_, i) => {
      buyingState[i]   = false;
      declinedState[i] = false;
    });
  
    const allActed = () =>
      activePlayers.every(i => buyingState[i] || declinedState[i]);
  
    /* ---- create a button set for each player that should have one ---- */
    players.forEach((name, i) => {
      const playerDiv = document.getElementById(`player-${i}`);
  
      // Do NOT create a button if the player is Idiscarded AND selfDiscard is false
      if (playerDiv?.classList?.contains('Idiscarded') && !selfDiscard) return;
  
      activePlayers.push(i);   // this player participates in the buy phase
  
      const wrap = document.createElement('div');
      wrap.classList.add('buy-clock-player-wrap');
  
      const lbl = document.createElement('div');
      lbl.classList.add('buy-clock-player-name');
      lbl.textContent = name;
      wrap.appendChild(lbl);
  
      const isMyTurn = i === myTurnIdx;
  
      /* ---- BUY / TAKE button ---- */
      const buyBtn = document.createElement('button');
      buyBtn.type = 'button';
      buyBtn.classList.add('buy-clock-btn');
      buyBtn.textContent = isMyTurn ? 'Not Taking' : 'Not Buying';
      wrap.appendChild(buyBtn);
  
      /* ---- DECLINE button ---- */
      const declBtn = document.createElement('button');
      declBtn.type = 'button';
      declBtn.classList.add('buy-clock-btn');
      declBtn.textContent = 'Decline';
      declBtn.style.backgroundColor = '#c9302c';
      declBtn.style.marginTop = '6px';
      wrap.appendChild(declBtn);
  
      /* ---- BUY button handler ---- */
      buyBtn.addEventListener('click', () => {
        if (buyBtn.disabled) return;
  
        if (optOut) {
          buyingState[i] = !buyingState[i];
          buyBtn.textContent = buyingState[i]
            ? (isMyTurn ? 'Taking' : 'Buying')
            : (isMyTurn ? 'Not Taking' : 'Not Buying');
          buyBtn.classList.toggle('buying', buyingState[i]);
  
          // re‑enable decline when opt‑out allows it
          if (buyingState[i]) {
            declBtn.disabled = false;
            declBtn.textContent = 'Decline';
            declinedState[i] = false;
          }
        } else {
          if (buyingState[i]) return;               // already locked
          buyingState[i] = true;
          buyBtn.textContent = isMyTurn ? 'Taking' : 'Buying';
          buyBtn.classList.add('buying');
          buybtn.disabled = true;
  
          if (fastBuy && !clickOrder.includes(i)) clickOrder.push(i);
        }
  
        // halve timer if MyTurn player buys
        if (isMyTurn && buyingState[i]) {
          buyTime = Math.ceil(buyTime / 2);
          countdown.textContent = buyTime;
          title.textContent = `Buying Round - Time left: ${buyTime}s`;
        }
  
        // if everyone has acted, end timer now
        if (allActed()) {
          buyTime = 0;
          countdown.textContent = '0';
          title.textContent = `Buying Round - Time left: 0s`;
        }
      });
  
      /* ---- DECLINE button handler ---- */
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
  
        // if everyone has acted, end timer now
        if (allActed()) {
          buyTime = 0;
          countdown.textContent = '0';
          title.textContent = `Buying Round - Time left: 0s`;
        }
      });
  
      btnWrapper.appendChild(wrap);
    });
  
    container.appendChild(btnWrapper);
    document.body.appendChild(container);
  
    return new Promise(resolve => {
      const intervalId = setInterval(() => {
        buyTime--;
        if (buyTime >= 0) {
          countdownSpan.textContent = buyTime;
          title.textContent = `Buying Round - Time left: ${buyTime}s`;
        }
        if (buyTime <= 0) {
          clearInterval(intervalId);
          container.remove();
          processBuyResults(
            buyingState,
            myTurnIdx,
            optOut,
            selfDiscard,
            fastBuy,
            clickOrder
          );
          resolve();
        }
      }, 1000);
    });
  }

  function processBuyResults(buyingState, myTurnIdx, optOut, selfDiscard, fastBuy, clickOrder = []) {    
    const buyers = Object.entries(buyingState)
      .filter(([_, val]) => val)
      .map(([idxStr]) => Number(idxStr));

    if (buyers.length === 0) return;

    const myBuying = buyingState[myTurnIdx];

    function decrementBuyStat(playerIndex) {
      const pDiv = document.getElementById(`player-${playerIndex}`);
      if (!pDiv) return;
      const buysDiv = pDiv.querySelector('.stat-buys');
      if (!buysDiv) return;
      let val = Number(buysDiv.textContent.split(':')[1].trim());
      if (val > 0) val -= 1;
      buysDiv.textContent = `Buys: ${val}`;
    }

    function removeHasDrawn(playerIndex) {
      const d = document.getElementById(`player-${playerIndex}`);
      if (d && d.classList.contains('HasDrawn')) {
        d.classList.remove('HasDrawn');
      }
    }

    // Helper: draw both draw and discard for player
    function drawFromDrawAndDiscard(playerIndex) {
      window.drawCardFrom('draw', playerIndex);
      window.drawCardFrom('discard', playerIndex);
      decrementBuyStat(playerIndex);
      removeHasDrawn(playerIndex);
      renderHands(hands);
      cardManager.renderDiscardPile();
      cardManager.renderAllSubcontractAreas();
    }

    if (myBuying) {
      window.drawCardFrom('discard', myTurnIdx);
      return;
    }
    const otherBuyers = buyers.filter(idx => idx !== myTurnIdx);
    
    if (otherBuyers.length === 0) return; // nobody else bought
    
    let buyerIdx;
    
    if (fastBuy) {
      buyerIdx = clickOrder.find(idx => otherBuyers.includes(idx));
      if (buyerIdx === undefined) {
        buyerIdx = Math.min(...otherBuyers);
      }
    } else {
      const order = players.map((_, i) => i);
      const shifted = order
        .slice(myTurnIdx + 1)
        .concat(order.slice(0, myTurnIdx + 1));
    
      buyerIdx = shifted.find(p => otherBuyers.includes(p));
    }
    
    if (buyerIdx === undefined) return;
    
    drawFromDrawAndDiscard(buyerIdx);
  }
  
  function LayDownClick(event) {
    const btn = event?.target?.closest('.lay-down-btn');
    if (!btn) return;                                   // safety
  
    // Button lives inside a player div → extract the player index
    const playerDiv = btn.closest('.player');
    const playerIdx = playerDiv ? Number(playerDiv.id.split('-')[1]) : -1;
    if (playerIdx < 0) return;
  
    if (!playerDiv.classList.contains('MyTurn')) {
      return;
    }
  
    const subAreas = getSubcontractSubAreas(playerIdx);
    if (!subAreas.length) return;   // nothing to lay down
  
    const roundNum = roundIndex;                     // global round counter
    const expectedLabels = CONTRACT_SUB_AREAS[roundNum] || [];
  
    // Helper that extracts the cards belonging to a particular sub‑area
    const owner = players[playerIdx];
    const flatSubCards = subcontractCards[owner] || [];
  
    const allValid = subAreas.every((sub, areaIdx) => {
      const label = sub.dataset.label?.toLowerCase() || '';
      const cardsInArea = flatSubCards.filter(c => c.subArea === areaIdx);
  
      if (label.includes('set'))   return isValidSet(cardsInArea);
      if (label.includes('run'))   return isValidRun(cardsInArea);
      // If the label isn’t recognised we treat it as invalid
      return false;
    });
  
    if (!allValid) {
      // Optionally give visual feedback
      btn.textContent = 'Invalid Lay‑Down';
      setTimeout(() => (btn.textContent = 'Lay Down'), 1500);
      return;
    }
    
    const alreadyLaid = document.querySelectorAll('.player.HasLaidDown').length;
    if (alreadyLaid === 0) {
      // first player to lay down
      if (window.gameRules.softShanghai) Softwindow = true;
      if (window.gameRules.hardShanghai) Hardwindow = true;
    } else if (alreadyLaid === 1) {
        // second player to lay down – close the window
        if (window.gameRules.softShanghai) Softwindow = false;
    }
  
    playerDiv.classList.add('HasLaidDown');
    btn.disabled = true;
    btn.textContent = 'Laid Down';
  
    renderAllSubcontractAreas();
    // f) Notify other components that this player has laid down
    const laidEvt = new CustomEvent('playerLaidDown', {
      detail: { playerIndex: playerIdx }
    });
    cardManager.setupDragDrop();
    window.dispatchEvent(laidEvt);
  }
  
  window.getMyTurnPlayerIndex = getMyTurnPlayerIndex;
  window.drawCardFrom          = drawCardFrom;
  window.initTable = initTable;
  window.resetTurnState = resetTurnState;
  window.validateLayDown = validateLayDown;

  window.addEventListener('resize', () => {
    layoutPiles();
    layoutPlayers();
  });
})();
