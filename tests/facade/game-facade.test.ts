import test from 'node:test';
import assert from 'node:assert/strict';

import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { snapshotEqual, createSnapshot } from '../../assets/scripts/facade/game-snapshot';
import { resolveCategory, ALL_UI_CATEGORIES } from '../../assets/scripts/facade/ui-event-types';
import { RewardService } from '../../assets/scripts/services/reward/reward-service';
import { MockRewardProvider, type RewardResult } from '../../assets/scripts/services/reward-provider';
import { PlatformLifecycle } from '../../assets/scripts/services/platform/platform-lifecycle';
import { MockPlatformService } from '../../assets/scripts/services/platform/platform-service';
import { SettingsService } from '../../assets/scripts/services/settings-service';
import { AudioService, NullAudioBackend } from '../../assets/scripts/services/audio-service';
import { ErrorBoundary, classifyError } from '../../assets/scripts/services/error-boundary';
import { validateConfigBundle } from '../../assets/scripts/services/config-validator';
import { NumberFormatter } from '../../assets/scripts/utils/number-formatter';
import { PerformanceGuard, type PerformanceWarning } from '../../assets/scripts/services/performance-guard';
import { LeakProtection, LifecycleGuard } from '../../assets/scripts/services/leak-protection';
import { AnalyticsService, sanitizeAnalyticsParams } from '../../assets/scripts/services/analytics-service';
import { DebugProtection } from '../../assets/scripts/services/debug-protection';
import { SaveServiceV2, validateSaveData } from '../../assets/scripts/services/save-service-v2';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { PlayerData } from '../../assets/scripts/model/player-data';
import type { DailyTaskState } from '../../assets/scripts/model/save-data';

// ── GameSnapshot ────────────────────────────────────────────────────────────

test('GameSnapshot: createSnapshot returns frozen object', () => {
  const snap = createSnapshot({
    salary: 100, cultivationExp: 50, careerLevel: 1, mind: 80, maxMind: 100,
    performance: 0, workMode: 'FISHING', workSeconds: 0, fishingSeconds: 0,
    officeLevel: 1, sectId: null, talentId: null, maxWorkerLevel: 0,
    promotionFailCount: 0, unlockedAchievementIds: [], claimedAchievementIds: [],
    dailySignIn: null, dailyTasks: [], dailyTaskDay: -1,
    tutorialStep: 'FIRST_RECRUIT', tutorialCompleted: false, lastSaveTime: 0,
    workerCount: 0, mindStatus: 'NORMAL',
  });
  assert.strictEqual(snap.salary, 100);
  assert.strictEqual(Object.isFrozen(snap), true);
});

test('GameSnapshot: snapshotEqual returns true for identical snapshots', () => {
  const fields = {
    salary: 100, cultivationExp: 50, careerLevel: 1, mind: 80, maxMind: 100,
    performance: 0, workMode: 'FISHING' as const, workSeconds: 0, fishingSeconds: 0,
    officeLevel: 1, sectId: null, talentId: null, maxWorkerLevel: 0,
    promotionFailCount: 0, unlockedAchievementIds: [] as readonly string[],
    claimedAchievementIds: [] as readonly string[], dailySignIn: null,
    dailyTasks: [] as readonly DailyTaskState[], dailyTaskDay: -1,
    tutorialStep: 'FIRST_RECRUIT', tutorialCompleted: false, lastSaveTime: 0,
    workerCount: 0, mindStatus: 'NORMAL' as const,
  };
  const a = createSnapshot(fields);
  const b = createSnapshot(fields);
  assert.strictEqual(snapshotEqual(a, b), true);
});

test('GameSnapshot: snapshotEqual returns false for different snapshots', () => {
  const base = {
    salary: 100, cultivationExp: 50, careerLevel: 1, mind: 80, maxMind: 100,
    performance: 0, workMode: 'FISHING' as const, workSeconds: 0, fishingSeconds: 0,
    officeLevel: 1, sectId: null, talentId: null, maxWorkerLevel: 0,
    promotionFailCount: 0, unlockedAchievementIds: [] as readonly string[],
    claimedAchievementIds: [] as readonly string[], dailySignIn: null,
    dailyTasks: [] as readonly DailyTaskState[], dailyTaskDay: -1,
    tutorialStep: 'FIRST_RECRUIT', tutorialCompleted: false, lastSaveTime: 0,
    workerCount: 0, mindStatus: 'NORMAL' as const,
  };
  const a = createSnapshot(base);
  const b = createSnapshot({ ...base, salary: 200 });
  assert.strictEqual(snapshotEqual(a, b), false);
});

