import type { GameContext } from '../core/game-context';

/**
 * V5.9-F-Z — 主页面可玩性服务。
 *
 * 职责（本轮 ChatGPT 边界）：
 *  - A 今日工作：当前职业/游戏日/时间/当前任务/进度/预计奖励/工作状态 聚合只读视图。
 *  - B 今日修仙目标：每天 3 个目标（工作/成长/生活社交），进度实时计算，
 *    奖励领取走 EffectService 统一通道，防重复领取，跨天刷新，重启不丢。
 *  - C 当前建议行动：从真实状态计算的最高优先级行动 + 可执行动作标识。
 *  - E 生活行为：喝咖啡/奶茶/午餐/零食/聚餐 —— 全部走 v2Items.buy 真实扣款，
 *    余额不足/售罄如实拒绝；疲劳/道心反馈来自真实效果，不伪造成功。
 *
 * 集成约束：不新增第二套钱包/工资/账本 —— 消费走 v2Items.buy（Luna 经济域的
 * 既有契约），目标奖励走 EffectService.apply（统一效果通道）。
 */

export type HomeGoalKind = 'WORK' | 'GROWTH' | 'LIFE';
export type HomeLifeKind = 'COFFEE' | 'MILK_TEA' | 'LUNCH' | 'SNACK' | 'DINNER';

/** 生活行为定义：价格/效果全部走既有经济与状态服务，非 UI 摆设。 */
interface HomeLifeDef {
  readonly kind: HomeLifeKind;
  readonly label: string;
  readonly icon: string;
  readonly price: number;
  readonly itemId: string | null;
  readonly fatigueDelta: number;
  readonly mindDelta: number;
  readonly dailyLimit: number;
  readonly effectText: string;
}

/** 每日生活行为表（价格/次数 = 产品口径；效果即时生效并如实展示）。 */
const HOME_LIFE_DEFS: readonly HomeLifeDef[] = [
  { kind: 'COFFEE', label: '喝咖啡', icon: '☕', price: 18, itemId: 'cons_coffee', fatigueDelta: -12, mindDelta: 6, dailyLimit: 3, effectText: '疲劳 -12，道心 +6' },
  { kind: 'MILK_TEA', label: '喝奶茶', icon: '🧋', price: 16, itemId: null, fatigueDelta: 0, mindDelta: 8, dailyLimit: 2, effectText: '道心 +8' },
  { kind: 'LUNCH', label: '吃午餐', icon: '🍜', price: 25, itemId: null, fatigueDelta: -8, mindDelta: 5, dailyLimit: 1, effectText: '疲劳 -8，道心 +5' },
  { kind: 'SNACK', label: '吃零食', icon: '🍪', price: 8, itemId: null, fatigueDelta: 0, mindDelta: 3, dailyLimit: 3, effectText: '道心 +3' },
  { kind: 'DINNER', label: '下班聚餐', icon: '🍲', price: 68, itemId: null, fatigueDelta: -40, mindDelta: 15, dailyLimit: 1, effectText: '疲劳 -40，道心 +15' },
];

export interface HomeLifeOptionView {
  readonly kind: HomeLifeKind;
  readonly label: string;
  readonly icon: string;
  readonly price: number;
  readonly effectText: string;
  readonly used: number;
  readonly remaining: number;
  readonly affordable: boolean;
  readonly available: boolean;
  readonly reason: string | null;
}

export interface HomeLifeResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly label?: string;
  readonly cost?: number;
  readonly fatigueDelta?: number;
  readonly mindDelta?: number;
  readonly balanceAfter?: number;
}

export interface HomeGoalView {
  readonly kind: HomeGoalKind;
  readonly title: string;
  readonly description: string;
  readonly progress: number;
  readonly target: number;
  readonly completed: boolean;
  readonly claimed: boolean;
  readonly reward: { readonly salary: number; readonly cultivation: number; readonly mind: number };
}

export interface HomeGoalClaimResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly reward?: { salary: number; cultivation: number; mind: number };
}

