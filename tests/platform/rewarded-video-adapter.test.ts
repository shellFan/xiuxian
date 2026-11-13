/**
 * V8.0 V7.7 — 平台激励视频适配器测试。
 * 覆盖：完整观看发奖 / 取消不发 / 加载失败不发 / 重复回调只发一次 /
 *       频控阻断 / 无 SDK 降级 Mock / wechat+douyin 双宿主。
 */
import assert from 'node:assert/strict';
import {
  WechatRewardedVideoHost,
  DouyinRewardedVideoHost,
  PlatformAdProvider,
  type MiniGameRuntime,
  type RewardedVideoHost,
} from '../../assets/scripts/services/platform/rewarded-video-adapter';
import { RewardAdPolicy } from '../../assets/scripts/services/reward-ad-policy';
import type { RewardResult } from '../../assets/scripts/services/reward-provider';

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

/** 可编程宿主（模拟平台 SDK 行为）。 */
class FakeHost implements RewardedVideoHost {
  readonly platform: 'wechat' | 'douyin';
  public available = true;
  public shown = 0;
  private responder: ((r: { granted: boolean; reason?: string }) => void) | null = null;

  public constructor(platform: 'wechat' | 'douyin') { this.platform = platform; }

  public isAvailable(): boolean { return this.available; }

  public show(onClosed: (r: { granted: boolean; reason?: string }) => void): void {
    this.shown++;
    this.responder = onClosed;
  }

  public complete(): void { if (this.responder) this.responder({ granted: true }); }
  public cancel(): void { if (this.responder) this.responder({ granted: false, reason: 'AD_CANCELLED' }); }
  public error(msg: string): void { if (this.responder) this.responder({ granted: false, reason: 'AD_ERROR:' + msg }); }

  public destroy(): void { this.responder = null; }
}

/** 可编程 MiniGameRuntime（模拟 wx/tt 全局）。 */
function fakeRuntime(kind: 'wechat' | 'douyin'): MiniGameRuntime & { created: number } {
  const rt = {
    kind,
    created: 0,
    createRewardedVideoAd(_opts: { adUnitId: string }) {
      rt.created++;
      return {
        load: () => Promise.resolve(),
        show: () => Promise.resolve(),
        onClose: (_cb: unknown) => {},
        offClose: (_cb: unknown) => {},
      };
    },
  };
  return rt as unknown as MiniGameRuntime & { created: number };
}

ok('无 SDK 环境（forceMock）：本地授予且不调用平台 SDK', () => {
  const provider = new PlatformAdProvider({ forceMock: true });
  const resultBox: { r: RewardResult | null } = { r: null };
  provider.requestReward('OFFLINE_DOUBLE', (r) => { resultBox.r = r; });
  assert.equal(resultBox.r && resultBox.r.status, 'granted');
});

ok('微信宿主：完整观看 → granted', () => {
  const host = new FakeHost('wechat');
  const provider = new PlatformAdProvider({ host });
  const resultBox: { r: RewardResult | null } = { r: null };
  provider.requestReward('OFFLINE_DOUBLE', (r) => { resultBox.r = r; });
  assert.equal(host.shown, 1);
  host.complete();
  assert.equal(resultBox.r && resultBox.r.status, 'granted');
});

ok('抖音宿主：完整观看 → granted', () => {
  const host = new FakeHost('douyin');
  const provider = new PlatformAdProvider({ host });
  const resultBox: { r: RewardResult | null } = { r: null };
  provider.requestReward('MIND_RECOVERY', (r) => { resultBox.r = r; });
  host.complete();
  assert.equal(resultBox.r && resultBox.r.status, 'granted');
});

ok('用户中途关闭 → cancelled，不发奖', () => {
  const host = new FakeHost('wechat');
  const provider = new PlatformAdProvider({ host });
  const resultBox: { r: RewardResult | null } = { r: null };
  provider.requestReward('OFFLINE_DOUBLE', (r) => { resultBox.r = r; });
  host.cancel();
  assert.equal(resultBox.r && resultBox.r.status, 'cancelled');
});

ok('加载失败 → failed，不发奖', () => {
  const host = new FakeHost('wechat');
  const provider = new PlatformAdProvider({ host });
  const resultBox: { r: RewardResult | null } = { r: null };
  provider.requestReward('OFFLINE_DOUBLE', (r) => { resultBox.r = r; });
  host.error('timeout');
  assert.equal(resultBox.r && resultBox.r.status, 'failed');
  assert.ok(String(resultBox.r && resultBox.r.reason).startsWith('AD_ERROR'));
});

ok('重复回调只发一次奖', () => {
  const host = new FakeHost('wechat');
  const provider = new PlatformAdProvider({ host });
  let grants = 0;
  provider.requestReward('OFFLINE_DOUBLE', (r) => { if (r.status === 'granted') grants++; });
  host.complete();
  host.complete(); // 平台重复 onClose
  host.complete();
  assert.equal(grants, 1);
});

ok('频控：会话上限后拒绝（AD_POLICY_BLOCKED）', () => {
  const clockNow = { now: 1_000_000 };
  const policy = new RewardAdPolicy(() => clockNow.now, { maxSessionCount: 1, minIntervalSeconds: 0 });
  const host = new FakeHost('wechat');
  const provider = new PlatformAdProvider({ host });
  provider.setPolicy(policy);
  const b1: { r: RewardResult | null } = { r: null };
  provider.requestReward('OFFLINE_DOUBLE', (r) => { b1.r = r; });
  host.complete();
  assert.equal(b1.r && b1.r.status, 'granted');
  const b2: { r: RewardResult | null } = { r: null };
  provider.requestReward('OFFLINE_DOUBLE', (r) => { b2.r = r; });
  assert.equal(b2.r && b2.r.status, 'failed');
  assert.equal(b2.r && b2.r.reason, 'AD_POLICY_BLOCKED');
  assert.equal(host.shown, 1, '频控阻断时不应展示广告');
});

ok('微信宿主复用同一广告实例（单例）', () => {
  const rt = fakeRuntime('wechat');
  const host = new WechatRewardedVideoHost(rt, 'test-ad-unit');
  host.show(() => {});
  host.show(() => {});
  assert.equal(rt.created, 1, '应只 createRewardedVideoAd 一次');
});

ok('抖音宿主复用同一广告实例（单例）', () => {
  const rt = fakeRuntime('douyin');
  const host = new DouyinRewardedVideoHost(rt, 'test-ad-unit');
  host.show(() => {});
  host.show(() => {});
  assert.equal(rt.created, 1);
});

ok('宿主不可用（无 adUnitId）→ 回落 Mock 本地授予', () => {
  const host = new FakeHost('wechat');
  host.available = false;
  const provider = new PlatformAdProvider({ host });
  const resultBox: { r: RewardResult | null } = { r: null };
  provider.requestReward('OFFLINE_DOUBLE', (r) => { resultBox.r = r; });
  assert.equal(resultBox.r && resultBox.r.status, 'granted');
  assert.equal(host.shown, 0);
});

console.log(`rewarded-video-adapter tests passed (${passed})`);
