'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const WidgetHitTest = require('./widget-hit-region');

function setup() {
  const calls = [];
  function eventTarget() {
    const listeners = new Map();
    return {
      addEventListener(name, listener) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(listener);
      },
      emit(name, event = {}) {
        for (const listener of listeners.get(name) || []) listener(event);
      },
    };
  }
  const element = {
    ...eventTarget(),
    getBoundingClientRect: () => ({ left: 32, top: 32, right: 352, bottom: 232, width: 320, height: 200 }),
  };
  const document = { ...eventTarget(), getElementById: () => element };
  const window = {
    ...eventTarget(), WidgetHitTest,
    widgetAPI: {
      setIgnoreMouseEvents: (ignore) => calls.push(ignore),
      // Leave initialization pending; exercise only input listeners.
      getState: () => new Promise(() => {}),
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('./renderer.js'), 'utf8'), {
    document, window, queueMicrotask,
    getComputedStyle: () => ({ borderTopLeftRadius: '28px' }),
  });
  return { document, window, calls };
}

test('forwarded mousemove restores clicks without pointermove or focus change', () => {
  const { document, calls } = setup();
  document.emit('pointermove', { clientX: 10, clientY: 100 });
  document.emit('mousemove', { clientX: 100, clientY: 100 });
  assert.deepEqual(calls, [true, false]);
});

test('transparent corners still pass clicks through', () => {
  const { document, calls } = setup();
  document.emit('mousemove', { clientX: 33, clientY: 33 });
  document.emit('mousemove', { clientX: 10, clientY: 100 });
  assert.deepEqual(calls, [true]);
});

test('focus changes clear click-through and stale pointer state', () => {
  for (const event of ['focus', 'blur']) {
    const { document, window, calls } = setup();
    document.emit('mousemove', { clientX: 10, clientY: 100 });
    window.emit(event);
    assert.deepEqual(calls, [true, false]);
    document.emit('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 });
    window.emit(event);
    document.emit('mousemove', { clientX: 10, clientY: 100 });
    assert.deepEqual(calls, [true, false, true]);
  }
});

test('pressed pointers keep receiving input outside the widget', () => {
  const { document, calls } = setup();
  document.emit('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 });
  document.emit('mousemove', { clientX: 10, clientY: 100 });
  assert.deepEqual(calls, []);
});
