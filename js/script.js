// script.js — versión corregida con render parcial y overlay oculto
const COLS = 6;
const ROWS = 4;
const N = COLS * ROWS;

const boardEl = document.getElementById('board');
const movesEl = document.getElementById('moves');
const timeEl = document.getElementById('time');
const overlay = document.getElementById('overlay');
const closeOverlayBtn = document.getElementById('closeOverlay');

let tileOrder = [];
let solvedOrder = [];
let selectedIndex = null;
let moves = 0;
let seconds = 0;
let timer = null;
const prevCorrect = new Set();

const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
try { audioCtx = new AudioCtx(); } catch(e) { audioCtx = null; }

function playTone(freq=880, dur=0.08, when=0) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime + when;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.value = 0.001;
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(now);
  g.gain.setValueAtTime(0.001, now);
  g.gain.linearRampToValueAtTime(0.12, now + 0.01);
  g.gain.linearRampToValueAtTime(0.001, now + dur);
  o.stop(now + dur + 0.02);
}

function makeSolvedOrder() {
  solvedOrder = Array.from({length: N}, (_, i) => i + 1);
  tileOrder = [...solvedOrder];
  prevCorrect.clear();
}

function setImgSrcWithFallback(imgEl, num) {
  const exts = ['jpg','png','webp','jpeg'];
  let idx = 0;
  imgEl.style.visibility = 'hidden';
  imgEl.onload = () => { imgEl.style.visibility = 'visible'; };
  imgEl.onerror = null; // reset
  function tryNext() {
    if (idx >= exts.length) {
      imgEl.removeAttribute('src');
      imgEl.style.visibility = 'hidden';
      return;
    }
    const src = `img/${num}.${exts[idx]}`;
    imgEl.onerror = () => { idx++; tryNext(); };
    imgEl.src = src;
  }
  tryNext();
}

// ---- Render parcial: crea tiles la primera vez, luego solo actualiza los que cambian ----
function renderBoard(initial = false) {
  if (boardEl.children.length !== N || initial) {
    boardEl.innerHTML = '';
    for (let i = 0; i < N; i++) {
      const tileNum = tileOrder[i];
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.pos = i;
      tile.dataset.tile = tileNum;

      const img = document.createElement('img');
      img.alt = `pieza ${tileNum}`;
      setImgSrcWithFallback(img, tileNum);
      tile.appendChild(img);

      if (i === selectedIndex) tile.classList.add('selected');
      if (tileNum === solvedOrder[i]) tile.classList.add('correct');

      tile.addEventListener('click', () => onTileClicked(i));
      boardEl.appendChild(tile);
    }
  } else {
    // actualizar solo cambios (mejor performance, menos reflow)
    for (let i = 0; i < N; i++) {
      const tileNum = tileOrder[i];
      const tile = boardEl.children[i];
      if (!tile) continue;
      // actualizar dataset y clases
      tile.dataset.tile = tileNum;
      if (i === selectedIndex) tile.classList.add('selected'); else tile.classList.remove('selected');

      // actualizar si es correcta
      if (tileNum === solvedOrder[i]) tile.classList.add('correct'); else tile.classList.remove('correct');

      // actualizar imagen (si cambió)
      const img = tile.querySelector('img');
      if (!img || String(img.alt) !== `pieza ${tileNum}`) {
        // reemplazar imagen
        const newImg = document.createElement('img');
        newImg.alt = `pieza ${tileNum}`;
        setImgSrcWithFallback(newImg, tileNum);
        // quitar antiguo y poner nuevo
        if (img) tile.replaceChild(newImg, img);
        else tile.appendChild(newImg);
      } else {
        // si solo cambió el número (sin reemplazo), aseguramos alt correcto
        if (img && img.alt !== `pieza ${tileNum}`) img.alt = `pieza ${tileNum}`;
      }
    }
  }
  updateHUD();
}

function updateHUD() {
  if (movesEl) movesEl.textContent = moves;
  if (timeEl) timeEl.textContent = formatTime(seconds);
}
function formatTime(s) {
  const mm = String(Math.floor(s/60)).padStart(2,'0');
  const ss = String(s%60).padStart(2,'0');
  return `${mm}:${ss}`;
}

function onTileClicked(pos) {
  if (selectedIndex === null) {
    selectedIndex = pos;
    renderBoard();
    return;
  }
  if (selectedIndex === pos) {
    selectedIndex = null;
    renderBoard();
    return;
  }
  swapIndices(selectedIndex, pos);
  moves++;
  startTimerIfNeeded();
  // actualizamos solo los dos índices intercambiados para evitar re-render global
  renderPartialSwap(selectedIndex, pos);
  checkAndMarkAfterSwap([selectedIndex, pos]);
  checkSolved();
  selectedIndex = null;
}

function swapIndices(a,b) {
  [tileOrder[a], tileOrder[b]] = [tileOrder[b], tileOrder[a]];
}

