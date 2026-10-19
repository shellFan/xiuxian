import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const overlay = readFileSync('desktop/ui-overlay-v2.js', 'utf8');
const actions = readFileSync('desktop/ui-overlay.js', 'utf8');

assert.match(overlay, /careerLayoffWarning/);
assert.match(overlay, /careerLayoffResponse/);
assert.match(overlay, /careerLayoffResolve/);
assert.match(overlay, /careerSectFateChain/);
assert.match(actions, /beginCareerLayoffWarning/);
assert.match(actions, /chooseCareerLayoffResponse/);
assert.match(actions, /resolveCareerLayoffWarning/);
assert.match(actions, /triggerCareerSectEventChain/);
assert.match(actions, /\.dataset\.response/);
console.log('career layoff UI contract tests passed');
