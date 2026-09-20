'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { resolveCocosCreator, buildArgs } = require('./cocos-cli.cjs');
const { getWebDesktopBuildDir } = require('./web-desktop-build-path.cjs');
const {
  clearWebDesktopBuildDir,
  verifyFreshWebDesktopBuild,
  getBuildResultExitCode,
} = require('./web-desktop-build-result.cjs');

const projectRoot = path.resolve(__dirname, '..');
const resolved = resolveCocosCreator();
if (!resolved.ok) {
  console.error(`${resolved.code}: ${resolved.message}`);
  process.exit(2);
}

const outDir = getWebDesktopBuildDir(projectRoot);
try {
  clearWebDesktopBuildDir(outDir);
} catch (error) {
  console.error(`PROJECT_ERROR: cannot clear Web Desktop output: ${error.message}`);
  process.exit(1);
}
const startedAtMs = Date.now();
const result = spawnSync(resolved.path, buildArgs(projectRoot, 'web-desktop', outDir), { stdio: 'inherit' });
if (result.error) {
  console.error(`PROJECT_ERROR: ${result.error.message}`);
  process.exit(1);
}

const verification = verifyFreshWebDesktopBuild(outDir, startedAtMs);
if (!verification.ok) {
  console.error(`PROJECT_ERROR: incomplete Cocos output (missing=${verification.missing.join(',') || 'none'}; empty=${verification.empty.join(',') || 'none'}; stale=${verification.stale.join(',') || 'none'})`);
  process.exit(getBuildResultExitCode(result.status, verification));
}

if (result.status === 36) {
  console.warn('PROJECT_WARNING: Cocos Creator returned 36 after a verified fresh Web Desktop build; accepting the artifact.');
}
process.exit(getBuildResultExitCode(result.status, verification));
