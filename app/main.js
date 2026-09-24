const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const { WindowLevelPolicy } = require('./window-level-policy');
const { startDesktopForegroundHook } = require('./windows-desktop-hook');
const { Store, RENDERER_KEYS, sanitizeState } = require('./store');
const { clampWindowPosition, maxWindowHeightFor } = require('./window-bounds');
const {
  SHADOW_PAD,
  WIDGET_MIN_WIDTH,
  WIDGET_MAX_WIDTH,
  WIDGET_MIN_HEIGHT,
  WIDGET_MAX_HEIGHT,
  HEADER_HEIGHT,
  clamp,
} = require('./renderer/layout');

// Keep `npm start` away from the installed app's tasks, single-instance lock and login item.
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), `${app.getName()}-dev`));
}

const store = new Store({ filePath: path.join(app.getPath('userData'), 'store.json') });

const MIN_WINDOW_WIDTH = WIDGET_MIN_WIDTH + SHADOW_PAD * 2;
const MAX_WINDOW_WIDTH = WIDGET_MAX_WIDTH + SHADOW_PAD * 2;
const MIN_WINDOW_HEIGHT = WIDGET_MIN_HEIGHT + SHADOW_PAD * 2;
const MAX_WINDOW_HEIGHT = WIDGET_MAX_HEIGHT + SHADOW_PAD * 2;
// Show the window without waiting for the renderer's first size report after this long.
const INITIAL_SHOW_TIMEOUT_MS = 1000;

let win = null;
let tray = null;
let isQuitting = false;
let windowLevelPolicy = null;
// Set by createWindow; called once the renderer has reported the widget size.
let markWindowSized = null;

function defaultPosition(width, height) {
  const { workArea } = screen.getPrimaryDisplay();
  const margin = 28;
  return {
    x: Math.max(workArea.x + margin, workArea.x + workArea.width - width - margin),
    y: workArea.y + margin,
  };
}

// Nearest display's work area, so a position saved on a since-removed monitor comes back.
function positionOnScreen(bounds) {
  const { workArea } = screen.getDisplayMatching(bounds);
  return clampWindowPosition(bounds, workArea, SHADOW_PAD);
}

function savePosition() {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  store.update({ pos: { x, y } });
}

// Returns true when the window had to be moved.
function keepOnScreen() {
  if (!win || win.isDestroyed()) return false;
  const bounds = win.getBounds();
  const { x, y } = positionOnScreen(bounds);
  if (x === bounds.x && y === bounds.y) return false;
  win.setPosition(x, y);
  return true;
}

function createWindow() {
  const state = store.get();
  const width = state.size.width + SHADOW_PAD * 2;
  const height = HEADER_HEIGHT + SHADOW_PAD * 2;
  const pos = state.pos
    ? positionOnScreen({ ...state.pos, width, height })
    : defaultPosition(width, height);

  win = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width,
    height,
    useContentSize: true,
    minWidth: MIN_WINDOW_WIDTH,
    maxWidth: MAX_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    maxHeight: MAX_WINDOW_HEIGHT,
    frame: false,
    transparent: true,
    hasShadow: false,
    // Transparent windows must not be user-resizable; the widget resizes the
    // window itself through `window:resize-content`.
    resizable: false,
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
      sandbox: true,
    },
  });

  windowLevelPolicy = new WindowLevelPolicy({
    window: win,
    permanentTop: state.permanentTop !== false,
    startForegroundHook: process.platform === 'win32' ? startDesktopForegroundHook : null,
  });
  windowLevelPolicy.start();

  // Dropping a file (or a link) on the widget would otherwise navigate away from it.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('context-menu', (_e, params) => showEditMenu(params));

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Wait for the renderer's first size report so the widget doesn't appear
  // clipped to its header height and then jump open.
  let readyToShow = false;
  let sized = false;
  let shown = false;
  const showInitially = () => {
    if (shown || !readyToShow || !sized || win.isDestroyed()) return;
    shown = true;
    win.show();
  };
  win.once('ready-to-show', () => {
    readyToShow = true;
    showInitially();
    setTimeout(() => markWindowSized?.(), INITIAL_SHOW_TIMEOUT_MS);
  });
  markWindowSized = () => {
    if (sized) return;
    sized = true;
    showInitially();
  };

  win.on('moved', savePosition);

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

function showEditMenu({ isEditable, editFlags }) {
  if (!isEditable || !win) return;
  Menu.buildFromTemplate([
    { label: '撤销', role: 'undo', enabled: editFlags.canUndo },
    { label: '重做', role: 'redo', enabled: editFlags.canRedo },
    { type: 'separator' },
    { label: '剪切', role: 'cut', enabled: editFlags.canCut },
    { label: '复制', role: 'copy', enabled: editFlags.canCopy },
    { label: '粘贴', role: 'paste', enabled: editFlags.canPaste },
    { type: 'separator' },
    { label: '全选', role: 'selectAll', enabled: editFlags.canSelectAll },
  ]).popup({ window: win });
}

