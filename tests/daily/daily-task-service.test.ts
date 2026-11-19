import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { DailyTaskService, selectDailyTaskSet, type DailyTaskBundle } from '../../assets/scripts/services/daily-task-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveService } from '../../assets/scripts/services/save-service';
import type { DailyTaskConfig } from '../../assets/scripts/model/config-types';

const MS_PER_DAY = 86_400_000;

const TEST_TASKS: readonly DailyTaskConfig[] = [
  { id: 'merge-5', type: 'MERGE_5', name: '合成5次', description: '完成5次合成操作', target: 5, reward: { salary: 100, cultivation: 20 } },
  { id: 'work-10-min', type: 'WORK_10_MIN', name: '工作10分钟', description: '在工作模式下累计10分钟', target: 600, reward: { salary: 150, performance: 10 } },
  { id: 'fish-3-min', type: 'FISH_3_MIN', name: '摸鱼3分钟', description: '在摸鱼模式下累计3分钟', target: 180, reward: { mind: 15 } },
  { id: 'event-3', type: 'EVENT_3', name: '处理3次事件', description: '处理3次职场事件', target: 3, reward: { cultivation: 30, mind: 10 } },
  { id: 'kpi-complete', type: 'KPI_COMPLETE', name: '完成KPI', description: '完成当前职级的KPI目标', target: 1, reward: { salary: 200, performance: 20 } },
  { id: 'promotion-1', type: 'PROMOTION_1', name: '晋升1次', description: '成功晋升1次', target: 1, reward: { salary: 300, cultivation: 50, mind: 20 } },
];

const TEST_BUNDLE: DailyTaskBundle = { tasks: TEST_TASKS };

function createContext(options?: { clockNow?: number }): { context: GameContext; service: DailyTaskService; clock: FakeClock } {
  const clock = new FakeClock(options?.clockNow ?? 0);
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ storage, clock });
  const service = new DailyTaskService(context, TEST_BUNDLE, { clock });
  return { context, service, clock };
}

function testRefreshGeneratesTasks(): void {
  const { context, service } = createContext();
  assert.equal(context.player.dailyTasks.length, 0);
  assert.equal(context.player.dailyTaskDay, -1);
  const regenerated = service.refresh();
  assert.equal(regenerated, true);
  // DAILY-TASK-POOL-V1：每天 5 项（6 源中去 1），dayIndex 确定性抽取。
  // day 0 → FNV-1a("0")%6 = 3 → 组合 [merge,work,event,kpi,promotion]（fish 落选）。
  assert.equal(context.player.dailyTasks.length, 5);
  assert.equal(context.player.dailyTaskDay, 0);
  const types = service.getProgress().map((p) => p.type).sort();
  assert.deepEqual(types, ['EVENT_3', 'KPI_COMPLETE', 'MERGE_5', 'PROMOTION_1', 'WORK_10_MIN']);
  for (const task of context.player.dailyTasks) {
    assert.equal(task.progress, 0);
    assert.equal(task.completed, false);
    assert.equal(task.claimed, false);
  }
}

function testRefreshIsIdempotentSameDay(): void {
  const { service } = createContext();
  assert.equal(service.refresh(), true);
  assert.equal(service.refresh(), false);
}

function testRefreshRegeneratesOnNewDay(): void {
  const { context, service, clock } = createContext({ clockNow: 0 });
  service.refresh();
  assert.equal(context.player.dailyTaskDay, 0);
  clock.set(MS_PER_DAY);
  assert.equal(service.refresh(), true);
  assert.equal(context.player.dailyTaskDay, 1);
  assert.equal(context.player.dailyTasks.length, 5);
  assert.equal(context.player.dailyTasks[0].progress, 0);
}

function testAddProgressIncrementsAndCompletes(): void {
  const { context, service } = createContext();
  service.refresh();
  const events: Array<{ taskId: string; progress: number; target: number }> = [];
  context.events.on('dailyTaskProgress', (e) => events.push(e));
  const completed: string[] = [];
  context.events.on('dailyTaskCompleted', (e) => completed.push(e.taskId));
  service.addProgress('MERGE_5', 3);
  assert.equal(events.length, 1);
  assert.equal(events[0].progress, 3);
  assert.equal(events[0].target, 5);
  assert.equal(completed.length, 0);
  service.addProgress('MERGE_5', 3);
  assert.equal(events.length, 2);
  assert.equal(events[1].progress, 5);
  assert.equal(completed.length, 1);
  assert.equal(completed[0], 'merge-5');
  const task = context.player.dailyTasks.find((t) => t.taskId === 'merge-5');
  assert.equal(task?.completed, true);
}

