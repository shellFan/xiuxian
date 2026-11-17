#!/usr/bin/env node
'use strict';

/**
 * V10 final packaging: electron dist copy + asar app pack.
 *
 * Electron-packager's zip-extraction path is unreliable in this environment
 * (no system Node; the local dist is already on disk). This script performs
 * the equivalent steps explicitly:
 *   1. stage <repo>/dist/<name>-win32-x64 from desktop/node_modules/electron/dist
 *   2. pack the desktop app dir (main.cjs, overlays, web-desktop build) into resources/app.asar
 *   3. verify the asar contains the fresh bundle markers
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Running under Electron (this environment's only Node), fs.cpSync would let
// Electron's asar virtual filesystem intercept every *.asar file and corrupt
// the copy. Disable it for the whole packaging run.
process.noAsar = true;

const repoRoot = path.resolve(__dirname, '..');
const desktopRoot = path.join(repoRoot, 'desktop');
const electronDist = path.join(desktopRoot, 'node_modules', 'electron', 'dist');
const asarBin = path.join(desktopRoot, 'node_modules', '@electron', 'asar', 'bin', 'asar.js');
const outDir = path.join(repoRoot, 'dist', process.argv[2] || '牛马修仙传-win32-x64');
const appDir = path.join(desktopRoot, 'app-pack');
const resourcesDir = path.join(outDir, 'resources');
const asarFile = path.join(resourcesDir, 'app.asar');

const APP_FILES = [
  'main.cjs', 'preload.cjs', 'ai-bridge.cjs', 'storage.cjs', 'game-server.cjs',
  'patch-html.cjs', 'package.json',
  'ui-overlay.js', 'ui-overlay-v2.js', 'ui-overlay.css', 'ui-battle-card.js',
  'ui-auto-battle.js', 'ui-game-feel.js', 'ui-merge-home.js', 'ui-v59f-home.js',
  'ui-v66-sprite.js',
];

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

function main() {
  if (!fs.existsSync(electronDist)) throw new Error('electron dist missing: ' + electronDist);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(resourcesDir, { recursive: true });
  console.log('[pack] staging electron runtime ...');
  copyDir(electronDist, outDir);
  for (const extra of ['chrome_100_percent.pak', 'chrome_200_percent.pak', 'LICENSE', 'LICENSES.chromium.html']) {
    const src = path.join(electronDist, extra);
    if (fs.existsSync(src) && !fs.existsSync(path.join(outDir, extra))) fs.copyFileSync(src, path.join(outDir, extra));
  }
  console.log('[pack] staging app dir ...');
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.mkdirSync(appDir, { recursive: true });
  for (const rel of APP_FILES) {
    const src = path.join(desktopRoot, rel);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(appDir, rel));
    else console.warn('[pack] missing app file (skipped): ' + rel);
  }
  for (const rel of ['build/web-desktop', 'assets/sprites', 'assets/icon.ico', 'ui-icons']) {
    const src = path.join(desktopRoot, rel);
    if (!fs.existsSync(src)) { console.warn('[pack] missing app dir (skipped): ' + rel); continue; }
    copyDir(src, path.join(appDir, rel));
  }
  console.log('[pack] writing asar ...');
  const pack = spawnSync(process.execPath, [asarBin, 'pack', appDir, asarFile], { encoding: 'utf8' });
  if (pack.status !== 0) throw new Error('asar pack failed: ' + (pack.stderr || pack.stdout));
  console.log('[pack] verifying asar markers ...');
  const raw = fs.readFileSync(asarFile);
  const markers = ['computeSetBonus', 'comboCount', 'XIUXIAN_USER_DATA', 'attachMemoryStore'];
  const text = raw.toString('latin1');
  for (const marker of markers) {
    if (!text.includes(marker)) throw new Error('asar missing marker: ' + marker);
    console.log('[pack] marker ok: ' + marker);
  }
  fs.rmSync(appDir, { recursive: true, force: true });
  // Rename the runtime binary to the product name and stamp version metadata/icon.
  const exeSrc = path.join(outDir, 'electron.exe');
  const exeName = '牛马修仙传.exe';
  const exeDst = path.join(outDir, exeName);
  fs.renameSync(exeSrc, exeDst);
  const rcedit = path.join(desktopRoot, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
  const icon = path.join(desktopRoot, 'assets', 'icon.ico');
  if (fs.existsSync(rcedit) && fs.existsSync(icon)) {
    const edit = spawnSync(rcedit, [exeDst, '--set-icon', icon,
      '--set-version-string', 'ProductName', '牛马修仙传',
      '--set-version-string', 'FileDescription', '牛马修仙传 V10.0',
      '--set-version-string', 'OriginalFilename', exeName], { encoding: 'utf8' });
    if (edit.status !== 0) console.warn('[pack] rcedit failed (icon/version skipped): ' + (edit.stderr || edit.stdout || '').slice(0, 200));
    else console.log('[pack] icon+version stamped');
  } else {
    console.warn('[pack] rcedit or icon missing; shipping with stock electron icon');
  }
  const sizeMB = (fs.statSync(asarFile).size / 1048576).toFixed(1);
  console.log('[pack] DONE: ' + asarFile + ' (' + sizeMB + ' MB) exe=' + exeDst);
}

try { main(); } catch (error) { console.error('[pack] FAIL: ' + error.message); process.exitCode = 1; }
