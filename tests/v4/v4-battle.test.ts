import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import type { BattleRunState } from '../../assets/scripts/v3/battle-service';

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 8, day, hour, minute, 0, 0).getTime();
}

/** 简单 LCG：战斗 rng 可注入，测试可复现。 */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function make(hour = 10): { clock: FakeClock; context: GameContext } {
  const clock = new FakeClock(at(21, hour));
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: seededRng(0x5eed) });
  context.gameDay.ensureStarted();
  return { clock, context };
}

function driveToFinish(context: GameContext, maxTicks = 1200): BattleRunState {
  for (let i = 0; i < maxTicks; i += 1) {
    const run = context.battle.current();
    if (!run) throw new Error('battle vanished');
    if (run.skillOffers) context.battle.chooseSkill(run.skillOffers[0]);
    context.battle.tick(1);
    const finished = context.battle.finished();
    if (finished) return finished;
  }
  throw new Error('battle did not finish within budget');
}

function testStartRequiresGameDayAndUniqueRun(): void {
  const clock = new FakeClock(at(21, 10));
  const raw = new GameContext({ player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: seededRng(1) });
  assert.throws(() => raw.battle.start('PROJECT', 'build_db'), /尚未开工/);
  raw.gameDay.ensureStarted();
  const run = raw.battle.start('PROJECT', 'build_db');
  assert.equal(run.status, 'FIGHTING');
  assert.equal(run.waveTotal, 5);
  assert.throws(() => raw.battle.start('PROJECT', 'build_java'), /已有进行中的战斗/);
  assert.throws(() => raw.battle.start('PROJECT', 'build_nonsense'), /未知的 Build/);
}

function testSavedBattleSnapshotCannotMutateLiveRun(): void {
  const { context } = make();
  const live = context.battle.start('PROJECT', 'build_db');
  context.saveService.save(context.player);
  const saved = context.saveService.getLatestCommittedSnapshot();
  assert.ok(saved?.activeBattleRun, 'active battle is included in a save');
  const snapshotRun = saved!.activeBattleRun as BattleRunState;
  snapshotRun.log.push('外部快照污染');
  assert.equal(live.log.includes('外部快照污染'), false, 'save snapshots must not share battle state with the live run');
}

function testCorruptSavedBattleCannotBlockNewRun(): void {
  const clock = new FakeClock(at(21, 10));
  const context = new GameContext({
    storage: new MemoryStorageAdapter(),
    player: new PlayerData({ lastSaveTime: clock.now(), activeBattleRun: { status: 'FIGHTING', runId: 7 } }),
    clock,
    board: null,
    battleRng: seededRng(9),
  });
  context.gameDay.ensureStarted();
  assert.equal(context.battle.current(), null, 'a malformed persisted run is not resumable');
  assert.equal(context.battle.start('PROJECT', 'build_db').status, 'FIGHTING');
}

function testCombatProgressesAndKillsEnemies(): void {
  const { context } = make();
  context.battle.start('PROJECT', 'build_db');
  context.battle.tick(3);
  const run = context.battle.current()!;
  const damaged = run.enemies.some((e) => e.hp < e.maxHp) || run.kills > 0;
  assert.ok(damaged, 'auto attack must damage enemies');
  assert.ok(run.log.length > 0, 'battle log records damage');
}

function testLevelUpThreeChoiceAppliesSkillOnce(): void {
  const { context } = make();
  context.battle.start('PROJECT', 'build_java');
  // 快速击杀至升级：直接打满若干秒
  let sawOffers = false;
  for (let i = 0; i < 200; i += 1) {
    const run = context.battle.current()!;
    if (run.skillOffers) {
      sawOffers = true;
      assert.equal(run.skillOffers.length, 3);
      const before = run.shield;
      const pickCache = run.skillOffers.includes('skill_cache_shield') ? 'skill_cache_shield' : run.skillOffers[0];
      context.battle.chooseSkill(pickCache);
      const after = context.battle.current()!;
      assert.equal(after.skillOffers, null);
      if (pickCache === 'skill_cache_shield') {
        // 再 tick 数秒，护盾不得重复叠加
        context.battle.tick(5);
        assert.equal(context.battle.current()!.shield, before + 30);
      }
      break;
    }
    context.battle.tick(1);
  }
  assert.ok(sawOffers, 'level-up offers should appear within budget');
}

function testVictoryRewardsExactlyOnce(): void {
  const { context } = make();
  context.battle.start('PROJECT', 'build_redis');
  const finished = driveToFinish(context);
  assert.equal(finished.status, 'VICTORY');
  assert.equal(finished.rewardsClaimed, true);
  const stonesAfterVictory = context.player.spiritStones;
  const materialsAfter = JSON.stringify(context.player.materials);
  // 结束后再 tick 不应再发奖励
  context.battle.tick(5);
  assert.equal(context.player.spiritStones, stonesAfterVictory, 'rewards must be exactly-once');
  assert.equal(JSON.stringify(context.player.materials), materialsAfter);
}

