// Game actions - modifies state, calls UI for rendering

import * as State from './gameState.js';
import * as Rules from './gameRules.js';
import * as UI from './tableUI.js';
import * as Deck from './deckManager.js';

export function drawCardFrom(source, playerIdx) {
  if (playerIdx === undefined) playerIdx = State.getMyTurnPlayerIndex();
  if (playerIdx < 0) return;
  
  if (State.hasDrawn && playerIdx === State.getMyTurnPlayerIndex()) return;
  
  let card = null;
  
  if (source === 'draw') {
    if (State.drawPile && State.drawPile.length === 1) {
      const result = Deck.reshuffle(State.drawPile, State.discardPile);
      State.drawPile = result.drawPile;
      State.discardPile = result.discardPile;
    }
    if (State.drawPile.length === 0) return;
    card = State.drawPile.pop();
  } else if (source === 'discard') {
    if (State.discardPile.length === 0) return;
    card = State.discardPile.pop();
  }
  
  if (!card) return;
  
  State.hands[State.players[playerIdx]].push(card);
  
  if (playerIdx === State.getMyTurnPlayerIndex()) {
    State.hasDrawn = true;
    const playerDiv = document.getElementById(`player-${playerIdx}`);
    if (playerDiv) playerDiv.classList.add('HasDrawn');
  }
  
  UI.renderHands(State.hands, State.players, State.getMyTurnPlayerIndex());
  
  if (source === 'discard') {
    UI.renderDiscardPile(State.discardPile);
  }
}

export async function resetTurnState(newTurnIdx, gameRules, aiData) {
  State.hasDrawn = false;
  
  State.players.forEach((_, i) => {
    const pDiv = document.getElementById(`player-${i}`);
    if (pDiv && pDiv.classList.contains('HasDrawn')) {
      pDiv.classList.remove('HasDrawn');
    }
  });
  
  const oldTurnIdx = State.players.findIndex((_, i) => {
    const el = document.getElementById(`player-${i}`);
    return el?.classList.contains('MyTurn');
  });
  
  State.players.forEach((_p, i) => {
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
  
  UI.renderHands(State.hands, State.players, State.getMyTurnPlayerIndex());
  UI.renderAllSubcontractAreas(State.players, State.subcontractCards, State.getMyTurnPlayerIndex());
}

export function endRound(triggerPlayer, gameRules) {
  if (State.roundFinished) return;
  State.roundFinished = true;
  
  const roundScores = [];
  
  State.players.forEach((p, i) => {
    const playerDiv = document.getElementById(`player-${i}`);
    const stats = playerDiv?.querySelector('.stats');
    if (!stats) return;
    
    const heldDiv = stats.querySelector('.stat-held');
    const scoreDiv = stats.querySelector('.stat-score');
    const buysDiv = playerDiv.querySelector('.stat-buys');
    if (buysDiv) buysDiv.textContent = 'Buys: 3';
    
    let heldVal = heldDiv ? Number(heldDiv.textContent.split(':')[1].trim()) : 0;
    
    if (gameRules.finalShanghai && State.Hardwindow && State.roundIndex === 7 && heldVal > 0) {
      heldVal += 100;
    } else if (State.Hardwindow && heldVal > 0) {
      heldVal += 50;
    } else if (State.Softwindow && heldVal > 0) {
      heldVal += 25;
    }
    
    let scoreVal = scoreDiv ? Number(scoreDiv.textContent.split(':')[1].trim()) : 0;
    scoreVal = scoreVal + heldVal;
    if (scoreDiv) scoreDiv.textContent = `Score: ${scoreVal}`;
    
    roundScores.push(heldVal);
  });
  
  State.roundHistory.push({ round: State.roundIndex, scores: roundScores });
  
  UI.showRoundWinnerPopup(triggerPlayer, State.Hardwindow, State.Softwindow, State.roundIndex);
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
  
  const hand = State.hands[State.players[playerIdx]] || [];
  if (hand.length === 0) {
    btn.textContent = 'No Cards to Lay';
    setTimeout(() => (btn.textContent = 'Lay Down'), 1500);
    return;
  }
  
  const subAreas = UI.getSubcontractSubAreas(playerIdx);
  if (!subAreas.length) return;
  
  const player = State.players[playerIdx];
  const flatSubCards = State.subcontractCards[player] || [];
  
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
    if (gameRules.softShanghai) State.Softwindow = true;
    if (gameRules.hardShanghai) State.Hardwindow = true;
  } else if (alreadyLaid === 1) {
    if (gameRules.softShanghai) State.Softwindow = false;
  }
  
  playerDiv.classList.add('HasLaidDown');
  btn.disabled = true;
  btn.textContent = 'Laid Down';
  
  UI.renderAllSubcontractAreas(State.players, State.subcontractCards, State.getMyTurnPlayerIndex());
  
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
    UI.renderHands(State.hands, State.players, State.getMyTurnPlayerIndex());
    UI.renderDiscardPile(State.discardPile);
    UI.renderAllSubcontractAreas(State.players, State.subcontractCards, State.getMyTurnPlayerIndex());
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
    const order = State.players.map((_, i) => i);
    const shifted = order.slice(myTurnIdx + 1).concat(order.slice(0, myTurnIdx + 1));
    buyerIdx = shifted.find(p => otherBuyers.includes(p));
  }
  
  if (buyerIdx === undefined) return;
  drawFromDrawAndDiscard(buyerIdx);
}

