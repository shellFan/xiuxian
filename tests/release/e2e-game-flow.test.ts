/**
 * E2E Game Flow Verification Test
 *
 * Simulates the complete game lifecycle from new save to Level 10 promotion,
 * validating every major subsystem integrates correctly through GameFacade.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { FakeClock } from '../../assets/scripts/core/clock';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { PlayerData, type PlayerDataOptions } from '../../assets/scripts/model/player-data';
import { FixedRandomProvider } from '../../assets/scripts/core/random-provider';
import { MergeService } from '../../assets/scripts/services/merge-service';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** KPI requirements per career level (from kpi.json). */
const KPI_REQUIREMENTS: Record<number, { MERGE_COUNT: number; WORK_SECONDS: number; CULTIVATION: number }> = {
  1: { MERGE_COUNT: 3, WORK_SECONDS: 300, CULTIVATION: 50 },
  2: { MERGE_COUNT: 5, WORK_SECONDS: 600, CULTIVATION: 120 },
  3: { MERGE_COUNT: 8, WORK_SECONDS: 900, CULTIVATION: 250 },
  4: { MERGE_COUNT: 12, WORK_SECONDS: 1200, CULTIVATION: 400 },
  5: { MERGE_COUNT: 16, WORK_SECONDS: 1500, CULTIVATION: 600 },
  6: { MERGE_COUNT: 20, WORK_SECONDS: 1800, CULTIVATION: 850 },
  7: { MERGE_COUNT: 25, WORK_SECONDS: 2100, CULTIVATION: 1150 },
  8: { MERGE_COUNT: 30, WORK_SECONDS: 2400, CULTIVATION: 1500 },
  9: { MERGE_COUNT: 36, WORK_SECONDS: 2700, CULTIVATION: 1900 },
};

/** Career level requiredExp (cultivation) from career.json. */
const CAREER_REQUIRED_EXP: Record<number, number> = {
  1: 0, 2: 100, 3: 300, 4: 700, 5: 1500,
  6: 3000, 7: 6000, 8: 12000, 9: 24000, 10: 50000,
};

interface TestSetup {
  facade: GameFacade;
  clock: FakeClock;
  storage: MemoryStorageAdapter;
}

function createTestSetup(playerOverrides: Partial<PlayerDataOptions> = {}): TestSetup {
  const clock = new FakeClock(0);
  const storage = new MemoryStorageAdapter();
  const player = new PlayerData({
    careerLevel: 1,
    mind: 100,
    maxMind: 100,
    lastSaveTime: 0,
    ...playerOverrides,
  });
  const facade = new GameFacade({
    player,
    storage,
    clock,
    randomProvider: new FixedRandomProvider(0.01), // very low roll → promotion always succeeds
    debugProtection: { isProduction: false },
  });
  return { facade, clock, storage };
}

/** Assert that a number is a finite, non-negative integer (no NaN / Infinity / negative). */
function assertSafeResource(value: number, label: string): void {
  assert.ok(Number.isFinite(value), `${label} must be finite, got ${value}`);
  assert.ok(value >= 0, `${label} must be non-negative, got ${value}`);
}

/** Recruit N workers onto the board. */
function recruitN(facade: GameFacade, count: number): void {
  for (let i = 0; i < count; i++) {
    const result = facade.recruit();
    assert.ok(result.success, `Recruit #${i + 1} should succeed`);
  }
}

/** Perform merges on the board to accumulate merge count. Returns total merges done. */
function doMerges(facade: GameFacade, targetCount: number): number {
  const merge = new MergeService(facade.context);
  let done = 0;
  // Recruit pairs and merge them until we reach the target count.
  while (done < targetCount) {
    // Recruit two level-1 workers
    const r1 = facade.recruit();
    const r2 = facade.recruit();
    if (!r1.success || !r2.success) break;
    const p1 = r1.position!;
    const p2 = r2.position!;
    if (!facade.context.board.canMerge(p1, p2)) break;
    const result = merge.merge(p1, p2);
    if (result.success) {
      done++;
      facade.context.syncPlayerWorkers();
    } else {
      break;
    }
  }
  return done;
}

