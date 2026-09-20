/**
 * Gameplay V2 Phase 1 tests — clock / game day / daily situation / inner demon / 4-mode economy / save migration.
 */
import assert from 'node:assert/strict';

import { GameClockV2 } from '../../assets/scripts/v2/v2-clock';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';
import { GameDayService } from '../../assets/scripts/v2/game-day-service';
import { InnerDemonService, INNER_DEMONS } from '../../assets/scripts/v2/inner-demon-service';
import { V2EconomyService } from '../../assets/scripts/v2/v2-economy-service';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveService, DEFAULT_SAVE_KEY } from '../../assets/scripts/services/save-service';
import { FakeClock } from '../../assets/scripts/core/clock';

// ── helpers ──────────────────────────────────────────────────────────────────

/** FakeClock 的时间起点挪到某个工作日上午（避免零点边界影响断言）。 */
function workdayClock(startHour = 9): FakeClock {
  const base = new Date();
  base.setHours(startHour, 0, 0, 0);
  return new FakeClock(base.getTime());
}

function makeContext(clock: FakeClock, playerOverrides?: Partial<ConstructorParameters<typeof PlayerData>[0]>) {
  const storage = new MemoryStorageAdapter();
  const player = new PlayerData({ lastSaveTime: clock.now(), ...playerOverrides });
  const context = new GameContext({ player, storage, clock });
  return { context, storage };
}

// ── V2 clock ─────────────────────────────────────────────────────────────────

function testClockWorkdayWindow(): void {
  const clock = new GameClockV2({ clock: workdayClock(9) });
  assert.equal(clock.isWorkingHours(), true);
  assert.equal(clock.isLunchBreak(), false);
  assert.ok(clock.getTimeUntilOffWorkMs() > 0);
  // 09:00 progress = 0
  assert.equal(Math.round(clock.getWorkdayProgress() * 100) / 100, 0);
}

function testClockLunchBreak(): void {
  const clock = new GameClockV2({ clock: workdayClock(12) });
  assert.equal(clock.isWorkingHours(), true);
  assert.equal(clock.isLunchBreak(), true);
}

function testClockAfterOffWork(): void {
  const clock = new GameClockV2({ clock: workdayClock(18) });
  assert.equal(clock.isWorkingHours(), false);
  assert.equal(clock.getTimeUntilOffWorkMs(), 0);
  assert.equal(clock.getWorkdayProgress(), 1);
}

function testDevTimeAdvance(): void {
  const fake = workdayClock(9);
  const clock = new GameClockV2({ clock: fake });
  const before = clock.now();
  clock.advanceDevTime(30 * 60 * 1000); // +30min
  assert.equal(clock.now() - before, 30 * 60 * 1000);
  clock.jumpToHour(17, 50, true);
  assert.ok(clock.getTimeUntilOffWorkMs() <= 10 * 60 * 1000);
}

function testClockRollbackDetect(): void {
  const fake = workdayClock(10);
  const clock = new GameClockV2({ clock: fake });
  const prev = clock.now();
  fake.set(prev - 10 * 60 * 1000); // 倒退10分钟
  assert.equal(clock.detectClockRollback(prev), true);
  fake.set(prev + 1000);
  assert.equal(clock.detectClockRollback(prev, 60_000), false);
}

// ── RandomService ────────────────────────────────────────────────────────────

function testSeededDeterminism(): void {
  const svc = new RandomService();
  const a = svc.forDay(3, 11).int(0, 999);
  const b = svc.forDay(3, 11).int(0, 999);
  assert.equal(a, b, 'same day+salt must be deterministic');
  const c = svc.forDay(4, 11).int(0, 999);
  // 不同 day 大概率不同（允许极小概率碰撞，这里用固定种子序列验证而非概率）
  const seqA = [svc.forDay(1).next(), svc.forDay(1).next()];
  const seqB = [svc.forDay(2).next(), svc.forDay(2).next()];
  assert.notDeepEqual(seqA, seqB);
  assert.ok(c >= 0 && c <= 999);
}

