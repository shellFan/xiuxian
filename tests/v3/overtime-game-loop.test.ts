import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { GameLoopService } from '../../assets/scripts/services/game-loop-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

function at(hour: number): number {
  return new Date(2026, 8, 21, hour, 0, 0, 0).getTime();
}

function make(): { context: GameContext; loop: GameLoopService } {
  const clock = new FakeClock(at(18));
  const context = new GameContext({ board: null, clock, storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now(), workMode: 'WORK' }) });
  context.gameDay.ensureStarted();
  const loop = new GameLoopService(context, { autoSaveIntervalSeconds: 0 });
  loop.start();
  return { context, loop };
}

function testActiveOvertimeBlocksAutomaticSettlementAndTracksOnlyOvertime(): void {
  const { context, loop } = make();
  context.overtime.offer('REQUESTED', true, 3600);
  context.overtime.accept('WORK');
  loop.tick(60);
  assert.equal(context.player.salary, 0, 'free overtime must not use ordinary wage path');
  assert.equal(context.player.workSeconds, 0, 'after-hours work must not increment ordinary work time');
  assert.equal(context.player.gameDay?.durations.overtime, 60);
  assert.equal(context.player.gameDay?.settled, false);
}

function testNoOvertimeAllowsOffWorkSettlement(): void {
  const { context, loop } = make();
  loop.tick(1);
  assert.equal(context.player.gameDay?.settled, true);
}

testActiveOvertimeBlocksAutomaticSettlementAndTracksOnlyOvertime();
testNoOvertimeAllowsOffWorkSettlement();
console.log('overtime game loop tests passed');
