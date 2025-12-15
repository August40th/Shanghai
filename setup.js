// Tabs
const tabs = document.querySelectorAll('.tab-btn');
const contents = {
  summary: document.getElementById('content-summary'),
  custom: document.getElementById('content-custom'),
  players: document.getElementById('content-players'),
  detailed: document.getElementById('content-detailed'),
  cards: document.getElementById('content-cards')
};

// Buying clock
const buyClock=document.getElementById('buyClockRange');
const buyClockValue=document.getElementById('buyClockValue');
function updateBuyClock(){
  buyClockValue.textContent=buyClock.value;
  const pct=(buyClock.value-buyClock.min)/(buyClock.max-buyClock.min)*100;
  buyClock.style.background=`linear-gradient(to right, var(--slider-red) ${pct}%, #555 ${pct}%)`;
}
buyClock.addEventListener('input',updateBuyClock);
buyClock.addEventListener('input', () => { updateSummary(); });
updateBuyClock();

// Summary content update function
function updateSummary() {
  const summaryContent = document.querySelector('#content-summary .summary-content');
  
  // Get current rule states
  const extraDeck = document.getElementById('extraDeckChk').checked;
  const extraSuit = document.getElementById('extraSuitChk').checked;
  const wildCards = document.getElementById('wildCardsChk').checked;
  const wrapRuns = document.getElementById('wrapRunsChk').checked;
  const softShanghai = document.getElementById('softShanghaiChk').checked;
  const hardShanghai = document.getElementById('hardShanghaiChk').checked;
  const finalShanghai = document.getElementById('finalShanghaiChk').checked;
  const wildTypeBtn = document.getElementById('wildTypeBtn');
  const wildSwapBtn = document.getElementById('wildSwapBtn');
  const fastBuyChk = document.getElementById('fastBuyChk').checked;
  const optOutChk = document.getElementById('optOutChk').checked;
  const selfDiscardChk = document.getElementById('selfDiscardChk').checked;

  // Base summary content
  let qsummary = "● 2 decks with 3 players, +1 deck for every 2+ players<br>";
  // Handle extra deck rule
  if (extraDeck) {
    qsummary = qsummary.replace("2 decks with 3 players", "3 decks with 3 players");
  }
  // Handle extra suit
  if (extraSuit) {
    qsummary += "● 5th suit (Stars ★) added to each standard deck<br>";
  }
  qsummary += "● Players are dealt 10 cards each round<br>";
  qsummary += "● On your turn: Draw → Lay Down → Play → Discard<br>";
  qsummary += "● Aim: Collect and <strong>LAY DOWN</strong> required <strong>CONTRACT</strong> of <strong>SETS</strong> and/or <strong>RUNS</strong> each <strong>ROUND</strong><br>";
  qsummary += "● <strong>Sets</strong> are 3+ cards of same rank<br>";
  qsummary += "● <strong>Runs</strong> are 4+ cards of the same suit in sequential order<br>";
  // Handle wrap-around runs
  if (wrapRuns) {
    qsummary += "● <strong>WRAP-AROUND RUNS</strong> Aces may be High <strong>AND</strong> Low *(K-A-2-3 is a valid run)<br>";
  } else {
    qsummary += "● Aces are High <strong>OR</strong> Low *(K-A-2-3 is <strong>NOT</strong> a valid run)<br>";
  }  
  // Handle wild cards
  if (wildCards) {
    // Determine wild card type description
    let wildTypeDesc = "";
    switch(wildTypeBtn.textContent) {
      case "Classic":
        wildTypeDesc = "<strong>(3♦/3♥)</strong>";
        break;
      case "Extra":
        wildTypeDesc = "<strong>(3♦/3♥/3★)</strong>";
        break;
      case "Joker":
        wildTypeDesc = "<strong>(Jokers)</strong>";
        break;
    }
    
    qsummary += `● <strong>WILD CARDS</strong> ${wildTypeDesc}: may be used as <strong>ANY</strong> rank/suit in sets and runs.<br>`;
    
    function updateWildSwapAppearance() {
      wildSwapBtn.classList.toggle('greyed', wildSwapBtn.textContent === 'Off');
    }
    updateWildSwapAppearance();
    
    // Handle wild swap
    if (wildSwapBtn.textContent !== "Off") {
      if (wildSwapBtn.textContent === "Pre") {
        qsummary += "● Players may <strong>SWAP</strong> a played wild card with the card it is standing in place for from his/her hand prior to Laying Down that turn. If valid Lay Down does not happen the swapped cards are returned to their original places<br>";
      } else { // Post
        qsummary += "● Players may <strong>SWAP</strong> a played wild card with the card it is standing in place for from his/her hand<br>";
      }
    }
  }
  
  qsummary += "● Players may <strong>BUY</strong> discarded cards between turns<br>";
   // Handle buying rules
  qsummary += `● Players have <strong>${buyClock.value}s</strong> after a card is discarded to declare a <strong>BUY</strong><br>`;
  
  if (fastBuyChk) {
    if (optOutChk) {
      qsummary += "● 1st person to declare <strong>BUY</strong> gets 1st pick of the card<br>";
    } else {
      qsummary += "● 1st person to declare <strong>BUY MUST</strong> take the card<br>";
    }
  } else { 
      if (optOutChk) {
        qsummary += "● If 2+ players declare a <strong>BUY</strong>, the player who is closest to his/her next turn <strong>MUST</strong> take the card<br>";
      } else {
        qsummary += "● If 2+ players declare a <strong>BUY</strong>, the player who is closest to his/her next turn gets 1st pick of the card<br>";
      }
  }
  if (optOutChk) {
    qsummary += "● Players may <strong>OPT OUT</strong> of a declared buy<br>";
  }
  
  if (selfDiscardChk) {
    qsummary += "● A player may <strong>BUY</strong> his/her own discard, *Good for smaller games<br>";
  }
  
  qsummary += "● <strong>LOWEST</strong> total score after seven rounds <strong>WINS</strong><br>";
  
  // Add Shanghai bonuses
  let shanghaiBonus = "";
  if (softShanghai) shanghaiBonus += "+25 for Soft Shanghai";
  if (hardShanghai) shanghaiBonus += ", +50 for Shanghai";
  if (finalShanghai) shanghaiBonus += ", +100 for Final Shanghai";
  
  if (shanghaiBonus) {
    qsummary += `● Shanghai bonus: ${shanghaiBonus}; to other players' scores`;
  }
  
  summaryContent.innerHTML = qsummary;
}

