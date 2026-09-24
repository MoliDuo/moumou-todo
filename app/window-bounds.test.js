'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { clampWindowPosition, maxWindowHeightFor } = require('./window-bounds');

const PAD = 32;
const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

test('a window already on screen keeps its position', () => {
  assert.deepEqual(
    clampWindowPosition({ x: 500, y: 300, width: 384, height: 424 }, workArea, PAD),
    { x: 500, y: 300 }
  );
});

test('the shadow pad may hang off-screen but the widget may not', () => {
  assert.deepEqual(
    clampWindowPosition({ x: -32, y: -32, width: 384, height: 424 }, workArea, PAD),
    { x: -32, y: -32 }
  );
  assert.deepEqual(
    clampWindowPosition({ x: -200, y: -200, width: 384, height: 424 }, workArea, PAD),
    { x: -32, y: -32 }
  );
  // Right/bottom: widget edge (x + width - pad) lands exactly on the work-area edge.
  assert.deepEqual(
    clampWindowPosition({ x: 5000, y: 5000, width: 384, height: 424 }, workArea, PAD),
    { x: 1920 - 384 + 32, y: 1040 - 424 + 32 }
  );
});

test('a position from a removed monitor comes back to the given work area', () => {
  const secondary = { x: 1920, y: 0, width: 1920, height: 1040 };
  assert.deepEqual(
    clampWindowPosition({ x: 100, y: 100, width: 384, height: 424 }, secondary, PAD),
    { x: 1920 - 32, y: 100 }
  );
});

test('a widget taller than the work area stays top-aligned', () => {
  const small = { x: 0, y: 0, width: 1366, height: 400 };
  assert.deepEqual(
    clampWindowPosition({ x: 100, y: 100, width: 384, height: 824 }, small, PAD),
    { x: 100, y: -32 }
  );
});

test('the window may be as tall as the work area plus both pads', () => {
  assert.equal(maxWindowHeightFor({ x: 0, y: 0, width: 1366, height: 728 }, PAD), 792);
});