function renderPartialSwap(a, b) {
  // actualiza los dos nodos afectados
  [a, b].forEach(i => {
    const tileNum = tileOrder[i];
    const tile = boardEl.children[i];
    if (!tile) return;
    tile.dataset.tile = tileNum;
    const img = tile.querySelector('img');
    if (!img || img.alt !== `pieza ${tileNum}`) {
      const newImg = document.createElement('img');
      newImg.alt = `pieza ${tileNum}`;
      setImgSrcWithFallback(newImg, tileNum);
      if (img) tile.replaceChild(newImg, img);
      else tile.appendChild(newImg);
    }
    // classes
    tile.classList.remove('selected','correct','new-correct');
    if (tileNum === solvedOrder[i]) tile.classList.add('correct');
  });
  updateHUD();
}

function checkAndMarkAfterSwap(indices = null) {
  // si no pasan indices, revisa todo (menos eficiente)
  const start = (indices && indices.length) ? indices : Array.from({length:N}, (_,i)=>i);
  for (let i of start) {
    const isCorrectNow = tileOrder[i] === solvedOrder[i];
    if (isCorrectNow && !prevCorrect.has(i)) {
      prevCorrect.add(i);
      const node = boardEl.children[i];
      if (node) {
        node.classList.add('correct');
        node.classList.add('new-correct');
        setTimeout(() => node.classList.remove('new-correct'), 900);
      }
      playTone(880, 0.08);
    } else if (!isCorrectNow && prevCorrect.has(i)) {
      prevCorrect.delete(i);
      const node = boardEl.children[i];
      if (node) node.classList.remove('correct');
    }
  }
}

window.addEventListener('keydown', (e) => {
  if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  if (selectedIndex === null) {
    selectedIndex = 0;
    renderBoard();
    return;
  }
  const r = Math.floor(selectedIndex / COLS);
  const c = selectedIndex % COLS;
  let target = null;
  if (e.key === 'ArrowUp' && r > 0) target = selectedIndex - COLS;
  if (e.key === 'ArrowDown' && r < ROWS - 1) target = selectedIndex + COLS;
  if (e.key === 'ArrowLeft' && c > 0) target = selectedIndex - 1;
  if (e.key === 'ArrowRight' && c < COLS - 1) target = selectedIndex + 1;
  if (target !== null) {
    swapIndices(selectedIndex, target);
    moves++;
    startTimerIfNeeded();
    renderPartialSwap(selectedIndex, target);
    checkAndMarkAfterSwap([selectedIndex, target]);
    checkSolved();
    selectedIndex = target;
  }
});

function shuffle(times = 1) {
  if (timer) { clearInterval(timer); timer = null; }
  tileOrder = [...solvedOrder];
  for (let i = tileOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tileOrder[i], tileOrder[j]] = [tileOrder[j], tileOrder[i]];
  }
  while (tileOrder.every((v, idx) => v === solvedOrder[idx])) {
    for (let i = tileOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tileOrder[i], tileOrder[j]] = [tileOrder[j], tileOrder[i]];
    }
  }
  prevCorrect.clear();
  selectedIndex = null;
  moves = 0;
  seconds = 0;
  updateHUD();
  // render inicial completo para establecer DOM
  renderBoard(true);
  timer = setInterval(()=> { seconds++; updateHUD(); }, 1000);
}

function resetBoard() {
  if (timer) { clearInterval(timer); timer = null; }
  prevCorrect.clear();
  tileOrder = [...solvedOrder];
  selectedIndex = null;
  moves = 0;
  seconds = 0;
  updateHUD();
  renderBoard(true);
}

function checkSolved() {
  const ok = tileOrder.every((v, i) => v === i + 1);
  if (!ok) return false;

  if (timer) { 
    clearInterval(timer); 
    timer = null; 
  }
  setTimeout(() => {
    playTone(660, 0.2);
    setTimeout(()=> playTone(880, 0.15), 120);
    alert(`¡Felicidades! Completaste el puzzle en ${moves} movimientos y ${formatTime(seconds)}.`);
  }, 120);
  return true;
}


function startTimerIfNeeded() {
  if (!timer) timer = setInterval(()=> { seconds++; updateHUD(); }, 1000);
}

// UI buttons
const btnShuffle = document.getElementById('shuffle');
const btnReset = document.getElementById('reset');
const btnShow = document.getElementById('show');

if (btnShuffle) btnShuffle.addEventListener('click', ()=> shuffle());
if (btnReset) btnReset.addEventListener('click', ()=> resetBoard());
if (btnShow && overlay) btnShow.addEventListener('click', ()=> overlay.classList.remove('hidden'));
if (closeOverlayBtn) closeOverlayBtn.addEventListener('click', ()=> overlay.classList.add('hidden'));

// INIT
makeSolvedOrder();
renderBoard(true);
