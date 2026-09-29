import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/** Portable Electron uses localhost for its bundled server, so host name is not a development signal. */
function testPortableReleaseKeepsDevPanelHidden(): void {
  const source = fs.readFileSync(path.resolve('desktop/ui-overlay-v2.js'), 'utf8');
  assert.ok(source.includes('/[?&]dev=1/'), 'explicit ?dev=1 remains the deliberate development override');
  assert.doesNotMatch(source, /hostname === 'localhost'|hostname === '127\.0\.0\.1'/, 'localhost must not expose DEV controls in a portable release');
  assert.match(source, /return false;/, 'the default visibility path is closed');
}

testPortableReleaseKeepsDevPanelHidden();
console.log('v5 release DEV gate tests passed');
