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
  { id: 'daily_checkin', type: 'DAILY', name: '每日签到', description: '完成每日签到', durationSeconds: 10, rewardSalary: 50, rewardCultivation: 10, rewardSpiritStones: 5 },
  { id: 'daily_cultivate', type: 'DAILY', name: '修炼日常', description: '完成修炼日常任务', durationSeconds: 15, rewardSalary: 30, rewardCultivation: 20, rewardSpiritStones: 3 },
  { id: 'daily_report', type: 'DAILY', name: '日报周报', description: '提交日报周报', durationSeconds: 20, rewardSalary: 40, rewardCultivation: 5, rewardSpiritStones: 2 },
  { id: 'work_meeting', type: 'WORK', name: '部门会议', description: '参加部门会议', durationSeconds: 15, rewardSalary: 60, rewardCultivation: 5, rewardSpiritStones: 2 },
  { id: 'work_overtime', type: 'WORK', name: '加班赶工', description: '加班完成紧急需求', durationSeconds: 25, rewardSalary: 100, rewardCultivation: 0, rewardSpiritStones: 5 },
  { id: 'work_review', type: 'WORK', name: '代码审查', description: '审查同事的代码', durationSeconds: 20, rewardSalary: 40, rewardCultivation: 10, rewardSpiritStones: 3 },
  { id: 'cultivation_meditate', type: 'CULTIVATION', name: '打坐修炼', description: '静心打坐修炼', durationSeconds: 10, rewardSalary: 0, rewardCultivation: 30, rewardSpiritStones: 5 },
  { id: 'cultivation_breathing', type: 'CULTIVATION', name: '吐纳练气', description: '吐纳练气增强修为', durationSeconds: 15, rewardSalary: 0, rewardCultivation: 50, rewardSpiritStones: 3 },
  { id: 'cultivation_scripture', type: 'CULTIVATION', name: '参悟功法', description: '参悟功法提升境界', durationSeconds: 30, rewardSalary: 0, rewardCultivation: 100, rewardSpiritStones: 10 },
  { id: 'event_boss', type: 'EVENT', name: '老板视察', description: '应对老板突然视察', durationSeconds: 15, rewardSalary: 80, rewardCultivation: 0, rewardSpiritStones: 8 },
  { id: 'event_team_building', type: 'EVENT', name: '团建活动', description: '参加公司团建', durationSeconds: 20, rewardSalary: 30, rewardCultivation: 10, rewardSpiritStones: 5 },
  { id: 'event_mentor', type: 'EVENT', name: '前辈指点', description: '获得前辈指点', durationSeconds: 10, rewardSalary: 0, rewardCultivation: 40, rewardSpiritStones: 8 },
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

      task.claimed = true;
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