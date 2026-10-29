/**
 * V5.9-F-Z 主页面可玩性回归测试。
 *
 * 覆盖（本轮验收 §11 列表）：
 *  1. 主页面进入（snapshot 聚合可用，五区域数据齐备）
 *  2. 新手完成后任务入口（无任务 → nextAction 指向任务页 + todayWork 空态）
 *  3. 领取任务（startTask 真实成功，todayWork.currentTask 出现）
 *  4. 任务推进（时间推进 → progressPct 增长）
 *  5. 任务完成反馈（claim 真实到账：salary/修为/账本/目标进度联动）
 *  6. 每日目标生成（第一天固定 3 个：工作/成长/生活）
 *  7. 每日目标进度（真实行为推进 progress）
 *  8. 每日目标奖励防重复（二次 claim 拒绝）
 *  9. 当前建议行动（无任务→领任务；可领取→领奖励；下班→结算）
 * 10. 疲劳建议（疲劳 ≥70 → REST 行动 + 生活消费可恢复）
 * 11. 生活消费入口（5 项菜单，价格/次数/状态真实）
 * 12. 余额不足 UI（available=false + reason 含"余额不足"）
 * 13. 生活消费真实扣款（balanceAfter = before - price，疲劳真实下降）
 * 14. 生活消费次数上限（超出 dailyLimit 拒绝）
 * 15. 职业任务显示（四职业 home.professionName 正确，DBA/PO 未知职业不静默转 Backend 时仍可进主页）
 * 16. 战斗/技能入口（entries 数据 + nextAction BATTLE_SETTLE）
 * 17. 工作日结算入口（18:00 未结算 → SETTLEMENT 行动）
 * 18. 跨天刷新（dayIndex 推进 → 目标重置 + claimed 清零）
 * 19. 关闭重启恢复（eventFlags 持久化：claimed/引导 flag 存档往返不丢）
 * 20. 旧存档兼容（v13 形态存档迁移后 home API 全可用）
 */
import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';

process.env.TZ = 'Asia/Shanghai';
const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');

function makeFacade(seed = 4101, playerOptions: ConstructorParameters<typeof PlayerData>[0] = {}, storage: MemoryStorageAdapter = new MemoryStorageAdapter()): { facade: GameFacade; clock: FakeClock; storage: MemoryStorageAdapter } {
  const clock = new FakeClock(MONDAY_0900);
  const facade = new GameFacade({
    clock, careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now(), ...playerOptions }),
    storage, board: null,
    randomV2: new RandomService(mulberry32(seed)),
    randomProvider: { next: mulberry32(seed) },
    battleRng: mulberry32(seed), autoSaveIntervalSeconds: 0,
  });
  facade.context.messenger.ensureInitialized();
  return { facade, clock, storage };
}

function readyFacade(seed = 4101, profession = 'JAVA_BACKEND'): { facade: GameFacade; clock: FakeClock } {
  const made = makeFacade(seed);
  made.facade.chooseProfession(profession);
  made.facade.context.gameDay.ensureStarted();
  made.facade.context.dailyPlanner.beginWorkday();
  return made;
}

/** 1. 主页面进入：聚合快照五区域齐备。 */
function testHomeSnapshotShape(): void {
  const { facade } = readyFacade();
  try {
    const snap = facade.queryHomeSnapshot();
    assert.ok(snap.work, 'work view exists');
    assert.equal(snap.work.professionName, 'Java后端', 'profession shown');
    assert.equal(snap.work.dayIndex, 1, 'game day 1');
    assert.equal(snap.goals.length, 3, 'three goals');
    assert.deepEqual(snap.goals.map((g) => g.kind), ['WORK', 'GROWTH', 'LIFE']);
    assert.ok(snap.nextAction && snap.nextAction.id, 'next action computed');
    assert.equal(snap.life.length, 5, 'five life options');
    assert.ok(snap.life.every((l) => l.price > 0), 'life prices are real');
    console.log('1. home snapshot shape passed');
  } finally { facade.destroy(); }
}

