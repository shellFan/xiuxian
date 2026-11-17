'use strict';

const path = require('node:path');

// `build/web-desktop` is a historical generated directory which can be left
// unreadable by interrupted Cocos processes on Windows. Keep the active output
// below a stable sibling, while preserving Cocos's native web-desktop task
// name; Creator includes that name in its build-cache key.
const WEB_DESKTOP_OUTPUT_PARENT = 'web-desktop-current';
const WEB_DESKTOP_OUTPUT_NAME = 'web-desktop';

function getWebDesktopBuildDir(projectRoot, buildId) {
  const parent = path.join(projectRoot, 'build', WEB_DESKTOP_OUTPUT_PARENT);
  return buildId ? path.join(parent, buildId, WEB_DESKTOP_OUTPUT_NAME) : path.join(parent, WEB_DESKTOP_OUTPUT_NAME);
}

function listWebDesktopBuildDirs(projectRoot) {
  const parent = path.join(projectRoot, 'build', WEB_DESKTOP_OUTPUT_PARENT);
  if (!require('node:fs').existsSync(parent)) return [];
  return require('node:fs').readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== WEB_DESKTOP_OUTPUT_NAME)
    .map((entry) => path.join(parent, entry.name, WEB_DESKTOP_OUTPUT_NAME))
    .filter((candidate) => require('node:fs').existsSync(candidate));
}

module.exports = { WEB_DESKTOP_OUTPUT_PARENT, WEB_DESKTOP_OUTPUT_NAME, getWebDesktopBuildDir, listWebDesktopBuildDirs };
