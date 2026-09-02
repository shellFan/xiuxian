import type { GameContext } from '../core/game-context';
import type { GameEvents } from '../core/game-events';

/** Achievement category for grouping in UI */
export type AchievementCategory = 'MERGE' | 'SALARY' | 'CAREER' | 'EVENT' | 'PROMOTION' | 'OFFICE' | 'MIND' | 'IDLE' | 'SECT' | 'TALENT' | 'WORK';

/** Condition types that map to game state checks */
export type AchievementConditionType =
  | 'KPI' | 'SALARY' | 'CAREER_LEVEL' | 'EVENT_TYPE'
  | 'PROMOTION' | 'OFFICE_LEVEL' | 'MIND_FULL'
  | 'IDLE_CLAIM' | 'SECT_JOIN' | 'TALENT_PICK' | 'WORK_SECONDS';

export interface AchievementCondition {
  readonly type: AchievementConditionType;
  readonly kpiKey?: string;
  readonly target?: number;
  readonly eventType?: string;
}

export interface AchievementConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: AchievementCategory;
  readonly condition: AchievementCondition;
}

export interface AchievementBundle {
  readonly achievements: readonly AchievementConfig[];
}

/**
 * AchievementService checks player state against configured achievement
 * conditions and tracks which achievements have been unlocked.
 *
 * All mutations go through `player.unlockedAchievementIds` so the save
 * system automatically persists them.
 */
export class AchievementService {
  private readonly context: GameContext;
  private readonly configs: readonly AchievementConfig[];
  private readonly idSet: Set<string>;

  public constructor(context: GameContext, bundle: AchievementBundle) {
    this.context = context;
    this.configs = bundle.achievements;
    this.idSet = new Set(this.configs.map((c) => c.id));
  }

  /**
   * Check all achievements against current player state.
   * Returns IDs of **newly** unlocked achievements (not previously unlocked).
   * Fires one `AchievementUnlocked` event per new achievement.
   */
  public checkAll(): string[] {
    const newlyUnlocked: string[] = [];
    const player = this.context.player;
    const already = new Set(player.unlockedAchievementIds);

    for (const cfg of this.configs) {
      if (already.has(cfg.id)) continue;
      if (this.isConditionMet(cfg.condition, player)) {
        player.unlockedAchievementIds.push(cfg.id);
        newlyUnlocked.push(cfg.id);
        this.context.events.emit('AchievementUnlocked', { achievementId: cfg.id });
      }
    }
    return newlyUnlocked;
  }

  /**
   * Notify that an event of a specific type occurred (RARE, EASTER_EGG, etc.).
   * Unlocks matching EVENT_TYPE achievements immediately.
   */
  public notifyEventType(eventType: string): void {
    const player = this.context.player;
    const already = new Set(player.unlockedAchievementIds);

    for (const cfg of this.configs) {
      if (already.has(cfg.id)) continue;
      if (cfg.condition.type === 'EVENT_TYPE' && cfg.condition.eventType === eventType) {
        player.unlockedAchievementIds.push(cfg.id);
        this.context.events.emit('AchievementUnlocked', { achievementId: cfg.id });
      }
    }
  }

  /** Check a single achievement by ID. Returns true if it was just unlocked. */
  public checkOne(id: string): boolean {
    if (!this.idSet.has(id)) return false;
    if (this.context.player.unlockedAchievementIds.includes(id)) return false;
    const cfg = this.configs.find((c) => c.id === id);
    if (!cfg) return false;
    if (!this.isConditionMet(cfg.condition, this.context.player)) return false;
    this.context.player.unlockedAchievementIds.push(id);
    this.context.events.emit('AchievementUnlocked', { achievementId: id });
    return true;
  }

  /** Get all achievement configs (for UI rendering). */
  public getConfigs(): readonly AchievementConfig[] {
    return this.configs;
  }

  /** Check if a specific achievement is unlocked. */
  public isUnlocked(id: string): boolean {
    return this.context.player.unlockedAchievementIds.includes(id);
  }

  private isConditionMet(condition: AchievementCondition, player: import('../model/player-data').PlayerData): boolean {
    switch (condition.type) {
      case 'KPI': {
        if (!condition.kpiKey) return false;
        const kpiValue = player.kpiProgress[condition.kpiKey] ?? 0;
        return condition.target !== undefined && kpiValue >= condition.target;
      }
      case 'SALARY':
        return condition.target !== undefined && player.salary >= condition.target;
      case 'CAREER_LEVEL':
        return condition.target !== undefined && player.careerLevel >= condition.target;
      case 'PROMOTION':
        return condition.target !== undefined && (player.careerLevel - 1) >= condition.target;
      case 'OFFICE_LEVEL':
        return condition.target !== undefined && player.officeLevel >= condition.target;
      case 'MIND_FULL':
        return player.mind >= player.maxMind;
      case 'WORK_SECONDS':
        return condition.target !== undefined && player.workSeconds >= condition.target;
      case 'SECT_JOIN':
        return player.sectId !== null;
      case 'TALENT_PICK':
        return player.talentId !== null;
      case 'IDLE_CLAIM':
        return condition.target !== undefined && player.lastIdleSettlementId !== null;
      case 'EVENT_TYPE':
        // EVENT_TYPE achievements are only unlocked via notifyEventType
        return false;
      default:
        return false;
    }
  }
}