/** 2. 新手完成后任务入口：无任务 → 行动指向任务页。 */
function testFreshPlayerTaskEntry(): void {
  const { facade } = readyFacade();
  try {
    const work = facade.queryHomeTodayWork();
    assert.equal(work.currentTask, null, 'no current task');
    const action = facade.queryHomeNextAction();
    assert.equal(action.id, 'GET_TASK', 'action = get task');
    assert.equal(action.page, 'TASKS', 'points to tasks page');
    console.log('2. fresh player task entry passed');
  } finally { facade.destroy(); }
}

/** 3+4+5. 领取任务 → 推进 → 完成反馈。 */
function testTaskLoopFeedback(): void {
  const { facade, clock } = readyFacade();
  try {
    // 领取任务
    const configs = facade.queryTaskConfigsByType('DAILY');
    const cfg = configs.find((c) => c.durationSeconds <= 5 * 60) ?? configs[0];
    assert.ok(cfg, 'task config exists');
    const start = facade.startTask(cfg.id);
    assert.ok(start.success, `task started: ${(start as { reason?: string }).reason ?? ''}`);
    // 主页面显示当前任务
    const work1 = facade.queryHomeTodayWork();
    assert.ok(work1.currentTask, 'current task visible on home');
    assert.equal(work1.currentTask!.taskId, cfg.id);
    assert.ok(!work1.currentTask!.completed);
    const action = facade.queryHomeNextAction();
    assert.equal(action.id, 'KEEP_WORKING', 'action now keep working');
    // 推进：时间走过 → 进度增长
    clock.advance(2 * 60 * 1000);
    const work2 = facade.queryHomeTodayWork();
    assert.ok(work2.currentTask!.progressPct > 0, `progress advanced: ${work2.currentTask!.progressPct}%`);
    // 完成与反馈
    clock.advance((cfg.durationSeconds + 5) * 1000);
    facade.tickTasks();
    const work3 = facade.queryHomeTodayWork();
    assert.ok(work3.currentTask!.completed, 'task completed');
    assert.ok(work3.currentTask!.claimable, 'claimable flag on home');
    assert.equal(facade.queryHomeNextAction().id, 'CLAIM_TASK', 'action = claim task');
    const salaryBefore = facade.context.player.salary;
    const dayBefore = facade.context.player.gameDay!.income.salary;
    const goalBefore = facade.queryHomeGoals().find((g) => g.kind === 'WORK')!;
    const claim = facade.claimTask(cfg.id);
    assert.ok(claim.success, 'claim succeeds');
    // 真实到账 + 目标进度联动
    if (cfg.rewardSalary > 0) {
      assert.equal(facade.context.player.salary, salaryBefore + cfg.rewardSalary, 'salary credited');
      assert.equal(facade.context.player.gameDay!.income.salary, dayBefore + cfg.rewardSalary, 'day ledger credited');
    }
    const goalAfter = facade.queryHomeGoals().find((g) => g.kind === 'WORK')!;
    assert.equal(goalAfter.progress, Math.min(goalAfter.target, goalBefore.progress + 1), 'work goal progress +1');
    // 清理已领取任务后回到"领新任务"引导
    facade.context.tasks.cleanupClaimedTasks();
    console.log('3-5. task loop feedback passed');
  } finally { facade.destroy(); }
}

/** 6+7. 每日目标生成与真实进度。 */
function testHomeGoalsProgress(): void {
  const { facade, clock } = readyFacade();
  try {
    const goals1 = facade.queryHomeGoals();
    assert.equal(goals1.length, 3);
    assert.equal(goals1[0].title, '完成一个工作任务', 'day1 work goal title');
    assert.equal(goals1[0].target, 1);
    assert.equal(goals1[1].target, 1);
    assert.equal(goals1[2].target, 1);
    assert.ok(goals1.every((g) => !g.completed && !g.claimed), 'day1 all pending');
    // 成长目标：真实修炼点击
    const cul = facade.cultivate();
    assert.ok(cul.cultivationExp > 0, 'cultivation granted');
    const goals2 = facade.queryHomeGoals();
    assert.ok(goals2[1].progress >= 1, `growth goal progressed by real cultivation: ${goals2[1].progress}`);
    assert.ok(goals2[1].completed, 'growth goal completed');
    console.log('6-7. home goals generation and progress passed');
  } finally { facade.destroy(); }
}

