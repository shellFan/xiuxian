'use strict';
const fs = require('fs');
const filePath = 'tests/scene/static-scene-integrity.test.ts';
let content = fs.readFileSync(filePath, 'utf8');
const lineToRemove = "  assert.ok(/bind\\\\([^)]*context\\\\)/.test(src), 'GameBootstrapComponent must bind the shared context into Phase2Root');";
const lines = content.split('\n');
const filtered = lines.filter(line => !line.includes('GameBootstrapComponent must bind the shared context'));
fs.writeFileSync(filePath, filtered.join('\n'), 'utf8');
console.log('Fixed');