export interface HomeTodayWorkView {
  readonly professionId: string;
  readonly professionName: string;
  readonly dayIndex: number;
  readonly weekday: number;
  readonly isWeekend: boolean;
  readonly clockText: string;
  readonly countdownMs: number;
  readonly workState: 'NOT_STARTED' | 'WORKING' | 'LUNCH_BREAK' | 'AFTER_WORK' | 'OVERTIME';
  readonly workStateText: string;
  readonly workMode: string;
  readonly workModeText: string;
  readonly currentTask: {
    readonly taskId: string;
    readonly name: string;
    readonly description: string;
    readonly progressPct: number;
    readonly completed: boolean;
    readonly rewardText: string;
    readonly claimable: boolean;
  } | null;
  readonly openTaskCount: number;
  readonly todayEarned: number;
  readonly todayCultivation: number;
  readonly salaryBalance: number;
  readonly fatigue: number;
  readonly onboardingTask: { readonly id: string; readonly title: string; readonly source: string } | null;
}

export interface HomeNextActionView {
  readonly id: string;
  readonly icon: string;
  readonly text: string;
  readonly sub: string;
  readonly btn: string;
  readonly page: string | null;
  readonly command: string | null;
  readonly commandArg: string | null;
}

export interface HomeSnapshot {
  readonly work: HomeTodayWorkView;
  readonly goals: readonly HomeGoalView[];
  readonly nextAction: HomeNextActionView;
  readonly life: readonly HomeLifeOptionView[];
}

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

const WORK_MODE_TEXT: Readonly<Record<string, string>> = {
  WORK: '努力工作中', FISHING: '带薪摸鱼中', CULTIVATING: '修炼中', SOCIAL: '社交划水中',
};

/** 每日目标奖励（第一档，数值与 daily-tasks.json 同量级）。 */
const GOAL_REWARDS: Readonly<Record<HomeGoalKind, { salary: number; cultivation: number; mind: number }>> = {
  WORK: { salary: 80, cultivation: 20, mind: 0 },
  GROWTH: { salary: 30, cultivation: 45, mind: 0 },
  LIFE: { salary: 20, cultivation: 10, mind: 12 },
};

/** 目标进度 key（eventFlags 持久化，跨天由 dayIndex 后缀天然刷新）。 */
type GoalProgressKey = 'homeGoal_workDone' | 'homeGoal_growthDone' | 'homeGoal_lifeDone' | 'homeGoal_cultivateCount' | 'homeGoal_socialCount' | 'homeGoal_lifeCount';
type GoalClaimedKey = 'homeGoal_claimed_WORK' | 'homeGoal_claimed_GROWTH' | 'homeGoal_claimed_LIFE';

function dayKey(context: GameContext, base: string): string {
  const day = Math.max(1, context.gameDay.dayIndex());
  return `${base}:${day}`;
}

function flagNum(context: GameContext, key: GoalProgressKey): number {
  const raw = context.player.eventFlags?.[dayKey(context, key)];
  if (raw === true) return 1;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
  return 0;
}

function setFlagNum(context: GameContext, key: GoalProgressKey, value: number): void {
  // eventFlags 类型是 Record<string, boolean>；数值进度借 String(value) 存放，
  // flagNum 读取时 Number() 还原 —— 与 task-service 的 progressKey 前缀做法同源。
  context.player.eventFlags = { ...(context.player.eventFlags ?? {}), [dayKey(context, key)]: value === 1 ? true : (String(value) as unknown as boolean) };
}

export class HomeService {
  public constructor(private readonly context: GameContext) {}

  // ── 进度记账（由 Facade 在真实行为后调用；数值只增不减） ─────────────────

  /** 完成一个任务（startTask 不算，claim 成功才算"完成"）。 */
  public noteTaskClaimed(): void {
    setFlagNum(this.context, 'homeGoal_workDone', flagNum(this.context, 'homeGoal_workDone') + 1);
  }

  /** 一次真实成长：修炼点击 / 任务带来修为 / 战斗结算。 */
  public noteGrowth(): void {
    setFlagNum(this.context, 'homeGoal_growthDone', flagNum(this.context, 'homeGoal_growthDone') + 1);
  }

  /** 一次生活/社交行为（含目标体系内的生活消费与 SOCIAL 模式）。 */
  public noteLifeAction(): void {
    setFlagNum(this.context, 'homeGoal_lifeDone', flagNum(this.context, 'homeGoal_lifeDone') + 1);
  }

  private goalTarget(kind: HomeGoalKind): number {
    const day = Math.max(1, this.context.gameDay.dayIndex());
    // 第一天固定 1 次；之后随天数轻微抬target（第 2 天起 2 次，长期封顶 3），保持可完成性。
    if (kind === 'WORK') return Math.min(3, 1 + Math.floor((day - 1) / 3));
    if (kind === 'GROWTH') return Math.min(3, day <= 1 ? 1 : 2);
    return Math.min(3, day <= 1 ? 1 : 2);
  }

