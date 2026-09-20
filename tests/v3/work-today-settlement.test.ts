import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

function testDailySettlementShowsFreeOvertimeSeparately(): void {
  const clock = new FakeClock(new Date(2026, 8, 21, 18, 0, 0, 0).getTime());
  const context = new GameContext({ clock, board: null, storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }) });
  const day = context.gameDay.ensureStarted();
  context.player.gameDay = { ...day, durations: { ...day.durations, work: 8 * 3600, overtime: 2 * 3600 }, overtimeFree: true };
  const view = context.daySettlement.settle();
  assert.equal(view.durations.overtime, 2 * 3600);
  assert.equal(view.freeOvertimeSeconds, 2 * 3600);
  assert.equal(view.statusText, '工资已经下班了，你还没有。');
}

testDailySettlementShowsFreeOvertimeSeparately();
console.log('work today settlement tests passed');
