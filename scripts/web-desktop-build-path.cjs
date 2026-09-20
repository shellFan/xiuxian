'use strict';

const path = require('node:path');

// `build/web-desktop` is a historical generated directory which can be left
// unreadable by interrupted Cocos processes on Windows. Keep the active output
// below a stable sibling, while preserving Cocos's native web-desktop task
// name; Creator includes that name in its build-cache key.
const WEB_DESKTOP_OUTPUT_PARENT = 'web-desktop-current';
const WEB_DESKTOP_OUTPUT_NAME = 'web-desktop';

function getWebDesktopBuildDir(projectRoot) {
  return path.join(projectRoot, 'build', WEB_DESKTOP_OUTPUT_PARENT, WEB_DESKTOP_OUTPUT_NAME);
}

module.exports = { WEB_DESKTOP_OUTPUT_PARENT, WEB_DESKTOP_OUTPUT_NAME, getWebDesktopBuildDir };
