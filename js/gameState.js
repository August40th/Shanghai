// Centralized state management

export let players = [];
export let contracts = [];
export let hands = {};
export let subcontractCards = {};
export let drawPile = [];
export let discardPile = [];
export let hasDrawn = false;
export let RoundStarter = 0;
export let roundFinished = false;
export let roundIndex = 0;
export let Softwindow = false;
export let Hardwindow = false;
export let scorePopupOpen = false;

export function initPlayerState(playerNames) {
  players = playerNames;
  contracts = new Array(playerNames.length).fill(null);
  subcontractCards = {};
  playerNames.forEach(p => subcontractCards[p] = []);
  hands = {};
  drawPile = [];
  discardPile = [];
  hasDrawn = false;
  roundFinished = false;
  roundIndex = 0;
  Softwindow = false;
  Hardwindow = false;
  scorePopupOpen = false;
}

export function getMyTurnPlayerIndex() {
  return players.findIndex((_, i) => {
    const el = document.getElementById(`player-${i}`);
    return el?.classList.contains('MyTurn');
  });
}

export function updatePlayerStats(gameRules) {
  players.forEach((player, i) => {
    const hand = hands[player] || [];
    const playerDiv = document.getElementById(`player-${i}`);
    if (!playerDiv) return;
    const stats = playerDiv.querySelector('.stats');
    if (!stats) return;
    
    const hasLaidDown = playerDiv.classList.contains('HasLaidDown');
    const subcontract = subcontractCards[player] || [];
    const cardsForStats = hasLaidDown ? hand : hand.concat(subcontract);
    
    let heldPoints = 0;
    cardsForStats.forEach(card => {
      heldPoints += calculateCardPoints(card, gameRules);
    });
    
    const heldPointsDiv = stats.querySelector('.stat-held');
    if (heldPointsDiv) heldPointsDiv.textContent = `Held: ${heldPoints}`;
    
    const cardsDiv = stats.querySelector('.stat-cards');
    if (cardsDiv) cardsDiv.textContent = `Cards: ${cardsForStats.length}`;
    
    if (cardsForStats.length === 0) {
      return { triggerEndRound: true, player };
    }
    return { triggerEndRound: false };
  });
}

export function getCardById(cards, id) {
  return cards.find(c => c.id === id);
}

export function removeCardById(cards, id) {
  return cards.filter(c => c.id !== id);
}

// Import from gameRules to avoid circular dependency
import { calculateCardPoints } from './gameRules.js';