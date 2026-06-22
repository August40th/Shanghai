// UI rendering and visual feedback

import { gameState } from './gameState.js';

const OVERLAP_PCT = 0.35;

export function createCardDiv(card, scaleDiscard = false, suitColors = {}, backColors = {}, suitSize = 90, rankSize = 65) {
  const cardDiv = document.createElement('div');
  cardDiv.className = 'card';
  cardDiv.dataset.rank = card.rank;
  cardDiv.dataset.suit = card.suit;
  cardDiv.dataset.id = card.id;

  const key = suitToKey(card.suit);
  const sc = suitColors[key] || {
    background: 'white',
    symbol: isRedSuit(card.suit) ? '#c9302c' : '#111',
    outline: '#444'
  };

  cardDiv.style.backgroundColor = sc.background || 'white';
  cardDiv.style.border = `3px solid ${backColors.outline || '#444'}`;
  cardDiv.style.borderRadius = '8px';
  cardDiv.style.boxShadow = '0 2px 4px rgba(0,0,0,0.4)';
  cardDiv.style.display = 'flex';
  cardDiv.style.justifyContent = 'center';
  cardDiv.style.alignItems = 'center';
  cardDiv.style.fontWeight = 'bold';
  cardDiv.style.fontFamily = 'Arial, sans-serif';
  cardDiv.style.boxSizing = 'border-box';
  cardDiv.style.position = 'relative';
  cardDiv.style.userSelect = 'none';

  const discardPileDiv = document.getElementById('discardPile');
  
  if (scaleDiscard) {
    const pad = 8;
    const dw = discardPileDiv?.clientWidth || 120;
    const dh = discardPileDiv?.clientHeight || 160;
    cardDiv.style.position = 'absolute';
    cardDiv.style.top = '0';
    cardDiv.style.left = '0';
    cardDiv.style.width = `${dw - pad}px`;
    cardDiv.style.height = `${dh - pad}px`;
    cardDiv.style.margin = '0';
    cardDiv.style.cursor = 'default';
    cardDiv.style.pointerEvents = 'none';
    cardDiv.style.zIndex = '100';
  } else {
    cardDiv.style.cursor = 'grab';
    cardDiv.style.zIndex = 'auto';
  }

  const factor = scaleDiscard ? 0.65 : 0.28;

  const rankDiv = document.createElement('div');
  rankDiv.className = 'rank';
  rankDiv.textContent = card.rank;
  rankDiv.style.color = sc.symbol || (isRedSuit(card.suit) ? '#c9302c' : '#111');
  rankDiv.style.position = 'absolute';
  rankDiv.style.top = '6%';
  rankDiv.style.right = '7%';
  rankDiv.style.fontSize = Math.round(rankSize * factor) + 'px';
  rankDiv.style.lineHeight = '1';
  rankDiv.style.userSelect = 'none';
  rankDiv.style.pointerEvents = 'none';
  cardDiv.appendChild(rankDiv);

  const suitDiv = document.createElement('div');
  suitDiv.className = 'suit';
  suitDiv.textContent = card.suit;
  suitDiv.style.color = sc.symbol || (isRedSuit(card.suit) ? '#c9302c' : '#111');
  suitDiv.style.fontSize = Math.round(suitSize * factor) + 'px';
  suitDiv.style.pointerEvents = 'none';
  suitDiv.style.userSelect = 'none';
  cardDiv.appendChild(suitDiv);

  return cardDiv;
}

