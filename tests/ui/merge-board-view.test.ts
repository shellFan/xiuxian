import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const boardViewSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/merge-board-view.ts'), 'utf8');
const workerViewSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/worker-view.ts'), 'utf8');

function testBoardViewBindsOneWorkerViewToEveryRealCell(): void {
  assert.match(boardViewSource, /BoardCell/);
  assert.match(boardViewSource, /WorkerView/);
  assert.match(boardViewSource, /refresh/);
  assert.match(workerViewSource, /refresh\(/);
  assert.match(workerViewSource, /touch-end/);
}

function testBoardViewKeepsMergeTargetAsTheUpgradedWorker(): void {
  assert.match(boardViewSource, /merge/);
  assert.match(boardViewSource, /target/);
  assert.match(boardViewSource, /animate|tween/i);
}

testBoardViewBindsOneWorkerViewToEveryRealCell();
testBoardViewKeepsMergeTargetAsTheUpgradedWorker();
console.log('merge board view tests passed');
