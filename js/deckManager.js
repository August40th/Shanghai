// Deck creation and management - no game state dependencies

const SUIT_ORDER = ['♦', '♥', '♣', '♠', '★'];
const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(playerCount) {
  const customRules = loadRules();
  const extraDeck = customRules.extraDeckChk ? 1 : 0;
  const extraSuit = customRules.extraSuitChk ?? false;
  
  let suits = ['♦', '♥', '♣', '♠'];
  if (extraSuit) suits.push('★');
  
  let deck = [];
  
  for (let d = 0; d <= extraDeck; d++) {
    suits.forEach(suit => {
      RANK_ORDER.forEach(rank => {
        deck.push({ rank, suit, deckId: d, id: `${rank}${suit}${d}${Math.random().toString(36).substr(2, 9)}` });
      });
    });
  }
  
  // Add jokers if enabled
  if (customRules.wildType === 'joker') {
    deck.push({ rank: 'W', suit: '♥', isJoker: true, id: `W♥${Math.random().toString(36).substr(2, 9)}` });
    deck.push({ rank: 'W', suit: '♠', isJoker: true, id: `W♠${Math.random().toString(36).substr(2, 9)}` });
  }
  
  return shuffle(deck);
}

export function shuffle(cards) {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(deck, playerNames) {
  const hands = {};
  playerNames.forEach(name => {
    hands[name] = [];
  });
  
  // Deal 10 cards to each player
  playerNames.forEach(name => {
    for (let i = 0; i < 10 && deck.length > 0; i++) {
      hands[name].push(deck.pop());
    }
  });
  
  // Discard pile starts with one card
  const discardPile = deck.length > 0 ? [deck.pop()] : [];
  
  return { hands, drawPile: deck, discardPile };
}

export function reshuffle(drawPile, discardPile) {
  if (drawPile.length !== 1 || discardPile.length === 0) {
    return { drawPile, discardPile };
  }
  
  const topDiscard = discardPile[discardPile.length - 1];
  const newDrawPile = shuffle(discardPile.slice(0, -1));
  
  return {
    drawPile: [drawPile[0], ...newDrawPile],
    discardPile: [topDiscard]
  };
}

function loadRules() {
  try {
    const crStr = document.cookie.split('; ').find(row => row.startsWith('customRules='));
    if (!crStr) return {};
    return JSON.parse(decodeURIComponent(crStr.split('=')[1]));
  } catch {
    return {};
  }
}