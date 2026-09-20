'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_WEB_DESKTOP_FILES = Object.freeze([
  'index.html',
  'style.css',
  'index.js',
  'application.js',
  'cocos-js/cc.js',
  'src/import-map.json',
  'src/system.bundle.js',
  'src/polyfills.bundle.js',
  'src/settings.json',
  'src/chunks/bundle.js',
  'src/effect.bin',
  'assets/internal/config.json',
  'assets/internal/index.js',
  'assets/main/config.json',
  'assets/main/index.js',
]);

// Creator preserves source mtimes when copying these static resources. The
// build script clears its isolated output before every invocation, so their
// existence still proves that this build produced the current artifact.
const FRESH_WEB_DESKTOP_FILES = Object.freeze(REQUIRED_WEB_DESKTOP_FILES.filter((relativePath) => ![
  'style.css',
  'cocos-js/cc.js',
  'src/effect.bin',
].includes(relativePath)));

function clearWebDesktopBuildDir(buildDir) {
  fs.rmSync(buildDir, { recursive: true, force: true });
}

function verifyFreshWebDesktopBuild(buildDir, startedAtMs) {
  const missing = [];
  const stale = [];
  const empty = [];
  for (const relativePath of REQUIRED_WEB_DESKTOP_FILES) {
    try {
      const stat = fs.statSync(path.join(buildDir, relativePath));
      if (!stat.isFile()) missing.push(relativePath);
      else if (stat.size === 0) empty.push(relativePath);
      else if (FRESH_WEB_DESKTOP_FILES.includes(relativePath) && stat.mtimeMs < startedAtMs) stale.push(relativePath);
    } catch {
      missing.push(relativePath);
    }
  }
  return { ok: missing.length === 0 && stale.length === 0 && empty.length === 0, missing, stale, empty };
}

function getBuildResultExitCode(status, verification) {
  if (!verification.ok) return status && status !== 0 ? status : 1;
  if (status === 0 || status === 36) return 0;
  return status ?? 1;
}

module.exports = {
  REQUIRED_WEB_DESKTOP_FILES,
  FRESH_WEB_DESKTOP_FILES,
  clearWebDesktopBuildDir,
  verifyFreshWebDesktopBuild,
  getBuildResultExitCode,
};
