/**
 * RewardedAdService — Mock rewarded ad system for WEB V1.
 *
 * Simulates the rewarded ad experience without a real ad SDK.
 * Supports configurable ad duration, completion callback, and
 * frequency capping per ad type.
 *
 * In production, this would be replaced by a real ad SDK adapter.
 */

import { DEFAULT_CLOCK, type Clock } from '../core/clock';
import type { RewardType } from './reward-provider';

/** Ad placement types for frequency capping. */
export type AdPlacement =
  | 'TASK_SPEEDUP'
  | 'TASK_DOUBLE_REWARD'
  | 'OFFLINE_DOUBLE'
  | 'MIND_RECOVERY'
  | 'PROMOTION_RETRY'
  | 'CULTIVATION_BOOST'
  | 'MERGE_HINT';

export interface RewardedAdResult {
  readonly success: boolean;
  readonly rewardType: RewardType;
  readonly placement: AdPlacement;
  readonly durationWatched: number;
  readonly reason?: string;
}

export interface RewardedAdServiceOptions {
  readonly clock?: Clock;
  /** Minimum seconds between ads of the same placement type. Default: 60. */
  readonly cooldownPerPlacement?: number;
  /** Maximum ads per hour across all placements. Default: 10. */
  readonly maxAdsPerHour?: number;
  /** Simulated ad duration in seconds. Default: 5. */
  readonly simulatedDuration?: number;
}

/** Ad watch history entry for frequency capping. */
interface AdHistoryEntry {
  readonly placement: AdPlacement;
  readonly timestamp: number;
}

export class RewardedAdService {
  private readonly clock: Clock;
  private readonly cooldownPerPlacement: number;
  private readonly maxAdsPerHour: number;
  private readonly simulatedDuration: number;
  private readonly history: AdHistoryEntry[] = [];
  private watching = false;

  public constructor(options: RewardedAdServiceOptions = {}) {
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.cooldownPerPlacement = options.cooldownPerPlacement ?? 60;
    this.maxAdsPerHour = options.maxAdsPerHour ?? 10;
    this.simulatedDuration = options.simulatedDuration ?? 5;
  }

  /** Whether an ad can be shown for the given placement right now. */
  public canShow(placement: AdPlacement): boolean {
    if (this.watching) return false;
    const now = this.clock.now();
    // Check per-placement cooldown
    const lastForPlacement = this.history
      .filter((e) => e.placement === placement)
      .pop();
    if (lastForPlacement && (now - lastForPlacement.timestamp) / 1000 < this.cooldownPerPlacement) {
      return false;
    }
    // Check hourly cap
    const oneHourAgo = now - 3600_000;
    const recentCount = this.history.filter((e) => e.timestamp > oneHourAgo).length;
    return recentCount < this.maxAdsPerHour;
  }

  /** Get remaining cooldown seconds for a placement. */
  public getCooldownRemaining(placement: AdPlacement): number {
    const lastForPlacement = this.history
      .filter((e) => e.placement === placement)
      .pop();
    if (!lastForPlacement) return 0;
    const elapsed = (this.clock.now() - lastForPlacement.timestamp) / 1000;
    return Math.max(0, this.cooldownPerPlacement - elapsed);
  }

  /** Get number of ads watched in the current hour. */
  public getAdsThisHour(): number {
    const oneHourAgo = this.clock.now() - 3600_000;
    return this.history.filter((e) => e.timestamp > oneHourAgo).length;
  }

  /**
   * Show a rewarded ad (mock). Calls onComplete when the simulated ad finishes.
   * In WEB V1, this simulates an ad with a configurable delay.
   * Returns false if the ad cannot be shown (cooldown/cap).
   */
  public show(
    placement: AdPlacement,
    rewardType: RewardType,
    onComplete: (result: RewardedAdResult) => void,
  ): boolean {
    if (!this.canShow(placement)) return false;
    this.watching = true;
    const startTime = this.clock.now();

    // Simulate ad watching with a timeout
    // In a real implementation, this would show an actual ad
    setTimeout(() => {
      this.watching = false;
      const entry: AdHistoryEntry = { placement, timestamp: this.clock.now() };
      this.history.push(entry);
      // Trim history to last 24 hours
      const oneDayAgo = this.clock.now() - 86400_000;
      while (this.history.length > 0 && this.history[0].timestamp < oneDayAgo) {
        this.history.shift();
      }
      onComplete({
        success: true,
        rewardType,
        placement,
        durationWatched: (this.clock.now() - startTime) / 1000,
      });
    }, this.simulatedDuration * 1000);

    return true;
  }

  /** Show a rewarded ad synchronously (for testing). Immediately completes. */
  public showSync(placement: AdPlacement, rewardType: RewardType): RewardedAdResult {
    if (this.watching) {
      return { success: false, rewardType, placement, durationWatched: 0, reason: 'AD_ALREADY_WATCHING' };
    }
    const lastForPlacement = this.history
      .filter((e) => e.placement === placement)
      .pop();
    if (lastForPlacement && (this.clock.now() - lastForPlacement.timestamp) / 1000 < this.cooldownPerPlacement) {
      return { success: false, rewardType, placement, durationWatched: 0, reason: 'COOLDOWN_ACTIVE' };
    }
    const oneHourAgo = this.clock.now() - 3600_000;
    const recentCount = this.history.filter((e) => e.timestamp > oneHourAgo).length;
    if (recentCount >= this.maxAdsPerHour) {
      return { success: false, rewardType, placement, durationWatched: 0, reason: 'HOURLY_CAP_REACHED' };
    }
    const entry: AdHistoryEntry = { placement, timestamp: this.clock.now() };
    this.history.push(entry);
    return {
      success: true,
      rewardType,
      placement,
      durationWatched: this.simulatedDuration,
    };
  }

  /** Cancel the current ad watch (e.g., user navigated away). */
  public cancel(): void {
    this.watching = false;
  }

  /** Whether an ad is currently being watched. */
  public isWatching(): boolean {
    return this.watching;
  }

  /** Reset all ad history (for testing). */
  public reset(): void {
    this.history.length = 0;
    this.watching = false;
  }
}