// Initialize summary
updateSummary();

const tooltipBar = document.getElementById('tooltipBar');

tabs.forEach(t => {
  t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    
    // Hide all content sections
    Object.values(contents).forEach(content => {
      content.style.display = 'none';
    });
    
    // Show the selected content and toggle tooltip visibility
    if (t.id === 'tab-summary') {
      contents.summary.style.display = 'block';
      tooltipBar.style.display = 'none';  // hide tooltip on Quick Summary
    } else if (t.id === 'tab-custom') {
      contents.custom.style.display = 'block';
      tooltipBar.style.display = 'flex';  // hide tooltip on Custom Rules
    } else if (t.id === 'tab-players') {
      contents.players.style.display = 'flex';
      tooltipBar.style.display = 'block'; // show tooltip on Players tab
    } else if (t.id === 'tab-detailed') {
      contents.detailed.style.display = 'block';
      tooltipBar.style.display = 'none';  // hide tooltip on Detailed Rules
    } else if (t.id === 'tab-cards') {
      contents.cards.style.display = 'block';
      tooltipBar.style.display = 'none';  // hide tooltip on Customize Cards
    }
  });
});

// Update summary when rules change
document.querySelectorAll('#content-custom input[type="checkbox"]').forEach(checkbox => {
  checkbox.addEventListener('change', updateSummary);
});

// Update summary when wild type or swap changes
document.getElementById('wildTypeBtn').addEventListener('click', updateSummary);
document.getElementById('wildSwapBtn').addEventListener('click', updateSummary);

// Tooltip
function attachTooltips(){
  document.querySelectorAll('[data-tooltip]').forEach(el=>{
    el.addEventListener('mouseenter',()=>{document.getElementById('tooltipBar').textContent=el.getAttribute('data-tooltip');});
    el.addEventListener('mouseleave',()=>{document.getElementById('tooltipBar').textContent="Hover over a rule name for help.";});
  });
}
attachTooltips();

// Players tab
let numComputers=3;
const playersGrid=document.getElementById('playersGrid');
const humanNameInput=document.getElementById('humanNameInput');
const numCompDisplay=document.getElementById('numCompDisplay');
const decComp=document.getElementById('decComp');
const incComp=document.getElementById('incComp');
const randomizeBtn=document.getElementById('randomizeBtn');
const aiPool=["Alice","Bob","Charlie","David","Erik","Frank","George","Henry","Ivy","Jason","Kerry","Lauren","Mark","Ned","Oscar", "Paul", "Rob", "Tom", "Victor", "Zeb"];
const difficultyTooltips={"Easy":"Evaluates rules and its own hand, cards it has discarded, and last 5 discards in the discard pile","Medium":"Evaluates its own hand, the entire discard pile, plus a 33% chance to maximize the score of the cards played when laying down and playing cards into the play area as to minimize the score of the cards remaining in its hand after discarding.","Hard":"Normal AI with 75% chance to maximize laydown, plus tracks which cards players have taken and discarded to infer which sets/runs other players might be collecting to better evaluate discard choices, the cards remaining in the draw pile, and which cards to buy","Ruthless":"Hard AI with 50% chance to veto another player’s buy if it reasonablly infers that the buyer needs that card to get closer to a complete a run or set he/she is collecting"};

