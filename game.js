'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (gris metálico)
  '#f06292', // + - cruz (rosa)
  '#4db6ac', // U - teal
  '#ffee58', // Y - amarillo limón
  '#ffffff', // 1x1 - single (blanco)
  '#212121', // 13 bomba
  '#fff176', // 14 rayo
  '#ce93d8', // 15 tinte
  '#a1887f', // 16 gravedad
  '#80deea', // 17 congelar
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (hueco central)
  [[0,9,0],[9,9,9],[0,9,0]],                  // + - cruz
  [[10,0,10],[10,10,10]],                     // U
  [[11,0,11],[0,11,0],[0,11,0]],              // Y
  [[12]],                                      // 1x1 - recompensa tras Tetris
  [[13]], [[14]], [[15]], [[16]], [[17]],      // power-ups: bomba, rayo, tinte, gravedad, congelar
];
const SINGLE = 12; // fuera del sorteo aleatorio
const POWER = 13;  // primer índice de power-up (13–17)
const NAMES = { 13: '💣 Bomba', 14: '⚡ Rayo', 15: '🎨 Tinte', 16: '⬇ Gravedad', 17: '❄ Congelar' };
const TINT_COLOR = '#7a7a3a'; // oliva turbio, "incómodo"
const POWER_EVERY = 5;        // líneas entre power-ups

const LINE_SCORES = [0, 100, 300, 500, 800];
const TSPIN_SCORES = [400, 800, 1200, 1600]; // 0–3 líneas
const PERFECT_BONUS = 3000;
const MAX_COMBO = 10;
const POPUP_LIFE = 1200;
const FLASH_LIFE = 250;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');

let gridColor = '#22222e';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, tintLeft, freezeLeft, flashText, flashLeft;
let combo, b2b, lastRotate, popups, shakeLeft, shakeMag, flashRows, flashRowsLeft;
let audioCtx;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  return makePiece(Math.floor(Math.random() * (SINGLE - 1)) + 1);
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      lastRotate = true;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

// Quita las filas llenas y devuelve sus índices originales (el puntaje lo calcula lockPiece).
function clearLines() {
  const full = [];
  for (let r = 0; r < ROWS; r++) if (board[r].every(v => v !== 0)) full.push(r);
  for (let i = full.length - 1; i >= 0; i--) {
    board.splice(full[i], 1);
    board.unshift(new Array(COLS).fill(0));
  }
  if (full.length) {
    lines += full.length;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  }
  return full;
}

// T-spin: pieza T, último movimiento fue rotación y ≥3 esquinas del centro ocupadas.
function isTSpin() {
  if (current.type !== 3 || !lastRotate) return false;
  const cx = current.x + 1, cy = current.y + 1;
  let n = 0;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + dx, y = cy + dy;
    if (x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x])) n++;
  }
  return n >= 3;
}

function popup(text) {
  popups.push({ text, life: POPUP_LIFE });
}

