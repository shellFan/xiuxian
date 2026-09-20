import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const helper = require(path.resolve(__dirname, '../../..', 'scripts', 'web-desktop-build-result.cjs')) as {
  readonly REQUIRED_WEB_DESKTOP_FILES: readonly string[];
  readonly FRESH_WEB_DESKTOP_FILES: readonly string[];
  clearWebDesktopBuildDir(buildDir: string): void;
  verifyFreshWebDesktopBuild(buildDir: string, startedAtMs: number): { ok: boolean; missing: string[]; stale: string[]; empty: string[] };
  getBuildResultExitCode(status: number | null, verification: { ok: boolean }): number;
};

assert.ok(helper.REQUIRED_WEB_DESKTOP_FILES.includes('style.css'));
assert.ok(helper.REQUIRED_WEB_DESKTOP_FILES.includes('cocos-js/cc.js'));
assert.ok(helper.REQUIRED_WEB_DESKTOP_FILES.includes('src/settings.json'));
assert.ok(helper.REQUIRED_WEB_DESKTOP_FILES.includes('src/chunks/bundle.js'));
assert.ok(helper.REQUIRED_WEB_DESKTOP_FILES.includes('assets/main/config.json'));
assert.equal(helper.getBuildResultExitCode(0, { ok: false }), 1);
assert.equal(helper.getBuildResultExitCode(36, { ok: true }), 0);
assert.equal(helper.getBuildResultExitCode(1, { ok: true }), 1);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-web-desktop-build-'));
try {
  fs.writeFileSync(path.join(root, 'stale-artifact.txt'), 'old');
  helper.clearWebDesktopBuildDir(root);
  assert.equal(fs.existsSync(root), false);

  const startedAtMs = Date.now();
  for (const relative of helper.REQUIRED_WEB_DESKTOP_FILES) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, relative);
    fs.utimesSync(file, new Date(startedAtMs + 1_000), new Date(startedAtMs + 1_000));
  }

  assert.deepEqual(helper.verifyFreshWebDesktopBuild(root, startedAtMs), { ok: true, missing: [], stale: [], empty: [] });

  const preservedTemplate = helper.REQUIRED_WEB_DESKTOP_FILES.find((file) => !helper.FRESH_WEB_DESKTOP_FILES.includes(file))!;
  fs.utimesSync(path.join(root, preservedTemplate), new Date(startedAtMs - 2_000), new Date(startedAtMs - 2_000));
  assert.deepEqual(helper.verifyFreshWebDesktopBuild(root, startedAtMs), { ok: true, missing: [], stale: [], empty: [] });

  const staleFile = path.join(root, helper.FRESH_WEB_DESKTOP_FILES[0]);
  fs.utimesSync(staleFile, new Date(startedAtMs - 2_000), new Date(startedAtMs - 2_000));
  const stale = helper.verifyFreshWebDesktopBuild(root, startedAtMs);
  assert.equal(stale.ok, false);
  assert.deepEqual(stale.stale, [helper.FRESH_WEB_DESKTOP_FILES[0]]);

  fs.writeFileSync(staleFile, '');
  const empty = helper.verifyFreshWebDesktopBuild(root, startedAtMs);
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.empty, [helper.FRESH_WEB_DESKTOP_FILES[0]]);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('web desktop build result tests passed');