function buildPlayerSlots() {
  // Preserve current names and difficulties
  const existingSlots = document.querySelectorAll('#playersGrid .player-slot');
  const savedNames = [];
  const savedDiffs = [];
  const savedDiffClasses = [];

  existingSlots.forEach(slot => {
    const nameInput = slot.querySelector('input.player-name-input');
    const diffBtn = slot.querySelector('button.difficulty-btn');
    savedNames.push(nameInput ? nameInput.value : "");
    savedDiffs.push(diffBtn ? diffBtn.textContent : "Medium");
    savedDiffClasses.push(diffBtn ? [...diffBtn.classList].filter(c => c !== 'difficulty-btn')[0] || 'medium' : "medium");
  });

  playersGrid.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const slot = document.createElement('div');
    slot.className = 'player-slot';
    if (i >= numComputers) slot.classList.add('inactive');

    // Create input box for name, limited width by CSS (same as slot)
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'player-name-input';
    nameInput.style.width = '100%';
    nameInput.style.boxSizing = 'border-box';
    nameInput.style.background = 'transparent';
    nameInput.style.color = 'white';
    nameInput.style.border = 'none';
    nameInput.style.borderBottom = '1px solid rgba(255, 255, 255, 0.3)';
    nameInput.style.fontWeight = '600';
    nameInput.style.textAlign = 'center';
    nameInput.value = savedNames[i] || `Computer ${i + 1}`;

    // Update saved names on input to persist when rebuilding
    nameInput.addEventListener('input', () => {
      savedNames[i] = nameInput.value;
      saveSettingsToCookies();
    });

    const diffBtn = document.createElement('button');
    diffBtn.className = 'difficulty-btn';
    const diffText = savedDiffs[i] || 'Medium';
    const diffClass = savedDiffClasses[i] || 'medium';
    diffBtn.textContent = diffText;
    diffBtn.classList.add(diffClass);
    diffBtn.setAttribute('data-tooltip', difficultyTooltips[diffText] || difficultyTooltips['Medium']);
    diffBtn.addEventListener('click', () => {
      let idx = ["Easy", "Medium", "Hard", "Ruthless"].indexOf(diffBtn.textContent);
      idx = (idx + 1) % 4;
      diffBtn.textContent = ["Easy", "Medium", "Hard", "Ruthless"][idx];
      ["easy", "medium", "hard", "ruthless"].forEach(c => diffBtn.classList.remove(c));
      diffBtn.classList.add(["easy", "medium", "hard", "ruthless"][idx]);
      diffBtn.setAttribute('data-tooltip', difficultyTooltips[diffBtn.textContent]);
      document.getElementById('tooltipBar').textContent = difficultyTooltips[diffBtn.textContent];
      saveSettingsToCookies(); // save changes immediately
    });

    slot.appendChild(nameInput);
    slot.appendChild(diffBtn);
    playersGrid.appendChild(slot);
  }
  numCompDisplay.textContent = numComputers;
  attachTooltips();
}

decComp.addEventListener('click',()=>{if(numComputers>2){numComputers--;buildPlayerSlots();}});
incComp.addEventListener('click',()=>{if(numComputers<10){numComputers++;buildPlayerSlots();}});
randomizeBtn.addEventListener('click', () => {
  const shuffledNames = aiPool.sort(() => 0.5 - Math.random());
  const slots = document.querySelectorAll('.player-slot');
  slots.forEach((slot, i) => {
    if (i < numComputers) {
      const nameInput = slot.querySelector('input.player-name-input');
      if (nameInput) {
        nameInput.value = shuffledNames[i];
        // Save changes immediately for persistence
        saveSettingsToCookies();
      }
    }
  });
});

buildPlayerSlots();

// Custom Rules
const wildCardsChk=document.getElementById('wildCardsChk');
const wildTypeBtn=document.getElementById('wildTypeBtn');
const wildSwapBtn=document.getElementById('wildSwapBtn');
const wildTypes=['Classic','Extra','Joker']; let wtIndex=0;
const wildSwapStates=['Off','Pre','Post']; let wsIndex=0;
function updateWildButtons(){
  const enabled=wildCardsChk.checked;
  wildTypeBtn.classList.toggle('disabled', !enabled);
  wildSwapBtn.classList.toggle('disabled', !enabled);

  // Remove disabling wildSwapBtn based on wildCardsChk, instead handle appearance below
}
wildCardsChk.addEventListener('change', updateWildButtons);
updateWildButtons();

wildTypeBtn.addEventListener('click', () => {
  if (wildTypeBtn.classList.contains('disabled')) return;
  wtIndex = (wtIndex + 1) % wildTypes.length;
  wildTypeBtn.textContent = wildTypes[wtIndex];
  updateSummary();
});

wildSwapBtn.addEventListener('click', () => {
  if (wildTypeBtn.classList.contains('disabled')) return;
  wsIndex = (wsIndex + 1) % wildSwapStates.length;
  wildSwapBtn.textContent = wildSwapStates[wsIndex];
  updateSummary();
  
  // Add or remove grey class based on current text after cycling
  wildSwapBtn.classList.toggle('greyed', wildSwapBtn.textContent === 'Off');
});

// Detailed rules paging
const detailedPages=document.querySelectorAll('.rule-page');
let currentPage=0;
function showPage(idx){
  detailedPages.forEach(p=>p.classList.remove('active'));
  detailedPages[idx].classList.add('active');
  document.getElementById('detailedTitle').textContent=detailedPages[idx].getAttribute('data-title');
}
document.getElementById('prevDetailed').addEventListener('click',()=>{currentPage=(currentPage-1+detailedPages.length)%detailedPages.length;showPage(currentPage);});
document.getElementById('nextDetailed').addEventListener('click',()=>{currentPage=(currentPage+1)%detailedPages.length;showPage(currentPage);});
showPage(currentPage);

