'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupRenderer } = require('../test-support/renderer-harness');

function keydown(overrides) {
  return { key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13, preventDefault() {}, ...overrides };
}

test('Enter adds the typed task and clears the input', () => {
  const { elements, calls } = setupRenderer();
  const input = elements['task-input'];
  input.value = '  写周报  ';
  input.emit('keydown', keydown());
  assert.equal(calls.saved.length, 1);
  assert.equal(calls.saved[0].tasks.length, 1);
  assert.equal(calls.saved[0].tasks[0].text, '写周报');
  assert.equal(calls.saved[0].tasks[0].done, false);
  assert.equal(input.value, '');
});

test('an Enter that confirms an IME composition does not add a task', () => {
  const { elements, calls } = setupRenderer();
  const input = elements['task-input'];
  input.value = 'nihao';
  input.emit('keydown', keydown({ isComposing: true }));
  input.emit('keydown', keydown({ key: 'Process', keyCode: 229 }));
  input.emit('keydown', keydown({ keyCode: 229 }));
  assert.deepEqual(calls.saved, []);
  assert.equal(input.value, 'nihao');
});

test('Shift+Enter and blank input do not add a task', () => {
  const { elements, calls } = setupRenderer();
  const input = elements['task-input'];
  input.value = 'first line';
  input.emit('keydown', keydown({ shiftKey: true }));
  input.value = '   ';
  input.emit('keydown', keydown());
  assert.deepEqual(calls.saved, []);
});

test('task ids stay unique when added in quick succession', () => {
  const { elements, calls } = setupRenderer();
  const input = elements['task-input'];
  for (const text of ['a', 'b', 'c']) {
    input.value = text;
    input.emit('keydown', keydown());
  }
  const ids = calls.saved.at(-1).tasks.map((task) => task.id);
  assert.equal(new Set(ids).size, 3);
});

test('dragging the header moves the window and reports the end of the drag', async () => {
  const { elements, window, calls } = setupRenderer({ position: [10, 20] });
  const header = elements.header;
  header.emit('pointerdown', {
    button: 0,
    pointerId: 1,
    screenX: 100,
    screenY: 100,
    target: { closest: () => null },
    preventDefault() {},
  });
  // A move before the window position arrives is applied once it does.
  window.emit('pointermove', { pointerId: 1, buttons: 1, screenX: 110, screenY: 105 });
  await new Promise(setImmediate);
  window.emit('pointermove', { pointerId: 1, buttons: 1, screenX: 130, screenY: 150 });
  window.emit('pointerup', { pointerId: 1 });
  assert.deepEqual(calls.positions, [[20, 25], [40, 70]]);
  assert.equal(calls.dragEnds, 1);
});

test('a header click without movement does not report a drag', async () => {
  const { elements, window, calls } = setupRenderer();
  elements.header.emit('pointerdown', {
    button: 0,
    pointerId: 1,
    screenX: 100,
    screenY: 100,
    target: { closest: () => null },
    preventDefault() {},
  });
  await new Promise(setImmediate);
  window.emit('pointerup', { pointerId: 1 });
  assert.deepEqual(calls.positions, []);
  assert.equal(calls.dragEnds, 0);
});
