import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

function testFacadeExposesReadOnlyWorkTodayProjection(): void {
  const clock = new FakeClock(new Date(2026, 8, 21, 17, 55, 0, 0).getTime());
  const facade = new GameFacade({ clock, storage: new MemoryStorageAdapter() });
  facade.context.gameDay.ensureStarted();
  const first = facade.queryWorkToday();
  assert.equal(first.countdownMs, 5 * 60_000);
  const mutable = first.durations as Record<string, number>;
  mutable.work = 999;
  assert.notEqual(facade.queryWorkToday().durations.work, 999);
}

testFacadeExposesReadOnlyWorkTodayProjection();
console.log('work today facade tests passed');
