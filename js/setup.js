// Tabs
const tabs = document.querySelectorAll('.tab-btn');
const contents = {
  summary: document.getElementById('content-summary'),
  custom: document.getElementById('content-custom'),
  players: document.getElementById('content-players'),
  detailed: document.getElementById('content-detailed'),
  cards: document.getElementById('content-cards')
};

let currentPageId = 'summary';   // Detailed Rules page being shown (declared early: updateSummary() uses it)

// Buying clock
const buyClock=document.getElementById('buyClockRange');
const buyClockValue=document.getElementById('buyClockValue');
function updateBuyClock(){
  buyClockValue.textContent=buyClock.value+' s';
  const pct=(buyClock.value-buyClock.min)/(buyClock.max-buyClock.min)*100;
  buyClock.style.background=`linear-gradient(to right, var(--slider-red) ${pct}%, #555 ${pct}%)`;
}
buyClock.addEventListener('input',updateBuyClock);
buyClock.addEventListener('input', () => { updateSummary(); });
updateBuyClock();

function updateSummary() {
  const summaryContent = document.querySelector('#content-summary .summary-content');
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

  let qsummary = `● ${extraDeck ? 3 : 2} decks for 3–4 players, +1 deck for every 2 more players<br>`;
  if (extraSuit) qsummary += "● 5th suit (Stars ★) added<br>";
  qsummary += "● Players are dealt 10 cards each round<br>";
  qsummary += "● On your turn: Draw → Lay Down → Play → Discard<br>";
  qsummary += "● Aim: Collect and <strong>LAY DOWN</strong> required <strong>CONTRACT</strong><br>";
  qsummary += "● <strong>Sets</strong> are 3+ cards of same rank<br>";
  qsummary += "● <strong>Runs</strong> are 4+ cards of the same suit in sequence<br>";
  if (wrapRuns) qsummary += "● <strong>WRAP-AROUND:</strong> K-A-2-3 is valid<br>";
  else qsummary += "● Aces are High <strong>OR</strong> Low (not both)<br>";
  
  if (wildCards) {
    let wildTypeDesc = {"Classic":"<strong>(3♦/3♥)</strong>","Extra":"<strong>(3♦/3♥/3★)</strong>","Joker":"<strong>(Jokers)</strong>"}[wildTypeBtn.textContent]||"";
    qsummary += `● <strong>WILD CARDS</strong> ${wildTypeDesc}: may be used as <strong>ANY</strong> rank/suit<br>`;
    if (wildSwapBtn.textContent === "Pre") qsummary += "● Wild swapping: before laying down<br>";
    else if (wildSwapBtn.textContent === "Post") qsummary += "● Wild swapping: before or after laying down<br>";
  }
  
  qsummary += `● Players have <strong>${buyClock.value}s</strong> to declare a <strong>BUY</strong><br>`;
  if (fastBuyChk) qsummary += "● First to declare buy gets priority<br>";
  if (optOutChk) qsummary += "● Players may <strong>OPT OUT</strong> of a buy<br>";
  if (selfDiscardChk) qsummary += "● Self-discard buying allowed<br>";
  qsummary += "● <strong>LOWEST</strong> score after seven rounds <strong>WINS</strong><br>";
  
  let shanghaiBonus = "";
  if (softShanghai) shanghaiBonus += "+25 Soft";
  if (hardShanghai) shanghaiBonus += (shanghaiBonus?", ":"") + (finalShanghai ? "+50 Shanghai (rounds 1–6)" : "+50 Shanghai");
  if (finalShanghai) shanghaiBonus += (shanghaiBonus?", ":"") + "+100 Final";
  if (shanghaiBonus) qsummary += `● Shanghai bonuses: ${shanghaiBonus}`;
  
  summaryContent.innerHTML = qsummary;
  renderDetailed();
}
updateSummary();

const tooltipBar = document.getElementById('tooltipBar');
const TIP_DEFAULT = 'Hover over a control for help.';
tabs.forEach(t => {
  t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    Object.values(contents).forEach(content => content.style.display = 'none');
    tooltipBar.textContent = TIP_DEFAULT;
    if (t.id === 'tab-summary') { contents.summary.style.display = 'block'; tooltipBar.style.display = 'none'; }
    else if (t.id === 'tab-custom') { contents.custom.style.display = 'block'; tooltipBar.style.display = 'block'; }
    else if (t.id === 'tab-players') { contents.players.style.display = 'flex'; tooltipBar.style.display = 'block'; }
    else if (t.id === 'tab-detailed') { contents.detailed.style.display = 'block'; tooltipBar.style.display = 'none'; }
    else if (t.id === 'tab-cards') { contents.cards.style.display = 'block'; tooltipBar.style.display = 'none'; }
  });
});

document.querySelectorAll('#content-custom input[type="checkbox"]').forEach(checkbox => {
  checkbox.addEventListener('change', updateSummary);
});
document.getElementById('wildTypeBtn').addEventListener('click', updateSummary);
document.getElementById('wildSwapBtn').addEventListener('click', updateSummary);