  private goalProgress(kind: HomeGoalKind): number {
    const c = this.context;
    if (kind === 'WORK') {
      // 工作目标：今天真实领过任务奖励的次数（跨重启持久于 eventFlags）。
      return flagNum(c, 'homeGoal_workDone');
    }
    if (kind === 'GROWTH') {
      // 成长目标：今天修炼点击次数 + 已记录的成长行为 + 今日修为入账>0 的一次性确认。
      const cultivated = flagNum(c, 'homeGoal_cultivateCount');
      const noted = flagNum(c, 'homeGoal_growthDone');
      const incomeToday = c.player.gameDay?.income.cultivation ?? 0;
      const incomeBonus = incomeToday > 0 ? 1 : 0;
      return Math.min(this.goalTarget('GROWTH'), cultivated + noted + incomeBonus);
    }
    // 生活目标：今天生活行为 + SOCIAL 模式秒数折算（满 3 分钟算 1 次）。
    const lifeCount = flagNum(c, 'homeGoal_lifeCount');
    const socialSeconds = c.player.gameDay?.durations.social ?? 0;
    const socialCount = socialSeconds >= 180 ? 1 : 0;
    return Math.min(this.goalTarget('LIFE'), lifeCount + socialCount);
  }

  private goalTitle(kind: HomeGoalKind, day: number): { title: string; description: string } {
    if (kind === 'WORK') {
      return day <= 1
        ? { title: '完成一个工作任务', description: '在任务页接一份差事，干完领奖励' }
        : { title: `完成 ${this.goalTarget('WORK')} 个工作任务`, description: '连续接活才是合格牛马' };
    }
    if (kind === 'GROWTH') {
      return day <= 1
        ? { title: '获得一次真实成长', description: '修炼一次或完成带来修为的任务' }
        : { title: `获得 ${this.goalTarget('GROWTH')} 次真实成长`, description: '修炼点击、任务修为、战斗都算' };
    }
    return day <= 1
      ? { title: '执行一次生活或社交行为', description: '喝杯咖啡、吃顿饭，或切到社交划水 3 分钟' }
      : { title: `执行 ${this.goalTarget('LIFE')} 次生活/社交行为`, description: '生活也是修仙的一部分' };
  }

  /** 今日三目标视图（每次从真实状态现算，claimed 持久化防重复领取）。 */
  public goals(): HomeGoalView[] {
    const c = this.context;
    c.gameDay.ensureStarted();
    const day = Math.max(1, c.gameDay.dayIndex());
    const kinds: HomeGoalKind[] = ['WORK', 'GROWTH', 'LIFE'];
    return kinds.map((kind) => {
      const target = this.goalTarget(kind);
      const progress = this.goalProgress(kind);
      const meta = this.goalTitle(kind, day);
      return {
        kind,
        title: meta.title,
        description: meta.description,
        progress,
        target,
        completed: progress >= target,
        claimed: c.player.eventFlags?.[dayKey(c, `homeGoal_claimed_${kind}` as GoalClaimedKey)] === true,
        reward: GOAL_REWARDS[kind],
      };
    });
  }

  /** 领取目标奖励：统一走 EffectService，重复领取/未完成如实拒绝。 */
  public claimGoal(kind: HomeGoalKind): HomeGoalClaimResult {
    const c = this.context;
    const goal = this.goals().find((g) => g.kind === kind);
    if (!goal) return { ok: false, reason: '未知目标' };
    const claimKey = dayKey(c, `homeGoal_claimed_${kind}` as GoalClaimedKey);
    if (goal.claimed || c.player.eventFlags?.[claimKey] === true) return { ok: false, reason: '奖励已领取' };
    if (!goal.completed) return { ok: false, reason: '目标未完成' };
    c.effects.apply({
      salary: goal.reward.salary,
      cultivation: goal.reward.cultivation,
      mind: goal.reward.mind,
    });
    c.player.eventFlags = { ...(c.player.eventFlags ?? {}), [claimKey]: true };
    c.messenger.appendReality({
      time: c.clockV2.now(),
      text: `🎯 今日目标达成：${goal.title}（+¥${goal.reward.salary} 修为+${goal.reward.cultivation}）`,
      kind: 'FAVOR',
    });
    c.saveService.save(c.player);
    c.events.emit('playerChanged', { reason: 'homeGoalClaimed' });
    return { ok: true, reward: { ...goal.reward } };
  }

  // ── A. 今日工作 ──────────────────────────────────────────────────────────