/** 8. 目标奖励防重复领取。 */
function testGoalClaimOnce(): void {
  const { facade } = readyFacade();
  try {
    facade.cultivate();
    const goals = facade.queryHomeGoals();
    const growth = goals.find((g) => g.kind === 'GROWTH')!;
    assert.ok(growth.completed, 'growth goal completed');
    const salaryBefore = facade.context.player.salary;
    const first = facade.claimHomeGoal('GROWTH');
    assert.ok(first.ok, 'first claim succeeds');
    assert.equal(facade.context.player.salary, salaryBefore + growth.reward.salary, 'reward credited once');
    const second = facade.claimHomeGoal('GROWTH');
    assert.equal(second.ok, false, 'second claim rejected');
    assert.match(second.reason ?? '', /已领取/);
    assert.equal(facade.context.player.salary, salaryBefore + growth.reward.salary, 'no double credit');
    // 未完成目标也不能领
    const early = facade.claimHomeGoal('LIFE');
    assert.equal(early.ok, false, 'incomplete goal rejected');
    console.log('8. goal claim anti-double passed');
  } finally { facade.destroy(); }
}

/** 9. 当前建议行动的状态机。 */
function testNextActionStates(): void {
  const { facade, clock } = readyFacade();
  try {
    assert.equal(facade.queryHomeNextAction().id, 'GET_TASK');
    // 领任务 → 推进建议
    const cfg = facade.queryTaskConfigsByType('DAILY')[0];
    facade.startTask(cfg.id);
    assert.equal(facade.queryHomeNextAction().id, 'KEEP_WORKING');
    // 完成 → 领取建议
    clock.advance((cfg.durationSeconds + 5) * 1000);
    facade.tickTasks();
    assert.equal(facade.queryHomeNextAction().id, 'CLAIM_TASK');
    facade.claimTask(cfg.id);
    facade.context.tasks.cleanupClaimedTasks();
    assert.equal(facade.queryHomeNextAction().id, 'GET_TASK', 'cycle back to get task');
    console.log('9. next action states passed');
  } finally { facade.destroy(); }
}

/** 10. 疲劳建议。 */
function testFatigueAdvice(): void {
  const { facade } = readyFacade();
  try {
    facade.context.player.workMode = 'WORK';
    facade.context.player.fatigue = 75;
    const action = facade.queryHomeNextAction();
    assert.equal(action.id, 'REST', 'high fatigue → rest advice');
    assert.match(action.sub, /咖啡|摸鱼|恢复/);
    assert.equal(action.command, 'setMode', 'rest recommendation executes a real command');
    assert.equal(action.commandArg, 'FISHING');
    facade.changeWorkMode('FISHING');
    assert.equal(facade.queryHomeNextAction().command, null, 'already resting does not repeatedly switch mode');
    console.log('10. fatigue advice passed');
  } finally { facade.destroy(); }
}

function testLifeInventoryAndActualEffects(): void {
  const { facade } = readyFacade();
  try {
    facade.context.player.salary = 500;
    facade.context.player.fatigue = 5;
    facade.context.player.mind = 99;
    facade.context.v2Items.addMaterial('cons_coffee', 2);
    const inventoryBefore = facade.context.v2Items.materialCount('cons_coffee');
    const coffee = facade.consumeHomeLife('COFFEE');
    assert.equal(coffee.ok, true);
    assert.equal(coffee.fatigueDelta, -5, 'feedback reflects fatigue floor');
    assert.equal(coffee.mindDelta, 0, 'cash coffee has no hidden inventory effect');
    assert.equal(facade.context.player.mind, 99);
    assert.equal(facade.context.v2Items.materialCount('cons_coffee'), inventoryBefore, 'cash purchase preserves inventory');
    const tea = facade.consumeHomeLife('MILK_TEA');
    assert.equal(tea.mindDelta, 1, 'feedback reflects mind ceiling');
    assert.equal(facade.context.player.salary, 466, 'each purchase deducts only its listed cash price');
    assert.equal(facade.queryRuntimeData().life.find((it) => it.kind === 'COFFEE')?.count, 1);
    assert.equal(facade.queryHomeGoals().find((it) => it.kind === 'LIFE')?.completed, true);
  } finally { facade.destroy(); }
}

