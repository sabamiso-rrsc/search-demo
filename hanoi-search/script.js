const DISK_COUNT = 4;
const GOAL_STATE = Array(DISK_COUNT).fill(2);
const RESULT_HOLD = 4800;
// After a visitor lets go of the tree, give them time before moving on.
const INTERACTION_HOLD = 8000;
const REPLAY_START_HOLD = 1500;
const PEG_NAMES = ['左', '中央', '右'];
const DISK_COLORS = ['#ffe45c', '#42f59b', '#ff7ab6', '#b58cff'];

const ui = {
  algorithmButtons: [...document.querySelectorAll('[data-algorithm]')],
  speed: document.querySelector('#speed'),
  speedLabel: document.querySelector('#speed-label'),
  restart: document.querySelector('#restart'),
  algorithmTitle: document.querySelector('#algorithm-title'),
  algorithmCopy: document.querySelector('#algorithm-copy'),
  status: document.querySelector('#status'),
  tower: document.querySelector('#tower'),
  disks: document.querySelector('#disks'),
  moveCaption: document.querySelector('#move-caption'),
  resultActions: document.querySelector('#result-actions'),
  viewSolution: document.querySelector('#view-solution'),
  countdownLabel: document.querySelector('#countdown-label'),
  countdown: document.querySelector('#countdown'),
  holdLabel: document.querySelector('#hold-label'),
  treeStage: document.querySelector('.tree-stage'),
  dragHint: document.querySelector('#drag-hint'),
  visitedCount: document.querySelector('#visited-count'),
  frontierCount: document.querySelector('#frontier-count'),
  pathCount: document.querySelector('#path-count'),
  depthCount: document.querySelector('#depth-count'),
  tree: document.querySelector('#tree'),
  treeEdges: document.querySelector('#tree-edges'),
  treeNodes: document.querySelector('#tree-nodes'),
};

const stateKey = state => state.join('');
const isGoal = state => state.every((peg, disk) => peg === GOAL_STATE[disk]);

function possibleMoves(state) {
  const top = [null, null, null];
  for (let disk = 0; disk < DISK_COUNT; disk++) {
    const peg = state[disk];
    if (top[peg] === null) top[peg] = disk;
  }

  const moves = [];
  for (let from = 0; from < 3; from++) {
    const disk = top[from];
    if (disk === null) continue;
    for (let to = 0; to < 3; to++) {
      if (from === to) continue;
      if (top[to] === null || disk < top[to]) {
        const nextState = [...state];
        nextState[disk] = to;
        moves.push({ state: nextState, move: { disk, from, to } });
      }
    }
  }
  return moves;
}

function buildGoalDistances() {
  const queue = [[...GOAL_STATE]];
  const distances = new Map([[stateKey(GOAL_STATE), 0]]);
  while (queue.length) {
    const current = queue.shift();
    const distance = distances.get(stateKey(current));
    possibleMoves(current).forEach(({ state }) => {
      const key = stateKey(state);
      if (distances.has(key)) return;
      distances.set(key, distance + 1);
      queue.push(state);
    });
  }
  return distances;
}

const GOAL_DISTANCES = buildGoalDistances();

function randomStartState(excludeKey = '') {
  const candidates = [...GOAL_DISTANCES.entries()]
    .filter(([key, distance]) => distance >= 8 && key !== excludeKey)
    .map(([key]) => key.split('').map(Number));
  return candidates[Math.floor(Math.random() * candidates.length)];
}

class HanoiDemoController {
  constructor() {
    this.algorithm = 'bfs';
    this.running = false;
    this.timer = null;
    this.runToken = 0;
    this.nodeId = 0;
    this.search = null;
    this.startState = randomStartState();
    this.countdownTimer = null;
    this.replaying = false;
    this.drag = null;
    this.camera = {
      manual: false,
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      velocityX: 0,
      velocityY: 0,
      frame: null,
    };
    this.initializeDisks();
    this.bindControls();
  }

  initializeDisks() {
    ui.disks.innerHTML = Array.from({ length: DISK_COUNT }, (_, disk) => {
      const width = 78 + disk * 27;
      return `<g class="disk" id="disk-${disk}"><rect x="${-width / 2}" y="0" width="${width}" height="34" rx="10" fill="${DISK_COLORS[disk]}"></rect><text x="0" y="17">${disk + 1}</text></g>`;
    }).join('');
  }

