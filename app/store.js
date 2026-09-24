'use strict';

const nodeFs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { DEFAULT_SIZE, WIDGET_MIN_WIDTH, WIDGET_MAX_WIDTH, LIST_MIN_HEIGHT, LIST_MAX_HEIGHT, clamp } =
  require('./renderer/layout');
const { MAX_DURATION_MINUTES } = require('./renderer/history');

const DEFAULT_STATE = Object.freeze({
  tasks: [
    { id: 1, text: '买咖啡豆', done: true },
    { id: 2, text: '写周报', done: false },
    { id: 3, text: '回复邮件', done: false },
  ],
  collapsed: false,
  pos: null,
  size: DEFAULT_SIZE,
  permanentTop: true,
});

// Keys the renderer is allowed to write; window position and settings stay main-owned.
const RENDERER_KEYS = ['tasks', 'collapsed', 'size'];

function sanitizeTasks(value) {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((task) => task && typeof task.text === 'string' && task.text.trim())
    .map((task) => {
      const clean = {
        id: typeof task.id === 'string' || Number.isFinite(task.id) ? task.id : randomUUID(),
        text: task.text,
        done: !!task.done,
      };
      // Completion time (ms since epoch) only means something while the task is done.
      if (clean.done && Number.isFinite(task.doneAt)) clean.doneAt = Math.round(task.doneAt);
      // Removed from the to-do list but kept in the completed view.
      if (clean.done && task.archived === true) clean.archived = true;
      // Minutes spent, set from the completed-tasks view; absent means 0.
      if (Number.isFinite(task.duration) && task.duration > 0) {
        clean.duration = Math.round(Math.min(task.duration, MAX_DURATION_MINUTES));
      }
      return clean;
    });
}

function sanitizeSize(value) {
  if (!value || !Number.isFinite(value.width) || !Number.isFinite(value.height)) return undefined;
  return {
    width: Math.round(clamp(value.width, WIDGET_MIN_WIDTH, WIDGET_MAX_WIDTH)),
    height: Math.round(clamp(value.height, LIST_MIN_HEIGHT, LIST_MAX_HEIGHT)),
  };
}

function sanitizePos(value) {
  if (value === null) return null;
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return undefined;
  return { x: Math.round(value.x), y: Math.round(value.y) };
}

const SANITIZERS = {
  tasks: sanitizeTasks,
  collapsed: (value) => (typeof value === 'boolean' ? value : undefined),
  pos: sanitizePos,
  size: sanitizeSize,
  permanentTop: (value) => (typeof value === 'boolean' ? value : undefined),
};

// Returns only the recognised, well-formed keys of `partial`.
function sanitizeState(partial, allowedKeys = Object.keys(SANITIZERS)) {
  const result = {};
  if (!partial || typeof partial !== 'object') return result;
  for (const key of allowedKeys) {
    if (!(key in partial)) continue;
    const value = SANITIZERS[key](partial[key]);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

class Store {
  constructor({ filePath, defaults = DEFAULT_STATE, fs = nodeFs, onError = console.error }) {
    this.filePath = filePath;
    this.defaults = defaults;
    this.fs = fs;
    this.onError = onError;
    this.state = null;
    this.existed = false;
  }

  get() {
    if (!this.state) this.state = this.load();
    return this.state;
  }

  load() {
    let raw;
    try {
      raw = this.fs.readFileSync(this.filePath, 'utf-8');
    } catch (error) {
      if (error.code !== 'ENOENT') this.onError('read state failed', error);
      return structuredClone(this.defaults);
    }

    this.existed = true;
    try {
      return { ...structuredClone(this.defaults), ...sanitizeState(JSON.parse(raw)) };
    } catch (error) {
      // Keep the unreadable file for recovery instead of overwriting it on the next save.
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      this.onError(`state file is corrupt, moved to ${backup}`, error);
      try {
        this.fs.renameSync(this.filePath, backup);
      } catch (renameError) {
        this.onError('backup corrupt state failed', renameError);
      }
      return structuredClone(this.defaults);
    }
  }

  update(partial) {
    this.state = { ...this.get(), ...partial };
    this.write();
    return this.state;
  }

  write() {
    const data = JSON.stringify(this.state, null, 2);
    const tmp = `${this.filePath}.tmp`;
    try {
      this.fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      this.fs.writeFileSync(tmp, data);
      try {
        this.fs.renameSync(tmp, this.filePath);
      } catch (error) {
        // Windows can refuse the replace while another process (e.g. an antivirus
        // scanner) holds the target open; a direct write beats losing the save.
        this.onError('atomic state replace failed, writing directly', error);
        this.fs.writeFileSync(this.filePath, data);
        this.fs.rmSync(tmp, { force: true });
      }
      this.existed = true;
    } catch (error) {
      this.onError('save state failed', error);
    }
  }
}

module.exports = { Store, DEFAULT_STATE, RENDERER_KEYS, sanitizeState };