// Color definitions (name to hex and symbol unicode for suits)
const suitData = [
  { key: "diamonds", symbol: "♦" },
  { key: "clubs", symbol: "♣" },
  { key: "hearts", symbol: "♥" },
  { key: "spades", symbol: "♠" },
  { key: "stars", symbol: "★" }
];

const colors = [
  { name: "red", hex: "#c9302c" },
  { name: "orange", hex: "#e97311" },
  { name: "yellow", hex: "#ffff5c" },
  { name: "gold", hex: "#eedc82" },
  { name: "bright green", hex: "#01ff05" },
  { name: "hunter green", hex: "#0a5b23" },
  { name: "cyan", hex: "#00e9f1" },
  { name: "royal blue", hex: "#276ff7" },
  { name: "plum", hex: "#ae2cec" },
  { name: "pink", hex: "#FF5C77" },
  { name: "magenta", hex: "#FF00FF" },
  { name: "white", hex: "#fff" },
  { name: "light grey", hex: "#bbb" },
  { name: "dark grey", hex: "#555" },
  { name: "black", hex: "#000" }
];

const contentCards = document.getElementById("content-cards");
const suitsRow = document.getElementById("suitsRow");
const symbolColorBtn = document.getElementById("symbolColorBtn");
const bgColorBtn = document.getElementById("bgColorBtn");
const suitSizeSlider = document.getElementById("suitSizeSlider");
const rankSizeSlider = document.getElementById("rankSizeSlider");
const colorPickerPopup = document.getElementById("colorPickerPopup");
const colorsGrid = colorPickerPopup.querySelector(".colors-grid");
const closeColorPickerBtn = document.getElementById("closeColorPickerBtn");
const cardPreview = document.getElementById("cardPreview");

const backCenterColorBtn = document.getElementById("backCenterColor");
const backEdgeColor1Btn = document.getElementById("backEdgeColor1");
const backEdgeColor2Btn = document.getElementById("backEdgeColor2");
const backEdgeColor3Btn = document.getElementById("backEdgeColor3");
const backEdgeOutlineColorBtn = document.getElementById("backEdgeOutlineColor");
const cardBackPreview = document.getElementById("cardBackPreview");

// State for customization
let extraSuitEnabled = false; // will sync with extraSuitChk below
let selectedSuitKey = "hearts"; // default suit selected
const suitColors = {}; // { suitKey: { symbol: colorhex, background: colorhex } }
const backColors = {
  center: "#000000",
  edge1: "#333333",
  edge2: "#666666",
  edge3: "#999999",
  outline: "#ffffff",
  edgeWidth: 6 // fixed constant width 6
};

function isExtraSuitEnabled() {
  return document.getElementById("extraSuitChk").checked;
}

function buildSuitButtons() {
  suitsRow.innerHTML = "";
  extraSuitEnabled = isExtraSuitEnabled();

  // suits to show, stars only if extraSuit enabled
  let suitsToShow = suitData.filter(s => s.key !== "stars" || extraSuitEnabled);

  suitsToShow.forEach(({ key, symbol }) => {
    const btn = document.createElement("button");
    btn.className = "suit-button";
    btn.setAttribute("data-key", key);
    btn.setAttribute("title", key.charAt(0).toUpperCase() + key.slice(1));
    btn.textContent = symbol;
    if (key === selectedSuitKey) {
      btn.classList.add("selected");
    }
    // Set background from suitColors background, symbol color from symbol
    const bg = suitColors[key]?.background || "black";
    const sym = suitColors[key]?.symbol || "white";
    btn.style.backgroundColor = bg;
    btn.style.color = sym;
    suitsRow.appendChild(btn);

    btn.addEventListener("click", () => {
      selectedSuitKey = key;
      buildSuitButtons();
      updateColorButtonsState();
      updatePreview();
      updateTablePreview();
    });
  });
}

function updateColorButtonsState() {
  // Disable if no suit selected
  const selectedColors = suitColors[selectedSuitKey] || { symbol: "white", background: "black" };
  symbolColorBtn.disabled = !selectedSuitKey;
  bgColorBtn.disabled = !selectedSuitKey;
  if (!symbolColorBtn.disabled) symbolColorBtn.style.background = selectedColors.symbol;
  if (!bgColorBtn.disabled) bgColorBtn.style.background = selectedColors.background;

  // Update card back color buttons backgrounds dynamically
  backCenterColorBtn.style.backgroundColor = backColors.center;
  backEdgeColor1Btn.style.backgroundColor = backColors.edge1;
  backEdgeColor2Btn.style.backgroundColor = backColors.edge2;
  backEdgeColor3Btn.style.backgroundColor = backColors.edge3;
  backEdgeOutlineColorBtn.style.backgroundColor = backColors.outline;
}

