// AI player logic

import { gameState, getMyTurnPlayerIndex } from './gameState.js';
import * as Rules from './gameRules.js';
import * as UI from './tableUI.js';
import * as Actions from './gameActions.js';

export async function executeAITurn(playerIdx, difficulty, gameRules) {
  console.log(`AI Turn: Player ${playerIdx} (${difficulty})`);
  
  const playerDiv = document.getElementById(`player-${playerIdx}`);
  if (!playerDiv || !playerDiv.classList.contains('MyTurn')) return;
  
  // Step 1: Draw
  await aiDrawDecision(playerIdx, gameRules);
  
  // Step 2: Stage cards
  await aiStageCards(playerIdx, gameRules);
  
  console.log('AI Turn complete for Player', playerIdx);
}

export async function aiDrawDecision(playerIdx, gameRules) {
  return new Promise(resolve => {
    setTimeout(() => {
      const player = gameState.players[playerIdx];
      const hand = gameState.hands[player] || [];
      const playerDiv = document.getElementById(`player-${playerIdx}`);
      const hasLaidDown = playerDiv?.classList.contains('HasLaidDown') || false;
      
      let drawSource = 'draw';
      const topDiscard = gameState.discardPile[gameState.discardPile.length - 1];
      
      if (topDiscard) {
        const discardHelps = evaluateDiscardBenefitAI(topDiscard, hand, playerIdx, hasLaidDown, gameRules);
        if (discardHelps) {
          console.log(`AI Player ${playerIdx}: Taking discard ${topDiscard.rank}${topDiscard.suit}`);
          drawSource = 'discard';
        }
      }
      
      Actions.drawCardFrom(drawSource, playerIdx);
      resolve();
    }, 800);
  });
}

export async function aiStageCards(playerIdx, gameRules) {
  return new Promise(resolve => {
    setTimeout(() => {
      const player = gameState.players[playerIdx];
      const hand = gameState.hands[player] || [];
      const currentStaged = gameState.subcontractCards[player] || [];
      
      const allCards = [...hand, ...currentStaged];
      const required = Rules.getContractRequirements(gameState.roundIndex);
      const subAreas = UI.getSubcontractSubAreas(playerIdx);
      
      const optimalStaging = findOptimalStaging(allCards, required, subAreas, gameRules);
      applyStaging(playerIdx, optimalStaging);
      
      const customization = Actions.loadCustomization();
      const handDiv = document.getElementById(`hand-${playerIdx}`);
      if (handDiv) {
        UI.renderCardArray(gameState.hands[player], handDiv, false, playerIdx, 'hand',
          customization.suitColors, customization.backColors, customization.suitSize, customization.rankSize);
      }
      UI.renderAllSubcontractAreas(gameState.players, gameState.subcontractCards, getMyTurnPlayerIndex(),
        customization.suitColors, customization.backColors, customization.suitSize, customization.rankSize);
      
      resolve();
    }, 500);
  });
}

