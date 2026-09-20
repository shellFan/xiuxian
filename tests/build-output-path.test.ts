import assert from 'node:assert/strict';
import path from 'node:path';

const pathModule = require(path.resolve(__dirname, '../../..', 'scripts', 'web-desktop-build-path.cjs')) as {
  readonly WEB_DESKTOP_OUTPUT_NAME: string;
  getWebDesktopBuildDir(projectRoot: string): string;
};

const projectRoot = path.resolve(__dirname, '../../..');
const outputDir = pathModule.getWebDesktopBuildDir(projectRoot);

assert.equal(pathModule.WEB_DESKTOP_OUTPUT_NAME, 'web-desktop');
assert.equal(outputDir, path.join(projectRoot, 'build', 'web-desktop-current', pathModule.WEB_DESKTOP_OUTPUT_NAME));
assert.notEqual(outputDir, path.join(projectRoot, 'build', 'web-desktop'));

console.log('web desktop build output path tests passed');
