'use strict';

/**
 * cocos-cli.cjs — Resolve Cocos Creator CLI path and build arguments.
 *
 * Supports Cocos Creator 3.x installed at:
 *   C:\ProgramData\Cocos\editors\Creator\<version>\CocosCreator.exe
 *
 * Usage (from build-web.cjs):
 *   const { resolveCocosCreator, buildArgs } = require('./cocos-cli.cjs');
 *   const resolved = resolveCocosCreator();
 *   if (!resolved.ok) { ... }
 *   const args = buildArgs(projectRoot, 'web-desktop', outDir);
 */

const path = require('path');
const fs = require('fs');

// Keep the path spelling aligned with Creator's engine-cache metadata on Windows.
// Creator includes the engine entry path in its cache key, so changing only the
// letter casing can make an otherwise valid cache look missing.
const COCOS_ROOT = 'C:\\ProgramData\\cocos\\editors\\Creator';

function findLatestVersion() {
  if (!fs.existsSync(COCOS_ROOT)) return null;
  const versions = fs.readdirSync(COCOS_ROOT)
    .filter(v => /^\d+\.\d+\.\d+$/.test(v))
    .sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pb[i] - pa[i];
      }
      return 0;
    });
  return versions.length > 0 ? versions[0] : null;
}

function resolveCocosCreator() {
  // 1. Check COCOS_CREATOR env var
  const envPath = process.env.COCOS_CREATOR;
  if (envPath && fs.existsSync(envPath)) {
    return { ok: true, path: envPath, version: 'env' };
  }

  // 2. Find latest installed version
  const version = findLatestVersion();
  if (!version) {
    return {
      ok: false,
      code: 'COCOS_NOT_FOUND',
      message: 'Cocos Creator not found. Set COCOS_CREATOR env var or install to ' + COCOS_ROOT,
    };
  }

  const exePath = path.join(COCOS_ROOT, version, 'CocosCreator.exe');
  if (!fs.existsSync(exePath)) {
    return {
      ok: false,
      code: 'COCOS_EXE_MISSING',
      message: `CocosCreator.exe not found at ${exePath}`,
    };
  }

  return { ok: true, path: exePath, version };
}

function buildArgs(projectRoot, platform, outDir) {
  // Cocos Creator 3.x CLI build syntax:
  //   CocosCreator.exe --project <path> --build "platform=web-desktop;buildPath=<path>;debug=false"
  const buildConfig = [
    `platform=${platform}`,
    // Cocos treats buildPath as the parent directory and outputName as the
    // actual platform output directory. Keep the generated artifact at the
    // path consumed by desktop/build:copy.
    `buildPath=${path.dirname(outDir)}`,
    `outputName=${path.basename(outDir)}`,
    'debug=false',
  ].join(';');

  return [
    '--project', projectRoot,
    '--build', buildConfig,
  ];
}

module.exports = { resolveCocosCreator, buildArgs };
