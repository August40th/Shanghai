// Game actions - modifies state, calls UI for rendering

import { gameState, getMyTurnPlayerIndex, updatePlayerStats, initPlayerState } from './gameState.js';
import * as Rules from './gameRules.js';
import * as UI from './tableUI.js';
import * as Deck from './deckManager.js';

export function drawCardFrom(source, playerIdx) {
  if (playerIdx === undefined) playerIdx = getMyTurnPlayerIndex();
  if (playerIdx < 0) return;
  
  if (gameState.hasDrawn && playerIdx === getMyTurnPlayerIndex()) return;
  
  let card = null;
  
  if (source === 'draw') {
    if (gameState.drawPile && gameState.drawPile.length === 1) {
      const result = Deck.reshuffle(gameState.drawPile, gameState.discardPile);
      gameState.drawPile = result.drawPile;
      gameState.discardPile = result.discardPile;
    }
    if (gameState.drawPile.length === 0) return;
    card = gameState.drawPile.pop();
  } else if (source === 'discard') {
    if (gameState.discardPile.length === 0) return;
    card = gameState.discardPile.pop();
  }
  
  if (!card) return;
  
  gameState.hands[gameState.players[playerIdx]].push(card);
  
  if (playerIdx === getMyTurnPlayerIndex()) {
    gameState.hasDrawn = true;
    const playerDiv = document.getElementById(`player-${playerIdx}`);
    if (playerDiv) playerDiv.classList.add('HasDrawn');
  }
  
  // Get customization for rendering
  const customization = loadCustomization();
  UI.renderHands(gameState.hands, gameState.players, getMyTurnPlayerIndex(), 
    customization.suitColors, customization.backColors, customization.suitSize, customization.rankSize);
  
  if (source === 'discard') {
    UI.renderDiscardPile(gameState.discardPile, customization.suitColors, customization.backColors, 
      customization.suitSize, customization.rankSize);
  }
}