function testBossVictoryCompletesLinkedTask(): void {
  const { context } = make();
  const task = context.assignedTasks.assign({ title: '修复支付超时', priority: 'P0', source: 'BOSS', rewardSalary: 50, rewardPerformance: 5 });
  context.battle.start('PROJECT', 'build_db', task.id);
  const finished = driveToFinish(context);
  assert.equal(finished.status, 'VICTORY');
  assert.equal(finished.linkedTaskId, task.id);
  const done = context.player.assignedTasks.find((t) => t.id === task.id);
  assert.equal(done?.status, 'DONE', 'boss victory completes the linked assigned task');
}

function testDefeatGrantsReducedLootOnce(): void {
  const { context } = make();
  context.battle.start('PROJECT', 'build_fish');
  // 直接把玩家打到 1 滴血，等敌人攻击落下来
  const run = context.battle.current()!;
  run.playerHp = 1;
  let finished: BattleRunState | null = null;
  for (let i = 0; i < 20 && !finished; i += 1) {
    context.battle.tick(1);
    finished = context.battle.finished();
  }
  assert.ok(finished, 'battle should be over');
  assert.equal(finished!.status, 'DEFEAT');
  const stones = context.player.spiritStones;
  context.battle.tick(5);
  assert.equal(context.player.spiritStones, stones, 'defeat rewards also exactly-once');
}

function testNightModifierDuringOvertime(): void {
  const { clock, context } = make(21);
  context.overtime.startVoluntary(2 * 3600, true);
  const run = context.battle.start('PROJECT', 'build_db');
  assert.equal(run.night, true, 'overtime session at 21:00 enables night modifier');
  void clock;
}

function testFatigueReducesAttack(): void {
  const { clock, context } = make(10);
  context.player.overtimeFatigue = 'EXHAUSTED';
  const run = context.battle.start('PROJECT', 'build_db');
  // build_db base attack 16 ×0.75 = 12
  assert.equal(run.attack, 12);
  context.player.overtimeFatigue = 'RESTED';
}

function testAbandonEndsWithDefeatAndClaim(): void {
  const { context } = make();
  context.battle.start('PROJECT', 'build_java');
  context.battle.abandon();
  const finished = context.battle.finished();
  assert.ok(finished);
  assert.equal(finished!.status, 'DEFEAT');
  assert.equal(finished!.rewardsClaimed, true);
  assert.equal(context.battle.current(), null);
}

function testIncidentDungeonVictoryRecoversIncident(): void {
  const { context } = make();
  const incident = context.incidents.raise({ type: 'PAYMENT_FAILURE', severity: 'S4', forcedRelease: false });
  context.battle.start('INCIDENT', 'build_redis', null, incident.id);
  const finished = driveToFinish(context);
  assert.equal(finished.status, 'VICTORY');
  const closed = context.player.incidents.find((i) => i.id === incident.id);
  assert.ok(closed);
  assert.equal(closed!.status, 'RECOVERED', 'incident dungeon victory recovers the incident');
}

function testPersistenceAcrossRestart(): void {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(at(21, 10));
  const context = new GameContext({ storage, player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: seededRng(7) });
  context.gameDay.ensureStarted();
  context.battle.start('PROJECT', 'build_java');
  context.battle.tick(4);
  context.saveService.save(context.player);
  const restarted = new GameContext({ storage, clock, board: null, battleRng: seededRng(7) });
  const after = restarted.battle.current();
  assert.ok(after, 'active battle run survives restart');
  assert.ok(after!.kills >= 0);
}

function testFinishedBattlePersistsRewardClaimAcrossRestart(): void {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(at(21, 10));
  const context = new GameContext({ storage, player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: seededRng(11) });
  context.gameDay.ensureStarted();
  context.battle.start('PROJECT', 'build_redis');
  const done = driveToFinish(context);
  assert.equal(done.rewardsClaimed, true);
  const restarted = new GameContext({ storage, clock, board: null, battleRng: seededRng(11) });
  const savedResult = restarted.battle.finished();
  assert.ok(savedResult, 'finished result is durable before the next auto-save');
  assert.equal(savedResult!.rewardsClaimed, true);
  assert.equal(restarted.player.spiritStones, context.player.spiritStones, 'reward is not replayed after restart');
}

const tests = [
  testStartRequiresGameDayAndUniqueRun,
  testSavedBattleSnapshotCannotMutateLiveRun,
  testCorruptSavedBattleCannotBlockNewRun,
  testCombatProgressesAndKillsEnemies,
  testLevelUpThreeChoiceAppliesSkillOnce,
  testVictoryRewardsExactlyOnce,
  testBossVictoryCompletesLinkedTask,
  testDefeatGrantsReducedLootOnce,
  testNightModifierDuringOvertime,
  testFatigueReducesAttack,
  testAbandonEndsWithDefeatAndClaim,
  testIncidentDungeonVictoryRecoversIncident,
  testPersistenceAcrossRestart,
  testFinishedBattlePersistsRewardClaimAcrossRestart,
];

let failures = 0;
for (const test of tests) {
  try {
    test();
    console.log('ok - ' + test.name);
  } catch (error) {
    failures += 1;
    console.error('not ok - ' + test.name);
    console.error(error);
  }
}
if (failures > 0) {
  console.error(`${failures} v4 battle tests failed`);
  process.exit(1);
}
console.log('v4 battle tests passed');
