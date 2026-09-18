import assert from 'node:assert/strict';

import { PlayerData } from '../../assets/scripts/model/player-data';
import { CURRENT_SAVE_VERSION } from '../../assets/scripts/model/save-data';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { GameContext } from '../../assets/scripts/core/game-context';
import { FixedClock } from '../../assets/scripts/core/clock';

function testNewPlayerUsesDefaults(): void {
  const storage = new MemoryStorageAdapter();
  const service = new SaveService(storage, 'game-save', () => 123);
  assert.deepEqual(service.load(), PlayerData.createDefault().toSaveData());
}

function testSavesAndRestoresPlayerAndWorkers(): void {
  const storage = new MemoryStorageAdapter();
  const service = new SaveService(storage, 'game-save', () => 123);
  const player = new PlayerData({ salary: 80, maxWorkerLevel: 3, lastSaveTime: 123, workers: [
    { id: 'worker-1', level: 2, row: 1, column: 3 },
  ] });
  service.save(player);
  // Gameplay V2: 存档含 V2 字段，这里断言关键字段子集而非完整字面量。
  const loaded = service.load();
  assert.equal(loaded.saveVersion, CURRENT_SAVE_VERSION);
  assert.equal(loaded.salary, 80);
  assert.equal(loaded.maxWorkerLevel, 3);
  assert.equal(loaded.lastSaveTime, 123);
  assert.deepEqual(loaded.workers, [{ id: 'worker-1', level: 2, row: 1, column: 3 }]);
  assert.equal(loaded.workMode, 'FISHING');
  // V2 迁移字段有安全默认值
  assert.equal(loaded.innerDemon, 0);
  assert.deepEqual(loaded.materials, {});
  assert.equal(loaded.gameDay, null);
  assert.deepEqual(loaded.equippedTechniques, [null, null, null]);
  // roundtrip 一致
  assert.deepEqual(new PlayerData(loaded).toSaveData(), loaded);
}

function testSuccessfulSavesRecordMonotonicInjectedTime(): void {
  const storage = new MemoryStorageAdapter();
  let now = 100;
  const service = new SaveService(storage, 'game-save', () => now);
  const player = PlayerData.createDefault();
  service.save(player);
  assert.equal(player.lastSaveTime, 100);
  assert.equal(service.load().lastSaveTime, 100);
  now = 90;
  service.save(player);
  assert.equal(player.lastSaveTime, 100);
  assert.equal(service.load().lastSaveTime, 100);
  now = 120;
  service.save(player);
  assert.equal(player.lastSaveTime, 120);
  assert.equal(service.load().lastSaveTime, 120);
}

function testSaveServiceAcceptsSharedClock(): void {
  const storage = new MemoryStorageAdapter();
  const service = new SaveService(storage, 'game-save', new FixedClock(321));
  const player = PlayerData.createDefault();
  service.save(player);
  assert.equal(service.load().lastSaveTime, 321);
}

function testFailedSaveDoesNotChangeInMemorySaveTime(): void {
  const player = new PlayerData({ lastSaveTime: 7 });
  const service = new SaveService({
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => {},
  }, 'game-save', () => 99);
  assert.throws(() => service.save(player), /quota exceeded/);
  assert.equal(player.lastSaveTime, 7);
}

function testEmptyAndInvalidStorageBecomeNewPlayer(): void {
  const storage = new MemoryStorageAdapter();
  const service = new SaveService(storage);
  storage.setItem('game-save', '');
  assert.deepEqual(service.load(), PlayerData.createDefault().toSaveData());
  storage.setItem('game-save', '{not-json');
  assert.deepEqual(service.load(), PlayerData.createDefault().toSaveData());
}

function testMigratesOlderVersionAndDefaultsMissingFields(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem('game-save', JSON.stringify({ saveVersion: 1, salary: 20, workers: [{ id: 'w', level: 1, row: 0, column: 0 }] }));
  const loaded = new SaveService(storage).load();
  // Gameplay V2: 关键字段迁移 + V2 字段安全默认值
  assert.equal(loaded.saveVersion, CURRENT_SAVE_VERSION);
  assert.equal(loaded.salary, 20);
  assert.equal(loaded.maxWorkerLevel, 1);
  assert.deepEqual(loaded.workers, [{ id: 'w', level: 1, row: 0, column: 0 }]);
  assert.equal(loaded.cultivationExp, 0);
  assert.equal(loaded.mind, 100);
  assert.equal(loaded.workMode, 'FISHING');
  assert.equal(loaded.innerDemon, 0);
  assert.deepEqual(loaded.materials, {});
  assert.deepEqual(loaded.relationships, {});
}

function testPhaseTwoDefaultsSurvivePlayerRoundTrip(): void {
  const player = PlayerData.createDefault();
  assert.equal(player.cultivationExp, 0);
  assert.equal(player.careerLevel, 1);
  assert.equal(player.mind, 100);
  assert.equal(player.maxMind, 100);
  assert.equal(player.workMode, 'FISHING');
  assert.deepEqual(new PlayerData(player.toSaveData()).toSaveData(), player.toSaveData());
}

