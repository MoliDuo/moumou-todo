const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetAPI', {
  getState: () => ipcRenderer.invoke('state:get'),
  saveState: (partial) => ipcRenderer.send('state:save', partial),
  resizeContent: (width, height) => ipcRenderer.send('window:resize-content', { width, height }),
  getPosition: () => ipcRenderer.invoke('window:get-position'),
  setPosition: (x, y) => ipcRenderer.send('window:set-position', { x, y }),
  dragEnd: () => ipcRenderer.send('window:drag-end'),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('window:set-ignore-mouse-events', ignore),
});
