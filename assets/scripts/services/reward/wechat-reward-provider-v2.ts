/**
 * WechatRewardProviderV2 — production-ready rewarded video ad for WeChat Mini Game.
 *
 * Lifecycle:
 *   1. initialize(adUnitId) — creates the ad instance, registers error/close handlers
 *   2. requestReward(type, onComplete) — shows the ad, delivers exactly-one callback
 *   3. dispose() — destroys the ad instance, clears all handlers
 *
 * Fallback: if wx is unavailable or ad creation fails, falls back to MockRewardProvider.
 */

import { type RewardProvider, type RewardType, type RewardResult, MockRewardProvider } from '../reward-provider';

/** WeChat rewarded video ad instance interface (subset of wx.RewardedVideoAd). */
interface WxRewardedVideoAd {
  show(): Promise<void>;
  onClose(callback: (res: { isEnded: boolean }) => void): void;
  offClose(callback: (res: { isEnded: boolean }) => void): void;
  onError(callback: (err: { errCode: number; errMsg: string }) => void): void;
  destroy(): void;
}

/** WeChat Mini Game API subset needed for rewarded ads. */
interface WxMiniGameAdApi {
  createRewardedVideoAd(options: { adUnitId: string }): WxRewardedVideoAd;
}

export interface WechatRewardConfig {
  /** Whether rewarded ads are enabled. Default: false. */
  readonly enabled: boolean;
  /** The ad unit ID from WeChat backend. */
  readonly adUnitId: string;
  /** Mind recovery amount when ad is not available. Default: 50. */
  readonly fallbackRecoveryAmount?: number;
}

/** State of the ad instance. */
type AdState = 'UNINITIALIZED' | 'READY' | 'SHOWING' | 'DISPOSED';

export class WechatRewardProviderV2 implements RewardProvider {
  private ad: WxRewardedVideoAd | null = null;
  private adState: AdState = 'UNINITIALIZED';
  private pendingCallback: ((result: RewardResult) => void) | null = null;
  private readonly fallback = new MockRewardProvider(this.config.fallbackRecoveryAmount ?? 50);

  public constructor(private readonly config: WechatRewardConfig) {}

  /**
   * Initialize the rewarded video ad instance.
   * Must be called before any requestReward() calls.
   * If wx is unavailable or ad creation fails, silently falls back to mock.
   */
  public initialize(): void {
    if (this.adState !== 'UNINITIALIZED') return;
    if (!this.config.enabled) {
      this.adState = 'DISPOSED';
      return;
    }

    const wx = getWxAdApi();
    if (!wx) {
      this.adState = 'DISPOSED';
      return;
    }

    try {
      this.ad = wx.createRewardedVideoAd({ adUnitId: this.config.adUnitId });
      this.ad.onError((err) => {
        // Ad load error — if we're waiting for a show, deliver failure
        if (this.adState === 'SHOWING' && this.pendingCallback) {
          const cb = this.pendingCallback;
          this.pendingCallback = null;
          this.adState = 'READY';
          cb({ status: 'failed', reason: `Ad error: ${err.errCode}` });
        }
      });
      this.adState = 'READY';
    } catch {
      this.adState = 'DISPOSED';
    }
  }

  public claimMindRecovery(): number {
    return this.fallback.claimMindRecovery();
  }

  public requestReward(type: RewardType, onComplete: (result: RewardResult) => void): void {
    // If ad is not available, fall back to mock (always grants)
    if (this.adState === 'DISPOSED' || this.adState === 'UNINITIALIZED' || !this.ad) {
      this.fallback.requestReward(type, onComplete);
      return;
    }

    if (this.adState === 'SHOWING') {
      // Already showing an ad — reject concurrent request
      onComplete({ status: 'failed', reason: 'Ad already showing' });
      return;
    }

    this.adState = 'SHOWING';
    this.pendingCallback = onComplete;

    // Register one-time close handler
    const closeHandler = (res: { isEnded: boolean }): void => {
      this.ad?.offClose(closeHandler);
      if (!this.pendingCallback) return; // already handled by error

      const cb = this.pendingCallback;
      this.pendingCallback = null;
      this.adState = 'READY';

      if (res.isEnded) {
        cb({ status: 'granted' });
      } else {
        cb({ status: 'cancelled', reason: 'Ad not fully watched' });
      }
    };

    this.ad.onClose(closeHandler);

    // Show the ad
    this.ad.show().catch((err: unknown) => {
      // show() rejected — ad not loaded yet or other error
      this.ad?.offClose(closeHandler);
      if (!this.pendingCallback) return;

      const cb = this.pendingCallback;
      this.pendingCallback = null;
      this.adState = 'READY';

      // Fall back to mock on show failure
      this.fallback.requestReward(type, cb);
    });
  }

  /** Destroy the ad instance and release resources. */
  public dispose(): void {
    if (this.ad) {
      try { this.ad.destroy(); } catch { /* ignore */ }
      this.ad = null;
    }
    this.adState = 'DISPOSED';
    this.pendingCallback = null;
  }

  /** Current ad state for diagnostics. */
  public getAdState(): AdState { return this.adState; }
}

function getWxAdApi(): WxMiniGameAdApi | undefined {
  const globalRef = globalThis as { wx?: WxMiniGameAdApi };
  return typeof globalRef.wx === 'object' && globalRef.wx !== null ? globalRef.wx : undefined;
}