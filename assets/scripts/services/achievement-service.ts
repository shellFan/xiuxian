import type { GameContext } from '../core/game-context';
import type { GameEvents } from '../core/game-events';
import type { GameEffect } from '../model/game-effect';

/** Achievement category for grouping in UI */
export type AchievementCategory = 'MERGE' | 'SALARY' | 'CAREER' | 'EVENT' | 'PROMOTION' | 'OFFICE' | 'MIND' | 'IDLE' | 'SECT' | 'TALENT' | 'WORK';

/** Achievement status lifecycle */
export type AchievementStatus = 'LOCKED' | 'COMPLETED' | 'CLAIMED';

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
  readonly reward?: GameEffect;
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

  /** Get the status of an achievement: LOCKED, COMPLETED, or CLAIMED. */
  public getStatus(id: string): AchievementStatus {
    if (this.context.player.claimedAchievementIds.includes(id)) return 'CLAIMED';
    if (this.context.player.unlockedAchievementIds.includes(id)) return 'COMPLETED';
    return 'LOCKED';
  }

  /**
   * Claim the reward for a completed achievement.
   * Applies the reward effects through EffectService and marks the achievement as claimed.
   * Throws if the achievement is not in COMPLETED state.
   */
  public claim(id: string): void {
    if (!this.idSet.has(id)) throw new Error(`Unknown achievement ${id}`);
    const status = this.getStatus(id);
    if (status === 'LOCKED') throw new Error(`Achievement ${id} is not yet completed`);
    if (status === 'CLAIMED') throw new Error(`Achievement ${id} already claimed`);
    const cfg = this.configs.find((c) => c.id === id);
    if (!cfg) throw new Error(`Achievement config not found for ${id}`);
    const previous = this.context.player.toSaveData();
    try {
      if (cfg.reward) this.context.effects.apply(cfg.reward);
      this.context.player.claimedAchievementIds.push(id);
      this.context.saveService.save(this.context.player);
    } catch (error) {
      restorePlayer(this.context.player, previous);
      throw error;
    }
    this.context.events.emit('achievementClaimed', { achievementId: id });
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

function restorePlayer(player: import('../model/player-data').PlayerData, data: import('../model/save-data').GameSaveData): void {
  player.salary = data.salary;
  player.cultivationExp = data.cultivationExp;
  player.mind = data.mind;
  player.performance = data.performance;
  player.claimedAchievementIds = [...(data.claimedAchievementIds ?? [])];
}