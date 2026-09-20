import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const overlay = fs.readFileSync(path.resolve(process.cwd(), 'desktop/ui-overlay.js'), 'utf8');
const css = fs.readFileSync(path.resolve(process.cwd(), 'desktop/ui-overlay.css'), 'utf8');

assert.match(overlay, /queryWorkToday/, 'home must query the canonical Work Today projection');
assert.match(overlay, /voluntaryOvertime/, 'home must expose a voluntary overtime action');
assert.match(overlay, /finishOvertime/, 'home must let a player finish an active overtime session');
assert.match(css, /ux-work-today/, 'Work Today panel needs dedicated responsive styling');
console.log('work today overlay tests passed');
