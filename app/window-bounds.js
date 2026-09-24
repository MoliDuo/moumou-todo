'use strict';

// Moves a window so its visible widget (the bounds minus the transparent shadow
// pad) lies inside `workArea`. The pad itself may hang off-screen. When the
// widget is larger than the work area, its top-left corner wins.
function clampWindowPosition(bounds, workArea, pad) {
  const innerWidth = bounds.width - pad * 2;
  const innerHeight = bounds.height - pad * 2;
  const maxX = workArea.x + workArea.width - innerWidth - pad;
  const maxY = workArea.y + workArea.height - innerHeight - pad;
  const minX = workArea.x - pad;
  const minY = workArea.y - pad;
  return {
    x: Math.round(Math.max(minX, Math.min(maxX, bounds.x))),
    y: Math.round(Math.max(minY, Math.min(maxY, bounds.y))),
  };
}

// Largest window height whose widget still fits inside the work area.
function maxWindowHeightFor(workArea, pad) {
  return workArea.height + pad * 2;
}

module.exports = { clampWindowPosition, maxWindowHeightFor };
