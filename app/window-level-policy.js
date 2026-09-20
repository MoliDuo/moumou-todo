'use strict';

const DESKTOP_WINDOW_CLASSES = new Set(['WorkerW', 'Progman']);

function nativeHandleToBigInt(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 8) return buffer.readBigUInt64LE(0);
  if (buffer.length >= 4) return BigInt(buffer.readUInt32LE(0));
  return null;
}

class WindowLevelPolicy {
  constructor({ window, permanentTop, startForegroundHook, onError = console.error }) {
    this.window = window;
    this.permanentTop = !!permanentTop;
    this.startForegroundHook = startForegroundHook;
    this.onError = onError;
    this.appliedTop = null;
    this.stopHook = null;
    this.generation = 0;
  }

  start() {
    this.applyTop(this.permanentTop);
    if (!this.startForegroundHook) return;

    try {
      this.stopHook = this.startForegroundHook((foreground) => {
        const generation = ++this.generation;
        setImmediate(() => {
          if (generation === this.generation) this.handleForeground(foreground);
        });
      });
    } catch (error) {
      this.onError('desktop foreground hook failed', error);
    }
  }

  setPermanentTop(enabled) {
    this.permanentTop = !!enabled;
    this.generation += 1;
    this.applyTop(this.permanentTop);
  }

  handleForeground({ handle, className }) {
    if (this.permanentTop) return;
    if (!this.window || this.window.isDestroyed() || !this.window.isVisible()) {
      this.applyTop(false);
      return;
    }

    const ownHandle = nativeHandleToBigInt(this.window.getNativeWindowHandle());
    const isOwnWindow = ownHandle !== null && BigInt(handle) === ownHandle;
    const isDesktop = DESKTOP_WINDOW_CLASSES.has(className);

    // Making the widget topmost only while Explorer's desktop owns the foreground
    // keeps it visible for Win+D without activating it. The next app foreground
    // event immediately restores ordinary window stacking.
    this.applyTop(!isOwnWindow && isDesktop);
  }

  visibilityChanged() {
    if (!this.permanentTop && (!this.window || !this.window.isVisible())) this.applyTop(false);
  }

  applyTop(enabled) {
    if (!this.window || this.window.isDestroyed() || this.appliedTop === enabled) return;
    this.window.setAlwaysOnTop(enabled, enabled ? 'floating' : 'normal');
    this.appliedTop = enabled;
  }

  destroy() {
    this.generation += 1;
    if (this.stopHook) this.stopHook();
    this.stopHook = null;
  }
}

module.exports = { WindowLevelPolicy, nativeHandleToBigInt, DESKTOP_WINDOW_CLASSES };
