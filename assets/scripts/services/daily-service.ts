import type { GameContext } from '../core/game-context';
import type { Clock } from '../core/clock';
import { DEFAULT_CLOCK } from '../core/clock';

export interface DailyRewardConfig {
  readonly day: number;
  readonly salary: number;
  readonly cultivationExp: number;
  readonly mind: number;
}

export interface DailyConfig {
  readonly rewards: readonly DailyRewardConfig[];
  readonly cycleDays: number;
  /** Hours after midnight during which the player can still claim the previous day's sign-in */
  readonly graceHours: number;
}

export interface DailyBundle {
  readonly rewards: readonly DailyRewardConfig[];
  readonly cycleDays: number;
  readonly graceHours: number;
}

export interface DailyClaimResult {
  /** Day number within the current cycle (1-based) */
  readonly day: number;
  /** Rewards actually granted */
  readonly salary: number;
  readonly cultivationExp: number;
  readonly mind: number;
  /** True if this was a make-up claim (within grace period for a missed day) */
  readonly grace: boolean;
}

/**
 * DailyService manages the daily sign-in (签到) system.
 *
 * A 7-day cycle resets after the last day. Players who miss a day can
 * still claim within `graceHours` hours after midnight. After the grace
 * period the streak resets to day 1.
 *
 * All state is stored on `player.dailySignIn` so the save system
 * persists it automatically.
 */
export class DailyService {
  private readonly context: GameContext;
  private readonly config: DailyConfig;
  private readonly clock: Clock;

  public constructor(context: GameContext, config: DailyConfig, options?: { readonly clock?: Clock }) {
    this.context = context;
    this.config = config;
    this.clock = options?.clock ?? DEFAULT_CLOCK;
  }

  /** Whether the player can claim a sign-in reward right now. */
  public canClaim(): boolean {
    const state = this.context.player.dailySignIn;
    if (state === null) return true;
    const now = this.clock.now();
    const { dayStart, graceEnd } = this.dayBoundaries(now);
    // Already claimed today
    if (state.lastClaimTime >= dayStart) return false;
    // Within grace period for yesterday
    if (now < graceEnd && state.lastClaimTime >= this.dayBoundaries(dayStart - 1).dayStart) return false;
    return true;
  }

  /** Get the current day number in the cycle (1-based). Returns 1 if no prior claim. */
  public getCurrentDay(): number {
    const state = this.context.player.dailySignIn;
    if (state === null) return 1;
    const now = this.clock.now();
    const { dayStart, graceEnd } = this.dayBoundaries(now);
    // Claimed today → continue streak
    if (state.lastClaimTime >= dayStart) return state.currentDay;
    // Within grace period and claimed yesterday → continue streak
    const yesterdayStart = this.dayBoundaries(dayStart - 1).dayStart;
    if (now < graceEnd && state.lastClaimTime >= yesterdayStart) return state.currentDay;
    // Streak broken → reset to day 1
    return 1;
  }

  /**
   * Claim the daily sign-in reward.
   * @throws if canClaim() is false
   */
  public claim(): DailyClaimResult {
    if (!this.canClaim()) throw new Error('Daily sign-in not available');
    const now = this.clock.now();
    const { dayStart, graceEnd } = this.dayBoundaries(now);
    const state = this.context.player.dailySignIn;
    const yesterdayStart = state !== null ? this.dayBoundaries(dayStart - 1).dayStart : 0;
    const isGrace = state !== null && now < graceEnd && state.lastClaimTime >= yesterdayStart && state.lastClaimTime < dayStart;

    let nextDay: number;
    if (state === null) {
      nextDay = 1;
    } else if (state.lastClaimTime >= dayStart) {
      // Already claimed today — shouldn't happen (canClaim guards)
      throw new Error('Already claimed today');
    } else if (isGrace) {
      nextDay = state.currentDay + 1;
    } else if (state.lastClaimTime >= yesterdayStart) {
      // Claimed yesterday, claiming today normally
      nextDay = state.currentDay + 1;
    } else {
      // Streak broken
      nextDay = 1;
    }

    // Cycle wrap
    if (nextDay > this.config.cycleDays) nextDay = 1;

    const reward = this.config.rewards.find((r) => r.day === nextDay) ?? this.config.rewards[0];
    this.context.player.dailySignIn = { lastClaimTime: now, currentDay: nextDay };

    // Apply rewards
    if (reward.salary > 0) this.context.economy.addSalary(reward.salary);
    if (reward.cultivationExp > 0) this.context.cultivation.addExp(reward.cultivationExp);
    if (reward.mind > 0) this.context.mind.change(reward.mind);

    this.context.events.emit('dailySignInClaimed', { day: nextDay, salary: reward.salary, cultivationExp: reward.cultivationExp, mind: reward.mind, grace: isGrace });

    return { day: nextDay, salary: reward.salary, cultivationExp: reward.cultivationExp, mind: reward.mind, grace: isGrace };
  }

  /** Get the reward config for a specific day in the cycle. */
  public getRewardForDay(day: number): DailyRewardConfig | undefined {
    return this.config.rewards.find((r) => r.day === day);
  }

  /** Total number of days in a cycle. */
  public getCycleDays(): number {
    return this.config.cycleDays;
  }

  private dayBoundaries(timestamp: number): { dayStart: number; graceEnd: number } {
    const msPerDay = 86_400_000;
    const dayStart = Math.floor(timestamp / msPerDay) * msPerDay;
    const graceEnd = dayStart + this.config.graceHours * 3_600_000;
    return { dayStart, graceEnd };
  }
}