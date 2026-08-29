import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { FixedRandomProvider, SequenceRandomProvider, type RandomProvider } from '../../assets/scripts/core/random-provider';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData, type PlayerDataOptions } from '../../assets/scripts/model/player-data';
import { WorkerEntity } from '../../assets/scripts/model/worker-entity';
import { MemoryStorageAdapter, type StorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MockRewardProvider } from '../../assets/scripts/services/reward-provider';

const DEFAULT_SAVE_KEY = 'game-save';

function makeContext(options: PlayerDataOptions = {}, random?: RandomProvider): { context: GameContext; player: PlayerData; clock: FakeClock; storage: MemoryStorageAdapter } {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(1_000);
  const player = new PlayerData({ lastSaveTime: 1_000, ...options });
  const context = new GameContext({ player, storage, randomProvider: random, clock });
  return { context, player, clock, storage };
}

// ---------------------------------------------------------------------------
// 1. Save migration: missing / legacy / corrupted fields fall back to defaults
// ---------------------------------------------------------------------------
function testSaveMigrationFillsMissingFields(): void {
  const storage = new MemoryStorageAdapter();
  // Legacy partial save: only a couple of fields, missing every Phase 2 field.
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify({ salary: 123, mind: 40 }));
  const context = new GameContext({ storage });
  const player = context.player;
  assert.equal(player.salary, 123);
  assert.equal(player.mind, 40);
  assert.equal(player.careerLevel, 1);
  assert.equal(player.maxMind, 100);
  assert.equal(player.performance, 0);
  assert.equal(player.sectId, null);
  assert.equal(player.talentId, null);
  assert.equal(player.officeLevel, 1);
  assert.equal(player.promotionFailCount, 0);
  assert.equal(player.lastIdleSettlementId, null);
  assert.deepEqual(player.kpiProgress, {});
}

function testSaveMigrationHandlesCorruptedJson(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem(DEFAULT_SAVE_KEY, '{ this is not valid json');
  const context = new GameContext({ storage });
  const player = context.player;
  assert.equal(player.salary, 0);
  assert.equal(player.careerLevel, 1);
  assert.equal(player.officeLevel, 1);
  assert.equal(player.mind, 100);
}

function testSaveMigrationRejectsFutureVersion(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify({ saveVersion: 9999, salary: 5 }));
  const context = new GameContext({ storage });
  // Unsupported version -> rolls back to a clean default save.
  assert.equal(context.player.salary, 0);
  assert.equal(context.player.careerLevel, 1);
}

function testSaveRoundTripPreservesPhaseTwoFields(): void {
  const { player, storage } = makeContext({
    careerLevel: 4,
    officeLevel: 2,
    promotionFailCount: 3,
    performance: 20,
    lastIdleSettlementId: 'sid-x',
  });
  new SaveService(storage, DEFAULT_SAVE_KEY, new FakeClock(5_000)).save(player);
  const reloaded = new GameContext({ storage }).player;
  assert.equal(reloaded.careerLevel, 4);
  assert.equal(reloaded.officeLevel, 2);
  assert.equal(reloaded.promotionFailCount, 3);
  assert.equal(reloaded.performance, 20);
  assert.equal(reloaded.lastIdleSettlementId, 'sid-x');
}

