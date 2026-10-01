import { DEFAULT_CLOCK, type Clock } from '../core/clock';
import type { GameContext } from '../core/game-context';
import type { ActiveTaskState, TaskType } from '../model/save-data';

/** Configuration for a single task template. */
export interface TaskConfig {
  readonly id: string;
  readonly type: TaskType;
  readonly name: string;
  readonly description: string;
  readonly durationSeconds: number;
  readonly rewardSalary: number;
  readonly rewardCultivation: number;
  readonly rewardSpiritStones: number;
  /** Optional performance delta granted on claim (Web V1 design tasks). */
  readonly rewardPerformance?: number;
  /** Optional mind delta granted on claim — may be negative (design: 道心-5). */
  readonly rewardMind?: number;
}

/** Result of starting a task. */
export interface TaskStartResult {
  readonly success: boolean;
  readonly reason?: string;
  readonly task?: ActiveTaskState;
}

/** Result of claiming a completed task. */
export interface TaskClaimResult {
  readonly success: boolean;
  readonly reason?: string;
  readonly salary?: number;
  readonly cultivationExp?: number;
  readonly spiritStones?: number;
}

/** Result of checking task completion (called by game loop tick). */
export interface TaskTickResult {
  readonly completedTaskIds: readonly string[];
}

export interface TaskServiceOptions {
  readonly clock?: Clock;
  readonly maxActiveTasks?: number;
  readonly tasks?: readonly TaskConfig[];
}

const DEFAULT_MAX_ACTIVE_TASKS = 3;

