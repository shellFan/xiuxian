'use strict';

const path = require('node:path');

function isIsolatedGameplayAgentRun({ argv = [], userDataDir, tempDir }) {
  if (!Array.isArray(argv)
    || !argv.some((arg) => /^--remote-debugging-port=\d+$/.test(arg))
    || !argv.some((arg) => /^--gameplay-agent-test=\d{1,10}$/.test(arg))) return false;
  if (typeof userDataDir !== 'string' || typeof tempDir !== 'string') return false;
  const normalizedTemp = path.resolve(tempDir).toLowerCase();
  const normalizedUserData = path.resolve(userDataDir).toLowerCase();
  return path.dirname(normalizedUserData) === normalizedTemp
    && path.basename(normalizedUserData).startsWith('xiuxian-gameplay-agent-');
}

function registerGameplayAgentCaptureHandler({ ipcMain, getWindow, enabled }) {
  if (!enabled) return false;
  ipcMain.handle('gameplay-agent:capture-page', async (event) => {
    const window = getWindow();
    if (!window || window.isDestroyed()) throw new Error('Gameplay capture is unavailable');
    const contents = window.webContents;
    if (event.sender !== contents || event.senderFrame !== contents.mainFrame) {
      throw new Error('Gameplay capture request is unauthorized');
    }
    const image = await contents.capturePage();
    return image.toPNG().toString('base64');
  });
  return true;
}

module.exports = { isIsolatedGameplayAgentRun, registerGameplayAgentCaptureHandler };
