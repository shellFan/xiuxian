'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { resolveCocosCreator, buildArgs } = require('./cocos-cli.cjs');

const projectRoot = path.resolve(__dirname, '..');
const resolved = resolveCocosCreator();
if (!resolved.ok) {
  console.error(`${resolved.code}: ${resolved.message}`);
  process.exit(2);
}

const outDir = path.join(projectRoot, 'build', 'web-desktop');
const result = spawnSync(resolved.path, buildArgs(projectRoot, 'web-desktop', outDir), { stdio: 'inherit' });
if (result.error) {
  console.error(`PROJECT_ERROR: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