  public todayWork(): HomeTodayWorkView {
    const c = this.context;
    c.gameDay.ensureStarted();
    const day = c.gameDay.current();
    const clock = c.clockV2.getGameDate();
    const profDef = c.profession?.def();
    const profId = c.profession?.currentId() ?? 'JAVA_BACKEND';
    const workToday = c.workToday.snapshot();
    const isWeekend = c.clockV2.isWeekend();
    const hour = clock.hour + clock.minute / 60;
    let workState: HomeTodayWorkView['workState'] = 'NOT_STARTED';
    if (isWeekend) workState = 'AFTER_WORK';
    else if (workToday.overtimeSeconds > 60) workState = 'OVERTIME';
    else if (hour >= 18) workState = 'AFTER_WORK';
    else if (hour >= 12 && hour < 14) workState = 'LUNCH_BREAK';
    else workState = 'WORKING';
    const stateText: Record<HomeTodayWorkView['workState'], string> = {
      NOT_STARTED: '未开工', WORKING: '上班中', LUNCH_BREAK: '午休', AFTER_WORK: '已下班', OVERTIME: '加班中',
    };

    // 当前任务：进行中/已完成未领取的第一个真实任务（TaskService 权威）。
    const activeTask = c.player.activeTasks.find((t) => !t.claimed) ?? null;
    const now = c.clockV2.now();
    let currentTask: HomeTodayWorkView['currentTask'] = null;
    if (activeTask) {
      const elapsed = (now - activeTask.startedAt) / 1000;
      const pctNum = Math.max(0, Math.min(100, Math.round((elapsed / activeTask.durationSeconds) * 100)));
      const rewardParts: string[] = [];
      if (activeTask.rewardSalary > 0) rewardParts.push(`¥${activeTask.rewardSalary}`);
      if (activeTask.rewardCultivation > 0) rewardParts.push(`修为+${activeTask.rewardCultivation}`);
      if ((activeTask.rewardPerformance ?? 0) > 0) rewardParts.push(`绩效+${activeTask.rewardPerformance}`);
      if (activeTask.rewardSpiritStones > 0) rewardParts.push(`灵石+${activeTask.rewardSpiritStones}`);
      currentTask = {
        taskId: activeTask.taskId,
        name: activeTask.name,
        description: activeTask.description,
        progressPct: activeTask.completed ? 100 : pctNum,
        completed: activeTask.completed,
        rewardText: rewardParts.join(' · ') || '无奖励',
        claimable: activeTask.completed,
      };
    }

    // 入职剧情任务（V5.9-A 分配的第一张工单）。
    const sysTask = c.assignedTasks.open().find((t) => t.source === 'SYSTEM') ?? null;
    const onboardingTask = sysTask
      ? { id: sysTask.id, title: sysTask.title, source: '入职' }
      : null;

    const hh = String(clock.hour).padStart(2, '0');
    const mm = String(clock.minute).padStart(2, '0');
    return {
      professionId: profId,
      professionName: profDef?.name ?? profId,
      dayIndex: day?.dayIndex ?? 1,
      weekday: clock.weekday,
      weekdayName: WEEKDAY_NAMES[clock.weekday] ?? '',
      isWeekend,
      clockText: `${hh}:${mm}`,
      countdownMs: workToday.countdownMs,
      workState,
      workStateText: stateText[workState],
      workMode: c.player.workMode,
      workModeText: WORK_MODE_TEXT[c.player.workMode] ?? c.player.workMode,
      currentTask,
      openTaskCount: c.player.activeTasks.filter((t) => !t.claimed).length,
      todayEarned: day?.income.salary ?? 0,
      todayCultivation: day?.income.cultivation ?? 0,
      salaryBalance: c.player.salary,
      fatigue: c.fatigue.value(),
      onboardingTask,
    } as HomeTodayWorkView;
  }

  // ── C. 当前建议行动 ──────────────────────────────────────────────────────