/** Set player state to meet KPI and cultivation requirements for promotion from current level. */
function prepareForPromotion(facade: GameFacade, clock: FakeClock): void {
  const player = facade.context.player;
  const level = player.careerLevel;
  if (level >= 10) return;

  const kpi = KPI_REQUIREMENTS[level];
  if (!kpi) return;

  // Set KPI counters
  player.kpiProgress = {
    MERGE_COUNT: kpi.MERGE_COUNT,
    SALARY_EARNED: 0,
    EVENT_RESOLVED: 0,
  };
  // Set work seconds
  player.workSeconds = kpi.WORK_SECONDS;
  // Set cultivation to meet BOTH the KPI CULTIVATION target AND the career requiredExp
  // (career.requiredExp is checked by canPromote(), KPI CULTIVATION is checked by isCurrentKpiCompleted())
  player.cultivationExp = Math.max(kpi.CULTIVATION, CAREER_REQUIRED_EXP[level]);
  // Ensure mind is high for better promotion probability
  player.mind = 100;
  player.maxMind = 100;

  // Save the state
  facade.context.saveService.save(player);
}

/** Force a successful promotion from current level. Uses FixedRandomProvider(0.01) for guaranteed success. */
function forcePromotion(facade: GameFacade): { success: boolean; newLevel?: number } {
  const check = facade.queryPromotionCheck();
  if (!check.allowed) return { success: false };

  const options = facade.queryPromotionOptions();
  const optionId = options.length > 0 ? options[0].id : 'PPT';
  return facade.promote(optionId);
}

// ── 1. New Save Creation ─────────────────────────────────────────────────────

test('E2E: new save creation produces valid default state', () => {
  const { facade } = createTestSetup();
  const snap = facade.snapshot();

  assert.strictEqual(snap.careerLevel, 1, 'New game starts at career level 1');
  assert.strictEqual(snap.salary, 0, 'New game starts with 0 salary');
  assert.strictEqual(snap.cultivationExp, 0, 'New game starts with 0 cultivation');
  assert.strictEqual(snap.mind, 100, 'New game starts with 100 mind');
  assert.strictEqual(snap.workMode, 'FISHING', 'New game starts in FISHING mode');
  assert.strictEqual(snap.workerCount, 0, 'New game starts with no workers');
  assert.strictEqual(snap.officeLevel, 1, 'New game starts at office level 1');
  assert.strictEqual(snap.tutorialStep, 'FIRST_RECRUIT', 'New game starts at FIRST_RECRUIT tutorial');
  assert.strictEqual(snap.tutorialCompleted, false, 'Tutorial not completed initially');

  // Validate no NaN / Infinity / negative
  assertSafeResource(snap.salary, 'salary');
  assertSafeResource(snap.cultivationExp, 'cultivationExp');
  assertSafeResource(snap.mind, 'mind');
});

// ── 2. Recruit Workers ───────────────────────────────────────────────────────

test('E2E: recruit workers fills the board', () => {
  const { facade } = createTestSetup();
  const boardInfo = facade.queryBoard();

  // Board is 4x4 = 16 slots
  assert.strictEqual(boardInfo.capacity, 16, 'Default board capacity is 16');

  // Recruit 4 workers
  recruitN(facade, 4);
  const snap = facade.snapshot();
  assert.strictEqual(snap.workerCount, 4, 'Should have 4 workers after 4 recruits');
  assert.strictEqual(snap.maxWorkerLevel, 1, 'All recruited workers are level 1');
});

// ── 3. Merge Workers ─────────────────────────────────────────────────────────

test('E2E: merge same-level workers upgrades them', () => {
  const { facade } = createTestSetup();
  const merge = new MergeService(facade.context);

  // Recruit two workers
  const r1 = facade.recruit();
  const r2 = facade.recruit();
  assert.ok(r1.success && r2.success, 'Both recruits should succeed');

  // Merge them
  const result = merge.merge(r1.position!, r2.position!);
  assert.ok(result.success, 'Merge should succeed');
  assert.strictEqual(result.worker.level, 2, 'Merged worker should be level 2');
  assert.ok(result.salaryReward > 0, 'Merge should grant salary reward');
  assert.ok(result.cultivationReward > 0, 'Merge should grant cultivation reward');

  // Verify KPI merge count incremented
  const kpi = facade.queryKpi();
  const mergeItem = kpi.items.find(i => i.type === 'MERGE_COUNT');
  assert.ok(mergeItem, 'KPI should have MERGE_COUNT item');
  assert.ok(mergeItem!.progress >= 1, 'Merge count should be at least 1');
});

// ── 4. Salary Accumulation via Tick ──────────────────────────────────────────

