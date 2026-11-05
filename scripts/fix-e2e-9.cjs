'use strict';
const fs = require('fs');
let s = fs.readFileSync('ai/qa-final/session-v59o-card-battle.mjs', 'utf8');

// 保存位置校验：递归查找隔离目录内的 save.json（initStorage 的确切子路径以主进程为准）。
s = s.replace("    const saveBefore = readSaveFile();\n    ok('save file written in isolated dir', !!saveBefore && saveBefore.path.indexOf(os.tmpdir()) >= 0);",
`    const findSavedFile = (dir) => {
      const found = [];
      const walk = (d) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name === 'save.json') found.push(full);
        }
      };
      try { walk(dir); } catch { /* ignore */ }
      return found;
    };
    const savedPaths = findSavedFile(QA.isolatedUserData);
    evidence.savedPaths = savedPaths;
    log('save files under isolated dir:', savedPaths.join(', ') || 'NONE');
    ok('save file written in isolated dir', savedPaths.length >= 1 && savedPaths[0].indexOf(os.tmpdir()) >= 0);`);

fs.writeFileSync('ai/qa-final/session-v59o-card-battle.mjs', s);
console.log('save check upgraded');
