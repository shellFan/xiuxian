const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
const GAME_TITLE = '牛马修仙传 - PC V1';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    minWidth: 960,
    minHeight: 540,
    title: GAME_TITLE,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    icon: path.join(__dirname, 'build', 'web-desktop', 'favicon.ico'),
    autoHideMenuBar: true,
  });

  // Load the Cocos Web Desktop build
  const indexPath = path.join(__dirname, 'build', 'web-desktop', 'index.html');
  mainWindow.loadFile(indexPath);

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register protocol for local file loading
app.whenReady().then(() => {
  protocol.handle('local', (request) => {
    const filePath = path.join(__dirname, 'build', 'web-desktop', new URL(request.url).pathname);
    return net.fetch(`file://${filePath}`);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});