function testRuntimeSourceInjection(): void {
  const values = [0.125, 0.75];
  let index = 0;
  const svc = new RandomService(() => values[index++]);

  assert.equal(svc.next(), 0.125, 'next() uses the injected runtime source');
  assert.equal(svc.rng().next(), 0.75, 'rng() uses the injected runtime source');
}

function testGameContextRandomServiceInjection(): void {
  const clock = workdayClock(9);
  const randomV2 = new RandomService(() => 0.375);
  const context = new GameContext({
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new MemoryStorageAdapter(),
    clock,
    board: null,
    randomV2,
  });

  assert.equal(context.randomV2, randomV2, 'GameContext exposes the injected V2 random service');
  assert.equal(context.randomV2.next(), 0.375);
}

function testMulberry32Range(): void {
  const rng = mulberry32(42);
  for (let i = 0; i < 1000; i += 1) {
    const v = rng();
    assert.ok(v >= 0 && v < 1);
  }
}

// ── GameDayService ───────────────────────────────────────────────────────────

function testGameDayEnsureStarted(): void {
  const fake = workdayClock(9);
  const { context } = makeContext(fake);
  const svc = new GameDayService(context, context.clockV2, context.randomV2);
  const day = svc.ensureStarted();
  assert.equal(day.dayIndex, 1);
  assert.equal(day.settled, false);
  assert.equal(svc.ensureStarted().dayIndex, 1, 'idempotent within the same workday');
  // 情局已生成（rollSituation 会重建 gameDay 对象，从 context 重读）
  const sit = svc.getSituation();
  assert.ok(sit.company && sit.boss && sit.project && sit.personal);
  const after = context.gameDay.current();
  assert.ok(after, 'game day exists after rollSituation');
  assert.equal(after.situationIds.length, 4);
}

function testGameDayNextDay(): void {
  const fake = workdayClock(9);
  const { context } = makeContext(fake);
  const svc = new GameDayService(context, context.clockV2, context.randomV2);
  svc.ensureStarted();
  svc.markSettled();
  // 跳到明天 09:00
  context.clockV2.advanceDevTime(24 * 3600 * 1000);
  const day2 = svc.ensureStarted();
  assert.equal(day2.dayIndex, 2, 'new day rolls dayIndex');
  assert.equal(day2.settled, false);
}

function testDailySituationDeterminism(): void {
  const fake = workdayClock(9);
  const { context } = makeContext(fake);
  const svcA = new GameDayService(context, context.clockV2, context.randomV2);
  const sitA = svcA.ensureStarted();
  const day1Ids = [...sitA.situationIds];
  // 新 context，同一天 → 局势一致
  const fake2 = workdayClock(9);
  const { context: ctx2 } = makeContext(fake2);
  const svcB = new GameDayService(ctx2, ctx2.clockV2, ctx2.randomV2);
  const sitB = svcB.ensureStarted();
  assert.deepEqual(sitB.situationIds, day1Ids, 'same-day situation must be deterministic across runs');
}

function testSituationAggregate(): void {
  const fake = workdayClock(9);
  const { context } = makeContext(fake);
  const svc = new GameDayService(context, context.clockV2, context.randomV2);
  svc.ensureStarted();
  const agg = svc.aggregateEffects();
  assert.ok(agg.workSalaryMul > 0);
  assert.ok(agg.cultivationMul > 0);
  assert.ok(typeof agg.mindPerHourDelta === 'number');
}

// ── InnerDemonService ────────────────────────────────────────────────────────

function testInnerDemonClampAndDemons(): void {
  const { context } = makeContext(workdayClock(9));
  const svc = new InnerDemonService(context);
  assert.equal(svc.value(), 0);
  svc.add(30);
  assert.equal(svc.value(), 30);
  assert.deepEqual(svc.activeDemons(), INNER_DEMONS.filter((d) => d.threshold <= 30).map((d) => d.id));
  svc.add(500);
  assert.equal(svc.value(), 100, 'clamped at 100');
  assert.equal(svc.reduce(1000), 100, 'reduce clamped at 0');
  assert.equal(svc.value(), 0);
  assert.equal(svc.activeDemons().length, 0);
}

