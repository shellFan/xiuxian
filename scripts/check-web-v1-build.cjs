#!/usr/bin/env node
/**
 * Verifies that the desktop web build contains the custom components used by
 * the current scene. A stale Cocos build otherwise starts a black canvas and
 * silently runs an older scene.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const scenePath = path.join(root, 'assets', 'scenes', 'Main.scene');
const buildPath = path.join(root, 'desktop', 'build', 'web-desktop');
const bundlePath = path.join(buildPath, 'assets', 'main', 'index.js');

function fail(message) {
  console.error(`[web-v1-build] FAIL: ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(scenePath)) fail(`scene missing: ${scenePath}`);
if (!fs.existsSync(bundlePath)) fail(`Cocos web build missing: ${bundlePath}`);
if (process.exitCode) process.exit();

const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
const bundle = fs.readFileSync(bundlePath, 'utf8');
const customTypes = [...new Set(scene
  .filter((object) => typeof object.__type__ === 'string')
  .map((object) => object.__type__)
  .filter((type) => type.length > 20 && !type.startsWith('cc.')))].sort();
const missing = customTypes.filter((type) => !bundle.includes(type));

const sourceMtime = Math.max(
  fs.statSync(scenePath).mtimeMs,
  fs.statSync(path.join(root, 'assets', 'scripts')).mtimeMs,
);
const bundleMtime = fs.statSync(bundlePath).mtimeMs;

if (missing.length) {
  fail(`bundle is missing ${missing.length} scene component registration(s): ${missing.join(', ')}`);
}
if (bundleMtime < sourceMtime) {
  fail(`bundle is older than current source (bundle=${new Date(bundleMtime).toISOString()}, source=${new Date(sourceMtime).toISOString()})`);
}

// ── F08: Deterministic build manifest freshness check ────────────────────
var manifest = require('./build-manifest.cjs');
var manifestResult = manifest.verifyManifest();
if (manifestResult.stale) {
  fail(`build manifest STALE: ${manifestResult.reason} — run npm run pc:build to refresh`);
}
// Direct overlay SHA comparison (source vs build copy)
var overlayFiles = ['ui-overlay.js', 'ui-overlay-v2.js', 'ui-overlay.css'];
for (var of of overlayFiles) {
  var srcPath = path.join(root, 'desktop', of);
  var buildFilePath = path.join(buildPath, of);
  if (fs.existsSync(srcPath) && fs.existsSync(buildFilePath)) {
    var srcHash = require('crypto').createHash('sha256').update(fs.readFileSync(srcPath)).digest('hex');
    var buildHash = require('crypto').createHash('sha256').update(fs.readFileSync(buildFilePath)).digest('hex');
    if (srcHash !== buildHash) {
      fail(`desktop/${of} stale in build (source=${srcHash.slice(0, 12)} build=${buildHash.slice(0, 12)}) — run npm run pc:copy`);
    }
  }
}

if (!process.exitCode) {
  console.log(`[web-v1-build] PASS: ${customTypes.length} scene component registrations present, build manifest FRESH, overlay SHA match`);
}