// Tooltips: one delegated listener, so every element with data-tooltip works (including
// buttons, sliders and rows built later).  Rule names, their switches/buttons and the
// clock slider all carry the same help text.
function linkTips() {
  document.querySelectorAll('#content-custom .rule-item').forEach(item => {
    const tip = item.querySelector('[data-tooltip]')?.getAttribute('data-tooltip');
    if (tip) item.querySelectorAll('.compact-switch, button').forEach(el => { if (!el.hasAttribute('data-tooltip')) el.setAttribute('data-tooltip', tip); });
  });
  const clockTip = document.querySelector('.clock-label')?.getAttribute('data-tooltip');
  if (clockTip) ['buyClockRange', 'buyClockValue'].forEach(id => document.getElementById(id)?.setAttribute('data-tooltip', clockTip));
  const dbg = document.getElementById('debugAiChk');
  const dbgTip = dbg?.closest('div')?.querySelector('span[data-tooltip]')?.getAttribute('data-tooltip');
  if (dbgTip) dbg.closest('.compact-switch')?.setAttribute('data-tooltip', dbgTip);
}
function _tipEl(e) { return e.target && e.target.closest ? e.target.closest('[data-tooltip]') : null; }
function _tipShow(e) { const el = _tipEl(e); if (el) tooltipBar.textContent = el.getAttribute('data-tooltip'); }
function _tipHide(e) { const el = _tipEl(e); if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) tooltipBar.textContent = TIP_DEFAULT; }
document.addEventListener('mouseover', _tipShow);
document.addEventListener('mouseout',  _tipHide);
document.addEventListener('focusin',   _tipShow);
document.addEventListener('focusout',  _tipHide);
linkTips();

// Players tab
let numComputers=3;
const playersGrid=document.getElementById('playersGrid');
const humanNameInput=document.getElementById('humanNameInput');
const numCompDisplay=document.getElementById('numCompDisplay');
const decComp=document.getElementById('decComp');
const incComp=document.getElementById('incComp');
const randomizeBtn=document.getElementById('randomizeBtn');
const NAME_MAX = 12;
const debugChk = document.getElementById('debugAiChk');
const playersMsg = document.getElementById('playersMsg');
const minComputers = () => debugChk.checked ? 3 : 2;   // debug has no human, so it needs 3 computers
const aiPool=["Alice","Bob","Charlie","David","Erik","Frank","George","Henry","Ivy","Jason","Kerry","Lauren","Mark","Ned","Oscar","Paul","Rob","Tom","Victor","Zeb"];
const difficultyTooltips={"Easy":"Evaluates rules and its own hand, cards it has discarded, and last 5 discards in the discard pile","Medium":"Evaluates its own hand, the entire discard pile, plus a 33% chance to maximize the score of the cards played when laying down and playing cards into the play area as to minimize the score of the cards remaining in its hand after discarding.","Hard":"Normal AI with 75% chance to maximize laydown, plus tracks which cards players have taken and discarded to infer which sets/runs other players might be collecting to better evaluate discard choices, the cards remaining in the draw pile, and which cards to buy","Ruthless":"Hard AI with 50% chance to veto another player's buy if it reasonablly infers that the buyer needs that card to get closer to a complete a run or set he/she is collecting"};

function buildPlayerSlots() {
  const existingSlots = document.querySelectorAll('#playersGrid .player-slot');
  const savedNames = [], savedDiffs = [], savedDiffClasses = [];
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

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'player-name-input';
    nameInput.style.cssText = 'width:100%;box-sizing:border-box;background:transparent;color:white;border:none;border-bottom:1px solid rgba(255,255,255,0.3);font-weight:600;text-align:center;';
    nameInput.maxLength = NAME_MAX;
    nameInput.setAttribute('data-tooltip', `Computer name (up to ${NAME_MAX} characters)`);
    nameInput.value = (savedNames[i] ?? `Computer ${i + 1}`).slice(0, NAME_MAX);
    nameInput.addEventListener('input', () => { savedNames[i] = nameInput.value; saveSettingsToCookies(); validatePlayers(); });

    const diffBtn = document.createElement('button');
    diffBtn.className = 'difficulty-btn';
    const diffText = savedDiffs[i] || 'Medium';
    const diffClass = savedDiffClasses[i] || 'medium';
    diffBtn.textContent = diffText;
    diffBtn.classList.add(diffClass);
    diffBtn.setAttribute('data-tooltip', difficultyTooltips[diffText] || difficultyTooltips['Medium']);
    diffBtn.addEventListener('click', () => {
      let idx = ["Easy","Medium","Hard","Ruthless"].indexOf(diffBtn.textContent);
      idx = (idx + 1) % 4;
      diffBtn.textContent = ["Easy","Medium","Hard","Ruthless"][idx];
      ["easy","medium","hard","ruthless"].forEach(c => diffBtn.classList.remove(c));
      diffBtn.classList.add(["easy","medium","hard","ruthless"][idx]);
      diffBtn.setAttribute('data-tooltip', difficultyTooltips[diffBtn.textContent]);
      document.getElementById('tooltipBar').textContent = difficultyTooltips[diffBtn.textContent];
      saveSettingsToCookies();
    });

    slot.appendChild(nameInput);
    slot.appendChild(diffBtn);
    playersGrid.appendChild(slot);
  }
  numCompDisplay.textContent = numComputers;
  validatePlayers();
}

