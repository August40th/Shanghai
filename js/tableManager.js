(() => {
  const tableContainer = document.getElementById('table-container');
  const playersContainer = document.getElementById('playersContainer');
  const contractsContainer = document.getElementById('contractsContainer');
  const drawPileDiv = document.getElementById('drawPile');
  const discardPileDiv = document.getElementById('discardPile');
  const suitOrder = ['♦', '♥', '♣', '♠', '★'];
  const rankOrder = ['A','2','3','4','5','6','7','8','9','10','J','Q','K','A','W'];
  const roundHistory = [];
  
  const OVERLAP_PCT = 0.35;
  let players = [];
  let contracts = [];
  let hands = {};
  let subcontractCards = {};
  let drawPile = [];
  let discardPile = [];
  let hasDrawn = false;
  window.hasDrawn = hasDrawn;
  let RoundStarter = 0;
  let roundFinished = false;

  let suitColors = {};
  let backColors = { center: "#000000", edge1: "#333333", edge2: "#666666", edge3: "#999999", outline: "#ffffff", edgeWidth: 6 };
  let suitSize = 90;
  let rankSize = 65;

  let roundIndex = 0;
  let Softwindow = false;
  let Hardwindow = false;

  const roundContracts = [
    "2 Sets", "1 Set + 1 Run", "2 Runs", "3 Sets",
    "2 Sets + 1 Run", "1 Set + 2 Runs", "3 Runs"
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
  
  let scorePopupOpen = false;
  
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
    if (type === 'classic') return card.rank === '3' && (card.suit === '♦' || card.suit === '♥');
    if (type === 'extra') return card.rank === '3' && (card.suit === '♦' || card.suit === '♥' || card.suit === '★');
    if (type === 'joker') return card.rank === 'W';
    return false;
  }
  
  function isValidSet(cards) {
    const wildCnt = cards.filter(isWild).length;
    const nonWild = cards.filter(c => !isWild(c));
    if (nonWild.length === 0) return wildCnt >= 3;
    const distinctRanks = [...new Set(nonWild.map(c => c.rank))];
    if (distinctRanks.length > 1) return false;
    const needed = Math.max(0, 3 - nonWild.length);
    return wildCnt >= needed;
  }
  
  function isValidRun(cards) {
    const wildCnt = cards.filter(isWild).length;
    const nonWild = cards.filter(c => !isWild(c));
    const totalLen = nonWild.length + wildCnt;
    if (totalLen < 4) return false;
    if (nonWild.length === 0) return wildCnt >= 4;
    const distinctSuits = [...new Set(nonWild.map(c => c.suit))];
    if (distinctSuits.length > 1) return false;
    const runSuit = distinctSuits[0];
    const wrapAround = window.gameRules?.wrapAround ?? false;
    
    if (wrapAround) {
      const extendedRankOrder = ['A','2','3','4','5','6','7','8','9','10','J','Q','K','A','2','3','4','5','6','7','8','9','10','J','Q','K','A'];
      const maxStart = extendedRankOrder.length - totalLen;
      const matchesSequence = (seq) => {
        let usedWilds = 0;
        for (let i = 0; i < cards.length; ++i) {
          const card = cards[i];
          if (isWild(card)) { usedWilds++; continue; }
          if (card.rank !== seq[i] || card.suit !== runSuit) return false;
        }
        return usedWilds <= wildCnt;
      };
      for (let start = 0; start <= maxStart; ++start) {
        const ascSeq = extendedRankOrder.slice(start, start + totalLen);
        if (matchesSequence(ascSeq)) return true;
        const descSeq = [...ascSeq].reverse();
        if (matchesSequence(descSeq)) return true;
      }
      return false;
    }

    const maxStart = rankOrder.length - totalLen;
    const matchesSequence = (seq) => {
      let usedWilds = 0;
      for (let i = 0; i < cards.length; ++i) {
        const card = cards[i];
        if (isWild(card)) { usedWilds++; continue; }
        if (card.rank !== seq[i] || card.suit !== runSuit) return false;
      }
      return usedWilds <= wildCnt;
    };

    for (let start = 0; start <= maxStart; ++start) {
      const ascSeq = rankOrder.slice(start, start + totalLen);
      if (matchesSequence(ascSeq)) return true;
      const descSeq = [...ascSeq].reverse();
      if (matchesSequence(descSeq)) return true;
    }
    return false;
  }
  window.isValidSet = isValidSet;
  window.isValidRun = isValidRun;
  
  function validateLayDown(playerIdx) {
    const player = players[playerIdx];
    const subAreas = getSubcontractSubAreas(playerIdx);
    subAreas.forEach(sa => (sa.style.backgroundColor = '#fff'));
    subAreas.forEach((sub, areaIdx) => {
      const label = sub.dataset.label || '';
      const cardsInArea = (subcontractCards[player] || []).filter(c => c.subArea === areaIdx);
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
      contractDiv.innerHTML = '';
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:flex;flex-direction:row;flex-wrap:nowrap;gap:8px;padding:4px;border:1px dashed ' + backColors.outline + ';border-radius:6px;min-width:0;';
      contractDiv.appendChild(wrapper);
      labels.forEach(label => {
        const sub = document.createElement('div');
        sub.className = 'contract-subarea';
        sub.dataset.label = label;
        sub.dataset.playerIndex = i;
        sub.dataset.myTurn = (players[i] && document.getElementById(`player-${i}`).classList.contains('MyTurn')) ? 'true' : 'false';
        sub.style.cssText = 'flex:0 0 auto;flex-shrink:0;max-width:none;min-width:0;padding:2px;border-radius:4px;border:1px solid #000;background-color:#fff;display:flex;align-items:center;justify-content:space-between;font-size:0.85rem;font-weight:500;box-sizing:border-box;min-height:75px;user-select:none;';
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
        try { return decodeURIComponent(pair.substring(i + 1)); } catch { return pair.substring(i + 1); }
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
    backColors = { center: '#f9d71c', edge1: '#e39e13', edge2: '#cf7518', edge3: '#a05108', outline: '#3a2e01', edgeWidth: 6 };
  }

  function loadCustomization() {
    try {
      const ccStr = getCookie('cardCustom');
      if (!ccStr) { setDefaultSuitColors(); setDefaultBackColors(); return; }
      const cc = JSON.parse(ccStr);
      if (cc.suitColors) {
        suitColors = {};
        for (let key in cc.suitColors) {
          if (!Object.prototype.hasOwnProperty.call(cc.suitColors, key)) continue;
          const entry = cc.suitColors[key];
          suitColors[key] = { symbol: entry.symbol || 'white', background: entry.background || '#bbb', outline: entry.outline || 'green' };
        }
      } else { setDefaultSuitColors(); }
      if (cc.backColors) {
        backColors = Object.assign({}, backColors, cc.backColors);
        backColors.edgeWidth = safeNumber(backColors.edgeWidth, 6);
      } else { setDefaultBackColors(); }
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
    } catch { return {}; }
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
      layBtn.disabled = true;
      layBtn.addEventListener('click', LayDownClick);
      const stats = document.createElement('div');
      stats.className = 'stats';
      const topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex;justify-content:space-between;width:100%;';
      const buysDiv = document.createElement('div');
      buysDiv.className = 'stat-buys';
      buysDiv.textContent = 'Buys: 3';
      const heldPointsDiv = document.createElement('div');
      heldPointsDiv.className = 'stat-held';
      heldPointsDiv.textContent = 'Held: 0';
      topRow.appendChild(buysDiv);
      topRow.appendChild(heldPointsDiv);
      const bottomRow = document.createElement('div');
      bottomRow.style.cssText = 'display:flex;justify-content:space-between;width:100%;';
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
      handArea.style.cssText = 'position:relative;display:flex;align-items:center;margin-top:8px;';
      const _handStyle = document.createElement('style');
      _handStyle.textContent = `.hand-area{min-width:40px;}`;
      document.head.appendChild(_handStyle);
      playerDiv.appendChild(nameplate);
      playerDiv.appendChild(layBtn); 
      playerDiv.appendChild(stats);
      playerDiv.appendChild(handArea);
      if (playersContainer) playersContainer.appendChild(playerDiv);
      const contractDiv = document.createElement('div');
      contractDiv.className = 'contract-area';
      contractDiv.id = `contract-${i}`;
      contractDiv.style.cssText = 'display:inline-block;white-space:nowrap;';
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
    const grad = `radial-gradient(circle at center,${c.center} 0%,${c.edge1} 25%,${c.edge2} 50%,${c.edge3} 75%,${c.edge3} 80%)`;
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
    if (playerIdx === undefined) playerIdx = getMyTurnPlayerIndex();
    if (playerIdx < 0) return;
    if (hasDrawn && playerIdx === getMyTurnPlayerIndex()) return;
    let card = null;
    if (source === 'draw') {
      if (drawPile && drawPile.length === 1) {
        if (window.initDeckInstance && typeof window.initDeckInstance.reshuffle === 'function') {
          const result = window.initDeckInstance.reshuffle(drawPile, discardPile);
          drawPile = result.drawPile;
          discardPile = result.discardPile;
        }
      }
      if (drawPile.length === 0) return;
      card = drawPile.pop();
    } else if (source === 'discard') {
      if (discardPile.length === 0) return;
      card = discardPile.pop();
    }
    if (!card) return;
    hands[players[playerIdx]].push(card);
    if (playerIdx === getMyTurnPlayerIndex()) {
      hasDrawn = true;
      window.hasDrawn = true;
      const playerDiv = document.getElementById(`player-${playerIdx}`);
      if (playerDiv) playerDiv.classList.add('HasDrawn');
    }
    cardManager.setupDragDrop();
    renderHands(hands);
    if (source === 'discard') cardManager.renderDiscardPile();
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
      const hasLaidDown = playerDiv.classList.contains('HasLaidDown');
      const subcontract = subcontractCards[player] || [];
      const cardsForStats = hasLaidDown ? hand : hand.concat(subcontract);
      let heldPoints = 0;
      cardsForStats.forEach(card => { heldPoints += calculateCardPoints(card, wildCardsEnabled, wildType); });
      const heldPointsDiv = stats.querySelector('.stat-held');
      if (heldPointsDiv) heldPointsDiv.textContent = `Held: ${heldPoints}`;
      const cardsDiv = stats.querySelector('.stat-cards');
      if (cardsDiv) cardsDiv.textContent = `Cards: ${cardsForStats.length}`;
      if (cardsForStats.length === 0) endRound(player);
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
      const heldDiv = stats.querySelector('.stat-held');
      const scoreDiv = stats.querySelector('.stat-score');
      const buysDiv = playerDiv.querySelector('.stat-buys');
      if (buysDiv) buysDiv.textContent = 'Buys: 3';
      let heldVal = heldDiv ? Number(heldDiv.textContent.split(':')[1].trim()) : 0;
      if (window.gameRules.finalShanghai && Hardwindow && roundIndex === 7 && heldVal > 0) heldVal += 100;
      else if (Hardwindow && heldVal > 0) heldVal += 50;
      else if (Softwindow && heldVal > 0) heldVal += 25;
      let scoreVal = scoreDiv ? Number(scoreDiv.textContent.split(':')[1].trim()) : 0;
      scoreVal = scoreVal + heldVal;
      if (scoreDiv) scoreDiv.textContent = `Score: ${scoreVal}`;
      roundScores.push(heldVal);
    });
    roundHistory.push({ round: roundIndex, scores: roundScores });
    const roundWinnerPopup = document.createElement('div');
    roundWinnerPopup.className = 'round-winner-popup';
    if (Hardwindow && roundIndex === 7) roundWinnerPopup.textContent = `${triggerPlayer} won the FINAL Round with a Shanghai! +100 points to everyone else!`;
    else if (Hardwindow) roundWinnerPopup.textContent = `${triggerPlayer} won the Round with a Shanghai! +50 points to everyone else!`;
    else if (Softwindow) roundWinnerPopup.textContent = `${triggerPlayer} won the Round with a Soft Shanghai! +25 points to everyone else!`;
    else roundWinnerPopup.textContent = `${triggerPlayer} won the Round!`;
    document.body.appendChild(roundWinnerPopup);
    const closeRoundWinner = () => {
      roundWinnerPopup.removeEventListener('click', closeRoundWinner);
      window.removeEventListener('keydown', closeRoundWinner);
      roundWinnerPopup.remove();
      showScoresPopup();
    };
    roundWinnerPopup.addEventListener('click', closeRoundWinner);
    window.addEventListener('keydown', closeRoundWinner);
  }
  
  function showScoresPopup() {
    scorePopupOpen = true;
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
      title.style.cssText = 'text-align:center;font-weight:bold;margin-bottom:8px;';
      container.prepend(title);
    }
    let header = container.querySelector('.scores-header');
    if (!header) {
      header = document.createElement('div');
      header.className = 'scores-header';
      header.innerHTML = `<div class="cell corner"></div>` + players.map(p => `<div class="cell player-name">${p}</div>`).join('');
      container.appendChild(header);
    }
    [...container.querySelectorAll('.scores-row')].forEach(row => row.remove());
    const totalRow = container.querySelector('.scores-total-row');
    if (totalRow) totalRow.remove();
    roundHistory.forEach(rh => {
      const row = document.createElement('div');
      row.className = 'scores-row';
      row.innerHTML = `<div class="cell round-index">Round ${rh.round}</div>` + rh.scores.map(score => `<div class="cell score">${score}</div>`).join('');
      container.appendChild(row);
    });
    const totals = players.map((_, i) => roundHistory.reduce((sum, rh) => sum + (rh.scores[i] || 0), 0));
    const totalHTML = `<div class="cell round-index">Total</div>` + totals.map(totalScore => `<div class="cell score">${totalScore}</div>`).join('');
    const newTotalRow = document.createElement('div');
    newTotalRow.className = 'scores-row scores-total-row';
    newTotalRow.innerHTML = totalHTML;
    container.appendChild(newTotalRow);
    const close = () => {
      container.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
      container.remove();
      scorePopupOpen = false;
      if (roundIndex < 7) startNextRound();
      else showGameWinnerPopup();
    };
    container.addEventListener('click', close);
    window.addEventListener('keydown', close);
  }
  
  function showGameWinnerPopup() {
    const totals = players.map((p, i) => {
      let sum = 0;
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
    const rows = document.querySelectorAll('#scores-popup .scores-row');
    rows.forEach(r => {
      const cells = r.querySelectorAll('.cell.score');
      cells.forEach((c, idx) => { if (totals[idx] === minScore) c.classList.add('lowest-score'); });
    });
    const finalPopup = document.createElement('div');
    finalPopup.className = 'game-winner-popup';
    finalPopup.textContent = `${winnerName} won the game!`;
    document.body.appendChild(finalPopup);
    const closeFinal = () => {
      finalPopup.removeEventListener('click', closeFinal);
      window.removeEventListener('keydown', closeFinal);
      finalPopup.remove();
    };
    finalPopup.addEventListener('click', closeFinal);
    window.addEventListener('keydown', closeFinal);
  }
  
  async function startNextRound() {
    if (scorePopupOpen) await waitForScorePopupClose();
    roundFinished = false; 
    Softwindow = false;  
    Hardwindow = false;  
    roundIndex++;
    const allCards = [];
    players.forEach((_, i) => {
      const playerDiv = document.getElementById(`player-${i}`);
      if (playerDiv) playerDiv.classList.remove('MyTurn', 'HasDrawn', 'HasLaidDown');
    });
    players.forEach((p) => {
      const hand = hands[p] || [];
      allCards.push(...hand);
      hands[p] = [];
      const sub = subcontractCards[p] || [];
      allCards.push(...sub);
      subcontractCards[p] = [];
    });
    hasDrawn = false;
    if (drawPile && drawPile.length) { allCards.push(...drawPile); drawPile = []; }
    if (discardPile && discardPile.length) { allCards.push(...discardPile); discardPile.length = 0; }
    if (window.initDeckInstance && typeof window.initDeckInstance.shuffle === 'function') drawPile = window.initDeckInstance.shuffle(allCards);
    populateContractSubAreas(roundIndex);
    if (RoundStarter >= players.length - 1) RoundStarter = -1;
    RoundStarter++;
    const firstPlayerDiv = document.getElementById(`player-${RoundStarter}`);
    if (firstPlayerDiv) {
      firstPlayerDiv.classList.add('round-starter');
      firstPlayerDiv.classList.add('MyTurn');
      hasDrawn = false;
    }
    players.forEach(p => {
      const dealt = [];
      for (let i = 0; i < 10 && drawPile.length; i++) dealt.push(drawPile.pop());
      hands[p] = dealt;
      subcontractCards[p] = [];
      if (roundIndex === 1 || roundIndex === 4) hands[p] = sortByRank(hands[p]);
      else hands[p] = sortBySuitThenRank(hands[p]);
    });
    cardManager.renderAllSubcontractAreas();
    cardManager.setupDragDrop();
    renderHands(hands);
    cardManager.renderDiscardPile();
    refreshLayButtons();
    await showRoundPopup(roundIndex);
    if (window.aiData && window.aiData.isAI[RoundStarter]) {
      setTimeout(() => executeAITurn(RoundStarter, window.aiData.difficulties[RoundStarter]), 1500);
    }
  }

  function waitForScorePopupClose() {
    return new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (!scorePopupOpen) { clearInterval(checkInterval); resolve(); }
      }, 100);
    });
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
        resolve();
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
        case 0: x = marginH + dist; y = marginVTop; break;
        case 1: x = w - marginH; y = marginVTop + dist; break;
        case 2:
          if (dist < cornerInset) x = w - marginH - cornerInset + dist;
          else if (dist > topLen - cornerInset) x = marginH + (dist - (topLen - cornerInset));
          else x = w - marginH - dist;
          y = h - marginVBottom;
          break;
        case 3: x = marginH; y = h - marginVBottom - dist; break;
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

  function renderAllSubcontractAreas() { cardManager.renderAllSubcontractAreas(); }
  function renderDiscardPile() { cardManager.renderDiscardPile(); }

  // ===== AI FUNCTIONS WITH EXTENSION LOGIC =====
  async function executeAITurn(playerIdx, difficulty) {
      console.log(`AI Turn: Player ${playerIdx} (${difficulty})`);
      const playerDiv = document.getElementById(`player-${playerIdx}`);
      if (!playerDiv || !playerDiv.classList.contains('MyTurn')) return;
      
      // Step 1: Draw
      await aiDrawDecision(playerIdx);
      
      // Step 2: Stage cards optimally
      await aiStageCards(playerIdx);
      
      // Step 3: Lay down if ready (future implementation)
      // Step 4: Play on others' contracts (future)
      // Step 5: Discard (future)
      
      console.log('AI Turn complete for Player', playerIdx);
    }
  
    async function aiStageCards(playerIdx) {
      return new Promise(resolve => {
        setTimeout(() => {
          const player = players[playerIdx];
          const hand = hands[player] || [];
          const currentStaged = subcontractCards[player] || [];
          
          // Get all available cards (hand + retrievable staged)
          const allCards = [...hand, ...currentStaged];
          
          // Get contract requirements
          const required = getContractRequirements(roundIndex);
          const subAreas = getSubcontractSubAreas(playerIdx);
          
          // Find optimal staging
          const optimalStaging = findOptimalStaging(allCards, required, subAreas);
          
          // Apply staging
          applyStaging(playerIdx, optimalStaging, subAreas);
          
          // Update UI
          const handDiv = document.getElementById(`hand-${playerIdx}`);
          if (handDiv) cardManager.renderCardArray(hands[player], handDiv, false, playerIdx, 'hand');
          cardManager.renderAllSubcontractAreas();
          validateLayDown(playerIdx);
          
          resolve();
        }, 500);
      });
    }
  
    function findOptimalStaging(allCards, required, subAreas) {
      // Get labels for each sub-area
      const areaLabels = subAreas.map(sub => {
        const label = (sub.dataset.label || '').toLowerCase();
        return { isSet: label.includes('set'), isRun: label.includes('run') };
      });
      
      // Find all possible valid sets and runs from all cards
      const possibleSets = findAllPossibleSets(allCards);
      const possibleRuns = findAllPossibleRuns(allCards);
      
      // Try to find combination that satisfies contract
      const bestCombination = findBestCombination(
        possibleSets, 
        possibleRuns, 
        required, 
        areaLabels,
        allCards
      );
      
      return bestCombination;
    }
  
    function findAllPossibleSets(cards) {
      const sets = [];
      const rankGroups = {};
      
      // Group by rank
      cards.forEach(card => {
        if (!rankGroups[card.rank]) rankGroups[card.rank] = [];
        rankGroups[card.rank].push(card);
      });
      
      // Find all valid sets (3+ cards)
      Object.entries(rankGroups).forEach(([rank, cardsOfRank]) => {
        if (cardsOfRank.length >= 3) {
          // Generate all combinations of 3+ cards
          for (let size = 3; size <= cardsOfRank.length; size++) {
            const combinations = getCombinations(cardsOfRank, size);
            combinations.forEach(combo => {
              if (isValidSet(combo)) {
                sets.push({
                  cards: combo,
                  rank: rank,
                  size: size,
                  isComplete: true,
                  value: calculateSetValue(combo)
                });
              }
            });
          }
        } else if (cardsOfRank.length === 2) {
          // Partial set (2 cards)
          sets.push({
            cards: [...cardsOfRank],
            rank: rank,
            size: 2,
            isComplete: false,
            value: 5 // Lower value for partial
          });
        }
      });
      
      return sets;
    }
  
    function findAllPossibleRuns(cards) {
      const runs = [];
      const suitGroups = {};
      
      // Group by suit
      cards.forEach(card => {
        if (!suitGroups[card.suit]) suitGroups[card.suit] = [];
        suitGroups[card.suit].push(card);
      });
      
      // For each suit, find all valid runs
      Object.entries(suitGroups).forEach(([suit, cardsOfSuit]) => {
        if (cardsOfSuit.length < 3) return;
        
        const rankValues = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, 
                            '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
        
        // Sort by rank
        const sorted = cardsOfSuit.sort((a, b) => rankValues[a.rank] - rankValues[b.rank]);
        
        // Find all runs of 4+ cards
        for (let i = 0; i < sorted.length - 3; i++) {
          for (let j = i + 3; j <= sorted.length; j++) {
            const subset = sorted.slice(i, j);
            if (isValidRun(subset)) {
              runs.push({
                cards: [...subset],
                suit: suit,
                length: subset.length,
                isComplete: subset.length >= 4,
                lowRank: subset[0].rank,
                highRank: subset[subset.length - 1].rank,
                value: calculateRunValue(subset)
              });
            }
          }
        }
        
        // Find partial runs (3 cards, not yet valid)
        for (let i = 0; i < sorted.length - 2; i++) {
          const subset = sorted.slice(i, i + 3);
          if (subset.length === 3 && !isValidRun(subset)) {
            // Check if close to valid (consecutive or one gap)
            const v1 = rankValues[subset[0].rank];
            const v2 = rankValues[subset[1].rank];
            const v3 = rankValues[subset[2].rank];
            if ((v2 === v1 + 1 && v3 === v2 + 1) || // consecutive
                (v2 === v1 + 2 && v3 === v2 + 1) || // gap at start
                (v2 === v1 + 1 && v3 === v2 + 2)) { // gap at end
              runs.push({
                cards: [...subset],
                suit: suit,
                length: 3,
                isComplete: false,
                lowRank: subset[0].rank,
                highRank: subset[2].rank,
                value: 8 // Higher than partial set since runs are harder
              });
            }
          }
        }
      });
      
      return runs;
    }
  
    function calculateSetValue(cards) {
      // Higher value for larger sets, bonus for high ranks
      const rankValues = { 'A': 15, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, 
                          '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
      const baseValue = cards.length * 10;
      const rankBonus = rankValues[cards[0].rank] || 5;
      return baseValue + rankBonus;
    }
  
    function calculateRunValue(cards) {
      // Higher value for longer runs, bonus for high cards
      const rankValues = { 'A': 15, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, 
                          '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
      const lengthBonus = cards.length * 15; // Higher per-card than sets
      const avgRank = cards.reduce((sum, c) => sum + (rankValues[c.rank] || 5), 0) / cards.length;
      return lengthBonus + avgRank;
    }
  
    function findBestCombination(possibleSets, possibleRuns, required, areaLabels, allCards) {
      const numAreas = areaLabels.length;
      const staging = new Array(numAreas).fill(null).map(() => []);
      
      // Separate complete and partial
      const completeSets = possibleSets.filter(s => s.isComplete).sort((a, b) => b.value - a.value);
      const completeRuns = possibleRuns.filter(r => r.isComplete).sort((a, b) => b.value - a.value);
      const partialSets = possibleSets.filter(s => !s.isComplete).sort((a, b) => b.value - a.value);
      const partialRuns = possibleRuns.filter(r => !r.isComplete).sort((a, b) => b.value - a.value);
      
      const usedCards = new Set();
      
      // Track what each area needs
      const areaNeeds = areaLabels.map(label => ({
        needsSet: label.isSet,
        needsRun: label.isRun,
        filled: false
      }));
      
      // PRIORITY 1: Complete contracts (runs prioritized over sets)
      
      // First, try to fill run areas with complete runs
      areaNeeds.forEach((need, idx) => {
        if (need.needsRun && !need.filled) {
          for (const run of completeRuns) {
            const cardKey = run.cards.map(c => `${c.rank}${c.suit}`).join(',');
            if (!run.cards.some(c => usedCards.has(`${c.rank}${c.suit}`))) {
              staging[idx] = [...run.cards];
              run.cards.forEach(c => usedCards.add(`${c.rank}${c.suit}`));
              need.filled = true;
              break;
            }
          }
        }
      });
      
      // Then, fill set areas with complete sets
      areaNeeds.forEach((need, idx) => {
        if (need.needsSet && !need.filled) {
          for (const set of completeSets) {
            if (!set.cards.some(c => usedCards.has(`${c.rank}${c.suit}`))) {
              staging[idx] = [...set.cards];
              set.cards.forEach(c => usedCards.add(`${c.rank}${c.suit}`));
              need.filled = true;
              break;
            }
          }
        }
      });
      
      // PRIORITY 2: Partial contracts (still need more cards)
      
      // Fill remaining run areas with partial runs
      areaNeeds.forEach((need, idx) => {
        if (need.needsRun && !need.filled) {
          for (const run of partialRuns) {
            if (!run.cards.some(c => usedCards.has(`${c.rank}${c.suit}`))) {
              staging[idx] = [...run.cards];
              run.cards.forEach(c => usedCards.add(`${c.rank}${c.suit}`));
              need.filled = true;
              break;
            }
          }
        }
      });
      
      // Fill remaining set areas with partial sets
      areaNeeds.forEach((need, idx) => {
        if (need.needsSet && !need.filled) {
          for (const set of partialSets) {
            if (!set.cards.some(c => usedCards.has(`${c.rank}${c.suit}`))) {
              staging[idx] = [...set.cards];
              set.cards.forEach(c => usedCards.add(`${c.rank}${c.suit}`));
              need.filled = true;
              break;
            }
          }
        }
      });
      
      // PRIORITY 3: If we have complete contracts, check for better combinations
      // (e.g., Kings are better than 2s for a set)
      optimizeCompletedContracts(staging, areaNeeds, completeSets, completeRuns, usedCards);
      
      return staging;
    }
  
    function optimizeCompletedContracts(staging, areaNeeds, completeSets, completeRuns, usedCards) {
      // For each filled set area, see if there's a better (higher value) set available
      areaNeeds.forEach((need, idx) => {
        if (need.needsSet && need.filled && staging[idx].length > 0) {
          const currentValue = calculateSetValue(staging[idx]);
          
          // Look for higher value complete set using unused cards
          for (const set of completeSets) {
            if (set.value > currentValue && 
                !set.cards.some(c => usedCards.has(`${c.rank}${c.suit}`))) {
              // Replace with better set
              staging[idx].forEach(c => usedCards.delete(`${c.rank}${c.suit}`));
              staging[idx] = [...set.cards];
              set.cards.forEach(c => usedCards.add(`${c.rank}${c.suit}`));
              break;
            }
          }
        }
      });
      
      // Same for runs
      areaNeeds.forEach((need, idx) => {
        if (need.needsRun && need.filled && staging[idx].length > 0) {
          const currentValue = calculateRunValue(staging[idx]);
          
          for (const run of completeRuns) {
            if (run.value > currentValue && 
                !run.cards.some(c => usedCards.has(`${c.rank}${c.suit}`))) {
              staging[idx].forEach(c => usedCards.delete(`${c.rank}${c.suit}`));
              staging[idx] = [...run.cards];
              run.cards.forEach(c => usedCards.add(`${c.rank}${c.suit}`));
              break;
            }
          }
        }
      });
    }
  
    function applyStaging(playerIdx, staging, subAreas) {
      const player = players[playerIdx];
      
      // Clear current staging
      subcontractCards[player] = [];
      
      // Apply new staging
      staging.forEach((cards, areaIdx) => {
        cards.forEach(card => {
          subcontractCards[player].push({
            ...card,
            subArea: areaIdx
          });
        });
      });
      
      // Update hand to remove staged cards
      const stagedCardKeys = new Set();
      staging.forEach(cards => {
        cards.forEach(card => {
          stagedCardKeys.add(`${card.rank}${card.suit}`);
        });
      });
      
      hands[player] = hands[player].filter(card => {
        return !stagedCardKeys.has(`${card.rank}${card.suit}`);
      });
    }
  
    function getCombinations(arr, size) {
      if (size > arr.length) return [];
      if (size === arr.length) return [arr];
      if (size === 1) return arr.map(e => [e]);
      
      const combs = [];
      for (let i = 0; i < arr.length - size + 1; i++) {
        const head = arr.slice(i, i + 1);
        const tailCombs = getCombinations(arr.slice(i + 1), size - 1);
        tailCombs.forEach(tail => combs.push([...head, ...tail]));
      }
      return combs;
    }

  async function aiDrawDecision(playerIdx) {
    return new Promise(resolve => {
      setTimeout(() => {
        const player = players[playerIdx];
        const hand = hands[player] || [];
        const playerDiv = document.getElementById(`player-${playerIdx}`);
        const hasLaidDown = playerDiv?.classList.contains('HasLaidDown') || false;
        
        // Default: draw from draw pile
        let drawSource = 'draw';
        
        // Check if discard pile has card that helps
        const topDiscard = discardPile[discardPile.length - 1];
        if (topDiscard) {
          // Use extension logic for AI decision
          const discardHelps = evaluateDiscardBenefitAI(topDiscard, hand, playerIdx, hasLaidDown);
          if (discardHelps) {
            console.log(`AI Player ${playerIdx}: Taking discard ${topDiscard.rank}${topDiscard.suit} - extends contracts`);
            drawSource = 'discard';
          } else {
            console.log(`AI Player ${playerIdx}: Discard not beneficial, drawing from pile`);
          }
        }
        
        window.drawCardFrom(drawSource, playerIdx);
        resolve();
      }, 800);
    });
  }

  // AI Discard Evaluation with Extension Logic
  function evaluateDiscardBenefitAI(card, hand, playerIdx, hasLaidDown) {
    const player = players[playerIdx];
    const contractCards = subcontractCards[player] || [];
    
    if (hasLaidDown) {
      // POST-LAYDOWN: Can we play this card on existing contracts?
      return canPlayOnExistingContractsAI(card, playerIdx);
    } else {
      // PRE-LAYDOWN: Check if we have complete contracts staged
      const required = getContractRequirements(roundIndex);
      const status = analyzeContractStatus(contractCards, required);
      const hasCompleteContracts = status.needsSets <= 0 && status.needsRuns <= 0;
      
      if (hasCompleteContracts) {
        // We have complete contracts - check if discard extends them
        return canExtendStagedContractsAI(card, contractCards);
      } else {
        // We don't have complete contracts yet - use original logic
        return wouldCompleteContractRequirementAI(card, contractCards, hand, status) ||
               formsNewSetOrRunAI(card, hand, status);
      }
    }
  }

  function getContractRequirements(roundNum) {
    const requirements = {
      1: { sets: 2, runs: 0 }, 2: { sets: 1, runs: 1 },
      3: { sets: 0, runs: 2 }, 4: { sets: 3, runs: 0 },
      5: { sets: 2, runs: 1 }, 6: { sets: 1, runs: 2 },
      7: { sets: 0, runs: 3 }
    };
    return requirements[roundNum] || { sets: 0, runs: 0 };
  }

  function analyzeContractStatus(contractCards, required) {
    let validSets = 0, validRuns = 0;
    const subAreas = {};
    contractCards.forEach(c => {
      if (!subAreas[c.subArea]) subAreas[c.subArea] = [];
      subAreas[c.subArea].push(c);
    });
    Object.values(subAreas).forEach(areaCards => {
      if (areaCards.length >= 3) {
        if (isValidSet(areaCards)) validSets++;
        else if (isValidRun(areaCards)) validRuns++;
      }
    });
    return {
      validSets, validRuns,
      needsSets: required.sets - validSets,
      needsRuns: required.runs - validRuns
    };
  }

  // Check if card extends staged contracts (for AI with complete contracts)
  function canExtendStagedContractsAI(card, contractCards) {
    // Group by sub-area
    const subAreas = {};
    contractCards.forEach(c => {
      if (!subAreas[c.subArea]) subAreas[c.subArea] = [];
      subAreas[c.subArea].push(c);
    });
    
    for (const [areaIdx, areaCards] of Object.entries(subAreas)) {
      // Check set extension (4th+ card) - same as before
      const sameRank = areaCards.filter(c => c.rank === card.rank);
      if (sameRank.length >= 2) {
        const testSet = [...areaCards, card];
        if (isValidSet(testSet)) return true;
      }
      
      // Check run extension OR gap-filling
      const nonWilds = areaCards.filter(c => !isWild(c));
      if (nonWilds.length > 0 && card.suit === nonWilds[0].suit) {
        // Simply test: does adding this card create a valid run?
        // This handles: extending ends AND filling gaps
        const testRun = [...areaCards, card];
        if (isValidRun(testRun)) {
          // Additional check: make sure this card actually helps (not redundant)
          // Only count if we don't already have this exact card
          const alreadyHave = areaCards.some(c => c.rank === card.rank && c.suit === card.suit);
          if (!alreadyHave) return true;
        }
      }
    }
    return false;
  }

  // Check if can play on other players' contracts (post-laydown)
  function canPlayOnExistingContractsAI(card, playerIdx) {
    for (let i = 0; i < players.length; i++) {
      if (i === playerIdx) continue;
      const otherDiv = document.getElementById(`player-${i}`);
      if (!otherDiv?.classList.contains('HasLaidDown')) continue;
      
      const otherPlayer = players[i];
      const otherContract = subcontractCards[otherPlayer] || [];
      
      const subAreas = {};
      otherContract.forEach(c => {
        if (!subAreas[c.subArea]) subAreas[c.subArea] = [];
        subAreas[c.subArea].push(c);
      });
      
      for (const areaCards of Object.values(subAreas)) {
        // Try adding to sets
        const sameRank = areaCards.filter(c => c.rank === card.rank);
        if (sameRank.length >= 2) {
          const testSet = [...areaCards, card];
          if (isValidSet(testSet)) return true;
        }
        
        // Try adding to runs (includes gap-filling)
        const nonWilds = areaCards.filter(c => !isWild(c));
        if (nonWilds.length > 0 && card.suit === nonWilds[0].suit) {
          const testRun = [...areaCards, card];
          if (isValidRun(testRun)) {
            const alreadyHave = areaCards.some(c => c.rank === card.rank && c.suit === card.suit);
            if (!alreadyHave) return true;
          }
        }
      }
    }
    return false;
  }

  function wouldCompleteContractRequirementAI(card, contractCards, hand, status) {
    const sameRankInContract = contractCards.filter(c => c.rank === card.rank);
    if (sameRankInContract.length === 2 && status.needsSets > 0) return true;
    
    const sameSuitInContract = contractCards.filter(c => c.suit === card.suit);
    if (sameSuitInContract.length >= 3) {
      const testRun = [...sameSuitInContract, card];
      if (isValidRun(testRun) && status.needsRuns > 0) return true;
    }
    
    const sameRankInHand = hand.filter(c => c.rank === card.rank);
    const totalSameRank = sameRankInHand.length + sameRankInContract.length;
    if (totalSameRank >= 2 && status.needsSets > 0) {
      const testSet = [...sameRankInHand, ...sameRankInContract, card];
      if (isValidSet(testSet)) return true;
    }
    
    const sameSuitInHand = hand.filter(c => c.suit === card.suit);
    if (sameSuitInHand.length + sameSuitInContract.length >= 3 && status.needsRuns > 0) {
      const testRun = [...sameSuitInHand, ...sameSuitInContract, card];
      if (isValidRun(testRun)) return true;
    }
    return false;
  }

  function formsNewSetOrRunAI(card, hand, status) {
    if (status.needsSets > 0) {
      const sameRank = hand.filter(c => c.rank === card.rank);
      if (sameRank.length >= 2) {
        const testSet = [...sameRank, card];
        if (isValidSet(testSet)) return true;
      }
    }
    
    if (status.needsRuns > 0) {
      const sameSuit = hand.filter(c => c.suit === card.suit);
      if (sameSuit.length >= 3) {
        const testRun = [...sameSuit, card];
        if (isValidRun(testRun)) return true;
      }
      
      const rankValues = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, 
                        '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
      const cardValue = rankValues[card.rank] || 0;
      const suitRanks = sameSuit.map(c => rankValues[c.rank] || 0).sort((a,b) => a-b);
      
      for (let i = 0; i < suitRanks.length; i++) {
        if (Math.abs(suitRanks[i] - cardValue) === 1) return true;
      }
    }
    return false;
  }

  async function initTable(playerNames) {
    loadCustomization();
    createPlayers(playerNames);
    
    // Retrieve AI data from localStorage
    const gs = localStorage.getItem('gameSetup');
    let aiData = { isAI: [], difficulties: [] };
    try {
      const setup = JSON.parse(gs);
      aiData.isAI = setup.isAI || playerNames.map(() => false);
      aiData.difficulties = setup.difficulties || playerNames.map(() => null);
    } catch (e) {
      aiData.isAI = playerNames.map(() => false);
      aiData.difficulties = playerNames.map(() => null);
    }
    window.aiData = aiData;
    
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
      drawPileDiv.addEventListener('click', () => { window.drawCardFrom('draw', RoundStarter); });
    }
    layoutPlayers();
    
    players.forEach(p => {
      subcontractCards[p] = [];
      if (roundIndex === 1 || roundIndex === 4) hands[p] = sortByRank(hands[p]);
      else hands[p] = sortBySuitThenRank(hands[p]);
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
    
    updatePlayerStats(hands);
    refreshLayButtons();
    
    // Trigger AI if first player is AI
    if (window.aiData && window.aiData.isAI[RoundStarter]) {
      setTimeout(() => executeAITurn(RoundStarter, window.aiData.difficulties[RoundStarter]), 1500);
    }
  }

  (function setupDynamicHover() {
    const table = document.getElementById('table-container');
    if (!table) return;
    const HOVER_CLASS = 'hover‑raise';
    const style = document.createElement('style');
    style.textContent = `.${HOVER_CLASS} { z-index: 9999 !important; }`;
    document.head.appendChild(style);
    table.addEventListener('mouseover', event => {
      const card = event.target.closest('.card');
      if (!card) return;
      const playerDiv = card.closest('.player');
      if (!playerDiv?.classList.contains('MyTurn')) return;
      if (card.dataset.dragging === 'true') return;
      if (!card.dataset.origBorder) card.dataset.origBorder = getComputedStyle(card).border;
      card.classList.add(HOVER_CLASS);
      const borderColor = getComputedStyle(card).borderColor;
      const rgb = borderColor.match(/\d+/g);
      if (rgb) {
        const r = 255 - Number(rgb[0]), g = 255 - Number(rgb[1]), b = 255 - Number(rgb[2]);
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
      if (card.dataset.origBorder !== undefined) card.style.border = card.dataset.origBorder;
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
      if (pDiv && pDiv.classList.contains('HasDrawn')) pDiv.classList.remove('HasDrawn');
    });
    
    const oldTurnIdx = players.findIndex((_, i) => {
      const el = document.getElementById(`player-${i}`);
      return el?.classList.contains('MyTurn');
    });
    
    players.forEach((_p, i) => {
      const pDiv = document.getElementById(`player-${i}`);
      if (pDiv && pDiv.classList.contains('Idiscarded')) pDiv.classList.remove('Idiscarded');
    });
    
    if (oldTurnIdx !== -1) {
      const oldDiv = document.getElementById(`player-${oldTurnIdx}`);
      if (oldDiv) { oldDiv.classList.remove('MyTurn'); oldDiv.classList.add('Idiscarded'); }
    }
    
    const newDiv = document.getElementById(`player-${newTurnIdx}`);
    if (newDiv) newDiv.classList.add('MyTurn');
    
    // Trigger AI if next player is AI
    if (window.aiData && window.aiData.isAI[newTurnIdx]) {
      await showBuyClockPopup();
      setTimeout(() => executeAITurn(newTurnIdx, window.aiData.difficulties[newTurnIdx]), 1000);
    } else {
      await showBuyClockPopup();
    }
    
    cardManager.setupDragDrop();
    players.forEach((p, i) => {
      const handDiv = document.getElementById(`hand-${i}`);
      if (!handDiv) return;
      const canDrag = document.getElementById(`player-${i}`).classList.contains('MyTurn');
      cardManager.renderCardArray(hands[p], handDiv, canDrag, i, 'hand');
    });
    cardManager.renderAllSubcontractAreas();
    if (typeof window.updatePlayerStats === 'function') window.updatePlayerStats(hands);
    if (drawPileDiv) {
      drawPileDiv.replaceWith(drawPileDiv.cloneNode(true));
      const freshDrawPileDiv = document.getElementById('drawPile');
      if (freshDrawPileDiv) {
        freshDrawPileDiv.style.cursor = 'pointer';
        freshDrawPileDiv.addEventListener('click', () => {
          const currentIdx = getMyTurnPlayerIndex();
          if (currentIdx !== -1) drawCardFrom('draw', currentIdx);
        });
      }
    }
  }
  
  async function showBuyClockPopup() {
    const clickOrder = [];
    const anyPlayerHasZeroCards = players.some((_, i) => {
      const playerDiv = document.getElementById(`player-${i}`);
      if (!playerDiv) return false;
      const cardsDiv = playerDiv.querySelector('.stat-cards');
      if (!cardsDiv) return false;
      const cardCount = Number(cardsDiv.textContent.split(':')[1].trim()) || 0;
      return cardCount === 0;
    });
    if (anyPlayerHasZeroCards) return;
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
    
    const buyPlayers = players.map((p, i) => {
      const playerDiv = document.getElementById(`player-${i}`);
      const buysDiv = playerDiv?.querySelector('.stat-buys')?.textContent || 'Buys: 0';
      const buyStat = Number(buysDiv.split(':')[1].trim()) || 0;
      const isIdiscarded = playerDiv?.classList.contains('Idiscarded') ?? false;
      if (i === myTurnIdx) return { playerIndex: i, name: players[i], buyStat, isMyTurn: true, isIdiscarded };
      if (buyStat === 0) return null;
      if (!selfDiscard && isIdiscarded) return null;
      return { playerIndex: i, name: players[i], buyStat, isMyTurn: false, isIdiscarded };
    }).filter(x => x !== null);
    
    if (buyPlayers.length === 0) return;
    
    const container = document.createElement('div');
    container.id = 'buy-clock-popup';
    container.classList.add('buy-clock-popup');
    
    const title = document.createElement('h2');
    title.classList.add('buy-clock-title');
    container.appendChild(title);
    
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
    discardWrapper.appendChild(countdownSpan);
    container.appendChild(discardWrapper);
    
    const btnWrapper = document.createElement('div');
    btnWrapper.classList.add('buy-clock-buttons-wrapper');
    if (players.length >= 7) {
      btnWrapper.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));grid-template-rows:repeat(2,auto);gap:20px 24px;';
    } else { btnWrapper.style.cssText = 'display:flex;flex-wrap:nowrap;gap:24px;'; }
    
    const buyingState = {};
    const declinedState = {};
    const activePlayers = [];
    players.forEach((_, i) => { buyingState[i] = false; declinedState[i] = false; });
    const allActed = () => activePlayers.every(i => buyingState[i] || declinedState[i]);
    
    players.forEach((name, i) => {
      const playerDiv = document.getElementById(`player-${i}`);
      if (playerDiv?.classList?.contains('Idiscarded') && !selfDiscard) return;
      activePlayers.push(i);
      const wrap = document.createElement('div');
      wrap.classList.add('buy-clock-player-wrap');
      const lbl = document.createElement('div');
      lbl.classList.add('buy-clock-player-name');
      lbl.textContent = name;
      wrap.appendChild(lbl);
      const isMyTurn = i === myTurnIdx;
      const buyBtn = document.createElement('button');
      buyBtn.type = 'button';
      buyBtn.classList.add('buy-clock-btn');
      buyBtn.textContent = isMyTurn ? 'Not Taking' : 'Not Buying';
      wrap.appendChild(buyBtn);
      const declBtn = document.createElement('button');
      declBtn.type = 'button';
      declBtn.classList.add('buy-clock-btn');
      declBtn.textContent = 'Decline';
      declBtn.style.cssText = 'background-color:#c9302c;margin-top:6px;';
      wrap.appendChild(declBtn);
      
      buyBtn.addEventListener('click', () => {
        if (buyBtn.disabled) return;
        if (optOut) {
          buyingState[i] = !buyingState[i];
          buyBtn.textContent = buyingState[i] ? (isMyTurn ? 'Taking' : 'Buying') : (isMyTurn ? 'Not Taking' : 'Not Buying');
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
        if (allActed()) { buyTime = 0; countdownSpan.textContent = '0'; title.textContent = `Buying Round - Time left: 0s`; }
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
        if (allActed()) { buyTime = 0; countdownSpan.textContent = '0'; title.textContent = `Buying Round - Time left: 0s`; }
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
          processBuyResults(buyingState, myTurnIdx, optOut, selfDiscard, fastBuy, clickOrder);
          resolve();
        }
      }, 1000);
    });
  }

  function processBuyResults(buyingState, myTurnIdx, optOut, selfDiscard, fastBuy, clickOrder = []) {
    const buyers = Object.entries(buyingState).filter(([_, val]) => val).map(([idxStr]) => Number(idxStr));
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
      if (d && d.classList.contains('HasDrawn')) d.classList.remove('HasDrawn');
    }
    
    function drawFromDrawAndDiscard(playerIndex) {
      window.drawCardFrom('draw', playerIndex);
      window.drawCardFrom('discard', playerIndex);
      decrementBuyStat(playerIndex);
      removeHasDrawn(playerIndex);
      renderHands(hands);
      cardManager.renderDiscardPile();
      cardManager.renderAllSubcontractAreas();
    }
    
    if (myBuying) { window.drawCardFrom('discard', myTurnIdx); return; }
    const otherBuyers = buyers.filter(idx => idx !== myTurnIdx);
    if (otherBuyers.length === 0) return;
    
    let buyerIdx;
    if (fastBuy) {
      buyerIdx = clickOrder.find(idx => otherBuyers.includes(idx));
      if (buyerIdx === undefined) buyerIdx = Math.min(...otherBuyers);
    } else {
      const order = players.map((_, i) => i);
      const shifted = order.slice(myTurnIdx + 1).concat(order.slice(0, myTurnIdx + 1));
      buyerIdx = shifted.find(p => otherBuyers.includes(p));
    }
    if (buyerIdx === undefined) return;
    drawFromDrawAndDiscard(buyerIdx);
  }
  
  function LayDownClick(event) {
    const btn = event?.target?.closest('.lay-down-btn');
    if (!btn) return;
    const playerDiv = btn.closest('.player');
    const playerIdx = playerDiv ? Number(playerDiv.id.split('-')[1]) : -1;
    if (playerIdx < 0) return;
    if (!playerDiv.classList.contains('MyTurn')) return;
    
    if (!playerDiv.classList.contains('HasDrawn')) {
      btn.textContent = 'Must Draw First';
      setTimeout(() => (btn.textContent = 'Lay Down'), 1500);
      return;
    }
    
    const hand = hands[players[playerIdx]] || [];
    if (hand.length === 0) {
      btn.textContent = 'No Cards to Lay';
      setTimeout(() => (btn.textContent = 'Lay Down'), 1500);
      return;
    }
    
    const subAreas = getSubcontractSubAreas(playerIdx);
    if (!subAreas.length) return;
    
    const owner = players[playerIdx];
    const flatSubCards = subcontractCards[owner] || [];
    const allValid = subAreas.every((sub, areaIdx) => {
      const label = sub.dataset.label?.toLowerCase() || '';
      const cardsInArea = flatSubCards.filter(c => c.subArea === areaIdx);
      if (label.includes('set')) return isValidSet(cardsInArea);
      if (label.includes('run')) return isValidRun(cardsInArea);
      return false;
    });
    
    if (!allValid) {
      btn.textContent = 'Invalid Lay‑Down';
      setTimeout(() => (btn.textContent = 'Lay Down'), 1500);
      return;
    }
    
    const alreadyLaid = document.querySelectorAll('.player.HasLaidDown').length;
    if (alreadyLaid === 0) {
      if (window.gameRules.softShanghai) Softwindow = true;
      if (window.gameRules.hardShanghai) Hardwindow = true;
    } else if (alreadyLaid === 1) {
      if (window.gameRules.softShanghai) Softwindow = false;
    }
    
    playerDiv.classList.add('HasLaidDown');
    btn.disabled = true;
    btn.textContent = 'Laid Down';
    renderAllSubcontractAreas();
    const laidEvt = new CustomEvent('playerLaidDown', { detail: { playerIndex: playerIdx } });
    cardManager.setupDragDrop();
    window.dispatchEvent(laidEvt);
  }
  
  // Expose functions globally
  window.getMyTurnPlayerIndex = getMyTurnPlayerIndex;
  window.drawCardFrom = drawCardFrom;
  window.initTable = initTable;
  window.resetTurnState = resetTurnState;
  window.validateLayDown = validateLayDown;
  window.endRound = endRound;
  window.executeAITurn = executeAITurn;
  window.aiDrawDecision = aiDrawDecision;
  window.getSubcontractSubAreas = getSubcontractSubAreas;

  window.addEventListener('resize', () => { layoutPiles(); layoutPlayers(); });
})();