// ── UI Event Types ──────────────────────────────────────────────────────────

test('resolveCategory: maps known events correctly', () => {
  assert.strictEqual(resolveCategory('salaryChanged'), 'RESOURCE_CHANGED');
  assert.strictEqual(resolveCategory('mindChanged'), 'RESOURCE_CHANGED');
  assert.strictEqual(resolveCategory('workModeChanged'), 'WORK_MODE_CHANGED');
  assert.strictEqual(resolveCategory('careerChanged'), 'CAREER_CHANGED');
  assert.strictEqual(resolveCategory('mergeCompleted'), 'BOARD_CHANGED');
  assert.strictEqual(resolveCategory('achievementUnlocked'), 'ACHIEVEMENT_CHANGED');
  assert.strictEqual(resolveCategory('gameSaved'), 'SAVE_COMPLETED');
  assert.strictEqual(resolveCategory('offlineRewardChanged'), 'OFFLINE_REWARD');
  assert.strictEqual(resolveCategory('clockAnomaly'), 'ERROR_OCCURRED');
});

test('resolveCategory: returns STATE_CHANGED for unknown events', () => {
  assert.strictEqual(resolveCategory('unknownEvent'), 'STATE_CHANGED');
});

test('ALL_UI_CATEGORIES has 16 categories', () => {
  assert.strictEqual(ALL_UI_CATEGORIES.length, 16);
});

// ── RewardService ───────────────────────────────────────────────────────────

test('RewardService: state machine transitions correctly', () => {
  const service = new RewardService(new MockRewardProvider());
  assert.strictEqual(service.getState(), 'IDLE');
  assert.strictEqual(service.isBusy(), false);
  service.request('MIND_RECOVERY', (result) => {
    assert.strictEqual(result.status, 'granted');
  });
  assert.strictEqual(service.isBusy(), false);
});

test('RewardService: double callback protection', () => {
  let callCount = 0;
  const doubleFireProvider = {
    claimMindRecovery: () => 50,
    requestReward: (_type: string, onComplete: (result: RewardResult) => void) => {
      onComplete({ status: 'granted' });
      onComplete({ status: 'granted' });
    },
  };
  const service = new RewardService(doubleFireProvider as unknown as MockRewardProvider);
  service.request('MIND_RECOVERY', () => { callCount++; });
  assert.strictEqual(callCount, 1);
});

test('RewardService: dispose clears listeners', () => {
  const service = new RewardService(new MockRewardProvider());
  let stateChanges = 0;
  service.onStateChange(() => { stateChanges++; });
  service.dispose();
  service.request('MIND_RECOVERY', () => {});
  assert.strictEqual(stateChanges, 0);
});

test('RewardService: reset returns to IDLE', () => {
  const service = new RewardService(new MockRewardProvider());
  service.reset();
  assert.strictEqual(service.getState(), 'IDLE');
  assert.strictEqual(service.getCurrentType(), null);
});

// ── PlatformLifecycle ───────────────────────────────────────────────────────

test('PlatformLifecycle: pause/resume lifecycle', () => {
  const platform = new MockPlatformService();
  const lifecycle = new PlatformLifecycle(platform);
  let pauseCount = 0;
  let resumeCount = 0;
  lifecycle.onPause(() => { pauseCount++; });
  lifecycle.onResume(() => { resumeCount++; });
  lifecycle.pause();
  assert.strictEqual(pauseCount, 1);
  assert.strictEqual(lifecycle.isPaused(), true);
  lifecycle.resume();
  assert.strictEqual(resumeCount, 1);
  assert.strictEqual(lifecycle.isPaused(), false);
});

test('PlatformLifecycle: double pause is idempotent', () => {
  const platform = new MockPlatformService();
  const lifecycle = new PlatformLifecycle(platform);
  let pauseCount = 0;
  lifecycle.onPause(() => { pauseCount++; });
  lifecycle.pause();
  lifecycle.pause();
  assert.strictEqual(pauseCount, 1);
});

test('PlatformLifecycle: dispose clears listeners', () => {
  const platform = new MockPlatformService();
  const lifecycle = new PlatformLifecycle(platform);
  lifecycle.dispose();
  lifecycle.pause();
});

// ── SettingsService ─────────────────────────────────────────────────────────

test('SettingsService: loads defaults when no saved data', () => {
  const storage = new MemoryStorageAdapter();
  const settings = new SettingsService(storage);
  assert.strictEqual(settings.musicEnabled, true);
  assert.strictEqual(settings.sfxEnabled, true);
  assert.strictEqual(settings.vibrationEnabled, true);
  assert.strictEqual(settings.performanceMode, false);
  assert.strictEqual(settings.language, 'zh-CN');
  assert.strictEqual(settings.analyticsConsent, false);
});