decComp.addEventListener('click',()=>{if(numComputers>minComputers()){numComputers--;buildPlayerSlots();}});
incComp.addEventListener('click',()=>{if(numComputers<10){numComputers++;buildPlayerSlots();}});

// Debug mode removes the human, so the name field is not used and the minimum is 3 computers.
function applyDebugState() {
  humanNameInput.disabled = debugChk.checked;
  if (debugChk.checked && numComputers < 3) { numComputers = 3; buildPlayerSlots(); }
  validatePlayers();
}
debugChk.addEventListener('change', applyDebugState);

// Names must be filled in and unique (case-insensitive).  Returns the message, or '' when fine.
function validatePlayers() {
  const entries = [];
  if (!debugChk.checked) entries.push(humanNameInput);
  document.querySelectorAll('#playersGrid .player-slot:not(.inactive) input.player-name-input').forEach(i => entries.push(i));
  const seen = new Map();
  entries.forEach(i => { const k = i.value.trim().toLowerCase(); if (k) seen.set(k, (seen.get(k) || 0) + 1); });
  let blank = false, dup = '';
  entries.forEach(i => {
    const v = i.value.trim(), k = v.toLowerCase();
    const bad = !v || seen.get(k) > 1;
    i.classList.toggle('invalid', bad);
    if (!v) blank = true; else if (seen.get(k) > 1 && !dup) dup = v;
  });
  humanNameInput.classList.toggle('invalid', humanNameInput.classList.contains('invalid') && !debugChk.checked);
  const msg = blank ? 'Every player needs a name.' : (dup ? `Two players are named "${dup}". Names must be different.` : '');
  playersMsg.textContent = msg;
  return msg;
}
humanNameInput.addEventListener('input', validatePlayers);

