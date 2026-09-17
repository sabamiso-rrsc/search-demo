// A small message interface shared by the two standalone demos and their host.
window.searchDemoHint = (x, y) => {
  const root = document.documentElement;
  root.classList.remove('tap-hint');
  void root.offsetWidth; // Restart the pulse animation.
  root.classList.add('tap-hint');
  setTimeout(() => root.classList.remove('tap-hint'), 1400);
  const toast = document.createElement('div');
  toast.className = 'tap-toast';
  toast.textContent = 'ここは見るだけ ・ オレンジのボタンで操作できます';
  toast.style.left = `${Math.min(Math.max(x, 180), innerWidth - 180)}px`;
  toast.style.top = `${Math.max(y, 60)}px`;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 1800);
};

(() => {
  const embedded = window.parent !== window && new URLSearchParams(location.search).has('embedded');
  let continueRound = null;
  const messageOrigin = location.protocol === 'file:' ? 'null' : location.origin;
  const post = message => window.parent.postMessage(message, messageOrigin === 'null' ? '*' : messageOrigin);
  window.searchDemoHost = {
    complete(resume) {
      if (!embedded) return false;
      continueRound = resume;
      post({ type: 'search-demo:round-complete' });
      return true;
    },
  };
  // Tapping a display-only area makes the controls pulse, here and (when embedded) in the host bar.
  let lastHint = 0;
  document.addEventListener('pointerdown', event => {
    if (event.target.closest?.('button, input, label, a, .draggable')) return;
    const now = Date.now();
    if (now - lastHint < 1800) return;
    lastHint = now;
    window.searchDemoHint?.(event.clientX, event.clientY);
  });
  if (!embedded) return;

  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== messageOrigin) return;
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'search-demo:configure') {
      const speed = document.querySelector('#speed');
      if (speed && Number.isInteger(message.speed) && message.speed >= 1 && message.speed <= 5 && Number(speed.value) !== message.speed) {
        speed.value = message.speed;
        speed.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    if (message.type === 'search-demo:continue' && continueRound) {
      const resume = continueRound;
      continueRound = null;
      resume();
    }
  });
  document.querySelector('#speed').addEventListener('input', event => {
    post({ type: 'search-demo:speed', speed: Number(event.target.value) });
  });
  // Wait for the demo's input handlers to be installed before restoring speed.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => post({ type: 'search-demo:ready' }), { once: true });
  } else {
    post({ type: 'search-demo:ready' });
  }
})();
