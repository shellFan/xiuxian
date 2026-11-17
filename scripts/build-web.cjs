'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { resolveCocosCreator, buildArgs } = require('./cocos-cli.cjs');
const { getWebDesktopBuildDir } = require('./web-desktop-build-path.cjs');
const {
  verifyFreshWebDesktopBuild,
  getBuildResultExitCode,
} = require('./web-desktop-build-result.cjs');
const { computeSourceInputsHash, writeBuildProvenance } = require('./build-manifest.cjs');

const projectRoot = path.resolve(__dirname, '..');
const resolved = resolveCocosCreator();
if (!resolved.ok) {
  console.error(`${resolved.code}: ${resolved.message}`);
  process.exit(2);
}

const buildId = `build-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${process.pid}`;
const outDir = getWebDesktopBuildDir(projectRoot, buildId);
const sourceHashBefore = computeSourceInputsHash(projectRoot);
require('node:fs').mkdirSync(require('node:path').dirname(outDir), { recursive: true });
const startedAtMs = Date.now();
// CocosCreator.exe is itself Electron-based; if this script runs under
// ELECTRON_RUN_AS_NODE the child must not inherit it, or Creator starts in
// plain-Node mode and rejects --project.
const creatorEnv = { ...process.env };
delete creatorEnv.ELECTRON_RUN_AS_NODE;
const result = spawnSync(resolved.path, buildArgs(projectRoot, 'web-desktop', outDir), { stdio: 'inherit', env: creatorEnv });
if (result.error) {
  console.error(`PROJECT_ERROR: ${result.error.message}`);
  process.exit(1);
}

const verification = verifyFreshWebDesktopBuild(outDir, startedAtMs);
if (!verification.ok) {
  console.error(`PROJECT_ERROR: incomplete Cocos output (missing=${verification.missing.join(',') || 'none'}; empty=${verification.empty.join(',') || 'none'}; stale=${verification.stale.join(',') || 'none'})`);
  process.exit(getBuildResultExitCode(result.status, verification));
}

const sourceHashAfter = computeSourceInputsHash(projectRoot);
if (sourceHashBefore !== sourceHashAfter) {
  console.error(`PROJECT_ERROR: Cocos inputs changed during build (before=${sourceHashBefore.slice(0, 12)} after=${sourceHashAfter.slice(0, 12)}); output preserved but rejected`);
  process.exit(1);
}
writeBuildProvenance(outDir, { buildId, sourceHashBefore, sourceHashAfter });
console.log(`[build-web] preserved unique output: ${outDir}`);

if (result.status === 36) {
  console.warn('PROJECT_WARNING: Cocos Creator returned 36 after a verified fresh Web Desktop build; accepting the artifact.');
}
process.exit(getBuildResultExitCode(result.status, verification));
