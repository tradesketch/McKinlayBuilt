const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (e, v) => cb(v)),
  restartAndUpdate: () => ipcRenderer.send('restart-and-update'),
});
