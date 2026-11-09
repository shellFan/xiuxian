import type { GameContext } from '../core/game-context';
import { DEFAULT_CLOCK, type Clock } from '../core/clock';
import { applyCharacterEffectToInteger, characterEffectMultiplier } from '../v59/character-attributes';

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
  /** V6.1: whether this click scored a critical hit (bonus exp). */
  readonly crit?: boolean;
  /** V6.1: crit multiplier applied (1.5~3.0); 1 when not a crit. */
  readonly critMultiplier?: number;
  /** V6.1: consecutive successful clicks within the combo window. */
  readonly combo?: number;
}

export interface CultivationRewardGrantOptions {
  readonly persist?: boolean;
}

/** Default click reward: +5 cultivation exp per click. */
const DEFAULT_CLICK_REWARD = 5;
/** Default cooldown: 3 seconds between clicks. */
const DEFAULT_COOLDOWN_SECONDS = 3;
/** V6.1: combo window — consecutive clicks within 10s keep the combo alive. */
const COMBO_WINDOW_MS = 10_000;
/** V6.1: base crit chance (15%). */
const BASE_CRIT_CHANCE = 0.15;
/** V6.1: crit chance bonus per combo step (+2%), capped at combo 10. */
const COMBO_CRIT_BONUS_PER_STEP = 0.02;
/** 暴击率下限（5%）：气运极低时保底暴击率 */
const MIN_CRIT_CHANCE = 0.05;
/** 暴击率上限（V6.2: 对齐实际代码行为，0.6 配合连击爽感，满连击+气运时暴击频繁） */
const MAX_CRIT_CHANCE = 0.6;
/** V6.1: min crit multiplier. */
const MIN_CRIT_MULTIPLIER = 1.5;
/** V6.1: max crit multiplier. */
const MAX_CRIT_MULTIPLIER = 3.0;

export class CultivationService {
  /** @deprecated Merge rewards are no longer used in PC V1. Kept for backward compat. */
  public readonly mergeRewards: readonly number[];
  private readonly grantedMergeRewards = new Set<string>();
  private readonly cultivationClickReward: number;
  private readonly cultivationCooldownSeconds: number;
  private readonly clock: Clock;
  /** V6.1: combo tracking — timestamp of last successful click. */
  private _lastComboTime = 0;
  /** V6.1: combo tracking — current consecutive click count. */
  private _comboCount = 0;

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
        crit: false,
        critMultiplier: 1,
        combo: this._comboCount,
      };
    }

    // V6.1: combo tracking — consecutive clicks within the combo window
    const prevComboCount = this._comboCount;
    const prevComboTime = this._lastComboTime;
    if (now - this._lastComboTime <= COMBO_WINDOW_MS) {
      this._comboCount += 1;
    } else {
      this._comboCount = 1;
    }
    this._lastComboTime = now;
    const combo = this._comboCount;

    const mindEfficiency = this.getMindEfficiency();
    const baseReward = this.cultivationClickReward;
    const mindAdjustedReward = Math.max(1, Math.floor(baseReward * mindEfficiency));
    let actualReward = Math.max(1, applyCharacterEffectToInteger(
      mindAdjustedReward,
      this.context.player,
      'CULTIVATION_REWARD',
    ));

    // V6.1: crit roll — base 15% + combo bonus (+2%/step, max +20% at combo 10),
    // scaled by the fortune-derived BATTLE_CRIT_CHANCE multiplier (0.9~1.2).
    const comboBonus = Math.min(combo - 1, 10) * COMBO_CRIT_BONUS_PER_STEP;
    const fortuneMul = characterEffectMultiplier(this.context.player, 'BATTLE_CRIT_CHANCE');
    const critChance = Math.max(MIN_CRIT_CHANCE, Math.min((BASE_CRIT_CHANCE + comboBonus) * fortuneMul, MAX_CRIT_CHANCE));
    const isCrit = Math.random() < critChance;
    let critMultiplier = 1;
    if (isCrit) {
      critMultiplier = MIN_CRIT_MULTIPLIER + Math.random() * (MAX_CRIT_MULTIPLIER - MIN_CRIT_MULTIPLIER);
      actualReward = Math.max(1, Math.floor(actualReward * critMultiplier));
    }

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
        crit: isCrit,
        critMultiplier,
        combo,
      });
      this.context.events.emit('gameSaved', { reason: 'economy' });
    } catch (error) {
      this.context.player.cultivationExp = previousExp;
      this.context.player.lastCultivateTime = lastTime;
      this._comboCount = prevComboCount;
      this._lastComboTime = prevComboTime;
      throw error;
    }

    return {
      cultivationExp: actualReward,
      totalExp: total,
      cooldownSeconds: this.cultivationCooldownSeconds,
      mindEfficiency,
      cooldownRemaining: 0,
      crit: isCrit,
      critMultiplier,
      combo,
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

  /** V6.1: current combo count (0 if window expired). */
  public getCombo(): number {
    const now = this.clock.now();
    if (now - this._lastComboTime > COMBO_WINDOW_MS) return 0;
    return this._comboCount;
  }

  /** V6.1: reset combo (e.g. when switching work mode). */
  public resetCombo(): void {
    this._comboCount = 0;
    this._lastComboTime = 0;
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
