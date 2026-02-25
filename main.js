const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Only load electron-reload in dev (crashes in production builds)
if (!app.isPackaged) {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, 'node_modules', '.bin', 'electron')
    });
  } catch (e) {}
}

let mainWindow;
const CONFIG_PATH = path.join(__dirname, 'app', 'config.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    title: 'McK Sketch',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'app', 'preload.js')
    }
  });

  mainWindow.loadFile('app/mck-sketch.html');

  mainWindow.webContents.on('did-finish-load', function() {
    if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

autoUpdater.on('update-downloaded', function(info) {
  if (mainWindow) mainWindow.webContents.send('update-downloaded', info.version);
});

ipcMain.on('restart-and-update', function() { autoUpdater.quitAndInstall(); });

// ===== CONFIG =====

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function writeConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write config:', e.message);
  }
}

ipcMain.handle('get-config', () => {
  return readConfig();
});

ipcMain.handle('save-config', (event, config) => {
  if (!config || typeof config !== 'object') {
    return { success: false, error: 'Invalid config' };
  }
  writeConfig(config);
  return { success: true };
});

// ===== OPEN EXTERNAL =====

ipcMain.handle('open-external', (event, url) => {
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    return { success: false, error: 'Only https URLs allowed' };
  }
  shell.openExternal(url);
  return { success: true };
});

// ===== APP LIFECYCLE =====

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
