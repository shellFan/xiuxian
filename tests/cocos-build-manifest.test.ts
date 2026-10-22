import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const manifest = require(path.resolve(__dirname, '../../..', 'scripts', 'cocos-build-manifest.cjs')) as {
  generateCocosBuildManifest(buildDir: string, options: {
    sourceInputsHash: string;
    gitHead?: string;
    startedAtMs: number;
    completedAtMs: number;
    creatorVersion?: string;
  }): { sourceInputsHash: string };
  verifyCocosBuildManifest(buildDir: string, currentSourceInputsHash: string): {
    ok: boolean;
    reason: string;
  };
};

const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-cocos-manifest-'));
try {
  const startedAtMs = Date.now() - 500;
  const missing = manifest.verifyCocosBuildManifest(buildDir, 'source-hash-a');
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /manifest missing/);

  const generated = manifest.generateCocosBuildManifest(buildDir, {
    sourceInputsHash: 'source-hash-a',
    gitHead: 'test-head',
    startedAtMs,
    completedAtMs: Date.now(),
    creatorVersion: '3.8.4',
  });

  assert.equal(generated.sourceInputsHash, 'source-hash-a');
  assert.equal(manifest.verifyCocosBuildManifest(buildDir, 'source-hash-a').ok, true);
  const stale = manifest.verifyCocosBuildManifest(buildDir, 'source-hash-b');
  assert.equal(stale.ok, false);
  assert.match(stale.reason, /sourceInputsHash mismatch/);
} finally {
  fs.rmSync(buildDir, { recursive: true, force: true });
}

console.log('Cocos build manifest freshness tests passed');