export function renderCardArray(cardsArr, container, draggable, playerIndex, areaType, suitColors, backColors, suitSize, rankSize) {
  container.innerHTML = '';
  if (!cardsArr || cardsArr.length === 0) {
    container.style.width = '';
    return;
  }
  
  const overlap = Math.floor(45 * OVERLAP_PCT);
  const cardWidth = 45;

  if (areaType === 'discard') {
    for (let i = 0; i < cardsArr.length; i++) {
      const cardDiv = createCardDiv(cardsArr[i], true, suitColors, backColors, suitSize, rankSize);
      cardDiv.style.position = 'absolute';
      cardDiv.style.top = '0';
      cardDiv.style.left = '0';
      cardDiv.style.zIndex = i;
      container.appendChild(cardDiv);
    }
    container.style.width = `${cardWidth + 10}px`;
    container.style.height = '160px';
    return;
  }

  cardsArr.forEach((card, idx) => {
    const cardDiv = createCardDiv(card, false, suitColors, backColors, suitSize, rankSize);
    cardDiv.style.position = 'relative';
    cardDiv.style.width = `${cardWidth}px`;
    cardDiv.style.height = '65px';
    cardDiv.style.marginLeft = idx === 0 ? '0px' : `-${overlap}px`;
    cardDiv.style.zIndex = cardsArr.length - idx;

    if (draggable) {
      cardDiv.draggable = true;
      cardDiv.addEventListener('dragstart', e => {
        if (!checkPlayerIsMyTurn(playerIndex)) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({
          card,
          from: areaType,
          playerIndex,
          originIdx: idx
        }));
        
        const crt = cardDiv.cloneNode(true);
        crt.style.position = 'absolute';
        crt.style.top = '-1000px';
        crt.style.left = '-1000px';
        document.body.appendChild(crt);
        e.dataTransfer.setDragImage(crt, 20, 20);
        setTimeout(() => document.body.removeChild(crt), 0);
      });
    }

    container.appendChild(cardDiv);
  });
  
  const width = cardWidth + Math.max(0, cardsArr.length - 1) * (cardWidth - overlap);
  container.style.width = `${Math.ceil(width + 10)}px`;
  container.style.height = '65px';
}

export function renderHands(hands, players, myTurnIdx, suitColors, backColors, suitSize, rankSize) {
  players.forEach((player, i) => {
    const handArea = document.getElementById(`hand-${i}`);
    if (!handArea) return;
    handArea.innerHTML = '';
    const draggable = i === myTurnIdx;
    renderCardArray(hands[player] || [], handArea, draggable, i, 'hand', suitColors, backColors, suitSize, rankSize);
  });
}

export function renderDiscardPile(discardPile, suitColors, backColors, suitSize, rankSize) {
  const discardPileDiv = document.getElementById('discardPile');
  if (!discardPileDiv) return;
  discardPileDiv.innerHTML = '';

  if (discardPile.length === 0) {
    discardPileDiv.textContent = 'Discard';
    return;
  }

  const topCard = discardPile[discardPile.length - 1];
  const cardDiv = createCardDiv(topCard, true, suitColors, backColors, suitSize, rankSize);
  discardPileDiv.appendChild(cardDiv);
}

export function renderAllSubcontractAreas(players, subcontractCards, myTurnIdx, suitColors, backColors, suitSize, rankSize) {
  players.forEach((player, pIdx) => {
    const subAreas = getSubcontractSubAreas(pIdx);
    if (!subAreas.length) return;
    
    subAreas.forEach(sub => {
      while (sub.childNodes.length > 2) sub.removeChild(sub.lastChild);
      const container = document.createElement('div');
      container.style.cssText = 'position:relative;height:65px;display:inline-flex;';
      sub.appendChild(container);
    });
    
    const cards = subcontractCards[player] || [];
    const overlap = Math.floor(45 * OVERLAP_PCT);
    const cardWidth = 45;
    
    subAreas.forEach((sub, areaIdx) => {
      const container = sub.lastChild;
      const cardsForArea = cards.filter(c => c.subArea === areaIdx);
      
      const playerHasLaid = document.getElementById(`player-${pIdx}`)?.classList.contains('HasLaidDown');
      
      cardsForArea.forEach((card, localIdx) => {
        const cardDiv = createCardDiv(card, false, suitColors, backColors, suitSize, rankSize);
        cardDiv.style.position = 'relative';
        cardDiv.style.width = `${cardWidth}px`;
        cardDiv.style.height = '65px';
        cardDiv.style.marginLeft = localIdx === 0 ? '0px' : `-${overlap}px`;
        cardDiv.style.zIndex = cardsForArea.length - localIdx;
        
        if (!playerHasLaid && pIdx === myTurnIdx) {
          cardDiv.draggable = true;
          cardDiv.addEventListener('dragstart', e => {
            if (!checkPlayerIsMyTurn(pIdx)) {
              e.preventDefault();
              return;
            }
            const globalIdx = cards.findIndex(c => c.id === card.id);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', JSON.stringify({
              card,
              from: 'subcontract',
              playerIndex: pIdx,
              originIdx: globalIdx,
              subArea: areaIdx
            }));
            
            const crt = cardDiv.cloneNode(true);
            crt.style.position = 'absolute';
            crt.style.top = '-1000px';
            crt.style.left = '-1000px';
            document.body.appendChild(crt);
            e.dataTransfer.setDragImage(crt, 20, 20);
            setTimeout(() => document.body.removeChild(crt), 0);
          });
        }
        
        container.appendChild(cardDiv);
      });
    });
  });
}