test('SettingsService: set and persist', () => {
  const storage = new MemoryStorageAdapter();
  const settings = new SettingsService(storage);
  settings.setMusicEnabled(false);
  assert.strictEqual(settings.musicEnabled, false);
  const settings2 = new SettingsService(storage);
  assert.strictEqual(settings2.musicEnabled, false);
});

test('SettingsService: resetToDefaults', () => {
  const storage = new MemoryStorageAdapter();
  const settings = new SettingsService(storage);
  settings.setMusicEnabled(false);
  settings.setSfxEnabled(false);
  settings.resetToDefaults();
  assert.strictEqual(settings.musicEnabled, true);
  assert.strictEqual(settings.sfxEnabled, true);
});

// ── AudioService ────────────────────────────────────────────────────────────

test('AudioService: respects music enabled flag', () => {
  let bgmPlayed = false;
  const backend: NullAudioBackend = {
    playBgm: () => { bgmPlayed = true; },
    stopBgm: () => {},
    playSfx: () => {},
    setBgmVolume: () => {},
    setSfxVolume: () => {},
  };
  const audio = new AudioService({ backend, musicEnabled: false });
  audio.playBgm('test');
  assert.strictEqual(bgmPlayed, false);
  audio.setMusicEnabled(true);
  audio.playBgm('test2');
  assert.strictEqual(bgmPlayed, true);
});

test('AudioService: respects sfx enabled flag', () => {
  let sfxPlayed = false;
  const backend: NullAudioBackend = {
    playBgm: () => {},
    stopBgm: () => {},
    playSfx: () => { sfxPlayed = true; },
    setBgmVolume: () => {},
    setSfxVolume: () => {},
  };
  const audio = new AudioService({ backend, sfxEnabled: false });
  audio.playSfx('click');
  assert.strictEqual(sfxPlayed, false);
  audio.setSfxEnabled(true);
  audio.playSfx('click');
  assert.strictEqual(sfxPlayed, true);
});

test('AudioService: dispose stops bgm', () => {
  let bgmStopped = false;
  const backend: NullAudioBackend = {
    playBgm: () => {},
    stopBgm: () => { bgmStopped = true; },
    playSfx: () => {},
    setBgmVolume: () => {},
    setSfxVolume: () => {},
  };
  const audio = new AudioService({ backend });
  audio.dispose();
  assert.strictEqual(bgmStopped, true);
});

// ── ErrorBoundary ───────────────────────────────────────────────────────────

test('ErrorBoundary: handles and classifies errors', () => {
  const boundary = new ErrorBoundary();
  const error = boundary.handle(new Error('test'), 'STORAGE', 'save');
  assert.strictEqual(error.category, 'STORAGE');
  assert.strictEqual(error.message, 'test');
  assert.strictEqual(error.context, 'save');
});

test('ErrorBoundary: try returns null on error', () => {
  const boundary = new ErrorBoundary();
  const result = boundary.try(() => { throw new Error('boom'); }, 'RECOVERABLE');
  assert.strictEqual(result, null);
});

test('ErrorBoundary: try returns result on success', () => {
  const boundary = new ErrorBoundary();
  const result = boundary.try(() => 42, 'RECOVERABLE');
  assert.strictEqual(result, 42);
});

test('ErrorBoundary: hasFatalError', () => {
  const boundary = new ErrorBoundary();
  assert.strictEqual(boundary.hasFatalError(), false);
  boundary.handle(new Error('fatal'), 'FATAL');
  assert.strictEqual(boundary.hasFatalError(), true);
});

test('classifyError: classifies storage errors', () => {
  assert.strictEqual(classifyError(new Error('localStorage quota exceeded')), 'STORAGE');
  assert.strictEqual(classifyError(new Error('storage write failed')), 'STORAGE');
  assert.strictEqual(classifyError(new Error('wx.shareAppMessage failed')), 'PLATFORM');
  assert.strictEqual(classifyError(new Error('reward ad error')), 'REWARD');
  assert.strictEqual(classifyError(new TypeError('x is not a function')), 'RECOVERABLE');
});

// ── ConfigValidator ─────────────────────────────────────────────────────────

test('validateConfigBundle: passes for empty config', () => {
  const result = validateConfigBundle({});
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errorCount, 0);
});

