// Pure game logic - no DOM, no state mutations

export const CONTRACT_SUB_AREAS = {
  1: ['Set 1', 'Set 2'],
  2: ['Set 1', 'Run 1'],
  3: ['Run 1', 'Run 2'],
  4: ['Set 1', 'Set 2', 'Set 3'],
  5: ['Set 1', 'Set 2', 'Run 1'],
  6: ['Set 1', 'Run 1', 'Run 2'],
  7: ['Run 1', 'Run 2', 'Run 3']
};

export const ROUND_CONTRACTS = [
  "2 Sets", "1 Set + 1 Run", "2 Runs", "3 Sets",
  "2 Sets + 1 Run", "1 Set + 2 Runs", "3 Runs"
];

export function isWild(card, gameRules) {
  if (!gameRules?.wildsEnabled) return false;
  const type = (gameRules.wildType || 'classic').toLowerCase();
  
  if (type === 'classic') {
    return card.rank === '3' && (card.suit === '♦' || card.suit === '♥');
  }
  if (type === 'extra') {
    return card.rank === '3' && (card.suit === '♦' || card.suit === '♥' || card.suit === '★');
  }
  if (type === 'joker') {
    return card.rank === 'W';
  }
  return false;
}

export function isValidSet(cards, gameRules) {
  const wildCnt = cards.filter(c => isWild(c, gameRules)).length;
  const nonWild = cards.filter(c => !isWild(c, gameRules));
  
  if (nonWild.length === 0) return wildCnt >= 3;
  
  const distinctRanks = [...new Set(nonWild.map(c => c.rank))];
  if (distinctRanks.length > 1) return false;
  
  const needed = Math.max(0, 3 - nonWild.length);
  return wildCnt >= needed;
}

export function isValidRun(cards, gameRules) {
  const rankOrder = ['A','2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const rankValues = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, 
                      '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  
  const wildCnt = cards.filter(c => isWild(c, gameRules)).length;
  const nonWild = cards.filter(c => !isWild(c, gameRules));
  
  const totalLen = nonWild.length + wildCnt;
  if (totalLen < 4) return false;
  if (nonWild.length === 0) return wildCnt >= 4;
  
  const distinctSuits = [...new Set(nonWild.map(c => c.suit))];
  if (distinctSuits.length > 1) return false;
  const runSuit = distinctSuits[0];
  
  const wrapAround = gameRules?.wrapAround ?? false;
  
  if (wrapAround) {
    const extendedRankOrder = ['A','2','3','4','5','6','7','8','9','10','J','Q','K','A','2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const maxStart = extendedRankOrder.length - totalLen;
    
    const matchesSequence = (seq) => {
      let usedWilds = 0;
      for (let i = 0; i < cards.length; ++i) {
        const card = cards[i];
        if (isWild(card, gameRules)) { usedWilds++; continue; }
        if (card.rank !== seq[i] || card.suit !== runSuit) return false;
      }
      return usedWilds <= wildCnt;
    };
    
    for (let start = 0; start <= maxStart; ++start) {
      const ascSeq = extendedRankOrder.slice(start, start + totalLen);
      if (matchesSequence(ascSeq)) return true;
      const descSeq = [...ascSeq].reverse();
      if (matchesSequence(descSeq)) return true;
    }
    return false;
  }
  
  const maxStart = rankOrder.length - totalLen;
  
  const matchesSequence = (seq) => {
    let usedWilds = 0;
    for (let i = 0; i < cards.length; ++i) {
      const card = cards[i];
      if (isWild(card, gameRules)) { usedWilds++; continue; }
      if (card.rank !== seq[i] || card.suit !== runSuit) return false;
    }
    return usedWilds <= wildCnt;
  };
  
  for (let start = 0; start <= maxStart; ++start) {
    const ascSeq = rankOrder.slice(start, start + totalLen);
    if (matchesSequence(ascSeq)) return true;
    const descSeq = [...ascSeq].reverse();
    if (matchesSequence(descSeq)) return true;
  }
  
  return false;
}

export function calculateCardPoints(card, gameRules) {
  function isWildCard() {
    return isWild(card, gameRules);
  }

  if (isWildCard()) return 20;
  if (card.rank === '3') return 3;
  if (card.rank === 'A') return 15;
  if (['10', 'J', 'Q', 'K'].includes(card.rank)) return 10;
  if ('2 4 5 6 7 8 9'.split(' ').includes(card.rank)) return Number(card.rank);
  if (card.rank === 'W') return 20;
  return 0;
}

export function getContractRequirements(roundNum) {
  const requirements = {
    1: { sets: 2, runs: 0 },
    2: { sets: 1, runs: 1 },
    3: { sets: 0, runs: 2 },
    4: { sets: 3, runs: 0 },
    5: { sets: 2, runs: 1 },
    6: { sets: 1, runs: 2 },
    7: { sets: 0, runs: 3 }
  };
  return requirements[roundNum] || { sets: 0, runs: 0 };
}