randomizeBtn.addEventListener('click', () => {
  // Fisher-Yates on a copy — avoids the biased sort() shuffle and
  // avoids permanently mutating the aiPool array.
  const pool = [...aiPool];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const slots = document.querySelectorAll('.player-slot');
  slots.forEach((slot, i) => {
    if (i < numComputers) {
      const nameInput = slot.querySelector('input.player-name-input');
      if (nameInput) { nameInput.value = pool[i]; saveSettingsToCookies(); }
    }
  });
  validatePlayers();
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
  wildSwapBtn.classList.toggle('greyed', wildSwapBtn.textContent === 'Off');
  wildSwapBtn.setAttribute('aria-disabled', String(!enabled));
  wildTypeBtn.setAttribute('aria-disabled', String(!enabled));
  renderDetailed();
}
wildCardsChk.addEventListener('change', updateWildButtons);
updateWildButtons();

// "Extra" wilds are the 3s of the extra suit, so they are only an option when it is on.
function allowedWildTypes(){ return document.getElementById('extraSuitChk').checked ? wildTypes : wildTypes.filter(t => t !== 'Extra'); }
wildTypeBtn.addEventListener('click', () => {
  if (wildTypeBtn.classList.contains('disabled')) return;
  const list = allowedWildTypes();
  const cur = list.indexOf(wildTypeBtn.textContent);
  wtIndex = wildTypes.indexOf(list[(cur + 1) % list.length]);
  wildTypeBtn.textContent = wildTypes[wtIndex];
  updateSummary();
});
wildSwapBtn.addEventListener('click', () => {
  if (wildTypeBtn.classList.contains('disabled')) return;
  wsIndex = (wsIndex + 1) % wildSwapStates.length;
  wildSwapBtn.textContent = wildSwapStates[wsIndex];
  updateSummary();
  updateWildButtons();
});

// Detailed rules: the pages are rebuilt from the Custom Rules settings (updateSummary() calls
// renderDetailed() on every change), so only rules that are switched on are described.
function _rules() {
  const on = id => document.getElementById(id).checked;
  return {
    extraSuit: on('extraSuitChk'), wrapRuns: on('wrapRunsChk'), wilds: on('wildCardsChk'),
    fastBuy: on('fastBuyChk'), optOut: on('optOutChk'), selfDiscard: on('selfDiscardChk'),
    soft: on('softShanghaiChk'), hard: on('hardShanghaiChk'), final: on('finalShanghaiChk'),
    wildType: document.getElementById('wildTypeBtn').textContent,
    wildSwap: document.getElementById('wildSwapBtn').textContent,
    clock: document.getElementById('buyClockRange').value
  };
}

function buildDetailedPages() {
  const r = _rules();
  const pages = [];

  // 1. Summary
  let sm = '<p><strong>SHANGHAI</strong> is a rummy style card game containing seven rounds.</p>';
  sm += '<p>Players take turns with a mandatory action of drawing one card from either draw or discard pile, and discarding one card from his/her hand to the top of the discard pile</p>';
  sm += "<p>Each round players aim to collect that round's <strong>CONTRACT</strong> of <strong>SETS</strong> and/or <strong>RUNS</strong></p>";
  sm += '<p>A <strong>SET</strong> is 3+ cards of the same rank. A <strong>RUN</strong> is 4+ cards of the same suit in sequential order. '
      + (r.wrapRuns ? 'Aces may be high or low, and runs may wrap around (K-A-2-3).' : 'Aces are high or low, not both.') + '</p>';
  if (r.extraSuit) sm += '<p>A fifth suit, Stars (★), is added to every deck.</p>';
  if (r.wilds) {
    const wt = { Classic: 'The 3♦ and 3♥ are wild.', Extra: 'The 3♦, 3♥ and 3★ are wild.', Joker: 'Jokers are wild.' }[r.wildType] || '';
    sm += `<p><strong>WILD CARDS</strong> can assume <strong>ANY</strong> rank and/or suit but count 20 points if left in hand at round end. ${wt}</p>`;
  }
  sm += '<p>Once per round, when a player has collected the <strong>ENTIRE CONTRACT</strong> he/she may <strong>LAY DOWN</strong> the contract face up</p>';
  sm += '<p>After laying down, players may <strong>PLAY</strong> cards onto any laid down contract</p>';
  sm += '<p>The first player to discard their final card ends the round scoring <strong>ZERO POINTS</strong></p>';
  sm += '<p>The objective is to have the <strong>LOWEST SCORE</strong> after seven rounds</p>';
  pages.push({ id: 'summary', title: 'Detailed Summary', html: sm });

  // 2. Player actions
  pages.push({ id: 'actions', title: 'Player Actions', html:
    '<p><strong>Turn Phase:</strong> draw → lay down → play → discard</p>'
  + '<p><strong>Draw (mandatory)</strong>: Take a card from draw or discard pile</p>'
  + '<p><strong>Lay Down (optional)</strong>: Place the contract face-up once per round. You must hold at least one card in hand.</p>'
  + '<p><strong>Play (optional)</strong>: Play cards onto existing sets/runs after laying down</p>'
  + '<p><strong>Discard (mandatory)</strong>: Discard one card to end turn</p>'
  + '<p><strong>Buy (optional)</strong>: Take the top discard between turns (see Buying)</p>' });

  // 3. Contracts
  pages.push({ id: 'contracts', title: 'Contracts', html:
    '<p>Round 1: 2 Sets | Round 2: 1 Set + 1 Run | Round 3: 2 Runs</p>'
  + '<p>Round 4: 3 Sets | Round 5: 2 Sets + 1 Run | Round 6: 1 Set + 2 Runs</p>'
  + '<p>Round 7: 3 Runs</p>' });

  // 4. Buying
  let by = '<p><strong>Hand size:</strong> 10 cards dealt, plus 2 per buy (the discard plus a penalty card), up to 3 buys.</p>';
  by += `<p><strong>Buying clock:</strong> after each discard, players have ${r.clock} seconds to declare a buy.</p>`;
  by += '<p><strong>Take:</strong> the player whose turn is next may take the discard as their draw. A take halves the clock and beats any buy, and it can be declined.</p>';
  by += r.fastBuy ? '<p><strong>Fast Buying (on):</strong> first to declare gets the card.</p>'
                  : '<p><strong>Fast Buying (off):</strong> first in seat order gets the card.</p>';
  by += r.optOut  ? '<p><strong>Opt Out (on):</strong> you may withdraw your decision before the clock ends.</p>'
                  : '<p><strong>Opt Out (off):</strong> a declared buy is final.</p>';
  by += r.selfDiscard ? '<p><strong>Self-Discard (on):</strong> you may buy your own discard.</p>'
                      : '<p><strong>Self-Discard (off):</strong> you may not buy your own discard.</p>';
  pages.push({ id: 'buying', title: 'Buying', html: by });

  // 5. Wild swapping (only when wilds are on and swapping is enabled)
  if (r.wilds && r.wildSwap !== 'Off') {
    let ws = '<p><strong>Wild Swapping:</strong> replace a laid down wild card with the card it represents in a set/run.</p>';
    ws += r.wildSwap === 'Pre'
      ? '<p><strong>Pre laydown:</strong> swaps are allowed only before you lay down, and you must lay down that turn or the swaps are undone.</p>'
      : '<p><strong>Post laydown:</strong> swaps are allowed before or after laying down, but you must lay down that turn if you haven\'t, or the swaps are undone.</p>';
    pages.push({ id: 'swap', title: 'Wild Swapping', html: ws });
  }

  // 6. Scoring
  let sc = '<p>Aces=15, Face cards=10, Number cards=face value' + (r.wilds ? ', Wilds=20' : '') + '</p>';
  if (r.soft)  sc += '<p><strong>Soft Shanghai (+25):</strong> the first player to lay down goes out on a later turn, before any other player has laid down. Every other player scores +25.</p>';
  if (r.hard)  sc += '<p><strong>Shanghai (+50, ' + (r.final ? 'rounds 1–6' : 'every round') + '):</strong> the first player to lay down also goes out on that same turn. Every other player scores +50.</p>';
  if (r.final) sc += '<p><strong>Final Shanghai (+100, round 7):</strong> the same, in round 7' + (r.hard ? ' (replaces the +50 there)' : '') + '. Every other player scores +100.</p>';
  pages.push({ id: 'scoring', title: 'Scoring', html: sc });

  return pages;
}

function renderDetailed() {
  const body = document.getElementById('detailedBody');
  const title = document.getElementById('detailedTitle');
  if (!body || !title) return;
  const pages = buildDetailedPages();
  let idx = pages.findIndex(p => p.id === currentPageId);
  if (idx < 0) { idx = 0; currentPageId = pages[0].id; }   // e.g. the swap page was switched off
  body.innerHTML = pages[idx].html;
  title.textContent = pages[idx].title;
}

function stepDetailed(d) {
  const pages = buildDetailedPages();
  let idx = Math.max(0, pages.findIndex(p => p.id === currentPageId));
  idx = (idx + d + pages.length) % pages.length;
  currentPageId = pages[idx].id;
  renderDetailed();
}
document.getElementById('prevDetailed').addEventListener('click', () => stepDetailed(-1));
document.getElementById('nextDetailed').addEventListener('click', () => stepDetailed(1));
renderDetailed();

// Card customization
const suitData = [{key:"diamonds",symbol:"♦"},{key:"clubs",symbol:"♣"},{key:"hearts",symbol:"♥"},{key:"spades",symbol:"♠"},{key:"stars",symbol:"★"}];
const colors = [{name:"red",hex:"#c9302c"},{name:"orange",hex:"#e97311"},{name:"yellow",hex:"#ffff5c"},{name:"gold",hex:"#eedc82"},{name:"bright green",hex:"#01ff05"},{name:"hunter green",hex:"#0a5b23"},{name:"cyan",hex:"#00e9f1"},{name:"royal blue",hex:"#276ff7"},{name:"plum",hex:"#ae2cec"},{name:"pink",hex:"#FF5C77"},{name:"magenta",hex:"#FF00FF"},{name:"white",hex:"#fff"},{name:"light grey",hex:"#bbb"},{name:"dark grey",hex:"#555"},{name:"black",hex:"#000"}];

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
const tablecardPreview = document.getElementById("tablecardPreview");
const tablecardBackPreview = document.getElementById("tablecardBackPreview");

let selectedSuitKey = "hearts";
const suitColors = {};
const backColors = {center:"#000000",edge1:"#333333",edge2:"#666666",edge3:"#999999",outline:"#ffffff",edgeWidth:6};

function isExtraSuitEnabled() { return document.getElementById("extraSuitChk").checked; }

function buildSuitButtons() {
  suitsRow.innerHTML = "";
  let suitsToShow = suitData.filter(s => s.key !== "stars" || isExtraSuitEnabled());
  suitsToShow.forEach(({key,symbol}) => {
    const btn = document.createElement("button");
    btn.className = "suit-button";
    btn.setAttribute("data-key", key);
    btn.textContent = symbol;
    if (key === selectedSuitKey) btn.classList.add("selected");
    const bg = suitColors[key]?.background || "black";
    const sym = suitColors[key]?.symbol || "white";
    btn.style.backgroundColor = bg;
    btn.style.color = sym;
    suitsRow.appendChild(btn);
    btn.addEventListener("click", () => { selectedSuitKey = key; buildSuitButtons(); updateColorButtonsState(); updatePreview(); updateTablePreview(); });
  });
}

function updateColorButtonsState() {
  const selectedColors = suitColors[selectedSuitKey] || {symbol:"white",background:"black"};
  symbolColorBtn.disabled = !selectedSuitKey;
  bgColorBtn.disabled = !selectedSuitKey;
  if (!symbolColorBtn.disabled) symbolColorBtn.style.background = selectedColors.symbol;
  if (!bgColorBtn.disabled) bgColorBtn.style.background = selectedColors.background;
  backCenterColorBtn.style.backgroundColor = backColors.center;
  backEdgeColor1Btn.style.backgroundColor = backColors.edge1;
  backEdgeColor2Btn.style.backgroundColor = backColors.edge2;
  backEdgeColor3Btn.style.backgroundColor = backColors.edge3;
  backEdgeOutlineColorBtn.style.backgroundColor = backColors.outline;
}

function createColorSquares(selectedColorHex,disallowedColorHex) {
  colorsGrid.innerHTML = "";
  colors.forEach(({name,hex}) => {
    const square = document.createElement("div");
    square.className = "color-square";
    square.style.background = hex;
    if (hex === selectedColorHex) square.classList.add("selected");
    if (hex === disallowedColorHex) square.style.opacity = 0.3;
    colorsGrid.appendChild(square);
    if (hex !== disallowedColorHex) {
      square.addEventListener("click", () => {
        if (colorPickerMode === "symbol") {
          suitColors[selectedSuitKey] = suitColors[selectedSuitKey] || {};
          suitColors[selectedSuitKey].symbol = hex;
          colorPickerPopup.style.display = "none";
          buildSuitButtons();       // repaint suit row with new symbol color
          updateColorButtonsState();
          updatePreview();
          updateTablePreview();
        } else if (colorPickerMode === "background") {
          suitColors[selectedSuitKey] = suitColors[selectedSuitKey] || {};
          suitColors[selectedSuitKey].background = hex;
          colorPickerPopup.style.display = "none";
          buildSuitButtons();       // repaint suit row with new background color
          updateColorButtonsState();
          updatePreview();
          updateTablePreview();
        } else if (colorPickerMode.startsWith("back-")) {
          const colorPart = colorPickerMode.split("-").slice(1).join("-");
          backColors[colorPart] = hex;
          colorPickerPopup.style.display = "none";
          updateColorButtonsState();
          updateCardBackPreview();          // ← was missing
          updateTableCardBackPreview();     // ← was missing
          updatePreview();                  // face border uses backColors.outline
          updateTablePreview();
        }
        saveSettingsToCookies();
      });
    }
  });
}

let colorPickerMode = null;
symbolColorBtn.addEventListener("click", () => { if (!selectedSuitKey) return; colorPickerMode = "symbol"; createColorSquares(suitColors[selectedSuitKey]?.symbol || "#fff", suitColors[selectedSuitKey]?.background || "#000"); colorPickerPopup.style.display = "flex"; });
bgColorBtn.addEventListener("click", () => { if (!selectedSuitKey) return; colorPickerMode = "background"; createColorSquares(suitColors[selectedSuitKey]?.background || "#000", suitColors[selectedSuitKey]?.symbol || "#fff"); colorPickerPopup.style.display = "flex"; });
closeColorPickerBtn.addEventListener("click", () => { colorPickerPopup.style.display = "none"; });

suitSizeSlider.addEventListener("input", () => { updatePreview(); updateTablePreview(); });
rankSizeSlider.addEventListener("input", () => { updatePreview(); updateTablePreview(); });

backCenterColorBtn.addEventListener("click", () => { colorPickerMode = "back-center"; createColorSquares(backColors.center, null); colorPickerPopup.style.display = "flex"; });
backEdgeColor1Btn.addEventListener("click", () => { colorPickerMode = "back-edge1"; createColorSquares(backColors.edge1, null); colorPickerPopup.style.display = "flex"; });
backEdgeColor2Btn.addEventListener("click", () => { colorPickerMode = "back-edge2"; createColorSquares(backColors.edge2, null); colorPickerPopup.style.display = "flex"; });
backEdgeColor3Btn.addEventListener("click", () => { colorPickerMode = "back-edge3"; createColorSquares(backColors.edge3, null); colorPickerPopup.style.display = "flex"; });
backEdgeOutlineColorBtn.addEventListener("click", () => { colorPickerMode = "back-outline"; createColorSquares(backColors.outline, null); colorPickerPopup.style.display = "flex"; });

// Previews mirror the real card renderer (cardRenderer.createCardDiv):
//   hand / piles : card 112x152 (hand 72x96 has the same proportions), font = size x 0.65
//   contract area / computer hands : card 45x65, font = size x 0.28
// Both are drawn at a fixed zoom so the suit/rank sizes look exactly as in the game.
function _drawPreview(el, w, h, zoom, factor) {
  if (!selectedSuitKey) return;
  el.innerHTML = "";
  const sc        = suitColors[selectedSuitKey] || {};
  const suitColor = sc.symbol || "white";
  const bgColor   = sc.background || "black";
  const suitSz    = +suitSizeSlider.value;
  const rankSz    = +rankSizeSlider.value;
  el.style.cssText = [
    `width:${w}px`, `height:${h}px`, `border-radius:${Math.round(8 * zoom)}px`, "position:relative",
    "box-sizing:border-box", "overflow:hidden", "display:flex", "justify-content:center", "align-items:center",
    `background-color:${bgColor}`,
    `border:${Math.max(2, Math.round(2 * zoom))}px solid ${sc.outline || "#333"}`,
    "box-shadow:0 0 10px rgba(0,0,0,0.7)", "font-family:Arial,sans-serif", "font-weight:bold",
  ].join(";");
  const rankElem = document.createElement("div");
  rankElem.className = "rank";
  rankElem.textContent = "A";
  rankElem.style.cssText = `color:${suitColor};font-size:${Math.round(rankSz * factor * zoom)}px;position:absolute;top:6%;right:7%;line-height:1;white-space:nowrap;user-select:none;pointer-events:none;`;
  el.appendChild(rankElem);
  const suitElem = document.createElement("div");
  suitElem.className = "suit-symbol";
  suitElem.textContent = suitData.find(s => s.key === selectedSuitKey)?.symbol || "?";
  suitElem.style.cssText = `color:${suitColor};font-size:${Math.round(suitSz * factor * zoom)}px;pointer-events:none;user-select:none;`;
  el.appendChild(suitElem);
}

function updatePreview()      { _drawPreview(cardPreview,      160, 217, 160 / 112, 0.65); }
function updateTablePreview() { _drawPreview(tablecardPreview,  75, 108,  75 / 45,  0.28); }

function updateCardBackPreview() {
  const c = backColors;
  // Set each property individually so we never accidentally wipe dimensions.
  cardBackPreview.style.background  = `radial-gradient(circle at center,${c.center} 0%,${c.edge1} 25%,${c.edge2} 50%,${c.edge3} 75%,${c.edge3} 80%)`;
  cardBackPreview.style.border      = `${c.edgeWidth || 2}px solid ${c.outline}`;
  cardBackPreview.style.boxSizing   = "border-box";
  cardBackPreview.style.width       = "160px";
  cardBackPreview.style.height      = "217px";
  cardBackPreview.style.borderRadius = "11px";
  cardBackPreview.style.boxShadow   = "0 0 10px rgba(0,0,0,0.6)";
}

function updateTableCardBackPreview() {
  const c = backColors;
  tablecardBackPreview.style.background   = `radial-gradient(circle at center,${c.center} 0%,${c.edge1} 25%,${c.edge2} 50%,${c.edge3} 75%,${c.edge3} 80%)`;
  tablecardBackPreview.style.border       = `${c.edgeWidth || 2}px solid ${c.outline}`;
  tablecardBackPreview.style.boxSizing    = "border-box";
  tablecardBackPreview.style.width        = "75px";
  tablecardBackPreview.style.height       = "108px";
  tablecardBackPreview.style.borderRadius = "8px";
  tablecardBackPreview.style.boxShadow    = "0 0 10px rgba(0,0,0,0.6)";
}

document.getElementById("extraSuitChk").addEventListener("change", () => {
  if (!isExtraSuitEnabled() && wildTypeBtn.textContent === 'Extra') { wildTypeBtn.textContent = 'Classic'; wtIndex = 0; updateSummary(); }
  buildSuitButtons();
  if (!isExtraSuitEnabled() && selectedSuitKey === "stars") selectedSuitKey = "hearts";
  updateColorButtonsState();
  updatePreview();
  updateTablePreview();
});

function initializeSuitColors() {
  suitData.forEach(({key}) => { if (!suitColors[key]) suitColors[key] = {symbol:"white",background:"black"}; });
}

// Settings storage.
// Browsers (Chrome especially) silently refuse cookies for pages opened straight
// from disk (file:// — e.g. double-clicking index.html), so every value is also
// mirrored into localStorage, which does work there. Reads try the cookie first
// and fall back to the mirror, so hosted (http/https) play behaves as before.
function setCookie(name,value,days=365) {
  try {
    const expires = new Date(Date.now()+days*24*60*60*1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
  } catch {}
  try { localStorage.setItem('cookie:' + name, value); } catch {}
}

function getCookie(name) {
  if (document.cookie) {
    for (const pair of document.cookie.split('; ')) {
      const i = pair.indexOf('=');
      if (i === -1) continue;
      const k = pair.substring(0, i);
      if (k !== name) continue;
      try { return decodeURIComponent(pair.substring(i + 1)); }
      catch { return pair.substring(i + 1); }
    }
  }
  try { return localStorage.getItem('cookie:' + name); } catch {}
  return null;
}

function saveSettingsToCookies() {
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
    finalShanghaiChk: document.getElementById('finalShanghaiChk').checked,
    debugAiChk: document.getElementById('debugAiChk').checked
  };
  setCookie('customRules', JSON.stringify(customRules));

  const humanName = document.getElementById('humanNameInput').value;
  const numComp = numComputers;
  const compNames = [], compDifficulties = [];
  document.querySelectorAll('#playersGrid .player-slot').forEach((slot,i) => {
    if (i < numComp) {
      const nameInput = slot.querySelector('input.player-name-input');
      const diffBtn = slot.querySelector('button.difficulty-btn');
      compNames.push(nameInput ? nameInput.value : `Computer ${i+1}`);
      compDifficulties.push(diffBtn ? diffBtn.textContent : "Medium");
    }
  });
  setCookie('playersData', JSON.stringify({humanName,numComp,compNames,compDifficulties}));

  const cardCustom = {suitColors,backColors,selectedSuitKey,suitSize:+document.getElementById('suitSizeSlider').value,rankSize:+document.getElementById('rankSizeSlider').value};
  setCookie('cardCustom', JSON.stringify(cardCustom));
}

function loadSettingsFromCookies() {
  const customRulesCookie = getCookie('customRules');
  if (customRulesCookie) {
    try {
      const cr = JSON.parse(customRulesCookie);
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
      document.getElementById('debugAiChk').checked = cr.debugAiChk ?? false;

      if (cr.buyClock !== undefined) {
        document.getElementById('buyClockRange').value = cr.buyClock;
        updateBuyClock();
      }
      if (cr.wildType) {
        wtIndex = wildTypes.indexOf(cr.wildType);
        if (wtIndex === -1 || !allowedWildTypes().includes(cr.wildType)) wtIndex = 0;
        document.getElementById('wildTypeBtn').textContent = wildTypes[wtIndex];
      }
      if (cr.wildSwap) {
        document.getElementById('wildSwapBtn').textContent = cr.wildSwap;
        wsIndex = wildSwapStates.indexOf(cr.wildSwap);
        if (wsIndex === -1) wsIndex = 0;
      }
      updateSummary();
      updateWildButtons();
    } catch (e) {}
  }

  const playersCookie = getCookie('playersData');
  if (playersCookie) {
    try {
      const pd = JSON.parse(playersCookie);
      if (pd.humanName) document.getElementById('humanNameInput').value = String(pd.humanName).slice(0, NAME_MAX);
      if (pd.numComp) numComputers = pd.numComp;
      buildPlayerSlots();
      if (Array.isArray(pd.compNames)) {
        const slots = document.querySelectorAll('#playersGrid .player-slot');
        pd.compNames.forEach((name,i) => { if (slots[i]) { const nameInput = slots[i].querySelector('input.player-name-input'); if(nameInput) nameInput.value = String(name).slice(0, NAME_MAX); }});
      }
      if (Array.isArray(pd.compDifficulties)) {
        const slots = document.querySelectorAll('#playersGrid .player-slot');
        pd.compDifficulties.forEach((diff,i) => { if (slots[i]) { const diffBtn = slots[i].querySelector('button.difficulty-btn'); diffBtn.textContent = diff; diffBtn.className = 'difficulty-btn ' + diff.toLowerCase(); }});
      }
      numCompDisplay.textContent = numComputers;
    } catch (e) {}
  }

  const cardCustomCookie = getCookie('cardCustom');
  if (cardCustomCookie) {
    try {
      const cc = JSON.parse(cardCustomCookie);
      if (cc.suitColors) Object.keys(cc.suitColors).forEach(k => suitColors[k] = cc.suitColors[k]);
      if (cc.backColors) Object.assign(backColors, cc.backColors);
      if (cc.selectedSuitKey) selectedSuitKey = cc.selectedSuitKey;
      if (cc.suitSize) document.getElementById('suitSizeSlider').value = cc.suitSize;
      if (cc.rankSize) document.getElementById('rankSizeSlider').value = cc.rankSize;
      buildSuitButtons();
      updateColorButtonsState();
      updatePreview();
      updateCardBackPreview();
      updateTablePreview();
      updateTableCardBackPreview();
    } catch (e) {}
  }
}

window.addEventListener('load', () => {
  loadSettingsFromCookies();
  updateWildButtons();
  applyDebugState();
  updateSummary();
  if (document.getElementById('tab-summary').classList.contains('active')) {
    document.getElementById('tooltipBar').style.display = 'none';
  }
});

document.querySelectorAll('#content-custom input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', () => { saveSettingsToCookies(); updateSummary(); });
});
document.getElementById('wildTypeBtn').addEventListener('click', () => { saveSettingsToCookies(); updateSummary(); });
document.getElementById('wildSwapBtn').addEventListener('click', () => { saveSettingsToCookies(); updateSummary(); });
document.getElementById('buyClockRange').addEventListener('input', () => { saveSettingsToCookies(); updateSummary(); });
document.getElementById('humanNameInput').addEventListener('input', saveSettingsToCookies);
document.getElementById('debugAiChk').addEventListener('change', saveSettingsToCookies);
document.getElementById('decComp').addEventListener('click', saveSettingsToCookies);
document.getElementById('incComp').addEventListener('click', saveSettingsToCookies);
document.getElementById('randomizeBtn').addEventListener('click', saveSettingsToCookies);
document.getElementById('playersGrid').addEventListener('click', e => { if (e.target.classList.contains('difficulty-btn')) saveSettingsToCookies(); });

