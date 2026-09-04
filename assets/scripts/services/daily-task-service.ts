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
        type: cfg?.type ?? 'MERGE_5',
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

  /** Get the total number of tasks. */
  public totalCount(): number {
    return this.configs.length;
  }

  private findTaskByType(type: DailyTaskType): DailyTaskState | undefined {
    return this.context.player.dailyTasks.find((t) => {
      const cfg = this.configMap.get(t.taskId);
      return cfg?.type === type;
    });
  }

  private generateTasks(day: number): void {
    this.context.player.dailyTasks = this.configs.map((cfg) => ({
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
  player.maxWorkerLevel = data.maxWorkerLevel;
  player.lastSaveTime = data.lastSaveTime;
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
  player.tutorialStep = data.tutorialStep ?? 'FIRST_RECRUIT';
  player.tutorialCompleted = data.tutorialCompleted ?? false;
}