// ---------------------------------------------------------------------------
// 2. Idle boundaries (regression through the shared IdleService)
// ---------------------------------------------------------------------------
function testIdleBoundariesZeroEightHourCap(): void {
  // zero elapsed -> no reward, no settlement recorded
  const zero = makeContext();
  zero.context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  assert.equal(zero.context.idle.settle('zero').salary, 0);

  // exactly 8h -> full reward, not capped
  const eight = makeContext();
  eight.context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  eight.clock.set(1_000 + 8 * 60 * 60 * 1_000);
  const exact = eight.context.idle.settle('eight');
  assert.equal(exact.salary, 80);
  assert.equal(exact.cultivationExp, 40);
  assert.equal(exact.capped, false);
  // re-settling the same id after no time passes is a duplicate (no re-grant)
  assert.deepEqual(eight.context.idle.settle('eight'), { salary: 0, cultivationExp: 0, elapsedSeconds: 0, capped: false, duplicate: true });

  // 12h total -> capped at 8h (elapsedSeconds stays 28800)
  const twelve = makeContext();
  twelve.context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  twelve.clock.set(1_000 + 12 * 60 * 60 * 1_000);
  const over = twelve.context.idle.settle('twelve');
  assert.equal(over.salary, 80, 'capped at 8h (28800s)');
  assert.equal(over.capped, true);
  assert.equal(over.elapsedSeconds, 28_800);
}

// ---------------------------------------------------------------------------
// 3. Mind boundaries
// ---------------------------------------------------------------------------
function testMindClampsAtBoundsAndThrowsOnBadInput(): void {
  const { context, player } = makeContext({ mind: 0, maxMind: 100 });
  assert.equal(context.mind.status, 'BREAKDOWN');
  context.mind.applyDelta(10);
  assert.equal(player.mind, 10);
  context.mind.applyDelta(1000);
  assert.equal(player.mind, 100, 'clamped to maxMind');
  context.mind.applyDelta(-5000);
  assert.equal(player.mind, 0, 'clamped to 0');
  assert.throws(() => context.mind.change(1.5), /Invalid mind change/);
  assert.throws(() => context.mind.change(Number.NaN), /Invalid mind change/);
}

// ---------------------------------------------------------------------------
// 4. Sect: exactly 4 sects, each boosts one distinct dimension
// ---------------------------------------------------------------------------
function testSectHasFourDistinctModifiers(): void {
  const { context } = makeContext();
  const sects = context.sect.available();
  assert.equal(sects.length, 4);
  const multipliers = sects.map((s) => [s.modifiers.salaryMultiplier, s.modifiers.cultivationMultiplier, s.modifiers.mindMultiplier, s.modifiers.performanceMultiplier]);
  // Each sect must have exactly one 1.2 dimension.
  for (const m of multipliers) {
    assert.equal(m.filter((v) => v === 1.2).length, 1, 'each sect boosts exactly one dimension by 1.2');
    assert.equal(m.filter((v) => v === 1).length, 3);
  }
  // No two sects share the same boosted dimension.
  const boosted = sects.map((s) => (s.modifiers.salaryMultiplier === 1.2 ? 'salary' : s.modifiers.cultivationMultiplier === 1.2 ? 'cultivation' : s.modifiers.mindMultiplier === 1.2 ? 'mind' : 'performance'));
  assert.equal(new Set(boosted).size, 4, 'all four dimensions are covered');
}

function testSectChoicePersistsAndBlocksSecondChoice(): void {
  const { context, player } = makeContext();
  context.sect.choose('PRIVATE');
  assert.equal(player.sectId, 'PRIVATE');
  assert.throws(() => context.sect.choose('STATE'), /Sect already chosen/);
}

// ---------------------------------------------------------------------------
// 5. Talent: fixed RNG, exactly 3 choices, reload determinism
// ---------------------------------------------------------------------------
function testTalentFixedRngThreeChoices(): void {
  const rng = new FixedRandomProvider(0.42);
  const storageA = new MemoryStorageAdapter();
  const storageB = new MemoryStorageAdapter();
  const a = new GameContext({ storage: storageA, randomProvider: rng }).talent;
  const b = new GameContext({ storage: storageB, randomProvider: new FixedRandomProvider(0.42) }).talent;
  const choicesA = a.firstChoices();
  const choicesB = b.firstChoices();
  assert.equal(choicesA.length, 3, 'exactly three first choices');
  assert.deepEqual(choicesA.map((t) => t.id), choicesB.map((t) => t.id), 'deterministic under fixed RNG');
  const ids = new Set(choicesA.map((t) => t.id));
  assert.equal(ids.size, 3, 'choices are distinct');
  assert.ok(choicesA.every((t) => a.available().some((av) => av.id === t.id)), 'choices come from the pool');
}

