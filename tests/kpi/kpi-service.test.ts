import assert from 'node:assert/strict';
import { GameContext } from '../../assets/scripts/core/game-context';
import { MergeService } from '../../assets/scripts/services/merge-service';
import { WorkService } from '../../assets/scripts/services/work-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveService } from '../../assets/scripts/services/save-service';
import { WorkerEntity } from '../../assets/scripts/model/worker-entity';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MergeBoard } from '../../assets/scripts/game/merge/merge-board';
import { ConfigService } from '../../assets/scripts/services/config-service';
import workerConfig from '../../assets/configs/worker.json';
import economyConfig from '../../assets/configs/economy.json';
import gameConfig from '../../assets/configs/game.json';
import careerConfig from '../../assets/configs/career.json';
import sectConfig from '../../assets/configs/sect.json';
import talentConfig from '../../assets/configs/talent.json';
import careerEventsConfig from '../../assets/configs/career-events.json';

function createContext(): GameContext {
  const storage = new MemoryStorageAdapter();
  return new GameContext({ saveService: new SaveService(storage), boardRows: 1, boardColumns: 3 });
}

function testLoadsLevelOneRequirements(): void {
  const context = createContext();
  const reqs = context.kpi.getCurrentRequirements();
  assert.equal(reqs.length, 3);
  const merge = reqs.find((r) => r.type === 'MERGE_COUNT');
  const work = reqs.find((r) => r.type === 'WORK_SECONDS');
  const cult = reqs.find((r) => r.type === 'CULTIVATION');
  assert.equal(merge?.target, 3);
  assert.equal(work?.target, 300);
  assert.equal(cult?.target, 50);
  assert.equal(context.kpi.isCurrentKpiCompleted(), false);
}

function testMergeIncrementsCounter(): void {
  const context = createContext();
  const merge = new MergeService(context);
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 1 });
  const result = merge.merge({ row: 0, column: 0 }, { row: 0, column: 1 });
  assert.equal(result.success, true);
  assert.equal(context.player.kpiProgress.MERGE_COUNT, 1);
  assert.equal(context.player.kpiProgress.SALARY_EARNED, 10);
}

function testFailedMergeDoesNotIncrement(): void {
  const context = createContext();
  const merge = new MergeService(context);
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  context.board.place(WorkerEntity.create(2), { row: 0, column: 1 });
  const result = merge.merge({ row: 0, column: 0 }, { row: 0, column: 1 });
  assert.equal(result.success, false);
  assert.equal(context.player.kpiProgress.MERGE_COUNT ?? 0, 0);
}

function testWorkSecondsAccumulateAndFishingDoesNot(): void {
  const context = createContext();
  const work = new WorkService(context);
  context.player.workMode = 'WORK';
  work.tick(120);
  assert.equal(context.player.workSeconds, 120);
  assert.equal(context.kpi.getProgress({ type: 'WORK_SECONDS', target: 300 }), 120);

  context.player.workMode = 'FISHING';
  work.tick(120);
  assert.equal(context.player.fishingSeconds, 120);
  assert.equal(context.player.workSeconds, 120, 'FISHING must not accumulate workSeconds');

  const reqs = context.kpi.getCurrentRequirements();
  const workReq = reqs.find((r) => r.type === 'WORK_SECONDS');
  assert.equal(context.kpi.isRequirementCompleted(workReq!), false);
}

function testCultivationThreshold(): void {
  const context = createContext();
  context.player.cultivationExp = 49;
  const reqs = context.kpi.getCurrentRequirements();
  const cult = reqs.find((r) => r.type === 'CULTIVATION');
  assert.equal(context.kpi.isRequirementCompleted(cult!), false);
  context.player.cultivationExp = 50;
  assert.equal(context.kpi.isRequirementCompleted(cult!), true);
}

function testSingleRequirementCompletion(): void {
  const context = createContext();
  context.player.kpiProgress = { MERGE_COUNT: 3 };
  const mergeReq = context.kpi.getCurrentRequirements().find((r) => r.type === 'MERGE_COUNT')!;
  assert.equal(context.kpi.isRequirementCompleted(mergeReq), true);
}

function testAllRequirementsCompletion(): void {
  const context = createContext();
  context.player.kpiProgress = { MERGE_COUNT: 3 };
  context.player.workSeconds = 300;
  context.player.cultivationExp = 50;
  assert.equal(context.kpi.isCurrentKpiCompleted(), true);
  assert.equal(context.kpi.getView().allCompleted, true);
}

function testCareerLevelSwitchReadsCorrectRequirements(): void {
  const context = createContext();
  context.player.careerLevel = 4;
  context.kpi.switchLevel(4);
  assert.equal(context.player.careerLevel, 4);
  const reqs = context.kpi.getCurrentRequirements();
  const merge = reqs.find((r) => r.type === 'MERGE_COUNT');
  assert.equal(merge?.target, 12);
  const work = reqs.find((r) => r.type === 'WORK_SECONDS');
  assert.equal(work?.target, 1200);
  // Per-level counters reset on switch; cumulative attributes preserved.
  context.player.kpiProgress = { MERGE_COUNT: 99 };
  context.kpi.switchLevel(4);
  assert.equal(context.player.kpiProgress.MERGE_COUNT ?? 0, 0);
}

