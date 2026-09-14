import assert from 'node:assert/strict';

import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

function createFacade(storage: MemoryStorageAdapter): GameFacade {
  return new GameFacade({ storage, modeSwitchCooldownMs: 0 });
}

function testRecruitPlacesWorkerInFirstEmptyCellAndPersistsIt(): void {
  const storage = new MemoryStorageAdapter();
  const facade = createFacade(storage);

  const result = facade.recruit();

  assert.equal(result.success, true);
  assert.deepEqual(facade.context.board?.toSaveData().map(({ row, column }) => ({ row, column })), [{ row: 0, column: 0 }]);
  assert.deepEqual(JSON.parse(storage.getItem('game-save') ?? '{}').workers, facade.context.board?.toSaveData());
}

function testDraggingWorkerToEmptyCellMovesTheSameWorker(): void {
  const storage = new MemoryStorageAdapter();
  const facade = createFacade(storage);
  const recruited = facade.recruit();
  assert.equal(recruited.success, true);
  const workerId = recruited.success ? recruited.worker.id : '';

  const result = facade.move({ row: 0, column: 0 }, { row: 0, column: 1 });

  assert.equal(result.success, true);
  assert.equal(facade.context.board?.getWorker({ row: 0, column: 0 }), undefined);
  assert.equal(facade.context.board?.getWorker({ row: 0, column: 1 })?.id, workerId);
  assert.deepEqual(JSON.parse(storage.getItem('game-save') ?? '{}').workers, facade.context.board?.toSaveData());
}

function testMergingEqualWorkersClearsSourceAndLeavesUpgradedWorkerAtTarget(): void {
  const storage = new MemoryStorageAdapter();
  const facade = createFacade(storage);
  facade.recruit();
  facade.recruit();

  const result = facade.merge({ row: 0, column: 0 }, { row: 0, column: 1 });

  assert.equal(result.success, true);
  assert.equal(facade.context.board?.getWorker({ row: 0, column: 0 }), undefined);
  assert.equal(facade.context.board?.getWorker({ row: 0, column: 1 })?.level, 2);
  assert.deepEqual(JSON.parse(storage.getItem('game-save') ?? '{}').workers, facade.context.board?.toSaveData());
}

function testReloadRestoresWorkersAndTheirBoardPositions(): void {
  const storage = new MemoryStorageAdapter();
  const facade = createFacade(storage);
  facade.recruit();
  facade.move({ row: 0, column: 0 }, { row: 2, column: 3 });
  const beforeReload = facade.context.board?.toSaveData();

  const reloaded = createFacade(storage);

  assert.deepEqual(reloaded.context.board?.toSaveData(), beforeReload);
}

testRecruitPlacesWorkerInFirstEmptyCellAndPersistsIt();
testDraggingWorkerToEmptyCellMovesTheSameWorker();
testMergingEqualWorkersClearsSourceAndLeavesUpgradedWorkerAtTarget();
testReloadRestoresWorkersAndTheirBoardPositions();
console.log('playable loop tests passed');
