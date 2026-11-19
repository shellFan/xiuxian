import type { GameContext } from '../core/game-context';
import type { Clock } from '../core/clock';
import { DEFAULT_CLOCK } from '../core/clock';
import type { DailyTaskConfig, DailyTaskType } from '../model/config-types';
import type { DailyTaskState } from '../model/save-data';

export interface DailyTaskBundle {
  readonly tasks: readonly DailyTaskConfig[];
}

/** Per-task progress snapshot returned by `getProgress`. */
export interface DailyTaskProgress {
  readonly taskId: string;
  readonly type: DailyTaskType;
  readonly name: string;
  readonly description: string;
  readonly progress: number;
  readonly target: number;
  readonly completed: boolean;
  readonly claimed: boolean;
}

// ── DAILY-TASK-POOL-V1：每日任务随机池（docs/DAILY-TASK-POOL-V1.md） ──────────
// 每天 5 项（同族不重复——当前每族一条，天然满足）；按 UTC 日（北京时间 08:00）
// 持久化抽取结果：dayIndex 决定抽取，重启/切页不重抽（同日必同结果）。
// 枚举全部组合后按预算筛（salary750/cultivation100/performance30/mind45，旧六任务
// 合计上限，不是保证发满；超预算跳过模板，不自动缩奖励）。不足 5 个合格项时
// 安全降级为全部合格项。注：难度约束（≥2 EASY / ≤1 HARD）在配置接入难度元数据前不生效。
export const DAILY_POOL_SIZE = 5;
export const DAILY_POOL_BUDGET = Object.freeze({
  salary: 750,
  cultivation: 100,
  performance: 30,
  mind: 45,
} as const satisfies Record<string, number>);

export interface DailyPoolGate {
  /** 晋升任务入池条件：非满级（晋升机制可用）。 */
  readonly promotionAvailable: boolean;
  /** KPI 任务入池条件：当前职级存在 KPI 目标。 */
  readonly kpiAvailable: boolean;
}

const DAILY_POOL_BUDGET_KEYS = Object.keys(DAILY_POOL_BUDGET) as readonly (keyof typeof DAILY_POOL_BUDGET)[];

function dailyPoolTaskBudgetSum(tasks: readonly DailyTaskConfig[], key: keyof typeof DAILY_POOL_BUDGET): number {
  return tasks.reduce((sum, cfg) => {
    const value = (cfg.reward as unknown as Record<string, number | undefined>)[key];
    return sum + (typeof value === 'number' && value > 0 ? value : 0);
  }, 0);
}

function dailyPoolWithinBudget(tasks: readonly DailyTaskConfig[]): boolean {
  return DAILY_POOL_BUDGET_KEYS.every((key) => dailyPoolTaskBudgetSum(tasks, key) <= DAILY_POOL_BUDGET[key]);
}

/** FNV-1a 32bit：dayIndex → 确定性下标（时钟回退/重复调用结果一致）。 */
function dailyPoolDayPickIndex(day: number, poolSize: number): number {
  let hash = 0x811c9dc5;
  const input = String(day);
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % Math.max(1, poolSize);
}

function dailyPoolCombinations(items: readonly DailyTaskConfig[], size: number): DailyTaskConfig[][] {
  const result: DailyTaskConfig[][] = [];
  const current: DailyTaskConfig[] = [];
  const walk = (start: number): void => {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      current.push(items[i]);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);
  return result;
}

/**
 * DAILY-TASK-POOL-V1 选择算法：能力门槛过滤 → 预算内枚举 → dayIndex 确定性抽取。
 * 输出保持配置表顺序，进度映射与既有口径一致。
 */
export function selectDailyTaskSet(
  configs: readonly DailyTaskConfig[],
  day: number,
  gates: DailyPoolGate,
): DailyTaskConfig[] {
  const qualified = configs.filter((cfg) => {
    if (cfg.type === 'PROMOTION_1') return gates.promotionAvailable;
    if (cfg.type === 'KPI_COMPLETE') return gates.kpiAvailable;
    return true;
  });
  if (qualified.length <= DAILY_POOL_SIZE) return [...qualified];
  for (let size = DAILY_POOL_SIZE; size >= 1; size--) {
    const feasible = dailyPoolCombinations(qualified, size).filter(dailyPoolWithinBudget);
    if (feasible.length > 0) {
      const picked = feasible[dailyPoolDayPickIndex(day, feasible.length)];
      return qualified.filter((cfg) => picked.includes(cfg));
    }
  }
  return [];
}