  bindControls() {
    ui.algorithmButtons.forEach(button => {
      button.addEventListener('click', () => this.setAlgorithm(button.dataset.algorithm));
    });
    ui.speed.addEventListener('input', () => {
      const labels = ['ゆっくり', 'やや遅い', 'ふつう', '速い', '最速'];
      ui.speedLabel.textContent = labels[Number(ui.speed.value) - 1];
      if (this.running) this.schedule();
    });
    ui.restart.addEventListener('click', () => this.begin(this.algorithm, 260));
    ui.viewSolution.addEventListener('click', () => this.replaySolution());
    ui.treeStage.addEventListener('pointerdown', event => this.startDrag(event));
    ui.treeStage.addEventListener('pointermove', event => this.moveDrag(event));
    ui.treeStage.addEventListener('pointerup', event => this.endDrag(event));
    ui.treeStage.addEventListener('pointercancel', event => this.endDrag(event));
  }

  start() {
    if (this.running) return;
    if (!this.search || this.search.finished) this.begin(this.algorithm);
    else {
      this.running = true;
      this.schedule();
    }
  }

  stop() {
    this.running = false;
    window.clearTimeout(this.timer);
    this.timer = null;
    window.clearInterval(this.countdownTimer);
    this.countdownTimer = null;
    this.replaying = false;
    this.drag = null;
    this.camera.manual = false;
    ui.resultActions.hidden = true;
    ui.treeStage.classList.remove('dragging', 'draggable');
    ui.dragHint.hidden = true;
    ui.dragHint.textContent = 'ドラッグでツリーを動かせます';
    ui.dragHint.classList.remove('suggest');
    ui.viewSolution.classList.remove('suggested');
    if (this.camera.frame !== null) {
      window.cancelAnimationFrame(this.camera.frame);
      this.camera.frame = null;
    }
  }

  setAlgorithm(algorithm) {
    this.algorithm = algorithm;
    this.begin(algorithm, 260);
  }

  begin(algorithm, delay = 650) {
    this.stop();
    this.algorithm = algorithm;
    this.runToken += 1;
    this.nodeId = 0;
    const root = this.createNode([...this.startState], 0, null, null);
    this.search = {
      nodes: new Map([[root.id, root]]),
      keyToId: new Map([[root.key, root.id]]),
      frontier: [root.id],
      visited: new Set(),
      currentId: root.id,
      solution: new Set(),
      solutionPath: [],
      occupiedByDepth: new Map([[0, [0]]]),
      finished: false,
      found: false,
    };
    this.running = true;
    this.replaying = false;
    this.updateAlgorithmUI();
    this.renderTower(root.state, null);
    this.renderAll();
    this.setStatus('探索中');
    const token = this.runToken;
    this.timer = window.setTimeout(() => this.tick(token), delay);
  }

  createNode(state, depth, parentId, move) {
    return {
      id: this.nodeId++,
      key: stateKey(state),
      state,
      depth,
      parentId,
      move,
      x: depth * 150,
      y: 0,
    };
  }

  tick(token) {
    if (!this.running || token !== this.runToken || this.search.finished) return;
    const currentId = this.algorithm === 'bfs' ? this.search.frontier.shift() : this.search.frontier.pop();
    if (currentId === undefined) {
      this.finish(false, token);
      return;
    }

    const current = this.search.nodes.get(currentId);
    this.search.currentId = currentId;
    this.search.visited.add(currentId);
    this.renderTower(current.state, current.move);

    if (isGoal(current.state)) {
      this.finish(true, token);
      return;
    }

    let nextMoves = possibleMoves(current.state);
    if (this.algorithm === 'dfs') nextMoves = [...nextMoves].reverse();
    nextMoves = nextMoves.filter(candidate => !this.search.keyToId.has(stateKey(candidate.state)));
    nextMoves.forEach((candidate, index) => {
      const key = stateKey(candidate.state);
      const depth = current.depth + 1;
      const node = this.createNode(candidate.state, depth, currentId, candidate.move);
      const desiredY = current.y + (index - (nextMoves.length - 1) / 2) * 92;
      node.y = this.allocateY(depth, desiredY);
      this.search.nodes.set(node.id, node);
      this.search.keyToId.set(key, node.id);
      this.search.frontier.push(node.id);
    });

    this.renderAll();
    this.schedule(token);
  }

  schedule(token = this.runToken) {
    window.clearTimeout(this.timer);
    const delays = [650, 400, 220, 120, 62];
    this.timer = window.setTimeout(() => this.tick(token), delays[Number(ui.speed.value) - 1]);
  }