function testTalentReloadKeepsSameChoices(): void {
  const { context, player } = makeContext({}, new FixedRandomProvider(0.42));
  const first = context.talent.firstChoices().map((t) => t.id);
  // New service instance over the same (unchosen) player must return the same set.
  const reloaded = new GameContext({ player, storage: new MemoryStorageAdapter(), randomProvider: new FixedRandomProvider(0.42) }).talent.firstChoices().map((t) => t.id);
  assert.deepEqual(first, reloaded);
}

function testTalentChoosePersistsAndRejectsOutOfPool(): void {
  // choosing a valid first choice persists, and re-choosing is rejected.
  const a = makeContext({}, new FixedRandomProvider(0.42));
  const choice = a.context.talent.firstChoices()[0].id;
  a.context.talent.choose(choice);
  assert.equal(a.player.talentId, choice);
  assert.throws(() => a.context.talent.choose(choice), /Talent already chosen/);

  // a fresh, unchosen player: choosing outside the first choices is rejected.
  const b = makeContext({}, new FixedRandomProvider(0.42));
  const firstIds = b.context.talent.firstChoices().map((t) => t.id);
  const outsider = b.context.talent.available().find((t) => !firstIds.includes(t.id))!;
  assert.throws(() => b.context.talent.choose(outsider.id), /not among first choices/);
}

// ---------------------------------------------------------------------------
// 6. Career events: exactly 30, all titled, choice + direct variety, no double resolve
// ---------------------------------------------------------------------------
function testCareerEventsConfigShape(): void {
  const { context } = makeContext();
  const events = context.configService.careerEvents.events;
  assert.equal(events.length, 30, 'exactly 30 events');
  assert.ok(events.every((e) => typeof e.title === 'string' && e.title.length > 0), 'every event has a title');
  const withChoices = events.filter((e) => e.choices && e.choices.length > 0).length;
  const withDirect = events.filter((e) => e.effects).length;
  assert.equal(withChoices, 6, '6 choice events');
  assert.equal(withDirect, 24, '24 direct-effect events');
  assert.ok(events.every((e) => !e.choices || new Set(e.choices.map((c) => c.id)).size === e.choices.length), 'choice ids unique within an event');
}

function testCareerEventResolveTwiceThrows(): void {
  const { context, clock } = makeContext({}, new FixedRandomProvider(0));
  context.careerEvents.poll(); // establish the first schedule
  clock.advance(9 * 60 * 1000);
  const event = context.careerEvents.poll();
  assert.ok(event, 'an event is pending after the interval');
  if (event!.choices && event!.choices.length > 0) {
    context.careerEvents.choose(event!.id, event!.choices[0].id);
  } else {
    context.careerEvents.resolve(event!.id);
  }
  assert.equal(context.careerEvents.current(), undefined, 'pending cleared after resolve');
  assert.throws(() => context.careerEvents.resolve(event!.id), /not pending/);
}

function testCareerEventWrongIdRejected(): void {
  const { context, clock } = makeContext({}, new FixedRandomProvider(0.5));
  context.careerEvents.poll(); // establish the first schedule
  clock.advance(9 * 60 * 1000);
  const event = context.careerEvents.poll();
  assert.ok(event);
  assert.throws(() => context.careerEvents.resolve('EVENT_THAT_IS_NOT_PENDING'), /not pending/);
  if (event!.choices && event!.choices.length > 0) {
    assert.throws(() => context.careerEvents.choose(event!.id, 'NO_SUCH_CHOICE'), /Unknown choice/);
  }
}

