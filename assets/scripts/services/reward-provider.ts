export interface RewardProvider {
  claimMindRecovery(): number;
}

/** Phase 2 本地占位实现；不接入真实广告或网络服务。 */
export class MockRewardProvider implements RewardProvider {
  public constructor(private readonly recoveryAmount = 50) {}

  public claimMindRecovery(): number {
    return this.recoveryAmount;
  }
}
