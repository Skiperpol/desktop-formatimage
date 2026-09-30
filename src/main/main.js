'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme } = require('electron');
const { loadSettings, saveSettings } = require('./settings');
const { expandPaths, describe, thumbnail, IMAGE_EXTENSIONS } = require('./files');
const { findModel, MODEL_BYTES } = require('./model');
const { BatchRunner } = require('./batch');

let win = null;
let runner = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    title: 'Bez tła',
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#15171c' : '#eceef1',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('closed', () => {
    win = null;
  });
}

function send(event) {
  if (win && !win.isDestroyed()) win.webContents.send('batch:event', event);
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string' && v) : [];
}

function registerIpc() {
  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:set', (_e, partial) => saveSettings(partial && typeof partial === 'object' ? partial : {}));

  ipcMain.handle('dialog:pickFiles', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Wybierz zdjęcia',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Zdjęcia', extensions: IMAGE_EXTENSIONS.map((e) => e.slice(1)) }],
    });
    return res.canceled ? [] : res.filePaths;
  });

  ipcMain.handle('dialog:pickFolder', async () => {
    const current = loadSettings().outputDir;
    const res = await dialog.showOpenDialog(win, {
      title: 'Wybierz folder zapisu',
      defaultPath: fs.existsSync(current) ? current : app.getPath('pictures'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return saveSettings({ outputDir: res.filePaths[0] });
  });

  ipcMain.handle('files:add', async (_e, paths) => {
    const files = expandPaths(asStringArray(paths));
    return Promise.all(files.map(describe));
  });

  ipcMain.handle('files:thumbnail', async (_e, file) => {
    if (typeof file !== 'string') return null;
    try {
      return await thumbnail(file);
    } catch {
      return null;
    }
  });

  ipcMain.handle('model:status', () => ({ ready: Boolean(findModel()), bytes: MODEL_BYTES }));
  ipcMain.handle('app:home', () => app.getPath('home'));

  ipcMain.handle('batch:start', (_e, items) => {
    if (!Array.isArray(items) || runner.running) return false;
    const jobs = items.filter((i) => i && typeof i.id === 'string' && typeof i.path === 'string');
    runner.start(jobs, loadSettings());
    return true;
  });

  ipcMain.handle('batch:cancel', () => runner.cancel());

  ipcMain.handle('shell:openFolder', (_e, dir) => {
    if (typeof dir === 'string' && fs.existsSync(dir)) return shell.openPath(dir);
    return 'Folder nie istnieje.';
  });

  ipcMain.handle('shell:showItem', (_e, file) => {
    if (typeof file === 'string' && fs.existsSync(file)) shell.showItemInFolder(file);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  Menu.setApplicationMenu(null);

  app.whenReady().then(() => {
    runner = new BatchRunner(send);
    registerIpc();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => runner && runner.dispose());
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