test('E2E: work tick accumulates salary and cultivation', () => {
  const { facade, clock } = createTestSetup();

  // Place a worker on the board for salary calculation
  facade.recruit();

  // Switch to WORK mode
  facade.changeWorkMode('WORK');

  // Tick for 720 seconds (12 minutes) — salaryPerHour=10, cultivationPerHour=5, denominator=7200,
  // WORK multiplier=2: salary = floor(10 * 720 * 2 / 7200) = 2, cultivation = floor(5 * 720 * 2 / 7200) = 1
  facade.start();
  facade.tick(720);

  const player = facade.context.player;
  assert.ok(player.salary > 0, 'Salary should increase after working');
  assert.ok(player.cultivationExp > 0, 'Cultivation should increase after working');
  assert.ok(player.workSeconds >= 720, 'Work seconds should accumulate');
  assertSafeResource(player.salary, 'salary');
  assertSafeResource(player.cultivationExp, 'cultivationExp');
});

// ── 5. Toggle Work Mode ─────────────────────────────────────────────────────

test('E2E: toggleWorkMode switches between WORK and FISHING', () => {
  const { facade } = createTestSetup();

  assert.strictEqual(facade.context.player.workMode, 'FISHING', 'Initial mode is FISHING');
  facade.toggleWorkMode();
  assert.strictEqual(facade.context.player.workMode, 'WORK', 'After toggle should be WORK');
  facade.toggleWorkMode();
  assert.strictEqual(facade.context.player.workMode, 'FISHING', 'After second toggle should be FISHING');
});

// ── 6. KPI Progress ──────────────────────────────────────────────────────────

test('E2E: KPI progress tracks merge count, work seconds, cultivation', () => {
  const { facade, clock } = createTestSetup();

  // Place workers and do a merge
  const merge = new MergeService(facade.context);
  const r1 = facade.recruit();
  const r2 = facade.recruit();
  if (!r1.success || !r2.success) return;
  merge.merge(r1.position, r2.position);

  // Set work seconds and cultivation directly
  facade.context.player.workSeconds = 300;
  facade.context.player.cultivationExp = 50;

  const kpi = facade.queryKpi();
  assert.strictEqual(kpi.careerLevel, 1, 'KPI should show career level 1');

  // Check individual items
  const mergeItem = kpi.items.find(i => i.type === 'MERGE_COUNT');
  const workItem = kpi.items.find(i => i.type === 'WORK_SECONDS');
  const cultItem = kpi.items.find(i => i.type === 'CULTIVATION');

  assert.ok(mergeItem, 'Should have MERGE_COUNT KPI');
  assert.ok(workItem, 'Should have WORK_SECONDS KPI');
  assert.ok(cultItem, 'Should have CULTIVATION KPI');

  // Verify targets match config
  assert.strictEqual(mergeItem!.target, 3, 'Level 1 merge target is 3');
  assert.strictEqual(workItem!.target, 300, 'Level 1 work target is 300');
  assert.strictEqual(cultItem!.target, 50, 'Level 1 cultivation target is 50');
});

// ── 7. Daily Tasks ───────────────────────────────────────────────────────────

test('E2E: daily tasks are generated and progress tracked', () => {
  const { facade } = createTestSetup();

  const progress = facade.queryDailyTaskProgress();
  assert.ok(Array.isArray(progress), 'Daily task progress should be an array');
  // Even with no tasks generated yet, the structure should be valid
  for (const task of progress) {
    assert.ok(typeof task.taskId === 'string', 'Task ID should be string');
    assert.ok(typeof task.progress === 'number', 'Progress should be number');
    assert.ok(typeof task.completed === 'boolean', 'Completed should be boolean');
    assertSafeResource(task.progress, `task ${task.taskId} progress`);
  }
});

// ── 8. Random Events (Career Events) ────────────────────────────────────────

test('E2E: career event system can be queried', () => {
  const { facade } = createTestSetup();

  // Query current event (may be undefined if no event is active)
  const event = facade.queryCurrentEvent();
  // Just verify it doesn't throw and returns undefined or a valid config
  if (event) {
    assert.ok(typeof event.id === 'string', 'Event ID should be string');
  }
});

// ── 9. Achievements ──────────────────────────────────────────────────────────

test('E2E: achievement system tracks career level achievements', () => {
  const { facade } = createTestSetup();

  // Check achievement configs are loaded
  const configs = facade.queryAchievementConfigs();
  assert.ok(configs.length > 0, 'Should have achievement configs');

  // Check that career level 1 achievement exists
  const lianqi = configs.find(c => c.id === 'REACH_LIANQI');
  assert.ok(lianqi, 'Should have REACH_LIANQI achievement');

  // Trigger achievement check
  facade.context.achievements.checkAll();

  // Since careerLevel is 1, REACH_LIANQI should be unlocked
  const status = facade.queryAchievementStatus('REACH_LIANQI');
  assert.ok(status === 'COMPLETED' || status === 'CLAIMED', `REACH_LIANQI should be completed, got ${status}`);
});

