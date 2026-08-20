'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const compiledRoot = path.join(__dirname, '.compiled');
function findTests(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTests(fullPath);
    return entry.isFile() && entry.name.endsWith('.test.js') ? [fullPath] : [];
  });
}
const tests = findTests(compiledRoot).sort();
if (tests.length === 0) { console.error('No compiled tests found'); process.exit(1); }
for (const test of tests) {
  const result = spawnSync(process.execPath, [test], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Executed ${tests.length} test files`);