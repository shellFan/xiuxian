import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { CURRENT_SAVE_VERSION } from '../../assets/scripts/model/save-data';

function makeContext(player?: PlayerData): GameContext {
  return new GameContext({ player, storage: new MemoryStorageAdapter() });
}

function testFirstMergeUnlocksOnce(): void {
  const context = makeContext();
  context.player.kpiProgress = { MERGE_COUNT: 1 };
  const first = context.achievements.checkAll();
  assert.ok(first.includes('FIRST_MERGE'));
  const salaryAfter = context.player.salary;
  const second = context.achievements.checkAll();
  assert.deepEqual(second, []);
  assert.equal(context.player.salary, salaryAfter);
  assert.ok(context.player.unlockedAchievementIds.includes('FIRST_MERGE'));
}

function testSalaryAndRealmAchievements(): void {
  const context = makeContext(new PlayerData({ salary: 1000, careerLevel: 3 }));
  const unlocked = context.achievements.checkAll();
  assert.ok(unlocked.includes('SALARY_1000'));
  assert.ok(unlocked.includes('REACH_LIANQI'));
  assert.ok(unlocked.includes('REACH_ZHUJI'));
  assert.ok(unlocked.includes('REACH_JINDAN'));
}

function testRareEventAchievement(): void {
  const context = makeContext();
  context.achievements.notifyEventType('RARE');
  assert.ok(context.player.unlockedAchievementIds.includes('RARE_EVENT'));
}

function testAchievementsPersistOnSave(): void {
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ player: new PlayerData({ salary: 10000 }), storage });
  context.achievements.checkAll();
  context.saveService.save(context.player);
  // Load from the same storage — achievements should survive round-trip
  const loaded = new GameContext({ storage });
  assert.ok(loaded.player.unlockedAchievementIds.includes('SALARY_10000'));
}

testFirstMergeUnlocksOnce();
testSalaryAndRealmAchievements();
testRareEventAchievement();
testAchievementsPersistOnSave();
console.log('achievement service tests passed');