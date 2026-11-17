/**
 * Build provenance and deterministic manifest helpers.
 *
 * The Cocos output and the desktop overlay have different lifecycles. A
 * manifest records both hashes separately, while the Cocos build records a
 * source hash captured before and after Creator runs. This prevents a fresh
 * manifest from making an older bundle appear current.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');

const MANIFEST_FILE = '.xiuxian-build-manifest.json';
const PROVENANCE_FILE = '.xiuxian-build-provenance.json';
const ENGINE_INPUTS = Object.freeze([
  ['assets/scripts', '.ts'],
  ['assets/configs', '.json'],
  ['assets/scenes', '.scene'],
  ['package.json', null],
  ['tsconfig.game.json', null],
]);
const OVERLAY_INPUTS = Object.freeze([
  'ui-overlay.js', 'ui-overlay-v2.js', 'ui-v59f-home.js', 'ui-merge-home.js',
  'ui-overlay.css', 'patch-html.cjs', 'main.cjs', 'preload.cjs',
  'storage.cjs', 'game-server.cjs',
]);

function resolveRoot(projectRoot) { return path.resolve(projectRoot || path.join(__dirname, '..')); }
function resolveBuildDir(projectRoot, explicitBuildDir) {
  return path.resolve(explicitBuildDir || path.join(resolveRoot(projectRoot), 'desktop', 'build', 'web-desktop'));
}

function collectFiles(dir, extension, result) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'build', 'temp', 'dist', 'library', '.git', 'reports', 'logs'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, extension, result);
    else if (!extension || entry.name.endsWith(extension)) result.push(full);
  }
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function hashFiles(root, files) {
  const allFiles = [];
  for (const [relative, extension] of files) {
    const candidate = path.join(root, relative);
    if (extension) collectFiles(candidate, extension, allFiles);
    else if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) allFiles.push(candidate);
  }
  allFiles.sort();
  const combined = crypto.createHash('sha256');
  for (const file of allFiles) {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    combined.update(`${relative}:${hashFile(file)}\n`);
  }
  return combined.digest('hex');
}

function computeSourceInputsHash(projectRoot) { return hashFiles(resolveRoot(projectRoot), ENGINE_INPUTS); }

function computeOverlayInputsHash(projectRoot) {
  const root = resolveRoot(projectRoot);
  return hashFiles(root, OVERLAY_INPUTS.map((name) => ['desktop/' + name, null]));
}

function computeInputsHash(projectRoot) {
  const combined = crypto.createHash('sha256');
  combined.update(`source:${computeSourceInputsHash(projectRoot)}\n`);
  combined.update(`overlay:${computeOverlayInputsHash(projectRoot)}\n`);
  return combined.digest('hex');
}

function hashDirectory(directory, excluded = new Set([MANIFEST_FILE, PROVENANCE_FILE])) {
  const root = path.resolve(directory);
  const files = [];
  function walk(current) {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const relative = path.relative(root, full).replace(/\\/g, '/');
      if (entry.isDirectory()) walk(full);
      else if (!excluded.has(relative) && !entry.name.endsWith('.tmp')) files.push(full);
    }
  }
  walk(root);
  files.sort();
  const combined = crypto.createHash('sha256');
  for (const file of files) combined.update(`${path.relative(root, file).replace(/\\/g, '/')}:${hashFile(file)}\n`);
  return combined.digest('hex');
}

function writeBuildProvenance(buildDir, details) {
  const payload = {
    schemaVersion: 2,
    buildId: details.buildId,
    createdAt: new Date().toISOString(),
    sourceInputsHashBefore: details.sourceHashBefore,
    sourceInputsHashAfter: details.sourceHashAfter,
    sourceInputsMatch: details.sourceHashBefore === details.sourceHashAfter,
    artifactHash: hashDirectory(buildDir),
  };
  fs.writeFileSync(path.join(buildDir, PROVENANCE_FILE), JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function verifyBuildProvenance(buildDir, projectRoot) {
  const provenance = readJson(path.join(buildDir, PROVENANCE_FILE));
  if (!provenance) return { ok: false, reason: 'build provenance missing or invalid' };
  if (!provenance.sourceInputsMatch || !provenance.sourceInputsHashBefore || !provenance.sourceInputsHashAfter) {
    return { ok: false, reason: 'Creator source hash changed during build', sourceStale: true };
  }
  const currentSource = computeSourceInputsHash(projectRoot);
  if (currentSource !== provenance.sourceInputsHashAfter) {
    return { ok: false, reason: `Cocos inputs changed after build (build=${provenance.sourceInputsHashAfter.slice(0, 12)} source=${currentSource.slice(0, 12)})`, sourceStale: true };
  }
  const currentArtifact = hashDirectory(buildDir);
  if (currentArtifact !== provenance.artifactHash) {
    return { ok: false, reason: `Cocos output tampered (build=${provenance.artifactHash.slice(0, 12)} actual=${currentArtifact.slice(0, 12)})`, outputTampered: true };
  }
  return { ok: true, provenance, sourceInputsHash: currentSource, artifactHash: currentArtifact };
}

function generateManifest(gitHead, explicitBuildDir, projectRoot) {
  const root = resolveRoot(projectRoot);
  const buildDir = resolveBuildDir(root, explicitBuildDir);
  const sourceInputsHash = computeSourceInputsHash(root);
  const overlayInputsHash = computeOverlayInputsHash(root);
  const provenance = readJson(path.join(buildDir, PROVENANCE_FILE));
  const manifest = {
    schemaVersion: 2,
    gitHead: gitHead || 'unknown',
    generatedAt: new Date().toISOString(),
    buildId: provenance && provenance.buildId || 'unknown',
    sourceInputsHash,
    overlayInputsHash,
    inputsHash: computeInputsHash(root),
    artifactHash: hashDirectory(buildDir),
    sourceBuildArtifactHash: provenance && provenance.artifactHash || null,
    sourceInputsMatch: !!(provenance && provenance.sourceInputsHashBefore === provenance.sourceInputsHashAfter && provenance.sourceInputsHashAfter === sourceInputsHash),
  };
  fs.writeFileSync(path.join(buildDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n');
  console.log('[build-manifest] Generated: ' + path.join(buildDir, MANIFEST_FILE));
  console.log('[build-manifest] sourceInputsHash: ' + sourceInputsHash);
  console.log('[build-manifest] overlayInputsHash: ' + overlayInputsHash);
  return manifest;
}

function verifyManifest(projectRoot, explicitBuildDir) {
  const root = resolveRoot(projectRoot);
  const buildDir = resolveBuildDir(root, explicitBuildDir);
  const manifest = readJson(path.join(buildDir, MANIFEST_FILE));
  if (!manifest) return { stale: true, reason: 'manifest missing or invalid' };
  if (manifest.sourceInputsHash !== computeSourceInputsHash(root)) return { stale: true, reason: 'Cocos source inputsHash mismatch — rebuild with npm run pc:build' };
  if (manifest.overlayInputsHash !== computeOverlayInputsHash(root)) return { stale: true, reason: 'desktop overlay inputsHash mismatch — run npm run pc:copy to apply the deliberate UI patch' };
  if (manifest.artifactHash !== hashDirectory(buildDir)) return { stale: true, reason: 'final output hash mismatch — output was changed after manifest creation' };
  if (manifest.sourceInputsMatch !== true) return { stale: true, reason: 'manifest is not bound to a matching before/after Creator source snapshot' };
  return { stale: false, reason: 'source, overlay, and output hashes match', manifest };
}

const buildDir = resolveBuildDir();
module.exports = {
  MANIFEST_FILE,
  PROVENANCE_FILE,
  computeSourceInputsHash,
  computeOverlayInputsHash,
  computeInputsHash,
  hashDirectory,
  writeBuildProvenance,
  verifyBuildProvenance,
  generateManifest,
  verifyManifest,
  buildDir,
};

if (require.main === module) {
  const root = resolveRoot();
  const explicitBuildDir = process.env.XIUXIAN_BUILD_DIR || undefined;
  if (process.argv.includes('--verify')) {
    const result = verifyManifest(root, explicitBuildDir);
    if (result.stale) { console.error('[build-manifest] STALE: ' + result.reason); process.exit(1); }
    console.log('[build-manifest] FRESH: ' + result.reason);
  } else {
    let gitHead = 'unknown';
    try { gitHead = childProcess.execSync('git rev-parse HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'unknown'; } catch { /* keep unknown */ }
    generateManifest(gitHead, explicitBuildDir, root);
  }
}
