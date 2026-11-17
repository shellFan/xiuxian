import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const manifest = require(path.resolve(__dirname, '../../../..', 'scripts', 'build-manifest.cjs')) as {
  computeSourceInputsHash(root: string): string;
  computeOverlayInputsHash(root: string): string;
  writeBuildProvenance(buildDir: string, details: { buildId: string; sourceHashBefore: string; sourceHashAfter: string }): unknown;
  verifyBuildProvenance(buildDir: string, root: string): { ok: boolean; reason?: string; sourceStale?: boolean; outputTampered?: boolean };
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-v10-provenance-'));
const output = path.join(root, 'build-output');
try {
  fs.mkdirSync(path.join(root, 'assets', 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'assets', 'configs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'assets', 'scenes'), { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(root, 'assets', 'scripts', 'game.ts'), 'export const version = 1;');
  fs.writeFileSync(path.join(root, 'assets', 'configs', 'game.json'), '{"version":1}');
  fs.writeFileSync(path.join(root, 'assets', 'scenes', 'Main.scene'), '[]');
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.writeFileSync(path.join(root, 'tsconfig.game.json'), '{}');
  fs.writeFileSync(path.join(output, 'index.html'), '<html></html>');

  const sourceBefore = manifest.computeSourceInputsHash(root);
  manifest.writeBuildProvenance(output, { buildId: 'build-1', sourceHashBefore: sourceBefore, sourceHashAfter: sourceBefore });
  assert.equal(manifest.verifyBuildProvenance(output, root).ok, true);

  // Reproduce the historical bug: source changes after Creator output but before copy.
  fs.writeFileSync(path.join(root, 'assets', 'scripts', 'game.ts'), 'export const version = 2;');
  const staleSource = manifest.verifyBuildProvenance(output, root);
  assert.equal(staleSource.ok, false);
  assert.equal(staleSource.sourceStale, true);

  // The output itself must also be content-bound; mtimes are intentionally irrelevant.
  fs.writeFileSync(path.join(root, 'assets', 'scripts', 'game.ts'), 'export const version = 1;');
  fs.writeFileSync(path.join(output, 'index.html'), '<html>tampered</html>');
  const tamperedOutput = manifest.verifyBuildProvenance(output, root);
  assert.equal(tamperedOutput.ok, false);
  assert.equal(tamperedOutput.outputTampered, true);

  // UI-only changes are a separate overlay domain and do not invalidate Cocos source provenance.
  fs.mkdirSync(path.join(root, 'desktop'), { recursive: true });
  fs.writeFileSync(path.join(root, 'desktop', 'ui-overlay.js'), 'overlay-v1');
  const overlayBefore = manifest.computeOverlayInputsHash(root);
  const output2 = path.join(root, 'build-output-2');
  fs.mkdirSync(output2, { recursive: true });
  fs.writeFileSync(path.join(output2, 'index.html'), '<html></html>');
  manifest.writeBuildProvenance(output2, { buildId: 'build-2', sourceHashBefore: sourceBefore, sourceHashAfter: sourceBefore });
  fs.writeFileSync(path.join(root, 'desktop', 'ui-overlay.js'), 'overlay-v2');
  assert.notEqual(manifest.computeOverlayInputsHash(root), overlayBefore);
  assert.equal(manifest.verifyBuildProvenance(output2, root).ok, true, 'overlay-only changes preserve verified Cocos provenance');
  assert.equal(manifest.verifyBuildProvenance(output, root).ok, false, 'tampered output remains rejected');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('v10 build provenance tests passed');
