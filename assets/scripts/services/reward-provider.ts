export type RewardType =
  | 'MIND_RECOVERY'
  | 'OFFLINE_DOUBLE'
  | 'PROMOTION_RETRY'
  | 'EVENT_REROLL'
  | 'WORK_BOOST'
  | 'AUTO_MERGE'
  | 'INSTANT_RECRUIT';

export type RewardResultStatus = 'granted' | 'cancelled' | 'failed';

export interface RewardResult {
  readonly status: RewardResultStatus;
  readonly reason?: string;
}

export interface RewardProvider {
  /** Synchronous mind recovery amount (used by MindService). */
  claimMindRecovery(): number;
  /**
   * Requests a rewarded-ad-style grant. The real implementation would show an ad
   * and invoke `onComplete` once; the mock resolves synchronously.
   * Services MUST guard against duplicate callbacks themselves.
   */
  requestReward(type: RewardType, onComplete: (result: RewardResult) => void): void;
}

export function isRewardGranted(result: RewardResult): boolean {
  return result.status === 'granted';
}

/** Phase 3 local mock — no real ad SDK. */
export class MockRewardProvider implements RewardProvider {
  public constructor(private readonly recoveryAmount = 50) {}

  public claimMindRecovery(): number {
    return this.recoveryAmount;
  }

  public requestReward(_type: RewardType, onComplete: (result: RewardResult) => void): void {
    onComplete({ status: 'granted' });
  }
}
