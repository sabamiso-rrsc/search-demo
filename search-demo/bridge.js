// A small message interface shared by the two standalone demos and their host.
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