// ---------------------------------------------------------------------------
// 7. KPI: max-level not "completed", completion + switchLevel reset
// ---------------------------------------------------------------------------
function testKpiMaxLevelNotCompleted(): void {
  const { context } = makeContext({ careerLevel: 10 });
  assert.equal(context.kpi.isCurrentKpiCompleted(), false, 'no config at max level');
}

function testKpiCompletionAndSwitchReset(): void {
  const { context, player } = makeContext({ careerLevel: 1, cultivationExp: 50, workSeconds: 300, kpiProgress: { MERGE_COUNT: 3 } });
  assert.equal(context.kpi.isCurrentKpiCompleted(), true);
  context.kpi.switchLevel(2);
  assert.equal(player.careerLevel, 2);
  assert.deepEqual(player.kpiProgress, {}, 'per-level counters reset');
  assert.equal(context.kpi.isCurrentKpiCompleted(), false, 'level 2 targets not yet met');
}

// ---------------------------------------------------------------------------
// 8. Promotion: reasons, success/failure via injected RNG, save-failure rollback
// ---------------------------------------------------------------------------
function testPromotionReasons(): void {
  const { context } = makeContext({ careerLevel: 10 });
  assert.equal(context.promotion.canPromote().reason, 'MAX_LEVEL');
  const kpiIncomplete = makeContext({ careerLevel: 1, cultivationExp: 10 });
  assert.equal(kpiIncomplete.context.promotion.canPromote().reason, 'KPI_INCOMPLETE');
  const cultShort = makeContext({ careerLevel: 3, cultivationExp: 280, workSeconds: 900, kpiProgress: { MERGE_COUNT: 8 } });
  assert.equal(cultShort.context.promotion.canPromote().reason, 'CULTIVATION_INSUFFICIENT');
  const ready = makeContext({ careerLevel: 1, cultivationExp: 50, mind: 100, workSeconds: 300, kpiProgress: { MERGE_COUNT: 3 } });
  assert.equal(ready.context.promotion.canPromote().allowed, true);
}

function testPromotionSuccessAndFailure(): void {
  const ok = makeContext({ careerLevel: 1, cultivationExp: 50, mind: 100, workSeconds: 300, kpiProgress: { MERGE_COUNT: 3 } }, new FixedRandomProvider(0.5));
  const pass = ok.context.promotion.promote('PPT');
  assert.equal(pass.success, true);
  assert.equal(ok.player.careerLevel, 2);
  assert.equal(ok.player.officeLevel, 1, 'careers 1-2 share office level 1');

  const fail = makeContext({ careerLevel: 1, cultivationExp: 50, mind: 100, workSeconds: 300, kpiProgress: { MERGE_COUNT: 3 } }, new FixedRandomProvider(0.9));
  const result = fail.context.promotion.promote('PPT');
  assert.equal(result.success, false);
  assert.equal(fail.player.careerLevel, 1);
  assert.equal(fail.player.mind, 90, 'failure costs 10 mind');
  assert.equal(fail.player.promotionFailCount, 1);
}

function testPromotionOfficeAdvancesOnLevelThree(): void {
  const { context, player } = makeContext({ careerLevel: 2, cultivationExp: 120, mind: 100, workSeconds: 600, kpiProgress: { MERGE_COUNT: 5 } }, new FixedRandomProvider(0.5));
  assert.equal(context.promotion.canPromote().allowed, true);
  context.promotion.promote('DATA');
  assert.equal(player.careerLevel, 3);
  assert.equal(player.officeLevel, 2, 'careers 3-4 map to office level 2');
}

function testPromotionSaveFailureRollsBack(): void {
  const throwingStorage: StorageAdapter = {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => undefined,
  };
  const player = new PlayerData({ careerLevel: 1, cultivationExp: 50, mind: 100, workSeconds: 300, kpiProgress: { MERGE_COUNT: 3 } });
  const context = new GameContext({ player, storage: throwingStorage, randomProvider: new FixedRandomProvider(0.5) });
  assert.throws(() => context.promotion.promote('PPT'), /quota exceeded/);
  assert.equal(player.careerLevel, 1);
  assert.equal(player.cultivationExp, 50);
  assert.equal(player.performance, 0);
  assert.equal(player.mind, 100);
  assert.deepEqual(player.kpiProgress, { MERGE_COUNT: 3 });
}

