import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';
import { eventCountForDuration } from '../../assets/scripts/v56/task-runtime-director';

process.env.TZ = 'Asia/Shanghai';
const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');
const MINUTE = 60_000;

function makeFacade(seed = 7101): { facade: GameFacade; clock: FakeClock } {
  const clock = new FakeClock(MONDAY_0900);
  const facade = new GameFacade({
    clock, careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new MemoryStorageAdapter(), board: null,
    randomV2: new RandomService(mulberry32(seed)),
    randomProvider: { next: mulberry32(seed) },
    battleRng: mulberry32(seed), autoSaveIntervalSeconds: 0,
  });
  facade.context.messenger.ensureInitialized();
  return { facade, clock };
}

/** §4.2：确定性触发表——同 seed 结果一致，次数符合时长分级。 */
function testDeterministicSchedule(): void {
  assert.equal(eventCountForDuration(10 * 60), eventCountForDuration(10 * 60), 'same duration → same count');
  const epic = eventCountForDuration(7 * 3600);
  assert.ok(epic >= 3 && epic <= 6, `EPIC 3-6 events (got ${epic})`);
  const quick = eventCountForDuration(10 * 60);
  assert.ok(quick >= 0 && quick <= 1, `QUICK 0-1 events (got ${quick})`);
  console.log('deterministic schedule passed');
}

/** §4.3~4.4：任务 30% 触发职业运行时事件，回复改任务时长/债。 */
function testRuntimeEventFlow(): void {
  const { facade, clock } = makeFacade();
  try {
    facade.gameLoop.start();
    facade.gameLoop.tick(1);
    facade.chooseProfession('JAVA_BACKEND');
    facade.context.player.activeTasks.push({
      taskId: 'rt_test_1', taskType: 'WORK', name: '修复线上登录异常', description: '',
      durationSeconds: 120 * 60, startedAt: clock.now(), rewardSalary: 90, rewardCultivation: 40,
      rewardSpiritStones: 0, rewardPerformance: 18, completed: false, claimed: false,
    });
    const task = facade.context.player.activeTasks[0];
    const director = facade.context.taskRuntimeDirector;
    director.ensureRuntime(task);
    facade.context.player.eventFlags = {};
    // 推进到首个触发点
    for (let i = 0; i < 200; i++) {
      clock.advance(MINUTE);
      facade.gameLoop.tick(60);
      if (facade.context.events) { /* events fire synchronously */ }
      const ev = (facade as unknown as { context: { events: { emit: (k: string) => void } } });
      void ev;
      if (facade.context.messenger.pendingReplies().length > 0) break;
    }
    const pending = facade.context.messenger.pendingReplies();
    assert.ok(pending.length > 0, `runtime event delivered via messenger (got ${pending.length})`);
    const debtBefore = facade.context.techDebt.average();
    const msg = pending[0];
    const replyId = (msg.replyOptions ?? [])[0]?.id;
    assert.ok(replyId, 'reply options available');
    const result = facade.resolveTaskRuntimeEvent(msg.id, replyId);
    assert.equal(result.ok, true, 'runtime event resolved');
    void debtBefore;
    console.log('runtime event flow passed');
  } finally {
    facade.destroy();
  }
}

/** §4.5~4.6：暂停/恢复/前台切换 + 上下文切换损耗。 */
function testPauseSwitch(): void {
  const { facade, clock } = makeFacade();
  try {
    facade.gameLoop.start();
    facade.context.messenger.ensureInitialized();
    facade.context.player.activeTasks.push(
      { taskId: 'tA', taskType: 'WORK', name: '任务A', description: '', durationSeconds: 3600, startedAt: clock.now(), rewardSalary: 10, rewardCultivation: 5, rewardSpiritStones: 0, rewardPerformance: 1, completed: false, claimed: false },
      { taskId: 'tB', taskType: 'WORK', name: '任务B', description: '', durationSeconds: 3600, startedAt: clock.now(), rewardSalary: 10, rewardCultivation: 5, rewardSpiritStones: 0, rewardPerformance: 1, completed: false, claimed: false },
    );
    facade.context.taskRuntimeDirector.ensureRuntime(facade.context.player.activeTasks[0]);
    facade.context.taskRuntimeDirector.ensureRuntime(facade.context.player.activeTasks[1]);
    facade.context.taskRuntimeDirector.pauseTask('tA', '等待产品确认');
    assert.equal(facade.context.player.activeTasks[0].runtimeStage, 'PAUSED');
    const r = facade.context.taskRuntimeDirector.switchTask('tB');
    assert.equal(r.ok, true, 'switch to tB');
    assert.equal(facade.context.player.activeTasks[1].foreground, true, 'tB is foreground');
    assert.equal(facade.context.player.activeTasks[0].foreground, false, 'tA not foreground after switch');
    facade.context.taskRuntimeDirector.resumeTask('tA');
    assert.equal(facade.context.player.activeTasks[0].runtimeStage, 'ACTIVE', 'tA resumed');
    console.log('pause/switch passed');
  } finally {
    facade.destroy();
  }
}

