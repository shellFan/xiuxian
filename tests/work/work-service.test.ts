import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter, type StorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { WorkService } from '../../assets/scripts/services/work-service';
import { WorkerEntity } from '../../assets/scripts/model/worker-entity';

function createContext(player = new PlayerData()): { context: GameContext; storage: MemoryStorageAdapter } {
  const storage = new MemoryStorageAdapter();
  return { context: new GameContext({ player, saveService: new SaveService(storage) }), storage };
}

function testWorkTickUsesFullRatesAndConsumesMind(): void {
  const { context, storage } = createContext(new PlayerData({ mind: 10 }));
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  const work = new WorkService(context, { salaryPerHour: 60, cultivationPerHour: 120, mindPerHour: 120 });
  work.setMode('WORK');

  assert.deepEqual(work.tick(30), { salary: 0, cultivationExp: 1, mind: -1, elapsedSeconds: 30, mode: 'WORK' });
  assert.equal(context.player.salary, 0);
  assert.equal(context.player.cultivationExp, 1);
  assert.equal(context.player.mind, 9);
  assert.equal(context.player.workSeconds, 30);
  work.setMode('FISHING');
  assert.match(storage.getItem('game-save') ?? '', /"workSeconds":30/);
}

function testFishingTickUsesHalfRatesAndRecoversMind(): void {
  const { context } = createContext(new PlayerData({ mind: 10, workMode: 'FISHING' }));
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  const work = new WorkService(context, { salaryPerHour: 120, cultivationPerHour: 120, mindPerHour: 120 });

  assert.deepEqual(work.tick(60), { salary: 1, cultivationExp: 1, mind: 2, elapsedSeconds: 60, mode: 'FISHING' });
  assert.equal(context.player.salary, 1);
  assert.equal(context.player.cultivationExp, 1);
  assert.equal(context.player.mind, 12);
  assert.equal(context.player.fishingSeconds, 60);
}

function testShortTicksMatchSingleTickForBothModes(): void {
  for (const mode of ['WORK', 'FISHING'] as const) {
    const single = createContext(new PlayerData({ mind: 50, workMode: mode }));
    const sliced = createContext(new PlayerData({ mind: 50, workMode: mode }));
    for (const { context } of [single, sliced]) context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
    const options = { salaryPerHour: 61, cultivationPerHour: 127, mindPerHour: 113 };
    const singleWork = new WorkService(single.context, options);
    const slicedWork = new WorkService(sliced.context, options);

    singleWork.tick(3600);
    for (let second = 0; second < 3600; second += 1) slicedWork.tick(1);

    assert.deepEqual(sliced.context.player.toSaveData(), single.context.player.toSaveData());
  }
}

function testModeSwitchPersistsAndChangesFutureTicks(): void {
  const { context, storage } = createContext();
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  const work = new WorkService(context, { salaryPerHour: 3600, cultivationPerHour: 3600, mindPerHour: 0 });

  work.setMode('WORK');
  assert.equal(context.player.workMode, 'WORK');
  assert.match(storage.getItem('game-save') ?? '', /"workMode":"WORK"/);
  work.setMode('FISHING');
  assert.deepEqual(work.tick(1), { salary: 0, cultivationExp: 0, mind: 0, elapsedSeconds: 1, mode: 'FISHING' });
  assert.equal(context.player.workSeconds, 0);
  assert.equal(context.player.fishingSeconds, 1);
}

function testTickSaveFailureRollsBackAllState(): void {
  const player = new PlayerData({ salary: 7, cultivationExp: 3, mind: 40, workMode: 'WORK', workSeconds: 2 });
  const durableStorage = new MemoryStorageAdapter();
  const durableSave = new SaveService(durableStorage);
  durableSave.save(player);
  const baseline = player.toSaveData();
  const storage: StorageAdapter = { getItem: (key) => durableStorage.getItem(key), setItem: () => { throw new Error('quota exceeded'); }, removeItem: () => undefined };
  const context = new GameContext({ player, saveService: new SaveService(storage) });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  const work = new WorkService(context, { salaryPerHour: 3600, cultivationPerHour: 3600, mindPerHour: 3600 });

  work.tick(1);
  assert.throws(() => work.save(), /quota exceeded/);
  assert.deepEqual(player.toSaveData(), baseline);
  assert.deepEqual(new SaveService(durableStorage).load(), baseline);
  work.tick(3599);
  assert.equal(player.salary, 3606);
}

