import type { GameContext } from '../core/game-context';

const DEFAULT_MERGE_REWARDS = Object.freeze([10, 20, 40, 80, 160]);

export interface EconomyServiceOptions {
  readonly mergeRewards?: readonly number[];
}

export class EconomyService {
  public readonly mergeRewards: readonly number[];
  private readonly grantedMergeRewards = new Set<string>();

  public constructor(private readonly context: GameContext, options: EconomyServiceOptions = {}) {
    this.mergeRewards = Object.freeze([...(options.mergeRewards ?? DEFAULT_MERGE_REWARDS)]);
    if (this.mergeRewards.length !== 5 || this.mergeRewards.some((reward) => !Number.isInteger(reward) || reward < 0)) {
      throw new Error('Invalid economy merge rewards');
    }
  }

  public changeSalary(amount: number): void {
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
      throw new Error('Invalid salary change');
    }
    const previousSalary = this.context.player.salary;
    const total = previousSalary + amount;
    if (!Number.isSafeInteger(total)) throw new Error('Invalid salary change');

    this.context.player.salary = total;
    try {
      this.context.saveService.save(this.context.player);
    } catch (error) {
      this.context.player.salary = previousSalary;
      throw error;
    }
    try {
      this.context.events.emit('salaryChanged', { amount, total });
      this.context.events.emit('gameSaved', { reason: 'economy' });
    } catch {
      // Feedback listeners cannot undo a committed economy transaction.
    }
  }

  public grantMergeReward(mergeId: string, mergeLevel: number): number {
    if (typeof mergeId !== 'string' || mergeId.trim() === '' || !Number.isInteger(mergeLevel) || mergeLevel < 1 || mergeLevel > 5) {
      throw new Error('Invalid merge reward');
    }
    if (this.grantedMergeRewards.has(mergeId)) return 0;
    const reward = this.mergeRewards[mergeLevel - 1];
    this.changeSalary(reward);
    this.grantedMergeRewards.add(mergeId);
    return reward;
  }
}