// ---------------------------------------------------------------------------
// 9. Office: pure derivation from career level, mirror sync
// ---------------------------------------------------------------------------
function testOfficeDerivation(): void {
  const { context } = makeContext();
  const expected: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 5 };
  for (const level of Object.keys(expected).map(Number)) {
    assert.equal(context.office.officeLevelForCareer(level), expected[level], `career ${level}`);
  }
}

function testOfficeSyncMirrorsCareer(): void {
  const { context, player } = makeContext({ careerLevel: 1 });
  assert.equal(player.officeLevel, 1);
  player.careerLevel = 6;
  context.office.syncToCareer();
  assert.equal(player.officeLevel, 3);
}

// ---------------------------------------------------------------------------
// 10. Offline reward: normal (1x), double (2x), mutual exclusion, rollback
// ---------------------------------------------------------------------------
function makeOfflineContext(): { context: GameContext; player: PlayerData; clock: FakeClock } {
  const { context, player, clock } = makeContext({ salary: 0, cultivationExp: 0, lastSaveTime: 1_000 });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  clock.set(1_000 + 3600 * 1000); // 1h elapsed -> base 10 salary / 5 cultivation
  return { context, player, clock };
}

function testOfflineNormalGrantsOnce(): void {
  const { context, player } = makeOfflineContext();
  const result = context.offline.claimNormal('sid-1');
  assert.equal(result.salary, 10);
  assert.equal(player.salary, 10);
  assert.throws(() => context.offline.claimNormal('sid-1'), /already claimed/);
  assert.equal(player.salary, 10, 'no double grant on reopen');
}

function testOfflineDoubleGrantsTwoXAndBlocksNormal(): void {
  const { context, player } = makeOfflineContext();
  let granted = false;
  context.offline.claimDouble('sid-1', (ok) => { granted = ok; });
  assert.equal(granted, true);
  assert.equal(player.salary, 20, 'double = 2x base, never re-runs IdleService');
  assert.equal(player.cultivationExp, 10);
  assert.equal(player.lastIdleSettlementId, 'sid-1');
  assert.throws(() => context.offline.claimNormal('sid-1'), /already claimed/);
}

function testOfflineDoubleAndNormalMutuallyExclusive(): void {
  const a = makeOfflineContext();
  a.context.offline.claimNormal('sid-1');
  let result = true;
  a.context.offline.claimDouble('sid-1', (ok) => { result = ok; });
  assert.equal(result, false, 'double blocked after normal with same id');
  assert.equal(a.player.salary, 10, 'still the 1x normal reward only');

  const b = makeOfflineContext();
  let granted = false;
  b.context.offline.claimDouble('sid-1', (ok) => { granted = ok; });
  assert.equal(granted, true);
  assert.throws(() => b.context.offline.claimNormal('sid-1'), /already claimed/);
}

function testOfflineDoubleDuplicateCallbackIgnored(): void {
  const { context } = makeOfflineContext();
  let calls = 0;
  class DoubleCallbackProvider extends MockRewardProvider {
    public requestReward(_type: 'MIND_RECOVERY' | 'OFFLINE_DOUBLE' | 'PROMOTION_RETRY', onComplete: (granted: boolean) => void): void {
      onComplete(true);
      onComplete(true);
    }
  }
  const ctx = new GameContext({ player: context.player, storage: new MemoryStorageAdapter(), clock: new FakeClock(1_000 + 3600 * 1000), rewardProvider: new DoubleCallbackProvider() });
  ctx.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  ctx.offline.claimDouble('sid-1', () => { calls += 1; });
  assert.equal(calls, 1, 'only one callback despite duplicate provider invocation');
}