function testWorkRemainderSurvivesSaveAndReload(): void {
  const storage = new MemoryStorageAdapter();
  const first = new GameContext({ player: new PlayerData(), saveService: new SaveService(storage) });
  first.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  const firstWork = new WorkService(first, { salaryPerHour: 1, cultivationPerHour: 1, mindPerHour: 0 });
  firstWork.setMode('WORK');
  firstWork.tick(3599);
  firstWork.save();

  const second = new GameContext({ saveService: new SaveService(storage), board: first.board, player: new PlayerData(new SaveService(storage).load()) });
  const secondWork = new WorkService(second, { salaryPerHour: 1, cultivationPerHour: 1, mindPerHour: 0 });
  assert.deepEqual(secondWork.tick(1), { salary: 1, cultivationExp: 1, mind: 0, elapsedSeconds: 1, mode: 'WORK' });
}

function testFishingRemainderSurvivesSaveAndReload(): void {
  const storage = new MemoryStorageAdapter();
  const first = new GameContext({ player: new PlayerData({ mind: 0, workMode: 'FISHING' }), saveService: new SaveService(storage) });
  first.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  const firstWork = new WorkService(first, { salaryPerHour: 1, cultivationPerHour: 1, mindPerHour: 1 });
  firstWork.tick(7199);
  firstWork.save();

  const second = new GameContext({ saveService: new SaveService(storage), board: first.board, player: new PlayerData(new SaveService(storage).load()) });
  const secondWork = new WorkService(second, { salaryPerHour: 1, cultivationPerHour: 1, mindPerHour: 1 });
  assert.deepEqual(secondWork.tick(1), { salary: 1, cultivationExp: 1, mind: 1, elapsedSeconds: 1, mode: 'FISHING' });
}

function testWorkSaveFailureRestoresLatestCrossServiceSave(): void {
  let shouldFail = false;
  const committedStorage = new MemoryStorageAdapter();
  const storage: StorageAdapter = {
    getItem: (key) => committedStorage.getItem(key),
    setItem: (key, value) => {
      if (shouldFail) throw new Error('quota exceeded');
      committedStorage.setItem(key, value);
    },
    removeItem: (key) => committedStorage.removeItem(key),
  };
  const context = new GameContext({ player: new PlayerData(), saveService: new SaveService(storage) });
  context.economy.changeSalary(5);
  const work = new WorkService(context, { salaryPerHour: 3600, cultivationPerHour: 3600, mindPerHour: 3600 });
  work.tick(1);
  shouldFail = true;

  assert.throws(() => work.save(), /quota exceeded/);
  assert.equal(context.player.salary, 5);
  assert.equal(context.player.cultivationExp, 0);
  assert.equal(context.player.workSeconds, 0);
  assert.equal(context.player.workMode, 'FISHING');
}

function testWeightedRemaindersSurviveRateChangesAndReload(): void {
  const storage = new MemoryStorageAdapter();
  const first = new GameContext({ player: new PlayerData({ workMode: 'WORK' }), saveService: new SaveService(storage) });
  first.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  const firstWork = new WorkService(first, { salaryPerHour: 1, cultivationPerHour: 1, mindPerHour: 1 });
  firstWork.tick(1800);
  firstWork.save();

  const second = new GameContext({ saveService: new SaveService(storage), board: first.board, player: new PlayerData(new SaveService(storage).load()) });
  const secondWork = new WorkService(second, { salaryPerHour: 1, cultivationPerHour: 1, mindPerHour: 1 });
  assert.deepEqual(secondWork.tick(1800), { salary: 1, cultivationExp: 1, mind: -1, elapsedSeconds: 1800, mode: 'WORK' });
}

function testWorkSaveFailureDoesNotReadStorageDuringRollback(): void {
  let reads = 0;
  let fail = false;
  const storage: StorageAdapter = {
    getItem: () => { reads += 1; return null; },
    setItem: () => { if (fail) throw new Error('quota exceeded'); },
    removeItem: () => undefined,
  };
  const context = new GameContext({ player: new PlayerData(), saveService: new SaveService(storage) });
  context.economy.changeSalary(5);
  const readsAfterCommit = reads;
  const work = new WorkService(context, { salaryPerHour: 3600, cultivationPerHour: 3600, mindPerHour: 3600 });
  work.tick(1);
  fail = true;

  assert.throws(() => work.save(), /quota exceeded/);
  assert.equal(reads, readsAfterCommit);
  assert.equal(context.player.salary, 5);
}

testWorkTickUsesFullRatesAndConsumesMind();
testFishingTickUsesHalfRatesAndRecoversMind();
testShortTicksMatchSingleTickForBothModes();
testModeSwitchPersistsAndChangesFutureTicks();
testTickSaveFailureRollsBackAllState();
testWorkRemainderSurvivesSaveAndReload();
testFishingRemainderSurvivesSaveAndReload();
testWorkSaveFailureRestoresLatestCrossServiceSave();
testWeightedRemaindersSurviveRateChangesAndReload();
testWorkSaveFailureDoesNotReadStorageDuringRollback();
console.log('work service tests passed');
