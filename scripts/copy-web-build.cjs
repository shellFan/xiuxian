#!/usr/bin/env node
'use strict';

// Copy a verified, unique Creator output into the desktop runtime without
// deleting the previous runtime. Every failed verification leaves its source
// and previous packaged output untouched.
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { getWebDesktopBuildDir, listWebDesktopBuildDirs } = require('./web-desktop-build-path.cjs');
const provenance = require('./build-manifest.cjs');

const root = path.resolve(__dirname, '..');
const desktopRoot = path.join(root, 'desktop');
const buildRoot = path.join(desktopRoot, 'build');
// Creator outputs live under <repo>/build/web-desktop-current (see
// web-desktop-build-path.cjs); source candidates are validated against that
// root, while temp/archive/target stay inside the desktop runtime dir.
const cocosBuildRoot = path.join(root, 'build');
const target = path.join(buildRoot, 'web-desktop');

function inside(parent, candidate) {
  const parentPath = path.resolve(parent) + path.sep;
  const candidatePath = path.resolve(candidate);
  if (!candidatePath.startsWith(parentPath)) throw new Error(`unsafe path outside ${parent}: ${candidate}`);
  return candidatePath;
}

function readProvenance(candidate) {
  try { return JSON.parse(fs.readFileSync(path.join(candidate, provenance.PROVENANCE_FILE), 'utf8')); } catch { return null; }
}

function pickSource() {
  const candidates = listWebDesktopBuildDirs(root)
    .concat([getWebDesktopBuildDir(root)])
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .filter((candidate) => fs.existsSync(candidate) && readProvenance(candidate));
  candidates.sort((a, b) => String(readProvenance(b).createdAt).localeCompare(String(readProvenance(a).createdAt)));
  return candidates[0] || null;
}

function gitHead() {
  try { return childProcess.execSync('git rev-parse HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'unknown'; }
}

function archiveCurrent() {
  if (!fs.existsSync(target)) return null;
  const history = inside(buildRoot, path.join(buildRoot, 'history'));
  fs.mkdirSync(history, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  let archived = path.join(history, `web-desktop-${stamp}`);
  let suffix = 1;
  while (fs.existsSync(archived)) archived = path.join(history, `web-desktop-${stamp}-${suffix++}`);
  fs.renameSync(inside(buildRoot, target), inside(history, archived));
  return archived;
}

function main() {
  const source = inside(cocosBuildRoot, process.env.XIUXIAN_COCOS_BUILD_DIR || pickSource() || '');
  if (!source || !fs.existsSync(source)) throw new Error('Run npm run pc:build first: no unique Cocos output found');
  const sourceCheck = provenance.verifyBuildProvenance(source, root);
  if (!sourceCheck.ok) throw new Error(`Cocos build rejected: ${sourceCheck.reason}`);

  const buildId = (readProvenance(source) || {}).buildId || `copy-${Date.now()}`;
  const temp = inside(buildRoot, path.join(buildRoot, `.web-desktop-copy-${buildId}-${process.pid}`));
  if (fs.existsSync(temp)) throw new Error(`refusing to overwrite existing copy target: ${temp}`);
  fs.cpSync(source, temp, { recursive: true, errorOnExist: true });

  const patch = childProcess.spawnSync(process.execPath, [path.join(desktopRoot, 'patch-html.cjs'), temp], { cwd: root, stdio: 'inherit' });
  if (patch.error || patch.status !== 0) throw new Error(`desktop patch failed (${patch.status ?? patch.error.message})`);
  provenance.generateManifest(gitHead(), temp, root);
  const finalCheck = provenance.verifyManifest(root, temp);
  if (finalCheck.stale) throw new Error(`final copied build rejected: ${finalCheck.reason}`);

  const archived = archiveCurrent();
  fs.renameSync(temp, inside(buildRoot, target));
  console.log(`[copy-web-build] source=${source}`);
  console.log(`[copy-web-build] target=${target}`);
  if (archived) console.log(`[copy-web-build] preserved previous output=${archived}`);
  console.log(`[copy-web-build] PASS buildId=${buildId} sourceHash=${sourceCheck.sourceInputsHash.slice(0, 12)} artifactHash=${finalCheck.manifest.artifactHash.slice(0, 12)}`);
}

try { main(); } catch (error) { console.error(`[copy-web-build] FAIL: ${error.message}`); process.exitCode = 1; }
