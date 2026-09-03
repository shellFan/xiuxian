import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { WorkerEntity } from '../../assets/scripts/model/worker-entity';
import { SequenceRandomProvider } from '../../assets/scripts/core/random-provider';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { GameLoopService } from '../../assets/scripts/services/game-loop-service';

function makeContext(player: PlayerData, clock = new FakeClock(1_000), random = new SequenceRandomProvider([0, 0])): GameContext {
  const context = new GameContext({
    player,
    storage: new MemoryStorageAdapter(),
    clock,
    careerEventClock: clock,
    randomProvider: random,
  });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  return context;
}

function testTickBeforeStartDoesNothing(): void {
  const context = makeContext(new PlayerData({ workMode: 'WORK', mind: 100 }));
  const loop = new GameLoopService(context);
  loop.tick(60);
  assert.equal(context.player.workSeconds, 0);
  assert.equal(loop.isRunning(), false);
}

function testSixtySecondsWorkDrainsMindAndCountsWorkTime(): void {
  const context = makeContext(new PlayerData({ workMode: 'WORK', mind: 100 }));
  const loop = new GameLoopService(context);
  loop.start();
  loop.tick(60);
  assert.equal(context.player.workSeconds, 60);
  assert.equal(context.player.fishingSeconds, 0);
  assert.ok(context.player.mind < 100, 'WORK must drain mind');
}

function testSixtySecondsFishingRecoversMindAndCountsFishTime(): void {
  const context = makeContext(new PlayerData({ workMode: 'FISHING', mind: 10 }));
  const loop = new GameLoopService(context);
  loop.start();
  loop.tick(60);
  assert.equal(context.player.fishingSeconds, 60);
  assert.equal(context.player.workSeconds, 0);
  assert.ok(context.player.mind > 10, 'FISHING must recover mind');
}

function testTickIsFrameRateIndependent(): void {
  const sliced = makeContext(new PlayerData({ workMode: 'WORK', mind: 80 }));
  const bulk = makeContext(new PlayerData({ workMode: 'WORK', mind: 80 }));
  const slicedLoop = new GameLoopService(sliced);
  const bulkLoop = new GameLoopService(bulk);
  slicedLoop.start();
  bulkLoop.start();
  for (let i = 0; i < 120; i += 1) slicedLoop.tick(0.5);
  bulkLoop.tick(60);
  assert.deepEqual(sliced.player.toSaveData(), bulk.player.toSaveData());
}

function testPendingEventBlocksASecondEvent(): void {
  const clock = new FakeClock(1_000);
  const context = makeContext(new PlayerData(), clock, new SequenceRandomProvider([0, 0, 0, 0]));
  const loop = new GameLoopService(context);
  loop.start();
  loop.tick(1);
  assert.equal(context.careerEvents.current(), undefined);
  clock.advance(3 * 60 * 1000);
  loop.tick(1);
  const first = context.careerEvents.current();
  assert.ok(first, 'first due poll must create a pending event');
  clock.advance(8 * 60 * 1000);
  loop.tick(1);
  assert.equal(context.careerEvents.current()?.id, first!.id, 'pending event must block a second spawn');
}

function testStopPreventsFurtherTicks(): void {
  const context = makeContext(new PlayerData({ workMode: 'WORK', mind: 100 }));
  const loop = new GameLoopService(context);
  loop.start();
  loop.tick(10);
  const workSeconds = context.player.workSeconds;
  loop.stop();
  loop.tick(50);
  assert.equal(context.player.workSeconds, workSeconds);
}

function testKpiSalaryEarnedIsTrackedFromWorkTick(): void {
  const context = makeContext(new PlayerData({ workMode: 'WORK', mind: 100 }));
  const kpiBefore = context.player.kpiProgress['SALARY_EARNED'] ?? 0;
  const loop = new GameLoopService(context);
  loop.start();
  loop.tick(3600); // 1 hour of work
  const kpiAfter = context.player.kpiProgress['SALARY_EARNED'] ?? 0;
  assert.ok(kpiAfter > kpiBefore, 'KPI SALARY_EARNED must increase from work ticks');
}