test('validateConfigBundle: detects duplicate worker IDs', () => {
  const result = validateConfigBundle({
    worker: { levels: [{ id: 'w1', salary: 10 }, { id: 'w1', salary: 20 }] },
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errorCount > 0);
});

test('validateConfigBundle: detects negative salary', () => {
  const result = validateConfigBundle({
    worker: { levels: [{ id: 'w1', salary: -5 }] },
  });
  assert.strictEqual(result.valid, false);
});

// ── NumberFormatter ─────────────────────────────────────────────────────────

test('NumberFormatter: zh-CN format', () => {
  const fmt = new NumberFormatter({ locale: 'zh-CN' });
  assert.strictEqual(fmt.formatNumber(999), '999');
  assert.strictEqual(fmt.formatNumber(10000), '1万');
  assert.strictEqual(fmt.formatNumber(100000000), '1亿');
});

test('NumberFormatter: en-US format', () => {
  const fmt = new NumberFormatter({ locale: 'en-US' });
  assert.strictEqual(fmt.formatNumber(999), '999');
  assert.strictEqual(fmt.formatNumber(1000), '1K');
  assert.strictEqual(fmt.formatNumber(1000000), '1M');
  assert.strictEqual(fmt.formatNumber(1000000000), '1B');
});

test('NumberFormatter: formatPercent', () => {
  const fmt = new NumberFormatter();
  assert.strictEqual(fmt.formatPercent(50), '50%');
  assert.strictEqual(fmt.formatPercent(0), '0%');
  assert.strictEqual(fmt.formatPercent(100), '100%');
});

test('NumberFormatter: formatDuration', () => {
  const fmt = new NumberFormatter();
  assert.strictEqual(fmt.formatDuration(30), '30秒');
  assert.strictEqual(fmt.formatDuration(90), '1分30秒');
  assert.strictEqual(fmt.formatDuration(3600), '1时');
  assert.strictEqual(fmt.formatDuration(3661), '1时1分');
});

test('NumberFormatter: formatSalary', () => {
  const fmt = new NumberFormatter();
  assert.strictEqual(fmt.formatSalary(50000), '¥5万');
});

// ── PerformanceGuard ────────────────────────────────────────────────────────

test('PerformanceGuard: detects worker count overflow', () => {
  const guard = new PerformanceGuard({ maxWorkerCount: 10, enabled: true });
  const warnings: PerformanceWarning[] = [];
  guard.onWarning((w) => { warnings.push(w); });
  guard.checkWorkerCount(15);
  assert.strictEqual(warnings.length, 1);
  assert.strictEqual(warnings[0].type, 'WORKER_COUNT');
});

test('PerformanceGuard: disabled guard produces no warnings', () => {
  const guard = new PerformanceGuard({ enabled: false });
  const warnings: PerformanceWarning[] = [];
  guard.onWarning((w) => { warnings.push(w); });
  guard.checkWorkerCount(9999);
  assert.strictEqual(warnings.length, 0);
});

// ── LeakProtection ──────────────────────────────────────────────────────────

test('LeakProtection: disposes subscriptions', () => {
  const guard = new LeakProtection();
  let called = false;
  guard.addSubscription(() => { called = true; });
  guard.dispose();
  assert.strictEqual(called, true);
  assert.strictEqual(guard.isDisposed(), true);
});

test('LeakProtection: throws after dispose', () => {
  const guard = new LeakProtection();
  guard.dispose();
  assert.throws(() => guard.addSubscription(() => {}));
});

test('LifecycleGuard: prevents double start', () => {
  const guard = new LifecycleGuard();
  assert.strictEqual(guard.start(), true);
  assert.strictEqual(guard.start(), false);
  assert.strictEqual(guard.stop(), true);
  assert.strictEqual(guard.stop(), false);
});

// ── AnalyticsService ────────────────────────────────────────────────────────

test('AnalyticsService: drops events without consent', () => {
  const events: Array<{type: string}> = [];
  const transport = { event: (e: {type: string}) => { events.push(e); } };
  const analytics = new AnalyticsService({ transport, consentEnabled: false });
  analytics.track('game_start');
  assert.strictEqual(events.length, 0);
});

test('AnalyticsService: tracks events with consent', () => {
  const events: Array<{type: string}> = [];
  const transport = { event: (e: {type: string}) => { events.push(e); } };
  const analytics = new AnalyticsService({ transport, consentEnabled: true });
  analytics.track('game_start');
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'game_start');
});

test('sanitizeAnalyticsParams: strips restricted fields', () => {
  const params = { level: 5, name: 'secret', phone: '123', score: 100 };
  const sanitized = sanitizeAnalyticsParams(params);
  assert.strictEqual(sanitized.level, 5);
  assert.strictEqual(sanitized.score, 100);
  assert.strictEqual('name' in sanitized, false);
  assert.strictEqual('phone' in sanitized, false);
});

