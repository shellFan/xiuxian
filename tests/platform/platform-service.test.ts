import assert from 'node:assert/strict';

import {
  createPlatformService,
  DesktopPlatformService,
  MockPlatformService,
  WebPlatformService,
  WechatPlatformService,
} from '../../assets/scripts/services/platform/platform-service';
import { WechatRewardProvider } from '../../assets/scripts/services/platform/wechat-reward-provider';

function testMockPlatformDefaults(): void {
  const platform = new MockPlatformService();
  assert.equal(platform.getPlatform(), 'mock');
  assert.equal(platform.isWechatMiniGame(), false);
  assert.equal(platform.isWindows(), false);
  assert.equal(platform.isWeb(), false);
  platform.vibrate(10);
  platform.share({ title: '牛马修仙传' });
  platform.openUrl('https://example.com');
}

function testDesktopPlatformIsWindows(): void {
  const platform = new DesktopPlatformService();
  assert.equal(platform.getPlatform(), 'desktop');
  assert.equal(platform.isWindows(), true);
  assert.equal(platform.isWechatMiniGame(), false);
  platform.vibrate(20);
}

function testWebPlatformIsWeb(): void {
  const platform = new WebPlatformService();
  assert.equal(platform.getPlatform(), 'web');
  assert.equal(platform.isWeb(), true);
}

function testWechatPlatformDoesNotThrowWithoutWx(): void {
  const platform = new WechatPlatformService();
  assert.equal(platform.getPlatform(), 'wechat');
  assert.equal(platform.isWechatMiniGame(), false, 'without wx global this is a skeleton, not a live mini-game');
  platform.vibrate();
  platform.share({ title: 'share' });
  platform.onShow(() => undefined);
  platform.onHide(() => undefined);
}

function testFactoryPrefersExplicitKind(): void {
  assert.equal(createPlatformService('desktop').getPlatform(), 'desktop');
  assert.equal(createPlatformService('web').getPlatform(), 'web');
  assert.equal(createPlatformService('wechat').getPlatform(), 'wechat');
  assert.equal(createPlatformService('mock').getPlatform(), 'mock');
}

function testWechatRewardFallsBackToMockWhenDisabled(): void {
  const provider = new WechatRewardProvider({ enabled: false, rewardedVideoAdUnitId: '' });
  let status = '';
  provider.requestReward('PROMOTION_RETRY', (result) => { status = result.status; });
  assert.equal(status, 'granted');
  assert.equal(provider.claimMindRecovery(), 50);
}

testMockPlatformDefaults();
testDesktopPlatformIsWindows();
testWebPlatformIsWeb();
testWechatPlatformDoesNotThrowWithoutWx();
testFactoryPrefersExplicitKind();
testWechatRewardFallsBackToMockWhenDisabled();
console.log('platform service tests passed');