function testAddProgressClampsAtTarget(): void {
  const { context, service } = createContext();
  service.refresh();
  service.addProgress('MERGE_5', 100);
  const task = context.player.dailyTasks.find((t) => t.taskId === 'merge-5');
  assert.equal(task?.progress, 5);
  assert.equal(task?.completed, true);
}

function testAddProgressIgnoredAfterCompletion(): void {
  const { service } = createContext();
  service.refresh();
  service.addProgress('MERGE_5', 5);
  const result = service.addProgress('MERGE_5', 1);
  assert.equal(result, null);
}

function testSetProgressUpdatesAbsoluteValue(): void {
  const { context, service } = createContext();
  service.refresh();
  service.setProgress('WORK_10_MIN', 300);
  const task = context.player.dailyTasks.find((t) => t.taskId === 'work-10-min');
  assert.equal(task?.progress, 300);
  assert.equal(task?.completed, false);
  service.setProgress('WORK_10_MIN', 600);
  assert.equal(task?.completed, true);
}

function testClaimCompletedTask(): void {
  const { context, service } = createContext();
  service.refresh();
  service.addProgress('MERGE_5', 5);
  const initialSalary = context.player.salary;
  service.claim('merge-5');
  assert.equal(context.player.salary, initialSalary + 100);
  const task = context.player.dailyTasks.find((t) => t.taskId === 'merge-5');
  assert.equal(task?.claimed, true);
}

function testClaimEmitsEvent(): void {
  const { context, service } = createContext();
  service.refresh();
  service.addProgress('MERGE_5', 5);
  const claimed: string[] = [];
  context.events.on('dailyTaskClaimed', (e) => claimed.push(e.taskId));
  service.claim('merge-5');
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0], 'merge-5');
}

function testClaimThrowsForIncompleteTask(): void {
  const { service } = createContext();
  service.refresh();
  assert.throws(() => service.claim('merge-5'), /not yet completed/);
}

function testClaimThrowsForAlreadyClaimed(): void {
  const { service } = createContext();
  service.refresh();
  service.addProgress('MERGE_5', 5);
  service.claim('merge-5');
  assert.throws(() => service.claim('merge-5'), /already claimed/);
}

function testClaimThrowsForUnknownTask(): void {
  const { service } = createContext();
  service.refresh();
  assert.throws(() => service.claim('nonexistent'), /Unknown daily task/);
}

function testClaimRollsBackOnSaveFailure(): void {
  const clock = new FakeClock(0);
  const failStorage: import('../../assets/scripts/services/storage-adapter').StorageAdapter = {
    getItem: () => null,
    setItem: () => { throw new Error('quota'); },
    removeItem: () => {},
  };
  const failSave = new SaveService(failStorage, 'game-save', clock);
  const context = new GameContext({ saveService: failSave, clock });
  const service = new DailyTaskService(context, TEST_BUNDLE, { clock });
  service.refresh();
  service.addProgress('MERGE_5', 5);
  const salaryBefore = context.player.salary;
  assert.throws(() => service.claim('merge-5'), /quota/);
  assert.equal(context.player.salary, salaryBefore);
  const task = context.player.dailyTasks.find((t) => t.taskId === 'merge-5');
  assert.equal(task?.claimed, false);
}

function testGetProgressReturnsAllTasks(): void {
  const { service } = createContext();
  service.refresh();
  const progress = service.getProgress();
  assert.equal(progress.length, 5);
  assert.equal(progress[0].taskId, 'merge-5');
  assert.equal(progress[0].type, 'MERGE_5');
  assert.equal(progress[0].target, 5);
  assert.equal(progress[0].completed, false);
  assert.equal(progress[0].claimed, false);
}

function testAllClaimedReturnsFalseWhenIncomplete(): void {
  const { service } = createContext();
  service.refresh();
  assert.equal(service.allClaimed(), false);
}

function testAllClaimedReturnsTrueWhenAllClaimed(): void {
  const { service } = createContext();
  service.refresh();
  for (const p of service.getProgress()) {
    service.addProgress(p.type, p.target);
    service.claim(p.taskId);
  }
  assert.equal(service.allClaimed(), true);
}