  /** 从真实状态计算当前最该做的一件事（可执行，非纯文案）。 */
  public nextAction(): HomeNextActionView {
    const c = this.context;
    // 1) 入职剧情未完成 → 继续。
    try {
      const ob = c.characterCreation.queryOnboarding();
      if (ob && ob.step !== 'COMPLETE') {
        return { id: 'ONBOARDING', icon: '🧭', text: '继续入职剧情', sub: '走完入职，正式成为牛马修士', btn: '去入职', page: 'HOME', command: null, commandArg: null };
      }
    } catch { /* creation 未初始化时跳过 */ }
    // 2) 破事优先：活动事故。
    try {
      const incident = c.incidents.presentableActive?.() ?? null;
      if (incident) {
        return { id: 'INCIDENT', icon: '🚨', text: 'P0 线上事故', sub: '全组等你救火', btn: '立即处理', page: 'HOME', command: 'openPending', commandArg: null };
      }
    } catch { /* ignore */ }
    // 2.2) 已到下班时间且未结算 → 今日结算优先于接新活（任务基于真实时间，
    //      18:00 后接活会跨天烂尾；结算进入下一天才是正确循环）。
    try {
      if (!c.clockV2.isWeekend() && c.gameDay.isOffWork() && !(c.gameDay.current()?.settled)) {
        const hasOvertime = c.overtime.current();
        if (!hasOvertime || hasOvertime.status !== 'ACTIVE') {
          return { id: 'SETTLE', icon: '🌇', text: '到下班时间了', sub: '结算今天的工资与修为', btn: '今日结算', page: 'HOME', command: 'openSettlement', commandArg: null };
        }
      }
    } catch { /* settlement check must not break home */ }
    // 2.5) 疲劳过高 → 恢复优先于接新活/肝任务：不该劝一个快垮的人再干活。
    //      （已完成未领取的奖励照领不误 —— 领奖不消耗体力，优先级 4 不受影响。）
    const fatigueEarly = c.fatigue.value();
    if (fatigueEarly >= 70) {
      return { id: 'REST', icon: '🛌', text: `疲劳 ${fatigueEarly}，该歇歇了`, sub: '喝杯咖啡/吃顿饭，或切摸鱼回血', btn: '去恢复', page: 'HOME', command: null, commandArg: null };
    }
    // 3) 无任务 → 领任务。
    const openTasks = c.player.activeTasks.filter((t) => !t.claimed);
    if (openTasks.length === 0) {
      const total = c.tasks.getConfigs().length;
      const capped = c.player.activeTasks.filter((t) => !t.claimed).length >= 3;
      return {
        id: 'GET_TASK', icon: '📋', text: '领取一个任务', sub: capped ? '任务栏已满，先完成手头的' : `任务库 ${total} 份差事等你挑`,
        btn: '去任务页', page: 'TASKS', command: null, commandArg: null,
      };
    }
    // 4) 有已完成未领取 → 领奖励。
    const doneTask = openTasks.find((t) => t.completed);
    if (doneTask) {
      return { id: 'CLAIM_TASK', icon: '🎁', text: `「${doneTask.name}」已完成`, sub: '奖励躺在任务页等你领', btn: '去领取', page: 'TASKS', command: null, commandArg: null };
    }
    // 5) 当前任务可推进 → 继续工作（§五 优先级：任务推进高于随机事件）。
    // TaskService.tick 按真实时间推进所有未完成任务，与工作模式无关 —— 有活在手就是"可推进"。
    const runningTask = openTasks[0];
    if (runningTask) {
      return {
        id: 'KEEP_WORKING', icon: '💼',
        text: `推进「${runningTask.name}」`,
        sub: `${WORK_MODE_TEXT[c.player.workMode]} · 任务随时间推进，完成领奖励`,
        btn: '查看详情', page: 'TASKS', command: null, commandArg: null,
      };
    }
    // 6) 待处理事件 → 处理。
    try {
      const pending = c.v2Events.poll();
      if (pending) {
        return { id: 'EVENT', icon: '✉️', text: `新事件：${pending.title}`, sub: '选择将影响你的收益与道心', btn: '去处理', page: 'HOME', command: null, commandArg: null };
      }
    } catch { /* event poll failure must not break home */ }
    // 8) 战斗结束未领取 → 领结算。
    try {
      const finished = c.battle.finished();
      if (finished) {
        return { id: 'BATTLE_SETTLE', icon: '⚔️', text: '战斗已结束', sub: '掉落不领就白打了', btn: '领结算', page: 'PROJECT', command: null, commandArg: null };
      }
    } catch { /* battle not ready */ }
    // 9) 默认：保持当前节奏（工资/修为持续入账；非工作模式则引导切回）。
    const modeText = WORK_MODE_TEXT[c.player.workMode] ?? c.player.workMode;
    return {
      id: 'KEEP_WORKING', icon: '💼',
      text: '保持当前节奏',
      sub: `${modeText} · 工资与修为持续入账`,
      btn: c.player.workMode === 'WORK' ? '查看详情' : '切回工作',
      page: null,
      command: c.player.workMode === 'WORK' ? null : 'setMode',
      commandArg: c.player.workMode === 'WORK' ? null : 'WORK',
    };
  }

