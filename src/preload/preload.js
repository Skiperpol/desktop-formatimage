'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  pickFiles: () => ipcRenderer.invoke('dialog:pickFiles'),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  addPaths: (paths) => ipcRenderer.invoke('files:add', paths),
  thumbnail: (file) => ipcRenderer.invoke('files:thumbnail', file),
  modelStatus: () => ipcRenderer.invoke('model:status'),
  homeDir: () => ipcRenderer.invoke('app:home'),
  startBatch: (items) => ipcRenderer.invoke('batch:start', items),
  cancelBatch: () => ipcRenderer.invoke('batch:cancel'),
  openFolder: (dir) => ipcRenderer.invoke('shell:openFolder', dir),
  showItem: (file) => ipcRenderer.invoke('shell:showItem', file),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onBatchEvent: (callback) => {
    const handler = (_e, event) => callback(event);
    ipcRenderer.on('batch:event', handler);
    return () => ipcRenderer.removeListener('batch:event', handler);
  },
});
