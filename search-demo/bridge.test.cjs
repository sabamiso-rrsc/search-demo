const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const hostSource = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
const bridgeSource = fs.readFileSync(path.join(__dirname, 'bridge.js'), 'utf8');

function setup(protocol = 'http:') {
  const origin = protocol === 'file:' ? 'file://' : 'http://localhost';
  const eventOrigin = protocol === 'file:' ? 'null' : origin;
  const queue = [];
  const hostListeners = {};
  const childListeners = {};
  const checkbox = { checked: true };
  let activeFrame;
  let resumed = 0;
  const host = { addEventListener: (name, handler) => { hostListeners[name] = handler; } };
  const child = { parent: host, addEventListener: (name, handler) => { childListeners[name] = handler; } };
  host.postMessage = data => queue.push(() => hostListeners.message({ data, origin: eventOrigin, source: child }));
  child.postMessage = data => queue.push(() => childListeners.message({ data, origin: eventOrigin, source: host }));
  const buttons = ['maze', 'hanoi'].map(name => ({ dataset: { demo: name }, setAttribute() {}, addEventListener() {} }));
  const hostDocument = {
    querySelector: selector => selector === '#auto-switch' ? checkbox : { replaceChildren: frame => { activeFrame = frame; } },
    querySelectorAll: () => buttons,
    createElement: () => ({ contentWindow: child, addEventListener() {} }),
  };
  vm.runInNewContext(hostSource, { document: hostDocument, window: host, location: { protocol, origin, hash: '' } });
  const speed = { value: '3', addEventListener() {}, dispatchEvent() {} };
  vm.runInNewContext(bridgeSource, {
    window: child, location: { protocol, origin, search: '?embedded=1' }, URLSearchParams,
    document: { readyState: 'loading', querySelector: () => speed, addEventListener() {} },
  });
  return {
    checkbox,
    complete: () => child.searchDemoHost.complete(() => { resumed++; }),
    flush: () => { while (queue.length) queue.shift()(); },
    get frameUrl() { return activeFrame.src; },
    get resumed() { return resumed; },
    unknownMessage: () => hostListeners.message({ data: { type: 'search-demo:round-complete' }, origin: eventOrigin, source: {} }),
  };
}

test('completion switches demos without waiting for configuration synchronization', () => {
  const demo = setup();
  assert.equal(demo.complete(), true);
  demo.flush();
  assert.match(demo.frameUrl, /hanoi-search/);
  assert.equal(demo.resumed, 0);
});

test('OFF continues the same demo; turning ON switches on the next completion', () => {
  const demo = setup();
  demo.checkbox.checked = false;
  demo.complete();
  demo.flush();
  assert.match(demo.frameUrl, /maze-search/);
  assert.equal(demo.resumed, 1);
  demo.checkbox.checked = true;
  demo.complete();
  demo.flush();
  assert.match(demo.frameUrl, /hanoi-search/);
});

test('a checkbox change while the completion message is pending uses its latest value', () => {
  const demo = setup();
  demo.complete();
  demo.checkbox.checked = false;
  demo.flush();
  assert.equal(demo.resumed, 1);
  assert.match(demo.frameUrl, /maze-search/);
});

test('opaque file message origins are accepted for the actual embedded frame', () => {
  const demo = setup('file:');
  demo.complete();
  demo.flush();
  assert.match(demo.frameUrl, /hanoi-search/);
});

test('unrelated windows cannot switch the active demo', () => {
  const demo = setup();
  demo.unknownMessage();
  assert.match(demo.frameUrl, /maze-search/);
});
