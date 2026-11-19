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
import type { StorageAdapter } from './storage-adapter';

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
  /**
   * V10.2（IAA 频控持久化）：提供 storage 时，广告频控历史跨页面重载/跨会话保留，
   * 不再"重载即重置"。缺省不持久化（纯内存，测试环境用）。
   */
  readonly storage?: StorageAdapter;
}

/** Ad watch history entry for frequency capping. */
interface AdHistoryEntry {
  readonly placement: AdPlacement;
  readonly timestamp: number;
}

/** V10.2：频控历史持久化键与上限（只保留最近 24h，最多 200 条）。 */
const AD_HISTORY_STORAGE_KEY = 'v1-rewarded-ad-history';
const AD_HISTORY_MAX_ENTRIES = 200;
const AD_HISTORY_VALID_PLACEMENTS: readonly AdPlacement[] = [
  'TASK_SPEEDUP', 'TASK_DOUBLE_REWARD', 'OFFLINE_DOUBLE', 'MIND_RECOVERY',
  'PROMOTION_RETRY', 'CULTIVATION_BOOST', 'MERGE_HINT',
];

export class RewardedAdService {
  private readonly clock: Clock;
  private readonly cooldownPerPlacement: number;
  private readonly maxAdsPerHour: number;
  private readonly simulatedDuration: number;
  private readonly history: AdHistoryEntry[] = [];
  private watching = false;
  /** V10 QA P3：pending 的完成定时器句柄——cancel 必须真正取消它，否则奖励仍会发放。 */
  private pendingCompleteTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly storage?: StorageAdapter;

  public constructor(options: RewardedAdServiceOptions = {}) {
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.cooldownPerPlacement = options.cooldownPerPlacement ?? 60;
    this.maxAdsPerHour = options.maxAdsPerHour ?? 10;
    this.simulatedDuration = options.simulatedDuration ?? 5;
    this.storage = options.storage;
    this.loadPersistedHistory();
  }

  /** V10.2：从 storage 恢复频控历史（损坏/越界条目直接丢弃，绝不阻塞广告）。 */
  private loadPersistedHistory(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(AD_HISTORY_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const now = this.clock.now();
      const oneDayAgo = now - 86_400_000;
      const validPlacements = new Set<string>(AD_HISTORY_VALID_PLACEMENTS);
      for (const entry of parsed) {
        const candidate = entry as { placement?: unknown; timestamp?: unknown };
        if (typeof candidate.placement !== 'string' || !validPlacements.has(candidate.placement)) continue;
        if (typeof candidate.timestamp !== 'number' || !Number.isFinite(candidate.timestamp)) continue;
        if (candidate.timestamp < oneDayAgo || candidate.timestamp > now + 60_000) continue;
        this.history.push({ placement: candidate.placement as AdPlacement, timestamp: candidate.timestamp });
      }
      this.history.sort((a, b) => a.timestamp - b.timestamp);
    } catch { /* 历史损坏按无历史处理 */ }
  }

  /** V10.2：把频控历史写回 storage（失败只降级为内存态，不影响广告流程）。 */
  private persistHistory(): void {
    if (!this.storage) return;
    try {
      const oneDayAgo = this.clock.now() - 86_400_000;
      const entries = this.history
        .filter((e) => e.timestamp >= oneDayAgo)
        .slice(-AD_HISTORY_MAX_ENTRIES);
      this.storage.setItem(AD_HISTORY_STORAGE_KEY, JSON.stringify(entries));
    } catch { /* 写失败不影响广告 */ }
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
    if (this.pendingCompleteTimer !== null) clearTimeout(this.pendingCompleteTimer);
    this.pendingCompleteTimer = setTimeout(() => {
      this.pendingCompleteTimer = null;
      this.watching = false;
      const entry: AdHistoryEntry = { placement, timestamp: this.clock.now() };
      this.history.push(entry);
      // Trim history to last 24 hours
      const oneDayAgo = this.clock.now() - 86400_000;
      while (this.history.length > 0 && this.history[0].timestamp < oneDayAgo) {
        this.history.shift();
      }
      this.persistHistory();
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
    this.persistHistory();
    return {
      success: true,
      rewardType,
      placement,
      durationWatched: this.simulatedDuration,
    };
  }

  /** Cancel the current ad watch (e.g., user navigated away). */
  public cancel(): void {
    // V10 QA P3：同时清掉 pending 完成定时器——否则取消后奖励仍会照常发放，
    // 且 canShow 提前放行会造成同一广告双发奖励。
    if (this.pendingCompleteTimer !== null) {
      clearTimeout(this.pendingCompleteTimer);
      this.pendingCompleteTimer = null;
    }
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
    this.persistHistory();
  }
}