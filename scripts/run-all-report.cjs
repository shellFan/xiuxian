'use strict';
// 临时诊断脚本：跑全部编译后测试并汇总失败（run-all.cjs 遇错即停，看不到全景）。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = 'tests/.compiled/tests';
function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : (p.endsWith('.test.js') ? [p] : []);
  });
}
const tests = walk(root).sort();
let failed = 0;
for (const t of tests) {
  const r = spawnSync(process.execPath, [t], { encoding: 'utf8', timeout: 180000 });
  if (r.status !== 0) {
    failed += 1;
    const label = t.split(path.sep).join('/');
    const errLine = (r.stderr || r.stdout || '').split('\n').filter((l) => /Error|ssertion/.test(l)).slice(0, 2).join(' | ');
    console.log('FAIL', label, '::', errLine.slice(0, 220));
  }
}
console.log('TOTAL', tests.length, 'FAILED', failed);