/** Default task pool for the core gameplay. */
const DEFAULT_TASKS: readonly TaskConfig[] = [
  // V5.5 §39~§44：时长分级 QUICK(5-15min)/SHORT(15-45min)/MEDIUM(45-120min)/LONG(2-4h)/EPIC(4-8h)，单位游戏秒。
  // 来源真实（产品/测试/老板/自己计划），奖励以工资+绩效为主，灵石稀有（§79）。
  { id: 'task_daily_report', type: 'DAILY', name: '写日报', description: '把今天的摸鱼写成「阶段性成果」', durationSeconds: 20 * 60, rewardSalary: 20, rewardCultivation: 10, rewardSpiritStones: 0, rewardPerformance: 6 },
  { id: 'task_fix_bug', type: 'DAILY', name: '修复线上登录异常', description: '紧急修复生产环境问题，可能触发线上事故', durationSeconds: 2 * 3600, rewardSalary: 90, rewardCultivation: 40, rewardSpiritStones: 0, rewardPerformance: 18, rewardMind: -5 },
  { id: 'task_paid_fish', type: 'DAILY', name: '带薪摸鱼', description: '合理摸鱼，恢复状态', durationSeconds: 30 * 60, rewardSalary: 10, rewardCultivation: 5, rewardSpiritStones: 0, rewardMind: 15 },
  { id: 'task_useless_meeting', type: 'DAILY', name: '参加无效会议', description: '听不懂但开完的会议，结论是下次再讨论', durationSeconds: 60 * 60, rewardSalary: 15, rewardCultivation: 0, rewardSpiritStones: 0, rewardPerformance: 10, rewardMind: -10 },
  { id: 'daily_checkin', type: 'DAILY', name: '每日签到', description: '签到领灵石（QUICK）', durationSeconds: 5 * 60, rewardSalary: 10, rewardCultivation: 5, rewardSpiritStones: 2 },
  { id: 'daily_cultivate', type: 'DAILY', name: '修炼日常', description: '打坐调息 15 分钟', durationSeconds: 15 * 60, rewardSalary: 5, rewardCultivation: 40, rewardSpiritStones: 1 },
  { id: 'daily_report', type: 'DAILY', name: '日报周报', description: '周报是日报的套娃', durationSeconds: 25 * 60, rewardSalary: 22, rewardCultivation: 8, rewardSpiritStones: 0 },
  { id: 'task_confirm_requirement', type: 'DAILY', name: '需求文档确认', description: '让产品在群里白纸黑字确认一遍（SHORT）', durationSeconds: 20 * 60, rewardSalary: 18, rewardCultivation: 8, rewardSpiritStones: 0, rewardPerformance: 6 },
  { id: 'task_sql_optimize', type: 'WORK', name: '慢 SQL 优化', description: '给慢查询加索引，DBA 感谢你（MEDIUM）', durationSeconds: 90 * 60, rewardSalary: 80, rewardCultivation: 30, rewardSpiritStones: 1, rewardPerformance: 14 },
  { id: 'task_api_dev', type: 'WORK', name: '开发业务接口', description: '普通增删改查 + 联调（MEDIUM）', durationSeconds: 100 * 60, rewardSalary: 95, rewardCultivation: 35, rewardSpiritStones: 1, rewardPerformance: 15 },
  { id: 'task_write_tests', type: 'WORK', name: '补充单元测试', description: '覆盖率是遮羞布，但要有（MEDIUM）', durationSeconds: 80 * 60, rewardSalary: 70, rewardCultivation: 30, rewardSpiritStones: 0, rewardPerformance: 12 },
  { id: 'work_meeting', type: 'WORK', name: '跨部门对齐会', description: '一小时的会，结论是下周再开一个会（MEDIUM）', durationSeconds: 60 * 60, rewardSalary: 40, rewardCultivation: 5, rewardSpiritStones: 0, rewardPerformance: 8, rewardMind: -8 },
  { id: 'work_overtime', type: 'WORK', name: '加班赶工', description: '紧急需求的代价（LONG）', durationSeconds: 3 * 3600, rewardSalary: 200, rewardCultivation: 20, rewardSpiritStones: 2, rewardMind: -12 },
  { id: 'work_review', type: 'WORK', name: '代码审查', description: '审查同事的代码，写下「LGTM」之外的话（SHORT）', durationSeconds: 30 * 60, rewardSalary: 35, rewardCultivation: 12, rewardSpiritStones: 0, rewardPerformance: 10 },
  { id: 'task_module_dev', type: 'WORK', name: '开发业务模块', description: '核心功能模块开发（LONG）', durationSeconds: 3.5 * 3600, rewardSalary: 260, rewardCultivation: 60, rewardSpiritStones: 2, rewardPerformance: 25 },
  { id: 'task_incident_repair', type: 'WORK', name: '生产事故修复', description: 'EPIC：核心功能挂了，全组等你的 diff', durationSeconds: 6 * 3600, rewardSalary: 420, rewardCultivation: 90, rewardSpiritStones: 3, rewardPerformance: 35, rewardMind: -15 },
  { id: 'task_system_migration', type: 'WORK', name: '系统迁移', description: 'EPIC：老系统迁移新框架，技术债清零机会', durationSeconds: 7 * 3600, rewardSalary: 480, rewardCultivation: 120, rewardSpiritStones: 3, rewardPerformance: 40 },
  { id: 'cultivation_meditate', type: 'CULTIVATION', name: '打坐修炼', description: '工位结界内静心（SHORT）', durationSeconds: 15 * 60, rewardSalary: 0, rewardCultivation: 45, rewardSpiritStones: 1 },
];

export class TaskService {
  private readonly clock: Clock;
  private readonly maxActiveTasks: number;
  private readonly taskConfigs: readonly TaskConfig[];
  private readonly configMap: Map<string, TaskConfig>;

  public constructor(private readonly context: GameContext, options: TaskServiceOptions = {}) {
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.maxActiveTasks = options.maxActiveTasks ?? DEFAULT_MAX_ACTIVE_TASKS;
    this.taskConfigs = Object.freeze([...(options.tasks ?? DEFAULT_TASKS)]);
    this.configMap = new Map(this.taskConfigs.map((c) => [c.id, c]));
  }

  /** Get all available task configs. */
  public getConfigs(): readonly TaskConfig[] {
    return this.taskConfigs;
  }

  /** Get configs filtered by type. */
  public getConfigsByType(type: TaskType): readonly TaskConfig[] {
    return this.taskConfigs.filter((c) => c.type === type);
  }

