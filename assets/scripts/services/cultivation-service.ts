import type { GameContext } from '../core/game-context';

export interface CultivationServiceOptions {
  readonly mergeRewards?: readonly number[];
}

export interface CultivationRewardGrantOptions {
  readonly persist?: boolean;
}

export class CultivationService {
  public readonly mergeRewards: readonly number[];
  private readonly grantedMergeRewards = new Set<string>();

  public constructor(private readonly context: GameContext, options: CultivationServiceOptions = {}) {
    this.mergeRewards = Object.freeze([...(options.mergeRewards ?? context.configService.economy.cultivationRewards ?? [5, 10, 20, 40, 80])]);
    if (this.mergeRewards.length !== 5 || this.mergeRewards.some((reward) => !Number.isSafeInteger(reward) || reward < 0)) {
      throw new Error('Invalid cultivation merge rewards');
    }
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