function findOptimalStaging(allCards, required, subAreas, gameRules) {
  const numAreas = subAreas.length;
  const staging = new Array(numAreas).fill(null).map(() => []);
  
  const areaLabels = subAreas.map(sub => {
    const label = (sub.dataset.label || '').toLowerCase();
    return { isSet: label.includes('set'), isRun: label.includes('run') };
  });
  
  const setAreas = areaLabels.map((l, i) => l.isSet ? i : -1).filter(i => i !== -1);
  const runAreas = areaLabels.map((l, i) => l.isRun ? i : -1).filter(i => i !== -1);
  
  const wilds = allCards.filter(c => Rules.isWild(c, gameRules));
  const regularCards = allCards.filter(c => !Rules.isWild(c, gameRules));
  
  const rankValues = { 'A': 15, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, 
                      '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
  
  // Handle runs first (priority)
  runAreas.forEach(areaIdx => {
    const bestRun = findBestRunForArea(regularCards, wilds, gameRules);
    if (bestRun) {
      staging[areaIdx] = bestRun.cards;
      bestRun.cards.forEach(c => {
        if (!Rules.isWild(c, gameRules)) {
          const idx = regularCards.findIndex(rc => rc.id === c.id);
          if (idx !== -1) regularCards.splice(idx, 1);
        }
      });
      for (let i = 0; i < bestRun.wildsUsed; i++) wilds.shift();
    }
  });
  
  // Group by rank for sets
  const rankGroups = {};
  regularCards.forEach(card => {
    if (!rankGroups[card.rank]) rankGroups[card.rank] = [];
    rankGroups[card.rank].push(card);
  });
  
  const setCandidates = [];
  
  Object.entries(rankGroups).forEach(([rank, cards]) => {
    const baseValue = rankValues[rank] || 5;
    
    if (cards.length >= 3) {
      setCandidates.push({
        rank, cards: cards.slice(0, 3), isComplete: true, 
        value: baseValue * 10 + 100, wildsNeeded: 0
      });
    } else if (cards.length === 2 && wilds.length > 0) {
      setCandidates.push({
        rank, cards: [...cards, wilds[0]], isComplete: true,
        value: baseValue * 10 + 90, wildsNeeded: 1
      });
    } else if (cards.length === 2) {
      setCandidates.push({
        rank, cards: [...cards], isComplete: false,
        value: baseValue * 5, wildsNeeded: 0
      });
    } else if (cards.length === 1 && wilds.length >= 2) {
      setCandidates.push({
        rank, cards: [cards[0], wilds[0], wilds[1]], isComplete: true,
        value: baseValue * 10 + 80, wildsNeeded: 2
      });
    }
  });
  
  setCandidates.sort((a, b) => b.value - a.value);
  
  const usedCardIds = new Set();
  
  // Assign complete sets to set areas
  setAreas.forEach(areaIdx => {
    for (let i = 0; i < setCandidates.length; i++) {
      const candidate = setCandidates[i];
      if (candidate.isComplete && !candidate.assigned) {
        const available = candidate.cards.every(c => {
          if (Rules.isWild(c, gameRules)) return true;
          return !usedCardIds.has(c.id);
        });
        
        if (available) {
          staging[areaIdx] = [...candidate.cards];
          candidate.cards.forEach(c => {
            if (!Rules.isWild(c, gameRules)) usedCardIds.add(c.id);
          });
          candidate.assigned = true;
          const wildsUsed = candidate.cards.filter(c => Rules.isWild(c, gameRules)).length;
          for (let w = 0; w < wildsUsed; w++) {
            const usedWild = wilds.shift();
            if (usedWild) usedCardIds.add(usedWild.id);
          }
          break;
        }
      }
    }
  });
  
  // Fill remaining with pairs
  const remainingPairs = setCandidates.filter(c => !c.isComplete && !c.assigned);
  const emptySetAreas = setAreas.filter(idx => staging[idx].length === 0);
  
  emptySetAreas.forEach(areaIdx => {
    if (remainingPairs.length > 0) {
      const pair = remainingPairs.shift();
      staging[areaIdx] = [...pair.cards];
      pair.cards.forEach(c => usedCardIds.add(c.id));
      pair.assigned = true;
    }
  });
  
  // Double up if needed
  if (remainingPairs.length > 0) {
    const firstPairArea = setAreas.find(idx => staging[idx].length === 2);
    if (firstPairArea !== undefined) {
      remainingPairs.forEach(pair => {
        staging[firstPairArea] = [...staging[firstPairArea], ...pair.cards];
        pair.cards.forEach(c => usedCardIds.add(c.id));
      });
    }
  }
  
  return staging;
}

function findBestRunForArea(availableCards, availableWilds, gameRules) {
  const rankValues = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, 
                      '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  
  const bySuit = {};
  availableCards.forEach(c => {
    if (!bySuit[c.suit]) bySuit[c.suit] = [];
    bySuit[c.suit].push(c);
  });
  
  let bestRun = null;
  let bestValue = 0;
  
  Object.entries(bySuit).forEach(([suit, cards]) => {
    if (cards.length < 2) return;
    
    const sorted = cards.sort((a, b) => rankValues[a.rank] - rankValues[b.rank]);
    
    for (let i = 0; i < sorted.length - 1; i++) {
      for (let j = i + 3; j <= sorted.length && j <= i + 6; j++) {
        const subset = sorted.slice(i, j);
        const gaps = countGaps(subset);
        
        if (gaps <= availableWilds.length) {
          const runCards = [...subset];
          const wildsUsed = [];
          
          for (let g = 0; g < gaps && availableWilds.length > 0; g++) {
            wildsUsed.push(availableWilds[g]);
            runCards.push(availableWilds[g]);
          }
          
          if (Rules.isValidRun(runCards, gameRules)) {
            const value = calculateRunValue(runCards, gameRules);
            if (value > bestValue) {
              bestValue = value;
              bestRun = { cards: runCards, wildsUsed: wildsUsed.length };
            }
          }
        }
      }
    }
  });
  
  return bestRun;
}

function countGaps(sortedCards) {
  const rankValues = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, 
                      '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  let gaps = 0;
  for (let i = 0; i < sortedCards.length - 1; i++) {
    const diff = rankValues[sortedCards[i + 1].rank] - rankValues[sortedCards[i].rank];
    gaps += Math.max(0, diff - 1);
  }
  return gaps;
}

function calculateRunValue(cards, gameRules) {
  const rankValues = { 'A': 15, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, 
                      '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
  const lengthBonus = cards.length * 15;
  const nonWilds = cards.filter(c => !Rules.isWild(c, gameRules));
  const avgRank = nonWilds.length > 0 ? 
    nonWilds.reduce((sum, c) => sum + (rankValues[c.rank] || 5), 0) / nonWilds.length : 5;
  return lengthBonus + avgRank;
}

function applyStaging(playerIdx, staging) {
  const player = gameState.players[playerIdx];
  
  // Get all cards
  const currentHand = gameState.hands[player] || [];
  const currentStaged = gameState.subcontractCards[player] || [];
  const allCards = [...currentHand, ...currentStaged];
  
  // Build new hand from cards NOT in staging
  const stagedIds = new Set(staging.flat().map(c => c.id));
  gameState.hands[player] = allCards.filter(c => !stagedIds.has(c.id));
  
  // Build new staging
  gameState.subcontractCards[player] = [];
  staging.forEach((cards, areaIdx) => {
    cards.forEach(card => {
      gameState.subcontractCards[player].push({ ...card, subArea: areaIdx });
    });
  });
}

function evaluateDiscardBenefitAI(card, hand, playerIdx, hasLaidDown, gameRules) {
  const player = gameState.players[playerIdx];
  const contractCards = gameState.subcontractCards[player] || [];
  
  if (hasLaidDown) {
    return canPlayOnExistingContractsAI(card, playerIdx, gameRules);
  } else {
    const required = Rules.getContractRequirements(gameState.roundIndex);
    const status = analyzeContractStatus(contractCards, required, gameRules);
    const hasCompleteContracts = status.needsSets <= 0 && status.needsRuns <= 0;
    
    if (hasCompleteContracts) {
      return canExtendStagedContractsAI(card, contractCards, gameRules);
    } else {
      return wouldCompleteContractRequirementAI(card, contractCards, hand, status, gameRules) ||
             formsNewSetOrRunAI(card, hand, status, gameRules);
    }
  }
}

function analyzeContractStatus(contractCards, required, gameRules) {
  let validSets = 0, validRuns = 0;
  const subAreas = {};
  contractCards.forEach(c => {
    if (!subAreas[c.subArea]) subAreas[c.subArea] = [];
    subAreas[c.subArea].push(c);
  });
  
  Object.values(subAreas).forEach(areaCards => {
    if (areaCards.length >= 3) {
      if (Rules.isValidSet(areaCards, gameRules)) validSets++;
      else if (Rules.isValidRun(areaCards, gameRules)) validRuns++;
    }
  });
  
  return {
    validSets, validRuns,
    needsSets: required.sets - validSets,
    needsRuns: required.runs - validRuns
  };
}

function canExtendStagedContractsAI(card, contractCards, gameRules) {
  const subAreas = {};
  contractCards.forEach(c => {
    if (!subAreas[c.subArea]) subAreas[c.subArea] = [];
    subAreas[c.subArea].push(c);
  });
  
  for (const areaCards of Object.values(subAreas)) {
    const sameRank = areaCards.filter(c => c.rank === card.rank);
    if (sameRank.length >= 2) {
      const testSet = [...areaCards, card];
      if (Rules.isValidSet(testSet, gameRules)) return true;
    }
    
    const nonWilds = areaCards.filter(c => !Rules.isWild(c, gameRules));
    if (nonWilds.length > 0 && card.suit === nonWilds[0].suit) {
      const testRun = [...areaCards, card];
      if (Rules.isValidRun(testRun, gameRules)) {
        const alreadyHave = areaCards.some(c => c.id === card.id);
        if (!alreadyHave) return true;
      }
    }
  }
  return false;
}

function canPlayOnExistingContractsAI(card, playerIdx, gameRules) {
  for (let i = 0; i < gameState.players.length; i++) {
    if (i === playerIdx) continue;
    const otherDiv = document.getElementById(`player-${i}`);
    if (!otherDiv?.classList.contains('HasLaidDown')) continue;
    
    const otherPlayer = gameState.players[i];
    const otherContract = gameState.subcontractCards[otherPlayer] || [];
    
    const subAreas = {};
    otherContract.forEach(c => {
      if (!subAreas[c.subArea]) subAreas[c.subArea] = [];
      subAreas[c.subArea].push(c);
    });
    
    for (const areaCards of Object.values(subAreas)) {
      const sameRank = areaCards.filter(c => c.rank === card.rank);
      if (sameRank.length >= 2) {
        const testSet = [...areaCards, card];
        if (Rules.isValidSet(testSet, gameRules)) return true;
      }
      
      const nonWilds = areaCards.filter(c => !Rules.isWild(c, gameRules));
      if (nonWilds.length > 0 && card.suit === nonWilds[0].suit) {
        const testRun = [...areaCards, card];
        if (Rules.isValidRun(testRun, gameRules)) {
          const alreadyHave = areaCards.some(c => c.id === card.id);
          if (!alreadyHave) return true;
        }
      }
    }
  }
  return false;
}

function wouldCompleteContractRequirementAI(card, contractCards, hand, status, gameRules) {
  const sameRankInContract = contractCards.filter(c => c.rank === card.rank);
  if (sameRankInContract.length === 2 && status.needsSets > 0) return true;
  
  const sameSuitInContract = contractCards.filter(c => c.suit === card.suit);
  if (sameSuitInContract.length >= 3) {
    const testRun = [...sameSuitInContract, card];
    if (Rules.isValidRun(testRun, gameRules) && status.needsRuns > 0) return true;
  }
  
  const sameRankInHand = hand.filter(c => c.rank === card.rank);
  const totalSameRank = sameRankInHand.length + sameRankInContract.length;
  if (totalSameRank >= 2 && status.needsSets > 0) {
    const testSet = [...sameRankInHand, ...sameRankInContract, card];
    if (Rules.isValidSet(testSet, gameRules)) return true;
  }
  
  const sameSuitInHand = hand.filter(c => c.suit === card.suit);
  if (sameSuitInHand.length + sameSuitInContract.length >= 3 && status.needsRuns > 0) {
    const testRun = [...sameSuitInHand, ...sameSuitInContract, card];
    if (Rules.isValidRun(testRun, gameRules)) return true;
  }
  return false;
}

function formsNewSetOrRunAI(card, hand, status, gameRules) {
  if (status.needsSets > 0) {
    const sameRank = hand.filter(c => c.rank === card.rank);
    if (sameRank.length >= 2) {
      const testSet = [...sameRank, card];
      if (Rules.isValidSet(testSet, gameRules)) return true;
    }
  }
  
  if (status.needsRuns > 0) {
    const sameSuit = hand.filter(c => c.suit === card.suit);
    if (sameSuit.length >= 3) {
      const testRun = [...sameSuit, card];
      if (Rules.isValidRun(testRun, gameRules)) return true;
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
