/**
 * RewardService — state-machine–guarded reward request flow.
 *
 * Wraps a RewardProvider and enforces:
 *   1. No concurrent requests (IDLE → REQUESTING only).
 *   2. Exactly-one callback delivery (double-grant protection).
 *   3. Proper state transitions: IDLE → REQUESTING → GRANTED | CANCELLED | FAILED → IDLE.
 *
 * This replaces the raw RewardProvider.requestReward() call pattern
 * that had no state tracking or abuse protection.
 */

import { type RewardProvider, type RewardType, type RewardResult, isRewardGranted } from '../reward-provider';
import { type UiEventCategory } from '../../facade/ui-event-types';

/** Reward request state machine states. */
export type RewardState = 'IDLE' | 'REQUESTING' | 'GRANTED' | 'CANCELLED' | 'FAILED';

/** Callback type for reward state changes. */
export type RewardStateListener = (state: RewardState, type: RewardType, result?: RewardResult) => void;

export class RewardService {
  private state: RewardState = 'IDLE';
  private currentType: RewardType | null = null;
  private requestGeneration = 0;
  private callbackFired = false;
  private readonly stateListeners = new Set<RewardStateListener>();
  private readonly eventPublisher?: (category: UiEventCategory, source: string, detail?: unknown) => void;

  public constructor(
    private readonly provider: RewardProvider,
    eventPublisher?: (category: UiEventCategory, source: string, detail?: unknown) => void,
  ) {
    this.eventPublisher = eventPublisher;
  }

  /** Current state of the reward state machine. */
  public getState(): RewardState { return this.state; }

  /** The reward type currently being requested, or null if IDLE. */
  public getCurrentType(): RewardType | null { return this.currentType; }

  /** Whether a reward request is in progress. */
  public isBusy(): boolean { return this.state === 'REQUESTING'; }

  /**
   * Request a reward of the given type.
   * Throws if a request is already in progress (IDLE guard).
   * The onComplete callback is guaranteed to be called at most once per request.
   * Uses both a per-request callbackFired guard AND a generation counter to
   * prevent double-grant from duplicate callbacks and stale callbacks from
   * previous requests after a new request has started.
   */
  public request(type: RewardType, onComplete: (result: RewardResult) => void): void {
    if (this.state !== 'IDLE') {
      throw new Error(`RewardService: cannot request while in state ${this.state}`);
    }

    this.state = 'REQUESTING';
    this.currentType = type;
    this.callbackFired = false;
    const generation = ++this.requestGeneration;
    this.notifyListeners('REQUESTING', type);
    this.eventPublisher?.('REWARD_REQUESTED', 'rewardService', { type });

    this.provider.requestReward(type, (result) => {
      // Double-callback guard: ignore duplicate invocation within same request
      if (this.callbackFired) {
        return;
      }
      // Generation guard: ignore stale callbacks from previous requests
      if (generation !== this.requestGeneration) {
        return;
      }
      this.callbackFired = true;

      this.state = result.status === 'granted' ? 'GRANTED'
        : result.status === 'cancelled' ? 'CANCELLED'
        : 'FAILED';

      this.notifyListeners(this.state, type, result);
      this.eventPublisher?.('REWARD_COMPLETED', 'rewardService', { type, result });

      onComplete(result);

      // Reset to IDLE after a microtask to allow UI to read the terminal state
      queueMicrotask(() => {
        if (generation === this.requestGeneration && this.state !== 'IDLE') {
          this.state = 'IDLE';
          this.currentType = null;
        }
      });
    });
  }

  /**
   * Synchronous mind recovery (used by MindService).
   * Delegates directly to the provider — no state machine involved.
   */
  public claimMindRecovery(): number {
    return this.provider.claimMindRecovery();
  }

  /** Subscribe to reward state changes. */
  public onStateChange(listener: RewardStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Force-reset to IDLE (for error recovery / disposal). */
  public reset(): void {
    this.state = 'IDLE';
    this.currentType = null;
    this.requestGeneration++; // Invalidate any pending callback
    this.callbackFired = false;
  }

  /** Dispose: clear all listeners and reset state. */
  public dispose(): void {
    this.stateListeners.clear();
    this.reset();
  }

  private notifyListeners(state: RewardState, type: RewardType, result?: RewardResult): void {
    for (const listener of this.stateListeners) {
      try { listener(state, type, result); } catch { /* listener errors must not propagate */ }
    }
  }
}

/**
 * Check if a reward result represents a successful grant.
 * Convenience re-export for consumers who don't want to import from reward-provider.
 */
export { isRewardGranted };