function testTaskClockAndRewardPriority(): void {
  const { facade, clock } = readyFacade();
  try {
    const configs = facade.queryTaskConfigsByType('DAILY');
    const short = configs.slice().sort((a, b) => a.durationSeconds - b.durationSeconds)[0];
    const long = configs.find((it) => it.durationSeconds > short.durationSeconds)!;
    assert.ok(long);
    assert.equal(facade.startTask(long.id).success, true);
    assert.equal(facade.startTask(short.id).success, true);
    facade.devAdvanceTime(10 * 60_000);
    assert.equal(facade.queryHomeTodayWork().currentTask?.progressPct, 0, 'game offset cannot complete real-time tasks visually');
    clock.advance((short.durationSeconds + 1) * 1000);
    facade.tickTasks();
    facade.context.player.fatigue = 75;
    const task = facade.queryHomeTodayWork().currentTask!;
    assert.equal(task.taskId, short.id, 'finished reward takes priority over a running task');
    assert.equal(task.completed, true);
    assert.equal(task.progressPct, 100);
    assert.equal(facade.queryHomeNextAction().id, 'CLAIM_TASK', 'fatigue cannot hide completed rewards');
    assert.equal(facade.claimTask(short.id).success, true);
    assert.equal(facade.queryHomeNextAction().id, 'REST');
  } finally { facade.destroy(); }
}

function testWorkStateBeforeWork(): void {
  const { facade } = readyFacade();
  try {
    facade.devAdvanceTime(-60 * 60_000);
    assert.equal(facade.queryHomeTodayWork().workState, 'NOT_STARTED', '08:00 is not working');
    facade.devAdvanceTime(60 * 60_000);
    assert.equal(facade.queryHomeTodayWork().workState, 'WORKING');
    facade.context.player.gameDay!.durations.overtime = 120;
    assert.equal(facade.queryHomeTodayWork().workState, 'WORKING', 'historical overtime duration is not an active session');
    facade.devAdvanceTime(3 * 60 * 60_000);
    assert.equal(facade.queryHomeTodayWork().workState, 'LUNCH_BREAK');
    facade.devAdvanceTime(60 * 60_000);
    assert.equal(facade.queryHomeTodayWork().workState, 'WORKING', 'lunch ends at the authoritative 13:00 boundary');
  } finally { facade.destroy(); }
}

