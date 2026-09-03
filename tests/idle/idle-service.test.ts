import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { IdleService } from '../../assets/scripts/services/idle-service';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { WorkerEntity } from '../../assets/scripts/model/worker-entity';
import { MemoryStorageAdapter, type StorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveService } from '../../assets/scripts/services/save-service';

function createContext(player = new PlayerData({ lastSaveTime: 1_000 })): { context: GameContext; clock: FakeClock; storage: MemoryStorageAdapter } {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(1_000);
  const context = new GameContext({ player, saveService: new SaveService(storage, 'game-save', clock), storage });
  return { context, clock, storage };
}

function testHourlyAndEightHourCap(): void {
  const { context, clock } = createContext();
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  const idle = new IdleService(context, { clock });

  clock.set(1_000 + 60 * 60 * 1_000);
  assert.deepEqual(idle.settle('one-hour'), { salary: 10, cultivationExp: 5, elapsedSeconds: 3600, capped: false, duplicate: false });
  clock.set(1_000 + 12 * 60 * 60 * 1_000);
  assert.deepEqual(idle.settle('twelve-hour'), { salary: 80, cultivationExp: 40, elapsedSeconds: 28800, capped: true, duplicate: false });
  assert.deepEqual(idle.settle('after-cap'), { salary: 0, cultivationExp: 0, elapsedSeconds: 0, capped: false, duplicate: false });

  const exact = createContext();
  exact.context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  const exactIdle = new IdleService(exact.context, { clock: exact.clock });
  exact.clock.set(1_000 + 8 * 60 * 60 * 1_000);
  assert.deepEqual(exactIdle.settle('eight-hour'), { salary: 80, cultivationExp: 40, elapsedSeconds: 28800, capped: false, duplicate: false });
}

function testZeroNegativeAndClockRollbackEmitAnomaly(): void {
  const { context, clock } = createContext();
  const idle = new IdleService(context, { clock });
  const anomalies: string[] = [];
  context.events.on('clockAnomaly' as never, (event) => anomalies.push((event as { code: string }).code));

  assert.equal(idle.settle('zero').salary, 0);
  clock.set(999);
  assert.equal(idle.settle('negative').salary, 0);
  assert.deepEqual(anomalies, ['CLOCK_ANOMALY', 'CLOCK_ANOMALY']);
  assert.equal(context.player.lastIdleSettlementId, null);
}

function testSettlementIdPreventsDuplicateGrant(): void {
  const { context, clock } = createContext();
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  const idle = new IdleService(context, { clock });
  clock.advance(3600 * 1000);
  assert.equal(idle.settle('same').salary, 10);
  assert.deepEqual(idle.settle('same'), { salary: 0, cultivationExp: 0, elapsedSeconds: 0, capped: false, duplicate: true });
  assert.equal(context.player.salary, 10);
}

function testFailedSaveRollsBackSettlement(): void {
  const clock = new FakeClock(1_000);
  const player = new PlayerData({ salary: 7, cultivationExp: 3, lastSaveTime: 1_000 });
  const storage: StorageAdapter = { getItem: () => null, setItem: () => { throw new Error('quota exceeded'); }, removeItem: () => undefined };
  const context = new GameContext({ player, saveService: new SaveService(storage, 'game-save', clock), storage });
  const idle = new IdleService(context, { clock });
  clock.advance(3600 * 1000);
  assert.throws(() => idle.settle('failed'), /quota exceeded/);
  assert.equal(player.salary, 7);
  assert.equal(player.cultivationExp, 3);
  assert.equal(player.lastIdleSettlementId, null);
  assert.equal(player.lastSaveTime, 1_000);
}

function testInfinityAndOverflowProtection(): void {
  // Infinity clock should trigger anomaly
  const clock = new FakeClock(Infinity);
  const player = new PlayerData({ lastSaveTime: 1_000 });
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ player, saveService: new SaveService(storage, 'game-save', clock), storage });
  const idle = new IdleService(context, { clock });
  assert.equal(idle.settle('infinity').salary, 0, 'Infinity clock should yield zero salary');
  assert.equal(idle.settle('infinity').cultivationExp, 0, 'Infinity clock should yield zero cultivation');

  // NaN clock should trigger anomaly
  const nanClock = new FakeClock(NaN);
  const nanPlayer = new PlayerData({ lastSaveTime: 1_000 });
  const nanStorage = new MemoryStorageAdapter();
  const nanContext = new GameContext({ player: nanPlayer, saveService: new SaveService(nanStorage, 'game-save', nanClock), storage: nanStorage });
  const nanIdle = new IdleService(nanContext, { clock: nanClock });
  assert.equal(nanIdle.settle('nan').salary, 0, 'NaN clock should yield zero salary');
}

function testPreviewDoesNotGrantRewards(): void {
  const { context, clock } = createContext();
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  const idle = new IdleService(context, { clock });
  clock.advance(3600 * 1000);
  const preview = idle.preview('preview-test');
  assert.equal(preview.salary, 10, 'preview should show salary');
  assert.equal(preview.cultivationExp, 5, 'preview should show cultivation');
  assert.equal(context.player.salary, 0, 'preview should not grant salary');
  assert.equal(context.player.cultivationExp, 0, 'preview should not grant cultivation');
  // After preview, settle should still work
  const result = idle.settle('preview-test');
  assert.equal(result.salary, 10, 'settle after preview should grant salary');
  assert.equal(context.player.salary, 10, 'salary should be granted after settle');
}

function testMultipleWorkersOnBoard(): void {
  const { context, clock } = createContext();
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  context.board.place(WorkerEntity.create(2), { row: 0, column: 1 });
  context.board.place(WorkerEntity.create(3), { row: 1, column: 0 });
  const idle = new IdleService(context, { clock });
  clock.advance(3600 * 1000);
  // salaryPerHour = [10, 20, 40, 80, 160, 320], so level 1+2+3 = 10+20+40 = 70
  const result = idle.settle('multi-worker');
  assert.equal(result.salary, 70, 'salary should sum all worker rates');
  // cultivationPerHour = [5, 10, 20, 40, 80, 160], so level 1+2+3 = 5+10+20 = 35
  assert.equal(result.cultivationExp, 35, 'cultivation should sum all worker rates');
}

testHourlyAndEightHourCap();
testZeroNegativeAndClockRollbackEmitAnomaly();
testSettlementIdPreventsDuplicateGrant();
testFailedSaveRollsBackSettlement();
testInfinityAndOverflowProtection();
testPreviewDoesNotGrantRewards();
testMultipleWorkersOnBoard();
console.log('idle service tests passed');
