/**
 * 牛马修仙传 PC V1 — Electron Main Process
 *
 * Features:
 *  - 1440×810 default window, 1024×720 minimum
 *  - F11 fullscreen toggle
 *  - File-based save via storage.cjs
 *  - Lifecycle: focus/blur/minimize/restore/close all trigger save
 *  - Custom protocol for Cocos asset loading
 *  - Error boundary: shows recovery dialog on renderer crash
 */
const { app, BrowserWindow, protocol, net, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { initStorage, saveGame, loadGame, backupSave, recoverSave } = require('./storage.cjs');

// ── Constants ──────────────────────────────────────────────────────────────
const GAME_TITLE = '牛马修仙传 - 上班也是渡劫';
const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 810;
const MIN_WIDTH = 1024;
const MIN_HEIGHT = 720;
const BG_COLOR = '#dfe9e8'; // 淡青蓝背景
const AUTO_SAVE_INTERVAL_MS = 60_000; // 60秒自动保存

let mainWindow = null;
let autoSaveTimer = null;

// ── Storage Init ───────────────────────────────────────────────────────────
initStorage(app.getPath('userData'));

// ── IPC Handlers ───────────────────────────────────────────────────────────
ipcMain.handle('storage:save', async (_event, data) => {
  try { saveGame(data); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('storage:load', async () => {
  try { return { success: true, data: loadGame() }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('storage:backup', async () => {
  try { backupSave(); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('storage:recover', async () => {
  try { const data = recoverSave(); return { success: true, data }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPath', (_e, name) => app.getPath(name));
ipcMain.handle('app:isElectron', () => true);

// ── Window Creation ────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: GAME_TITLE,
    backgroundColor: BG_COLOR,
    resizable: true,
    show: false, // Show when ready to avoid flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: false, // Needed for preload IPC
    },
    autoHideMenuBar: true,
  });

  // Load Cocos Web Desktop Build
  const indexPath = path.join(__dirname, 'build', 'web-desktop', 'index.html');
  mainWindow.loadFile(indexPath);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // DevTools in dev mode
  if (process.argv.includes('--dev') || process.argv.includes('--debug')) {
    mainWindow.webContents.openDevTools();
  }

  // ── Fullscreen toggle (F11) ────────────────────────────────────────────
  globalShortcut.register('F11', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });

  // ── Lifecycle save ─────────────────────────────────────────────────────
  mainWindow.on('minimize', () => { sendSaveSignal('minimize'); });
  mainWindow.on('restore', () => { /* task continues via deadline timestamp */ });
  mainWindow.on('blur', () => { sendSaveSignal('blur'); });
  mainWindow.on('focus', () => { /* resume */ });
  mainWindow.on('close', () => {
    sendSaveSignal('close');
    if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
    globalShortcut.unregisterAll();
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  // ── Auto-save ──────────────────────────────────────────────────────────
  autoSaveTimer = setInterval(() => {
    sendSaveSignal('autosave');
  }, AUTO_SAVE_INTERVAL_MS);

  // ── Error handling ─────────────────────────────────────────────────────
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer crashed:', details);
    showRecoveryDialog();
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('Renderer unresponsive');
  });
}

function sendSaveSignal(reason) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('game:save-requested', { reason, timestamp: Date.now() });
  }
}

function showRecoveryDialog() {
  const { dialog } = require('electron');
  dialog.showErrorBox(
    '修仙途中遭遇心魔',
    '游戏运行出现异常，请尝试重新加载或恢复存档。'
  );
}

// ── App Lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Register custom protocol for local file access
  protocol.handle('local', (request) => {
    const filePath = path.join(__dirname, 'build', 'web-desktop', new URL(request.url).pathname);
    return net.fetch(`file://${filePath}`);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
  globalShortcut.unregisterAll();
  app.quit();
});

app.on('before-quit', () => {
  sendSaveSignal('before-quit');
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// ── Single Instance Lock ──────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}