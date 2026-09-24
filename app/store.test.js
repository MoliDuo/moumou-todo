'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, DEFAULT_STATE, RENDERER_KEYS, sanitizeState } = require('./store');

function tempStorePath(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moumou-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'nested', 'store.json');
}

const silent = () => {};

test('a missing file yields the defaults and is reported as a first run', (t) => {
  const store = new Store({ filePath: tempStorePath(t), onError: silent });
  assert.deepEqual(store.get(), DEFAULT_STATE);
  assert.equal(store.existed, false);
});

test('updates are written to disk and survive a reload', (t) => {
  const filePath = tempStorePath(t);
  const store = new Store({ filePath, onError: silent });
  store.update({ collapsed: true, tasks: [{ id: 'a', text: '写周报', done: false }] });

  const reloaded = new Store({ filePath, onError: silent });
  assert.equal(reloaded.get().collapsed, true);
  assert.deepEqual(reloaded.get().tasks, [{ id: 'a', text: '写周报', done: false }]);
  assert.equal(reloaded.existed, true);
  assert.equal(fs.existsSync(`${filePath}.tmp`), false);
});

test('updates do not mutate the shared defaults', (t) => {
  const store = new Store({ filePath: tempStorePath(t), onError: silent });
  store.get().tasks.push({ id: 9, text: 'x', done: false });
  assert.equal(DEFAULT_STATE.tasks.length, 3);
});

test('a corrupt file is kept as a backup instead of being overwritten', (t) => {
  const filePath = tempStorePath(t);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '{"tasks": [{"id": 1, "te');
  const errors = [];
  const store = new Store({ filePath, onError: (message) => errors.push(message) });

  assert.deepEqual(store.get().tasks, DEFAULT_STATE.tasks);
  const backups = fs.readdirSync(path.dirname(filePath)).filter((f) => f.startsWith('store.json.corrupt-'));
  assert.equal(backups.length, 1);
  assert.equal(
    fs.readFileSync(path.join(path.dirname(filePath), backups[0]), 'utf8'),
    '{"tasks": [{"id": 1, "te'
  );
  assert.equal(errors.length, 1);
});

test('a failed atomic replace falls back to writing the file directly', (t) => {
  const filePath = tempStorePath(t);
  const flakyFs = {
    ...fs,
    renameSync() {
      throw Object.assign(new Error('busy'), { code: 'EPERM' });
    },
  };
  const store = new Store({ filePath, fs: flakyFs, onError: silent });
  store.update({ collapsed: true });
  assert.equal(JSON.parse(fs.readFileSync(filePath, 'utf8')).collapsed, true);
  assert.equal(fs.existsSync(`${filePath}.tmp`), false);
});

test('loaded state drops unknown keys and malformed values', (t) => {
  const filePath = tempStorePath(t);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({
    autoLaunch: true,
    collapsed: 'yes',
    pos: { x: 'left', y: 3 },
    size: { width: 9999, height: 10 },
    tasks: [{ id: 1, text: 'ok', done: 1 }, { id: 2 }, null, { text: '   ' }],
  }));
  const state = new Store({ filePath, onError: silent }).get();
  assert.equal('autoLaunch' in state, false);
  assert.equal(state.collapsed, false);
  assert.equal(state.pos, null);
  assert.deepEqual(state.size, { width: 480, height: 120 });
  assert.deepEqual(state.tasks, [{ id: 1, text: 'ok', done: true }]);
});

test('the renderer cannot overwrite main-owned settings', () => {
  const clean = sanitizeState(
    { tasks: [], collapsed: true, pos: { x: 1, y: 2 }, permanentTop: false },
    RENDERER_KEYS
  );
  assert.deepEqual(clean, { tasks: [], collapsed: true });
});

test('completion time and duration survive a save and reload', (t) => {
  const filePath = tempStorePath(t);
  const store = new Store({ filePath, onError: silent });
  store.update(sanitizeState({
    tasks: [
      { id: 'a', text: 'done', done: true, doneAt: 1790000000000.4, duration: 45 },
      { id: 'b', text: 'reopened', done: false, doneAt: 1790000000000, duration: 0 },
      { id: 'c', text: 'typo', done: true, doneAt: 'noon', duration: 1e9 },
    ],
  }, RENDERER_KEYS));
  assert.deepEqual(new Store({ filePath, onError: silent }).get().tasks, [
    { id: 'a', text: 'done', done: true, doneAt: 1790000000000, duration: 45 },
    { id: 'b', text: 'reopened', done: false },
    { id: 'c', text: 'typo', done: true, duration: 6000 },
  ]);
});

test('only completed tasks can be archived', () => {
  const { tasks } = sanitizeState({
    tasks: [
      { id: 'a', text: 'hidden', done: true, archived: true },
      { id: 'b', text: 'open', done: false, archived: true },
      { id: 'c', text: 'odd', done: true, archived: 'yes' },
    ],
  });
  assert.deepEqual(tasks, [
    { id: 'a', text: 'hidden', done: true, archived: true },
    { id: 'b', text: 'open', done: false },
    { id: 'c', text: 'odd', done: true },
  ]);
});