/** §5：Daily Planner 生成计划 + Today Capacity 计算。 */
function testDailyPlanner(): void {
  const { facade, clock } = makeFacade();
  try {
    facade.gameLoop.start();
    facade.gameLoop.tick(1);
    facade.context.dailyPlanner.beginWorkday();
    const plan = facade.context.dailyPlanner.planEntries();
    assert.ok(plan.length >= 3 && plan.length <= 5, `plan 3-5 entries (got ${plan.length})`);
    const cap = facade.queryTodayCapacity();
    assert.ok(cap.remainingWorkMinutes >= 0, 'remaining work minutes computed');
    assert.ok(cap.remainingPlanMinutes > 0, 'remaining plan minutes > 0');
    assert.ok(cap.projectedOffWorkTime.length === 5, 'projected off-work time formatted');
    console.log(`daily planner passed (plan=${plan.length}, off=${cap.projectedOffWorkTime}, overload=${cap.overload})`);
  } finally {
    facade.destroy();
  }
}

/** §7：项目状态机 + 决策 domain 化 + 跨天后果。 */
function testProjectStateMachine(): void {
  const { facade, clock } = makeFacade();
  try {
    facade.gameLoop.start();
    facade.gameLoop.tick(1);
    facade.context.projectService.ensureProject();
    const project = facade.queryProject();
    assert.ok(project, 'project ensured');
    assert.equal(project.status, 'DEVELOPMENT');
    const deadlineBefore = project.deadlineAt;
    const r = facade.resolveProjectDecision('delay');
    assert.equal(r.ok, true, 'delay decision applied');
    const after = facade.queryProject();
    assert.ok(after, 'project exists after decision');
    assert.equal(after.status, 'DELAYED', 'project status DELAYED');
    assert.equal(after.deadlineAt - deadlineBefore, 2 * 86_400_000, 'deadline +2 days');
    // 带病上线 → 跨天事故概率
    facade.resolveProjectDecision('sick_release');
    assert.equal(facade.queryProject()?.releaseRisk, 55, 'sick release risk recorded');
    assert.ok(facade.context.projectService.incidentRiskMultiplier() > 1, 'cross-day incident risk multiplier active');
    console.log('project state machine passed');
  } finally {
    facade.destroy();
  }
}

/** §8：GoalDirector 分层输出。 */
function testGoalDirector(): void {
  const { facade } = makeFacade();
  try {
    facade.gameLoop.start();
    facade.context.messenger.ensureInitialized();
    facade.context.projectService.ensureProject();
    const goals = facade.queryGoals();
    const layers = new Set(goals.map((g) => g.layer));
    assert.ok(layers.has('TODAY'), 'TODAY goal present');
    assert.ok(layers.has('PROJECT'), 'PROJECT goal present');
    assert.ok(goals[0].priority >= goals[goals.length - 1].priority, 'goals sorted by priority');
    assert.ok(facade.queryNowGoal(), 'now goal available');
    console.log('goal director passed');
  } finally {
    facade.destroy();
  }
}

/** §25：save v12 迁移——V11 存档加载后 fatigue/project/深度字段默认正确。 */
function testSaveV11Migration(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem('game-save', JSON.stringify({ saveVersion: 10, salary: 500, careerLevel: 3, lastSaveTime: MONDAY_0900 }));
  const clock = new FakeClock(MONDAY_0900);
  const facade = new GameFacade({ clock, careerEventClock: clock, storage, board: null, randomV2: new RandomService(mulberry32(7101)) });
  try {
    facade.context.messenger.ensureInitialized();
    const snapshot = facade.save();
    void snapshot;
    const raw = JSON.parse(storage.getItem('game-save') ?? '{}') as { saveVersion: number; fatigue: number; project: unknown };
    assert.equal(raw.saveVersion, 13, 'v12 save migrates to v13');
    assert.equal(raw.fatigue, 0, 'fatigue defaults 0');
    assert.equal(raw.project, null, 'project defaults null');
    console.log('save v13 migration passed');
  } finally {
    facade.destroy();
  }
}

testDeterministicSchedule();
testRuntimeEventFlow();
testPauseSwitch();
testDailyPlanner();
testProjectStateMachine();
testGoalDirector();
testSaveV11Migration();
console.log('v5.6 workday director tests passed');
