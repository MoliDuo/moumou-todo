(function exposeWidgetHitTest(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WidgetHitTest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createWidgetHitTest() {
  function isPointInsideRoundedRect(x, y, rect, radius) {
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return false;

    const safeRadius = Math.min(Math.max(0, radius), rect.width / 2, rect.height / 2);
    if (safeRadius === 0) return true;
    if (x >= rect.left + safeRadius && x <= rect.right - safeRadius) return true;
    if (y >= rect.top + safeRadius && y <= rect.bottom - safeRadius) return true;

    const cornerX = x < rect.left + safeRadius
      ? rect.left + safeRadius
      : rect.right - safeRadius;
    const cornerY = y < rect.top + safeRadius
      ? rect.top + safeRadius
      : rect.bottom - safeRadius;
    return (x - cornerX) ** 2 + (y - cornerY) ** 2 <= safeRadius ** 2;
  }

  return { isPointInsideRoundedRect };
});