function createColorSquares(selectedColorHex, disallowedColorHex) {
  colorsGrid.innerHTML = "";
  colors.forEach(({ name, hex }) => {
    const square = document.createElement("div");
    square.className = "color-square";
    square.style.background = hex;
    if (hex === selectedColorHex) square.classList.add("selected");
    if (hex === disallowedColorHex) square.style.opacity = 0.3; // mark as disabled
    colorsGrid.appendChild(square);
    if (hex !== disallowedColorHex) {
      square.addEventListener("click", () => {
        // Update color depending on current picker state
        if (colorPickerMode === "symbol") {
          suitColors[selectedSuitKey] = suitColors[selectedSuitKey] || {};
          suitColors[selectedSuitKey].symbol = hex;
        } else if (colorPickerMode === "background") {
          suitColors[selectedSuitKey] = suitColors[selectedSuitKey] || {};
          suitColors[selectedSuitKey].background = hex;
        } else if (colorPickerMode.startsWith("back-")) {
          const colorPart = colorPickerMode.split("-")[1];
          backColors[colorPart] = hex;
          if (colorPart === "outline") updateCardBackEdgeOutline(), updateTableCardBackEdgeOutline();
          if (colorPart === "center" || colorPart.startsWith("edge")) updateCardBackPreview(), updateTableCardBackPreview();
        }
        colorPickerPopup.style.display = "none";
        updateColorButtonsState();
        updatePreview();
        updateTablePreview();
      });
    }
  });
}

let colorPickerMode = null;

symbolColorBtn.addEventListener("click", () => {
  if (!selectedSuitKey) return;
  colorPickerMode = "symbol";
  const currentColor = suitColors[selectedSuitKey]?.symbol || "#fff";
  const bgColor = suitColors[selectedSuitKey]?.background || "#000";
  createColorSquares(currentColor, bgColor);
  colorPickerPopup.style.display = "flex";
});

bgColorBtn.addEventListener("click", () => {
  if (!selectedSuitKey) return;
  colorPickerMode = "background";
  const currentColor = suitColors[selectedSuitKey]?.background || "#000";
  const symbolColor = suitColors[selectedSuitKey]?.symbol || "#fff";
  createColorSquares(currentColor, symbolColor);
  colorPickerPopup.style.display = "flex";
});

closeColorPickerBtn.addEventListener("click", () => {
  colorPickerPopup.style.display = "none";
});

// Sliders event handlers
suitSizeSlider.addEventListener("input", updatePreview);
rankSizeSlider.addEventListener("input", updatePreview);
suitSizeSlider.addEventListener("input", updateTablePreview);
rankSizeSlider.addEventListener("input", updateTablePreview);

// Card back color buttons
backCenterColorBtn.addEventListener("click", () => {
  colorPickerMode = "back-center";
  createColorSquares(backColors.center, null);
  colorPickerPopup.style.display = "flex";
});
backEdgeColor1Btn.addEventListener("click", () => {
  colorPickerMode = "back-edge1";
  createColorSquares(backColors.edge1, null);
  colorPickerPopup.style.display = "flex";
});
backEdgeColor2Btn.addEventListener("click", () => {
  colorPickerMode = "back-edge2";
  createColorSquares(backColors.edge2, null);
  colorPickerPopup.style.display = "flex";
});
backEdgeColor3Btn.addEventListener("click", () => {
  colorPickerMode = "back-edge3";
  createColorSquares(backColors.edge3, null);
  colorPickerPopup.style.display = "flex";
});
backEdgeOutlineColorBtn.addEventListener("click", () => {
  colorPickerMode = "back-outline";
  createColorSquares(backColors.outline, null);
  colorPickerPopup.style.display = "flex";
});

// Setup preview card visuals
function updatePreview() {
  if (!selectedSuitKey) return;
  cardPreview.innerHTML = "";
  const suitColor = suitColors[selectedSuitKey]?.symbol || "white";
  const bgColor = suitColors[selectedSuitKey]?.background || "black";
  const suitSize = +suitSizeSlider.value;
  const rankSize = +rankSizeSlider.value;

  // Include constant edge width in preview border
  const edgeWidth = backColors.edgeWidth;

  cardPreview.style.backgroundColor = bgColor;
  cardPreview.style.border = `${edgeWidth}px solid ${backColors.outline}`;
  cardPreview.style.position = "relative";
  cardPreview.style.boxSizing = "border-box";

  // Suit symbol centered horizontally and vertically
  const suitElem = document.createElement("div");
  suitElem.className = "suit-symbol";
  suitElem.textContent = suitData.find(s => s.key === selectedSuitKey)?.symbol || "?";
  suitElem.style.color = suitColor;
  suitElem.style.fontSize = suitSize + "px";
  suitElem.style.position = "absolute";
  suitElem.style.top = "50%";
  suitElem.style.left = "50%";
  suitElem.style.transform = "translate(-50%, -50%)";
  cardPreview.appendChild(suitElem);

  // Rank symbol top-right corner, fixed top edge - stays inside box and no overlap
  const rankElem = document.createElement("div");
  rankElem.className = "rank";
  rankElem.textContent = "A"; // example rank
  rankElem.style.color = suitColor;
  rankElem.style.fontSize = rankSize + "px";
  rankElem.style.position = "absolute";
  rankElem.style.top = "0px";         // fixed top offset
  rankElem.style.right = "8px";       // right aligned
  rankElem.style.left = "auto";       // overwrite left
  rankElem.style.lineHeight = "1";    // tight vertical height to prevent overlap
  rankElem.style.whiteSpace = "nowrap";
  rankElem.style.userSelect = "none";
  rankElem.style.pointerEvents = "none";
  cardPreview.appendChild(rankElem);
}

