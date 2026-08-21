import type { GameContext } from '../core/game-context';
import { MockRewardProvider, type RewardProvider } from './reward-provider';

export type MindStatus = 'NORMAL' | 'BREAKDOWN';

export class MindService {
  public constructor(
    private readonly context: GameContext,
    private readonly rewardProvider: RewardProvider = new MockRewardProvider(),
  ) {}

  public get current(): number { return this.context.player.mind; }
  public get max(): number { return this.context.player.maxMind; }
  public get status(): MindStatus { return this.current <= 0 ? 'BREAKDOWN' : 'NORMAL'; }
  public get statusText(): string { return this.status === 'BREAKDOWN' ? '道心崩溃' : '道心稳固'; }
  public getStatus(): MindStatus { return this.status; }
  public getStatusText(): string { return this.statusText; }

  public change(amount: number): number {
    if (!Number.isFinite(amount) || !Number.isInteger(amount)) throw new Error('Invalid mind change');
    const previous = this.current;
    const next = clampMind(previous + amount, this.max);
    this.persist(next, previous);
    return next - previous;
  }

  public rest(): number {
    return this.change(this.max - this.current);
  }

  public recoverByRest(): number { return this.rest(); }

  public recoverWithReward(provider: RewardProvider = this.rewardProvider): number {
    const amount = provider.claimMindRecovery();
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) throw new Error('Invalid mind reward');
    return this.change(amount);
  }

  public recoverByReward(provider: RewardProvider = this.rewardProvider): number {
    return this.recoverWithReward(provider);
  }

  private persist(next: number, previous: number): void {
    this.context.player.mind = next;
    try {
      this.context.saveService.save(this.context.player);
    } catch (error) {
      this.context.player.mind = previous;
      throw error;
    }
  }
}

export function clampMind(value: number, maxMind = 100): number {
  if (!Number.isFinite(value) || !Number.isFinite(maxMind) || maxMind < 0) throw new Error('Invalid mind bounds');
  return Math.min(Math.max(value, 0), maxMind);
}