function canAutoLaunch() {
  return app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin');
}

function loginItemOptions() {
  // The portable build runs from a temporary extraction directory; the login
  // item must point at the portable exe the user actually keeps.
  return { path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath };
}

function isAutoLaunchEnabled() {
  return canAutoLaunch() && app.getLoginItemSettings(loginItemOptions()).openAtLogin;
}

function setAutoLaunch(enabled) {
  if (!canAutoLaunch()) return;
  app.setLoginItemSettings({ openAtLogin: enabled, ...loginItemOptions() });
  buildTrayMenu();
}

// Earlier portable builds registered their temporary extraction path. If our
// login item exists but points elsewhere, re-point it at this executable.
function repairAutoLaunchPath() {
  if (!canAutoLaunch() || process.platform !== 'win32') return;
  const { openAtLogin, launchItems = [] } = app.getLoginItemSettings(loginItemOptions());
  if (!openAtLogin && launchItems.some((item) => item.enabled)) setAutoLaunch(true);
}

function setPermanentTop(enabled) {
  store.update({ permanentTop: enabled });
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
      checked: store.get().permanentTop !== false,
      click: (item) => setPermanentTop(item.checked),
    },
    { type: 'separator' },
    {
      label: app.isPackaged ? '开机自启动' : '开机自启动（开发模式不可用）',
      type: 'checkbox',
      enabled: canAutoLaunch(),
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
  // Windows picks the right size out of the multi-resolution .ico; elsewhere
  // nativeImage pairs tray.png with tray@2x.png automatically.
  const icon = process.platform === 'win32' ? 'icon.ico' : 'tray.png';
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'build', icon)));
  tray.setToolTip('哞哞清单');
  tray.on('click', () => {
    if (!win) return;
    if (win.isVisible()) win.hide();
    else win.show();
  });
  buildTrayMenu();
}

function isWindowAvailable() {
  return win && !win.isDestroyed();
}

function registerIpc() {
  ipcMain.handle('state:get', () => store.get());

  ipcMain.on('state:save', (_e, partial) => {
    const clean = sanitizeState(partial, RENDERER_KEYS);
    if (Object.keys(clean).length > 0) store.update(clean);
  });

  ipcMain.on('window:resize-content', (_e, size) => {
    if (!isWindowAvailable() || !size) return;
    const { width, height } = size;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;

    const { workArea } = screen.getDisplayMatching(win.getBounds());
    const maxHeight = Math.min(MAX_WINDOW_HEIGHT, maxWindowHeightFor(workArea, SHADOW_PAD));
    const w = Math.round(clamp(width, MIN_WINDOW_WIDTH, MAX_WINDOW_WIDTH));
    const h = Math.round(clamp(height, MIN_WINDOW_HEIGHT, Math.max(MIN_WINDOW_HEIGHT, maxHeight)));
    win.setContentSize(w, h);
    markWindowSized?.();
    // Growing (expanding, resizing) near the screen edge must not push the widget off-screen.
    if (keepOnScreen()) savePosition();
  });

  ipcMain.handle('window:get-position', () => (isWindowAvailable() ? win.getPosition() : [0, 0]));

  // Renderer-driven drag: unlike the native -webkit-app-region drag region,
  // this reliably starts on the very first pointerdown even when the window
  // wasn't already focused (a plain client-area click both focuses and
  // delivers the event, whereas a native drag-region click on an unfocused
  // window only focuses it and eats that first click).
  ipcMain.on('window:set-position', (_e, position) => {
    if (!isWindowAvailable() || !position) return;

    const { x, y } = position;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    win.setPosition(Math.round(x), Math.round(y));
  });

  // Programmatic setPosition never emits 'moved' on Windows, so the renderer
  // reports the end of a drag explicitly.
  ipcMain.on('window:drag-end', () => {
    if (!isWindowAvailable()) return;
    keepOnScreen();
    savePosition();
  });

  ipcMain.on('window:set-ignore-mouse-events', (_e, ignore) => {
    if (!isWindowAvailable() || typeof ignore !== 'boolean') return;
    win.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined);
  });
}

function onDisplaysChanged() {
  if (keepOnScreen()) savePosition();
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
    store.get();
    const isFirstRun = !store.existed;

    registerIpc();
    createWindow();
    createTray();

    if (isFirstRun) {
      // Write the file now so the next launch is no longer a first run.
      store.update({});
      setAutoLaunch(true);
    } else {
      repairAutoLaunchPath();
    }

    screen.on('display-removed', onDisplaysChanged);
    screen.on('display-metrics-changed', onDisplaysChanged);
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
