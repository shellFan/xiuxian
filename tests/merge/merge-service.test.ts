import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { MergeService } from '../../assets/scripts/services/merge-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveService } from '../../assets/scripts/services/save-service';
import { WorkerEntity } from '../../assets/scripts/model/worker-entity';
import { MergeBoard } from '../../assets/scripts/game/merge/merge-board';
import { PlayerData } from '../../assets/scripts/model/player-data';

function createMerge(): { context: GameContext; merge: MergeService; storage: MemoryStorageAdapter } {
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ saveService: new SaveService(storage), boardRows: 1, boardColumns: 3 });
  return { context, merge: new MergeService(context), storage };
}

function testMergesLevelsOneThroughFiveAndUpdatesState(): void {
  const { context, merge, storage } = createMerge();
  for (let level = 1; level <= 5; level += 1) {
    const first = { row: 0, column: 0 };
    const second = { row: 0, column: 1 };
    context.board.place(WorkerEntity.create(level), first);
    context.board.place(WorkerEntity.create(level), second);
    const result = merge.merge(first, second);
    assert.equal(result.success, true);
    assert.equal(result.worker.level, level + 1);
    assert.equal(context.board.occupiedCount, 1);
    assert.equal(context.player.maxWorkerLevel, level + 1);
    assert.equal(context.player.salary, [10, 30, 70, 150, 310][level - 1]);
    assert.equal(context.player.workers.length, 1);
    assert.match(storage.getItem('game-save') ?? '', /worker-/);
    context.board.remove(second);
  }
}

function testMergeCommitsTheNewWorkerAtTheDropTarget(): void {
  const { context, merge } = createMerge();
  const source = { row: 0, column: 0 };
  const target = { row: 0, column: 1 };
  context.board.place(WorkerEntity.create(1), source);
  context.board.place(WorkerEntity.create(1), target);
  const result = merge.merge(source, target);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(context.board.getWorker(source), undefined);
    assert.equal(context.board.getWorker(target)?.id, result.worker.id);
    assert.equal(context.board.getWorker(target)?.level, 2);
  }
}

function testMaxLevelMergeIsRejectedWithoutChangingBoard(): void {
  const { context, merge, storage } = createMerge();
  context.board.place(WorkerEntity.create(6), { row: 0, column: 0 });
  context.board.place(WorkerEntity.create(6), { row: 0, column: 1 });
  const before = context.board.toSaveData();
  const result = merge.merge({ row: 0, column: 0 }, { row: 0, column: 1 });
  assert.deepEqual(result, { success: false, message: '最高等级为Lv6' });
  assert.deepEqual(context.board.toSaveData(), before);
  assert.equal(context.player.salary, 0);
  assert.equal(storage.getItem('game-save'), null);
}

function testReentrantMergeIsIgnoredDuringTransaction(): void {
  const { context, merge, storage } = createMerge();
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 1 });
  let nested: ReturnType<MergeService['merge']> | undefined;
  context.events.on('mergeCompleted', () => {
    nested = merge.merge({ row: 0, column: 0 }, { row: 0, column: 1 });
  });
  const result = merge.merge({ row: 0, column: 0 }, { row: 0, column: 1 });
  assert.equal(result.success, true);
  assert.deepEqual(nested, { success: false, message: '合成进行中' });
  assert.equal(context.player.salary, 10);
  assert.equal((storage.getItem('game-save')?.match(/worker-/g) ?? []).length, 1);
}


function testSaveFailureRollsBackTheWholeTransaction(): void {
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ saveService: new SaveService({
    getItem: (key) => storage.getItem(key),
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: (key) => storage.removeItem(key),
  }), boardRows: 1, boardColumns: 3 });
  const merge = new MergeService(context);
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 1 });
  const beforeBoard = context.board.toSaveData();
  const beforeWorkers = context.player.workers;

  assert.throws(() => merge.merge({ row: 0, column: 0 }, { row: 0, column: 1 }), /quota exceeded/);
  assert.deepEqual(context.board.toSaveData(), beforeBoard);
  assert.deepEqual(context.player.workers, beforeWorkers);
  assert.equal(context.player.salary, 0);
  assert.equal(context.player.maxWorkerLevel, 0);
}

function testFeedbackListenerFailureDoesNotAbortCommittedMerge(): void {
  const { context, merge } = createMerge();
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 1 });
  const events: string[] = [];
  context.events.on('mergeCompleted', () => { throw new Error('view failed'); });
  context.events.on('salaryChanged', () => { events.push('salary'); });
  context.events.on('gameSaved', () => { events.push('saved'); });

  const result = merge.merge({ row: 0, column: 0 }, { row: 0, column: 1 });
  assert.equal(result.success, true);
  assert.equal(context.board.occupiedCount, 1);
  assert.equal(context.player.salary, 10);
  assert.deepEqual(events, ['salary', 'saved']);
}

function testConsecutiveMergesRemainConsistent(): void {
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ saveService: new SaveService(storage), boardRows: 1, boardColumns: 4 });
  const merge = new MergeService(context);
  for (let column = 0; column < 4; column += 1) context.board.place(WorkerEntity.create(1), { row: 0, column });

  assert.equal(merge.merge({ row: 0, column: 0 }, { row: 0, column: 1 }).success, true);
  assert.equal(merge.merge({ row: 0, column: 2 }, { row: 0, column: 3 }).success, true);
  const final = merge.merge({ row: 0, column: 1 }, { row: 0, column: 3 });

  assert.equal(final.success, true);
  assert.equal(final.worker.level, 3);
  assert.equal(context.board.occupiedCount, 1);
  assert.equal(context.player.salary, 40);
}

function testRestoredBoardCanMergeImmediately(): void {
  const storage = new MemoryStorageAdapter();
  const firstContext = new GameContext({ saveService: new SaveService(storage), boardRows: 1, boardColumns: 4 });
  const firstMerge = new MergeService(firstContext);
  firstContext.board.place(WorkerEntity.create(2), { row: 0, column: 0 });
  firstContext.board.place(WorkerEntity.create(1), { row: 0, column: 2 });
  firstContext.board.place(WorkerEntity.create(1), { row: 0, column: 3 });
  firstContext.syncPlayerWorkers();
  firstContext.saveService.save(firstContext.player);
  assert.equal(firstMerge.merge({ row: 0, column: 2 }, { row: 0, column: 3 }).success, true);

  const saved = new SaveService(storage).load();
  const restoredContext = new GameContext({
    board: MergeBoard.restore(saved.workers, { rows: 1, columns: 4 }),
    player: new PlayerData(saved),
    saveService: new SaveService(storage),
  });
  const restoredMerge = new MergeService(restoredContext);
  const result = restoredMerge.merge({ row: 0, column: 0 }, { row: 0, column: 3 });

  assert.equal(result.success, true);
  assert.equal(result.worker.level, 3);
  assert.equal(restoredContext.board.occupiedCount, 1);
  assert.equal(restoredContext.player.salary, 30);
}
testMergesLevelsOneThroughFiveAndUpdatesState();
testMergeCommitsTheNewWorkerAtTheDropTarget();
testMaxLevelMergeIsRejectedWithoutChangingBoard();
testReentrantMergeIsIgnoredDuringTransaction();
testSaveFailureRollsBackTheWholeTransaction();
testFeedbackListenerFailureDoesNotAbortCommittedMerge();
testConsecutiveMergesRemainConsistent();
testRestoredBoardCanMergeImmediately();
console.log('merge service tests passed');
