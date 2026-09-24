// Layout constants shared by the main process (require) and the renderer (<script>).
(function exposeWidgetLayout(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WidgetLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createWidgetLayout() {
  // Transparent margin around the widget so its CSS drop shadow is not clipped
  // by the OS window edge.
  const SHADOW_PAD = 32;

  const WIDGET_MIN_WIDTH = 260;
  const WIDGET_MAX_WIDTH = 480;
  // `size.height` is the task list's max-height, not the whole widget.
  const LIST_MIN_HEIGHT = 120;
  const LIST_MAX_HEIGHT = 600;
  const WIDGET_MIN_HEIGHT = 52;
  // Height of a collapsed widget, used to size the window before the renderer reports.
  const HEADER_HEIGHT = 60;

  const DEFAULT_SIZE = Object.freeze({ width: 320, height: 360 });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  return {
    SHADOW_PAD,
    WIDGET_MIN_WIDTH,
    WIDGET_MAX_WIDTH,
    LIST_MIN_HEIGHT,
    LIST_MAX_HEIGHT,
    WIDGET_MIN_HEIGHT,
    HEADER_HEIGHT,
    DEFAULT_SIZE,
    clamp,
  };
});
