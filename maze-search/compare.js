const COLS = 31;
const ROWS = 19;
const OPEN = 0;
const WALL = 1;
const START_DELAY = 650;
const RESULT_HOLD = 4800;

const ui = {
  speed: document.querySelector('#speed'),
  speedLabel: document.querySelector('#speed-label'),
  newMaze: document.querySelector('#new-maze'),
  bfs: {
    canvas: document.querySelector('#bfs-maze'),
    frame: document.querySelector('#bfs-frame'),
    currentLabel: document.querySelector('#bfs-current'),
    status: document.querySelector('#bfs-status'),
    visited: document.querySelector('#bfs-visited'),
    path: document.querySelector('#bfs-path'),
  },
  dfs: {
    canvas: document.querySelector('#dfs-maze'),
    frame: document.querySelector('#dfs-frame'),
    currentLabel: document.querySelector('#dfs-current'),
    status: document.querySelector('#dfs-status'),
    visited: document.querySelector('#dfs-visited'),
    path: document.querySelector('#dfs-path'),
  },
};

ui.bfs.ctx = ui.bfs.canvas.getContext('2d');
ui.dfs.ctx = ui.dfs.canvas.getContext('2d');

const app = {
  grid: [],
  start: { x: 1, y: 1 },
  goal: { x: COLS - 2, y: ROWS - 2 },
  searches: {},
  timer: null,
  cycleToken: 0,
  phase: 'starting',
};

const keyOf = point => `${point.x},${point.y}`;
const pointFromKey = key => {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
};

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function generateMaze() {
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(WALL));
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

  const loops = [];
  for (let y = 2; y < ROWS - 2; y++) {
    for (let x = 2; x < COLS - 2; x++) {
      if (grid[y][x] !== WALL) continue;
      const horizontal = grid[y][x - 1] === OPEN && grid[y][x + 1] === OPEN;
      const vertical = grid[y - 1][x] === OPEN && grid[y + 1][x] === OPEN;
      if (horizontal || vertical) loops.push({ x, y });
    }
  }
  shuffle(loops).slice(0, 14).forEach(({ x, y }) => { grid[y][x] = OPEN; });
  app.grid = grid;
}

function createSearch(algorithm) {
  return {
    algorithm,
    frontier: [{ ...app.start }],
    discovered: new Set([keyOf(app.start)]),
    visited: new Set(),
    parents: new Map(),
    path: [],
    current: null,
    finished: false,
    found: false,
  };
}

function neighborsOf(point) {
  return [
    { x: point.x, y: point.y - 1 },
    { x: point.x + 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x - 1, y: point.y },
  ].filter(next => (
    next.x >= 0 && next.x < COLS && next.y >= 0 && next.y < ROWS &&
    app.grid[next.y][next.x] !== WALL
  ));
}

function step(search) {
  if (search.finished) return;
  if (!search.frontier.length) {
    finish(search, false);
    return;
  }

  const current = search.algorithm === 'bfs' ? search.frontier.shift() : search.frontier.pop();
  search.current = current;
  search.visited.add(keyOf(current));

  if (current.x === app.goal.x && current.y === app.goal.y) {
    finish(search, true);
    return;
  }

  const neighbors = neighborsOf(current);
  const ordered = search.algorithm === 'dfs' ? [...neighbors].reverse() : neighbors;
  ordered.forEach(next => {
    const key = keyOf(next);
    if (search.discovered.has(key)) return;
    search.discovered.add(key);
    search.parents.set(key, keyOf(current));
    search.frontier.push(next);
  });
}

function finish(search, found) {
  search.finished = true;
  search.found = found;
  if (!found) return;

  const reversed = [];
  let key = keyOf(app.goal);
  while (key) {
    reversed.push(pointFromKey(key));
    key = search.parents.get(key);
  }
  search.path = reversed.reverse();
}

function frontierInOrder(search) {
  return search.algorithm === 'bfs' ? search.frontier : [...search.frontier].reverse();
}

function frontierColor(index, length) {
  const t = length <= 1 ? 0 : index / (length - 1);
  return `hsl(0 ${100 * (1 - t)}% ${59 + 37 * t}%)`;
}

function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function resizeBoard(name) {
  const view = ui[name];
  const cssWidth = view.frame.clientWidth;
  const cellSize = cssWidth / COLS;
  const cssHeight = cellSize * ROWS;
  const dpr = window.devicePixelRatio || 1;

  view.canvas.width = Math.round(cssWidth * dpr);
  view.canvas.height = Math.round(cssHeight * dpr);
  view.canvas.style.width = `${cssWidth}px`;
  view.canvas.style.height = `${cssHeight}px`;
  view.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.layout = { width: cssWidth, height: cssHeight, cellSize };
  drawBoard(name);
}

