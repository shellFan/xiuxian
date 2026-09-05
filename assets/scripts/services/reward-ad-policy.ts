/**
 * RewardAdPolicy — IAA (In-App Advertising) frequency policy.
 *
 * Enforces session count, daily count, minimum interval, cancel cooldown,
 * and failure cooldown for rewarded ad placements. Prevents ad fatigue
 * and ensures compliance with platform policies.
 *
 * Rules (from IAA-FREQUENCY-V1.md):
 *   - Max N rewarded ads per session (default: 10)
 *   - Max N rewarded ads per day (default: 20)
 *   - Minimum interval between ads (default: 60s)
 *   - Cancel cooldown: after user cancels, wait N seconds (default: 30s)
 *   - Failure cooldown: after ad fails to load, wait N seconds (default: 120s)
 */

export interface RewardAdPolicyOptions {
  /** Max rewarded ads per session. Default: 10. */
  readonly maxSessionCount?: number;
  /** Max rewarded ads per day. Default: 20. */
  readonly maxDailyCount?: number;
  /** Minimum interval between ads in seconds. Default: 60. */
  readonly minIntervalSeconds?: number;
  /** Cancel cooldown in seconds. Default: 30. */
  readonly cancelCooldownSeconds?: number;
  /** Failure cooldown in seconds. Default: 120. */
  readonly failureCooldownSeconds?: number;
}

export interface RewardAdPolicyState {
  readonly sessionCount: number;
  readonly dailyCount: number;
  readonly dailyResetDate: string; // YYYY-MM-DD
  readonly lastAdTime: number; // timestamp ms
  readonly lastCancelTime: number; // timestamp ms
  readonly lastFailureTime: number; // timestamp ms
}

export type AdPolicyCheckResult =
  | { allowed: true }
  | { allowed: false; reason: 'SESSION_LIMIT' | 'DAILY_LIMIT' | 'MIN_INTERVAL' | 'CANCEL_COOLDOWN' | 'FAILURE_COOLDOWN' };

export class RewardAdPolicy {
  private readonly maxSessionCount: number;
  private readonly maxDailyCount: number;
  private readonly minIntervalMs: number;
  private readonly cancelCooldownMs: number;
  private readonly failureCooldownMs: number;

  private sessionCount = 0;
  private dailyCount = 0;
  private dailyResetDate = '';
  private lastAdTime = 0;
  private lastCancelTime = 0;
  private lastFailureTime = 0;

  public constructor(
    private readonly clock: () => number = Date.now,
    options: RewardAdPolicyOptions = {},
  ) {
    this.maxSessionCount = options.maxSessionCount ?? 10;
    this.maxDailyCount = options.maxDailyCount ?? 20;
    this.minIntervalMs = (options.minIntervalSeconds ?? 60) * 1000;
    this.cancelCooldownMs = (options.cancelCooldownSeconds ?? 30) * 1000;
    this.failureCooldownMs = (options.failureCooldownSeconds ?? 120) * 1000;
  }

  // ── Policy Check ──────────────────────────────────────────────────────────

  /** Check if a rewarded ad request is allowed right now. */
  public check(): AdPolicyCheckResult {
    const now = this.clock();
    this.resetDailyIfNeeded(now);

    // Session limit
    if (this.sessionCount >= this.maxSessionCount) {
      return { allowed: false, reason: 'SESSION_LIMIT' };
    }

    // Daily limit
    if (this.dailyCount >= this.maxDailyCount) {
      return { allowed: false, reason: 'DAILY_LIMIT' };
    }

    // Minimum interval
    if (this.lastAdTime > 0 && now - this.lastAdTime < this.minIntervalMs) {
      return { allowed: false, reason: 'MIN_INTERVAL' };
    }

    // Cancel cooldown
    if (this.lastCancelTime > 0 && now - this.lastCancelTime < this.cancelCooldownMs) {
      return { allowed: false, reason: 'CANCEL_COOLDOWN' };
    }

    // Failure cooldown
    if (this.lastFailureTime > 0 && now - this.lastFailureTime < this.failureCooldownMs) {
      return { allowed: false, reason: 'FAILURE_COOLDOWN' };
    }

    return { allowed: true };
  }

  /** Whether a rewarded ad request is allowed right now. */
  public isAllowed(): boolean {
    return this.check().allowed;
  }

  // ── State Mutations ───────────────────────────────────────────────────────

  /** Record that an ad was shown (called after successful ad completion). */
  public recordShown(): void {
    const now = this.clock();
    this.resetDailyIfNeeded(now);
    this.sessionCount++;
    this.dailyCount++;
    this.lastAdTime = now;
  }

  /** Record that the user cancelled the ad. */
  public recordCancelled(): void {
    this.lastCancelTime = this.clock();
  }

  /** Record that the ad failed to load or show. */
  public recordFailed(): void {
    this.lastFailureTime = this.clock();
  }

  /** Reset session count (called on new session). */
  public resetSession(): void {
    this.sessionCount = 0;
    this.lastAdTime = 0;
    this.lastCancelTime = 0;
    this.lastFailureTime = 0;
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  /** Get current policy state (for save/display). */
  public getState(): RewardAdPolicyState {
    return {
      sessionCount: this.sessionCount,
      dailyCount: this.dailyCount,
      dailyResetDate: this.dailyResetDate,
      lastAdTime: this.lastAdTime,
      lastCancelTime: this.lastCancelTime,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /** Get remaining session ads. */
  public getRemainingSessionAds(): number {
    return Math.max(0, this.maxSessionCount - this.sessionCount);
  }

  /** Get remaining daily ads. */
  public getRemainingDailyAds(): number {
    this.resetDailyIfNeeded(this.clock());
    return Math.max(0, this.maxDailyCount - this.dailyCount);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private resetDailyIfNeeded(now: number): void {
    const today = new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD
    if (this.dailyResetDate !== today) {
      this.dailyCount = 0;
      this.dailyResetDate = today;
    }
  }
}