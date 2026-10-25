#!/usr/bin/env node
/**
 * Clone-to-green guard (V5.9-N.11+): `npm test` depends on the desktop
 * Electron toolchain (tests/v4/desktop-overlay-dom.test.js requires
 * desktop/node_modules/electron), which lives in desktop/package.json and is
 * NOT installed by a root-level `npm install`.
 *
 * This pretest step installs desktop devDependencies once, then becomes a
 * no-op check (~0ms) on every later run.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const desktopDir = path.resolve(__dirname, '..', 'desktop');
const electronMarker = path.join(desktopDir, 'node_modules', 'electron', 'package.json');

if (fs.existsSync(electronMarker)) {
  process.exit(0);
}

if (!fs.existsSync(path.join(desktopDir, 'package.json'))) {
  console.error('[pretest] desktop/package.json missing — cannot install desktop deps');
  process.exit(1);
}

console.log('[pretest] desktop dependencies missing — running npm install in desktop/ (one-time)...');
const result = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
  cwd: desktopDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.status !== 0) {
  console.error('[pretest] desktop npm install failed — tests requiring electron will fail.');
  console.error('[pretest] Fix manually: cd desktop && npm install');
  process.exit(result.status ?? 1);
}
if (!fs.existsSync(electronMarker)) {
  console.error('[pretest] install finished but electron still missing — check desktop/package.json');
  process.exit(1);
}
console.log('[pretest] desktop dependencies ready.');