function drawBoard(name) {
  const view = ui[name];
  const search = app.searches[name];
  if (!view.layout || !search || !app.grid.length) return;

  const { ctx } = view;
  const { width, height, cellSize } = view.layout;
  const orderedFrontier = frontierInOrder(search);
  const frontierColors = new Map(orderedFrontier.map((point, index) => [
    keyOf(point),
    frontierColor(index, orderedFrontier.length),
  ]));
  const pathKeys = new Set(search.path.map(keyOf));

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#06111d';
  ctx.fillRect(0, 0, width, height);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = x * cellSize;
      const py = y * cellSize;
      const key = `${x},${y}`;

      if (app.grid[y][x] === WALL) {
        ctx.fillStyle = cssColor('--wall');
        ctx.fillRect(px, py, cellSize + 0.5, cellSize + 0.5);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(px + 1, py + 1, cellSize - 2, Math.max(1, cellSize * 0.08));
        continue;
      }

      if (search.visited.has(key)) {
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

  drawMarker(ctx, cellSize, app.start, 'S', cssColor('--green'));
  drawMarker(ctx, cellSize, app.goal, 'G', cssColor('--goal'));

  if (search.current && !search.finished) {
    const px = search.current.x * cellSize;
    const py = search.current.y * cellSize;
    ctx.fillStyle = cssColor('--cyan');
    ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
    ctx.fillStyle = '#03101b';
    ctx.beginPath();
    ctx.arc(px + cellSize / 2, py + cellSize / 2, Math.max(2, cellSize * 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, cellSize * 0.1);
    ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2);

    view.currentLabel.hidden = false;
    view.currentLabel.classList.toggle('below', py < 48);
    view.currentLabel.style.left = `${px + cellSize / 2}px`;
    view.currentLabel.style.top = `${py < 48 ? py + cellSize : py}px`;
  } else {
    view.currentLabel.hidden = true;
  }
}

function drawMarker(ctx, cellSize, point, label, fill) {
  const cx = (point.x + 0.5) * cellSize;
  const cy = (point.y + 0.5) * cellSize;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(5, cellSize * 0.35), 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.2, cellSize * 0.08);
  ctx.stroke();
  if (cellSize >= 13) {
    ctx.fillStyle = '#03101b';
    ctx.font = `900 ${Math.max(8, cellSize * 0.42)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 0.5);
  }
}

function updatePanel(name) {
  const view = ui[name];
  const search = app.searches[name];
  view.visited.textContent = search.visited.size;
  view.path.textContent = search.path.length ? `${search.path.length - 1}手` : '—';
  view.status.className = 'status';

  if (!search.finished) {
    view.status.querySelector('span').textContent = '探索中';
  } else if (search.found) {
    view.status.classList.add('done');
    view.status.querySelector('span').textContent = 'ゴール';
  } else {
    view.status.classList.add('failed');
    view.status.querySelector('span').textContent = '経路なし';
  }
  drawBoard(name);
}

function tick(token) {
  if (token !== app.cycleToken || app.phase !== 'running') return;
  step(app.searches.bfs);
  step(app.searches.dfs);
  updatePanel('bfs');
  updatePanel('dfs');

  if (app.searches.bfs.finished && app.searches.dfs.finished) {
    app.phase = 'holding';
    app.timer = window.setTimeout(() => {
      if (!window.searchDemoHost?.complete(() => startNewMaze())) startNewMaze();
    }, RESULT_HOLD);
    return;
  }
  scheduleTick(token);
}

function scheduleTick(token) {
  window.clearTimeout(app.timer);
  const delays = [300, 190, 110, 60, 28];
  app.timer = window.setTimeout(() => tick(token), delays[Number(ui.speed.value) - 1]);
}

function startNewMaze(delay = START_DELAY) {
  window.clearTimeout(app.timer);
  app.cycleToken += 1;
  const token = app.cycleToken;
  generateMaze();
  app.searches = {
    bfs: createSearch('bfs'),
    dfs: createSearch('dfs'),
  };
  app.phase = 'starting';
  ['bfs', 'dfs'].forEach(name => {
    ui[name].status.className = 'status';
    ui[name].status.querySelector('span').textContent = '準備中';
    updatePanel(name);
  });
  app.phase = 'running';
  app.timer = window.setTimeout(() => tick(token), delay);
}

function resizeAll() {
  resizeBoard('bfs');
  resizeBoard('dfs');
}

ui.speed.addEventListener('input', () => {
  const labels = ['ゆっくり', 'やや遅い', 'ふつう', '速い', '最速'];
  ui.speedLabel.textContent = labels[Number(ui.speed.value) - 1];
  if (app.phase === 'running') scheduleTick(app.cycleToken);
});

ui.newMaze.addEventListener('click', () => startNewMaze(260));
window.addEventListener('resize', resizeAll);

startNewMaze();
resizeAll();
