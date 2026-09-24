'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { clampWindowPosition, maxWindowHeightFor, toWindowCoordinate } = require('./window-bounds');

const PAD = 32;
const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

test('a window already on screen keeps its position', () => {
  assert.deepEqual(
    clampWindowPosition({ x: 500, y: 300, width: 384, height: 424 }, workArea, PAD),
    { x: 500, y: 300 }
  );
});

test('the widget may hang off an edge as long as part of it stays grabbable', () => {
  const bounds = { width: 384, height: 424 }; // widget 320 × 360
  // Dropped two-thirds past the right edge: stays put.
  assert.deepEqual(
    clampWindowPosition({ ...bounds, x: 1700, y: 300 }, workArea, PAD),
    { x: 1700, y: 300 }
  );
  // Too far past the right, left or bottom edge: MIN_VISIBLE (48) stays on screen.
  assert.deepEqual(
    clampWindowPosition({ ...bounds, x: 5000, y: 5000 }, workArea, PAD),
    { x: 1920 - 48 - 32, y: 1040 - 48 - 32 }
  );
  assert.deepEqual(
    clampWindowPosition({ ...bounds, x: -5000, y: 300 }, workArea, PAD),
    { x: 48 - 320 - 32, y: 300 }
  );
  // The header never goes above the top edge; the shadow pad may.
  assert.deepEqual(
    clampWindowPosition({ ...bounds, x: 500, y: -200 }, workArea, PAD),
    { x: 500, y: -32 }
  );
});

test('a growing widget is kept fully on screen vertically', () => {
  assert.deepEqual(
    clampWindowPosition({ x: 500, y: 900, width: 384, height: 424 }, workArea, PAD, { fitBottom: true }),
    { x: 500, y: 1040 - 424 + 32 }
  );
  // Taller than the work area: the top edge wins.
  const small = { x: 0, y: 0, width: 1366, height: 400 };
  assert.deepEqual(
    clampWindowPosition({ x: 100, y: 100, width: 384, height: 824 }, small, PAD, { fitBottom: true }),
    { x: 100, y: -32 }
  );
});

test('a position from a removed monitor comes back to the given work area', () => {
  const secondary = { x: 1920, y: 0, width: 1920, height: 1040 };
  assert.deepEqual(
    clampWindowPosition({ x: 100, y: 100, width: 384, height: 424 }, secondary, PAD),
    { x: 1920 + 48 - 320 - 32, y: 100 }
  );
});

test('the window may be as tall as the work area plus both pads', () => {
  assert.equal(maxWindowHeightFor({ x: 0, y: 0, width: 1366, height: 728 }, PAD), 792);
});

test('window coordinates are integers Electron can convert', () => {
  // Math.round(-0.3) is -0, which Electron rejects as a position.
  assert.ok(Object.is(toWindowCoordinate(-0.3), 0));
  assert.equal(toWindowCoordinate(-0.6), -1);
  assert.equal(toWindowCoordinate(123.5), 124);
  assert.equal(toWindowCoordinate(1e12), 1e6);
  assert.equal(toWindowCoordinate(-1e12), -1e6);
});
