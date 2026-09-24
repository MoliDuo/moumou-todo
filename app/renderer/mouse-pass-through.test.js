'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupRenderer } = require('../test-support/renderer-harness');

test('forwarded mousemove restores clicks without pointermove or focus change', () => {
  const { document, calls } = setupRenderer();
  document.emit('pointermove', { clientX: 10, clientY: 100 });
  document.emit('mousemove', { clientX: 100, clientY: 100 });
  assert.deepEqual(calls.ignore, [true, false]);
});

test('transparent corners still pass clicks through', () => {
  const { document, calls } = setupRenderer();
  document.emit('mousemove', { clientX: 33, clientY: 33 });
  document.emit('mousemove', { clientX: 10, clientY: 100 });
  assert.deepEqual(calls.ignore, [true]);
});

test('focus changes clear click-through and stale pointer state', () => {
  for (const event of ['focus', 'blur']) {
    const { document, window, calls } = setupRenderer();
    document.emit('mousemove', { clientX: 10, clientY: 100 });
    window.emit(event);
    assert.deepEqual(calls.ignore, [true, false]);
    document.emit('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 });
    window.emit(event);
    document.emit('mousemove', { clientX: 10, clientY: 100 });
    assert.deepEqual(calls.ignore, [true, false, true]);
  }
});

test('pressed pointers keep receiving input outside the widget', () => {
  const { document, calls } = setupRenderer();
  document.emit('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 });
  document.emit('mousemove', { clientX: 10, clientY: 100 });
  assert.deepEqual(calls.ignore, []);
});

test('the pointermove/mousemove pair for one movement is evaluated once', () => {
  const { document, elements, calls } = setupRenderer();
  const widget = elements.widget;
  const measure = widget.getBoundingClientRect;
  let hitTests = 0;
  widget.getBoundingClientRect = () => {
    hitTests += 1;
    return measure();
  };
  document.emit('pointermove', { clientX: 10, clientY: 100 });
  document.emit('mousemove', { clientX: 10, clientY: 100 });
  document.emit('pointermove', { clientX: 100, clientY: 100 });
  document.emit('mousemove', { clientX: 100, clientY: 100 });
  assert.deepEqual(calls.ignore, [true, false]);
  assert.equal(hitTests, 2);
});
