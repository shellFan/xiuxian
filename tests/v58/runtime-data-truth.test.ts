import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';

process.env.TZ = 'Asia/Shanghai';
const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');

function makeFacade(storage = new MemoryStorageAdapter()): { facade: GameFacade; clock: FakeClock; storage: MemoryStorageAdapter } {
  const clock = new FakeClock(MONDAY_0900);
  const facade = new GameFacade({
    clock, careerEventClock: clock, storage, board: null,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    randomV2: new RandomService(mulberry32(5810)), modeSwitchCooldownMs: 0,
  });
  return { facade, clock, storage };
}

function startWorking(facade: GameFacade): void {
  facade.gameLoop.start();
  facade.gameLoop.tick(1);
  facade.changeWorkMode('WORK');
}

/** The home read model must use the income ledger, never elapsed time × a UI rate. */
function testTodayEarnedAndRateAreCanonical(): void {
  const { facade, clock } = makeFacade();
  try {
    startWorking(facade);
    const fresh = facade.queryRuntimeData();
    assert.equal(fresh.todayEarned, 0, 'fresh worker has a legitimate zero ledger balance');
    assert.ok(Math.abs(fresh.incomeRate.perMinute * 60 - fresh.incomeRate.perHour) < 1e-9, 'minute/hour are one canonical rate');
    assert.ok(Math.abs(fresh.incomeRate.perSecond * 60 - fresh.incomeRate.perMinute) < 1e-9, 'second/minute are one canonical rate');

    clock.advance(10 * 60_000);
    facade.gameLoop.tick(600);
    const afterWork = facade.queryRuntimeData();
    assert.equal(afterWork.todayEarned, facade.queryGameDay()?.income.salary ?? 0, 'today earned is the persisted daily ledger');
    assert.ok(afterWork.todayEarned > 0, 'work changes the ledger');
  } finally { facade.destroy(); }
}

/** Life must be an explicit gameplay action, persisted across restart, and reset with the next game day. */
function testTodayLifePersistsAndResets(): void {
  const { facade, clock, storage } = makeFacade();
  try {
    startWorking(facade);
    assert.deepEqual(facade.queryRuntimeData().life, [], 'fresh life feed is honestly empty');
    assert.equal(facade.recordTodayLife('COFFEE').ok, true);
    assert.equal(facade.queryRuntimeData().life.find((entry) => entry.kind === 'COFFEE')?.count, 1);
    facade.save();

    const resumed = new GameFacade({ clock, careerEventClock: clock, storage, board: null, randomV2: new RandomService(mulberry32(5810)), modeSwitchCooldownMs: 0 });
    try {
      assert.equal(resumed.queryRuntimeData().life.find((entry) => entry.kind === 'COFFEE')?.count, 1, 'life action survives restart');
      clock.advance(24 * 60 * 60_000);
      resumed.context.gameDay.markSettled();
      resumed.context.gameDay.ensureStarted();
      assert.deepEqual(resumed.queryRuntimeData().life, [], 'life feed resets on a new day');
    } finally { resumed.destroy(); }
  } finally { facade.destroy(); }
}

/** Pending count and visible TODO must be projections of exactly the same canonical list. */
function testTodoCrossWidgetConsistency(): void {
  const { facade } = makeFacade();
  try {
    const assigned = facade.context.assignedTasks.assign({ title: '修复真实待办', priority: 'P1', source: 'TEST' });
    const snapshot = facade.queryRuntimeData();
    assert.equal(snapshot.todo.pendingCount, snapshot.todo.items.length, 'pending count matches the visible canonical list');
    assert.ok(snapshot.todo.items.some((entry) => entry.title === '修复真实待办'));
    facade.completeAssignedTask(assigned.id);
    assert.ok(facade.queryRuntimeData().activity.some((entry) => entry.text.includes('修复真实待办')), 'real task completion appears in today activity');
  } finally { facade.destroy(); }
}

testTodayEarnedAndRateAreCanonical();
testTodayLifePersistsAndResets();
testTodoCrossWidgetConsistency();
console.log('v58 runtime data truth regression passed');