function testRepeatEventsDoNotDoubleCount(): void {
  const context = createContext();
  context.kpi.recordMerge();
  assert.equal(context.player.kpiProgress.MERGE_COUNT, 1);
  // Re-reading the view multiple times must not mutate progress.
  context.kpi.getView();
  context.kpi.getView();
  assert.equal(context.player.kpiProgress.MERGE_COUNT, 1);
}

function testSaveAndLoadRestoresProgress(): void {
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ saveService: new SaveService(storage), boardRows: 1, boardColumns: 3 });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 1 });
  const merge = new MergeService(context);
  merge.merge({ row: 0, column: 0 }, { row: 0, column: 1 });

  const saved = new SaveService(storage).load();
  const reloaded = new GameContext({
    board: MergeBoard.restore(saved.workers, { rows: 1, columns: 3 }),
    player: new PlayerData(saved),
    saveService: new SaveService(storage),
  });
  assert.equal(reloaded.player.kpiProgress.MERGE_COUNT, 1);
}

function testLegacySaveMigrationDefaultsKpiProgress(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem('game-save', JSON.stringify({ salary: 100, careerLevel: 1, workSeconds: 10 }));
  const loaded = new SaveService(storage).load();
  assert.deepEqual(loaded.kpiProgress, {});
}

function testInvalidKpiConfigRejected(): void {
  assert.throws(() => {
    ConfigService.loadFromJson(workerConfig, economyConfig, gameConfig, careerConfig, sectConfig, talentConfig, careerEventsConfig, {
      levels: [{ careerLevel: 1, requirements: [{ type: 'BOGUS_TYPE', target: 1 }] }],
    });
  }, /kpi\.levels\[0\]\.requirements\[0\]\.type is invalid/);

  assert.throws(() => {
    ConfigService.loadFromJson(workerConfig, economyConfig, gameConfig, careerConfig, sectConfig, talentConfig, careerEventsConfig, {
      levels: [{ careerLevel: 99, requirements: [{ type: 'MERGE_COUNT', target: 1 }] }],
    });
  }, /must be between 1 and 10/);

  assert.throws(() => {
    ConfigService.loadFromJson(workerConfig, economyConfig, gameConfig,  careerConfig, sectConfig, talentConfig, careerEventsConfig, {
      levels: [{ careerLevel: 1, requirements: [{ type: 'MERGE_COUNT', target: 0 }] }],
    });
  }, /target must be a positive safe integer/);

  assert.throws(() => {
    ConfigService.loadFromJson(workerConfig, economyConfig, gameConfig, careerConfig, sectConfig, talentConfig, careerEventsConfig, {
      levels: [
        { careerLevel: 1, requirements: [{ type: 'MERGE_COUNT', target: 1 }] },
        { careerLevel: 1, requirements: [{ type: 'WORK_SECONDS', target: 1 }] },
      ],
    });
  }, /duplicate careerLevel 1/);
}

function testSaveFailureRollsBackKpi(): void {
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({
    saveService: new SaveService({
      getItem: (key: string): string | null => storage.getItem(key),
      setItem: (): void => { throw new Error('quota exceeded'); },
      removeItem: (key: string): void => storage.removeItem(key),
    }),
    boardRows: 1,
    boardColumns: 3,
  });
  const merge = new MergeService(context);
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 1 });
  assert.throws(() => merge.merge({ row: 0, column: 0 }, { row: 0, column: 1 }), /quota exceeded/);
  assert.equal(context.player.kpiProgress.MERGE_COUNT ?? 0, 0);
}

function testRecordEventResolvedTakesEventId(): void {
  const context = createContext();
  context.kpi.recordEventResolved('event-1');
  assert.equal(context.player.kpiProgress.EVENT_RESOLVED, 1);
  assert.throws(() => context.kpi.recordEventResolved(''), /Invalid event id/);
}

function testCareerEventResolvesIncrementsKpi(): void {
  let now = 0;
  const clock = { now: () => now };
  const context = new GameContext({
    saveService: new SaveService(new MemoryStorageAdapter()),
    boardRows: 1,
    boardColumns: 3,
    clock,
  });
  // First poll schedules the next event in the future; advance past it to trigger one.
  context.careerEvents.poll();
  now = Number.MAX_SAFE_INTEGER;
  const event = context.careerEvents.poll();
  assert.ok(event);
  if (event!.type === 'CHOICE') {
    context.careerEvents.choose(event.id, event.choices![0].id);
  } else {
    context.careerEvents.resolve(event!.id);
  }
  assert.equal(context.player.kpiProgress.EVENT_RESOLVED, 1);
}

testLoadsLevelOneRequirements();
testMergeIncrementsCounter();
testFailedMergeDoesNotIncrement();
testWorkSecondsAccumulateAndFishingDoesNot();
testCultivationThreshold();
testSingleRequirementCompletion();
testAllRequirementsCompletion();
testCareerLevelSwitchReadsCorrectRequirements();
testRepeatEventsDoNotDoubleCount();
testSaveAndLoadRestoresProgress();
testLegacySaveMigrationDefaultsKpiProgress();
testInvalidKpiConfigRejected();
testSaveFailureRollsBackKpi();
testRecordEventResolvedTakesEventId();
testCareerEventResolvesIncrementsKpi();
console.log('kpi service tests passed');
