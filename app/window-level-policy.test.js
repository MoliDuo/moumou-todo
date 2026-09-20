'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { WindowLevelPolicy, nativeHandleToBigInt } = require('./window-level-policy');

function makeWindow() {
  const calls = [];
  let visible = true;
  return {
    calls,
    setVisible(value) { visible = value; },
    isVisible() { return visible; },
    isDestroyed() { return false; },
    getNativeWindowHandle() {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(42n);
      return buffer;
    },
    setAlwaysOnTop(enabled, level) { calls.push([enabled, level]); },
  };
}

test('nativeHandleToBigInt reads 32-bit and 64-bit Electron handles', () => {
  const small = Buffer.alloc(4);
  small.writeUInt32LE(123);
  const large = Buffer.alloc(8);
  large.writeBigUInt64LE(456n);
  assert.equal(nativeHandleToBigInt(small), 123n);
  assert.equal(nativeHandleToBigInt(large), 456n);
});

test('permanent mode remains topmost across foreground changes', () => {
  const window = makeWindow();
  const policy = new WindowLevelPolicy({ window, permanentTop: true });
  policy.start();
  policy.handleForeground({ handle: 99n, className: 'Chrome_WidgetWin_1' });
  assert.deepEqual(window.calls, [[true, 'floating']]);
});

test('ordinary mode is topmost only while the desktop is foreground', () => {
  const window = makeWindow();
  const policy = new WindowLevelPolicy({ window, permanentTop: false });
  policy.start();
  policy.handleForeground({ handle: 99n, className: 'WorkerW' });
  policy.handleForeground({ handle: 100n, className: 'Notepad' });
  assert.deepEqual(window.calls, [
    [false, 'normal'],
    [true, 'floating'],
    [false, 'normal'],
  ]);
});

test('the widget foreground and a hidden widget never stay topmost', () => {
  const window = makeWindow();
  const policy = new WindowLevelPolicy({ window, permanentTop: false });
  policy.start();
  policy.handleForeground({ handle: 99n, className: 'Progman' });
  policy.handleForeground({ handle: 42n, className: 'Chrome_WidgetWin_1' });
  policy.handleForeground({ handle: 99n, className: 'WorkerW' });
  window.setVisible(false);
  policy.visibilityChanged();
  assert.deepEqual(window.calls.slice(-3), [
    [false, 'normal'],
    [true, 'floating'],
    [false, 'normal'],
  ]);
});

test('changing the setting applies the new level immediately', () => {
  const window = makeWindow();
  const policy = new WindowLevelPolicy({ window, permanentTop: true });
  policy.start();
  policy.setPermanentTop(false);
  policy.setPermanentTop(true);
  assert.deepEqual(window.calls, [
    [true, 'floating'],
    [false, 'normal'],
    [true, 'floating'],
  ]);
});