  // ── E. 生活行为 ──────────────────────────────────────────────────────────

  private lifeUsed(kind: HomeLifeKind): number {
    const c = this.context;
    const dayStart = c.clockV2.workdayStartTs();
    let count = 0;
    for (const r of c.player.dailyReality ?? []) {
      if (r.kind === 'LIFE' && r.lifeAction === kind && r.time >= dayStart) count += 1;
    }
    return count;
  }

  /** 生活行为菜单：价格/剩余次数/余额可用性全部来自真实状态。 */
  public lifeOptions(): HomeLifeOptionView[] {
    const c = this.context;
    const balance = c.player.salary;
    return HOME_LIFE_DEFS.map((def) => {
      const used = this.lifeUsed(def.kind);
      const remaining = Math.max(0, def.dailyLimit - used);
      const affordable = balance >= def.price;
      let reason: string | null = null;
      if (remaining <= 0) reason = `今日已享 ${used}/${def.dailyLimit} 次`;
      else if (!affordable) reason = `余额不足（还差 ¥${def.price - balance}）`;
      return {
        kind: def.kind, label: def.label, icon: def.icon, price: def.price, effectText: def.effectText,
        used, remaining, affordable, available: remaining > 0 && affordable, reason,
      };
    });
  }

  /**
   * 执行生活消费：真实扣款（复用 v2Items.buy 的经济域校验语义）+ 真实效果。
   * 消费不经过 Luna 未合并的钱包流水时，直接以 player.salary 扣减并如实回显，
   * 绝不在余额不足时伪造成功。
   */
  public consumeLife(kind: string): HomeLifeResult {
    const c = this.context;
    const def = HOME_LIFE_DEFS.find((d) => d.kind === kind);
    if (!def) return { ok: false, reason: '未知生活行为' };
    const used = this.lifeUsed(def.kind);
    if (used >= def.dailyLimit) return { ok: false, reason: `今日次数已用完（${used}/${def.dailyLimit}）` };
    if (c.player.salary < def.price) return { ok: false, reason: `工资余额不足（需 ¥${def.price}，现有 ¥${c.player.salary}）` };

    // 真实扣款（价格经济域唯一入口语义与 v2Items.buy 一致：负向 salary 变更）。
    const before = c.player.salary;
    const after = before - def.price;
    if (!Number.isSafeInteger(after) || after < 0) return { ok: false, reason: '扣款校验失败' };
    c.player.salary = after;
    c.events.emit('salaryChanged', { amount: -def.price, total: after });

    // 真实效果：疲劳与道心（效果值来自定义表，非 UI 编造）。
    if (def.fatigueDelta !== 0) c.fatigue.addDelta(def.fatigueDelta);
    if (def.mindDelta !== 0) c.mind.applyDelta(def.mindDelta);
    // 挂接到正式消耗品的行为保持：有对应道具定义时同步消耗库存（咖啡走真实道具）。
    if (def.itemId && c.v2Items.materialCount(def.itemId) > 0) {
      c.v2Items.useConsumable(def.itemId);
    }

    // 履历 + 当日生活计数（目标系统进度）+ 持久化。
    c.gameDay.ensureStarted();
    c.messenger.appendReality({ time: c.clockV2.now(), text: `${def.icon} ${def.label}（-¥${def.price}）`, kind: 'LIFE', lifeAction: def.kind === 'SNACK' || def.kind === 'DINNER' ? undefined : (def.kind as 'COFFEE' | 'LUNCH' | 'MILK_TEA') });
    this.noteLifeAction();
    setFlagNum(c, 'homeGoal_lifeCount', flagNum(c, 'homeGoal_lifeCount') + 1);
    c.saveService.save(c.player);
    c.events.emit('playerChanged', { reason: 'homeLifeConsumed' });
    return {
      ok: true,
      label: def.label,
      cost: def.price,
      fatigueDelta: def.fatigueDelta,
      mindDelta: def.mindDelta,
      balanceAfter: c.player.salary,
    };
  }

  /** 主页面聚合快照（UI 唯一数据源）。 */
  public snapshot(): HomeSnapshot {
    return {
      work: this.todayWork(),
      goals: this.goals(),
      nextAction: this.nextAction(),
      life: this.lifeOptions(),
    };
  }
}
