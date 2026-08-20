import assert from 'node:assert/strict';

import { PlayerData } from '../../assets/scripts/model/player-data';
import { CURRENT_SAVE_VERSION } from '../../assets/scripts/model/save-data';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

function testNewPlayerUsesDefaults(): void {
  const storage = new MemoryStorageAdapter();
  const service = new SaveService(storage);
  assert.deepEqual(service.load(), PlayerData.createDefault().toSaveData());
}

function testSavesAndRestoresPlayerAndWorkers(): void {
  const storage = new MemoryStorageAdapter();
  const service = new SaveService(storage);
  const player = new PlayerData({ salary: 80, maxWorkerLevel: 3, lastSaveTime: 123, workers: [
    { id: 'worker-1', level: 2, row: 1, column: 3 },
  ] });
  service.save(player);
  assert.deepEqual(service.load(), { saveVersion: CURRENT_SAVE_VERSION, salary: 80, maxWorkerLevel: 3, lastSaveTime: 123,
    workers: [{ id: 'worker-1', level: 2, row: 1, column: 3 }] });
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
  assert.deepEqual(new SaveService(storage).load(), { saveVersion: CURRENT_SAVE_VERSION, salary: 20, maxWorkerLevel: 1, lastSaveTime: 0,
    workers: [{ id: 'w', level: 1, row: 0, column: 0 }] });
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

testNewPlayerUsesDefaults();
testSavesAndRestoresPlayerAndWorkers();
testEmptyAndInvalidStorageBecomeNewPlayer();
testMigratesOlderVersionAndDefaultsMissingFields();
testIgnoresMalformedWorkersAndRejectsFutureSaves();
console.log('save tests passed');