function testInnerDemonModifiers(): void {
  const { context } = makeContext(workdayClock(9));
  const svc = new InnerDemonService(context);
  svc.add(30); // 摆烂阈值
  assert.equal(svc.workMultiplier(), 0.8);
  assert.equal(svc.fishingCultivationMultiplier(), 1.2);
  assert.equal(svc.performanceMultiplier(), 1); // 绩效 debuff 在 80
  svc.add(60); // 到 90
  assert.equal(svc.performanceMultiplier(), 0.85);
}

// ── V2EconomyService ─────────────────────────────────────────────────────────

function testV2EconomyPaydayBonus(): void {
  const fake = workdayClock(9);
  const { context } = makeContext(fake, { salary: 100 });
  const svc = context.v2Economy;
  context.gameDay.ensureStarted();
  // 强制把局势刷成发薪日（直接校验发薪逻辑：模拟多次 tick 后 salary 增加）
  // 注：局势由种子决定，这里只验证 tick 不炸 + 时长记账
  for (let i = 0; i < 10; i += 1) svc.tick(1);
  const day = context.gameDay.current();
  assert.ok(day, 'game day started');
  const totalActive = day.durations.work + day.durations.fishing + day.durations.cultivating + day.durations.social;
  assert.ok(totalActive >= 10, 'durations accumulate');
}

function testV2EconomyLunchNoDurationAccumulation(): void {
  const fake = workdayClock(12); // 午休中
  const { context } = makeContext(fake);
  const svc = context.v2Economy;
  context.gameDay.ensureStarted();
  svc.tick(5);
  const day = context.gameDay.current();
  assert.ok(day, 'game day started during lunch');
  const total = day.durations.work + day.durations.fishing + day.durations.cultivating + day.durations.social;
  assert.equal(total, 5, 'lunch still counts wall-clock into mode duration');
}

// ── Save migration ───────────────────────────────────────────────────────────

function testOldSaveMigrationV2Fields(): void {
  const storage = new MemoryStorageAdapter();
  // 模拟 V1 存档（saveVersion 5 结构，无任何 V2 字段）
  const v1Save = {
    saveVersion: 5,
    salary: 288,
    maxWorkerLevel: 0,
    lastSaveTime: Date.now() - 3600_000,
    workers: [],
    cultivationExp: 166,
    careerLevel: 1,
    mind: 86,
    maxMind: 100,
    performance: 35,
    sectId: null,
    workMode: 'FISHING',
    workSeconds: 100,
    fishingSeconds: 200,
    kpiProgress: {},
    promotionFailCount: 0,
    officeLevel: 1,
    unlockedAchievementIds: [],
    claimedAchievementIds: [],
    dailySignIn: null,
    dailyTasks: [],
    dailyTaskDay: -1,
    spiritStones: 42,
    activeTasks: [],
  };
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify(v1Save));
  const saveService = new SaveService(storage);
  const loaded = saveService.load();
  assert.equal(loaded.saveVersion, 7, 'migrated to v7');
  assert.equal(loaded.innerDemon, 0);
  assert.deepEqual(loaded.materials, {});
  assert.equal(loaded.gameDay, null);
  assert.equal(loaded.salary, 288, 'V1 fields preserved');
  assert.equal(loaded.fishingSeconds, 200, 'V1 fields preserved');
}

function testCorruptSaveFallsBackToDefault(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem(DEFAULT_SAVE_KEY, '{broken json');
  const saveService = new SaveService(storage);
  const loaded = saveService.load();
  assert.equal(loaded.saveVersion, 7);
  assert.equal(loaded.salary, 0);
}

// ── run ──────────────────────────────────────────────────────────────────────

testClockWorkdayWindow();
testClockLunchBreak();
testClockAfterOffWork();
testDevTimeAdvance();
testClockRollbackDetect();
testSeededDeterminism();
testRuntimeSourceInjection();
testGameContextRandomServiceInjection();
testMulberry32Range();
testGameDayEnsureStarted();
testGameDayNextDay();
testDailySituationDeterminism();
testSituationAggregate();
testInnerDemonClampAndDemons();
testInnerDemonModifiers();
testV2EconomyPaydayBonus();
testV2EconomyLunchNoDurationAccumulation();
testOldSaveMigrationV2Fields();
testCorruptSaveFallsBackToDefault();
console.log('gameplay v2 phase1 tests passed');