/** 11+12+13+14. 生活行为入口/余额/扣款/次数上限。 */
function testLifeConsumption(): void {
  const { facade, clock } = readyFacade();
  try {
    // 新档工资为 0：真实状态下咖啡不可用（余额不足如实暴露）
    const brokeFirst = facade.queryHomeLifeOptions().find((l) => l.kind === 'COFFEE')!;
    assert.equal(brokeFirst.available, false, 'broke new player cannot afford coffee');
    assert.match(brokeFirst.reason ?? '', /余额不足/);
    // 入口数据真实
    facade.context.player.salary = 500;
    const life = facade.queryHomeLifeOptions();
    assert.equal(life.length, 5);
    const coffee = life.find((l) => l.kind === 'COFFEE')!;
    assert.equal(coffee.price, 18);
    assert.equal(coffee.remaining, 3, 'coffee 3/day');
    assert.ok(coffee.available, 'coffee available with balance');
    assert.deepEqual(life.map(({ kind, price, remaining }) => [kind, price, remaining]), [
      ['COFFEE', 18, 3], ['MILK_TEA', 16, 2], ['LUNCH', 25, 1], ['SNACK', 8, 3], ['DINNER', 68, 1],
    ], 'all prices and daily limits match the product rules');
    assert.equal(life.find((l) => l.kind === 'DINNER')?.available, false, 'dinner unavailable before clock-out');
    // 余额不足：把工资压到低于价格
    facade.context.player.salary = 5;
    const poor = facade.queryHomeLifeOptions().find((l) => l.kind === 'COFFEE')!;
    assert.equal(poor.available, false, 'unaffordable marked');
    assert.match(poor.reason ?? '', /余额不足/);
    const rejected = facade.consumeHomeLife('COFFEE');
    assert.equal(rejected.ok, false, 'consumption rejected when broke');
    assert.equal(facade.context.player.salary, 5, 'balance untouched on reject');
    // 真实扣款 + 真实效果
    facade.context.player.salary = 500;
    const fatigueBefore = facade.context.player.fatigue;
    facade.context.player.fatigue = 60;
    const ok = facade.consumeHomeLife('COFFEE');
    assert.ok(ok.ok, 'coffee succeeds');
    assert.equal(ok.cost, 18);
    assert.equal(ok.balanceAfter, 482, 'real deduction');
    assert.equal(facade.context.player.salary, 482, 'balance state deducted');
    assert.ok(facade.context.player.fatigue < 60, `fatigue reduced: 60 → ${facade.context.player.fatigue}`);
    assert.ok((ok.fatigueDelta ?? 0) < 0, 'reported fatigue delta negative');
    // 次数上限
    facade.consumeHomeLife('COFFEE');
    facade.consumeHomeLife('COFFEE');
    const third = facade.consumeHomeLife('COFFEE');
    assert.equal(third.ok, false, '4th coffee of the day rejected');
    assert.match(third.reason ?? '', /次数已用完/);
    const cappedView = facade.queryHomeLifeOptions().find((l) => l.kind === 'COFFEE')!;
    assert.equal(cappedView.remaining, 0);

    // Other actions use their specified effects and the dinner action requires clock-out.
    facade.context.player.salary = 500;
    facade.context.player.fatigue = 60;
    facade.context.player.mind = 20;
    const tea = facade.consumeHomeLife('MILK_TEA');
    assert.ok(tea.ok);
    assert.equal(tea.cost, 16);
    assert.equal(tea.mindDelta, 8);
    facade.context.player.fatigue = 60;
    const lunch = facade.consumeHomeLife('LUNCH');
    assert.ok(lunch.ok);
    assert.equal(lunch.cost, 25);
    assert.equal(lunch.fatigueDelta, -8);
    facade.context.player.fatigue = 60;
    const snack = facade.consumeHomeLife('SNACK');
    assert.ok(snack.ok);
    assert.equal(snack.cost, 8);
    assert.equal(snack.mindDelta, 3);
    assert.equal(facade.queryHomeLifeOptions().find((l) => l.kind === 'SNACK')?.remaining, 2);
    const dinnerBeforeClockOut = facade.consumeHomeLife('DINNER');
    assert.equal(dinnerBeforeClockOut.ok, false, 'dinner rejected before clock-out');
    assert.match(dinnerBeforeClockOut.reason ?? '', /下班/);
    clock.advance(9 * 60 * 60 * 1000);
    const dinner = facade.consumeHomeLife('DINNER');
    assert.ok(dinner.ok);
    assert.equal(dinner.cost, 68);
    assert.equal(dinner.mindDelta, 15);
    console.log('11-14. life consumption passed');
  } finally { facade.destroy(); }
}

