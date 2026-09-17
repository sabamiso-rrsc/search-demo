const canvas = document.querySelector('#maze');
const ctx = canvas.getContext('2d');
const frame = document.querySelector('#maze-frame');

const COLS = 31;
const ROWS = 19;
const OPEN = 0;
const WALL = 1;
const START_DELAY = 650;
const RESULT_HOLD = 2200;

const ui = {
  algorithmButtons: [...document.querySelectorAll('[data-algorithm]')],
  speed: document.querySelector('#speed'),
  speedLabel: document.querySelector('#speed-label'),
  newMaze: document.querySelector('#new-maze'),
  status: document.querySelector('#status'),
  statusText: document.querySelector('#status-text'),
  mazeHeading: document.querySelector('#maze-heading'),
  visitedCount: document.querySelector('#visited-count'),
  frontierCount: document.querySelector('#frontier-count'),
  pathCount: document.querySelector('#path-count'),
  frontierTitle: document.querySelector('#frontier-title'),
  frontierSubtitle: document.querySelector('#frontier-subtitle'),
  frontierTrack: document.querySelector('#frontier-track'),
  algorithmNote: document.querySelector('#algorithm-note'),
  currentLabel: document.querySelector('#current-label'),
};

const state = {
  grid: [],
  start: { x: 1, y: 1 },
  goal: { x: COLS - 2, y: ROWS - 2 },
  algorithm: 'bfs',
  frontier: [],
  discovered: new Set(),
  visited: new Set(),
  parents: new Map(),
  path: [],
  current: null,
  initialized: false,
  finished: false,
  timer: null,
  runToken: 0,
  layout: { width: 0, height: 0, cellSize: 0, offsetX: 0, offsetY: 0 },
};

const keyOf = point => `${point.x},${point.y}`;
const pointFromKey = key => {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
};

function makeGrid(fill = OPEN) {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(fill));
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function generateMaze() {
  const grid = makeGrid(WALL);
  const stack = [{ x: 1, y: 1 }];
  const directions = [
    { x: 0, y: -2 },
    { x: 2, y: 0 },
    { x: 0, y: 2 },
    { x: -2, y: 0 },
  ];
  grid[1][1] = OPEN;

  while (stack.length) {
    const current = stack[stack.length - 1];
    const choices = shuffle([...directions])
      .map(direction => ({ x: current.x + direction.x, y: current.y + direction.y }))
      .filter(next => (
        next.x > 0 && next.x < COLS - 1 &&
        next.y > 0 && next.y < ROWS - 1 &&
        grid[next.y][next.x] === WALL
      ));

    if (!choices.length) {
      stack.pop();
      continue;
    }

    const next = choices[0];
    grid[(current.y + next.y) / 2][(current.x + next.x) / 2] = OPEN;
    grid[next.y][next.x] = OPEN;
    stack.push(next);
  }

  const loopCandidates = [];
  for (let y = 2; y < ROWS - 2; y++) {
    for (let x = 2; x < COLS - 2; x++) {
      if (grid[y][x] !== WALL) continue;
      const horizontal = grid[y][x - 1] === OPEN && grid[y][x + 1] === OPEN;
      const vertical = grid[y - 1][x] === OPEN && grid[y + 1][x] === OPEN;
      if (horizontal || vertical) loopCandidates.push({ x, y });
    }
  }
  shuffle(loopCandidates).slice(0, 14).forEach(({ x, y }) => { grid[y][x] = OPEN; });

  state.grid = grid;
  state.start = { x: 1, y: 1 };
  state.goal = { x: COLS - 2, y: ROWS - 2 };
}

function resetSearch() {
  clearTimer();
  state.frontier = [];
  state.discovered = new Set();
  state.visited = new Set();
  state.parents = new Map();
  state.path = [];
  state.current = null;
  state.initialized = false;
  state.finished = false;
  updateUI();
  draw();
}

function initializeSearch() {
  state.frontier = [{ ...state.start }];
  state.discovered = new Set([keyOf(state.start)]);
  state.initialized = true;
  setStatus('searching', `${state.algorithm.toUpperCase()}で探索中`);
  updateUI();
}

function getNeighbors(point) {
  return [
    { x: point.x, y: point.y - 1 },
    { x: point.x + 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x - 1, y: point.y },
  ].filter(next => (
    next.x >= 0 && next.x < COLS && next.y >= 0 && next.y < ROWS &&
    state.grid[next.y][next.x] !== WALL
  ));
}

function takeNext() {
  return state.algorithm === 'bfs' ? state.frontier.shift() : state.frontier.pop();
}

