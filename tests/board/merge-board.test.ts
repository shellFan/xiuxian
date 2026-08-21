import assert from 'node:assert/strict';

import { MergeBoard } from '../../assets/scripts/game/merge/merge-board';
import { WorkerEntity } from '../../assets/scripts/model/worker-entity';

function testDefaultBoardHasSixteenDistinctCells(): void {
  const board = new MergeBoard();
  assert.equal(board.capacity, 16);
  assert.equal(board.emptyCount, 16);
  assert.equal(new Set(board.cells.map((cell) => `${cell.row},${cell.column}`)).size, 16);
}

function testPlacementAndMovementKeepCellsUniquelyOccupied(): void {
  const board = new MergeBoard({ rows: 2, columns: 2 });
  const worker = WorkerEntity.create(1);
  board.place(worker, { row: 0, column: 0 });
  assert.equal(board.getWorker({ row: 0, column: 0 }), worker);
  assert.equal(board.isOccupied({ row: 0, column: 0 }), true);
  assert.throws(() => board.place(WorkerEntity.create(1), { row: 0, column: 0 }));
  board.move({ row: 0, column: 0 }, { row: 1, column: 1 });
  assert.equal(board.getWorker({ row: 0, column: 0 }), undefined);
  assert.equal(board.getWorker({ row: 1, column: 1 }), worker);
  assert.equal(board.emptyCount, 3);
}

function testOnlySameLevelsMergeAndHighestLevelStops(): void {
  const board = new MergeBoard({ rows: 1, columns: 3, maxWorkerLevel: 6 });
  board.place(WorkerEntity.create(2), { row: 0, column: 0 });
  board.place(WorkerEntity.create(2), { row: 0, column: 1 });
  assert.equal(board.canMerge({ row: 0, column: 0 }, { row: 0, column: 1 }), true);
  const merged = board.merge({ row: 0, column: 0 }, { row: 0, column: 1 });
  assert.equal(merged.level, 3);
  assert.equal(board.getWorker({ row: 0, column: 0 }), undefined);
  assert.equal(board.getWorker({ row: 0, column: 1 })?.id, merged.id);
  assert.equal(board.emptyCount, 2);
  board.place(WorkerEntity.create(4), { row: 0, column: 0 });
  assert.equal(board.canMerge({ row: 0, column: 0 }, { row: 0, column: 1 }), false);
  const maxBoard = new MergeBoard({ rows: 1, columns: 2, maxWorkerLevel: 6 });
  maxBoard.place(WorkerEntity.create(6), { row: 0, column: 0 });
  maxBoard.place(WorkerEntity.create(6), { row: 0, column: 1 });
  assert.equal(maxBoard.canMerge({ row: 0, column: 0 }, { row: 0, column: 1 }), false);
  assert.throws(() => maxBoard.merge({ row: 0, column: 0 }, { row: 0, column: 1 }));
}

function testFullBoardAndSerializationRestore(): void {
  const board = new MergeBoard({ rows: 1, columns: 2 });
  const workers = [WorkerEntity.create(1), WorkerEntity.create(2)];
  board.place(workers[0], { row: 0, column: 0 });
  board.place(workers[1], { row: 0, column: 1 });
  assert.equal(board.isFull, true);
  assert.equal(board.findEmptyPosition(), undefined);
  const restored = MergeBoard.fromSaveData(board.toSaveData(), { rows: 1, columns: 2 });
  assert.deepEqual(restored.toSaveData(), board.toSaveData());
  assert.equal(restored.getWorker({ row: 0, column: 1 })?.id, workers[1].id);
}

function testCellsCannotBypassBoardValidation(): void {
  const board = new MergeBoard({ rows: 1, columns: 2, maxWorkerLevel: 1 });
  const first = WorkerEntity.create(1);
  const cell = board.getCell({ row: 0, column: 0 });

  assert.equal('place' in cell, false);
  assert.equal('remove' in cell, false);
  board.place(first, { row: 0, column: 0 });
  assert.throws(() => board.place(first, { row: 0, column: 1 }));
  assert.throws(() => board.place(WorkerEntity.create(2), { row: 0, column: 1 }));
  assert.deepEqual(board.serialize(), [first.toSaveData(0, 0)]);
}

function testRestoreRejectsDuplicateWorkerIds(): void {
  const worker = WorkerEntity.create(1);
  const data = [worker.toSaveData(0, 0), worker.toSaveData(0, 1)];
  assert.throws(() => MergeBoard.restore(data, { rows: 1, columns: 2 }), /Duplicate worker id/);
}

function testRejectsIllegalPositionsWithoutChangingBoard(): void {
  const board = new MergeBoard({ rows: 1, columns: 2 });
  const worker = WorkerEntity.create(1);
  assert.throws(() => board.getWorker({ row: -1, column: 0 }), /Invalid board position/);
  assert.throws(() => board.place(worker, { row: 1, column: 0 }), /Invalid board position/);
  assert.deepEqual(board.toSaveData(), []);
}

testDefaultBoardHasSixteenDistinctCells();
testPlacementAndMovementKeepCellsUniquelyOccupied();
testOnlySameLevelsMergeAndHighestLevelStops();
testFullBoardAndSerializationRestore();
testCellsCannotBypassBoardValidation();
testRestoreRejectsDuplicateWorkerIds();
testRejectsIllegalPositionsWithoutChangingBoard();
console.log('board tests passed');
