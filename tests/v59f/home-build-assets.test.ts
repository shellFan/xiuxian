import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Both an old patched build and a fresh Cocos build must receive the merge UI.
for (const existingOverlay of [false, true]) {
  const output = mkdtempSync(join(tmpdir(), 'xiuxian-home-assets-'));
  writeFileSync(join(output, 'index.html'), '<html><head></head><body><div id="GameDiv"></div>' +
    (existingOverlay ? '<script src="ui-overlay.js"></script>' : '') + '</body></html>');
  for (let pass = 0; pass < 2; pass += 1) {
    const patched = spawnSync(process.execPath, [join(process.cwd(), 'desktop/patch-html.cjs'), output], { encoding: 'utf8' });
    assert.equal(patched.status, 0, patched.stderr);
    const html = readFileSync(join(output, 'index.html'), 'utf8');
    assert.equal((html.match(/src="ui-merge-home\.js"/g) ?? []).length, 1, 'merge module is injected exactly once');
    assert.ok(html.indexOf('src="ui-merge-home.js"') < html.indexOf('src="ui-overlay.js"'), 'module precedes its host');
    for (const file of ['ui-overlay.js', 'ui-v59f-home.js', 'ui-merge-home.js', 'ui-overlay-v2.js', 'ui-overlay.css']) {
      assert.equal(readFileSync(join(output, file), 'utf8'), readFileSync(join(process.cwd(), 'desktop', file), 'utf8'), `fresh shipped asset: ${file}`);
    }
  }
}
console.log('Home build assets: fresh build, legacy build and repeated patching passed');
