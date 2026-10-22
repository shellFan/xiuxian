'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { computeInputsHash } = require('./build-manifest.cjs');
const { getWebDesktopBuildDir } = require('./web-desktop-build-path.cjs');

const MANIFEST_NAME = '.xiuxian-cocos-build-manifest.json';
const root = path.resolve(__dirname, '..');

function generateCocosBuildManifest(buildDir, options) {
  const opts = options || {};
  const manifest = {
    schemaVersion: 1,
    gitHead: opts.gitHead || 'unknown',
    sourceInputsHash: opts.sourceInputsHash || computeInputsHash(),
    startedAt: new Date(opts.startedAtMs || Date.now()).toISOString(),
    completedAt: new Date(opts.completedAtMs || Date.now()).toISOString(),
    creatorVersion: opts.creatorVersion || 'unknown',
  };
  fs.writeFileSync(path.join(buildDir, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function verifyCocosBuildManifest(buildDir, currentSourceInputsHash) {
  const manifestPath = path.join(buildDir, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) return { ok: false, reason: 'Cocos build manifest missing; run npm run pc:build' };
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch (error) { return { ok: false, reason: `Cocos build manifest invalid: ${error.message}` }; }
  if (manifest.schemaVersion !== 1 || !manifest.completedAt || !manifest.sourceInputsHash) {
    return { ok: false, reason: 'Cocos build manifest incomplete; run npm run pc:build' };
  }
  if (manifest.sourceInputsHash !== currentSourceInputsHash) {
    return {
      ok: false,
      reason: `sourceInputsHash mismatch (build=${String(manifest.sourceInputsHash).slice(0, 12)} source=${String(currentSourceInputsHash).slice(0, 12)})`,
    };
  }
  const startedAt = Date.parse(manifest.startedAt);
  const completedAt = Date.parse(manifest.completedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
    return { ok: false, reason: 'Cocos build manifest has invalid build timestamps' };
  }
  return { ok: true, reason: 'Cocos build source hash matches current project inputs', manifest };
}

function verifyCurrentCocosBuild(buildDir) {
  return verifyCocosBuildManifest(buildDir || getWebDesktopBuildDir(root), computeInputsHash());
}

module.exports = { MANIFEST_NAME, generateCocosBuildManifest, verifyCocosBuildManifest, verifyCurrentCocosBuild };

if (require.main === module) {
  const mode = process.argv[2];
  const buildDir = process.argv[3] || getWebDesktopBuildDir(root);
  if (mode !== '--verify') {
    console.error('Usage: node scripts/cocos-build-manifest.cjs --verify [build-dir]');
    process.exit(2);
  }
  const result = verifyCurrentCocosBuild(buildDir);
  if (!result.ok) {
    console.error(`[cocos-build-manifest] STALE: ${result.reason}`);
    process.exit(1);
  }
  console.log(`[cocos-build-manifest] FRESH: ${result.reason}; completed=${result.manifest.completedAt}; Creator=${result.manifest.creatorVersion}`);
}
