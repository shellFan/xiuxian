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

function createFacade(): GameFacade {
  return new GameFacade({
    storage: new MemoryStorageAdapter(),
    boardRows: 4,
    boardColumns: 4,
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

test('buildMainHUDViewModel: board capacity matches 4x4', () => {
  const facade = createFacade();
  const vm = buildMainHUDViewModel(facade);
  assert.equal(vm.boardCapacity, 16);
  assert.equal(vm.workerCount, 0);
  assert.equal(vm.boardIsFull, false);
});

// ── MergeBoardViewModel ─────────────────────────────────────────────────────

test('buildMergeBoardViewModel: returns 4x4 grid', () => {
  const facade = createFacade();
  const vm = buildMergeBoardViewModel(facade);

  assert.equal(vm.rows, 4);
  assert.equal(vm.columns, 4);
  assert.equal(vm.cells.length, 16);
  assert.equal(vm.isFull, false);
  assert.equal(vm.workerCount, 0);
});

test('buildMergeBoardViewModel: all cells empty initially', () => {
  const facade = createFacade();
  const vm = buildMergeBoardViewModel(facade);

  for (const cell of vm.cells) {
    assert.equal(cell.occupied, false);
    assert.equal(cell.workerId, null);
    assert.equal(cell.workerLevel, null);
  }
});

test('buildMergeBoardViewModel: reflects placed worker', () => {
  const facade = createFacade();
  const board = facade.context.board;
  const { WorkerEntity } = require('../../assets/scripts/model/worker-entity');
  board.place(WorkerEntity.create(1), { row: 0, column: 0 });

  const vm = buildMergeBoardViewModel(facade);
  const cell00 = vm.cells.find((c) => c.row === 0 && c.column === 0);
  assert.ok(cell00);
  assert.equal(cell00.occupied, true);
  assert.equal(cell00.workerLevel, 1);
  assert.equal(vm.workerCount, 1);
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

test('buildOfflineRewardViewModel: returns no reward for invalid settlement', () => {
  const facade = createFacade();
  const vm = buildOfflineRewardViewModel(facade, 'nonexistent-id');

  assert.equal(vm.hasReward, false);
  assert.equal(vm.isSettled, false);
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

  assert.throws(() => {
    (vm as { careerLevel: number }).careerLevel = 999;
  }, /Cannot assign to read only property|not extensible/);
});

test('MergeBoardViewModel cells are frozen', () => {
  const facade = createFacade();
  const vm = buildMergeBoardViewModel(facade);

  assert.throws(() => {
    (vm.cells[0] as { occupied: boolean }).occupied = true;
  }, /Cannot assign to read only property|not extensible/);
});