  /** Get all active tasks for the current player. */
  public getActiveTasks(): readonly ActiveTaskState[] {
    return this.context.player.activeTasks;
  }

  /** Get a specific active task by ID. */
  public getActiveTask(taskId: string): ActiveTaskState | undefined {
    return this.context.player.activeTasks.find((t) => t.taskId === taskId);
  }

  /** Check if a task is completed (duration has elapsed). */
  public isTaskCompleted(taskId: string): boolean {
    const task = this.getActiveTask(taskId);
    if (!task) return false;
    if (task.completed) return true;
    const elapsed = (this.clock.now() - task.startedAt) / 1000;
    return elapsed >= task.durationSeconds;
  }

  /** Get remaining seconds for a task. */
  public getRemainingSeconds(taskId: string): number {
    const task = this.getActiveTask(taskId);
    if (!task || task.completed) return 0;
    const elapsed = (this.clock.now() - task.startedAt) / 1000;
    return Math.max(0, task.durationSeconds - elapsed);
  }

  /**
   * Start a task by config ID. The player can have up to maxActiveTasks concurrent tasks.
   * Mind efficiency affects task reward (applied on claim).
   */
  public startTask(configId: string): TaskStartResult {
    const config = this.configMap.get(configId);
    if (!config) return { success: false, reason: '未知任务' };

    // Check if already active
    if (this.context.player.activeTasks.some((t) => t.taskId === configId && !t.claimed)) {
      return { success: false, reason: '任务已在进行中' };
    }

    // Check active task limit
    const activeCount = this.context.player.activeTasks.filter((t) => !t.claimed).length;
    if (activeCount >= this.maxActiveTasks) {
      return { success: false, reason: '任务栏已满' };
    }

    const now = this.clock.now();
    const task: ActiveTaskState = {
      taskId: config.id,
      taskType: config.type,
      name: config.name,
      description: config.description,
      durationSeconds: config.durationSeconds,
      startedAt: now,
      rewardSalary: config.rewardSalary,
      rewardCultivation: config.rewardCultivation,
      rewardSpiritStones: config.rewardSpiritStones,
      rewardPerformance: config.rewardPerformance ?? 0,
      rewardMind: config.rewardMind ?? 0,
      completed: false,
      claimed: false,
    };

    const previousTasks = [...this.context.player.activeTasks];
    this.context.player.activeTasks.push(task);

    try {
      this.context.saveService.save(this.context.player);
      this.context.events.emit('taskStarted', { taskId: config.id, taskType: config.type, durationSeconds: config.durationSeconds });
    } catch (error) {
      this.context.player.activeTasks = previousTasks;
      throw error;
    }

    return { success: true, task };
  }

  /**
   * Tick all active tasks and mark completed ones.
   * Returns IDs of tasks that just completed this tick.
   */
  public tick(): TaskTickResult {
    const now = this.clock.now();
    const completedTaskIds: string[] = [];

    for (const task of this.context.player.activeTasks) {
      if (task.completed || task.claimed) continue;
      const elapsed = (now - task.startedAt) / 1000;
      if (elapsed >= task.durationSeconds) {
        task.completed = true;
        completedTaskIds.push(task.taskId);
        this.context.events.emit('taskCompleted', { taskId: task.taskId, taskType: task.taskType });
        continue;
      }
      // V5.5 §47：任务进行到一半时发一次里程碑事件（0~N 个过程事件的骨架）。
      const progressKey = `v5_task_milestone:${task.taskId}`;
      if (!this.context.player.eventFlags?.[progressKey]
        && elapsed / task.durationSeconds >= 0.5) {
        this.context.player.eventFlags = { ...this.context.player.eventFlags, [progressKey]: true };
        this.context.events.emit('taskMilestone', {
          taskId: task.taskId,
          taskName: task.name,
          progress: Math.round((elapsed / task.durationSeconds) * 100),
        });
      }
    }

    return { completedTaskIds };
  }