export async function showBuyClockPopup(gameRules) {
  const clickOrder = [];
  
  const anyPlayerHasZeroCards = State.players.some((_, i) => {
    const playerDiv = document.getElementById(`player-${i}`);
    if (!playerDiv) return false;
    const cardsDiv = playerDiv.querySelector('.stat-cards');
    if (!cardsDiv) return false;
    const cardCount = Number(cardsDiv.textContent.split(':')[1].trim()) || 0;
    return cardCount === 0;
  });
  
  if (anyPlayerHasZeroCards) return;
  if (gameRules.hardShanghai) State.Hardwindow = false;
  
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
  
  const myTurnIdx = State.players.findIndex((_, i) => {
    const div = document.getElementById(`player-${i}`);
    return div?.classList.contains('MyTurn');
  });
  
  if (myTurnIdx === -1) return;
  
  const buyPlayers = State.players.map((p, i) => {
    const playerDiv = document.getElementById(`player-${i}`);
    const buysDiv = playerDiv?.querySelector('.stat-buys')?.textContent || 'Buys: 0';
    const buyStat = Number(buysDiv.split(':')[1].trim()) || 0;
    const isIdiscarded = playerDiv?.classList.contains('Idiscarded') ?? false;
    
    if (i === myTurnIdx) {
      return { playerIndex: i, name: State.players[i], buyStat, isMyTurn: true, isIdiscarded };
    }
    if (buyStat === 0) return null;
    if (!selfDiscard && isIdiscarded) return null;
    
    return { playerIndex: i, name: State.players[i], buyStat, isMyTurn: false, isIdiscarded };
  }).filter(x => x !== null);
  
  if (buyPlayers.length === 0) return;
  
  return UI.showBuyClockUI(buyPlayers, myTurnIdx, buyTime, optOut, fastBuy, clickOrder, (buyingState) => {
    processBuyResults(buyingState, myTurnIdx, optOut, selfDiscard, fastBuy, clickOrder);
  });
}

// Drag and drop setup - calls UI for visuals, handles game logic
export function setupDragDrop(gameRules) {
  // Clear existing listeners
  State.players.forEach((_, i) => {
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
  
  const myTurnIdx = State.getMyTurnPlayerIndex();
  if (myTurnIdx === -1) return;
  
  const myPlayer = State.players[myTurnIdx];
  const myPlayerDiv = document.getElementById(`player-${myTurnIdx}`);
  const myHasLaidDown = myPlayerDiv?.classList.contains('HasLaidDown');
  
  // Setup hand drag/drop
  const myHandDiv = document.getElementById(`hand-${myTurnIdx}`);
  if (myHandDiv) {
    UI.setupHandDragDrop(myHandDiv, myTurnIdx, myPlayer, myHasLaidDown, gameRules, handleCardMove);
  }
  
  // Setup subcontract drag/drop
  const mySubContracts = UI.getSubcontractSubAreas(myTurnIdx);
  mySubContracts.forEach((sub, targetAreaIdx) => {
    UI.setupSubcontractDragDrop(sub, targetAreaIdx, myTurnIdx, myPlayer, myHasLaidDown, gameRules, handleCardMove);
  });
  
  // Setup discard pile
  const discardPileDiv = document.getElementById('discardPile');
  if (discardPileDiv) {
    UI.setupDiscardDragDrop(discardPileDiv, myTurnIdx, myPlayer, gameRules, handleCardMove);
  }
}

function handleCardMove(data, targetType, targetInfo) {
  // Game logic for card movement
  const { card, from, playerIndex, originIdx } = data;
  const myTurnIdx = State.getMyTurnPlayerIndex();
  const myPlayer = State.players[myTurnIdx];
  
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
  const myHandDiv = document.getElementById(`hand-${State.players.indexOf(player)}`);
  
  if (from === 'hand') {
    const hand = State.hands[player];
    hand.splice(originIdx, 1);
    hand.splice(insertIdx, 0, card);
  } else if (from === 'subcontract') {
    State.subcontractCards[player].splice(originIdx, 1);
    State.hands[player].splice(insertIdx, 0, card);
  }
  
  UI.renderCardArray(State.hands[player], myHandDiv, true, State.players.indexOf(player), 'hand');
  UI.renderAllSubcontractAreas(State.players, State.subcontractCards, State.getMyTurnPlayerIndex());
  return true;
}

function moveToSubcontract(card, from, originIdx, player, targetAreaIdx, insertIdx) {
  const flatArr = State.subcontractCards[player];
  
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
    const handIdx = State.hands[player].findIndex(c => c.id === card.id);
    if (handIdx !== -1) State.hands[player].splice(handIdx, 1);
    card.subArea = targetAreaIdx;
    flatArr.splice(globalInsertIdx, 0, card);
  } else if (from === 'subcontract') {
    flatArr.splice(originIdx, 1);
    card.subArea = targetAreaIdx;
    flatArr.splice(globalInsertIdx, 0, card);
  }
  
  return true;
}

function moveToDiscard(card, from, originIdx, player) {
  const playerDiv = document.getElementById(`player-${State.players.indexOf(player)}`);
  if (!playerDiv?.classList.contains('HasDrawn')) return false;
  
  let removedCard;
  if (from === 'hand') {
    removedCard = State.hands[player].splice(originIdx, 1)[0];
  } else if (from === 'subcontract') {
    removedCard = State.subcontractCards[player].splice(originIdx, 1)[0];
  }
  
  if (removedCard) {
    State.discardPile.push(removedCard);
    updatePlayerStats(gameRules);
    
    const nextIdx = (State.getMyTurnPlayerIndex() + 1) % State.players.length;
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