import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

test('work-task completion follows the authoritative game clock', () => {
  const wallClock = new FakeClock(Date.parse('2026-10-20T09:00:00+08:00'));
  const facade = new GameFacade({
    clock: wallClock,
    careerEventClock: wallClock,
    storage: new MemoryStorageAdapter(),
    board: null,
    player: new PlayerData({ lastSaveTime: wallClock.now(), workMode: 'WORK' }),
  });

  try {
    const started = facade.startTask('work_review');
    assert.equal(started.success, true);
    assert.equal(facade.queryTaskRemaining('work_review'), 30 * 60);

    facade.devAdvanceTime(30 * 60 * 1000);
    facade.tickTasks();

    assert.equal(facade.queryActiveTasks()[0].completed, true);
    assert.equal(facade.queryTaskRemaining('work_review'), 0);
  } finally {
    facade.destroy();
  }
});
