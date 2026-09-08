// Preload script for 牛马修仙传 PC V1
// Provides secure bridge between Electron and game
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  version: process.versions.electron,
});

// localStorage persistence is handled by Electron's Chromium automatically
// No additional code needed for save/load functionality