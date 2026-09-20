'use strict';

function startDesktopForegroundHook(onForegroundWindow) {
  if (process.platform !== 'win32') return () => {};

  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const HWND = koffi.pointer('HWND', koffi.opaque());
  const HWINEVENTHOOK = koffi.pointer('HWINEVENTHOOK', koffi.opaque());
  const WinEventProc = koffi.proto(
    'void __stdcall WinEventProc(HWINEVENTHOOK hook, uint32_t event, HWND hwnd, int32_t objectId, int32_t childId, uint32_t eventThread, uint32_t eventTime)'
  );

  const setWinEventHook = user32.func(
    '__stdcall',
    'SetWinEventHook',
    HWINEVENTHOOK,
    ['uint32_t', 'uint32_t', 'void *', koffi.pointer(WinEventProc), 'uint32_t', 'uint32_t', 'uint32_t']
  );
  const unhookWinEvent = user32.func('__stdcall', 'UnhookWinEvent', 'bool', [HWINEVENTHOOK]);
  const getClassName = user32.func(
    '__stdcall',
    'GetClassNameW',
    'int',
    [HWND, koffi.pointer('uint16_t'), 'int']
  );

  const EVENT_SYSTEM_FOREGROUND = 0x0003;
  const WINEVENT_OUTOFCONTEXT = 0x0000;
  const classNameBuffer = Buffer.alloc(512);

  const callback = koffi.register((_hook, event, hwnd, objectId, childId) => {
    if (event !== EVENT_SYSTEM_FOREGROUND || !hwnd || objectId !== 0 || childId !== 0) return;

    classNameBuffer.fill(0);
    const length = getClassName(hwnd, classNameBuffer, classNameBuffer.length / 2);
    const className = length > 0 ? classNameBuffer.toString('utf16le', 0, length * 2) : '';
    onForegroundWindow({ handle: hwnd, className });
  }, koffi.pointer(WinEventProc));

  const hook = setWinEventHook(
    EVENT_SYSTEM_FOREGROUND,
    EVENT_SYSTEM_FOREGROUND,
    null,
    callback,
    0,
    0,
    WINEVENT_OUTOFCONTEXT
  );

  if (!hook) {
    koffi.unregister(callback);
    throw new Error('SetWinEventHook failed');
  }

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    unhookWinEvent(hook);
    koffi.unregister(callback);
  };
}

module.exports = { startDesktopForegroundHook };
