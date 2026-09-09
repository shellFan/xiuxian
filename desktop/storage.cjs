/**
 * 牛马修仙传 PC V1 — File Storage Adapter
 *
 * Atomic file-based save system for Electron.
 * Uses temp→validate→replace→backup pattern.
 * Data directory: app.getPath('userData')/xiuxian-save/
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── State ──────────────────────────────────────────────────────────────────
let dataDir = '';
let savePath = '';
let backupPath = '';
let tempPath = '';

// ── Init ───────────────────────────────────────────────────────────────────
function initStorage(userDataPath) {
  dataDir = path.join(userDataPath, 'xiuxian-save');
  savePath = path.join(dataDir, 'save.json');
  backupPath = path.join(dataDir, 'save.backup.json');
  tempPath = path.join(dataDir, 'save.tmp.json');

  // Ensure directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Migrate from old location if exists
  const oldPath = path.join(userDataPath, 'save.json');
  if (fs.existsSync(oldPath) && !fs.existsSync(savePath)) {
    try {
      fs.renameSync(oldPath, savePath);
    } catch (e) {
      // Ignore migration errors
    }
  }

  console.log(`[storage] Data directory: ${dataDir}`);
}

// ── Save (Atomic Write) ────────────────────────────────────────────────────
function saveGame(data) {
  if (!dataDir) throw new Error('Storage not initialized');

  const json = JSON.stringify(data, null, 2);

  // Step 1: Write to temp file
  fs.writeFileSync(tempPath, json, 'utf-8');

  // Step 2: Validate temp file (checksum)
  const written = fs.readFileSync(tempPath, 'utf-8');
  const writeHash = md5(json);
  const readHash = md5(written);
  if (writeHash !== readHash) {
    // Validation failed — delete temp, throw
    try { fs.unlinkSync(tempPath); } catch (_) { /* ignore */ }
    throw new Error('Save validation failed: checksum mismatch');
  }

  // Step 3: Backup existing save
  if (fs.existsSync(savePath)) {
    try {
      fs.copyFileSync(savePath, backupPath);
    } catch (e) {
      console.warn('[storage] Failed to create backup:', e.message);
    }
  }

  // Step 4: Atomic replace (rename is atomic on most OS)
  fs.renameSync(tempPath, savePath);

  console.log(`[storage] Save successful (${(json.length / 1024).toFixed(1)}KB)`);
  return true;
}

// ── Load ───────────────────────────────────────────────────────────────────
function loadGame() {
  if (!dataDir) throw new Error('Storage not initialized');

  // Try primary save first
  if (fs.existsSync(savePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(savePath, 'utf-8'));
      console.log('[storage] Loaded save successfully');
      return data;
    } catch (e) {
      console.error('[storage] Primary save corrupted, trying backup:', e.message);
    }
  }

  // Try backup
  if (fs.existsSync(backupPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
      console.log('[storage] Loaded from backup');
      // Restore backup as primary
      fs.copyFileSync(backupPath, savePath);
      return data;
    } catch (e) {
      console.error('[storage] Backup also corrupted:', e.message);
    }
  }

  // No save found
  console.log('[storage] No save found, returning null');
  return null;
}

// ── Backup ─────────────────────────────────────────────────────────────────
function backupSave() {
  if (!dataDir) throw new Error('Storage not initialized');
  if (!fs.existsSync(savePath)) return false;
  fs.copyFileSync(savePath, backupPath);
  console.log('[storage] Backup created');
  return true;
}

// ── Recover ────────────────────────────────────────────────────────────────
function recoverSave() {
  if (!dataDir) throw new Error('Storage not initialized');
  if (!fs.existsSync(backupPath)) {
    throw new Error('No backup available for recovery');
  }
  const data = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
  fs.copyFileSync(backupPath, savePath);
  console.log('[storage] Recovered from backup');
  return data;
}

// ── Utility ────────────────────────────────────────────────────────────────
function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

// ── Exports ────────────────────────────────────────────────────────────────
module.exports = {
  initStorage,
  saveGame,
  loadGame,
  backupSave,
  recoverSave,
};