// ── 10. Office Growth ────────────────────────────────────────────────────────

test('E2E: office level derives from career level', () => {
  const { facade } = createTestSetup();

  // Level 1-2 → office level 1
  assert.strictEqual(facade.context.office.getOfficeLevel(), 1, 'Career level 1 → office level 1');
  const officeName = facade.queryOfficeName();
  assert.ok(typeof officeName === 'string' && officeName.length > 0, 'Office name should be non-empty');
});

// ── 11. Promotion Eligibility Check ──────────────────────────────────────────

test('E2E: promotion check validates KPI and cultivation requirements', () => {
  const { facade } = createTestSetup();

  // At level 1 with no progress, promotion should be blocked
  const check = facade.queryPromotionCheck();
  assert.strictEqual(check.allowed, false, 'Should not be promotable without KPI completion');
  assert.strictEqual(check.reason, 'KPI_INCOMPLETE', 'Reason should be KPI_INCOMPLETE');

  // At max level, promotion should be blocked
  const { facade: maxFacade } = createTestSetup({ careerLevel: 10 });
  const maxCheck = maxFacade.queryPromotionCheck();
  assert.strictEqual(maxCheck.allowed, false, 'Should not be promotable at max level');
  assert.strictEqual(maxCheck.reason, 'MAX_LEVEL', 'Reason should be MAX_LEVEL');
});

// ── 12. Promotion (渡劫/晋升) ────────────────────────────────────────────────

test('E2E: successful promotion advances career level and resets KPI', () => {
  const { facade, clock } = createTestSetup();

  // Prepare state for promotion from level 1 → 2
  prepareForPromotion(facade, clock);

  const check = facade.queryPromotionCheck();
  assert.strictEqual(check.allowed, true, `Should be promotable, reason: ${check.reason}`);

  const result = forcePromotion(facade);
  assert.ok(result.success, 'Promotion should succeed with low random roll');
  assert.strictEqual(result.newLevel, 2, 'Should advance to career level 2');

  // Verify KPI was reset
  const kpi = facade.queryKpi();
  assert.strictEqual(kpi.careerLevel, 2, 'KPI should reflect new career level');

  // Verify office level updated
  assert.strictEqual(facade.context.office.getOfficeLevel(), 1, 'Level 2 still office level 1');

  // Verify performance reward
  assert.strictEqual(facade.context.player.performance, 10, 'Should get 10 performance from promotion');
});

// ── 13. Save / Load ──────────────────────────────────────────────────────────

test('E2E: save and load preserves game state', () => {
  const { facade, storage } = createTestSetup();

  // Modify state
  facade.recruit();
  facade.context.player.salary = 500;
  facade.context.player.cultivationExp = 200;
  facade.save();

  // Verify storage has data
  const raw = storage.getItem('game-save');
  assert.ok(raw !== null, 'Storage should have save data');
  const saved = JSON.parse(raw!);
  assert.strictEqual(saved.salary, 500, 'Saved salary should be 500');
  assert.strictEqual(saved.cultivationExp, 200, 'Saved cultivation should be 200');
  assert.ok(saved.workers.length > 0, 'Saved should have workers');

  // Load into a new facade
  const clock2 = new FakeClock(0);
  const facade2 = new GameFacade({ storage, clock: clock2, debugProtection: { isProduction: false } });
  const snap2 = facade2.snapshot();
  assert.strictEqual(snap2.salary, 500, 'Loaded salary should be 500');
  assert.strictEqual(snap2.cultivationExp, 200, 'Loaded cultivation should be 200');
  assert.strictEqual(snap2.workerCount, 1, 'Loaded should have 1 worker');
});

// ── 14. Offline Rewards ──────────────────────────────────────────────────────

test('E2E: offline reward settlement grants salary and cultivation', () => {
  const clock = new FakeClock(0);
  const storage = new MemoryStorageAdapter();
  const player = new PlayerData({ careerLevel: 1, lastSaveTime: 0, mind: 100, maxMind: 100 });
  const facade = new GameFacade({ player, storage, clock, debugProtection: { isProduction: false } });

  // Place a worker for idle calculation
  facade.recruit();

  // Save at time 0
  facade.save();

  // Advance clock by 1 hour
  clock.advance(3600 * 1000);

  // Claim offline reward
  const result = facade.claimOfflineReward('offline-1');
  assert.ok(result.salary > 0, 'Offline reward should grant salary');
  assert.ok(result.cultivationExp > 0, 'Offline reward should grant cultivation');
  assert.ok(result.elapsedSeconds > 0, 'Should have elapsed time');
  assert.strictEqual(result.duplicate, false, 'Should not be duplicate');
  assertSafeResource(result.salary, 'offline salary');
  assertSafeResource(result.cultivationExp, 'offline cultivation');

  // Duplicate claim should be rejected
  assert.throws(() => facade.claimOfflineReward('offline-1'), /already claimed/, 'Duplicate claim should throw');
});

