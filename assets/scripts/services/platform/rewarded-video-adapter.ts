/**
 * V8.0 V7.7 TASK-035/036/037 — 平台激励视频广告适配层。
 *
 * 设计边界（与 IAA-FREQUENCY-V1 / TASK-036 要求一一对应）：
 *   - 自愿触发（requestReward 仅由玩家点击入口调用）
 *   - 明确奖励 + 用户可拒绝（cancelled 路径）
 *   - 完整观看才发奖（isEnded/isComplete 校验，平台各自字段）
 *   - 关闭不发额外奖励（cancelled 不发奖）
 *   - 重复回调不重复发奖（once 包装 + 服务层幂等）
 *   - 无广告环境降级（desktop = 本地直接授予；小游戏无 adUnitId = Mock 测试环境）
 *
 * 平台 SDK 只在对应运行时全局（wx / tt）真实存在时才调用；不伪造 SDK。
 */

import type { RewardProvider, RewardResult, RewardType } from '../reward-provider';
import { MockRewardProvider } from '../reward-provider';
import { RewardAdPolicy } from '../reward-ad-policy';

/** 平台激励视频宿主的统一抽象。 */
export interface RewardedVideoHost {
  readonly platform: 'wechat' | 'douyin';
  /** 广告资源是否可用（SDK 存在且 adUnitId 已配置）。 */
  isAvailable(): boolean;
  /** 展示激励视频；onClosed 在关闭时回调一次。 */
  show(onClosed: (result: { granted: boolean; reason?: string }) => void): void;
  destroy(): void;
}

/** 运行时全局桥：wx / tt 存在性检测（不在无该运行时的环境崩溃）。 */
export interface MiniGameRuntime {
  readonly kind: 'wechat' | 'douyin';
  createRewardedVideoAd(options: { adUnitId: string }): unknown;
}

export function detectMiniGameRuntime(): MiniGameRuntime | null {
  const g = typeof globalThis !== 'undefined' ? (globalThis as Record<string, unknown>) : {};
  if (typeof g['wx'] === 'object' && g['wx'] !== null && typeof (g['wx'] as { createRewardedVideoAd?: unknown }).createRewardedVideoAd === 'function') {
    return { kind: 'wechat', createRewardedVideoAd: (g['wx'] as { createRewardedVideoAd: unknown }).createRewardedVideoAd as MiniGameRuntime['createRewardedVideoAd'] };
  }
  if (typeof g['tt'] === 'object' && g['tt'] !== null && typeof (g['tt'] as { createRewardedVideoAd?: unknown }).createRewardedVideoAd === 'function') {
    return { kind: 'douyin', createRewardedVideoAd: (g['tt'] as { createRewardedVideoAd: unknown }).createRewardedVideoAd as MiniGameRuntime['createRewardedVideoAd'] };
  }
  return null;
}

/** 微信激励视频宿主（wx.createRewardedVideoAd）。 */
export class WechatRewardedVideoHost implements RewardedVideoHost {
  readonly platform = 'wechat' as const;
  private readonly runtime: MiniGameRuntime;
  private adInstance: unknown = null;
  private loaded = false;

  public constructor(runtime: MiniGameRuntime, private readonly adUnitId: string) {
    this.runtime = runtime;
  }

  public isAvailable(): boolean { return !!this.adUnitId; }

  public show(onClosed: (result: { granted: boolean; reason?: string }) => void): void {
    if (!this.adInstance) {
      this.adInstance = this.runtime.createRewardedVideoAd({ adUnitId: this.adUnitId });
    }
    const ad = this.adInstance as {
      load(): Promise<void>;
      show(): Promise<void>;
      onClose(cb: (res: { isEnded?: boolean; isComplete?: boolean }) => void): void;
      offClose(cb: (res: { isEnded?: boolean; isComplete?: boolean }) => void): void;
    };
    let settled = false;
    const onClose = (res: { isEnded?: boolean; isComplete?: boolean }) => {
      if (settled) return; // V8.0：重复回调不重复发奖
      settled = true;
      try { ad.offClose(onClose); } catch (_) { /* 平台无 offClose 时忽略 */ }
      // 微信：完整观看 = res.isEnded 或（新版字段）res.isComplete
      const granted = !!(res && (res.isEnded === true || res.isComplete === true));
      onClosed(granted ? { granted: true } : { granted: false, reason: 'AD_CANCELLED' });
    };
    ad.onClose(onClose);
    const ensureLoad = this.loaded ? Promise.resolve() : Promise.resolve(ad.load()).then(() => { this.loaded = true; });
    ensureLoad
      .then(() => ad.show())
      .catch((err: unknown) => {
        if (!settled) {
          settled = true;
          try { ad.offClose(onClose); } catch (_) { /* ignore */ }
          onClosed({ granted: false, reason: 'AD_ERROR:' + String((err as Error)?.message ?? err).slice(0, 80) });
        }
      });
  }

  public destroy(): void { this.adInstance = null; this.loaded = false; }
}

