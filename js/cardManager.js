(() => {
  const OVERLAP_PCT = 0.35;

  let players = [];
  let hands = {};
  let subcontractCards = {}; // cards in subcontract for each player
  let discardPile = [];
  let suitColors = {};
  let backColors = {};
  let suitSize = 90;
  let rankSize = 65;
  
  let dragData = { card: null, from: null, playerIndex: null, originIdx: null };
  function clearDragData() {
    dragData = { card: null, from: null, playerIndex: null, originIdx: null };
  }
  
  function getInsertIndex(container, clientX) {
    const cards = [...container.querySelectorAll('.card')];
    if (cards.length === 0) return 0;
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      const centreX = rect.left + rect.width / 2;
      if (clientX < centreX) {
        return i;
      }
    }
    return cards.length;
  }
  
  function showPlaceholder(container, clientX) {
    const old = container.querySelector('.placeholder');
    if (old) old.remove();
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    placeholder.style.position = 'relative';
    placeholder.style.width = '45px';
    placeholder.style.height = '65px';
    placeholder.style.marginLeft = '-22px';
    placeholder.style.border = '2px dashed #aaa';
    placeholder.style.boxSizing = 'border-box';
    const idx = getInsertIndex(container, clientX);
    const cards = container.querySelectorAll('.card');
    if (idx >= cards.length) {
      container.appendChild(placeholder);
    } else {
      container.insertBefore(placeholder, cards[idx]);
    }
  }

  const discardPileDiv = document.getElementById('discardPile');

  function setData(data) {
    if (data.players) players = data.players;
    if (data.hands) hands = data.hands;
    if (data.subcontractCards) subcontractCards = data.subcontractCards;
    if (data.discardPile) discardPile = data.discardPile;
    if (data.suitColors) suitColors = data.suitColors;
    if (data.backColors) backColors = data.backColors;
    if (data.suitSize) suitSize = data.suitSize;
    if (data.rankSize) rankSize = data.rankSize;
  }

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
  function isRedSuit(suit) { return suit === '♦' || suit === '♥'; }

  function createCardDiv(card, scaleDiscard = false) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.dataset.rank = card.rank;
    cardDiv.dataset.suit = card.suit;

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
  window.createCardDiv = createCardDiv;
  
  function renderCardArray(cardsArr, container, draggable, playerIndex, areaType) {
    container.innerHTML = '';
    if (!cardsArr || cardsArr.length === 0) {
      container.style.width = '';
      return;
    }
    const overlap = Math.floor(45 * OVERLAP_PCT);
    const cardWidth = 45;

    if (areaType === 'discard') {
      for (let i = 0; i < cardsArr.length; i++) {
        const cardDiv = createCardDiv(cardsArr[i], true);
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
      const cardDiv = createCardDiv(card, false);
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
          dragData.card = card;
          dragData.from = areaType;
          dragData.playerIndex = playerIndex;
          dragData.originIdx = idx;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', JSON.stringify({ card, from: areaType, playerIndex, originIdx: idx }));
          const crt = cardDiv.cloneNode(true);
          crt.style.position = 'absolute';
          crt.style.top = '-1000px';
          crt.style.left = '-1000px';
          document.body.appendChild(crt);
          e.dataTransfer.setDragImage(crt, 20, 20);
          setTimeout(() => document.body.removeChild(crt), 0);
        });
        cardDiv.addEventListener('dragend', e => {
          clearDragData();
        });
      }

      container.appendChild(cardDiv);
    });
    const width = cardWidth + Math.max(0, cardsArr.length - 1) * (cardWidth - overlap);
    container.style.width = `${Math.ceil(width + 10)}px`;
    container.style.height = '65px';
  }

  function checkPlayerIsMyTurn(playerIndex) {
    const playerDiv = document.getElementById(`player-${playerIndex}`);
    if (!playerDiv) return false;
    return playerDiv.classList.contains('MyTurn');
  }

  function getSubcontractSubAreas(playerIndex) {
    const contractDiv = document.getElementById(`contract-${playerIndex}`);
    if (!contractDiv) return [];
    return Array.from(contractDiv.querySelectorAll('.contract-subarea'));
  }
  
  function isWild(card) {
    const rules = window.gameRules || {};
    if (!rules.wildsEnabled) return false;

    const type = (rules.wildType || "classic").toLowerCase();

    if (type === "classic")
      return card.rank === "3" && (card.suit === "♦" || card.suit === "♥");

    if (type === "extra")
      return (
        card.rank === "3" &&
        (card.suit === "♦" || card.suit === "♥" || card.suit === "★")
      );

    if (type === "joker")
      return card.rank === "W" && (card.suit === "♥" || card.suit === "♠");

    return false;
  }

  // ===== NEW: Helper functions for discard extension logic =====
  
  // Check if a card can extend a staged set (making it 4+ cards)
  function canExtendStagedSet(card, playerIdx) {
    const player = players[playerIdx];
    const staged = subcontractCards[player] || [];
    const subAreas = getSubcontractSubAreas(playerIdx);
    
    for (let areaIdx = 0; areaIdx < subAreas.length; areaIdx++) {
      const label = (subAreas[areaIdx].dataset.label || "").toLowerCase();
      if (!label.includes("set")) continue;
      
      const areaCards = staged.filter(c => c.subArea === areaIdx);
      if (areaCards.length < 3) continue;
      
      const setRank = areaCards[0].rank;
      if (card.rank === setRank) {
        const testSet = [...areaCards, card];
        if (window.isValidSet(testSet)) {
          return { type: 'set', areaIdx: areaIdx, canPlay: true };
        }
      }
    }
    return null;
  }

  // Check if a card can extend a staged run (at either end)
  function canExtendStagedRun(card, playerIdx) {
    const player = players[playerIdx];
    const staged = subcontractCards[player] || [];
    const subAreas = getSubcontractSubAreas(playerIdx);
    
    for (let areaIdx = 0; areaIdx < subAreas.length; areaIdx++) {
      const label = (subAreas[areaIdx].dataset.label || "").toLowerCase();
      if (!label.includes("run")) continue;
      
      const areaCards = staged.filter(c => c.subArea === areaIdx);
      if (areaCards.length < 3) continue;
      
      const rankValues = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, 
                          '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
      
      const sorted = areaCards.slice().sort((a, b) => {
        const va = isWild(a) ? -1 : (rankValues[a.rank] || 0);
        const vb = isWild(b) ? -1 : (rankValues[b.rank] || 0);
        return va - vb;
      });
      
      const nonWilds = sorted.filter(c => !isWild(c));
      if (nonWilds.length === 0) continue;
      
      const lowCard = nonWilds[0];
      const highCard = nonWilds[nonWilds.length - 1];
      const lowVal = rankValues[lowCard.rank];
      const highVal = rankValues[highCard.rank];
      const cardVal = rankValues[card.rank];
      
      if (card.suit === lowCard.suit) {
        if (cardVal === lowVal - 1 || cardVal === highVal + 1) {
          return { type: 'run', areaIdx: areaIdx, canPlay: true };
        }
      }
    }
    return null;
  }

  // Check if a card can be played on any laid-down player's contracts
  function canPlayOnExistingContracts(card, myIdx) {
    for (let i = 0; i < players.length; i++) {
      const playerDiv = document.getElementById(`player-${i}`);
      if (!playerDiv?.classList.contains("HasLaidDown")) continue;
      
      const subAreas = getSubcontractSubAreas(i);
      for (let areaIdx = 0; areaIdx < subAreas.length; areaIdx++) {
        const sub = subAreas[areaIdx];
        const label = (sub.dataset.label || "").toLowerCase();
        const owner = players[i];
        const flatArr = subcontractCards[owner] || [];
        const areaCards = flatArr.filter(c => c.subArea === areaIdx);
        
        if (label.includes("set")) {
          const testSet = [...areaCards, card];
          if (window.isValidSet(testSet)) {
            return { playerIdx: i, areaIdx: areaIdx, type: 'set' };
          }
        }
        
        if (label.includes("run")) {
          const rankValues = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, 
                            '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
          const nonWilds = areaCards.filter(c => !isWild(c));
          if (nonWilds.length > 0 && card.suit === nonWilds[0].suit) {
            const sorted = nonWilds.sort((a, b) => rankValues[a.rank] - rankValues[b.rank]);
            const lowVal = rankValues[sorted[0].rank];
            const highVal = rankValues[sorted[sorted.length - 1].rank];
            const cardVal = rankValues[card.rank];
            
            if (cardVal === lowVal - 1 || cardVal === highVal + 1) {
              return { playerIdx: i, areaIdx: areaIdx, type: 'run' };
            }
          }
        }
      }
    }
    return null;
  }

  // Get current round requirements from gameRules
  function getRoundRequirements() {
    const rules = window.gameRules || {};
    const round = window.currentRound || 1;
    const contracts = rules.contracts || [];
    return contracts[round - 1] || [];
  }

  // Check if player has staged all required contracts
  function hasCompleteStagedContracts(playerIdx) {
    const requirements = getRoundRequirements();
    if (!requirements || requirements.length === 0) return false;
    
    const player = players[playerIdx];
    const staged = subcontractCards[player] || [];
    const subAreas = getSubcontractSubAreas(playerIdx);
    
    let setsComplete = 0;
    let runsComplete = 0;
    
    for (let areaIdx = 0; areaIdx < subAreas.length; areaIdx++) {
      const label = (subAreas[areaIdx].dataset.label || "").toLowerCase();
      const areaCards = staged.filter(c => c.subArea === areaIdx);
      
      if (label.includes("set") && areaCards.length >= 3 && window.isValidSet(areaCards)) {
        setsComplete++;
      } else if (label.includes("run") && areaCards.length >= 3 && window.isValidRun(areaCards)) {
        runsComplete++;
      }
    }
    
    const requiredSets = requirements.filter(r => r.type === 'set').length;
    const requiredRuns = requirements.filter(r => r.type === 'run').length;
    
    return setsComplete >= requiredSets && runsComplete >= requiredRuns;
  }

  // Update discard pile visual to indicate if top card is playable
  function updateDiscardPlayableIndicator() {
    if (!discardPileDiv) return;
    discardPileDiv.classList.remove('playable-discard');
    
    const playerIdx = window.getMyTurnPlayerIndex ? window.getMyTurnPlayerIndex() : -1;
    if (playerIdx === -1) return;
    
    const playerDiv = document.getElementById(`player-${playerIdx}`);
    if (!playerDiv?.classList.contains("HasDrawn")) return;
    
    if (discardPile.length === 0) return;
    const topCard = discardPile[discardPile.length - 1];
    
    const myHasLaidDown = playerDiv.classList.contains("HasLaidDown");
    let isPlayable = false;
    
    if (myHasLaidDown) {
      isPlayable = !!canPlayOnExistingContracts(topCard, playerIdx);
    } else {
      const hasComplete = hasCompleteStagedContracts(playerIdx);
      if (hasComplete) {
        isPlayable = !!canExtendStagedSet(topCard, playerIdx) || 
                     !!canExtendStagedRun(topCard, playerIdx);
      }
    }
    
    if (isPlayable) {
      discardPileDiv.classList.add('playable-discard');
      discardPileDiv.title = "Click to draw - extends your contracts!";
    } else {
      discardPileDiv.title = "Discard pile";
    }
  }

  function tryWildSwap(data, subAreaCards, wildIndices, subAreaIdx, label, myPlayer, hasLaidDown, owner) {
    if (isWild(data.card) && isWild(subAreaCards[wildIdx])) return;
    for (const wildIdx of wildIndices) {
      const wildCard = subAreaCards[wildIdx];
      if (
        (label.includes("set") && window.isValidSet(replaceAt(subAreaCards, wildIdx, data.card))) ||
        (label.includes("run") && window.isValidRun(replaceAt(subAreaCards, wildIdx, data.card)))
      ) {
        const flatSubs = subcontractCards[owner];
        let countInArea = -1,
          globalWildIdx = -1;
        for (let i = 0; i < flatSubs.length; i++) {
          if (flatSubs[i].subArea === subAreaIdx) countInArea++;
          if (countInArea === wildIdx) {
            globalWildIdx = i;
            break;
          }
        }
        if (globalWildIdx === -1) return false;

        const hand = hands[myPlayer];
        if (!hand) return false;

        hand.splice(data.originIdx, 1);
        hand.push(wildCard);

        flatSubs.splice(globalWildIdx, 1, Object.assign({}, data.card, { subArea: subAreaIdx }));

        const swaps = wildSwaps.get(myPlayer) || [];
        swaps.push({
          subArea: subAreaIdx,
          wildCardIndex: globalWildIdx,
          wildCard: wildCard,
          swapCard: data.card
        });
        wildSwaps.set(myPlayer, swaps);

        return true;
      }
    }
    return false;
  }
  function replaceAt(arr, idx, element) {
    const copy = arr.slice();
    copy[idx] = element;
    return copy;
  }

  function cancelWildSwaps() {
    const myTurnIdx = window.getMyTurnPlayerIndex();
    if (myTurnIdx === -1) return;
    const myPlayer = players[myTurnIdx];
    const swaps = wildSwaps.get(myPlayer);
    if (!swaps || swaps.length === 0) return;

    const hasLaidDown = (() => {
      const pDiv = document.getElementById(`player-${myTurnIdx}`);
      return pDiv?.classList.contains("HasLaidDown");
    })();

    const wildSwapSetting = getWildSwapSetting();

    if (!hasLaidDown && (wildSwapSetting === "pre" || wildSwapSetting === "post")) {
      const flatSubs = subcontractCards[myPlayer];
      const hand = hands[myPlayer];

      swaps.forEach(({ subArea, wildCardIndex, wildCard, swapCard }) => {
        if (flatSubs[wildCardIndex]) flatSubs[wildCardIndex] = wildCard;
        hand.push(swapCard);
      });

      wildSwaps.delete(myPlayer);

      const handDiv = document.getElementById(`hand-${myTurnIdx}`);
      if (handDiv) renderCardArray(hand, handDiv, true, myTurnIdx, "hand");
      renderAllSubcontractAreas();
    }
  }

  function confirmWildSwaps() {
    const myTurnIdx = window.getMyTurnPlayerIndex();
    if (myTurnIdx === -1) return;
    const myPlayer = players[myTurnIdx];
    wildSwaps.delete(myPlayer);
  }

  function getWildSwapSetting() {
    try {
      const cookieStr = document.cookie.split("; ").find(row => row.startsWith("customRules="));
      if (!cookieStr) return "off";
      const customRules = JSON.parse(decodeURIComponent(cookieStr.split("=")[1]));
      return (customRules.wildSwap || "off").toLowerCase();
    } catch {
      return "off";
    }
  }

  function setupDragDrop() {
    players.forEach((_, i) => {
      const handDiv = document.getElementById(`hand-${i}`);
      if (handDiv) {
        handDiv.ondragover = null;
        handDiv.ondrop = null;
        handDiv.ondragenter = null;
        handDiv.ondragleave = null;
      }
      const subAreas = getSubcontractSubAreas(i);
      subAreas.forEach(sub => {
        sub.ondragover = null;
        sub.ondrop = null;
        sub.ondragenter = null;
        sub.ondragleave = null;
      });
    });
  
    const myTurnIdx = window.getMyTurnPlayerIndex();
    if (myTurnIdx === -1) return;
    const myPlayer = players[myTurnIdx];
    const myPlayerDiv = document.getElementById(`player-${myTurnIdx}`);
    const myHasLaidDown = myPlayerDiv?.classList.contains("HasLaidDown");
    const wildSwapSetting = getWildSwapSetting();
  
    players.forEach((_, idx) => {
      const handDiv = document.getElementById(`hand-${idx}`);
      if (!handDiv) return;
      const isMyTurn = idx === myTurnIdx;
      handDiv.querySelectorAll(".card").forEach((cardDiv, cIdx) => {
        cardDiv.draggable = isMyTurn;
        cardDiv.ondragstart = e => {
          if (!checkPlayerIsMyTurn(idx)) {
            e.preventDefault();
            return;
          }
          const card = hands[players[idx]][cIdx];
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", JSON.stringify({
            card,
            from: "hand",
            playerIndex: idx,
            originIdx: cIdx
          }));
          const crt = cardDiv.cloneNode(true);
          crt.style.position = "absolute";
          crt.style.top = "-1000px";
          crt.style.left = "-1000px";
          document.body.appendChild(crt);
          e.dataTransfer.setDragImage(crt, 20, 20);
          setTimeout(() => document.body.removeChild(crt), 0);
        };
        cardDiv.ondragend = () => {};
      });
    });
  
    const mySubContracts = getSubcontractSubAreas(myTurnIdx);
    mySubContracts.forEach((sub, areaIdx) => {
      const container = sub.lastChild;
      if (!container) return;
      container.querySelectorAll(".card").forEach((cardDiv, cIdx) => {
        cardDiv.draggable = !myHasLaidDown;
        if (!myHasLaidDown) {
          cardDiv.ondragstart = e => {
            if (!checkPlayerIsMyTurn(myTurnIdx)) {
              e.preventDefault();
              return;
            }
            const flatSub = subcontractCards[myPlayer];
            let count = -1, foundIdx = -1;
            for (let i = 0; i < flatSub.length; i++) {
              if (flatSub[i].subArea === areaIdx) count++;
              if (count === cIdx) {
                foundIdx = i;
                break;
              }
            }
            if (foundIdx === -1) {
              e.preventDefault();
              return;
            }
            const card = flatSub[foundIdx];
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", JSON.stringify({
              card,
              from: "subcontract",
              playerIndex: myTurnIdx,
              originIdx: foundIdx,
              subArea: areaIdx
            }));
            const crt = cardDiv.cloneNode(true);
            crt.style.position = "absolute";
            crt.style.top = "-1000px";
            crt.style.left = "-1000px";
            document.body.appendChild(crt);
            e.dataTransfer.setDragImage(crt, 20, 20);
            setTimeout(() => document.body.removeChild(crt), 0);
          };
        } else {
          cardDiv.ondragstart = null;
        }
      });
    });
  
    const myHandDiv = document.getElementById(`hand-${myTurnIdx}`);
    if (myHandDiv) {
      myHandDiv.ondragover = e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        myHandDiv.classList.add("drop-target");
      };
      myHandDiv.ondragleave = () => myHandDiv.classList.remove("drop-target");
      myHandDiv.ondrop = e => {
        e.preventDefault();
        myHandDiv.classList.remove("drop-target");
        const raw = e.dataTransfer.getData("text/plain");
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.playerIndex !== myTurnIdx) return;
        const insertIdx = getInsertIndex(myHandDiv, e.clientX);
        if (data.from === "hand") {
          hands[myPlayer].splice(data.originIdx, 1);
          hands[myPlayer].splice(insertIdx, 0, data.card);
        } else if (data.from === "subcontract") {
          if (myHasLaidDown) return;
          subcontractCards[myPlayer].splice(data.originIdx, 1);
          hands[myPlayer].splice(insertIdx, 0, data.card);
        } else return;
        renderCardArray(hands[myPlayer], myHandDiv, true, myTurnIdx, "hand");
        renderAllSubcontractAreas();
        window.validateLayDown(myTurnIdx);
      };
    }
  
    mySubContracts.forEach((sub, targetAreaIdx) => {
      sub.ondragover = e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        sub.classList.add("drop-target");
      };
      sub.ondragleave = () => sub.classList.remove("drop-target");
      sub.ondrop = e => {
        e.preventDefault();
        sub.classList.remove("drop-target");
        if (myHasLaidDown) return;
        const raw = e.dataTransfer.getData("text/plain");
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data.card) return;
        if (data.playerIndex !== myTurnIdx) return;
        const owner = myPlayer;
        const flatArr = subcontractCards[owner];
        const insertIdxInArea = getInsertIndex(sub.lastChild, e.clientX);
  
        let globalInsertIdx = -1,
            lastIdx = -1,
            countInArea = 0;
        for (let i = 0; i < flatArr.length; i++) {
          if (flatArr[i].subArea === targetAreaIdx) {
            if (countInArea === insertIdxInArea) {
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
  
        if (data.from === "hand") {
          hands[myPlayer].splice(data.originIdx, 1);
          data.card.subArea = targetAreaIdx;
          flatArr.splice(globalInsertIdx, 0, data.card);
        } else if (data.from === "subcontract") {
          flatArr.splice(data.originIdx, 1);
          data.card.subArea = targetAreaIdx;
          flatArr.splice(globalInsertIdx, 0, data.card);
        } else return;
  
        renderCardArray(hands[myPlayer], myHandDiv, true, myTurnIdx, "hand");
        renderAllSubcontractAreas();
        window.validateLayDown(myTurnIdx);
      };
    });
  
    players.forEach((p, playerIdx) => {
      const playerDiv = document.getElementById(`player-${playerIdx}`);
      if (!playerDiv?.classList.contains("HasLaidDown")) return;
      const subAreas = getSubcontractSubAreas(playerIdx);
      subAreas.forEach((sub, subAreaIdx) => {
        sub.ondragover = e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          sub.classList.add("drop-target");
        };
        sub.ondragleave = () => sub.classList.remove("drop-target");
        sub.ondrop = e => {
          e.preventDefault();
          sub.classList.remove("drop-target");
          const raw = e.dataTransfer.getData("text/plain");
          if (!raw) return;
          const data = JSON.parse(raw);
          if (!data.card) return;
          if (data.playerIndex !== myTurnIdx) return;
          if (data.from !== "hand") return;
  
          const owner = players[playerIdx];
          const flatArr = subcontractCards[owner];
          const targetContainer = sub.lastChild;
          if (!targetContainer) return;
          const insertIdxInArea = getInsertIndex(targetContainer, e.clientX);
  
          let globalInsertIdx = -1,
              seenInArea = 0;
          for(let i=0; i < flatArr.length; i++) {
            if(flatArr[i].subArea === subAreaIdx) {
              if(seenInArea === insertIdxInArea) {
                globalInsertIdx = i;
                break;
              }
              seenInArea++;
            }
          }
          if(globalInsertIdx === -1) {
            for(let i=flatArr.length - 1; i >= 0; i--) {
              if(flatArr[i].subArea === subAreaIdx){
                globalInsertIdx = i + 1;
                break;
              }
            }
            if(globalInsertIdx === -1) globalInsertIdx = 0;
          }
          const subAreaCards = flatArr.filter(c => c.subArea === subAreaIdx);
          const wildIndices = subAreaCards.map((c, idx) => isWild(c) ? idx : -1).filter(i => i !== -1);
  
          const allowWildSwap =
            wildSwapSetting === "post"
            || (wildSwapSetting === "pre" && !myHasLaidDown);
  
          if (allowWildSwap && wildIndices.length > 0) {
            for (const wildIdx of wildIndices) {
              const wildCard = subAreaCards[wildIdx];
              const candidateCards = subAreaCards.slice();
              candidateCards[wildIdx] = data.card;
  
              const label = (sub.dataset.label || "").toLowerCase();
              const valid = (label.includes("set") && window.isValidSet(candidateCards)) ||
                            (label.includes("run") && window.isValidRun(candidateCards));
  
              if(valid){
                let countInArea = -1, globalWildIdx = -1;
                for(let i=0; i < flatArr.length; i++){
                  if(flatArr[i].subArea === subAreaIdx) countInArea++;
                  if(countInArea === wildIdx){
                    globalWildIdx = i;
                    break;
                  }
                }
                if(globalWildIdx === -1) return;
  
                hands[myPlayer].splice(data.originIdx, 1);
                hands[myPlayer].push(wildCard);
  
                flatArr.splice(globalWildIdx, 1, Object.assign({}, data.card, {subArea: subAreaIdx}));
  
                renderAllSubcontractAreas();
                cardManager.renderCardArray(hands[myPlayer], myHandDiv, true, myTurnIdx, "hand");
                window.validateLayDown(myTurnIdx);
                const cardsInArea = flatArr.filter(c => c.subArea === subAreaIdx);
                cardManager.renderCardArray(
                    cardsInArea,
                    targetContainer,
                    !document.getElementById(`player-${myTurnIdx}`).classList.contains('HasLaidDown'),
                    myTurnIdx,
                    'subcontract'
                );
                return;
              }
            }
          }
  
          if(!myHasLaidDown && playerIdx !== myTurnIdx) {
            return;
          }
  
          const simulatedArea = subAreaCards.slice();
          simulatedArea.splice(insertIdxInArea, 0, Object.assign({}, data.card, {subArea: subAreaIdx}));
  
          const label = (sub.dataset.label || "").toLowerCase();
          const valid = (label.includes("set") && window.isValidSet(simulatedArea)) ||
                        (label.includes("run") && window.isValidRun(simulatedArea));
  
          if (!valid) {
            sub.style.border = "2px solid red";
            setTimeout(() => { sub.style.border = ""; }, 800);
            return;
          }
  
          // Do the drop
          hands[myPlayer].splice(data.originIdx, 1);
          data.card.subArea = subAreaIdx;
          flatArr.splice(globalInsertIdx, 0, data.card);

          // >>>>> END ROUND TRIGGER: Check if this was the player's final card <<<<<
          const isFinalCard = hands[myPlayer].length === 0;
  
          renderCardArray(hands[myPlayer], myHandDiv, true, myTurnIdx, "hand");
          renderAllSubcontractAreas();
          window.validateLayDown(myTurnIdx);

          // >>>>> END ROUND TRIGGER: If final card, end the round <<<<<
          if (isFinalCard && typeof window.endRound === "function") {
            window.endRound(myPlayer);
          }
        };
      });
    });
  
    if (!discardPileDiv) return;
    discardPileDiv.ondragover = e => {
      if (!myPlayerDiv?.classList.contains("HasDrawn")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      discardPileDiv.classList.add("drop-target");
    };
    discardPileDiv.ondragleave = () => discardPileDiv.classList.remove("drop-target");
    discardPileDiv.ondrop = e => {
      e.preventDefault();
      discardPileDiv.classList.remove("drop-target");
      if (!myPlayerDiv?.classList.contains("HasDrawn")) return;
      const raw = e.dataTransfer.getData("text/plain");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data.card) return;
      if (data.playerIndex !== myTurnIdx) return;
      let card;
      if (data.from === "hand") {
        card = hands[myPlayer].splice(data.originIdx, 1)[0];
      } else if (data.from === "subcontract") {
        card = subcontractCards[myPlayer].splice(data.originIdx, 1)[0];
      } else return;
      discardPile.push(card);
      renderCardArray(hands[myPlayer], myHandDiv, true, myTurnIdx, "hand");
      renderAllSubcontractAreas();
      renderDiscardPile();
      if (typeof window.updatePlayerStats === "function") {
        window.updatePlayerStats(hands);
      }
      const nextIdx = (myTurnIdx + 1) % players.length;
      const nextPlayerDiv = document.getElementById(`player-${nextIdx}`);
      if (nextPlayerDiv) {
        const cardsDiv = nextPlayerDiv.querySelector(".stat-cards");
        const cardCount = cardsDiv ? Number(cardsDiv.textContent.split(":")[1].trim()) : 0;
        if (cardCount > 0) {
          if (typeof window.resetTurnState === "function") {
            window.resetTurnState(nextIdx);
          }
        }
      }
    };
    
    // ===== ENHANCED: Discard pile click handler with extension logic =====
    discardPileDiv.onclick = e => {
      if (e.defaultPrevented) return;
      const playerIdx = window.getMyTurnPlayerIndex ? window.getMyTurnPlayerIndex() : -1;
      if (playerIdx === -1) return;
      
      const playerDiv = document.getElementById(`player-${playerIdx}`);
      if (!playerDiv?.classList.contains("HasDrawn")) {
        // Haven't drawn yet - normal draw logic
        if (typeof window.drawCardFrom === "function") {
          window.drawCardFrom("discard", playerIdx);
        }
        return;
      }
      
      // Already drawn - check if we can play from discard
      if (discardPile.length === 0) return;
      const topCard = discardPile[discardPile.length - 1];
      const myHasLaidDown = playerDiv.classList.contains("HasLaidDown");
      const myPlayer = players[playerIdx];
      
      // Case 1: Already laid down - can draw if playable on existing contracts
      if (myHasLaidDown) {
        const playTarget = canPlayOnExistingContracts(topCard, playerIdx);
        if (playTarget) {
          if (typeof window.drawCardFrom === "function") {
            window.drawCardFrom("discard", playerIdx);
          }
        }
        return;
      }
      
      // Case 2: Not laid down yet
      const hasComplete = hasCompleteStagedContracts(playerIdx);
      
      if (hasComplete) {
        // Can draw if card extends any staged contract
        const setExtend = canExtendStagedSet(topCard, playerIdx);
        const runExtend = canExtendStagedRun(topCard, playerIdx);
        
        if (setExtend || runExtend) {
          if (typeof window.drawCardFrom === "function") {
            window.drawCardFrom("discard", playerIdx);
          }
        }
        return;
      }
    };
    
    // Update the playable indicator after setting up
    updateDiscardPlayableIndicator();
  }

  function renderAllSubcontractAreas() {
    const myTurnIdx = players.findIndex((_, i) => checkPlayerIsMyTurn(i));
    if (myTurnIdx === -1) return;
  
    const subAreas = getSubcontractSubAreas(myTurnIdx);
    if (!subAreas.length) return;
  
    subAreas.forEach(sub => {
      while (sub.childNodes.length > 2) sub.removeChild(sub.lastChild);
      const container = document.createElement('div');
      container.style.position = 'relative';
      container.style.height = '65px';
      container.style.display = 'inline-flex';
      sub.appendChild(container);
    });
  
    const owner = players[myTurnIdx];
    const cards = subcontractCards[owner] || [];
  
    const overlap = Math.floor(45 * OVERLAP_PCT);
    const cardWidth = 45;
  
    subAreas.forEach((sub, areaIdx) => {
      const container = sub.lastChild;
      const cardsForArea = cards.filter(c => c.subArea === areaIdx);
  
      cardsForArea.forEach((card, localIdx) => {
        const cardDiv = createCardDiv(card, false);
        cardDiv.style.position = 'relative';
        cardDiv.style.width = `${cardWidth}px`;
        cardDiv.style.height = '65px';
        cardDiv.style.marginLeft = localIdx === 0 ? '0px' : `-${overlap}px`;
        cardDiv.style.zIndex = cardsForArea.length - localIdx;
  
        const playerHasLaid = document
          .getElementById(`player-${myTurnIdx}`)
          .classList.contains('HasLaidDown');
  
        if (!playerHasLaid) {
          cardDiv.draggable = true;
          cardDiv.addEventListener('dragstart', e => {
            if (!checkPlayerIsMyTurn(myTurnIdx)) {
              e.preventDefault();
              return;
            }
            const globalIdx = cards.indexOf(card);
            dragData = {
              card,
              from: 'subcontract',
              playerIndex: myTurnIdx,
              originIdx: globalIdx,
              subArea: areaIdx
            };
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData(
              'text/plain',
              JSON.stringify({
                card,
                from: 'subcontract',
                playerIndex: myTurnIdx,
                originIdx: globalIdx,
                subArea: areaIdx
              })
            );
  
            const crt = cardDiv.cloneNode(true);
            crt.style.position = 'absolute';
            crt.style.top = '-1000px';
            crt.style.left = '-1000px';
            document.body.appendChild(crt);
            e.dataTransfer.setDragImage(crt, 20, 20);
            setTimeout(() => document.body.removeChild(crt), 0);
          });
          cardDiv.addEventListener('dragend', () => {
            dragData = { card: null, from: null, playerIndex: null, originIdx: null, subArea: null };
          });
        }
  
        container.appendChild(cardDiv);
      });
    });
  }

  function renderDiscardPile() {
    if (!discardPileDiv) return;
    discardPileDiv.innerHTML = '';

    if (discardPile.length === 0) {
      discardPileDiv.textContent = 'Discard';
      return;
    }

    const topCard = discardPile[discardPile.length - 1];
    const cardDiv = createCardDiv(topCard, true);
    discardPileDiv.appendChild(cardDiv);
    
    // Update playable indicator after rendering
    updateDiscardPlayableIndicator();
  }

  window.cardManager = {
    setData,
    renderCardArray,
    renderAllSubcontractAreas,
    renderDiscardPile,
    setupDragDrop,
  };
  window.renderDiscardPile = cardManager.renderDiscardPile;
  window.getSubcontractSubAreas = getSubcontractSubAreas;
  window.updateDiscardPlayableIndicator = updateDiscardPlayableIndicator;
})();