/**
 * DailyTaskService manages daily task generation, progress tracking,
 * completion detection, and reward claiming.
 *
 * Tasks are generated once per game day (midnight boundary). Progress
 * is tracked on `player.dailyTasks` so the save system persists it.
 * The `dailyTaskDay` field records which day the tasks were generated
 * for, so the service can detect day-rollover and regenerate.
 */
export class DailyTaskService {
  private readonly context: GameContext;
  private readonly configs: readonly DailyTaskConfig[];
  private readonly clock: Clock;
  private readonly configMap: Map<string, DailyTaskConfig>;

  public constructor(context: GameContext, bundle: DailyTaskBundle, options?: { readonly clock?: Clock }) {
    this.context = context;
    this.configs = bundle.tasks;
    this.clock = options?.clock ?? DEFAULT_CLOCK;
    this.configMap = new Map(this.configs.map((c) => [c.id, c]));
  }

  /** Get all task configs (for UI rendering). */
  public getConfigs(): readonly DailyTaskConfig[] {
    return this.configs;
  }

  /**
   * Ensure tasks are generated for the current day.
   * Call this at game start or before reading task state.
   * Returns true if tasks were regenerated (new day).
   */
  public refresh(): boolean {
    const today = this.dayIndex(this.clock.now());
    if (this.context.player.dailyTaskDay === today) return false;
    this.generateTasks(today);
    return true;
  }

  /** Get progress for all tasks. Automatically calls refresh() if needed. */
  public getProgress(): DailyTaskProgress[] {
    this.refresh();
    return this.context.player.dailyTasks.map((state) => {
      const cfg = this.configMap.get(state.taskId);
      return {
        taskId: state.taskId,
        type: cfg?.type ?? 'CULTIVATE_3',
        name: cfg?.name ?? state.taskId,
        description: cfg?.description ?? '',
        progress: state.progress,
        target: cfg?.target ?? 1,
        completed: state.completed,
        claimed: state.claimed,
      };
    });
  }

  /**
   * Add progress to a task by type. If the task exists and is not yet
   * completed, increments its progress and emits events.
   * Returns the task ID if progress was added, or null if no matching task.
   */
  public addProgress(type: DailyTaskType, amount: number): string | null {
    this.refresh();
    const state = this.findTaskByType(type);
    if (!state || state.completed) return null;
    const cfg = this.configMap.get(state.taskId);
    if (!cfg) return null;
    state.progress = Math.min(state.progress + amount, cfg.target);
    this.context.events.emit('dailyTaskProgress', {
      taskId: state.taskId,
      progress: state.progress,
      target: cfg.target,
    });
    if (state.progress >= cfg.target) {
      state.completed = true;
      this.context.events.emit('dailyTaskCompleted', { taskId: state.taskId });
    }
    return state.taskId;
  }

  /**
   * Set progress for a task by type (used for absolute counters like
   * WORK_SECONDS / FISH_3_MIN that read from player state).
   * Returns the task ID if progress was set, or null if no matching task.
   */
  public setProgress(type: DailyTaskType, value: number): string | null {
    this.refresh();
    const state = this.findTaskByType(type);
    if (!state || state.completed) return null;
    const cfg = this.configMap.get(state.taskId);
    if (!cfg) return null;
    state.progress = Math.min(value, cfg.target);
    this.context.events.emit('dailyTaskProgress', {
      taskId: state.taskId,
      progress: state.progress,
      target: cfg.target,
    });
    if (state.progress >= cfg.target) {
      state.completed = true;
      this.context.events.emit('dailyTaskCompleted', { taskId: state.taskId });
    }
    return state.taskId;
  }

  /**
   * Claim the reward for a completed task.
   * Applies the reward effects through EffectService and marks the task as claimed.
   * Throws if the task is not completed or already claimed.
   */
  public claim(taskId: string): void {
    const state = this.context.player.dailyTasks.find((t) => t.taskId === taskId);
    if (!state) throw new Error(`Unknown daily task ${taskId}`);
    if (!state.completed) throw new Error(`Daily task ${taskId} is not yet completed`);
    if (state.claimed) throw new Error(`Daily task ${taskId} already claimed`);
    const cfg = this.configMap.get(taskId);
    if (!cfg) throw new Error(`Config not found for daily task ${taskId}`);
    const previous = this.context.player.toSaveData();
    try {
      this.context.effects.apply(cfg.reward);
      state.claimed = true;
      this.context.saveService.save(this.context.player);
    } catch (error) {
      restorePlayer(this.context.player, previous);
      throw error;
    }
    this.context.events.emit('dailyTaskClaimed', { taskId });
  }