  finish(found, token) {
    if (token !== this.runToken) return;
    this.running = false;
    this.search.finished = true;
    this.search.found = found;

    if (found) {
      const reversePath = [];
      let nodeId = this.search.currentId;
      while (nodeId !== null) {
        reversePath.push(nodeId);
        nodeId = this.search.nodes.get(nodeId).parentId;
      }
      this.search.solutionPath = reversePath.reverse();
      this.search.solution = new Set(this.search.solutionPath);
      const goal = this.search.nodes.get(this.search.currentId);
      this.renderTower(goal.state, goal.move);
      this.setStatus('ゴール', true);
    } else {
      this.setStatus('解がありません');
    }
    this.renderAll();

    this.startResultCountdown();
  }

  canDrag() {
    return Boolean(this.search?.finished && !this.replaying);
  }

  updateDragAvailability() {
    const available = this.canDrag();
    ui.treeStage.classList.toggle('draggable', available);
    ui.dragHint.hidden = !available;
  }

  startDrag(event) {
    if (!this.canDrag() || this.drag) return;
    const rect = ui.tree.getBoundingClientRect();
    this.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cameraX: this.camera.x,
      cameraY: this.camera.y,
      // The 900x600 viewBox is letterboxed ("meet"), so one pixel is the larger of the two ratios.
      scale: Math.max(900 / rect.width, 600 / rect.height),
    };
    ui.treeStage.classList.add('dragging');
    if (this.camera.frame !== null) {
      window.cancelAnimationFrame(this.camera.frame);
      this.camera.frame = null;
    }
    this.camera.manual = true;
    // Hold the screen while the tree is being handled.
    this.clearResultTimers();
    ui.countdownLabel.hidden = true;
    ui.holdLabel.hidden = false;
    // Keep receiving moves when the finger leaves the stage; capture can fail for an already released pointer.
    try { ui.treeStage.setPointerCapture(event.pointerId); } catch {}
  }

  moveDrag(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const { camera, drag } = this;
    camera.x = camera.targetX = drag.cameraX - (event.clientX - drag.startX) * drag.scale;
    camera.y = camera.targetY = drag.cameraY - (event.clientY - drag.startY) * drag.scale;
    camera.velocityX = 0;
    camera.velocityY = 0;
    ui.tree.setAttribute('viewBox', `${camera.x - 450} ${camera.y - 300} 900 600`);
  }

  endDrag(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    ui.treeStage.classList.remove('dragging');
    if (!this.canDrag()) return;
    this.startResultCountdown(INTERACTION_HOLD);
    // Someone exploring the tree is a good moment to offer the answer replay.
    if (this.search.found) {
      ui.viewSolution.classList.add('suggested');
      ui.dragHint.textContent = '「解答経路を見る」で答えを再生できます';
      ui.dragHint.classList.add('suggest');
    }
  }

  clearResultTimers() {
    window.clearTimeout(this.timer);
    window.clearInterval(this.countdownTimer);
    this.timer = null;
    this.countdownTimer = null;
  }

  advanceAfterResult() {
    this.clearResultTimers();
    if (this.algorithm === 'dfs' && window.searchDemoHost?.complete(() => this.beginNextAlgorithm())) return;
    this.beginNextAlgorithm();
  }

  beginNextAlgorithm() {
    const next = this.algorithm === 'bfs' ? 'dfs' : 'bfs';
    if (this.algorithm === 'dfs') {
      this.startState = randomStartState(stateKey(this.startState));
    }
    this.begin(next);
  }

  startResultCountdown(hold = RESULT_HOLD) {
    this.clearResultTimers();
    this.updateDragAvailability();
    ui.resultActions.hidden = false;
    ui.holdLabel.hidden = true;
    ui.viewSolution.hidden = !this.search.found;
    ui.viewSolution.disabled = false;
    ui.viewSolution.textContent = '解答経路を見る';
    ui.countdownLabel.hidden = false;

    const deadline = performance.now() + hold;
    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      ui.countdown.textContent = seconds;
    };
    updateCountdown();
    this.countdownTimer = window.setInterval(updateCountdown, 100);
    this.timer = window.setTimeout(() => this.advanceAfterResult(), hold);
  }

  replaySolution() {
    if (!this.search?.finished || !this.search.solutionPath.length || this.replaying) return;

    this.clearResultTimers();
    this.replaying = true;
    this.camera.manual = false;
    ui.viewSolution.classList.remove('suggested');
    this.updateDragAvailability();
    ui.holdLabel.hidden = true;
    ui.viewSolution.disabled = true;
    ui.viewSolution.textContent = '再生中…';
    ui.countdownLabel.hidden = true;
    this.replayStep(0, this.runToken);
  }

  replayStep(index, token) {
    if (token !== this.runToken || !this.replaying) return;

    const path = this.search.solutionPath;
    const node = this.search.nodes.get(path[index]);
    this.search.currentId = node.id;
    this.renderTower(node.state, node.move);
    this.setStatus(`解答を再生中 ${index}/${path.length - 1}`);
    this.renderAll();

    if (index === path.length - 1) {
      this.replaying = false;
      this.setStatus('ゴール', true);
      this.startResultCountdown();
      return;
    }

    const delays = [900, 650, 400, 240, 130];
    this.timer = window.setTimeout(
      () => this.replayStep(index + 1, token),
      index === 0 ? REPLAY_START_HOLD : delays[Number(ui.speed.value) - 1],
    );
  }

  updateAlgorithmUI() {
    const bfs = this.algorithm === 'bfs';
    ui.algorithmButtons.forEach(button => {
      const active = button.dataset.algorithm === this.algorithm;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    ui.algorithmTitle.innerHTML = bfs ? 'BFS <span>幅優先探索</span>' : 'DFS <span>深さ優先探索</span>';
    ui.algorithmCopy.textContent = bfs ? '浅い手順から順に調べる' : '一つの手順を奥まで調べる';
  }

  setStatus(text, done = false) {
    ui.status.classList.toggle('done', done);
    ui.status.querySelector('span').textContent = text;
  }

  renderTower(towerState, move) {
    const pegX = [137, 320, 503];
    const stacks = [[], [], []];
    for (let disk = DISK_COUNT - 1; disk >= 0; disk--) stacks[towerState[disk]].push(disk);

    stacks.forEach((disks, peg) => {
      disks.forEach((disk, level) => {
        const x = pegX[peg];
        const y = 306 - level * 39;
        document.querySelector(`#disk-${disk}`).style.transform = `translate(${x}px, ${y}px)`;
      });
    });

    ui.moveCaption.textContent = move
      ? `円盤 ${move.disk + 1}：${PEG_NAMES[move.from]} → ${PEG_NAMES[move.to]}`
      : '開始状態';
  }

  frontierInOrder() {
    return this.algorithm === 'bfs' ? this.search.frontier : [...this.search.frontier].reverse();
  }

  frontierColor(index, length) {
    const t = length <= 1 ? 0 : index / (length - 1);
    // Keep full saturation so late candidates fade to pale pink instead of gray on the white board.
    return `hsl(0 100% ${60 + 38 * t}%)`;
  }

  allocateY(depth, desiredY) {
    if (!this.search.occupiedByDepth.has(depth)) this.search.occupiedByDepth.set(depth, []);
    const occupied = this.search.occupiedByDepth.get(depth);
    const spacing = 78;
    let candidateY = desiredY;
    let ring = 0;

    while (occupied.some(y => Math.abs(y - candidateY) < spacing)) {
      ring += 1;
      const direction = ring % 2 === 1 ? 1 : -1;
      const distance = Math.ceil(ring / 2) * spacing;
      candidateY = desiredY + direction * distance;
    }
    occupied.push(candidateY);
    return candidateY;
  }

  nodePosition(node) {
    return { x: node.x, y: node.y };
  }

  followCurrent(node) {
    if (this.camera.manual) return;
    const backwardBias = Math.min(165, node.depth * 13);
    this.camera.targetX = node.x - backwardBias;
    this.camera.targetY = node.y;
    if (this.camera.frame === null) this.camera.frame = window.requestAnimationFrame(() => this.updateCamera());
  }

  updateCamera() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      this.camera.x = this.camera.targetX;
      this.camera.y = this.camera.targetY;
      this.camera.velocityX = 0;
      this.camera.velocityY = 0;
    } else {
      const errorX = this.camera.targetX - this.camera.x;
      const errorY = this.camera.targetY - this.camera.y;
      this.camera.velocityX = (this.camera.velocityX + errorX * 0.055) * 0.78;
      this.camera.velocityY = (this.camera.velocityY + errorY * 0.045) * 0.8;
      this.camera.velocityX = Math.max(-72, Math.min(72, this.camera.velocityX));
      this.camera.velocityY = Math.max(-58, Math.min(58, this.camera.velocityY));
      this.camera.x += this.camera.velocityX;
      this.camera.y += this.camera.velocityY;
    }

    ui.tree.setAttribute('viewBox', `${this.camera.x - 450} ${this.camera.y - 300} 900 600`);
    const settled = Math.abs(this.camera.targetX - this.camera.x) < 0.25 &&
      Math.abs(this.camera.targetY - this.camera.y) < 0.25 &&
      Math.abs(this.camera.velocityX) < 0.2 && Math.abs(this.camera.velocityY) < 0.2;

    if (settled) {
      this.camera.x = this.camera.targetX;
      this.camera.y = this.camera.targetY;
      this.camera.velocityX = 0;
      this.camera.velocityY = 0;
      ui.tree.setAttribute('viewBox', `${this.camera.x - 450} ${this.camera.y - 300} 900 600`);
      this.camera.frame = null;
    } else {
      this.camera.frame = window.requestAnimationFrame(() => this.updateCamera());
    }
  }

  miniTower(node) {
    const stacks = [[], [], []];
    for (let disk = DISK_COUNT - 1; disk >= 0; disk--) stacks[node.state[disk]].push(disk);
    let markup = '<rect class="mini-base" x="-27" y="17" width="54" height="3" rx="1.5"></rect>';
    [-18, 0, 18].forEach(x => { markup += `<rect class="mini-peg" x="${x - 1}" y="-9" width="2" height="27"></rect>`; });
    stacks.forEach((disks, peg) => {
      disks.forEach((disk, level) => {
        const width = 7 + disk * 3.2;
        const x = -18 + peg * 18;
        const y = 13 - level * 5;
        markup += `<rect x="${x - width / 2}" y="${y}" width="${width}" height="4" rx="2" fill="${DISK_COLORS[disk]}"></rect>`;
      });
    });
    return markup;
  }

  renderTree() {
    const frontier = this.frontierInOrder();
    const frontierColors = new Map(frontier.map((id, index) => [id, this.frontierColor(index, frontier.length)]));
    const edges = [];
    const nodes = [];
    this.search.nodes.forEach(node => {
      const pos = this.nodePosition(node);
      if (node.parentId !== null) {
        const parent = this.search.nodes.get(node.parentId);
        const parentPos = this.nodePosition(parent);
        const solution = this.search.solution.has(node.id) && this.search.solution.has(parent.id);
        edges.push(`<line class="tree-edge${solution ? ' solution' : ''}" x1="${parentPos.x + 34}" y1="${parentPos.y}" x2="${pos.x - 34}" y2="${pos.y}"></line>`);
      }

      const classes = ['tree-node'];
      if (frontierColors.has(node.id)) classes.push('frontier');
      if (node.id === this.search.currentId && (!this.search.finished || this.replaying)) classes.push('current');
      if (this.search.solution.has(node.id)) classes.push('solution');
      const candidateColor = node.id === this.search.currentId || this.search.solution.has(node.id)
        ? null
        : frontierColors.get(node.id);
      const candidateStyle = candidateColor
        ? ` style="fill:${candidateColor}"`
        : '';
      const currentLabel = this.replaying ? '経路' : '探索中';
      const showCurrent = node.id === this.search.currentId && (!this.search.finished || this.replaying);
      nodes.push(`<g class="${classes.join(' ')}" transform="translate(${pos.x} ${pos.y})"><rect class="node-bg" x="-34" y="-25" width="68" height="50" rx="8"${candidateStyle}></rect>${this.miniTower(node)}${showCurrent ? `<text class="now-label" y="-34">${currentLabel}</text>` : ''}</g>`);
    });

    ui.treeEdges.innerHTML = edges.join('');
    ui.treeNodes.innerHTML = nodes.join('');
    this.followCurrent(this.search.nodes.get(this.search.currentId));
  }

  renderAll() {
    const current = this.search.nodes.get(this.search.currentId);
    ui.visitedCount.textContent = this.search.visited.size;
    ui.frontierCount.textContent = this.search.frontier.length;
    ui.pathCount.textContent = this.search.solution.size ? `${this.search.solution.size - 1}手` : '—';
    ui.depthCount.textContent = current.depth;
    this.renderTree();
  }
}

const hanoiDemo = new HanoiDemoController();
hanoiDemo.begin('bfs');

// Integration hooks for a future combined screen.
window.hanoiDemo = {
  start: () => hanoiDemo.start(),
  stop: () => hanoiDemo.stop(),
  reset: () => hanoiDemo.begin(hanoiDemo.algorithm, 260),
  setAlgorithm: algorithm => hanoiDemo.setAlgorithm(algorithm),
};