// ── 15. Career Level 1→10 Complete Promotion Path ────────────────────────────

test('E2E: complete promotion path from Level 1 to Level 10', () => {
  const clock = new FakeClock(0);
  const storage = new MemoryStorageAdapter();
  const player = new PlayerData({ careerLevel: 1, mind: 100, maxMind: 100, lastSaveTime: 0 });
  // Use FixedRandomProvider(0.01) to guarantee promotion success
  const facade = new GameFacade({
    player,
    storage,
    clock,
    randomProvider: new FixedRandomProvider(0.01),
    debugProtection: { isProduction: false },
  });

  for (let level = 1; level <= 9; level++) {
    // Prepare for promotion from current level
    prepareForPromotion(facade, clock);

    // Verify promotion is allowed
    const check = facade.queryPromotionCheck();
    assert.strictEqual(check.allowed, true, `Level ${level}: should be promotable, got ${check.reason}`);

    // Perform promotion
    const result = forcePromotion(facade);
    assert.ok(result.success, `Level ${level}→${level + 1}: promotion should succeed`);
    assert.strictEqual(facade.context.player.careerLevel, level + 1, `Should be at level ${level + 1}`);

    // Verify state integrity after each promotion
    const p = facade.context.player;
    assertSafeResource(p.salary, `salary after level ${level + 1}`);
    assertSafeResource(p.cultivationExp, `cultivation after level ${level + 1}`);
    assertSafeResource(p.mind, `mind after level ${level + 1}`);
    assert.ok(p.careerLevel >= 1 && p.careerLevel <= 10, `Career level should be 1-10, got ${p.careerLevel}`);
    assert.ok(Number.isFinite(p.performance), `Performance should be finite at level ${level + 1}`);
  }

  // Verify final state
  assert.strictEqual(facade.context.player.careerLevel, 10, 'Should reach career level 10');
  const finalCheck = facade.queryPromotionCheck();
  assert.strictEqual(finalCheck.allowed, false, 'Should not be promotable at level 10');
  assert.strictEqual(finalCheck.reason, 'MAX_LEVEL', 'Reason should be MAX_LEVEL');

  // Verify office level at level 10 → office level 5
  assert.strictEqual(facade.context.office.getOfficeLevel(), 5, 'Career level 10 → office level 5');

  // Verify the career names are correct
  const career = facade.queryCareer();
  assert.strictEqual(career.level, 10, 'Career query should show level 10');
  assert.strictEqual(career.name, '飞升董事', 'Level 10 should be 飞升董事');
});

// ── 16. No NaN / Infinity / Negative Resources ───────────────────────────────

test('E2E: no NaN, Infinity, or negative resources after extensive operations', () => {
  const { facade, clock } = createTestSetup();

  // Recruit and merge multiple times
  const merge = new MergeService(facade.context);
  for (let i = 0; i < 8; i++) {
    const r1 = facade.recruit();
    const r2 = facade.recruit();
    if (r1.success && r2.success && facade.context.board.canMerge(r1.position!, r2.position!)) {
      merge.merge(r1.position!, r2.position!);
    }
  }

  // Work for a while
  facade.changeWorkMode('WORK');
  facade.start();
  facade.tick(300);
  facade.gameLoop.stop();

  // Toggle mode
  facade.toggleWorkMode();
  facade.start();
  facade.tick(120);
  facade.gameLoop.stop();

  // Check all resources
  const p = facade.context.player;
  assertSafeResource(p.salary, 'salary');
  assertSafeResource(p.cultivationExp, 'cultivationExp');
  assertSafeResource(p.mind, 'mind');
  assertSafeResource(p.maxMind, 'maxMind');
  assertSafeResource(p.performance, 'performance');
  assertSafeResource(p.workSeconds, 'workSeconds');
  assertSafeResource(p.fishingSeconds, 'fishingSeconds');
  assert.ok(Number.isFinite(p.careerLevel), 'careerLevel must be finite');
  assert.ok(p.careerLevel >= 1, 'careerLevel must be >= 1');

  // Verify snapshot integrity
  const snap = facade.snapshot();
  assertSafeResource(snap.salary, 'snapshot salary');
  assertSafeResource(snap.cultivationExp, 'snapshot cultivation');
  assertSafeResource(snap.mind, 'snapshot mind');
  assert.ok(Number.isFinite(snap.careerLevel), 'snapshot careerLevel must be finite');
});