  /** Check if all tasks are claimed (for UI "all done" indicator). */
  public allClaimed(): boolean {
    this.refresh();
    return this.context.player.dailyTasks.length > 0
      && this.context.player.dailyTasks.every((t) => t.claimed);
  }

  /** Get the number of completed (but not necessarily claimed) tasks. */
  public completedCount(): number {
    this.refresh();
    return this.context.player.dailyTasks.filter((t) => t.completed).length;
  }

  /** Get the total number of tasks (当前池内实际任务数，UI 显示实际数并解释其余待条件开放）。 */
  public totalCount(): number {
    this.refresh();
    return this.context.player.dailyTasks.length;
  }

  private findTaskByType(type: DailyTaskType): DailyTaskState | undefined {
    return this.context.player.dailyTasks.find((t) => {
      const cfg = this.configMap.get(t.taskId);
      return cfg?.type === type;
    });
  }

  /** DAILY-TASK-POOL-V1 入池能力门槛：晋升只在非满级；KPI 只在存在当前职级目标时。 */
  private poolGates(): DailyPoolGate {
    let promotionAvailable = true;
    let kpiAvailable = true;
    try { promotionAvailable = this.context.career.next() !== undefined; } catch { /* 门槛查询失败按可用 */ }
    try { kpiAvailable = this.context.kpi.getCurrentRequirements().length > 0; } catch { /* 门槛查询失败按可用 */ }
    return { promotionAvailable, kpiAvailable };
  }

  private generateTasks(day: number): void {
    const selected = selectDailyTaskSet(this.configs, day, this.poolGates());
    this.context.player.dailyTasks = selected.map((cfg) => ({
      taskId: cfg.id,
      progress: 0,
      completed: false,
      claimed: false,
    }));
    this.context.player.dailyTaskDay = day;
  }

  /** Day index based on UTC midnight (same as DailyService). */
  private dayIndex(timestamp: number): number {
    const msPerDay = 86_400_000;
    return Math.floor(timestamp / msPerDay);
  }
}

function restorePlayer(player: import('../model/player-data').PlayerData, data: import('../model/save-data').GameSaveData): void {
  player.salary = data.salary;
  // @deprecated Board/merge fields kept for save/load backward compat
  player.maxWorkerLevel = data.maxWorkerLevel;
  player.lastSaveTime = data.lastSaveTime;
  // @deprecated Board/merge fields kept for save/load backward compat
  player.workers = data.workers.map((w) => ({ ...w }));
  player.cultivationExp = data.cultivationExp;
  player.careerLevel = data.careerLevel;
  player.mind = data.mind;
  player.maxMind = data.maxMind;
  player.performance = data.performance;
  player.sectId = data.sectId;
  player.talentId = data.talentId;
  player.workMode = data.workMode;
  player.workSeconds = data.workSeconds;
  player.fishingSeconds = data.fishingSeconds;
  player.kpiProgress = { ...data.kpiProgress };
  player.promotionFailCount = data.promotionFailCount;
  player.officeLevel = data.officeLevel;
  player.lastIdleSettlementId = data.lastIdleSettlementId;
  player.unlockedAchievementIds = [...data.unlockedAchievementIds ?? []];
  player.claimedAchievementIds = [...data.claimedAchievementIds ?? []];
  player.dailySignIn = data.dailySignIn ? { ...data.dailySignIn } : null;
  player.dailyTasks = (data.dailyTasks ?? []).map((t) => ({ ...t }));
  player.dailyTaskDay = data.dailyTaskDay ?? -1;
  player.tutorialStep = data.tutorialStep as string;
  player.tutorialCompleted = data.tutorialCompleted as boolean;
  player.tutorialVersion = data.tutorialVersion as number;
  player.tutorialStartedAt = data.tutorialStartedAt as number;
  player.spiritStones = data.spiritStones ?? 0;
  player.lastCultivateTime = data.lastCultivateTime ?? 0;
  player.activeTasks = (data.activeTasks ?? []).map((t) => ({ ...t }));
}
