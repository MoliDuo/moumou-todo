'use strict';

// Runs renderer/renderer.js in a VM against a minimal fake DOM so its input
// handlers can be exercised without Electron.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const WidgetLayout = require('../renderer/layout');
const WidgetHitTest = require('../renderer/widget-hit-region');

const RENDERER_PATH = path.join(__dirname, '..', 'renderer', 'renderer.js');
const WIDGET_RECT = { left: 32, top: 32, right: 352, bottom: 232, width: 320, height: 200 };

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(listener);
    },
    removeEventListener(name, listener) {
      const list = listeners.get(name) || [];
      const index = list.indexOf(listener);
      if (index !== -1) list.splice(index, 1);
    },
    emit(name, event = {}) {
      for (const listener of [...(listeners.get(name) || [])]) listener(event);
    },
  };
}

function makeElement(id) {
  return {
    ...eventTarget(),
    id,
    value: '',
    innerHTML: '',
    scrollHeight: 20,
    offsetHeight: 60,
    clientHeight: 58,
    dataset: {},
    style: { setProperty() {} },
    classList: { toggle() {}, add() {}, remove() {} },
    querySelectorAll: () => [],
    closest: () => null,
    getBoundingClientRect: () => ({ ...WIDGET_RECT }),
  };
}

function setupRenderer({ position = [10, 20] } = {}) {
  const calls = { ignore: [], saved: [], positions: [], dragEnds: 0 };
  const elements = {};
  const document = {
    ...eventTarget(),
    documentElement: makeElement('html'),
    body: makeElement('body'),
    getElementById: (id) => (elements[id] ??= makeElement(id)),
  };
  const window = {
    ...eventTarget(),
    WidgetLayout,
    WidgetHitTest,
    widgetAPI: {
      setIgnoreMouseEvents: (ignore) => calls.ignore.push(ignore),
      saveState: (partial) => calls.saved.push(structuredClone(partial)),
      setPosition: (x, y) => calls.positions.push([x, y]),
      getPosition: () => Promise.resolve(position),
      dragEnd: () => { calls.dragEnds += 1; },
      resizeContent: () => {},
      // Leave initialization pending; exercise only input listeners.
      getState: () => new Promise(() => {}),
    },
  };
  vm.runInNewContext(fs.readFileSync(RENDERER_PATH, 'utf8'), {
    document,
    window,
    queueMicrotask,
    getComputedStyle: () => ({ borderTopLeftRadius: '28px' }),
  });
  return { document, window, elements, calls };
}

module.exports = { setupRenderer };