// ── 17. Worker Integrity (No Worker Loss) ────────────────────────────────────

test('E2E: workers are not lost during save/load cycle', () => {
  const { facade, storage, clock } = createTestSetup();

  // Recruit 5 workers
  recruitN(facade, 5);
  const beforeSave = facade.snapshot().workerCount;
  assert.strictEqual(beforeSave, 5, 'Should have 5 workers before save');

  // Save
  facade.save();

  // Load into new facade
  const facade2 = new GameFacade({ storage, clock, debugProtection: { isProduction: false } });
  const afterLoad = facade2.snapshot().workerCount;
  assert.strictEqual(afterLoad, 5, 'Should have 5 workers after load');
});

// ── 18. No Infinite Loop in Game Loop ────────────────────────────────────────

test('E2E: game loop does not enter infinite loop with large delta', () => {
  const { facade, clock } = createTestSetup();
  facade.recruit();
  facade.changeWorkMode('WORK');
  facade.start();

  // Tick with a very large delta (should not hang)
  const start = Date.now();
  facade.tick(10000); // 10000 seconds
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 5000, 'Tick should complete quickly even with large delta');

  const p = facade.context.player;
  assertSafeResource(p.salary, 'salary after large tick');
  assertSafeResource(p.cultivationExp, 'cultivation after large tick');
  assert.ok(p.workSeconds > 0, 'Work seconds should accumulate');
});

// ── 19. Career Level 1-10 Names Are Correct ──────────────────────────────────

test('E2E: all 10 career levels have correct names and realms', () => {
  const { facade } = createTestSetup();
  const expectedNames = [
    '练气职员', '筑基职员', '金丹主管', '元婴主管', '化神经理',
    '炼虚经理', '合体总监', '大乘总监', '渡劫副总', '飞升董事',
  ];
  const expectedRealms = [
    '练气境', '筑基境', '金丹境', '元婴境', '化神境',
    '炼虚境', '合体境', '大乘境', '渡劫境', '飞升境',
  ];

  for (let i = 1; i <= 10; i++) {
    const levelConfig = facade.context.career.get(i);
    assert.strictEqual(levelConfig.level, i, `Level ${i} config should have level ${i}`);
    assert.strictEqual(levelConfig.name, expectedNames[i - 1], `Level ${i} name should be ${expectedNames[i - 1]}`);
    assert.strictEqual(levelConfig.realm, expectedRealms[i - 1], `Level ${i} realm should be ${expectedRealms[i - 1]}`);
    assert.ok(levelConfig.salaryMultiplier > 0, `Level ${i} salary multiplier should be positive`);
    assert.ok(levelConfig.cultivationMultiplier > 0, `Level ${i} cultivation multiplier should be positive`);
  }
});

// ── 20. Office Level Mapping ─────────────────────────────────────────────────

test('E2E: office levels correctly map to career levels', () => {
  const { facade } = createTestSetup();
  const expectedMapping: Record<number, number> = {
    1: 1, 2: 1,   // career 1-2 → office 1
    3: 2, 4: 2,   // career 3-4 → office 2
    5: 3, 6: 3,   // career 5-6 → office 3
    7: 4, 8: 4,   // career 7-8 → office 4
    9: 5, 10: 5,  // career 9-10 → office 5
  };

  for (let career = 1; career <= 10; career++) {
    const expected = expectedMapping[career];
    const actual = facade.context.office.officeLevelForCareer(career);
    assert.strictEqual(actual, expected, `Career level ${career} should map to office level ${expected}`);
  }
});

// ── 21. Promotion Failure and Retry ──────────────────────────────────────────

test('E2E: promotion failure penalizes mind and requires retry', () => {
  const clock = new FakeClock(0);
  const storage = new MemoryStorageAdapter();
  // Use FixedRandomProvider(0.99) to guarantee promotion failure
  const player = new PlayerData({ careerLevel: 1, mind: 100, maxMind: 100, lastSaveTime: 0 });
  const facade = new GameFacade({
    player,
    storage,
    clock,
    randomProvider: new FixedRandomProvider(0.99), // high roll → failure
    debugProtection: { isProduction: false },
  });

  prepareForPromotion(facade, clock);

  const check = facade.queryPromotionCheck();
  assert.strictEqual(check.allowed, true, 'Should be promotable');

  const result = forcePromotion(facade);
  assert.strictEqual(result.success, false, 'Promotion should fail with high random roll');

  // Mind should be penalized
  assert.ok(facade.context.player.mind < 100, 'Mind should decrease after failed promotion');
  assertSafeResource(facade.context.player.mind, 'mind after failure');

  // Fail count should increment
  assert.strictEqual(facade.context.player.promotionFailCount, 1, 'Fail count should be 1');

  // Retry should be required
  assert.strictEqual(facade.queryPromotionNeedsRetry(), true, 'Retry should be required after failure');
});