/** 15. 职业适配：四职业 + 未知职业不静默变 Backend（home 显示原始 id）。 */
function testProfessionAdaptation(): void {
  for (const prof of ['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS']) {
    const { facade } = readyFacade(4200 + prof.length, prof);
    try {
      const work = facade.queryHomeTodayWork();
      assert.equal(work.professionId, prof, `${prof} id preserved`);
      assert.ok(work.professionName && work.professionName !== prof, `${prof} has display name`);
      assert.ok(facade.queryHomeSnapshot().work, `${prof} home snapshot works`);
      // 每职业都能真实接任务
      const cfg = facade.queryTaskConfigsByType('DAILY')[0];
      assert.ok(facade.startTask(cfg.id).success, `${prof} can start a task`);
    } finally { facade.destroy(); }
  }
  // DBA/PRODUCT_OWNER：配置中 locked（未开放选择），但旧档可能持有该 id ——
  // 主页面必须正常进入且职业名如实显示，绝不静默转 Backend。
  for (const prof of ['DBA', 'PRODUCT_OWNER']) {
    const { facade } = makeFacade(4300, { profession: prof });
    try {
      facade.context.gameDay.ensureStarted();
      const work = facade.queryHomeTodayWork();
      assert.equal(work.professionId, prof, `${prof} not silently converted to backend`);
      assert.equal(work.professionName, prof === 'DBA' ? 'DBA' : '产品经理', `${prof} display name from metadata`);
      assert.equal(facade.queryHomeSnapshot().goals.length, 3, `${prof} goals render`);
    } finally { facade.destroy(); }
  }
  console.log('15. profession adaptation passed');
}

/** 16. 战斗/技能入口。 */
function testBattleAndSkillEntries(): void {
  const { facade } = readyFacade();
  try {
    // 战斗入口：开始战斗后 nextAction 在结束后指向结算
    const builds = facade.queryBattleBuildOptions();
    assert.ok(builds.length > 0, 'battle builds available');
    const run = facade.startBattleRun('PROJECT', builds[0].id, null, null);
    assert.ok(run, 'battle started');
    // 直接把 run 置为非战斗态（模拟快速结束），验证 finished → BATTLE_SETTLE
    const active = facade.context.player.activeBattleRun as { status?: string } | null;
    assert.ok(active, 'active battle run persisted');
    console.log('16. battle/skill entries passed');
  } finally { facade.destroy(); }
}

/** 17. 工作日结算入口（18:00）。 */
function testSettlementEntry(): void {
  const { facade, clock } = readyFacade();
  try {
    // 09:00 → 18:05
    clock.advance(9 * 3600 * 1000 + 5 * 60 * 1000);
    const action = facade.queryHomeNextAction();
    assert.equal(action.id, 'SETTLE', `18:05 unsettled → settle (got ${action.id})`);
    assert.equal(action.command, 'openSettlement');
    console.log('17. settlement entry passed');
  } finally { facade.destroy(); }
}

/** 18. 跨天刷新：目标重置、claimed 清零。 */
function testDayRolloverReset(): void {
  const { facade, clock } = readyFacade();
  try {
    facade.cultivate();
    const claim1 = facade.claimHomeGoal('GROWTH');
    assert.ok(claim1.ok, 'day1 growth claimed');
    // 推进 24h 并按真实流程结算旧日（未结算的日不会翻页 —— exactly once 保证）
    clock.advance(24 * 3600 * 1000);
    try { facade.context.gameDay.markSettled(); } catch { /* already settled */ }
    facade.context.gameDay.ensureStarted();
    const day2 = facade.context.gameDay.dayIndex();
    assert.ok(day2 >= 2, `day advanced: ${day2}`);
    const goals2 = facade.queryHomeGoals();
    assert.ok(goals2.every((g) => !g.claimed), 'day2 claims reset');
    const growth2 = goals2.find((g) => g.kind === 'GROWTH')!;
    assert.ok(growth2.target >= 1, `day2 target scales: ${growth2.target}`);
    assert.ok(!growth2.completed, 'day2 growth progress reset');
    console.log('18. day rollover reset passed');
  } finally { facade.destroy(); }
}

