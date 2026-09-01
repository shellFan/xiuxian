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

testTickBeforeStartDoesNothing();
testSixtySecondsWorkDrainsMindAndCountsWorkTime();
testSixtySecondsFishingRecoversMindAndCountsFishTime();
testTickIsFrameRateIndependent();
testPendingEventBlocksASecondEvent();
testStopPreventsFurtherTicks();
console.log('game loop service tests passed');