export async function resetTurnState(newTurnIdx, gameRules, aiData) {
  gameState.hasDrawn = false;
  
  gameState.players.forEach((_, i) => {
    const pDiv = document.getElementById(`player-${i}`);
    if (pDiv && pDiv.classList.contains('HasDrawn')) {
      pDiv.classList.remove('HasDrawn');
    }
  });
  
  const oldTurnIdx = gameState.players.findIndex((_, i) => {
    const el = document.getElementById(`player-${i}`);
    return el?.classList.contains('MyTurn');
  });
  
  gameState.players.forEach((_p, i) => {
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
  
  const newDiv = document.getElementById(`player-${newTurnIdx}`);
  if (newDiv) newDiv.classList.add('MyTurn');
  
  if (aiData && aiData.isAI[newTurnIdx]) {
    await showBuyClockPopup(gameRules);
    const { executeAITurn } = await import('./aiPlayer.js');
    setTimeout(() => executeAITurn(newTurnIdx, aiData.difficulties[newTurnIdx], gameRules), 1000);
  } else {
    await showBuyClockPopup(gameRules);
  }
  
  const customization = loadCustomization();
  UI.renderHands(gameState.hands, gameState.players, getMyTurnPlayerIndex(),
    customization.suitColors, customization.backColors, customization.suitSize, customization.rankSize);
  UI.renderAllSubcontractAreas(gameState.players, gameState.subcontractCards, getMyTurnPlayerIndex(),
    customization.suitColors, customization.backColors, customization.suitSize, customization.rankSize);
}

export function endRound(triggerPlayer, gameRules) {
  if (gameState.roundFinished) return;
  gameState.roundFinished = true;
  
  const roundScores = [];
  
  gameState.players.forEach((p, i) => {
    const playerDiv = document.getElementById(`player-${i}`);
    const stats = playerDiv?.querySelector('.stats');
    if (!stats) return;
    
    const heldDiv = stats.querySelector('.stat-held');
    const scoreDiv = stats.querySelector('.stat-score');
    const buysDiv = playerDiv.querySelector('.stat-buys');
    if (buysDiv) buysDiv.textContent = 'Buys: 3';
    
    let heldVal = heldDiv ? Number(heldDiv.textContent.split(':')[1].trim()) : 0;
    
    if (gameRules.finalShanghai && gameState.Hardwindow && gameState.roundIndex === 7 && heldVal > 0) {
      heldVal += 100;
    } else if (gameState.Hardwindow && heldVal > 0) {
      heldVal += 50;
    } else if (gameState.Softwindow && heldVal > 0) {
      heldVal += 25;
    }
    
    let scoreVal = scoreDiv ? Number(scoreDiv.textContent.split(':')[1].trim()) : 0;
    scoreVal = scoreVal + heldVal;
    if (scoreDiv) scoreDiv.textContent = `Score: ${scoreVal}`;
    
    roundScores.push(heldVal);
  });
  
  gameState.roundHistory.push({ round: gameState.roundIndex, scores: roundScores });
  
  UI.showRoundWinnerPopup(triggerPlayer, gameState.Hardwindow, gameState.Softwindow, gameState.roundIndex);
}

export function LayDownClick(event, gameRules) {
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
  
  const hand = gameState.hands[gameState.players[playerIdx]] || [];
  if (hand.length === 0) {
    btn.textContent = 'No Cards to Lay';
    setTimeout(() => (btn.textContent = 'Lay Down'), 1500);
    return;
  }
  
  const subAreas = UI.getSubcontractSubAreas(playerIdx);
  if (!subAreas.length) return;
  
  const player = gameState.players[playerIdx];
  const flatSubCards = gameState.subcontractCards[player] || [];
  
  const allValid = subAreas.every((sub, areaIdx) => {
    const label = sub.dataset.label?.toLowerCase() || '';
    const cardsInArea = flatSubCards.filter(c => c.subArea === areaIdx);
    if (label.includes('set')) return Rules.isValidSet(cardsInArea, gameRules);
    if (label.includes('run')) return Rules.isValidRun(cardsInArea, gameRules);
    return false;
  });
  
  if (!allValid) {
    btn.textContent = 'Invalid Lay‑Down';
    setTimeout(() => (btn.textContent = 'Lay Down'), 1500);
    return;
  }
  
  const alreadyLaid = document.querySelectorAll('.player.HasLaidDown').length;
  if (alreadyLaid === 0) {
    if (gameRules.softShanghai) gameState.Softwindow = true;
    if (gameRules.hardShanghai) gameState.Hardwindow = true;
  } else if (alreadyLaid === 1) {
    if (gameRules.softShanghai) gameState.Softwindow = false;
  }
  
  playerDiv.classList.add('HasLaidDown');
  btn.disabled = true;
  btn.textContent = 'Laid Down';
  
  const customization = loadCustomization();
  UI.renderAllSubcontractAreas(gameState.players, gameState.subcontractCards, getMyTurnPlayerIndex(),
    customization.suitColors, customization.backColors, customization.suitSize, customization.rankSize);
  
  const laidEvt = new CustomEvent('playerLaidDown', { detail: { playerIndex: playerIdx } });
  window.dispatchEvent(laidEvt);
}

export function processBuyResults(buyingState, myTurnIdx, optOut, selfDiscard, fastBuy, clickOrder = []) {
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
    if (d && d.classList.contains('HasDrawn')) d.classList.remove('HasDrawn');
  }
  
  function drawFromDrawAndDiscard(playerIndex) {
    drawCardFrom('draw', playerIndex);
    drawCardFrom('discard', playerIndex);
    decrementBuyStat(playerIndex);
    removeHasDrawn(playerIndex);
    
    const customization = loadCustomization();
    UI.renderHands(gameState.hands, gameState.players, getMyTurnPlayerIndex(),
      customization.suitColors, customization.backColors, customization.suitSize, customization.rankSize);
    UI.renderDiscardPile(gameState.discardPile, customization.suitColors, customization.backColors,
      customization.suitSize, customization.rankSize);
    UI.renderAllSubcontractAreas(gameState.players, gameState.subcontractCards, getMyTurnPlayerIndex(),
      customization.suitColors, customization.backColors, customization.suitSize, customization.rankSize);
  }
  
  if (myBuying) {
    drawCardFrom('discard', myTurnIdx);
    return;
  }
  
  const otherBuyers = buyers.filter(idx => idx !== myTurnIdx);
  if (otherBuyers.length === 0) return;
  
  let buyerIdx;
  if (fastBuy) {
    buyerIdx = clickOrder.find(idx => otherBuyers.includes(idx));
    if (buyerIdx === undefined) buyerIdx = Math.min(...otherBuyers);
  } else {
    const order = gameState.players.map((_, i) => i);
    const shifted = order.slice(myTurnIdx + 1).concat(order.slice(0, myTurnIdx + 1));
    buyerIdx = shifted.find(p => otherBuyers.includes(p));
  }
  
  if (buyerIdx === undefined) return;
  drawFromDrawAndDiscard(buyerIdx);
}

export async function showBuyClockPopup(gameRules) {
  const clickOrder = [];
  
  const anyPlayerHasZeroCards = gameState.players.some((_, i) => {
    const playerDiv = document.getElementById(`player-${i}`);
    if (!playerDiv) return false;
    const cardsDiv = playerDiv.querySelector('.stat-cards');
    if (!cardsDiv) return false;
    const cardCount = Number(cardsDiv.textContent.split(':')[1].trim()) || 0;
    return cardCount === 0;
  });
  
  if (anyPlayerHasZeroCards) return;
  if (gameRules.hardShanghai) gameState.Hardwindow = false;
  
  let customRules = {};
  try {
    const crStr = document.cookie.split('; ').find(row => row.startsWith('customRules='));
    if (crStr) customRules = JSON.parse(decodeURIComponent(crStr.split('=')[1]));
  } catch {}
  
  const buyTimeOrig = parseInt(customRules.buyClock) || 16;
  let buyTime = buyTimeOrig;
  const optOut = Boolean(customRules.optOutChk ?? false);
  const selfDiscard = Boolean(customRules.selfDiscardChk ?? false);
  const fastBuy = Boolean(customRules.fastBuyChk ?? true);
  
  const myTurnIdx = gameState.players.findIndex((_, i) => {
    const div = document.getElementById(`player-${i}`);
    return div?.classList.contains('MyTurn');
  });
  
  if (myTurnIdx === -1) return;
  
  const buyPlayers = gameState.players.map((p, i) => {
    const playerDiv = document.getElementById(`player-${i}`);
    const buysDiv = playerDiv?.querySelector('.stat-buys')?.textContent || 'Buys: 0';
    const buyStat = Number(buysDiv.split(':')[1].trim()) || 0;
    const isIdiscarded = playerDiv?.classList.contains('Idiscarded') ?? false;
    
    if (i === myTurnIdx) {
      return { playerIndex: i, name: gameState.players[i], buyStat, isMyTurn: true, isIdiscarded };
    }
    if (buyStat === 0) return null;
    if (!selfDiscard && isIdiscarded) return null;
    
    return { playerIndex: i, name: gameState.players[i], buyStat, isMyTurn: false, isIdiscarded };
  }).filter(x => x !== null);
  
  if (buyPlayers.length === 0) return;
  
  return UI.showBuyClockUI(buyPlayers, myTurnIdx, buyTime, optOut, fastBuy, clickOrder, (buyingState) => {
    processBuyResults(buyingState, myTurnIdx, optOut, selfDiscard, fastBuy, clickOrder);
  });
}

export function setupDragDrop(gameRules) {
  gameState.players.forEach((_, i) => {
    const handDiv = document.getElementById(`hand-${i}`);
    if (handDiv) {
      handDiv.ondragover = null;
      handDiv.ondrop = null;
    }
    const subAreas = UI.getSubcontractSubAreas(i);
    subAreas.forEach(sub => {
      sub.ondragover = null;
      sub.ondrop = null;
    });
  });
  
  const myTurnIdx = getMyTurnPlayerIndex();
  if (myTurnIdx === -1) return;
  
  const myPlayer = gameState.players[myTurnIdx];
  const myPlayerDiv = document.getElementById(`player-${myTurnIdx}`);
  const myHasLaidDown = myPlayerDiv?.classList.contains('HasLaidDown');
  
  const myHandDiv = document.getElementById(`hand-${myTurnIdx}`);
  if (myHandDiv) {
    UI.setupHandDragDrop(myHandDiv, myTurnIdx, myPlayer, myHasLaidDown, gameRules, handleCardMove);
  }
  
  const mySubContracts = UI.getSubcontractSubAreas(myTurnIdx);
  mySubContracts.forEach((sub, targetAreaIdx) => {
    UI.setupSubcontractDragDrop(sub, targetAreaIdx, myTurnIdx, myPlayer, myHasLaidDown, gameRules, handleCardMove);
  });
  
  const discardPileDiv = document.getElementById('discardPile');
  if (discardPileDiv) {
    UI.setupDiscardDragDrop(discardPileDiv, myTurnIdx, myPlayer, gameRules, handleCardMove);
  }
}

function handleCardMove(data, targetType, targetInfo) {
  const { card, from, playerIndex, originIdx } = data;
  const myTurnIdx = getMyTurnPlayerIndex();
  const myPlayer = gameState.players[myTurnIdx];
  
  if (playerIndex !== myTurnIdx) return false;
  
  if (targetType === 'hand') {
    return moveToHand(card, from, originIdx, myPlayer, targetInfo.insertIdx);
  } else if (targetType === 'subcontract') {
    return moveToSubcontract(card, from, originIdx, myPlayer, targetInfo.areaIdx, targetInfo.insertIdx);
  } else if (targetType === 'discard') {
    return moveToDiscard(card, from, originIdx, myPlayer);
  }
  
  return false;
}

function moveToHand(card, from, originIdx, player, insertIdx) {
  const myHandDiv = document.getElementById(`hand-${gameState.players.indexOf(player)}`);
  
  if (from === 'hand') {
    const hand = gameState.hands[player];
    const cardIdx = hand.findIndex(c => c.id === card.id);
    if (cardIdx !== -1) {
      const [movedCard] = hand.splice(cardIdx, 1);
      hand.splice(insertIdx, 0, movedCard);
    }
  } else if (from === 'subcontract') {
    const stagedIdx = gameState.subcontractCards[player].findIndex(c => c.id === card.id);
    if (stagedIdx !== -1) {
      const [movedCard] = gameState.subcontractCards[player].splice(stagedIdx, 1);
      delete movedCard.subArea;
      gameState.hands[player].splice(insertIdx, 0, movedCard);
    }
  }
  
  const customization = loadCustomization();
  UI.renderCardArray(gameState.hands[player], myHandDiv, true, gameState.players.indexOf(player), 'hand',
    customization.suitColors, customization.backColors, customization.suitSize, customization.rankSize);
  UI.renderAllSubcontractAreas(gameState.players, gameState.subcontractCards, getMyTurnPlayerIndex(),
    customization.suitColors, customization.backColors, customization.suitSize, customization.rankSize);
  return true;
}

function moveToSubcontract(card, from, originIdx, player, targetAreaIdx, insertIdx) {
  const flatArr = gameState.subcontractCards[player];
  
  let globalInsertIdx = -1, lastIdx = -1, countInArea = 0;
  for (let i = 0; i < flatArr.length; i++) {
    if (flatArr[i].subArea === targetAreaIdx) {
      if (countInArea === insertIdx) {
        globalInsertIdx = i;
        break;
      }
      lastIdx = i;
      countInArea++;
    } else if (flatArr[i].subArea > targetAreaIdx) {
      globalInsertIdx = i;
      break;
    }
  }
  if (globalInsertIdx === -1) globalInsertIdx = lastIdx + 1;
  
  if (from === 'hand') {
    const handIdx = gameState.hands[player].findIndex(c => c.id === card.id);
    if (handIdx !== -1) {
      const [movedCard] = gameState.hands[player].splice(handIdx, 1);
      movedCard.subArea = targetAreaIdx;
      flatArr.splice(globalInsertIdx, 0, movedCard);
    }
  } else if (from === 'subcontract') {
    const stagedIdx = flatArr.findIndex(c => c.id === card.id);
    if (stagedIdx !== -1) {
      const [movedCard] = flatArr.splice(stagedIdx, 1);
      movedCard.subArea = targetAreaIdx;
      flatArr.splice(globalInsertIdx, 0, movedCard);
    }
  }
  
  const customization = loadCustomization();
  const myHandDiv = document.getElementById(`hand-${gameState.players.indexOf(player)}`);
  UI.renderCardArray(gameState.hands[player], myHandDiv, true, gameState.players.indexOf(player), 'hand',
    customization.suitColors, customization.backColors, customization.suitSize, customization.rankSize);
  UI.renderAllSubcontractAreas(gameState.players, gameState.subcontractCards, getMyTurnPlayerIndex(),
    customization.suitColors, customization.backColors, customization.suitSize, customization.rankSize);
  return true;
}

function moveToDiscard(card, from, originIdx, player) {
  const playerDiv = document.getElementById(`player-${gameState.players.indexOf(player)}`);
  if (!playerDiv?.classList.contains('HasDrawn')) return false;
  
  let removedCard;
  if (from === 'hand') {
    const handIdx = gameState.hands[player].findIndex(c => c.id === card.id);
    if (handIdx !== -1) {
      [removedCard] = gameState.hands[player].splice(handIdx, 1);
    }
  } else if (from === 'subcontract') {
    const stagedIdx = gameState.subcontractCards[player].findIndex(c => c.id === card.id);
    if (stagedIdx !== -1) {
      [removedCard] = gameState.subcontractCards[player].splice(stagedIdx, 1);
    }
  }
  
  if (removedCard) {
    delete removedCard.subArea;
    gameState.discardPile.push(removedCard);
    
    // Get gameRules from cookie
    let gameRules;
    try {
      const crStr = document.cookie.split('; ').find(row => row.startsWith('customRules='));
      gameRules = crStr ? JSON.parse(decodeURIComponent(crStr.split('=')[1])) : {};
    } catch {
      gameRules = {};
    }
    
    // Normalize gameRules
    gameRules = {
      wildsEnabled: gameRules.wildCardsChk ?? true,
      wildType: (gameRules.wildType || 'classic').toLowerCase(),
      ...gameRules
    };
    
    updatePlayerStats(gameRules);
    
    const customization = loadCustomization();
    UI.renderDiscardPile(gameState.discardPile, customization.suitColors, customization.backColors,
      customization.suitSize, customization.rankSize);
    
    const nextIdx = (getMyTurnPlayerIndex() + 1) % gameState.players.length;
    const nextPlayerDiv = document.getElementById(`player-${nextIdx}`);
    if (nextPlayerDiv) {
      const cardsDiv = nextPlayerDiv.querySelector('.stat-cards');
      const cardCount = cardsDiv ? Number(cardsDiv.textContent.split(':')[1].trim()) : 0;
      if (cardCount > 0) {
        resetTurnState(nextIdx, gameRules, window.aiData);
      }
    }
    return true;
  }
  
  return false;
}

function loadCustomization() {
  let suitColors = {
    diamonds: { symbol: '#ffff5c', background: '#bbb', outline: '#444' },
    clubs: { symbol: '#00e9f1', background: '#bbb', outline: '#444' },
    hearts: { symbol: '#e97311', background: '#bbb', outline: '#444' },
    spades: { symbol: '#01ff05', background: '#bbb', outline: '#444' },
    stars: { symbol: 'white', background: '#bbb', outline: '#444' }
  };
  
  let backColors = {
    center: '#f9d71c',
    edge1: '#e39e13',
    edge2: '#cf7518',
    edge3: '#a05108',
    outline: '#3a2e01',
    edgeWidth: 6
  };
  
  let suitSize = 90;
  let rankSize = 65;
  
  try {
    const ccStr = document.cookie.split('; ').find(row => row.startsWith('cardCustom='));
    if (ccStr) {
      const cc = JSON.parse(decodeURIComponent(ccStr.split('=')[1]));
      
      if (cc.suitColors) {
        suitColors = {};
        for (let key in cc.suitColors) {
          const entry = cc.suitColors[key];
          suitColors[key] = {
            symbol: entry.symbol || 'white',
            background: entry.background || '#bbb',
            outline: entry.outline || 'green'
          };
        }
      }
      
      if (cc.backColors) {
        backColors = { ...backColors, ...cc.backColors };
        backColors.edgeWidth = Number(cc.backColors.edgeWidth) || 6;
      }
      
      suitSize = Number(cc.suitSize) || 90;
      rankSize = Number(cc.rankSize) || 65;
    }
  } catch (e) {
    console.warn("Failed to parse cardCustom cookie", e);
  }
  
  return { suitColors, backColors, suitSize, rankSize };
}