  /**
   * Claim a completed task's rewards. Mind efficiency modifies cultivation rewards.
   */
  public claimTask(taskId: string): TaskClaimResult {
    const taskIndex = this.context.player.activeTasks.findIndex((t) => t.taskId === taskId);
    if (taskIndex === -1) return { success: false, reason: '任务不存在' };

    const task = this.context.player.activeTasks[taskIndex];
    if (!task.completed) return { success: false, reason: '任务未完成' };
    if (task.claimed) return { success: false, reason: '奖励已领取' };

    // Apply mind efficiency to cultivation reward
    const mindEfficiency = this.context.cultivation.getMindEfficiency();
    const actualCultivation = Math.max(0, Math.floor(task.rewardCultivation * mindEfficiency));

    const previousSalary = this.context.player.salary;
    const previousExp = this.context.player.cultivationExp;
    const previousStones = this.context.player.spiritStones;
    const previousPerformance = this.context.player.performance;
    const previousMind = this.context.player.mind;
    const previousKpiProgress = { ...this.context.player.kpiProgress };
    const previousDailyTasks = this.context.player.dailyTasks.map((dailyTask) => ({ ...dailyTask }));
    const rewardPerformance = task.rewardPerformance ?? 0;
    const rewardMind = task.rewardMind ?? 0;

    try {
      if (task.rewardSalary > 0) {
        this.context.economy.applyIdleSalary(task.rewardSalary);
      }
      if (actualCultivation > 0) {
        this.context.cultivation.applyIdleExperience(actualCultivation);
      }
      if (task.rewardSpiritStones > 0) {
        this.context.player.spiritStones += task.rewardSpiritStones;
      }
      if (rewardPerformance !== 0) {
        this.context.player.performance = Math.max(0, this.context.player.performance + rewardPerformance);
      }
      if (rewardMind !== 0) {
        this.context.player.mind = Math.min(this.context.player.maxMind, Math.max(0, this.context.player.mind + rewardMind));
      }

      task.claimed = true;
      this.context.kpi.recordTaskDone();
      // V5.7：职业任务计数（周目标）+ 计划条目完成标记 + 职业经验（§14：职业任务为经验来源）
      try {
        const stats = this.context.player.lifetimeStats;
        this.context.player.lifetimeStats = { ...stats, tasksDone: (stats.tasksDone ?? 0) + 1 };
        this.context.week.recordProgress('PROFESSION_TASKS', 1);
        this.context.profession.grantExp(8);
        this.context.dailyPlanner.markPlanDoneByTask(String((task as unknown as { title?: string }).title ?? task.taskId));
      } catch { /* V5.7 hooks must not block claims */ }
      this.context.saveService.save(this.context.player);

      this.context.events.emit('taskClaimed', {
        taskId: task.taskId,
        taskType: task.taskType,
        salary: task.rewardSalary,
        cultivationExp: actualCultivation,
        spiritStones: task.rewardSpiritStones,
      });

      if (task.rewardSpiritStones > 0) {
        this.context.events.emit('spiritStonesChanged', { amount: task.rewardSpiritStones, total: this.context.player.spiritStones });
      }
    } catch (error) {
      // Rollback
      this.context.player.salary = previousSalary;
      this.context.player.cultivationExp = previousExp;
      this.context.player.spiritStones = previousStones;
      this.context.player.performance = previousPerformance;
      this.context.player.mind = previousMind;
      this.context.player.kpiProgress = previousKpiProgress;
      this.context.player.dailyTasks = previousDailyTasks;
      task.claimed = false;
      throw error;
    }

    return {
      success: true,
      salary: task.rewardSalary,
      cultivationExp: actualCultivation,
      spiritStones: task.rewardSpiritStones,
    };
  }

  /** Remove claimed tasks from the active list (cleanup). */
  public cleanupClaimedTasks(): number {
    const before = this.context.player.activeTasks.length;
    this.context.player.activeTasks = this.context.player.activeTasks.filter((t) => !t.claimed);
    return before - this.context.player.activeTasks.length;
  }
}