function updateCardBackPreview() {
  const c = backColors;
  // Radial gradient with 3 edges
  cardBackPreview.style.background = `radial-gradient(circle at center,
    ${c.center} 0%,
    ${c.edge1} 25%,
    ${c.edge2} 50%,
    ${c.edge3} 75%,
    ${c.edge3} 80%
    )`;
  // Use fixed edgeWidth 6px
  cardBackPreview.style.border = `${c.edgeWidth}px solid ${c.outline}`;
  cardBackPreview.style.boxSizing = "border-box";
}

function updateCardBackEdgeOutline() {
  // We just update the border color of cardBackPreview
  cardBackPreview.style.borderColor = backColors.outline;
}

// Setup preview card visuals
function updateTablePreview() {
  if (!selectedSuitKey) return;
  tablecardPreview.innerHTML = "";
  const suitColor = suitColors[selectedSuitKey]?.symbol || "white";
  const bgColor = suitColors[selectedSuitKey]?.background || "black";
  const suitSize = +suitSizeSlider.value;
  const rankSize = +rankSizeSlider.value;

  // Include constant edge width in preview border
  const edgeWidth = backColors.edgeWidth;

  tablecardPreview.style.backgroundColor = bgColor;
  tablecardPreview.style.border = `${edgeWidth}px solid ${backColors.outline}`;
  tablecardPreview.style.position = "relative";
  tablecardPreview.style.boxSizing = "border-box";

  // Suit symbol centered horizontally and vertically
  const suitElem = document.createElement("div");
  suitElem.className = "suit-symbol";
  suitElem.textContent = suitData.find(s => s.key === selectedSuitKey)?.symbol || "?";
  suitElem.style.color = suitColor;
  suitElem.style.fontSize = suitSize * 0.45 + "px";
  suitElem.style.position = "absolute";
  suitElem.style.top = "50%";
  suitElem.style.left = "50%";
  suitElem.style.transform = "translate(-50%, -50%)";
  tablecardPreview.appendChild(suitElem);

  // Rank symbol top-right corner, fixed top edge - stays inside box and no overlap
  const rankElem = document.createElement("div");
  rankElem.className = "rank";
  rankElem.textContent = "A"; // example rank
  rankElem.style.color = suitColor;
  rankElem.style.fontSize = rankSize * 0.35 + "px";
  rankElem.style.position = "absolute";
  rankElem.style.top = "0px";         // fixed top offset
  rankElem.style.right = "4px";       // right aligned
  rankElem.style.left = "auto";       // overwrite left
  rankElem.style.lineHeight = "1";    // tight vertical height to prevent overlap
  rankElem.style.whiteSpace = "nowrap";
  rankElem.style.userSelect = "none";
  rankElem.style.pointerEvents = "none";
  tablecardPreview.appendChild(rankElem);
}

function updateTableCardBackPreview() {
  const c = backColors;
  // Radial gradient with 3 edges
  tablecardBackPreview.style.background = `radial-gradient(circle at center,
    ${c.center} 0%,
    ${c.edge1} 25%,
    ${c.edge2} 50%,
    ${c.edge3} 75%,
    ${c.edge3} 80%
    )`;
  // Use fixed edgeWidth 6px
  tablecardBackPreview.style.border = `${c.edgeWidth}px solid ${c.outline}`;
  tablecardBackPreview.style.boxSizing = "border-box";
}

function updateTableCardBackEdgeOutline() {
  // We just update the border color of cardBackPreview
  tablecardBackPreview.style.borderColor = backColors.outline;
}

// Sync extraSuit checkbox to rebuild suits when toggled
document.getElementById("extraSuitChk").addEventListener("change", () => {
  buildSuitButtons();
  if (!isExtraSuitEnabled() && selectedSuitKey === "stars") {
    selectedSuitKey = "hearts"; // fallback to hearts if star disabled
  }
  updateColorButtonsState();
  updatePreview();
  updateTablePreview();
});

// Initialize suitColors for all suits with default colors if not present
function initializeSuitColors() {
  suitData.forEach(({ key }) => {
    if (!suitColors[key]) {
      suitColors[key] = { symbol: "white", background: "black" };
    }
  });
}

// Helper: Set cookie with expiration (days)
function setCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days*24*60*60*1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

// Helper: Get cookie value by name
function getCookie(name) {
  const cookies = document.cookie.split("; ").reduce((acc, curr) => {
    const [k,v] = curr.split("=");
    acc[k] = decodeURIComponent(v);
    return acc;
  }, {});
  return cookies[name] || null;
}

