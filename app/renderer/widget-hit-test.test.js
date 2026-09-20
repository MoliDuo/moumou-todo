'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isPointInsideRoundedRect } = require('./widget-hit-region');

const rect = { left: 32, top: 32, right: 352, bottom: 232, width: 320, height: 200 };

test('the visible body and border of the rounded widget receive mouse input', () => {
  assert.equal(isPointInsideRoundedRect(192, 32, rect, 28), true);
  assert.equal(isPointInsideRoundedRect(32, 132, rect, 28), true);
  assert.equal(isPointInsideRoundedRect(192, 132, rect, 28), true);
});

test('transparent padding and rounded corners pass mouse input through', () => {
  assert.equal(isPointInsideRoundedRect(16, 132, rect, 28), false);
  assert.equal(isPointInsideRoundedRect(368, 132, rect, 28), false);
  assert.equal(isPointInsideRoundedRect(32, 32, rect, 28), false);
  assert.equal(isPointInsideRoundedRect(352, 232, rect, 28), false);
});

test('rounded-corner boundary points are included without scale conversion', () => {
  assert.equal(isPointInsideRoundedRect(40, 52, rect, 28), true);
  assert.equal(isPointInsideRoundedRect(33, 33, rect, 28), false);
});
