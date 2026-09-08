/**
 * Phase 5 ViewModel tests — verify facade-driven ViewModel builders.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import {
  buildMainHUDViewModel,
  buildMergeBoardViewModel,
  buildCareerViewModel,
  buildKpiViewModel,
  buildPromotionViewModel,
  buildEventViewModel,
  buildAchievementViewModel,
  buildDailyTaskViewModel,
  buildOfflineRewardViewModel,
  buildSettingsViewModel,
  buildTutorialViewModel,
  buildSectViewModel,
  mindStatusText,
} from '../../assets/scripts/ui/view-models';
import { SettingsService } from '../../assets/scripts/services/settings-service';
import { FakeClock } from '../../assets/scripts/core/clock';

function createFacade(): GameFacade {
  const clock = new FakeClock(Date.now());
  return new GameFacade({
    storage: new MemoryStorageAdapter(),
    boardRows: 4,
    boardColumns: 4,
    clock,
  });
}

// ── mindStatusText ──────────────────────────────────────────────────────────

test('mindStatusText: returns correct text for each tier', () => {
  assert.equal(mindStatusText(0, 100), '彻底破防');
  assert.equal(mindStatusText(-5, 100), '彻底破防');
  assert.equal(mindStatusText(25, 100), '濒临破防');
  assert.equal(mindStatusText(35, 100), '心态不稳');
  assert.equal(mindStatusText(55, 100), '正常牛马');
  assert.equal(mindStatusText(85, 100), '精神饱满');
  assert.equal(mindStatusText(100, 100), '精神饱满');
});

test('mindStatusText: uses ratio against maxMind', () => {
  assert.equal(mindStatusText(40, 50), '精神饱满'); // 80% of 50
  assert.equal(mindStatusText(15, 50), '心态不稳'); // 30% of 50
});

// ── MainHUDViewModel ────────────────────────────────────────────────────────

test('buildMainHUDViewModel: returns complete HUD data', () => {
  const facade = createFacade();
  const vm = buildMainHUDViewModel(facade);

  assert.equal(typeof vm.careerLevel, 'number');
  assert.equal(typeof vm.careerName, 'string');
  assert.equal(typeof vm.realm, 'string');
  assert.equal(typeof vm.salary, 'number');
  assert.equal(typeof vm.performance, 'number');
  assert.equal(typeof vm.workMode, 'string');
  assert.equal(typeof vm.kpiCompleted, 'number');
  assert.equal(typeof vm.kpiTotal, 'number');
  assert.equal(typeof vm.kpiAllCompleted, 'boolean');
  assert.equal(typeof vm.workerCount, 'number');
  assert.equal(typeof vm.boardCapacity, 'number');
  assert.equal(typeof vm.boardIsFull, 'boolean');
  assert.ok(vm.mindStatusText.length > 0);
});

test('buildMainHUDViewModel: board is null in PC V1', () => {
  const facade = createFacade();
  const vm = buildMainHUDViewModel(facade);
  assert.equal(vm.boardCapacity, 0);
  assert.equal(vm.workerCount, 0);
  assert.equal(vm.boardIsFull, false);
});

// ── MergeBoardViewModel ─────────────────────────────────────────────────────

test('buildMergeBoardViewModel: returns empty board in PC V1', () => {
  const facade = createFacade();
  const vm = buildMergeBoardViewModel(facade);

  assert.equal(vm.rows, 0);
  assert.equal(vm.columns, 0);
  assert.equal(vm.cells.length, 0);
  assert.equal(vm.isFull, false);
  assert.equal(vm.workerCount, 0);
});

test('buildMergeBoardViewModel: all cells empty in PC V1 (no board)', () => {
  const facade = createFacade();
  const vm = buildMergeBoardViewModel(facade);

  // In PC V1, board is null so cells array is empty
  assert.equal(vm.cells.length, 0);
  assert.equal(vm.workerCount, 0);
});

test('buildMergeBoardViewModel: queryBoard returns null in PC V1', () => {
  const facade = createFacade();
  assert.equal(facade.queryBoard(), null, 'Board should be null in PC V1');
  const vm = buildMergeBoardViewModel(facade);
  assert.equal(vm.rows, 0);
  assert.equal(vm.columns, 0);
  assert.equal(vm.cells.length, 0);
});

// ── CareerViewModel ─────────────────────────────────────────────────────────

test('buildCareerViewModel: returns career data', () => {
  const facade = createFacade();
  const vm = buildCareerViewModel(facade);

  assert.equal(typeof vm.careerLevel, 'number');
  assert.equal(typeof vm.careerName, 'string');
  assert.equal(typeof vm.realm, 'string');
  assert.equal(typeof vm.canPromote, 'boolean');
  assert.equal(typeof vm.promotionReason, 'string');
  assert.ok(vm.mindStatusText.length > 0);
});

// ── KpiViewModel ────────────────────────────────────────────────────────────

test('buildKpiViewModel: returns KPI items', () => {
  const facade = createFacade();
  const vm = buildKpiViewModel(facade);

  assert.equal(typeof vm.careerLevel, 'number');
  assert.ok(Array.isArray(vm.items));
  assert.equal(typeof vm.completedCount, 'number');
  assert.equal(typeof vm.totalCount, 'number');
  assert.equal(typeof vm.allCompleted, 'boolean');
});

// ── PromotionViewModel ──────────────────────────────────────────────────────

test('buildPromotionViewModel: returns promotion data', () => {
  const facade = createFacade();
  const vm = buildPromotionViewModel(facade);

  assert.equal(typeof vm.allowed, 'boolean');
  assert.equal(typeof vm.reason, 'string');
  assert.equal(typeof vm.probability, 'number');
  assert.equal(typeof vm.needsRetry, 'boolean');
  assert.ok(Array.isArray(vm.options));
});

// ── EventViewModel ──────────────────────────────────────────────────────────

test('buildEventViewModel: returns empty event when no pending', () => {
  const facade = createFacade();
  const vm = buildEventViewModel(facade);

  assert.equal(vm.pending, false);
  assert.equal(vm.id, '');
  assert.equal(vm.title, '');
  assert.ok(Array.isArray(vm.choices));
});

// ── AchievementViewModel ────────────────────────────────────────────────────

test('buildAchievementViewModel: returns achievement list', () => {
  const facade = createFacade();
  const vm = buildAchievementViewModel(facade);

  assert.ok(Array.isArray(vm.items));
  assert.equal(typeof vm.unlockedCount, 'number');
  assert.equal(typeof vm.claimedCount, 'number');
  assert.equal(typeof vm.totalCount, 'number');
  assert.ok(Array.isArray(vm.categories));
});

// ── DailyTaskViewModel ──────────────────────────────────────────────────────

test('buildDailyTaskViewModel: returns task list', () => {
  const facade = createFacade();
  const vm = buildDailyTaskViewModel(facade);

  assert.ok(Array.isArray(vm.tasks));
  assert.equal(typeof vm.completedCount, 'number');
  assert.equal(typeof vm.claimedCount, 'number');
  assert.equal(typeof vm.totalCount, 'number');
  assert.equal(typeof vm.dayIndex, 'number');
});

// ── OfflineRewardViewModel ──────────────────────────────────────────────────

test('buildOfflineRewardViewModel: returns no reward for already-claimed settlement', () => {
  const facade = createFacade();
  // Mark the settlement as already claimed
  (facade as any).context.player.lastIdleSettlementId = 'already-claimed-001';
  const vm = buildOfflineRewardViewModel(facade, 'already-claimed-001');
  assert.equal(vm.hasReward, false);
  assert.equal(vm.isSettled, true);
});

// ── SettingsViewModel ───────────────────────────────────────────────────────

test('buildSettingsViewModel: returns settings data', () => {
  const facade = createFacade();
  const settings = new SettingsService(new MemoryStorageAdapter());
  const vm = buildSettingsViewModel(facade, settings);

  assert.equal(vm.musicEnabled, true);
  assert.equal(vm.sfxEnabled, true);
  assert.equal(vm.vibrationEnabled, true);
  assert.equal(vm.performanceMode, false);
  assert.equal(vm.language, 'zh-CN');
  assert.equal(vm.analyticsConsent, false);
  assert.equal(typeof vm.lastSaveTime, 'number');
});

// ── TutorialViewModel ───────────────────────────────────────────────────────

test('buildTutorialViewModel: returns tutorial data', () => {
  const facade = createFacade();
  const vm = buildTutorialViewModel(facade);

  assert.equal(typeof vm.currentStep, 'string');
  assert.equal(typeof vm.isCompleted, 'boolean');
  assert.equal(typeof vm.stepIndex, 'number');
  assert.equal(typeof vm.totalSteps, 'number');
  assert.ok(Array.isArray(vm.steps));
  assert.equal(vm.totalSteps, 6); // FIRST_RECRUIT through FIRST_PROMOTION
});

// ── SectViewModel ───────────────────────────────────────────────────────────

test('buildSectViewModel: returns sect data', () => {
  const facade = createFacade();
  const vm = buildSectViewModel(facade);

  assert.equal(vm.currentSectId, null);
  assert.equal(vm.currentSectName, '散修');
  assert.ok(Array.isArray(vm.sects));
  assert.equal(vm.sects.length, 4); // PRIVATE, FOREIGN, STATE, BIG_TECH
});

// ── Immutability ────────────────────────────────────────────────────────────

test('ViewModels are frozen (immutable)', () => {
  const facade = createFacade();
  const vm = buildMainHUDViewModel(facade);

  assert.equal(Object.isFrozen(vm), true, 'MainHUDViewModel should be frozen');
});

test('MergeBoardViewModel is frozen (immutable)', () => {
  const facade = createFacade();
  const vm = buildMergeBoardViewModel(facade);

  assert.equal(Object.isFrozen(vm), true, 'MergeBoardViewModel should be frozen');
});