// Save user settings to cookies
function saveSettingsToCookies() {
  // Custom rules
  const customRules = {
    extraDeckChk: document.getElementById('extraDeckChk').checked,
    extraSuitChk: document.getElementById('extraSuitChk').checked,
    wrapRunsChk: document.getElementById('wrapRunsChk').checked,
    wildCardsChk: document.getElementById('wildCardsChk').checked,
    fastBuyChk: document.getElementById('fastBuyChk').checked,
    optOutChk: document.getElementById('optOutChk').checked,
    selfDiscardChk: document.getElementById('selfDiscardChk').checked,
    wildType: document.getElementById('wildTypeBtn').textContent,
    wildSwap: document.getElementById('wildSwapBtn').textContent,
    buyClock: document.getElementById('buyClockRange').value,
    softShanghaiChk: document.getElementById('softShanghaiChk').checked,
    hardShanghaiChk: document.getElementById('hardShanghaiChk').checked,
    finalShanghaiChk: document.getElementById('finalShanghaiChk').checked
  };
  setCookie('customRules', JSON.stringify(customRules));

  // Players
  const humanName = document.getElementById('humanNameInput').value;
  const numComp = numComputers;
  const compNames = [];
  const compDifficulties = [];
  
  document.querySelectorAll('#playersGrid .player-slot').forEach((slot, i) => {
    if (i < numComp) {
      const nameInput = slot.querySelector('input.player-name-input');
      const diffBtn = slot.querySelector('button.difficulty-btn');
      compNames.push(nameInput ? nameInput.value : `Computer ${i + 1}`);
      compDifficulties.push(diffBtn ? diffBtn.textContent : "Medium");
    }
  });
  
  const playersData = { humanName, numComp, compNames, compDifficulties };
  setCookie('playersData', JSON.stringify(playersData));
  // Card customization
  const cardCustom = {
    suitColors,
    backColors,
    selectedSuitKey,
    suitSize: +document.getElementById('suitSizeSlider').value,
    rankSize: +document.getElementById('rankSizeSlider').value
  };
  setCookie('cardCustom', JSON.stringify(cardCustom));
}

// Load settings from cookies
function loadSettingsFromCookies() {
  const customRulesCookie = getCookie('customRules');
  if (customRulesCookie) {
    try {
      const cr = JSON.parse(customRulesCookie);
  
      // Set each custom rule explicitly:
      document.getElementById('extraDeckChk').checked = cr.extraDeckChk ?? false;
      document.getElementById('extraSuitChk').checked = cr.extraSuitChk ?? false;
      document.getElementById('wrapRunsChk').checked = cr.wrapRunsChk ?? false;
      document.getElementById('wildCardsChk').checked = cr.wildCardsChk ?? true;
      document.getElementById('fastBuyChk').checked = cr.fastBuyChk ?? true;
      document.getElementById('optOutChk').checked = cr.optOutChk ?? false;
      document.getElementById('selfDiscardChk').checked = cr.selfDiscardChk ?? false;
      document.getElementById('softShanghaiChk').checked = cr.softShanghaiChk ?? false;
      document.getElementById('hardShanghaiChk').checked = cr.hardShanghaiChk ?? true;
      document.getElementById('finalShanghaiChk').checked = cr.finalShanghaiChk ?? false;
  
      // Set the buy clock value and update UI immediately:
      if (cr.buyClock !== undefined) {
        const buyClock = document.getElementById('buyClockRange');
        buyClock.value = cr.buyClock;
        updateBuyClock();
      }
  
      // Set wild type and update index
      if (cr.wildType) {
        const wildTypeBtn = document.getElementById('wildTypeBtn');
        wildTypeBtn.textContent = cr.wildType;
        wildTypeBtn.classList.remove('disabled');
        wtIndex = wildTypes.indexOf(cr.wildType);
        if (wtIndex === -1) wtIndex = 0;
      }
  
      // Set wild swap and update index
      if (cr.wildSwap) {
        const wildSwapBtn = document.getElementById('wildSwapBtn');
        wildSwapBtn.textContent = cr.wildSwap;
        wildSwapBtn.classList.remove('disabled');
        wsIndex = wildSwapStates.indexOf(cr.wildSwap);
        if (wsIndex === -1) wsIndex = 0;
      }
  
      updateSummary(); // update summary for loaded values
  
      updateWildButtons(); // ensure buttons disabled state correctly set
    } catch (e) {
      // ignore errors
    }
  }

  const playersCookie = getCookie('playersData');
  if (playersCookie) {
  try {
    const pd = JSON.parse(playersCookie);
    if (pd.humanName) document.getElementById('humanNameInput').value = pd.humanName;
    if (pd.numComp) numComputers = pd.numComp;
    buildPlayerSlots();
    if (Array.isArray(pd.compNames)) {
      const slots = document.querySelectorAll('#playersGrid .player-slot');
      pd.compNames.forEach((name, i) => {
        if (slots[i]) {
          const nameInput = slots[i].querySelector('input.player-name-input');
          if(nameInput) nameInput.value = name;
        }
      });
    }
    if (Array.isArray(pd.compDifficulties)) {
      const slots = document.querySelectorAll('#playersGrid .player-slot');
      pd.compDifficulties.forEach((diff, i) => {
        if (slots[i]) {
          const diffBtn = slots[i].querySelector('button.difficulty-btn');
          diffBtn.textContent = diff;
          diffBtn.className = 'difficulty-btn ' + diff.toLowerCase();
          diffBtn.setAttribute('data-tooltip', {
            Easy: "Evaluates rules and its own hand, cards it has discarded, and last 5 discards in the discard pile",
            Medium: "Evaluates its own hand, the entire discard pile, plus a 33% chance to maximize the score of the cards played when laying down and playing cards into the play area as to minimize the score of the cards remaining in its hand after discarding",
            Hard: "Normal AI with 75% chance to maximize laydown, plus tracks which cards players have taken and discarded to infer which sets/runs other players might be collecting to better evaluate discard choices, the cards remaining in the draw pile, and which cards to buy",
            Ruthless: "Hard AI with 50% chance to veto another player’s buy if it reasonablly infers that the buyer needs that card to get closer to a complete a run or set he/she is collecting"
          }[diff] || "");
        }
      });
    }
    numCompDisplay.textContent = numComputers;
  } catch (e) {}
}


  const cardCustomCookie = getCookie('cardCustom');
  if (cardCustomCookie) {
    try {
      const cc = JSON.parse(cardCustomCookie);
      if (cc.suitColors) {
        Object.keys(cc.suitColors).forEach(k => { suitColors[k] = cc.suitColors[k]; });
      }
      if (cc.backColors) {
        Object.assign(backColors, cc.backColors);
      }
      if (cc.selectedSuitKey) selectedSuitKey = cc.selectedSuitKey;
      if (cc.suitSize) document.getElementById('suitSizeSlider').value = cc.suitSize;
      if (cc.rankSize) document.getElementById('rankSizeSlider').value = cc.rankSize;
      buildSuitButtons();
      updateColorButtonsState();
      updatePreview();
      updateCardBackPreview();
      updateTablePreview();
      updateTableCardBackPreview();
    } catch (e) { }
  }
}