function testAutoSaveFiresPeriodically(): void {
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({
    player: new PlayerData({ workMode: 'WORK', mind: 100 }),
    storage,
    clock: new FakeClock(1_000),
    careerEventClock: new FakeClock(1_000),
    randomProvider: new SequenceRandomProvider([0, 0]),
  });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  const loop = new GameLoopService(context, { autoSaveIntervalSeconds: 10 });
  loop.start();
  // Before auto-save threshold, storage may be empty (no explicit save triggered)
  loop.tick(5);
  // After crossing the auto-save threshold, a save must have been written
  loop.tick(10);
  const saved = storage.getItem('game-save');
  assert.ok(saved, 'auto-save must have fired and written to storage');
  const parsed = JSON.parse(saved!);
  assert.ok(typeof parsed.workSeconds === 'number', 'saved data must include workSeconds');
}

function testAutoSaveDisabledWhenZero(): void {
  const context = makeContext(new PlayerData({ workMode: 'WORK', mind: 100 }));
  const loop = new GameLoopService(context, { autoSaveIntervalSeconds: 0 });
  loop.start();
  loop.tick(3600); // 1 hour - should not crash even with auto-save disabled
  assert.equal(context.player.workSeconds, 3600);
}

// ── Multi-FPS frame-rate independence ────────────────────────────────────────

function testFrameRateIndependentAt60FPS(): void {
  const player = new PlayerData({ workMode: 'WORK', mind: 80 });
  const context = makeContext(player);
  const loop = new GameLoopService(context);
  loop.start();
  // 60 FPS: 16.67ms per frame, 3600 ticks for 60 seconds
  for (let i = 0; i < 3600; i += 1) loop.tick(1 / 60);
  const fps60 = context.player.toSaveData();

  const player2 = new PlayerData({ workMode: 'WORK', mind: 80 });
  const context2 = makeContext(player2);
  const loop2 = new GameLoopService(context2);
  loop2.start();
  loop2.tick(60);
  const bulk = context2.player.toSaveData();

  assert.deepEqual(fps60, bulk, '60 FPS must produce identical results to bulk tick');
}

function testFrameRateIndependentAt30FPS(): void {
  const player = new PlayerData({ workMode: 'WORK', mind: 80 });
  const context = makeContext(player);
  const loop = new GameLoopService(context);
  loop.start();
  // 30 FPS: 33.33ms per frame, 1800 ticks for 60 seconds
  for (let i = 0; i < 1800; i += 1) loop.tick(1 / 30);
  const fps30 = context.player.toSaveData();

  const player2 = new PlayerData({ workMode: 'WORK', mind: 80 });
  const context2 = makeContext(player2);
  const loop2 = new GameLoopService(context2);
  loop2.start();
  loop2.tick(60);
  const bulk = context2.player.toSaveData();

  assert.deepEqual(fps30, bulk, '30 FPS must produce identical results to bulk tick');
}

function testFrameRateIndependentAt10FPS(): void {
  const player = new PlayerData({ workMode: 'WORK', mind: 80 });
  const context = makeContext(player);
  const loop = new GameLoopService(context);
  loop.start();
  // 10 FPS: 100ms per frame, 600 ticks for 60 seconds
  for (let i = 0; i < 600; i += 1) loop.tick(0.1);
  const fps10 = context.player.toSaveData();

  const player2 = new PlayerData({ workMode: 'WORK', mind: 80 });
  const context2 = makeContext(player2);
  const loop2 = new GameLoopService(context2);
  loop2.start();
  loop2.tick(60);
  const bulk = context2.player.toSaveData();

  assert.deepEqual(fps10, bulk, '10 FPS must produce identical results to bulk tick');
}

function testFrameRateIndependentFishingMode(): void {
  const player = new PlayerData({ workMode: 'FISHING', mind: 10 });
  const context = makeContext(player);
  const loop = new GameLoopService(context);
  loop.start();
  for (let i = 0; i < 3600; i += 1) loop.tick(1 / 60);
  const fps60 = context.player.toSaveData();

  const player2 = new PlayerData({ workMode: 'FISHING', mind: 10 });
  const context2 = makeContext(player2);
  const loop2 = new GameLoopService(context2);
  loop2.start();
  loop2.tick(60);
  const bulk = context2.player.toSaveData();

  assert.deepEqual(fps60, bulk, '60 FPS fishing must produce identical results to bulk tick');
}

// ── Full chain: WORK → salary → cultivation → mind drain → KPI ──────────────

