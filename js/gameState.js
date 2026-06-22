// Centralized state management - export mutable container

export const gameState = {
  players: [],
  contracts: [],
  hands: {},
  subcontractCards: {},
  drawPile: [],
  discardPile: [],
  hasDrawn: false,
  RoundStarter: 0,
  roundFinished: false,
  roundIndex: 0,
  Softwindow: false,
  Hardwindow: false,
  scorePopupOpen: false,
  roundHistory: []
};

export function initPlayerState(playerNames) {
  gameState.players = playerNames;
  gameState.contracts = new Array(playerNames.length).fill(null);
  gameState.subcontractCards = {};
  playerNames.forEach(p => gameState.subcontractCards[p] = []);
  gameState.hands = {};
  gameState.drawPile = [];
  gameState.discardPile = [];
  gameState.hasDrawn = false;
  gameState.roundFinished = false;
  gameState.roundIndex = 0;
  gameState.Softwindow = false;
  gameState.Hardwindow = false;
  gameState.scorePopupOpen = false;
  gameState.roundHistory = [];
}

export function getMyTurnPlayerIndex() {
  return gameState.players.findIndex((_, i) => {
    const el = document.getElementById(`player-${i}`);
    return el?.classList.contains('MyTurn');
  });
}

export function updatePlayerStats(gameRules) {
  gameState.players.forEach((player, i) => {
    const hand = gameState.hands[player] || [];
    const playerDiv = document.getElementById(`player-${i}`);
    if (!playerDiv) return;
    const stats = playerDiv.querySelector('.stats');
    if (!stats) return;
    
    const hasLaidDown = playerDiv.classList.contains('HasLaidDown');
    const subcontract = gameState.subcontractCards[player] || [];
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

function calculateCardPoints(card, gameRules) {
  function isWildCard() {
    if (!gameRules?.wildsEnabled) return false;
    const type = (gameRules.wildType || 'classic').toLowerCase();
    if (type === 'classic') return card.rank === '3' && (card.suit === '♦' || card.suit === '♥');
    if (type === 'extra') return card.rank === '3' && (card.suit === '♦' || card.suit === '♥' || card.suit === '★');
    if (type === 'joker') return card.rank === 'W';
    return false;
  }
  
  if (isWildCard()) return 20;
  if (card.rank === '3') return 3;
  if (card.rank === 'A') return 15;
  if (['10', 'J', 'Q', 'K'].includes(card.rank)) return 10;
  if ('2 4 5 6 7 8 9'.split(' ').includes(card.rank)) return Number(card.rank);
  if (card.rank === 'W') return 20;
  return 0;
}
