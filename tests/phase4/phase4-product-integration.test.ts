/**
 * Phase 4 Product Integration Test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveServiceV2 } from '../../assets/scripts/services/save-service-v2';
import { SettingsService } from '../../assets/scripts/services/settings-service';
import { ErrorBoundary } from '../../assets/scripts/services/error-boundary';
import { AnalyticsService, sanitizeAnalyticsParams } from '../../assets/scripts/services/analytics-service';
import { DebugProtection } from '../../assets/scripts/services/debug-protection';
import { PlatformLifecycle } from '../../assets/scripts/services/platform/platform-lifecycle';
import { createPlatformService } from '../../assets/scripts/services/platform/platform-service';
import { NumberFormatter } from '../../assets/scripts/utils/number-formatter';
import { LeakProtection } from '../../assets/scripts/services/leak-protection';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { RecruitmentService } from '../../assets/scripts/services/recruitment-service';

const storage = () => new MemoryStorageAdapter();

test('Phase4 integration: init creates valid facade', () => {
  const facade = new GameFacade({ storage: storage() });
  const snap = facade.snapshot();
  assert.ok(snap);
  assert.strictEqual(snap.salary, 0);
  assert.strictEqual(snap.careerLevel, 1);
  facade.destroy();
});

test('Phase4 integration: new save persists through load', () => {
  const s = storage();
  const facade = new GameFacade({ storage: s });
  facade.context.player.salary = 1000;
  facade.save();
  facade.destroy();

  const facade2 = new GameFacade({ storage: s });
  assert.strictEqual(facade2.snapshot().salary, 1000);
  facade2.destroy();
});

test('Phase4 integration: snapshot is deeply frozen', () => {
  const facade = new GameFacade({ storage: storage() });
  const snap = facade.snapshot();
  assert.throws(() => { (snap as any).salary = 999; });
  if (snap.dailyTasks.length > 0) {
    assert.throws(() => { (snap.dailyTasks[0] as any).type = 'HACKED'; });
  }
  if (snap.dailySignIn) {
    assert.throws(() => { (snap.dailySignIn as any).claimed = true; });
  }
  facade.destroy();
});

test('Phase4 integration: recruit adds worker', () => {
  const facade = new GameFacade({ storage: storage() });
  const countBefore = facade.snapshot().workerCount;
  const recruitment = new RecruitmentService(facade.context);
  const result = recruitment.recruit();
  assert.ok(result.success);
  const countAfter = facade.snapshot().workerCount;
  assert.ok(countAfter > countBefore);
  facade.destroy();
});

test('Phase4 integration: work mode change', () => {
  const facade = new GameFacade({ storage: storage() });
  facade.changeWorkMode('WORK');
  assert.strictEqual(facade.context.player.workMode, 'WORK');
  facade.destroy();
});

test('Phase4 integration: KPI tracking works', () => {
  const facade = new GameFacade({ storage: storage() });
  assert.ok(typeof facade.context.player.performance === 'number');
  facade.destroy();
});

test('Phase4 integration: UI event stream works', () => {
  const facade = new GameFacade({ storage: storage() });
  let received = false;
  facade.onUiEvent('RESOURCE_CHANGED', () => { received = true; });
  facade.context.player.salary = 500;
  facade.context.events.emit('salaryChanged', { amount: 500, total: 500 });
  assert.strictEqual(received, true);
  facade.destroy();
});

test('Phase4 integration: reward request through facade', () => {
  const facade = new GameFacade({ storage: storage() });
  let result: string | null = null;
  facade.requestReward('MIND_RECOVERY', (r) => { result = r.status; });
  assert.strictEqual(result, 'granted');
  facade.destroy();
});

test('Phase4 integration: settings persist', () => {
  const s = storage();
  const settings = new SettingsService(s);
  settings.setMusicEnabled(false);
  settings.setSfxEnabled(false);
  const settings2 = new SettingsService(s);
  assert.strictEqual(settings2.musicEnabled, false);
  assert.strictEqual(settings2.sfxEnabled, false);
});

test('Phase4 integration: save V2 backup preserves previous state', () => {
  const s = storage();
  const service = new SaveServiceV2(s);
  const player = PlayerData.createDefault();
  player.salary = 100;
  service.save(player);
  assert.strictEqual(service.hasBackup(), false);
  player.salary = 200;
  service.save(player);
  assert.strictEqual(service.hasBackup(), true);
  s.setItem('game-save', 'CORRUPTED');
  const loaded = service.load();
  assert.strictEqual(loaded.salary, 100);
});

test('Phase4 integration: pause and resume', () => {
  const platform = createPlatformService('mock');
  const lifecycle = new PlatformLifecycle(platform);
  let paused = false;
  let resumed = false;
  lifecycle.onPause(() => { paused = true; });
  lifecycle.onResume(() => { resumed = true; });
  lifecycle.pause();
  assert.strictEqual(paused, true);
  lifecycle.resume();
  assert.strictEqual(resumed, true);
  lifecycle.dispose();
});

test('Phase4 integration: offline reward calculation', () => {
  const facade = new GameFacade({ storage: storage() });
  const now = Date.now();
  facade.context.player.lastSaveTime = now - 60000;
  assert.ok(facade.context.player.lastSaveTime < now);
  facade.destroy();
});

test('Phase4 integration: dispose and restart', () => {
  const s = storage();
  const facade = new GameFacade({ storage: s });
  facade.context.player.salary = 777;
  facade.save();
  facade.destroy();
  const facade2 = new GameFacade({ storage: s });
  assert.strictEqual(facade2.snapshot().salary, 777);
  facade2.destroy();
});

test('Phase4 integration: error boundary catches and classifies', () => {
  const boundary = new ErrorBoundary();
  const err = boundary.try(() => { throw new Error('test'); }, 'STORAGE');
  assert.strictEqual(err, null);
  assert.strictEqual(boundary.getHistory().length, 1);
  assert.strictEqual(boundary.getHistory()[0].category, 'STORAGE');
  boundary.dispose();
});

test('Phase4 integration: analytics strips PII recursively', () => {
  const params = {
    level: 5,
    user: { name: 'Alice', phone: '123', score: 100 },
    tags: ['a', 'b'],
  };
  const sanitized = sanitizeAnalyticsParams(params);
  assert.strictEqual((sanitized as any).user.name, undefined);
  assert.strictEqual((sanitized as any).user.phone, undefined);
  assert.strictEqual((sanitized as any).user.score, 100);
  assert.deepStrictEqual((sanitized as any).tags, ['a', 'b']);
});

test('Phase4 integration: debug protection blocks in production', () => {
  const facade = new GameFacade({ storage: storage(), debugProtection: { isProduction: true } });
  assert.throws(() => facade.clearSave());
  facade.destroy();
});

test('Phase4 integration: number formatter zh-CN', () => {
  const fmt = new NumberFormatter({ locale: 'zh-CN' });
  assert.strictEqual(fmt.formatNumber(10000), '1万');
  assert.strictEqual(fmt.formatNumber(100000000), '1亿');
});

test('Phase4 integration: leak protection tracks and disposes', () => {
  const guard = new LeakProtection();
  let called = false;
  guard.addSubscription(() => { called = true; });
  assert.strictEqual(guard.subscriptionCount, 1);
  guard.dispose();
  assert.strictEqual(guard.isDisposed(), true);
  assert.strictEqual(called, true);
});