function beep(freq, dur = 0.12, delay = 0) {
  try {
    audioCtx = audioCtx || new AudioContext();
    const t = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch (e) { /* sin Web Audio: se juega sin sonido */ }
}

function arpeggio(base) {
  [1, 1.25, 1.5].forEach((m, i) => beep(base * m, 0.15, i * 0.08));
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    lastRotate = false;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function applyPower(p) {
  const x = p.x, y = p.y;
  if (p.type !== 15 && p.type !== 17) { flashText = NAMES[p.type]; flashLeft = 1500; } // tinte/congelar ya tienen cuenta atrás
  switch (p.type) {
    case 13: // bomba 3x3
      for (let r = y - 1; r <= y + 1; r++)
        for (let c = x - 1; c <= x + 1; c++)
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
      break;
    case 14: // rayo: limpia la fila
      board.splice(y, 1);
      board.unshift(new Array(COLS).fill(0));
      break;
    case 15: tintLeft = 10000; break;
    case 16: // gravedad: compacta cada columna hacia abajo
      for (let c = 0; c < COLS; c++) {
        const col = [];
        for (let r = ROWS - 1; r >= 0; r--) if (board[r][c]) col.push(board[r][c]);
        for (let r = ROWS - 1, i = 0; r >= 0; r--, i++) board[r][c] = col[i] || 0;
      }
      break;
    case 17: freezeLeft = 5000; break;
  }
}

function lockPiece() {
  const before = lines;
  const tspin = current.type < POWER && isTSpin(); // antes de merge: las esquinas no incluyen la propia T
  if (current.type >= POWER) applyPower(current); else merge();
  const nut = current.type === 8 ? 2 : 1; // tuerca: bonus ×2
  const rows = clearLines();
  const cleared = rows.length;
  if (cleared) {
    combo = Math.min(combo + 1, MAX_COMBO);
    const hard = cleared === 4 || tspin;
    let pts = (tspin ? TSPIN_SCORES[Math.min(cleared, 3)] : LINE_SCORES[cleared]) * level * nut * combo;
    if (hard && b2b) pts *= 1.5;
    const perfect = board.every(r => r.every(v => !v));
    if (perfect) pts += PERFECT_BONUS * level;
    score += Math.floor(pts);

    if (tspin) popup(`T-SPIN ${['', 'SINGLE', 'DOUBLE', 'TRIPLE'][Math.min(cleared, 3)]}`);
    else if (cleared === 4) popup('TETRIS');
    if (hard && b2b) popup('BACK-TO-BACK ×1.5');
    if (combo > 1) popup(`COMBO ×${combo}`);
    if (perfect) popup('PERFECT CLEAR');
    b2b = hard;

    flashRows = rows;
    flashRowsLeft = FLASH_LIFE;
    const big = hard || perfect;
    shakeMag = big ? 6 : Math.min(combo, 6);
    shakeLeft = big ? 400 : 150 + combo * 30;
    if (big) arpeggio(440 * 2 ** ((combo - 1) / 12));
    else beep(440 * 2 ** ((combo - 1) / 12));
  } else {
    combo = 0; // el B2B solo se rompe con una limpieza no difícil
    if (tspin) {
      score += TSPIN_SCORES[0] * level;
      popup('T-SPIN');
      beep(660);
    }
  }
  updateHUD();
  spawn();
  if (gameOver) return;
  if (Math.floor(lines / POWER_EVERY) > Math.floor(before / POWER_EVERY))
    next = makePiece(POWER + Math.floor(Math.random() * 5)); // power-up tiene prioridad
  else if (cleared === 4) next = makePiece(SINGLE); // recompensa tras Tetris
  else return;
  drawNext();
}

function spawn() {
  current = next;
  lastRotate = false;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  comboEl.textContent = combo > 1 ? `×${combo}` : '—';
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = tintLeft > 0 && context === ctx ? TINT_COLOR : COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  if (shakeLeft > 0) ctx.translate((Math.random() - 0.5) * 2 * shakeMag, (Math.random() - 0.5) * 2 * shakeMag);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  // etiquetas de power-up apiladas arriba a la izquierda
  const labels = [];
  if (current.type >= POWER) labels.push(NAMES[current.type]);
  if (flashLeft > 0) labels.push(flashText);
  if (tintLeft > 0) labels.push(`🎨 ${Math.ceil(tintLeft / 1000)}s`);
  if (freezeLeft > 0) labels.push(`❄ ${Math.ceil(freezeLeft / 1000)}s`);
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  labels.forEach((t, i) => {
    ctx.strokeStyle = '#000000b0';
    ctx.strokeText(t, 6, 6 + i * 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(t, 6, 6 + i * 20);
  });

  // destello de las filas recién limpiadas
  if (flashRowsLeft > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.8 * flashRowsLeft / FLASH_LIFE})`;
    flashRows.forEach(r => ctx.fillRect(0, r * BLOCK, COLS * BLOCK, BLOCK));
  }
  ctx.restore();

  // popups flotantes (fuera de la sacudida para que el texto sea legible)
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  popups.forEach((p, i) => {
    const k = p.life / POPUP_LIFE;
    const y = canvas.height / 2 + i * 34 - (1 - k) * 40;
    ctx.globalAlpha = Math.min(1, k * 2);
    ctx.strokeStyle = '#000000c0';
    ctx.strokeText(p.text, canvas.width / 2, y);
    ctx.fillStyle = '#ffeb3b';
    ctx.fillText(p.text, canvas.width / 2, y);
  });
  ctx.globalAlpha = 1;
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  tintLeft = Math.max(0, tintLeft - dt);
  flashLeft = Math.max(0, flashLeft - dt);
  shakeLeft = Math.max(0, shakeLeft - dt);
  flashRowsLeft = Math.max(0, flashRowsLeft - dt);
  popups.forEach(p => { p.life -= dt; });
  popups = popups.filter(p => p.life > 0);
  if (freezeLeft > 0) { freezeLeft = Math.max(0, freezeLeft - dt); dropAccum = 0; }
  else dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
      lastRotate = false;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() cancela el frame, pero loop lo re-agendaba y el juego seguía bajo el overlay
  if (!gameOver) animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  tintLeft = 0;
  freezeLeft = 0;
  flashLeft = 0;
  combo = 0;
  b2b = false;
  lastRotate = false;
  popups = [];
  shakeLeft = 0;
  shakeMag = 0;
  flashRows = [];
  flashRowsLeft = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) { current.x--; lastRotate = false; }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) { current.x++; lastRotate = false; }
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function applyTheme(light) {
  if (light) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  themeToggle.setAttribute('aria-pressed', String(light));
  themeToggle.setAttribute('aria-label', light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  themeToggle.querySelector('.theme-icon').textContent = light ? '☀' : '☁';
  themeToggle.querySelector('.theme-label').textContent = light ? 'LIGHT' : 'DARK';
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  // con el loop detenido (pausa/game over) hay que redibujar a mano
  if (current && (paused || gameOver)) {
    draw();
    drawNext();
  }
}

themeToggle.addEventListener('click', () => {
  applyTheme(themeToggle.getAttribute('aria-pressed') !== 'true');
  themeToggle.blur(); // evita que Space (hard drop) reactive el botón
});

applyTheme(false);

init();
