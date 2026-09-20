const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { WindowLevelPolicy } = require('./window-level-policy');
const { startDesktopForegroundHook } = require('./windows-desktop-hook');

const STORE_PATH = path.join(app.getPath('userData'), 'store.json');

// Extra transparent margin baked into every window bound so the widget's
// CSS drop shadow has room to render instead of being clipped by the OS window edge.
const SHADOW_PAD = 32;

// The 600 task-list max-height (see renderer.js resize handle) is only part of the
// widget's total height — the header row plus its own padding sits on top of it.
// CHROME_HEIGHT is a generous allowance for that (header row, plus room for the
// task-input textarea growing to its own 120px max-height), so the window's max
// bound never clips the bottom of the widget (rows, resize handle) once the task
// list is dragged toward its own max.
const CHROME_HEIGHT = 160;
const MAX_WIDGET_HEIGHT = 600 + CHROME_HEIGHT;

const DEFAULT_STATE = {
  tasks: [
    { id: 1, text: '买咖啡豆', done: true },
    { id: 2, text: '写周报', done: false },
    { id: 3, text: '回复邮件', done: false },
  ],
  collapsed: false,
  pos: null,
  size: { width: 320, height: 360 },
  autoLaunch: true,
  permanentTop: true,
};

function loadState() {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(partial) {
  const current = loadState();
  const next = { ...current, ...partial };
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(next, null, 2));
  } catch (err) {
    console.error('save state failed', err);
  }
  return next;
}

let win = null;
let tray = null;
let isQuitting = false;
let windowLevelPolicy = null;

function defaultPosition(width, height) {
  const { workArea } = screen.getPrimaryDisplay();
  const margin = 28;
  return {
    x: Math.max(workArea.x + margin, workArea.x + workArea.width - width - margin),
    y: workArea.y + margin,
  };
}

function createWindow() {
  const state = loadState();
  const size = state.size || DEFAULT_STATE.size;
  const outerWidth = size.width + SHADOW_PAD * 2;
  const outerHeaderHeight = 60 + SHADOW_PAD * 2;
  const pos = state.pos || defaultPosition(outerWidth, outerHeaderHeight);

  win = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: outerWidth,
    height: outerHeaderHeight,
    useContentSize: true,
    minWidth: 260 + SHADOW_PAD * 2,
    maxWidth: 480 + SHADOW_PAD * 2,
    minHeight: 52 + SHADOW_PAD * 2,
    maxHeight: MAX_WIDGET_HEIGHT + SHADOW_PAD * 2,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    alwaysOnTop: state.permanentTop !== false,
    skipTaskbar: true,
    show: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  windowLevelPolicy = new WindowLevelPolicy({
    window: win,
    permanentTop: state.permanentTop !== false,
    startForegroundHook: process.platform === 'win32' ? startDesktopForegroundHook : null,
  });
  windowLevelPolicy.start();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => win.show());

  win.on('moved', () => {
    const [x, y] = win.getPosition();
    saveState({ pos: { x, y } });
  });

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on('show', () => {
    windowLevelPolicy?.visibilityChanged();
    buildTrayMenu();
  });
  win.on('hide', () => {
    windowLevelPolicy?.visibilityChanged();
    buildTrayMenu();
  });

  return win;
}

function isAutoLaunchEnabled() {
  return app.getLoginItemSettings().openAtLogin;
}

function setAutoLaunch(enabled) {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    app.setLoginItemSettings({ openAtLogin: enabled });
  }
  saveState({ autoLaunch: enabled });
  buildTrayMenu();
}

function setPermanentTop(enabled) {
  saveState({ permanentTop: enabled });
  windowLevelPolicy?.setPermanentTop(enabled);
  buildTrayMenu();
}

function buildTrayMenu() {
  if (!tray) return;
  const visible = win && win.isVisible();
  const menu = Menu.buildFromTemplate([
    {
      label: '显示浮窗',
      type: 'checkbox',
      checked: visible,
      click: (item) => {
        if (!win) return;
        if (item.checked) win.show();
        else win.hide();
      },
    },
    { type: 'separator' },
    {
      label: '永久置顶',
      type: 'checkbox',
      checked: loadState().permanentTop !== false,
      click: (item) => setPermanentTop(item.checked),
    },
    { type: 'separator' },
    {
      label: '开机自启动',
      type: 'checkbox',
      checked: isAutoLaunchEnabled(),
      click: (item) => setAutoLaunch(item.checked),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  const iconPath = path.join(__dirname, 'build', 'tray.png');
  let image = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin') image = image.resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('哞哞清单');
  tray.on('click', () => {
    if (!win) return;
    if (win.isVisible()) win.hide();
    else win.show();
  });
  buildTrayMenu();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    const isFirstRun = !fs.existsSync(STORE_PATH);

    createWindow();
    createTray();

    if (isFirstRun) setAutoLaunch(true);

    ipcMain.handle('state:get', () => loadState());

    ipcMain.on('state:save', (_e, partial) => {
      saveState(partial);
    });

    ipcMain.on('window:resize-content', (_e, { width, height }) => {
      if (!win) return;
      const w = Math.round(Math.min(480 + SHADOW_PAD * 2, Math.max(260 + SHADOW_PAD * 2, width)));
      const h = Math.round(Math.min(MAX_WIDGET_HEIGHT + SHADOW_PAD * 2, Math.max(52 + SHADOW_PAD * 2, height)));
      win.setContentSize(w, h);
    });

    ipcMain.handle('window:get-position', () => (win ? win.getPosition() : [0, 0]));

    // Renderer-driven drag: unlike the native -webkit-app-region drag region,
    // this reliably starts on the very first pointerdown even when the window
    // wasn't already focused (a plain client-area click both focuses and
    // delivers the event, whereas a native drag-region click on an unfocused
    // window only focuses it and eats that first click).
    ipcMain.on('window:set-position', (_e, position) => {
      if (!win || win.isDestroyed() || !position) return;

      const { x, y } = position;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      win.setPosition(Math.round(x), Math.round(y));
    });

    ipcMain.on('window:set-ignore-mouse-events', (_e, ignore) => {
      if (!win || win.isDestroyed() || typeof ignore !== 'boolean') return;
      win.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined);
    });
  });

  app.on('window-all-closed', () => {
    // keep running in tray; only the tray "退出" quits the app
  });

  app.on('before-quit', () => {
    isQuitting = true;
    windowLevelPolicy?.destroy();
    windowLevelPolicy = null;
  });
}
