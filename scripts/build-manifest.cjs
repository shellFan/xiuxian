/**
 * F08 — Deterministic build manifest.
 * Generates .xiuxian-build-manifest.json in the build output after a successful Cocos build.
 * Used by pc:check to detect stale builds via deterministic input hashing.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'desktop', 'build', 'web-desktop');
const MANIFEST_FILE = '.xiuxian-build-manifest.json';

/** Key input files/directories that affect the build output. */
const INPUT_PATTERNS = [
  'assets/scripts/**/*.ts',
  'assets/configs/**/*.json',
  'assets/scenes/**/*.scene',
  'desktop/ui-overlay.js',
  'desktop/ui-overlay-v2.js',
  'desktop/ui-overlay.css',
  'desktop/patch-html.cjs',
  'desktop/main.cjs',
  'desktop/preload.cjs',
  'desktop/game-server.cjs',
  'desktop/storage.cjs',
  'package.json',
  'tsconfig.game.json',
];

const IGNORE_DIRS = new Set(['node_modules', 'build', 'temp', 'dist', 'library', '.git', 'reports', 'logs']);

function collectFiles(dir, ext, result) {
  if (!fs.existsSync(dir)) return;
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  for (var entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) { collectFiles(full, ext, result); continue; }
    if (ext && !entry.name.endsWith(ext)) continue;
    result.push(full);
  }
}

function hashFile(filePath) {
  var content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function computeInputsHash() {
  var allFiles = [];
  // Scripts (.ts)
  collectFiles(path.join(root, 'assets', 'scripts'), '.ts', allFiles);
  // Configs (.json)
  collectFiles(path.join(root, 'assets', 'configs'), '.json', allFiles);
  // Scenes (.scene)
  collectFiles(path.join(root, 'assets', 'scenes'), '.scene', allFiles);
  // Desktop files — F08: must cover ALL desktop runtime inputs (storage.cjs and
  // game-server.cjs ship inside the packaged EXE and change game behavior)
  var desktopFiles = ['ui-overlay.js', 'ui-overlay-v2.js', 'ui-overlay.css', 'patch-html.cjs', 'main.cjs', 'preload.cjs', 'storage.cjs', 'game-server.cjs'];
  for (var f of desktopFiles) {
    var fp = path.join(root, 'desktop', f);
    if (fs.existsSync(fp)) allFiles.push(fp);
  }
  // Root files
  for (var rf of ['package.json', 'tsconfig.game.json']) {
    var rp = path.join(root, rf);
    if (fs.existsSync(rp)) allFiles.push(rp);
  }

  allFiles.sort();
  var combined = crypto.createHash('sha256');
  for (var file of allFiles) {
    var relative = path.relative(root, file).replace(/\\/g, '/');
    combined.update(relative + ':' + hashFile(file) + '\n');
  }
  return combined.digest('hex');
}

function generateManifest(gitHead) {
  var inputsHash = computeInputsHash();
  var manifest = {
    gitHead: gitHead || 'unknown',
    generatedAt: new Date().toISOString(),
    inputsHash: inputsHash,
  };
  var manifestPath = path.join(buildDir, MANIFEST_FILE);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log('[build-manifest] Generated: ' + manifestPath);
  console.log('[build-manifest] inputsHash: ' + inputsHash);
  return manifest;
}

function verifyManifest() {
  var manifestPath = path.join(buildDir, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    return { stale: true, reason: 'manifest missing — build was created before manifest system' };
  }
  var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  var currentHash = computeInputsHash();
  if (manifest.inputsHash !== currentHash) {
    return { stale: true, reason: 'inputsHash mismatch (build=' + manifest.inputsHash.slice(0, 12) + ' source=' + currentHash.slice(0, 12) + ')' };
  }
  return { stale: false, reason: 'inputsHash match' };
}

module.exports = { computeInputsHash, generateManifest, verifyManifest, buildDir, MANIFEST_FILE };

// CLI: node scripts/build-manifest.cjs [--verify]
if (require.main === module) {
  if (process.argv.includes('--verify')) {
    var result = verifyManifest();
    if (result.stale) {
      console.error('[build-manifest] STALE: ' + result.reason);
      process.exit(1);
    }
    console.log('[build-manifest] FRESH: ' + result.reason);
  } else {
    generateManifest();
  }
}
