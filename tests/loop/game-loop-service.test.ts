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

testTickBeforeStartDoesNothing();
testSixtySecondsWorkDrainsMindAndCountsWorkTime();
testSixtySecondsFishingRecoversMindAndCountsFishTime();
testTickIsFrameRateIndependent();
testPendingEventBlocksASecondEvent();
testStopPreventsFurtherTicks();
testKpiSalaryEarnedIsTrackedFromWorkTick();
testAutoSaveFiresPeriodically();
testAutoSaveDisabledWhenZero();
console.log('game loop service tests passed');