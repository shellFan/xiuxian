/**
 * 牛马修仙传 PC V1 — Electron Main Process
 *
 * Architecture:
 *   1. Starts a local HTTP server (game-server.cjs) serving the Cocos web-desktop build
 *   2. Creates a BrowserWindow that loads via http://127.0.0.1:PORT/index.html
 *   3. This avoids file:// protocol issues with SystemJS/fetch()
 *
 * Features:
 *   - compact portrait default window, keeping the game card close to the design reference
 *   - F11 fullscreen toggle
 *   - File-based save via storage.cjs
 *   - Lifecycle: focus/blur/minimize/restore/close all trigger save
 *   - Comprehensive diagnostics: console-message, did-fail-load, render-process-gone
 *   - DevTools auto-open in --dev mode
 *   - 15s boot timeout detection
 */

const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { initStorage, saveGame, loadGame, backupSave, recoverSave } = require('./storage.cjs');
const { GameServer } = require('./game-server.cjs');

// ── Constants ──────────────────────────────────────────────────────────────
const GAME_TITLE = '牛马修仙传 - 上班也是渡劫';
// PC-first: 1280×720 is the hard baseline (§216); min size keeps the dashboard usable.
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const MIN_WIDTH = 1150;
const MIN_HEIGHT = 680;
const BG_COLOR = '#dfe9e8';
const AUTO_SAVE_INTERVAL_MS = 60_000;
const BOOT_TIMEOUT_MS = 30_000;

let mainWindow = null;
let autoSaveTimer = null;
let gameServer = null;
let bootTimeoutTimer = null;
let gameReady = false;
const isDev = process.argv.includes('--dev') || process.argv.includes('--debug');

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

// Fullscreen IPC
ipcMain.handle('window:set-fullscreen', (_e, flag) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setFullScreen(!!flag);
});
ipcMain.handle('window:is-fullscreen', () => {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow.isFullScreen();
  return false;
});
ipcMain.handle('window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});
ipcMain.handle('window:maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});
ipcMain.handle('window:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

// ── Game Ready Signal ──────────────────────────────────────────────────────
ipcMain.on('game:ready', () => {
  gameReady = true;
  if (bootTimeoutTimer) {
    clearTimeout(bootTimeoutTimer);
    bootTimeoutTimer = null;
  }
  console.log('[Electron] ✅ GAME_READY received from renderer');
});

// ── Window Creation ────────────────────────────────────────────────────────
async function createWindow() {
  // Start local game server FIRST
  const buildDir = path.join(__dirname, 'build', 'web-desktop');
  if (!require('fs').existsSync(buildDir)) {
    console.error(`[Electron] Build directory not found: ${buildDir}`);
    console.error('[Electron] Run: cd desktop && npm run build:copy');
    app.quit();
    return;
  }

  gameServer = new GameServer(buildDir);
  let baseUrl;
  try {
    baseUrl = await gameServer.start();
  } catch (e) {
    console.error('[Electron] Failed to start game server:', e);
    app.quit();
    return;
  }

  const gameUrl = `${baseUrl}/index.html`;
  console.log(`[Electron] Loading: ${gameUrl}`);

  mainWindow = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: GAME_TITLE,
    backgroundColor: BG_COLOR,
    resizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: false,
    },
    autoHideMenuBar: true,
  });

  // Load via HTTP (NOT file://)
  mainWindow.loadURL(gameUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('[Electron] Window shown');
  });

  // DevTools in dev mode (auto-open until black screen is fixed)
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // ── Diagnostics: did-finish-load ────────────────────────────────────────
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron] HTML loaded successfully');
    // Start boot timeout AFTER HTML loads (Cocos engine still initializing)
    bootTimeoutTimer = setTimeout(() => {
      if (!gameReady) {
        console.error('[Electron] GAME_BOOT_TIMEOUT: No GAME_READY signal after 15s');
      }
    }, BOOT_TIMEOUT_MS);
    // Check game runtime state
    mainWindow.webContents.executeJavaScript(`
      (function() {
        const result = {
          readyState: document.readyState,
          title: document.title,
          href: location.href,
          gameDiv: !!document.getElementById('GameDiv'),
          canvas: !!document.querySelector('canvas'),
          canvasWidth: document.querySelector('canvas') ? document.querySelector('canvas').width : 0,
          canvasHeight: document.querySelector('canvas') ? document.querySelector('canvas').height : 0,
        };
        console.log('[Electron] Page state:', JSON.stringify(result, null, 2));
        return result;
      })()
    `).then((state) => {
      console.log(`[Electron] GAME_DIV=${state.gameDiv} CANVAS=${state.canvas} (${state.canvasWidth}x${state.canvasHeight})`);
    }).catch(() => {});
  });

  // ── Diagnostics: did-fail-load ──────────────────────────────────────────
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] FAILED TO LOAD: ${errorCode} ${errorDescription} URL=${validatedURL}`);
  });

  // ── Diagnostics: console-message ────────────────────────────────────────
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelName = ['VERBOSE', 'INFO', 'WARNING', 'ERROR'][level] || `LEVEL${level}`;
    // Forward BOOT logs, warnings, and errors to main process console
    if (level >= 2 || message.startsWith('[BOOT]') || message.startsWith('[COCOS') || message.startsWith('[PC-PATCH]') || message.includes('GAME_READY')) {
      console.log(`[Renderer:${levelName}] ${message} (${sourceId}:${line})`);
    }
  });

  // ── Diagnostics: render-process-gone ────────────────────────────────────
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Electron] Renderer crashed:', details.reason, details.exitCode);
    showRecoveryDialog('修仙途中遭遇心魔', '游戏运行出现异常，请尝试重新启动。');
  });

  // ── Boot timeout (starts after HTML loads) ────────────────────────────────
  // Note: moved to did-finish-load handler below

  // ── Fullscreen toggle (F11) ────────────────────────────────────────────
  globalShortcut.register('F11', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });

  // ── Lifecycle save ─────────────────────────────────────────────────────
  mainWindow.on('minimize', () => { sendSaveSignal('minimize'); });
  mainWindow.on('blur', () => { sendSaveSignal('blur'); });
  mainWindow.on('close', () => {
    sendSaveSignal('close');
    cleanup();
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  // ── Auto-save ──────────────────────────────────────────────────────────
  autoSaveTimer = setInterval(() => {
    sendSaveSignal('autosave');
  }, AUTO_SAVE_INTERVAL_MS);
}

function sendSaveSignal(reason) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('game:save-requested', { reason, timestamp: Date.now() });
  }
}

function cleanup() {
  if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
  if (bootTimeoutTimer) { clearTimeout(bootTimeoutTimer); bootTimeoutTimer = null; }
  globalShortcut.unregisterAll();
}

function showRecoveryDialog(title, message) {
  try {
    const { dialog } = require('electron');
    dialog.showErrorBox(title, message);
  } catch {
    console.error(`[Electron] ${title}: ${message}`);
  }
}

// ── App Lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  cleanup();
  if (gameServer) { gameServer.stop(); gameServer = null; }
  app.quit();
});

app.on('before-quit', () => {
  sendSaveSignal('before-quit');
  if (gameServer) { gameServer.stop(); gameServer = null; }
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

// ── Process Error Handlers ─────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[Electron:uncaughtException]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Electron:unhandledRejection]', reason);
});