// Call load on page start, and save on relevant changes

window.addEventListener('load', () => {
  loadSettingsFromCookies();
  updateSummary();
  // Hide tooltip bar on initial load for the Quick Summary tab
  if (document.getElementById('tab-summary').classList.contains('active')) {
    document.getElementById('tooltipBar').style.display = 'none';
  }
});

// Save on custom rules change
document.querySelectorAll('#content-custom input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', () => {
    saveSettingsToCookies();
    updateSummary();
  });
});
document.getElementById('wildTypeBtn').addEventListener('click', () => { saveSettingsToCookies(); updateSummary(); });
document.getElementById('wildSwapBtn').addEventListener('click', () => { saveSettingsToCookies(); updateSummary(); });
document.getElementById('buyClockRange').addEventListener('input', () => { saveSettingsToCookies(); updateSummary(); });

// Save on player data change
document.getElementById('humanNameInput').addEventListener('input', saveSettingsToCookies);
document.getElementById('decComp').addEventListener('click', saveSettingsToCookies);
document.getElementById('incComp').addEventListener('click', saveSettingsToCookies);
document.getElementById('randomizeBtn').addEventListener('click', () => {
  saveSettingsToCookies();
});

// Save changes in difficulties
document.getElementById('playersGrid').addEventListener('click', e => {
  if (e.target.classList.contains('difficulty-btn')) {
    saveSettingsToCookies();
  }
});

// Save on card customization changes
[symbolColorBtn, bgColorBtn, suitSizeSlider, rankSizeSlider,
 backCenterColorBtn, backEdgeColor1Btn, backEdgeColor2Btn, backEdgeColor3Btn, backEdgeOutlineColorBtn].forEach(el => {
  el.addEventListener('click', () => {
    // Color picker's save fires separately
    setTimeout(saveSettingsToCookies, 300);
  });
});
symbolColorBtn.addEventListener('click', () => {
  // After user selects color, saveSettingsToCookies is called inside color selection handler
});
bgColorBtn.addEventListener('click', () => {
  // Same as above
});
suitSizeSlider.addEventListener('input', saveSettingsToCookies);
rankSizeSlider.addEventListener('input', saveSettingsToCookies);

initializeSuitColors();
buildSuitButtons();
updateColorButtonsState();
updatePreview();
updateTablePreview();
updateCardBackPreview();
updateTablePreview();
updateTableCardBackPreview();

document.querySelector('.start-btn').addEventListener('click', () => {
  // Get human player name (fallback 'Player1')
  const humanName = document.getElementById('humanNameInput').value.trim() || 'Player1';

  // Get computer player names from active slots (#playersGrid .player-slot:not(.inactive))
  const compNames = [];
  const compSlots = document.querySelectorAll('#playersGrid .player-slot:not(.inactive)');
  compSlots.forEach(slot => {
    const input = slot.querySelector('input.player-name-input');
    if (input) {
      const val = input.value.trim();
      if (val) compNames.push(val);
    }
  });

  const playerNames = [humanName, ...compNames];

  if (playerNames.length < 3) {
    alert('Please have at least 3 players to start the game.');
    return;
  }

  // Save playerNames in localStorage for table.html to read
  localStorage.setItem('gameSetup', JSON.stringify({ playerNames }));

  // Redirect to table.html
  window.location.href = 'table.html';
});

