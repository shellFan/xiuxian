import type { GameContext } from '../core/game-context';


export interface EconomyServiceOptions {
  /** @deprecated Merge rewards are no longer used in PC V1. */
  readonly mergeRewards?: readonly number[];
}

export interface RewardGrantOptions {
  readonly persist?: boolean;
}

export class EconomyService {
  /** @deprecated Merge rewards are no longer used in PC V1. Kept for backward compat. */
  public readonly mergeRewards: readonly number[];
  private readonly grantedMergeRewards = new Set<string>();

  public constructor(private readonly context: GameContext, options: EconomyServiceOptions = {}) {
    this.mergeRewards = Object.freeze([...(options.mergeRewards ?? context.configService.economy.mergeRewards)]);
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

  public applyIdleSalary(amount: number): void {
    validateRewardAmount(amount, 'salary');
    const total = this.context.player.salary + amount;
    if (!Number.isSafeInteger(total)) throw new Error('Invalid salary change');
    this.context.player.salary = total;
  }

  public rollbackIdleSalary(amount: number): void {
    validateRewardAmount(amount, 'salary');
    const total = this.context.player.salary - amount;
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid salary rollback');
    this.context.player.salary = total;
  }

  /** Add spirit stones (灵石) to the player. */
  public addSpiritStones(amount: number): void {
    validateRewardAmount(amount, 'spiritStones');
    const total = this.context.player.spiritStones + amount;
    if (!Number.isSafeInteger(total)) throw new Error('Invalid spirit stones change');
    this.context.player.spiritStones = total;
  }

  /** Spend spirit stones (灵石) from the player. Throws if insufficient. */
  public spendSpiritStones(amount: number): void {
    validateRewardAmount(amount, 'spiritStones');
    const total = this.context.player.spiritStones - amount;
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Insufficient spirit stones');
    this.context.player.spiritStones = total;
  }

  /** @deprecated Merge rewards are no longer used in PC V1. Kept for backward compat. */
  public grantMergeReward(mergeId: string, mergeLevel: number, options: RewardGrantOptions = {}): number {
    if (typeof mergeId !== 'string' || mergeId.trim() === '' || !Number.isInteger(mergeLevel) || mergeLevel < 1 || mergeLevel > this.mergeRewards.length) {
      throw new Error('Invalid merge reward');
    }
    if (this.grantedMergeRewards.has(mergeId)) return 0;
    const reward = this.mergeRewards[mergeLevel - 1] ?? 0;
    this.grantedMergeRewards.add(mergeId);
    const previousSalary = this.context.player.salary;
    try {
      this.context.player.salary += reward;
      if (!Number.isSafeInteger(this.context.player.salary)) throw new Error('Invalid salary change');
      if (options.persist !== false) {
        this.context.saveService.save(this.context.player);
        try {
          this.context.events.emit('salaryChanged', { amount: reward, total: this.context.player.salary });
          this.context.events.emit('gameSaved', { reason: 'economy' });
        } catch {
          // Feedback listeners cannot undo a committed economy transaction.
        }
      }
    } catch (error) {
      this.context.player.salary = previousSalary;
      this.grantedMergeRewards.delete(mergeId);
      throw error;
    }
    return reward;
  }

  /** @deprecated Merge rewards are no longer used in PC V1. Kept for backward compat. */
  public rollbackMergeReward(mergeId: string, reward: number): void {
    if (this.grantedMergeRewards.delete(mergeId)) this.context.player.salary -= reward;
  }
}

function validateRewardAmount(amount: number, name: string): void {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`Invalid ${name} change`);
}