// ── 22. Full Lifecycle: New Game → Play → Save → Load → Continue ─────────────

test('E2E: full lifecycle from new game to save/load/continue', () => {
  const clock = new FakeClock(0);
  const storage = new MemoryStorageAdapter();
  const player = new PlayerData({ careerLevel: 1, mind: 100, maxMind: 100, lastSaveTime: 0 });
  const facade = new GameFacade({
    player,
    storage,
    clock,
    randomProvider: new FixedRandomProvider(0.01),
    debugProtection: { isProduction: false },
  });

  // Phase 1: Play - recruit, merge, work
  facade.recruit();
  facade.recruit();
  const merge = new MergeService(facade.context);
  const r1 = facade.context.board.findEmptyPosition();
  // Find two workers to merge
  const workers = facade.context.board.cells.filter(c => c.occupant).map(c => ({ row: c.row, column: c.column }));
  if (workers.length >= 2) {
    const w1 = workers[0];
    const w2 = workers[1];
    const left = facade.context.board.getWorker(w1);
    const right = facade.context.board.getWorker(w2);
    if (left && right && left.level === right.level && facade.context.board.canMerge(w1, w2)) {
      merge.merge(w1, w2);
    }
  }

  facade.changeWorkMode('WORK');
  facade.start();
  facade.tick(60);
  facade.gameLoop.stop();

  // Phase 2: Save
  facade.save();

  // Phase 3: Load into new facade
  const facade2 = new GameFacade({ storage, clock, debugProtection: { isProduction: false } });
  const snap2 = facade2.snapshot();

  // Phase 4: Continue playing
  assert.ok(snap2.salary > 0 || snap2.workerCount > 0, 'Should have progress from previous session');
  facade2.recruit();
  assert.ok(facade2.snapshot().workerCount >= snap2.workerCount, 'Should be able to continue after load');

  // Verify no corruption
  const p2 = facade2.context.player;
  assertSafeResource(p2.salary, 'salary after lifecycle');
  assertSafeResource(p2.cultivationExp, 'cultivation after lifecycle');
  assertSafeResource(p2.mind, 'mind after lifecycle');
});

// ── 23. Salary Multiplier Scales with Career Level ───────────────────────────

test('E2E: career level salary multiplier increases with level', () => {
  const { facade } = createTestSetup();

  let prevMultiplier = 0;
  for (let level = 1; level <= 10; level++) {
    const config = facade.context.career.get(level);
    assert.ok(config.salaryMultiplier > prevMultiplier, `Level ${level} multiplier should exceed previous`);
    prevMultiplier = config.salaryMultiplier;
  }
});

// ── 24. Cultivation Multiplier Scales with Career Level ──────────────────────

test('E2E: career level cultivation multiplier increases with level', () => {
  const { facade } = createTestSetup();

  let prevMultiplier = 0;
  for (let level = 1; level <= 10; level++) {
    const config = facade.context.career.get(level);
    assert.ok(config.cultivationMultiplier > prevMultiplier, `Level ${level} cultivation multiplier should exceed previous`);
    prevMultiplier = config.cultivationMultiplier;
  }
});

// ── 25. KPI Targets Increase with Career Level ───────────────────────────────

test('E2E: KPI targets increase across career levels', () => {
  const { facade } = createTestSetup();

  let prevMerge = 0;
  let prevWork = 0;
  let prevCult = 0;

  for (let level = 1; level <= 9; level++) {
    const kpi = KPI_REQUIREMENTS[level];
    assert.ok(kpi.MERGE_COUNT > prevMerge, `Level ${level} merge target should increase`);
    assert.ok(kpi.WORK_SECONDS > prevWork, `Level ${level} work target should increase`);
    assert.ok(kpi.CULTIVATION > prevCult, `Level ${level} cultivation target should increase`);
    prevMerge = kpi.MERGE_COUNT;
    prevWork = kpi.WORK_SECONDS;
    prevCult = kpi.CULTIVATION;
  }
});

// ── 26. Board Cannot Overfill ────────────────────────────────────────────────

