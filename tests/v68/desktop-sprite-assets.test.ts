import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * V6.8 P0 regression guard: desktop/assets/sprites/sheets/*.png are the ONLY
 * runtime source for the V6.6 2D sprites (ui-v66-sprite.js resolves them as
 * "assets/sprites/sheets/<name>.png" relative to index.html). The Cocos
 * web-desktop build contains only assets/internal + assets/main, so if
 * patch-html.cjs ever stops copying them, every character/animation/scene
 * image silently 404s in the packaged EXE while the source tree still looks
 * perfectly fine.
 *
 * This test actually executes patch-html.cjs against a throwaway build dir and
 * verifies the bytes land there -- it does not just grep the script text.
 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'assets', 'scenes', 'Main.scene'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('repo root not found from ' + start);
}

const root = findRepoRoot(__dirname);
const sourceDir = path.join(root, 'desktop', 'assets', 'sprites', 'sheets');
const patchHtml = path.join(root, 'desktop', 'patch-html.cjs');
const spriteRuntime = fs.readFileSync(path.join(root, 'desktop', 'ui-v66-sprite.js'), 'utf8');

// The runtime lookup must stay aligned with the directory patch-html ships.
assert.match(spriteRuntime, /var SPRITE_BASE = 'assets\/sprites\/sheets\/'/);

const sourceSheets = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.png')).sort();
assert.ok(sourceSheets.length >= 60, 'sprite sheet library must not be empty, got ' + sourceSheets.length);
for (const required of ['scene_office.png', 'scene_mountain.png', 'javabackend_idle.png', 'bug_idle.png', 'kpiLord_idle.png']) {
  assert.ok(sourceSheets.includes(required), 'missing required sheet: ' + required);
}

const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-v68-sprite-wiring-'));
try {
  fs.writeFileSync(
    path.join(buildDir, 'index.html'),
    '<!DOCTYPE html><html><head><title>placeholder</title></head><body><div id="GameDiv"></div></body></html>',
  );
  fs.writeFileSync(path.join(buildDir, 'style.css'), 'body{} #GameDiv{}');

  const run = spawnSync(process.execPath, [patchHtml, buildDir], { encoding: 'utf8' });
  assert.equal(run.status, 0, 'patch-html.cjs failed: ' + run.stderr);
  assert.ok(
    run.stdout.includes(`Copied sprite sheets (${sourceSheets.length} files)`),
    'patch-html.cjs did not report copying the sprite sheets: ' + run.stdout,
  );

  const destDir = path.join(buildDir, 'assets', 'sprites', 'sheets');
  assert.ok(fs.existsSync(destDir), 'sheet destination directory was not created');
  const shipped = fs.readdirSync(destDir).filter((f) => f.endsWith('.png')).sort();
  assert.deepEqual(shipped, sourceSheets, 'shipped sheets differ from the source library');

  // Byte-for-byte check catches a truncated/corrupted copy that a name check misses.
  for (const name of ['bug_idle.png', 'javabackend_idle.png', 'scene_office.png']) {
    assert.deepEqual(
      fs.readFileSync(path.join(destDir, name)),
      fs.readFileSync(path.join(sourceDir, name)),
      'sheet bytes differ: ' + name,
    );
  }

  // The sprite runtime itself must still be injected into the built HTML.
  const html = fs.readFileSync(path.join(buildDir, 'index.html'), 'utf8');
  assert.match(html, /ui-v66-sprite\.js/);
} finally {
  fs.rmSync(buildDir, { recursive: true, force: true });
}

console.log('v68 desktop sprite asset wiring tests passed');
