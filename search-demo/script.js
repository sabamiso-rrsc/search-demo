const demos = {
  maze: { url: '../maze-search/compare.html', title: '迷路：BFS・DFS同時比較' },
  hanoi: { url: '../hanoi-search/index.html', title: 'ハノイの塔：BFS・DFS探索' },
};
const stage = document.querySelector('#demo-stage');
const buttons = [...document.querySelectorAll('[data-demo]')];
const autoSwitch = document.querySelector('#auto-switch');
const speeds = { maze: 3, hanoi: 3 };
let currentDemo = null;
let frame = null;
// File documents exchange messages with an opaque ("null") origin.
const messageOrigin = location.protocol === 'file:' ? 'null' : location.origin;
const targetOrigin = messageOrigin === 'null' ? '*' : messageOrigin;

function configureDemo() {
  frame?.contentWindow.postMessage({
    type: 'search-demo:configure',
    speed: speeds[currentDemo],
  }, targetOrigin);
}

function showDemo(name) {
  if (!Object.hasOwn(demos, name) || name === currentDemo) return;
  currentDemo = name;
  buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.demo === name)));
  document.title = `${demos[name].title} | 探索アルゴリズム`;
  // Replacing the frame stops every timer and animation in the previous demo.
  frame = document.createElement('iframe');
  frame.title = demos[name].title;
  frame.src = `${demos[name].url}?embedded=1`;
  frame.addEventListener('load', configureDemo);
  stage.replaceChildren(frame);
  // Hash links allow either demo to be opened directly, including from a local file.
  if (location.hash !== `#${name}`) location.hash = name;
}

window.addEventListener('message', event => {
  if (event.source !== frame?.contentWindow || event.origin !== messageOrigin) return;
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  if (message.type === 'search-demo:ready') configureDemo();
  if (message.type === 'search-demo:speed' && Number.isInteger(message.speed) && message.speed >= 1 && message.speed <= 5) {
    speeds[currentDemo] = message.speed;
  }
  if (message.type === 'search-demo:round-complete') {
    if (autoSwitch.checked) showDemo(currentDemo === 'maze' ? 'hanoi' : 'maze');
    else frame.contentWindow.postMessage({ type: 'search-demo:continue' }, targetOrigin);
  }
});

buttons.forEach(button => button.addEventListener('click', () => showDemo(button.dataset.demo)));
window.addEventListener('hashchange', () => showDemo(location.hash.slice(1)));
showDemo(Object.hasOwn(demos, location.hash.slice(1)) ? location.hash.slice(1) : 'maze');
