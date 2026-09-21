import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'desktop', 'ui-overlay.js'), 'utf8');

assert.match(source, /function showWelcomeBackPopup\(\)/);
assert.match(source, /prepareWelcomeBack\(\)/);
assert.match(source, /showWelcomeBackPopup\(\)/);
assert.doesNotMatch(source, /showOfflinePopup\(['"]offline_['"] \+ Date\.now\(\)\)/);
assert.match(source, /performWelcomeAction\(/);
assert.match(source, /setAutoPolicy\(/);

console.log('auto policy overlay contract tests passed');