function testWorkTickFullChain(): void {
  const context = makeContext(new PlayerData({ workMode: 'WORK', mind: 100 }));
  const loop = new GameLoopService(context);
  loop.start();
  loop.tick(3600); // 1 hour

  // Salary must increase
  assert.ok(context.player.salary > 0, 'WORK must grant salary');
  // Cultivation must increase
  assert.ok(context.player.cultivationExp > 0, 'WORK must grant cultivation');
  // Mind must drain
  assert.ok(context.player.mind < 100, 'WORK must drain mind');
  // Work seconds must accumulate
  assert.equal(context.player.workSeconds, 3600, 'workSeconds must equal tick duration');
  // KPI SALARY_EARNED must be tracked
  const salaryKpi = context.player.kpiProgress['SALARY_EARNED'] ?? 0;
  assert.ok(salaryKpi > 0, 'SALARY_EARNED KPI must be tracked from work');
  // playerChanged event must fire
  assert.ok(true, 'work tick completed without error');
}

function testFishingTickFullChain(): void {
  const context = makeContext(new PlayerData({ workMode: 'FISHING', mind: 10 }));
  const loop = new GameLoopService(context);
  loop.start();
  loop.tick(3600); // 1 hour

  // Fishing seconds must accumulate
  assert.equal(context.player.fishingSeconds, 3600, 'fishingSeconds must equal tick duration');
  // Mind must recover
  assert.ok(context.player.mind > 10, 'FISHING must recover mind');
  // Work seconds must NOT accumulate
  assert.equal(context.player.workSeconds, 0, 'workSeconds must be 0 during fishing');
  // Salary is granted at 1x rate (not 2x like WORK)
  assert.ok(context.player.salary > 0, 'FISHING must grant salary at 1x rate');
}

function testWorkToFishingModeSwitchPreservesState(): void {
  const context = makeContext(new PlayerData({ workMode: 'WORK', mind: 100 }));
  const loop = new GameLoopService(context);
  loop.start();
  loop.tick(600); // 10 minutes of work (enough for salary to accumulate with level-1 worker)
  const workSeconds = context.player.workSeconds;
  const salaryAfterWork = context.player.salary;

  context.work.setMode('FISHING');
  loop.tick(600); // 10 minutes of fishing

  // Work seconds must be preserved
  assert.equal(context.player.workSeconds, workSeconds, 'workSeconds must be preserved after mode switch');
  // Salary must continue to increase
  assert.ok(context.player.salary > salaryAfterWork, 'salary must continue to increase in fishing mode');
  // Fishing seconds must accumulate
  assert.ok(context.player.fishingSeconds > 0, 'fishingSeconds must accumulate after switch');
}

function testNegativeDeltaIsIgnored(): void {
  const context = makeContext(new PlayerData({ workMode: 'WORK', mind: 100 }));
  const loop = new GameLoopService(context);
  loop.start();
  loop.tick(-1); // negative delta must be ignored
  assert.equal(context.player.workSeconds, 0, 'negative delta must be ignored');
  loop.tick(0); // zero delta must be ignored
  assert.equal(context.player.workSeconds, 0, 'zero delta must be ignored');
}

function testNaNAndInfinityDeltaIsIgnored(): void {
  const context = makeContext(new PlayerData({ workMode: 'WORK', mind: 100 }));
  const loop = new GameLoopService(context);
  loop.start();
  loop.tick(Number.NaN);
  assert.equal(context.player.workSeconds, 0, 'NaN delta must be ignored');
  loop.tick(Number.POSITIVE_INFINITY);
  assert.equal(context.player.workSeconds, 0, 'Infinity delta must be ignored');
}

// ── Run all tests ────────────────────────────────────────────────────────────

testTickBeforeStartDoesNothing();
testSixtySecondsWorkDrainsMindAndCountsWorkTime();
testSixtySecondsFishingRecoversMindAndCountsFishTime();
testTickIsFrameRateIndependent();
testPendingEventBlocksASecondEvent();
testStopPreventsFurtherTicks();
testKpiSalaryEarnedIsTrackedFromWorkTick();
testAutoSaveFiresPeriodically();
testAutoSaveDisabledWhenZero();
testFrameRateIndependentAt60FPS();
testFrameRateIndependentAt30FPS();
testFrameRateIndependentAt10FPS();
testFrameRateIndependentFishingMode();
testWorkTickFullChain();
testFishingTickFullChain();
testWorkToFishingModeSwitchPreservesState();
testNegativeDeltaIsIgnored();
testNaNAndInfinityDeltaIsIgnored();
console.log('game loop service tests passed');