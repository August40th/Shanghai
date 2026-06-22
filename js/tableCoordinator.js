// Main coordinator - imports all modules and initializes the game

import * as Deck from './deckManager.js';
 import * as Rules from './gameRules.js';
import { gameState, initPlayerState, getMyTurnPlayerIndex } from './gameState.js';
 import * as Actions from './gameActions.js';
 import * as UI from './tableUI.js';

// Game configuration
let gameRules = {};
let aiData = { isAI: [], difficulties: [] };
let suitColors = {};
let backColors = { center: "#f9d71c", edge1: "#e39e13", edge2: "#cf7518", edge3: "#a05108", outline: "#3a2e01", edgeWidth: 6 };
let suitSize = 90;
let rankSize = 65;

// Initialize game
export async function initTable(playerNames) {
  loadCustomization();
  State.initPlayerState(playerNames);
  
  // Load AI data
  const gs = localStorage.getItem('gameSetup');
  try {
    const setup = JSON.parse(gs);
    aiData.isAI = setup.isAI || playerNames.map(() => false);
    aiData.difficulties = setup.difficulties || playerNames.map(() => null);
  } catch {
    aiData.isAI = playerNames.map(() => false);
    aiData.difficulties = playerNames.map(() => null);
  }
  
  // Load rules
  const customRules = loadRules();
  gameRules = {
    extraDeck: customRules.extraDeckChk ? 1 : 0,
    extraSuit: customRules.extraSuitChk ?? false,
    wildType: (customRules.wildType || 'classic').toLowerCase(),
    wildsEnabled: customRules.wildCardsChk ?? true,
    wrapAround: customRules.wrapRunsChk ?? false,
    softShanghai: customRules.softShanghaiChk,
    hardShanghai: customRules.hardShanghaiChk,
    finalShanghai: customRules.finalShanghaiChk
  };
  
  // Create deck and deal
  const deck = Deck.createDeck(playerNames.length);
  const dealt = Deck.dealCards(deck, playerNames);
  
  State.hands = dealt.hands;
  State.drawPile = dealt.drawPile;
  State.discardPile = dealt.discardPile;
  
  // Set up first player
  State.RoundStarter = Math.floor(Math.random() * playerNames.length);
  const firstPlayerDiv = document.getElementById(`player-${State.RoundStarter}`);
  if (firstPlayerDiv) {
    firstPlayerDiv.classList.add('round-starter');
    firstPlayerDiv.classList.add('MyTurn');
  }
  
  State.roundIndex = 1;
  
  // Create UI
  UI.createPlayers(playerNames, Rules.CONTRACT_SUB_AREAS);
  UI.populateContractSubAreas(State.roundIndex, Rules.CONTRACT_SUB_AREAS);
  UI.layoutPiles(document.getElementById('table-container'), document.getElementById('drawPile'), document.getElementById('discardPile'), backColors);
  UI.layoutPlayers(State.players, State.contracts, document.getElementById('table-container'));
  
  // Sort hands
  playerNames.forEach(p => {
    if (State.roundIndex === 1 || State.roundIndex === 4) {
      State.hands[p] = sortByRank(State.hands[p]);
    } else {
      State.hands[p] = sortBySuitThenRank(State.hands[p]);
    }
  });
  
  // Initial render
  UI.renderHands(State.hands, State.players, State.getMyTurnPlayerIndex(), suitColors, backColors, suitSize, rankSize);
  UI.renderDiscardPile(State.discardPile, suitColors, backColors, suitSize, rankSize);
  UI.renderAllSubcontractAreas(State.players, State.subcontractCards, State.getMyTurnPlayerIndex(), suitColors, backColors, suitSize, rankSize);
  
  // Setup event handlers
  setupEventHandlers();
  
  // Start AI if first player is AI
  if (aiData.isAI[State.RoundStarter]) {
    const { executeAITurn } = await import('./aiPlayer.js');
    setTimeout(() => executeAITurn(State.RoundStarter, aiData.difficulties[State.RoundStarter], gameRules), 1500);
  }
}

function setupEventHandlers() {
  // Draw pile click
  const drawPileDiv = document.getElementById('drawPile');
  if (drawPileDiv) {
    drawPileDiv.style.cursor = 'pointer';
    drawPileDiv.addEventListener('click', () => {
      Actions.drawCardFrom('draw', State.RoundStarter);
    });
  }
  
  // Window resize
  window.addEventListener('resize', () => {
    UI.layoutPiles(document.getElementById('table-container'), document.getElementById('drawPile'), document.getElementById('discardPile'), backColors);
    UI.layoutPlayers(State.players, State.contracts, document.getElementById('table-container'));
  });
  
  // Dynamic hover effect
  setupDynamicHover();
}

function setupDynamicHover() {
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
    if (card.dataset.origBorder !== undefined) {
      card.style.border = card.dataset.origBorder;
    }
  });
}

// Helper functions
function sortByRank(cards) {
  const rankOrder = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  return [...cards].sort((a, b) => rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank));
}

function sortBySuitThenRank(cards) {
  const suitOrder = ['♦', '♥', '♣', '♠', '★'];
  const rankOrder = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  
  return [...cards].sort((a, b) => {
    const suitDiff = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
    return suitDiff !== 0 ? suitDiff : rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
  });
}

function loadCustomization() {
  try {
    const ccStr = document.cookie.split('; ').find(row => row.startsWith('cardCustom='));
    if (!ccStr) return;
    
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
  } catch (e) {
    console.warn("Failed to parse cardCustom cookie", e);
  }
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

// Expose initTable to window for HTML access
window.initTable = initTable;