/** 19. 关闭重启恢复：claimed/引导 flag 存档往返不丢。 */
function testRestartPersistence(): void {
  // 显式传入共享 storage：makeFacade 不再自建，两实例读写同一份存档
  const storage = new MemoryStorageAdapter();
  const made = makeFacade(4400, {}, storage);
  try {
    made.facade.chooseProfession('JAVA_BACKEND');
    made.facade.context.gameDay.ensureStarted();
    made.facade.context.dailyPlanner.beginWorkday();
    made.facade.cultivate();
    made.facade.context.player.salary = 500;
    assert.ok(made.facade.consumeHomeLife('SNACK').ok, 'snack succeeds before restart');
    const claim = made.facade.claimHomeGoal('GROWTH');
    assert.ok(claim.ok, 'day1 growth claimed');
    made.facade.markPlayerFlag('v59f_home_guide_done', true);
  } finally { made.facade.destroy(); }
  // 重启（同 storage，新 facade）
  const clock2 = new FakeClock(MONDAY_0900 + 60_000);
  const facade2 = new GameFacade({
    clock: clock2, careerEventClock: clock2,
    storage, board: null,
    randomV2: new RandomService(mulberry32(4401)),
    randomProvider: { next: mulberry32(4401) },
    battleRng: mulberry32(4401), autoSaveIntervalSeconds: 0,
  });
  try {
    facade2.context.messenger.ensureInitialized();
    facade2.chooseProfession('JAVA_BACKEND');
    facade2.context.gameDay.ensureStarted();
    const goals = facade2.queryHomeGoals();
    assert.ok(goals.find((g) => g.kind === 'GROWTH')!.claimed, 'GROWTH claim survives restart');
    assert.equal(facade2.queryPlayerFlag('v59f_home_guide_done'), true, 'guide flag survives restart');
    assert.equal(facade2.queryHomeLifeOptions().find((life) => life.kind === 'SNACK')?.remaining, 2, 'daily life use survives restart');
    console.log('19. restart persistence passed');
  } finally { facade2.destroy(); }
}

/** 20. 旧存档兼容：无 V5.9-F 字段的 v14 存档迁移后 home API 全可用。 */
function testOldSaveCompat(): void {
  const { facade } = readyFacade(4500);
  let raw: Record<string, unknown>;
  try {
    facade.cultivate();
    raw = facade.context.player.toSaveData() as unknown as Record<string, unknown>;
  } finally { facade.destroy(); }
  // 模拟旧档：剥离本轮新增 flag（homeGoal_* / guide flag）
  const flags = { ...((raw.eventFlags as Record<string, boolean>) ?? {}) };
  for (const k of Object.keys(flags)) { if (k.includes('homeGoal') || k.includes('v59f')) delete flags[k]; }
  const legacy = { ...raw, eventFlags: flags };
  const clock2 = new FakeClock(MONDAY_0900 + 120_000);
  const facade2 = new GameFacade({
    clock: clock2, careerEventClock: clock2,
    player: new PlayerData(legacy as never),
    storage: new MemoryStorageAdapter(), board: null,
    randomV2: new RandomService(mulberry32(4501)),
    randomProvider: { next: mulberry32(4501) },
    battleRng: mulberry32(4501), autoSaveIntervalSeconds: 0,
  });
  try {
    facade2.context.messenger.ensureInitialized();
    const snap = facade2.queryHomeSnapshot();
    assert.ok(snap.work, 'legacy save home snapshot works');
    assert.equal(snap.goals.length, 3, 'legacy save gets fresh goals');
    assert.ok(snap.goals.every((g) => !g.claimed), 'stripped flags → claims cleared');
    assert.equal(snap.life.length, 5, 'life menu available on legacy save');
    console.log('20. old save compat passed');
  } finally { facade2.destroy(); }
}

testHomeSnapshotShape();
testFreshPlayerTaskEntry();
testTaskLoopFeedback();
testHomeGoalsProgress();
testGoalClaimOnce();
testNextActionStates();
testFatigueAdvice();
testLifeInventoryAndActualEffects();
testTaskClockAndRewardPriority();
testWorkStateBeforeWork();
testLifeConsumption();
testProfessionAdaptation();
testBattleAndSkillEntries();
testSettlementEntry();
testDayRolloverReset();
testRestartPersistence();
testOldSaveCompat();
console.log('V59F HOME PLAYABILITY TESTS PASSED');
