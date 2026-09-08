import type { GameContext } from '../core/game-context';
import { DEFAULT_CLOCK, type Clock } from '../core/clock';

export interface CultivationServiceOptions {
  /** @deprecated Merge rewards are no longer used in PC V1. */
  readonly mergeRewards?: readonly number[];
  readonly cultivationClickReward?: number;
  readonly cultivationCooldownSeconds?: number;
  readonly clock?: Clock;
}

export interface CultivationClickResult {
  readonly cultivationExp: number;
  readonly totalExp: number;
  readonly cooldownSeconds: number;
  readonly mindEfficiency: number;
  readonly cooldownRemaining: number;
}

export interface CultivationRewardGrantOptions {
  readonly persist?: boolean;
}

/** Default click reward: +5 cultivation exp per click. */
const DEFAULT_CLICK_REWARD = 5;
/** Default cooldown: 3 seconds between clicks. */
const DEFAULT_COOLDOWN_SECONDS = 3;

export class CultivationService {
  /** @deprecated Merge rewards are no longer used in PC V1. Kept for backward compat. */
  public readonly mergeRewards: readonly number[];
  private readonly grantedMergeRewards = new Set<string>();
  private readonly cultivationClickReward: number;
  private readonly cultivationCooldownSeconds: number;
  private readonly clock: Clock;

  public constructor(private readonly context: GameContext, options: CultivationServiceOptions = {}) {
    this.mergeRewards = Object.freeze([...(options.mergeRewards ?? context.configService.economy.cultivationRewards ?? [5, 10, 20, 40, 80])]);
    this.cultivationClickReward = options.cultivationClickReward ?? DEFAULT_CLICK_REWARD;
    this.cultivationCooldownSeconds = options.cultivationCooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS;
    this.clock = options.clock ?? DEFAULT_CLOCK;
    if (!Number.isSafeInteger(this.cultivationClickReward) || this.cultivationClickReward <= 0) {
      throw new Error('Invalid cultivation click reward');
    }
    if (!Number.isFinite(this.cultivationCooldownSeconds) || this.cultivationCooldownSeconds <= 0) {
      throw new Error('Invalid cultivation cooldown');
    }
  }

  /**
   * Click cultivation: grants cultivation exp with cooldown and mind efficiency.
   * Mind efficiency: 100% at mind>=80, scales down to 20% at mind=0.
   * Returns the result including cooldown remaining if on cooldown.
   */
  public cultivate(): CultivationClickResult {
    const now = this.clock.now();
    const lastTime = this.context.player.lastCultivateTime;
    const elapsed = (now - lastTime) / 1000;
    const cooldownRemaining = Math.max(0, this.cultivationCooldownSeconds - elapsed);

    if (cooldownRemaining > 0) {
      // Still on cooldown — return zero reward with remaining cooldown
      return {
        cultivationExp: 0,
        totalExp: this.context.player.cultivationExp,
        cooldownSeconds: this.cultivationCooldownSeconds,
        mindEfficiency: this.getMindEfficiency(),
        cooldownRemaining,
      };
    }

    const mindEfficiency = this.getMindEfficiency();
    const baseReward = this.cultivationClickReward;
    const actualReward = Math.max(1, Math.floor(baseReward * mindEfficiency));
    const previousExp = this.context.player.cultivationExp;
    const total = previousExp + actualReward;

    if (!Number.isSafeInteger(total)) throw new Error('Invalid cultivation change');

    this.context.player.cultivationExp = total;
    this.context.player.lastCultivateTime = now;

    try {
      this.context.saveService.save(this.context.player);
      this.context.events.emit('cultivationClicked', {
        cultivationExp: actualReward,
        totalExp: total,
        cooldownSeconds: this.cultivationCooldownSeconds,
        mindEfficiency,
      });
      this.context.events.emit('gameSaved', { reason: 'economy' });
    } catch (error) {
      this.context.player.cultivationExp = previousExp;
      this.context.player.lastCultivateTime = lastTime;
      throw error;
    }

    return {
      cultivationExp: actualReward,
      totalExp: total,
      cooldownSeconds: this.cultivationCooldownSeconds,
      mindEfficiency,
      cooldownRemaining: 0,
    };
  }

  /** Get the mind-based efficiency multiplier (0.2 to 1.0). */
  public getMindEfficiency(): number {
    const mind = this.context.player.mind;
    const maxMind = this.context.player.maxMind;
    if (maxMind <= 0) return 0.2;
    const ratio = mind / maxMind;
    // Linear interpolation: 20% at mind=0, 100% at mind>=80% of maxMind
    if (ratio >= 0.8) return 1.0;
    return 0.2 + 0.8 * (ratio / 0.8);
  }

  /** Get remaining cooldown seconds for cultivation click. */
  public getCooldownRemaining(): number {
    const now = this.clock.now();
    const elapsed = (now - this.context.player.lastCultivateTime) / 1000;
    return Math.max(0, this.cultivationCooldownSeconds - elapsed);
  }

  public applyIdleExperience(amount: number): void {
    validateExperienceAmount(amount);
    const total = this.context.player.cultivationExp + amount;
    if (!Number.isSafeInteger(total)) throw new Error('Invalid cultivation change');
    this.context.player.cultivationExp = total;
  }

  public rollbackIdleExperience(amount: number): void {
    validateExperienceAmount(amount);
    const total = this.context.player.cultivationExp - amount;
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid cultivation rollback');
    this.context.player.cultivationExp = total;
  }

  public grantMergeReward(mergeId: string, mergeLevel: number, options: CultivationRewardGrantOptions = {}): number {
    if (typeof mergeId !== 'string' || mergeId.trim() === '' || !Number.isInteger(mergeLevel) || mergeLevel < 1 || mergeLevel > 5) {
      throw new Error('Invalid cultivation reward');
    }
    if (this.grantedMergeRewards.has(mergeId)) return 0;
    const reward = this.mergeRewards[mergeLevel - 1];
    const previousExp = this.context.player.cultivationExp;
    const total = previousExp + reward;
    if (!Number.isSafeInteger(total)) throw new Error('Invalid cultivation change');
    this.grantedMergeRewards.add(mergeId);
    this.context.player.cultivationExp = total;
    try {
      if (options.persist !== false) this.context.saveService.save(this.context.player);
    } catch (error) {
      this.context.player.cultivationExp = previousExp;
      this.grantedMergeRewards.delete(mergeId);
      throw error;
    }
    return reward;
  }

  public rollbackMergeReward(mergeId: string, reward: number): void {
    if (this.grantedMergeRewards.delete(mergeId)) this.context.player.cultivationExp -= reward;
  }
}

function validateExperienceAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid cultivation change');
}
