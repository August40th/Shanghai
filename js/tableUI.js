// UI rendering and visual feedback

import * as State from './gameState.js';
import * as Rules from './gameRules.js';

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
    
    // Clear areas
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

// Layout functions
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

// Popup functions
export function showRoundWinnerPopup(triggerPlayer, hardWindow, softWindow, roundIndex) {
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
  
  return new Promise(resolve => {
    const close = () => {
      roundWinnerPopup.remove();
      resolve();
    };
    roundWinnerPopup.addEventListener('click', close);
    window.addEventListener('keydown', close, { once: true });
  });
}

export function showBuyClockUI(buyPlayers, myTurnIdx, buyTime, optOut, fastBuy, clickOrder, onComplete) {
  // Implementation...
  return new Promise(resolve => {
    // Create UI elements...
    // When complete, call onComplete(buyingState) and resolve()
  });
}

// Drag/drop setup helpers
export function setupHandDragDrop(handDiv, playerIdx, player, hasLaidDown, gameRules, onMove) {
  // Implementation...
}

export function setupSubcontractDragDrop(sub, areaIdx, playerIdx, player, hasLaidDown, gameRules, onMove) {
  // Implementation...
}

export function setupDiscardDragDrop(discardPileDiv, playerIdx, player, gameRules, onMove) {
  // Implementation...
}

// Helper functions
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