// ── DebugProtection ─────────────────────────────────────────────────────────

test('DebugProtection: blocks in production', () => {
  const guard = new DebugProtection({ isProduction: true });
  assert.strictEqual(guard.isAllowed(), false);
  assert.throws(() => guard.guard(), /blocked in production/);
});

test('DebugProtection: allows in development', () => {
  const guard = new DebugProtection({ isProduction: false });
  assert.strictEqual(guard.isAllowed(), true);
  assert.doesNotThrow(() => guard.guard());
});

// ── SaveServiceV2 ───────────────────────────────────────────────────────────

test('SaveServiceV2: load returns default when empty', () => {
  const storage = new MemoryStorageAdapter();
  const service = new SaveServiceV2(storage);
  const data = service.load();
  assert.strictEqual(data.saveVersion, 4);
  assert.strictEqual(data.salary, 0);
});

test('SaveServiceV2: save and load roundtrip', () => {
  const storage = new MemoryStorageAdapter();
  const service = new SaveServiceV2(storage);
  const player = PlayerData.createDefault();
  player.salary = 500;
  service.save(player);
  const loaded = service.load();
  assert.strictEqual(loaded.salary, 500);
});

test('SaveServiceV2: backup and restore', () => {
  const storage = new MemoryStorageAdapter();
  const service = new SaveServiceV2(storage);
  const player = PlayerData.createDefault();
  // First save: no previous data to backup, so backup is empty
  player.salary = 100;
  service.save(player);
  assert.strictEqual(service.hasBackup(), false);
  // Second save: backup gets the first save's data
  player.salary = 200;
  service.save(player);
  assert.strictEqual(service.hasBackup(), true);
  assert.strictEqual(service.restoreFromBackup(), true);
  // After restore, primary should have the first save's data
  const loaded = service.load();
  assert.strictEqual(loaded.salary, 100);
});

test('SaveServiceV2: corruption recovery falls back to backup', () => {
  const storage = new MemoryStorageAdapter();
  const service = new SaveServiceV2(storage);
  const player = PlayerData.createDefault();
  // Save A: salary=100 (no backup yet)
  player.salary = 100;
  service.save(player);
  // Save B: salary=300 (backup now has salary=100)
  player.salary = 300;
  service.save(player);
  // Corrupt primary storage
  storage.setItem('game-save', '{invalid json');
  // Load should fall back to backup (salary=100, the last known-good before save B)
  const loaded = service.load();
  assert.strictEqual(loaded.salary, 100);
});

test('validateSaveData: detects invalid data', () => {
  const data = PlayerData.createDefault().toSaveData();
  const result = validateSaveData(data);
  assert.strictEqual(result.valid, true);
  const badData = { ...data, salary: -1 };
  const badResult = validateSaveData(badData as typeof data);
  assert.strictEqual(badResult.valid, false);
  assert.ok(badResult.errors.length > 0);
});

// ── GameFacade Integration ──────────────────────────────────────────────────

test('GameFacade: creates and starts correctly', () => {
  const facade = new GameFacade({ storage: new MemoryStorageAdapter() });
  assert.ok(facade.context !== undefined);
  assert.ok(facade.gameLoop !== undefined);
  assert.ok(facade.rewardService !== undefined);
  assert.ok(facade.platform !== undefined);
  assert.ok(facade.lifecycle !== undefined);
  facade.destroy();
});

test('GameFacade: snapshot returns valid data', () => {
  const facade = new GameFacade({ storage: new MemoryStorageAdapter() });
  const snap = facade.snapshot();
  assert.strictEqual(snap.salary, 0);
  assert.strictEqual(snap.careerLevel, 1);
  assert.strictEqual(snap.mind, 100);
  assert.strictEqual(snap.workMode, 'FISHING');
  facade.destroy();
});

test('GameFacade: onUiEvent subscription works', () => {
  const facade = new GameFacade({ storage: new MemoryStorageAdapter() });
  let received = false;
  const unsub = facade.onUiEvent('RESOURCE_CHANGED', () => { received = true; });
  facade.context.events.emit('salaryChanged', { amount: 10, total: 10 });
  assert.strictEqual(received, true);
  unsub();
  facade.destroy();
});

test('GameFacade: destroy is idempotent', () => {
  const facade = new GameFacade({ storage: new MemoryStorageAdapter() });
  facade.destroy();
  facade.destroy();
});