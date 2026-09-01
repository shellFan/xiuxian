import wechatPlatformConfig from '../../../configs/platform.wechat.json';
import { MockRewardProvider, type RewardProvider, type RewardResult, type RewardType } from '../reward-provider';

export interface WechatPlatformConfig {
  readonly enabled: boolean;
  readonly rewardedVideoAdUnitId: string;
}

export class WechatRewardProvider implements RewardProvider {
  private readonly fallback = new MockRewardProvider();

  public constructor(private readonly config: WechatPlatformConfig = wechatPlatformConfig) {}

  public claimMindRecovery(): number {
    return this.fallback.claimMindRecovery();
  }

  public requestReward(type: RewardType, onComplete: (result: RewardResult) => void): void {
    if (!this.config.enabled || !this.config.rewardedVideoAdUnitId) {
      this.fallback.requestReward(type, onComplete);
      return;
    }
    this.fallback.requestReward(type, onComplete);
  }
}
