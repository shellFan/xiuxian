export type RewardType = 'MIND_RECOVERY' | 'OFFLINE_DOUBLE' | 'PROMOTION_RETRY';

export interface RewardProvider {
  /** Synchronous mind recovery amount (used by MindService). */
  claimMindRecovery(): number;
  /**
   * Requests a rewarded-ad-style grant. The real implementation would show an ad
   * and invoke `onComplete` once with the granted flag; the mock resolves
   * synchronously. Services MUST guard against duplicate callbacks themselves.
   */
  requestReward(type: RewardType, onComplete: (granted: boolean) => void): void;
}

/** Phase 2 本地占位实现；不接入真实广告或网络服务。 */
export class MockRewardProvider implements RewardProvider {
  public constructor(private readonly recoveryAmount = 50) {}

  public claimMindRecovery(): number {
    return this.recoveryAmount;
  }

  public requestReward(_type: RewardType, onComplete: (granted: boolean) => void): void {
    onComplete(true);
  }
}