function addNeighbors(current) {
  const neighbors = getNeighbors(current);
  const ordered = state.algorithm === 'dfs' ? [...neighbors].reverse() : neighbors;
  ordered.forEach(next => {
    const key = keyOf(next);
    if (state.discovered.has(key)) return;
    state.discovered.add(key);
    state.parents.set(key, keyOf(current));
    state.frontier.push(next);
  });
}

function stepSearch(token) {
  if (token !== state.runToken || state.finished) return;
  if (!state.initialized) initializeSearch();

  if (!state.frontier.length) {
    finishSearch(false, token);
    return;
  }

  const current = takeNext();
  state.current = current;
  state.visited.add(keyOf(current));

  if (current.x === state.goal.x && current.y === state.goal.y) {
    finishSearch(true, token);
    return;
  }

  addNeighbors(current);
  setStatus('searching', 'いま探索中！ 赤いマスが次');
  updateUI();
  draw();
  scheduleStep(token);
}

function finishSearch(found, token) {
  if (token !== state.runToken) return;
  clearTimer();
  state.finished = true;

  if (found) {
    const reversed = [];
    let key = keyOf(state.goal);
    while (key) {
      reversed.push(pointFromKey(key));
      key = state.parents.get(key);
    }
    state.path = reversed.reverse();
    setStatus('complete', `ゴール！ ${state.path.length - 1}手の経路`);
  } else {
    setStatus('failed', 'ゴールへ続く経路がありません');
  }

  updateUI();
  draw();
  state.timer = window.setTimeout(() => advanceCycle(token), RESULT_HOLD);
}

function advanceCycle(token) {
  if (token !== state.runToken) return;
  if (state.algorithm === 'bfs') {
    selectAlgorithm('dfs', false);
  } else {
    state.algorithm = 'bfs';
    updateAlgorithmUI();
    generateMaze();
    beginRun(START_DELAY);
  }
}

function beginRun(delay = START_DELAY) {
  state.runToken += 1;
  const token = state.runToken;
  resetSearch();
  setStatus('searching', `${state.algorithm.toUpperCase()}を準備中…`);
  state.timer = window.setTimeout(() => stepSearch(token), delay);
}

function scheduleStep(token) {
  clearTimer();
  const delays = [300, 190, 110, 60, 28];
  state.timer = window.setTimeout(() => stepSearch(token), delays[Number(ui.speed.value) - 1]);
}

function clearTimer() {
  if (state.timer !== null) {
    window.clearTimeout(state.timer);
    state.timer = null;
  }
}

function setStatus(kind, message) {
  ui.status.className = `status ${kind}`;
  ui.statusText.textContent = message;
}

function selectAlgorithm(algorithm, immediate = true) {
  state.algorithm = algorithm;
  updateAlgorithmUI();
  beginRun(immediate ? 260 : START_DELAY);
}

