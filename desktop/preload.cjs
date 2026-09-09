/**
 * 牛马修仙传 PC V1 — Electron Preload Script
 *
 * Exposes electronAPI to renderer via contextBridge (contextIsolation=true).
 * All IPC is async (invoke/handle pattern).
 */
const { contextBridge, ipcRenderer } = require('electron');

const electronAPI = {
  // ── Storage ────────────────────────────────────────────────────────────
  storage: {
    save: (data) => ipcRenderer.invoke('storage:save', data),
    load: () => ipcRenderer.invoke('storage:load'),
    backup: () => ipcRenderer.invoke('storage:backup'),
    recover: () => ipcRenderer.invoke('storage:recover'),
  },

  // ── App Info ───────────────────────────────────────────────────────────
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPath: (name) => ipcRenderer.invoke('app:getPath', name),
    isElectron: () => ipcRenderer.invoke('app:isElectron'),
  },

  // ── Save Signal Listener ───────────────────────────────────────────────
  onSaveRequested: (callback) => {
    ipcRenderer.on('game:save-requested', (_event, data) => callback(data));
  },
  removeSaveListener: () => {
    ipcRenderer.removeAllListeners('game:save-requested');
  },

  // ── Fullscreen ─────────────────────────────────────────────────────────
  setFullscreen: (flag) => ipcRenderer.invoke('window:set-fullscreen', flag),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),

  // ── Window Control ─────────────────────────────────────────────────────
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
};

// Expose to renderer as window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', electronAPI);