/** 抖音激励视频宿主（tt.createRewardedVideoAd）。 */
export class DouyinRewardedVideoHost implements RewardedVideoHost {
  readonly platform = 'douyin' as const;
  private readonly runtime: MiniGameRuntime;
  private adInstance: unknown = null;
  private loaded = false;

  public constructor(runtime: MiniGameRuntime, private readonly adUnitId: string) {
    this.runtime = runtime;
  }

  public isAvailable(): boolean { return !!this.adUnitId; }

  public show(onClosed: (result: { granted: boolean; reason?: string }) => void): void {
    if (!this.adInstance) {
      this.adInstance = this.runtime.createRewardedVideoAd({ adUnitId: this.adUnitId });
    }
    const ad = this.adInstance as {
      load(): Promise<void>;
      show(): Promise<void>;
      onClose(cb: (res: { isEnded?: boolean; isComplete?: boolean }) => void): void;
      offClose(cb: (res: { isEnded?: boolean; isComplete?: boolean }) => void): void;
    };
    let settled = false;
    const onClose = (res: { isEnded?: boolean; isComplete?: boolean }) => {
      if (settled) return;
      settled = true;
      try { ad.offClose(onClose); } catch (_) { /* ignore */ }
      // 抖音：完整观看 = res.isEnded
      const granted = !!(res && res.isEnded === true);
      onClosed(granted ? { granted: true } : { granted: false, reason: 'AD_CANCELLED' });
    };
    ad.onClose(onClose);
    const ensureLoad = this.loaded ? Promise.resolve() : Promise.resolve(ad.load()).then(() => { this.loaded = true; });
    ensureLoad
      .then(() => ad.show())
      .catch((err: unknown) => {
        if (!settled) {
          settled = true;
          try { ad.offClose(onClose); } catch (_) { /* ignore */ }
          onClosed({ granted: false, reason: 'AD_ERROR:' + String((err as Error)?.message ?? err).slice(0, 80) });
        }
      });
  }

  public destroy(): void { this.adInstance = null; this.loaded = false; }
}

export interface PlatformAdProviderOptions {
  /** 平台广告位 ID（小游戏）；缺省 = Mock 测试环境（不宣称真实广告）。 */
  readonly adUnitId?: string;
  /** 强制使用 Mock（桌面/无 SDK 环境）。 */
  readonly forceMock?: boolean;
  /** 广告频率策略（可选；传入即启用频控）。 */
  readonly policy?: RewardAdPolicy;
  /** 直接注入宿主（测试用；生产由 detectMiniGameRuntime 决定）。 */
  readonly host?: RewardedVideoHost;
}

/**
 * 平台激励广告 Provider（实现 RewardProvider 接口）。
 * - 桌面/无 SDK：直接回落 MockRewardProvider（本地授予，桌面无 IAA）。
 * - 小游戏 + adUnitId：真实激励视频；complete 发奖 / cancel 不发 / error 不发 / 重复回调只发一次。
 * - 传入 policy 时：频控（会话/每日/间隔/取消冷却/失败冷却）。
 */
export class PlatformAdProvider implements RewardProvider {
  private readonly fallback = new MockRewardProvider();
  private readonly host: RewardedVideoHost | null;
  private readonly usingRealSdk: boolean;

  public constructor(options: PlatformAdProviderOptions = {}) {
    if (options.host) {
      this.host = options.host;
      this.usingRealSdk = true;
      return;
    }
    if (options.forceMock) {
      this.host = null;
      this.usingRealSdk = false;
      return;
    }
    const runtime = detectMiniGameRuntime();
    if (runtime && options.adUnitId) {
      this.host = runtime.kind === 'wechat'
        ? new WechatRewardedVideoHost(runtime, options.adUnitId)
        : new DouyinRewardedVideoHost(runtime, options.adUnitId);
      this.usingRealSdk = true;
      return;
    }
    this.host = null;
    this.usingRealSdk = false;
  }

  public claimMindRecovery(): number {
    return this.fallback.claimMindRecovery();
  }

  public requestReward(type: RewardType, onComplete: (result: RewardResult) => void): void {
    if (!this.usingRealSdk || !this.host || !this.host.isAvailable()) {
      // 无广告环境（桌面/测试）：本地授予并标注来源，绝不伪造广告播放。
      this.fallback.requestReward(type, onComplete);
      return;
    }
    if (this.policy && !this.policy.isAllowed()) {
      onComplete({ status: 'failed', reason: 'AD_POLICY_BLOCKED' });
      return;
    }
    let settled = false;
    this.host.show((res) => {
      if (settled) return; // 重复回调不重复发奖
      settled = true;
      if (this.policy) { if (res.granted) this.policy.recordShown(); else this.policy.recordCancelled(); }
      if (res.granted) onComplete({ status: 'granted' });
      else onComplete({ status: res.reason === 'AD_CANCELLED' ? 'cancelled' : 'failed', reason: res.reason });
    });
  }

  private policy: RewardAdPolicy | undefined;
  public setPolicy(policy: RewardAdPolicy): void { this.policy = policy; }

}
