import type { GameContext } from '../core/game-context';
import type { KpiType, KpiRequirement, KpiLevelConfig, KpiBundle } from '../model/config-types';

export interface KpiViewItem {
  readonly type: KpiType;
  readonly target: number;
  readonly progress: number;
  readonly completed: boolean;
  readonly description: string;
}

export interface KpiView {
  readonly careerLevel: number;
  readonly items: readonly KpiViewItem[];
  readonly allCompleted: boolean;
}

const DEFAULT_DESCRIPTIONS: Record<KpiType, string> = {
  MERGE_COUNT: '合成牛马次数',
  WORK_SECONDS: '工作时长',
  CULTIVATION: '修为',
  SALARY_EARNED: '累计薪资',
  EVENT_RESOLVED: '处理职场事件',
};

/**
 * Tracks career-level promotion KPIs. Progress that can be derived from existing
 * PlayerData fact fields is NOT stored: WORK_SECONDS reads `workSeconds` and
 * CULTIVATION reads `cultivationExp`. Only the three counters that cannot be
 * derived (MERGE_COUNT / SALARY_EARNED / EVENT_RESOLVED) live in `kpiProgress`.
 */
export class KpiService {
  public constructor(private readonly context: GameContext) {}

  public getCurrentLevelConfig(): KpiLevelConfig | undefined {
    const level = this.context.player.careerLevel;
    return this.context.configService.kpi.levels.find((item) => item.careerLevel === level);
  }

  public getCurrentRequirements(): readonly KpiRequirement[] {
    return this.getCurrentLevelConfig()?.requirements ?? [];
  }

  public getProgress(requirement: KpiRequirement): number {
    switch (requirement.type) {
      case 'WORK_SECONDS':
        return this.context.player.workSeconds;
      case 'CULTIVATION':
        return this.context.player.cultivationExp;
      default:
        // Counter types (MERGE_COUNT / SALARY_EARNED / EVENT_RESOLVED) are stored in kpiProgress.
        return this.context.player.kpiProgress[requirement.type] ?? 0;
    }
  }

  public isRequirementCompleted(requirement: KpiRequirement): boolean {
    return this.getProgress(requirement) >= requirement.target;
  }

  public isCurrentKpiCompleted(): boolean {
    const requirements = this.getCurrentRequirements();
    // A missing or empty KPI config (e.g. max career level with no promotion targets)
    // MUST NOT be treated as "promotion ready". No config means not completed.
    if (requirements.length === 0) return false;
    return requirements.every((requirement) => this.isRequirementCompleted(requirement));
  }

  public getView(): KpiView {
    const careerLevel = this.context.player.careerLevel;
    const requirements = this.getCurrentRequirements();
    const items = requirements.map((requirement): KpiViewItem => {
      const progress = this.getProgress(requirement);
      return {
        type: requirement.type,
        target: requirement.target,
        progress,
        completed: progress >= requirement.target,
        description: requirement.description ?? DEFAULT_DESCRIPTIONS[requirement.type],
      };
    });
    return {
      careerLevel,
      items,
      allCompleted: requirements.length > 0 && items.every((item) => item.completed),
    };
  }

  /** Called once per successful merge. The merge transaction persists it via its own single save. */
  public recordMerge(): void {
    this.incrementCounter('MERGE_COUNT', 1);
  }

  /** Called when salary is granted (e.g. from a merge reward). */
  public recordSalaryEarned(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid salary earned amount');
    this.incrementCounter('SALARY_EARNED', amount);
  }

  /**
   * Called when a career event is resolved. The eventId is accepted so future work
   * can dedupe or support "complete a specific kind of event" KPIs; Phase 2 only
   * counts occurrences.
   */
  public recordEventResolved(eventId: string): void {
    if (typeof eventId !== 'string' || eventId.trim() === '') throw new Error('Invalid event id');
    this.incrementCounter('EVENT_RESOLVED', 1);
  }

  public switchLevel(newLevel: number): void {
    if (!Number.isSafeInteger(newLevel) || newLevel < 1 || newLevel > 10) throw new Error('Invalid career level');
    this.context.player.careerLevel = newLevel;
    // Reset per-level counters. Cumulative facts (workSeconds / cultivationExp) are
    // intentionally preserved and compared against the new level's larger targets.
    this.context.player.kpiProgress = {};
  }

  private incrementCounter(type: KpiType, amount: number): void {
    const current = this.context.player.kpiProgress[type] ?? 0;
    this.context.player.kpiProgress = { ...this.context.player.kpiProgress, [type]: current + amount };
  }
}
