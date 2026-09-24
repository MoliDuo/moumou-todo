'use strict';

// Largest coordinate kept well inside the int32 range Electron converts to.
const MAX_COORDINATE = 1e6;

// An integer Electron's window APIs accept: they reject -0 (which Math.round
// returns for values in (-0.5, 0], e.g. a drag at a fractional scale factor
// near the screen's top edge) and anything outside int32.
function toWindowCoordinate(value) {
  return Math.round(Math.max(-MAX_COORDINATE, Math.min(MAX_COORDINATE, value))) || 0;
}

// Width and height of the widget that must stay on screen so its header can
// still be grabbed and dragged back.
const MIN_VISIBLE = 48;

// Moves a window just enough that its widget (the bounds minus the transparent
// shadow pad) stays reachable in `workArea`: the widget may hang off the left,
// right and bottom edges, but its header never leaves the top edge and at
// least MIN_VISIBLE of it stays visible. With `fitBottom`, the whole widget
// height is kept on screen too (used when it grows), top edge winning.
function clampWindowPosition(bounds, workArea, pad, { fitBottom = false } = {}) {
  const innerWidth = bounds.width - pad * 2;
  const innerHeight = bounds.height - pad * 2;
  const right = workArea.x + workArea.width;
  const bottom = workArea.y + workArea.height;
  const minX = workArea.x - innerWidth + MIN_VISIBLE - pad;
  const maxX = right - MIN_VISIBLE - pad;
  const minY = workArea.y - pad;
  const maxY = (fitBottom ? bottom - innerHeight : bottom - MIN_VISIBLE) - pad;
  return {
    x: toWindowCoordinate(Math.max(minX, Math.min(maxX, bounds.x))),
    y: toWindowCoordinate(Math.max(minY, Math.min(maxY, bounds.y))),
  };
}

// Largest window height whose widget still fits inside the work area.
function maxWindowHeightFor(workArea, pad) {
  return workArea.height + pad * 2;
}

module.exports = { clampWindowPosition, maxWindowHeightFor, toWindowCoordinate };