export function getSubcontractSubAreas(playerIndex) {
  const contractDiv = document.getElementById(`contract-${playerIndex}`);
  if (!contractDiv) return [];
  return Array.from(contractDiv.querySelectorAll('.contract-subarea'));
}

export function checkPlayerIsMyTurn(playerIndex) {
  const playerDiv = document.getElementById(`player-${playerIndex}`);
  return playerDiv?.classList.contains('MyTurn') || false;
}

export function layoutPlayers(players, contracts, tableContainer) {
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

export function layoutPiles(tableContainer, drawPileDiv, discardPileDiv, backColors) {
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

export function createPlayers(playerNames, contractSubAreas, playersContainer, contractsContainer, roundIndex) {
  playerNames.forEach((name, i) => {
    const playerDiv = document.createElement('div');
    playerDiv.className = 'player';
    playerDiv.id = `player-${i}`;
    playerDiv.style.position = 'absolute';
    
    const nameplate = document.createElement('div');
    nameplate.className = 'nameplate';
    nameplate.textContent = name;
    
    const layBtn = document.createElement('button');
    layBtn.className = 'lay-down-btn';
    layBtn.type = 'button';
    layBtn.textContent = 'Lay Down';
    layBtn.disabled = true;
    
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
    
    gameState.contracts[i] = contractDiv;
  });
}

export function populateContractSubAreas(roundNum, contractSubAreas, contracts) {
  const labels = contractSubAreas[roundNum] || [];
  
  contracts.forEach((contractDiv, i) => {
    if (!contractDiv) return;
    contractDiv.innerHTML = '';
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:row;flex-wrap:nowrap;gap:8px;padding:4px;border:1px dashed #666;border-radius:6px;min-width:0;';
    contractDiv.appendChild(wrapper);
    
    labels.forEach(label => {
      const sub = document.createElement('div');
      sub.className = 'contract-subarea';
      sub.dataset.label = label;
      sub.dataset.playerIndex = i;
      
      const playerDiv = document.getElementById(`player-${i}`);
      sub.dataset.myTurn = playerDiv?.classList.contains('MyTurn') ? 'true' : 'false';
      
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

export function showRoundWinnerPopup(triggerPlayer, hardWindow, softWindow, roundIndex) {
  return new Promise(resolve => {
    const roundWinnerPopup = document.createElement('div');
    roundWinnerPopup.className = 'round-winner-popup';
    
    if (hardWindow && roundIndex === 7) {
      roundWinnerPopup.textContent = `${triggerPlayer} won the FINAL Round with a Shanghai! +100 points to everyone else!`;
    } else if (hardWindow) {
      roundWinnerPopup.textContent = `${triggerPlayer} won the Round with a Shanghai! +50 points to everyone else!`;
    } else if (softWindow) {
      roundWinnerPopup.textContent = `${triggerPlayer} won the Round with a Soft Shanghai! +25 points to everyone else!`;
    } else {
      roundWinnerPopup.textContent = `${triggerPlayer} won the Round!`;
    }
    
    document.body.appendChild(roundWinnerPopup);
    
    const close = () => {
      roundWinnerPopup.remove();
      resolve();
    };
    
    roundWinnerPopup.addEventListener('click', close);
    window.addEventListener('keydown', close, { once: true });
  });
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

function isRedSuit(suit) {
  return suit === '♦' || suit === '♥';
}

// (Previous content up to showRoundWinnerPopup...)

export function showBuyClockUI(buyPlayers, myTurnIdx, buyTime, optOut, fastBuy, clickOrder, onComplete) {
  return new Promise(resolve => {
    const container = document.createElement('div');
    container.id = 'buy-clock-popup';
    container.classList.add('buy-clock-popup');
    
    const title = document.createElement('h2');
    title.classList.add('buy-clock-title');
    title.textContent = `Buying Round - Time left: ${buyTime}s`;
    container.appendChild(title);
    
    const discardWrapper = document.createElement('div');
    discardWrapper.classList.add('buy-clock-discard-wrapper');
    
    const gameState = window.gameState;
    const topDiscard = gameState.discardPile[gameState.discardPile.length - 1];
    if (topDiscard) {
      const cardDiv = createCardDiv(topDiscard, true, {}, { center: '#f9d71c', edge1: '#e39e13', edge2: '#cf7518', edge3: '#a05108', outline: '#3a2e01', edgeWidth: 6 }, 90, 65);
      cardDiv.classList.add('buy-clock-discard-card');
      discardWrapper.appendChild(cardDiv);
    }
    
    const countdownSpan = document.createElement('span');
    countdownSpan.classList.add('buy-clock-countdown');
    countdownSpan.textContent = buyTime;
    discardWrapper.appendChild(countdownSpan);
    container.appendChild(discardWrapper);
    
    const btnWrapper = document.createElement('div');
    btnWrapper.classList.add('buy-clock-buttons-wrapper');
    
    const players = gameState.players;
    const buyingState = {};
    const declinedState = {};
    const activePlayers = [];
    
    players.forEach((_, i) => { buyingState[i] = false; declinedState[i] = false; });
    
    const allActed = () => activePlayers.every(i => buyingState[i] || declinedState[i]);
    
    buyPlayers.forEach(({ playerIndex, name, isMyTurn }) => {
      activePlayers.push(playerIndex);
      
      const wrap = document.createElement('div');
      wrap.classList.add('buy-clock-player-wrap');
      
      const lbl = document.createElement('div');
      lbl.classList.add('buy-clock-player-name');
      lbl.textContent = name;
      wrap.appendChild(lbl);
      
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
          buyingState[playerIndex] = !buyingState[playerIndex];
          buyBtn.textContent = buyingState[playerIndex]
            ? (isMyTurn ? 'Taking' : 'Buying')
            : (isMyTurn ? 'Not Taking' : 'Not Buying');
          buyBtn.classList.toggle('buying', buyingState[playerIndex]);
          
          if (buyingState[playerIndex]) {
            declBtn.disabled = false;
            declBtn.textContent = 'Decline';
            declinedState[playerIndex] = false;
          }
        } else {
          if (buyingState[playerIndex]) return;
          buyingState[playerIndex] = true;
          buyBtn.textContent = isMyTurn ? 'Taking' : 'Buying';
          buyBtn.classList.add('buying');
          buyBtn.disabled = true;
          
          if (fastBuy && !clickOrder.includes(playerIndex)) clickOrder.push(playerIndex);
        }
        
        if (isMyTurn && buyingState[playerIndex]) {
          const newTime = Math.ceil(parseInt(countdownSpan.textContent) / 2);
          countdownSpan.textContent = newTime;
          title.textContent = `Buying Round - Time left: ${newTime}s`;
        }
        
        if (allActed()) {
          countdownSpan.textContent = '0';
          title.textContent = `Buying Round - Time left: 0s`;
        }
      });
      
      declBtn.addEventListener('click', () => {
        if (declBtn.disabled) return;
        declinedState[playerIndex] = true;
        declBtn.textContent = 'Declined';
        declBtn.disabled = true;
        
        if (buyingState[playerIndex]) {
          buyingState[playerIndex] = false;
          buyBtn.textContent = isMyTurn ? 'Not Taking' : 'Not Buying';
          buyBtn.classList.remove('buying');
          if (!optOut) buyBtn.disabled = true;
        }
        
        if (allActed()) {
          countdownSpan.textContent = '0';
          title.textContent = `Buying Round - Time left: 0s`;
        }
      });
      
      btnWrapper.appendChild(wrap);
    });
    
    container.appendChild(btnWrapper);
    document.body.appendChild(container);
    
    const intervalId = setInterval(() => {
      const currentTime = parseInt(countdownSpan.textContent) - 1;
      if (currentTime >= 0) {
        countdownSpan.textContent = currentTime;
        title.textContent = `Buying Round - Time left: ${currentTime}s`;
      }
      
      if (currentTime <= 0 || allActed()) {
        clearInterval(intervalId);
        container.remove();
        onComplete(buyingState);
        resolve();
      }
    }, 1000);
  });
}

// Drag/drop setup helpers
export function setupHandDragDrop(handDiv, playerIdx, player, hasLaidDown, gameRules, onMove) {
  handDiv.ondragover = e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    handDiv.classList.add('drop-target');
  };
  
  handDiv.ondragleave = () => {
    handDiv.classList.remove('drop-target');
  };
  
  handDiv.ondrop = e => {
    e.preventDefault();
    handDiv.classList.remove('drop-target');
    
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    
    const data = JSON.parse(raw);
    if (data.playerIndex !== playerIdx) return;
    
    const rect = handDiv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const cards = [...handDiv.querySelectorAll('.card')];
    let insertIdx = cards.length;
    
    for (let i = 0; i < cards.length; i++) {
      const cardRect = cards[i].getBoundingClientRect();
      const cardCenter = cardRect.left + cardRect.width / 2 - rect.left;
      if (x < cardCenter) {
        insertIdx = i;
        break;
      }
    }
    
    onMove(data, 'hand', { insertIdx });
  };
}

export function setupSubcontractDragDrop(sub, areaIdx, playerIdx, player, hasLaidDown, gameRules, onMove) {
  sub.ondragover = e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    sub.classList.add('drop-target');
  };
  
  sub.ondragleave = () => {
    sub.classList.remove('drop-target');
  };
  
  sub.ondrop = e => {
    e.preventDefault();
    sub.classList.remove('drop-target');
    
    if (hasLaidDown) return;
    
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    
    const data = JSON.parse(raw);
    if (data.playerIndex !== playerIdx) return;
    
    const container = sub.lastChild;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const cards = [...container.querySelectorAll('.card')];
    let insertIdx = cards.length;
    
    for (let i = 0; i < cards.length; i++) {
      const cardRect = cards[i].getBoundingClientRect();
      const cardCenter = cardRect.left + cardRect.width / 2 - rect.left;
      if (x < cardCenter) {
        insertIdx = i;
        break;
      }
    }
    
    onMove(data, 'subcontract', { areaIdx, insertIdx });
  };
}

export function setupDiscardDragDrop(discardPileDiv, playerIdx, player, gameRules, onMove) {
  discardPileDiv.ondragover = e => {
    const playerDiv = document.getElementById(`player-${playerIdx}`);
    if (!playerDiv?.classList.contains('HasDrawn')) return;
    
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    discardPileDiv.classList.add('drop-target');
  };
  
  discardPileDiv.ondragleave = () => {
    discardPileDiv.classList.remove('drop-target');
  };
  
  discardPileDiv.ondrop = e => {
    e.preventDefault();
    discardPileDiv.classList.remove('drop-target');
    
    const playerDiv = document.getElementById(`player-${playerIdx}`);
    if (!playerDiv?.classList.contains('HasDrawn')) return;
    
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    
    const data = JSON.parse(raw);
    if (data.playerIndex !== playerIdx) return;
    
    onMove(data, 'discard', {});
  };
}

// DRAG AND DROP SETUP - ADDED FOR FULL FUNCTIONALITY
export function setupHandDragDrop(handDiv, playerIndex, playerName, hasLaidDown, gameRules, handleCardMove) {
  if (!handDiv) return;
  handDiv.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  handDiv.ondrop = e => { e.preventDefault(); handleCardMove(e, 'hand', playerIndex, gameRules); };
}

export function setupSubcontractDragDrop(subAreaDiv, targetAreaIdx, playerIndex, playerName, hasLaidDown, gameRules, handleCardMove) {
  if (!subAreaDiv) return;
  subAreaDiv.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  subAreaDiv.ondrop = e => { e.preventDefault(); handleCardMove(e, 'subcontract', playerIndex, gameRules, targetAreaIdx); };
}

export function setupDiscardDragDrop(discardDiv, playerIndex, playerName, gameRules, handleCardMove) {
  if (!discardDiv) return;
  discardDiv.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  discardDiv.ondrop = e => { e.preventDefault(); handleCardMove(e, 'discard', playerIndex, gameRules); };
}