function testCompletedCountAndTotalCount(): void {
  const { service } = createContext();
  service.refresh();
  assert.equal(service.completedCount(), 0);
  assert.equal(service.totalCount(), 5);
  service.addProgress('MERGE_5', 5);
  assert.equal(service.completedCount(), 1);
  service.addProgress('WORK_10_MIN', 600);
  assert.equal(service.completedCount(), 2);
}

/* ── DAILY-TASK-POOL-V1：随机池契约 ─────────────────────────────────────────── */

function testPoolSelectionIsDeterministicSameDay(): void {
  const a = createContext();
  const b = createContext();
  a.service.refresh();
  b.service.refresh();
  const idsA = a.service.getProgress().map((p) => p.taskId).sort().join(',');
  const idsB = b.service.getProgress().map((p) => p.taskId).sort().join(',');
  assert.equal(idsA, idsB);
  assert.equal(idsA.length > 0, true);
}

function testPoolRespectsBudgetCapByDegradation(): void {
  // 6 项、每项 cultivation 60：任一 5/4/3 组合都超 cultivation100 上限，
  // 按契约"超预算跳过模板"逐级降容 → 2 项（120 超限）→ 实际落到 1 项（60）。
  const overBudget: readonly DailyTaskConfig[] = TEST_TASKS.map((cfg) => ({
    ...cfg,
    reward: { cultivation: 60 },
  }));
  const selected = selectDailyTaskSet(overBudget, 0, { promotionAvailable: true, kpiAvailable: true });
  assert.equal(selected.length, 1);
  const totalCultivation = selected.reduce((sum, cfg) => sum + ((cfg.reward as { cultivation: number }).cultivation), 0);
  assert.equal(totalCultivation <= 100, true);
}

function testPoolGatesExcludeUnavailableTypes(): void {
  // 纯函数口径：晋升/KPI 门槛不可用 → 安全降级为全部合格（4 项）。
  const selected = selectDailyTaskSet(TEST_TASKS, 0, { promotionAvailable: false, kpiAvailable: false });
  assert.equal(selected.length, 4);
  const types = selected.map((cfg) => cfg.type).sort();
  assert.deepEqual(types, ['EVENT_3', 'FISH_3_MIN', 'MERGE_5', 'WORK_10_MIN']);
}

function testPoolExcludesPromotionAtMaxLevel(): void {
  // 服务口径：满级（career.json 最高 10 级）时晋升任务不入池；
  // kpi.json 只配到 9 级，满级也无 KPI 目标 → KPI 任务同样不入池（降级为 4 项）。
  const { context, service } = createContext();
  context.player.careerLevel = 10;
  service.refresh();
  const types = service.getProgress().map((p) => p.type);
  assert.equal(types.includes('PROMOTION_1'), false);
  assert.equal(types.includes('KPI_COMPLETE'), false);
  assert.equal(types.length, 4);
}

function testNewDayResetsProgress(): void {
  const { context, service, clock } = createContext({ clockNow: 0 });
  service.refresh();
  service.addProgress('MERGE_5', 5);
  service.claim('merge-5');
  assert.equal(context.player.dailyTasks[0].claimed, true);
  clock.set(MS_PER_DAY);
  service.refresh();
  assert.equal(context.player.dailyTasks[0].progress, 0);
  assert.equal(context.player.dailyTasks[0].completed, false);
  assert.equal(context.player.dailyTasks[0].claimed, false);
}

testRefreshGeneratesTasks();
testRefreshIsIdempotentSameDay();
testRefreshRegeneratesOnNewDay();
testAddProgressIncrementsAndCompletes();
testAddProgressClampsAtTarget();
testAddProgressIgnoredAfterCompletion();
testSetProgressUpdatesAbsoluteValue();
testClaimCompletedTask();
testClaimEmitsEvent();
testClaimThrowsForIncompleteTask();
testClaimThrowsForAlreadyClaimed();
testClaimThrowsForUnknownTask();
testClaimRollsBackOnSaveFailure();
testGetProgressReturnsAllTasks();
testAllClaimedReturnsFalseWhenIncomplete();
testAllClaimedReturnsTrueWhenAllClaimed();
testCompletedCountAndTotalCount();
testNewDayResetsProgress();
testPoolSelectionIsDeterministicSameDay();
testPoolRespectsBudgetCapByDegradation();
testPoolGatesExcludeUnavailableTypes();
testPoolExcludesPromotionAtMaxLevel();
console.log('daily task service tests passed');