function testOfflineDoubleSaveFailureRollsBack(): void {
  const throwingStorage: StorageAdapter = {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => undefined,
  };
  const player = new PlayerData({ salary: 0, cultivationExp: 0, lastSaveTime: 1_000 });
  const context = new GameContext({ player, storage: throwingStorage, clock: new FakeClock(1_000 + 3600 * 1000), rewardProvider: new MockRewardProvider() });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  assert.throws(() => context.offline.claimDouble('sid-1', () => undefined), /quota exceeded/);
  assert.equal(player.salary, 0, 'salary rolled back on save failure');
  assert.equal(player.cultivationExp, 0);
  assert.equal(player.lastIdleSettlementId, null);
}

// ---------------------------------------------------------------------------
// 11. Light stress: 200 iterations of event + kpi + mind, invariants hold
// ---------------------------------------------------------------------------
function testStressInvariantsHold(): void {
  const rng = new SequenceRandomProvider([0.1, 0.4, 0.7, 0.9, 0.2, 0.55, 0.83, 0.05, 0.66, 0.33]);
  const { context, player, clock } = makeContext({ careerLevel: 1, cultivationExp: 50, mind: 100, workSeconds: 300, kpiProgress: { MERGE_COUNT: 3 } }, rng);
  const office = context.office;
  for (let i = 0; i < 200; i += 1) {
    clock.advance(10 * 60 * 1000);
    const event = context.careerEvents.poll();
    if (event) {
      if (event.choices && event.choices.length > 0) context.careerEvents.choose(event.id, event.choices[0].id);
      else context.careerEvents.resolve(event.id);
    }
    context.kpi.recordMerge();
    context.mind.applyDelta(i % 2 === 0 ? -1 : 1);
    // Invariants must hold every iteration.
    assert.ok(player.careerLevel >= 1 && player.careerLevel <= 10, `careerLevel in range at ${i}`);
    assert.ok(player.mind >= 0 && player.mind <= player.maxMind, `mind in range at ${i}`);
    assert.ok(player.salary >= 0 && Number.isInteger(player.salary), `salary valid at ${i}`);
    assert.ok(player.cultivationExp >= 0, `cultivation valid at ${i}`);
    assert.equal(player.officeLevel, office.officeLevelForCareer(player.careerLevel), `office mirrors career at ${i}`);
  }
}

testSaveMigrationFillsMissingFields();
testSaveMigrationHandlesCorruptedJson();
testSaveMigrationRejectsFutureVersion();
testSaveRoundTripPreservesPhaseTwoFields();
testIdleBoundariesZeroEightHourCap();
testMindClampsAtBoundsAndThrowsOnBadInput();
testSectHasFourDistinctModifiers();
testSectChoicePersistsAndBlocksSecondChoice();
testTalentFixedRngThreeChoices();
testTalentReloadKeepsSameChoices();
testTalentChoosePersistsAndRejectsOutOfPool();
testCareerEventsConfigShape();
testCareerEventResolveTwiceThrows();
testCareerEventWrongIdRejected();
testKpiMaxLevelNotCompleted();
testKpiCompletionAndSwitchReset();
testPromotionReasons();
testPromotionSuccessAndFailure();
testPromotionOfficeAdvancesOnLevelThree();
testPromotionSaveFailureRollsBack();
testOfficeDerivation();
testOfficeSyncMirrorsCareer();
testOfflineNormalGrantsOnce();
testOfflineDoubleGrantsTwoXAndBlocksNormal();
testOfflineDoubleAndNormalMutuallyExclusive();
testOfflineDoubleDuplicateCallbackIgnored();
testOfflineDoubleSaveFailureRollsBack();
testStressInvariantsHold();
console.log('phase 2 stability and regression tests passed');
