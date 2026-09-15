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

if (!process.exitCode) {
  console.log(`[web-v1-build] PASS: ${customTypes.length} scene component registrations are present and build is current`);
}