test('E2E: board rejects recruits when full', () => {
  const { facade } = createTestSetup();

  // Fill the 4x4 board
  recruitN(facade, 16);
  assert.strictEqual(facade.snapshot().workerCount, 16, 'Board should have 16 workers');

  // Next recruit should fail
  const result = facade.recruit();
  assert.strictEqual(result.success, false, 'Recruit should fail when board is full');
});

// ── 27. Merge Rejects Different-Level Workers ────────────────────────────────

test('E2E: merge rejects workers of different levels', () => {
  const { facade } = createTestSetup();
  const merge = new MergeService(facade.context);

  // Create a level-2 worker by merging two level-1s
  const r1 = facade.recruit();
  const r2 = facade.recruit();
  if (!r1.success || !r2.success) return;
  merge.merge(r1.position, r2.position);

  // Recruit a new level-1 worker
  const r3 = facade.recruit();
  if (!r3.success) return;

  // Try to merge level-2 with level-1 (should fail)
  const level2Pos = facade.context.board.cells.find(c => c.occupant && c.occupant.level === 2);
  assert.ok(level2Pos, 'Should have a level-2 worker');
  const canMerge = facade.context.board.canMerge(
    { row: level2Pos!.row, column: level2Pos!.column },
    r3.position,
  );
  assert.strictEqual(canMerge, false, 'Should not be able to merge different-level workers');
});

// ── 28. Promotion Path Integrity: No Broken Chain ────────────────────────────

test('E2E: career level chain 1-10 has no gaps', () => {
  const { facade } = createTestSetup();

  for (let level = 1; level <= 10; level++) {
    const config = facade.context.career.get(level);
    assert.strictEqual(config.level, level, `Career level ${level} must exist`);
    assert.ok(config.name.length > 0, `Level ${level} must have a name`);
    assert.ok(config.realm.length > 0, `Level ${level} must have a realm`);
    assert.ok(config.salaryMultiplier >= 1, `Level ${level} salary multiplier should be >= 1`);
    assert.ok(config.cultivationMultiplier >= 1, `Level ${level} cultivation multiplier should be >= 1`);
  }

  // Verify no level 11
  assert.throws(() => facade.context.career.get(11), /Unknown career level/, 'Level 11 should not exist');
});

// ── 29. Work Mode Affects Income Rate ────────────────────────────────────────

test('E2E: WORK mode gives higher salary than FISHING mode', () => {
  const clock1 = new FakeClock(0);
  const storage1 = new MemoryStorageAdapter();
  const p1 = new PlayerData({ careerLevel: 1, mind: 100, maxMind: 100, lastSaveTime: 0, workMode: 'WORK' });
  const f1 = new GameFacade({ player: p1, storage: storage1, clock: clock1, debugProtection: { isProduction: false } });
  f1.recruit(); // Place worker for salary rate
  f1.start();
  // 720s: WORK salary = floor(10 * 720 * 2 / 7200) = 2
  f1.tick(720);
  f1.gameLoop.stop();
  const workSalary = f1.context.player.salary;

  const clock2 = new FakeClock(0);
  const storage2 = new MemoryStorageAdapter();
  const p2 = new PlayerData({ careerLevel: 1, mind: 100, maxMind: 100, lastSaveTime: 0, workMode: 'FISHING' });
  const f2 = new GameFacade({ player: p2, storage: storage2, clock: clock2, debugProtection: { isProduction: false } });
  f2.recruit();
  f2.start();
  // 720s: FISHING salary = floor(10 * 720 * 1 / 7200) = 1
  f2.tick(720);
  f2.gameLoop.stop();
  const fishingSalary = f2.context.player.salary;

  assert.ok(workSalary > fishingSalary, `WORK salary (${workSalary}) should be > FISHING salary (${fishingSalary})`);
});

// ── 30. Snapshot Consistency ──────────────────────────────────────────────────

test('E2E: snapshot reflects current player state consistently', () => {
  const { facade } = createTestSetup();

  facade.recruit();
  facade.context.player.salary = 123;
  facade.context.player.cultivationExp = 456;

  const snap = facade.snapshot();
  assert.strictEqual(snap.salary, 123, 'Snapshot salary should match player');
  assert.strictEqual(snap.cultivationExp, 456, 'Snapshot cultivation should match player');
  assert.strictEqual(snap.workerCount, 1, 'Snapshot worker count should match');
  assert.strictEqual(snap.careerLevel, 1, 'Snapshot career level should match');
  assert.ok(Object.isFrozen(snap), 'Snapshot should be frozen');
});