function updateAlgorithmUI() {
  const bfs = state.algorithm === 'bfs';
  ui.algorithmButtons.forEach(button => {
    const active = button.dataset.algorithm === state.algorithm;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  ui.mazeHeading.textContent = bfs ? '幅優先探索：近いマスから順に調べる' : '深さ優先探索：一つの道を奥まで調べる';
  ui.frontierTitle.textContent = bfs ? 'キューの中身' : 'スタックの中身';
  ui.frontierSubtitle.textContent = bfs ? '追加した順に探索' : '最後に追加した候補から探索';
  ui.algorithmNote.textContent = bfs
    ? 'BFSは近い場所を一段ずつ調べるので、見つけた経路は必ず最短になります。'
    : 'DFSは一つの道を奥まで進み、行き止まりで戻ります。見つけた経路は最短とは限りません。';
}

function frontierInSearchOrder() {
  return state.algorithm === 'bfs' ? state.frontier : [...state.frontier].reverse();
}

function frontierColor(index, length, alpha = 1) {
  const t = length <= 1 ? 0 : index / (length - 1);
  const saturation = 100 * (1 - t);
  const lightness = 59 + 37 * t;
  return `hsla(0, ${saturation}%, ${lightness}%, ${alpha})`;
}

function updateFrontierTrack() {
  const ordered = frontierInSearchOrder();
  if (!ordered.length) {
    ui.frontierTrack.innerHTML = '<span class="frontier-empty">候補を準備中</span>';
    return;
  }

  const visibleCount = Math.min(ordered.length, 42);
  ui.frontierTrack.innerHTML = Array.from({ length: visibleCount }, (_, index) => {
    const originalIndex = visibleCount === 1 ? 0 : Math.round(index * (ordered.length - 1) / (visibleCount - 1));
    return `<span class="frontier-item" style="background:${frontierColor(originalIndex, ordered.length)}"></span>`;
  }).join('');
}

function updateUI() {
  ui.visitedCount.textContent = state.visited.size;
  ui.frontierCount.textContent = state.frontier.length;
  ui.pathCount.textContent = state.path.length ? state.path.length - 1 : '—';
  updateFrontierTrack();
}

function resizeCanvas() {
  const frameWidth = frame.clientWidth;
  const maxHeight = Math.max(360, window.innerHeight - 235);
  const cellSize = Math.max(9, Math.min(frameWidth / COLS, maxHeight / ROWS));
  const cssWidth = frameWidth;
  const cssHeight = cellSize * ROWS;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  frame.style.minHeight = `${cssHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.layout = {
    width: cssWidth,
    height: cssHeight,
    cellSize,
    offsetX: (cssWidth - cellSize * COLS) / 2,
    offsetY: 0,
  };
  draw();
}

function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function draw() {
  if (!state.grid.length || !state.layout.cellSize) return;
  const { width, height, cellSize, offsetX, offsetY } = state.layout;
  const orderedFrontier = frontierInSearchOrder();
  const frontierColors = new Map(orderedFrontier.map((point, index) => [
    keyOf(point),
    frontierColor(index, orderedFrontier.length, 0.95),
  ]));
  const pathKeys = new Set(state.path.map(keyOf));

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#06111d';
  ctx.fillRect(0, 0, width, height);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = offsetX + x * cellSize;
      const py = offsetY + y * cellSize;
      const key = `${x},${y}`;

      if (state.grid[y][x] === WALL) {
        ctx.fillStyle = cssColor('--wall');
        ctx.fillRect(px, py, cellSize + 0.5, cellSize + 0.5);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(px + 1, py + 1, cellSize - 2, Math.max(1.5, cellSize * 0.08));
        continue;
      }

      if (state.visited.has(key)) {
        ctx.fillStyle = cssColor('--visited');
        ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
      }
      if (frontierColors.has(key)) {
        ctx.fillStyle = frontierColors.get(key);
        ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
      }
      if (pathKeys.has(key)) {
        ctx.fillStyle = cssColor('--path');
        ctx.fillRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1);
      }

      ctx.strokeStyle = 'rgba(210, 230, 247, 0.11)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1);
    }
  }

  drawMarker(state.start, 'S', cssColor('--green'));
  drawMarker(state.goal, 'G', cssColor('--pink'));

  if (state.current && !state.finished) {
    const px = offsetX + state.current.x * cellSize;
    const py = offsetY + state.current.y * cellSize;
    ctx.fillStyle = cssColor('--cyan');
    ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
    ctx.fillStyle = '#03101b';
    ctx.beginPath();
    ctx.arc(px + cellSize / 2, py + cellSize / 2, Math.max(2, cellSize * 0.13), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = cssColor('--cyan');
    ctx.lineWidth = Math.max(2, cellSize * 0.14);
    ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2);

    ui.currentLabel.hidden = false;
    ui.currentLabel.style.left = `${px + cellSize / 2}px`;
    ui.currentLabel.style.top = `${Math.max(34, py)}px`;
  } else {
    ui.currentLabel.hidden = true;
  }
}

function drawMarker(point, label, fill) {
  const { cellSize, offsetX, offsetY } = state.layout;
  const cx = offsetX + (point.x + 0.5) * cellSize;
  const cy = offsetY + (point.y + 0.5) * cellSize;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(6, cellSize * 0.36), 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, cellSize * 0.08);
  ctx.stroke();
  if (cellSize >= 14) {
    ctx.fillStyle = '#03101b';
    ctx.font = `900 ${Math.max(9, cellSize * 0.42)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 0.5);
  }
}

ui.algorithmButtons.forEach(button => {
  button.addEventListener('click', () => selectAlgorithm(button.dataset.algorithm));
});

ui.speed.addEventListener('input', () => {
  const labels = ['ゆっくり', 'やや遅い', 'ふつう', '速い', '最速'];
  ui.speedLabel.textContent = labels[Number(ui.speed.value) - 1];
  if (state.initialized && !state.finished) scheduleStep(state.runToken);
});

ui.newMaze.addEventListener('click', () => {
  state.algorithm = 'bfs';
  updateAlgorithmUI();
  generateMaze();
  beginRun(300);
});

window.addEventListener('resize', resizeCanvas);

generateMaze();
updateAlgorithmUI();
resizeCanvas();
beginRun();
