import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { RewardedAdService } from '../../assets/scripts/services/rewarded-ad-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

/** V10.2：广告频控历史持久化——页面重载后冷却/小时上限不再重置（IAA 持久限额）。 */

function testCooldownPersistsAcrossReload(): void {
  const clock = new FakeClock(10_000);
  const storage = new MemoryStorageAdapter();
  const first = new RewardedAdService({ clock, storage, cooldownPerPlacement: 60, simulatedDuration: 0 });
  assert.equal(first.canShow('OFFLINE_DOUBLE'), true);
  assert.equal(first.showSync('OFFLINE_DOUBLE', 'OFFLINE_DOUBLE').success, true);
  // 新实例（模拟页面重载）：同 placement 冷却仍在
  const reloaded = new RewardedAdService({ clock, storage, cooldownPerPlacement: 60 });
  assert.equal(reloaded.canShow('OFFLINE_DOUBLE'), false);
  assert.ok(reloaded.getCooldownRemaining('OFFLINE_DOUBLE') > 0);
  // 冷却到期后恢复可用
  clock.set(10_000 + 61_000);
  assert.equal(reloaded.canShow('OFFLINE_DOUBLE'), true);
}

function testHourlyCapPersistsAcrossReload(): void {
  const clock = new FakeClock(10_000);
  const storage = new MemoryStorageAdapter();
  const first = new RewardedAdService({ clock, storage, cooldownPerPlacement: 0, maxAdsPerHour: 2, simulatedDuration: 0 });
  assert.equal(first.showSync('MIND_RECOVERY', 'MIND_RECOVERY').success, true);
  clock.set(10_001);
  assert.equal(first.showSync('TASK_SPEEDUP', 'OFFLINE_DOUBLE').success, true);
  const reloaded = new RewardedAdService({ clock, storage, maxAdsPerHour: 2 });
  assert.equal(reloaded.canShow('CULTIVATION_BOOST'), false);
  clock.set(3_600_000 + 10_002);
  assert.equal(reloaded.canShow('CULTIVATION_BOOST'), true);
}

function testCorruptedHistoryIgnored(): void {
  const clock = new FakeClock(10_000);
  const storage = new MemoryStorageAdapter();
  storage.setItem('v1-rewarded-ad-history', '{not valid json');
  const service = new RewardedAdService({ clock, storage });
  assert.equal(service.canShow('MIND_RECOVERY'), true);
}

function testStaleOrMalformedEntriesDropped(): void {
  const clock = new FakeClock(10_000);
  const storage = new MemoryStorageAdapter();
  // 一条过期（>24h）、一条非法 placement、一条合法——只有合法条目参与频控
  storage.setItem('v1-rewarded-ad-history', JSON.stringify([
    { placement: 'OFFLINE_DOUBLE', timestamp: 10_000 - 86_400_000 - 1 },
    { placement: 'NOT_A_PLACEMENT', timestamp: 10_000 },
    { placement: 'MIND_RECOVERY', timestamp: 10_000 },
  ]));
  const service = new RewardedAdService({ clock, storage, cooldownPerPlacement: 60 });
  assert.equal(service.canShow('OFFLINE_DOUBLE'), true);
  assert.equal(service.canShow('MIND_RECOVERY'), false);
}

testCooldownPersistsAcrossReload();
testHourlyCapPersistsAcrossReload();
testCorruptedHistoryIgnored();
testStaleOrMalformedEntriesDropped();
console.log('rewarded ad persistence tests passed');