[symbolColorBtn, bgColorBtn, backCenterColorBtn, backEdgeColor1Btn, backEdgeColor2Btn, backEdgeColor3Btn, backEdgeOutlineColorBtn].forEach(el => {
  el.addEventListener('click', () => { setTimeout(saveSettingsToCookies, 300); });
});
suitSizeSlider.addEventListener('input', saveSettingsToCookies);
rankSizeSlider.addEventListener('input', saveSettingsToCookies);

initializeSuitColors();
buildSuitButtons();
updateColorButtonsState();
updatePreview();
updateTablePreview();
updateCardBackPreview();
updateTableCardBackPreview();

document.querySelector('.start-btn').addEventListener('click', () => {
  // Names must be filled in and unique: show the problem on the Players tab instead of starting.
  const problem = validatePlayers();
  if (problem) { document.getElementById('tab-players').click(); return; }
  const humanName   = document.getElementById('humanNameInput').value.trim() || 'Player1';
  const debugAI     = document.getElementById('debugAiChk').checked;
  const compNames   = [];
  const compDifficulties = [];

  document.querySelectorAll('#playersGrid .player-slot:not(.inactive)').forEach((slot, i) => {
    const input   = slot.querySelector('input.player-name-input');
    const diffBtn = slot.querySelector('button.difficulty-btn');
    if (input) {
      const val = input.value.trim();
      if (val) {
        compNames.push(val);
        compDifficulties.push(diffBtn ? diffBtn.textContent : 'Medium');
      }
    }
  });

  // Debug mode: nobody human. Only the computer players take part (they need at least 3).
  const playerNames = debugAI ? [...compNames] : [humanName, ...compNames];
  if (playerNames.length < 3) {
    alert(debugAI ? 'Debug mode has no human player, so it needs at least 3 computer players.'
                  : 'Please have at least 3 players to start the game.');
    return;
  }

  localStorage.setItem('gameSetup', JSON.stringify({
    playerNames,
    isAI:        debugAI ? compNames.map(() => true) : [false, ...compNames.map(() => true)],
    difficulties: debugAI ? [...compDifficulties] : [null, ...compDifficulties],
    debug:       debugAI
  }));

  window.location.href = 'table.html';
});