function testIgnoresMalformedWorkersAndRejectsFutureSaves(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem('game-save', JSON.stringify({ saveVersion: 2, salary: 12, workers: [
    { id: 'valid', level: 1, row: 0, column: 0 }, { id: 'bad', level: '1', row: 0, column: 1 },
  ] }));
  assert.deepEqual(new SaveService(storage).load().workers, [{ id: 'valid', level: 1, row: 0, column: 0 }]);
  storage.setItem('game-save', JSON.stringify({ saveVersion: CURRENT_SAVE_VERSION + 1, salary: 99 }));
  assert.deepEqual(new SaveService(storage).load(), PlayerData.createDefault().toSaveData());
}

function testInvalidPlayerScalarsFallBackToSafeDefaults(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem('game-save', JSON.stringify({
    saveVersion: CURRENT_SAVE_VERSION,
    salary: 0.5,
    maxWorkerLevel: -1,
    lastSaveTime: Number.MAX_SAFE_INTEGER + 1,
    workers: [],
  }));
  const loaded = new SaveService(storage).load();
  assert.equal(loaded.salary, 0);
  assert.equal(loaded.maxWorkerLevel, 0);
  assert.equal(loaded.lastSaveTime, 0);
  assert.equal(loaded.mind, 100);
  assert.equal(loaded.workMode, 'FISHING');
  // V2 默认值同样安全
  assert.equal(loaded.innerDemon, 0);
  assert.deepEqual(loaded.materials, {});
}

function testMigratedInvalidSaveTimeCanBeReplacedByNextSave(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem('game-save', JSON.stringify({ saveVersion: CURRENT_SAVE_VERSION, lastSaveTime: -4 }));
  const service = new SaveService(storage, 'game-save', () => 500);
  const player = new PlayerData(service.load());
  assert.equal(player.lastSaveTime, 0);
  service.save(player);
  assert.equal(player.lastSaveTime, 500);
  assert.equal(service.load().lastSaveTime, 500);
}

function testLocalStorageAdapterRequiresExplicitCocosStorageInjection(): void {
  const { LocalStorageAdapter } = require('../../assets/scripts/services/storage-adapter') as typeof import('../../assets/scripts/services/storage-adapter');
  assert.throws(() => new LocalStorageAdapter().getItem('missing'), /Persistent storage is unavailable/);
  const persistent = new MemoryStorageAdapter();
  const adapter = new LocalStorageAdapter(persistent);
  adapter.setItem('persistent-key', 'saved');
  assert.equal(adapter.getItem('persistent-key'), 'saved');
}

function testGameContextRestoresSavedPlayerAndBoard(): void {
  const storage = new MemoryStorageAdapter();
  const service = new SaveService(storage);
  service.save(new PlayerData({ salary: 80, maxWorkerLevel: 2, workers: [
    { id: 'worker-restore', level: 2, row: 0, column: 1 },
  ] }));

  const context = new GameContext({ saveService: new SaveService(storage), boardRows: 1, boardColumns: 2 });

  assert.equal(context.player.salary, 80);
  assert.equal(context.player.maxWorkerLevel, 2);
  assert.equal(context.board!.getWorker({ row: 0, column: 1 })?.id, 'worker-restore');
  assert.equal(context.board!.getWorker({ row: 0, column: 1 })?.level, 2);
}

function testGameContextRejectsSemanticallyInvalidWorkersAsNewPlayer(): void {
  const invalidWorkers = [
    [{ id: 'duplicate', level: 1, row: 0, column: 0 }, { id: 'duplicate', level: 1, row: 0, column: 1 }],
    [{ id: 'fractional-position', level: 1, row: 0.5, column: 0 }],
    [{ id: 'out-of-bounds', level: 1, row: 1, column: 0 }],
    [{ id: 'invalid-level', level: 0, row: 0, column: 0 }],
    [{ id: 'too-strong', level: 7, row: 0, column: 0 }],
  ];

  for (const workers of invalidWorkers) {
    const storage = new MemoryStorageAdapter();
    storage.setItem('game-save', JSON.stringify({ saveVersion: CURRENT_SAVE_VERSION, salary: 80, maxWorkerLevel: 2, workers }));
    const context = new GameContext({ saveService: new SaveService(storage), boardRows: 1, boardColumns: 2 });
    assert.equal(context.player.salary, 0);
    assert.equal(context.player.maxWorkerLevel, 0);
    assert.equal(context.board!.occupiedCount, 0);
  }
}

testNewPlayerUsesDefaults();
testSavesAndRestoresPlayerAndWorkers();
testSuccessfulSavesRecordMonotonicInjectedTime();
testSaveServiceAcceptsSharedClock();
testFailedSaveDoesNotChangeInMemorySaveTime();
testEmptyAndInvalidStorageBecomeNewPlayer();
testMigratesOlderVersionAndDefaultsMissingFields();
testIgnoresMalformedWorkersAndRejectsFutureSaves();
testInvalidPlayerScalarsFallBackToSafeDefaults();
testMigratedInvalidSaveTimeCanBeReplacedByNextSave();
testPhaseTwoDefaultsSurvivePlayerRoundTrip();
testGameContextRestoresSavedPlayerAndBoard();
testGameContextRejectsSemanticallyInvalidWorkersAsNewPlayer();
testLocalStorageAdapterRequiresExplicitCocosStorageInjection();
console.log('save tests passed');
