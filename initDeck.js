// initDeck.js
// Handles deck creation and dealing logic for Rummy-style games
// Works standalone or integrated with HTML UI

class initDeck {
  constructor() {
    this.drawPile = [];
    this.discardPile = [];

    // Default card definitions
    this.suits = ["♥", "♦", "♣", "♠"];
    this.ranks = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
    this.extraSuitSymbol = "★";
  }

  // Get rule settings — from HTML if available, otherwise defaults
  getRuleSettings() {
    if (typeof window !== "undefined" && window.gameRules) {
      // Use values from the HTML or global gameRules object
      return {
        extraDeck: window.gameRules.extraDeck ?? 0,
        extraSuit: window.gameRules.extraSuit ?? false,
        wildType: window.gameRules.wildType ?? "classic",
        wildsEnabled: window.gameRules.wildsEnabled ?? true,
      };
    }
    // Default fallback if not connected to HTML
    return {
      extraDeck: 0,
      extraSuit: true,
      wildType: "classic",
      wildsEnabled: true,
    };
  }

  // Create and shuffle the deck
  createDeck(numPlayers = 3) {
    const { extraDeck, extraSuit, wildType, wildsEnabled } = this.getRuleSettings();

    // Determine number of decks
    let decksNeeded = 2;
    if (numPlayers > 3) decksNeeded += Math.floor((numPlayers - 3) / 2);
    decksNeeded += extraDeck;

    // Determine suits
    const suitsToUse = [...this.suits];
    if (extraSuit) suitsToUse.push(this.extraSuitSymbol);

    let allCards = [];

    // Build decks
    for (let i = 0; i < decksNeeded; i++) {
      for (let suit of suitsToUse) {
        for (let rank of this.ranks) {
          allCards.push({ rank, suit });
        }
      }
      // Add Jokers if applicable
      if (wildsEnabled && wildType === "joker") {
        allCards.push({ rank: "W", suit: "♦" });
        allCards.push({ rank: "W", suit: "♥" });
        allCards.push({ rank: "W", suit: "♣" });
        allCards.push({ rank: "W", suit: "♠" });
        if (extraSuit) allCards.push({ rank: "W", suit: "★" });
      }
    }

    this.drawPile = this.shuffle(allCards);
    this.discardPile = [];

    return this.drawPile;
  }

  // Fisher–Yates shuffle
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
  
  reshuffle(drawPile, discardPile) {
    if (drawPile.length > 1) {
      console.warn('More than 1 card in drawpile');
      return;
    }
    // Nothing to reshuffle if there are 0 or 1 cards in the discard pile.
    if (!Array.isArray(discardPile) || discardPile.length <= 1) {
      console.warn('Reshuffle called with insufficient discard cards.');
      return { drawPile, discardPile };
    }
  
    // Keep the top (most recent) discard card.
    const topDiscard = discardPile[discardPile.length - 1];
  
    // All older discards become the pool to shuffle.
    const toShuffle = discardPile.slice(0, -1);
  
    // Empty the discard pile and put the top card back.
    discardPile.length = 0;
    discardPile.push(topDiscard);
  
    // Shuffle the pool using the class's own Fisher–Yates implementation.
    const shuffled = this.shuffle(toShuffle);
  
    // --------------------------------------------------------------
    // Insert the shuffled cards **under** the existing draw‑pile.
    // drawPile is drawn with `pop()`, so we prepend the shuffled cards.
    // --------------------------------------------------------------
    if (!Array.isArray(drawPile)) drawPile = [];
  
    // Prepend – the existing draw‑card(s) stay on top.
    drawPile.unshift(...shuffled);
  
    console.info(`Reshuffled ${shuffled.length} cards back into draw pile.`);
    return { drawPile, discardPile };
  }


  // Deal 10 cards to each player (one at a time)
  dealCards(playerNames = []) {
    // Fallback to default player set if none provided
    if (!playerNames || playerNames.length === 0) {
      const numPlayers = (typeof window !== "undefined" && window.numPlayers) ? window.numPlayers : 3;
      playerNames = Array.from({ length: numPlayers }, (_, i) => `Player ${i + 1}`);
    }

    const hands = {};
    playerNames.forEach(name => hands[name] = []);

    for (let i = 0; i < 10; i++) {
      for (let name of playerNames) {
        const card = this.drawPile.shift();
        if (card) hands[name].push(card);
      }
    }

    return hands;
    
  }
}
// Export for browser and Node compatibility
if (typeof window !== "undefined") {
  window.initDeck = initDeck;
} else if (typeof module !== "undefined") {
  module.exports = initDeck;
}

// --- Quick test block (only runs when not in browser) ---
if (typeof window === "undefined") {
  const initDeck = module.exports;
  const cm = new initDeck();

  // Create deck for 4 players
  const drawPile = cm.createDeck(4);
  console.log(`\nDraw pile created with ${drawPile.length} cards.`);

  // Deal to 4 players
  const hands = cm.dealCards(["Alice", "Bob", "Charlie", "David"]);

  // Print each player's hand
  for (const [player, cards] of Object.entries(hands)) {
    console.log(`\n${player}'s hand (${cards.length} cards):`);
    console.log(cards.map(c => `${c.rank}${c.suit}`).join(" "));
  }

  // Print remaining draw pile size and top 5 cards for reference
  console.log(`\nRemaining draw pile: ${cm.drawPile.length} cards`);
  console.log("Top 5 cards of remaining draw pile:", cm.drawPile.slice(0, 5).map(c => `${c.rank}${c.suit}`).join(" "));
}
