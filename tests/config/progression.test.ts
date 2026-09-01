import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'assets', 'scenes', 'Main.scene'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function testProgressionConfigHasTenCareerLevels(): void {
  const root = findRepoRoot(__dirname);
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'configs', 'progression.json'), 'utf8')) as {
    levels: Array<{ careerLevel: number; expectedMinutes: number; requiredExp: number; kpiWorkSeconds: number }>;
  };
  assert.equal(raw.levels.length, 10);
  assert.equal(raw.levels[0].careerLevel, 1);
  assert.ok(raw.levels[0].expectedMinutes >= 5 && raw.levels[0].expectedMinutes <= 10, 'first visible upgrade in 5-10 minutes');
  assert.ok(raw.levels[1].expectedMinutes >= 20 && raw.levels[1].expectedMinutes <= 30, 'first promotion in 20-30 minutes');
  assert.ok(raw.levels[4].expectedMinutes >= 120 && raw.levels[4].expectedMinutes <= 240, 'levels 4-5 around 2-4 hours');
}

testProgressionConfigHasTenCareerLevels();
console.log('progression config tests passed');
