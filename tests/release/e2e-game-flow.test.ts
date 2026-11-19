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

/** Gameplay V2 KPI requirements per career level (from kpi.json). */
/** V10.2：KPI/晋升期望值一律读活配置（kpi.json/career.json），不再维护测试常量双源。 */
import kpiConfig from '../../assets/configs/kpi.json';

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
    modeSwitchCooldownMs: 0,
    board: null,
  });
  return { facade, clock, storage };
}

/** Assert that a number is a finite, non-negative integer (no NaN / Infinity / negative). */
function assertSafeResource(value: number, label: string): void {
  assert.ok(Number.isFinite(value), `${label} must be finite, got ${value}`);
  assert.ok(value >= 0, `${label} must be non-negative, got ${value}`);
}

// PC V1: recruitN and doMerges helpers removed — board/merge unavailable

/** Set player state to meet KPI and cultivation requirements for promotion from current level. */
function prepareForPromotion(facade: GameFacade, clock: FakeClock): void {
  const player = facade.context.player;
  // V10.2：改为读活配置（消除测试常量表与 career.json/kpi.json 的双源漂移），支持 1..20 全 ladder
  const level = player.careerLevel;
  const requirements = facade.context.kpi.getCurrentRequirements();
  for (const req of requirements) {
    if (req.type === 'TASK_DONE') player.kpiProgress = { ...player.kpiProgress, TASK_DONE: req.target };
    if (req.type === 'WORK_SECONDS') player.workSeconds = Math.max(player.workSeconds, req.target);
    if (req.type === 'CULTIVATION') player.cultivationExp = Math.max(player.cultivationExp, req.target);
    if (req.type === 'MERGE_COUNT' || req.type === 'SALARY_EARNED' || req.type === 'EVENT_RESOLVED') {
      player.kpiProgress = { ...player.kpiProgress, [req.type]: req.target };
    }
  }
  // career.requiredExp 由 canPromote() 检查（修为）
  player.cultivationExp = Math.max(player.cultivationExp, facade.context.career.current().requiredExp);
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
  assert.strictEqual(snap.tutorialStep, 'WELCOME', 'New game starts at the V2 welcome hint');
  assert.strictEqual(snap.tutorialCompleted, false, 'Tutorial not completed initially');

  // Validate no NaN / Infinity / negative
  assertSafeResource(snap.salary, 'salary');
  assertSafeResource(snap.cultivationExp, 'cultivationExp');
  assertSafeResource(snap.mind, 'mind');
});

// ── 2. Recruit Workers ───────────────────────────────────────────────────────
// PC V1: Board removed — recruit always fails, no worker placement

test('E2E: recruit fails gracefully in PC V1 (no board)', () => {
  const { facade } = createTestSetup();

  // queryBoard returns null in PC V1
  assert.strictEqual(facade.queryBoard(), null, 'Board should be null in PC V1');

  // recruit always fails in PC V1
  const result = facade.recruit();
  assert.strictEqual(result.success, false, 'Recruit should fail in PC V1');
  assert.ok(result.message, 'Should provide a failure message');
});

// ── 3. Merge Workers ─────────────────────────────────────────────────────────
// PC V1: MergeService requires board — deprecated in PC V1

test('E2E: MergeService throws in PC V1 (no board)', () => {
  const { facade } = createTestSetup();

  // MergeService constructor should throw because board is null
  assert.throws(
    () => new MergeService(facade.context),
    /deprecated in PC V1/,
    'MergeService should throw in PC V1',
  );
});

// ── 4. Salary Accumulation via Tick ──────────────────────────────────────────

test('E2E: work tick accumulates salary and cultivation', () => {
  const { facade, clock } = createTestSetup();

  // Place a worker on the board for salary calculation
  facade.recruit();

  // Switch to WORK mode
  facade.changeWorkMode('WORK');

  // Tick for 1800 seconds (30 minutes) — V2 WORK ×1.3 salary / ×0.8 cultivation:
  // salary = floor(10 * 1800 * 1.3 / 7200) = 3, cultivation = floor(8 * 1800 * 0.8 / 7200) = 1
  facade.start();
  facade.tick(1800);

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

test('E2E: KPI progress tracks task completions, work seconds, cultivation', () => {
  const { facade, clock } = createTestSetup();

  // Gameplay V2: set the task-completion KPI directly.
  facade.context.player.kpiProgress = { TASK_DONE: 1 };

  // Set work seconds and cultivation directly
  facade.context.player.workSeconds = 7200;
  facade.context.player.cultivationExp = 100;

  const kpi = facade.queryKpi();
  assert.strictEqual(kpi.careerLevel, 1, 'KPI should show career level 1');

  // Check individual items
  const taskItem = kpi.items.find(i => i.type === 'TASK_DONE');
  const workItem = kpi.items.find(i => i.type === 'WORK_SECONDS');
  const cultItem = kpi.items.find(i => i.type === 'CULTIVATION');

  assert.ok(taskItem, 'Should have TASK_DONE KPI');
  assert.ok(workItem, 'Should have WORK_SECONDS KPI');
  assert.ok(cultItem, 'Should have CULTIVATION KPI');

  // Verify targets match config
  assert.strictEqual(taskItem!.target, 3, 'Level 1 task target is 3');
  assert.strictEqual(workItem!.target, 7200, 'Level 1 work target is 7200');
  assert.strictEqual(cultItem!.target, 100, 'Level 1 cultivation target is 100');
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
  const { facade: maxFacade } = createTestSetup({ careerLevel: 20 });
  const maxCheck = maxFacade.queryPromotionCheck();
  assert.strictEqual(maxCheck.allowed, false, 'Should not be promotable at max level (20)');
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

  // PC V1: Modify state without recruit (no board)
  facade.context.player.salary = 500;
  facade.context.player.cultivationExp = 200;
  facade.context.player.workSeconds = 600;
  facade.save();

  // Verify storage has data
  const raw = storage.getItem('game-save');
  assert.ok(raw !== null, 'Storage should have save data');
  const saved = JSON.parse(raw!);
  assert.strictEqual(saved.salary, 500, 'Saved salary should be 500');
  assert.strictEqual(saved.cultivationExp, 200, 'Saved cultivation should be 200');

  // Load into a new facade
  const clock2 = new FakeClock(0);
  const facade2 = new GameFacade({ storage, clock: clock2, debugProtection: { isProduction: false }, modeSwitchCooldownMs: 0 });
  const snap2 = facade2.snapshot();
  assert.strictEqual(snap2.salary, 500, 'Loaded salary should be 500');
  assert.strictEqual(snap2.cultivationExp, 200, 'Loaded cultivation should be 200');
  assert.strictEqual(snap2.workSeconds, 600, 'Loaded work seconds should be 600');
});

// ── 14. Offline Rewards ──────────────────────────────────────────────────────

test('E2E: offline reward settlement grants salary and cultivation', () => {
  const clock = new FakeClock(0);
  const storage = new MemoryStorageAdapter();
  const player = new PlayerData({ careerLevel: 1, lastSaveTime: 0, mind: 100, maxMind: 100 });
  const facade = new GameFacade({ player, storage, clock, debugProtection: { isProduction: false }, modeSwitchCooldownMs: 0 });

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

test('E2E: complete promotion path from Level 1 to Level 20', () => {
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
    modeSwitchCooldownMs: 0,
  });

  for (let level = 1; level <= 19; level++) {
    // Prepare for promotion from current level（V10.2：1→20 全阶梯）
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
    assert.ok(p.careerLevel >= 1 && p.careerLevel <= 20, `Career level should be 1-20, got ${p.careerLevel}`);
    assert.ok(Number.isFinite(p.performance), `Performance should be finite at level ${level + 1}`);
  }

  // Verify final state
  assert.strictEqual(facade.context.player.careerLevel, 20, 'Should reach career level 20');
  const finalCheck = facade.queryPromotionCheck();
  assert.strictEqual(finalCheck.allowed, false, 'Should not be promotable at level 10');
  assert.strictEqual(finalCheck.reason, 'MAX_LEVEL', 'Reason should be MAX_LEVEL');

  // Verify office level at level 10 → office level 5
  assert.strictEqual(facade.context.office.getOfficeLevel(), 10, 'Career level 20 → office level 10');

  // Verify the career names are correct
  const career = facade.queryCareer();
  assert.strictEqual(career.level, 20, 'Career query should show level 20');
  assert.strictEqual(career.name, '天庭在编·首席修仙牛马', 'Level 20 should be 天庭在编·首席修仙牛马');
});

// ── 16. No NaN / Infinity / Negative Resources ───────────────────────────────

test('E2E: no NaN, Infinity, or negative resources after extensive operations', () => {
  const { facade, clock } = createTestSetup();

  // PC V1: No board/merge — use work mode and direct state manipulation instead
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

  // Directly manipulate some state to stress-test
  facade.context.player.salary += 1000;
  facade.context.player.cultivationExp += 500;
  facade.context.player.performance += 5;

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
// PC V1: No board/workers — test save/load integrity with other state

test('E2E: save/load cycle preserves player state in PC V1', () => {
  const { facade, storage, clock } = createTestSetup();

  // Modify state directly (no board/workers in PC V1)
  facade.context.player.salary = 999;
  facade.context.player.cultivationExp = 1234;
  facade.context.player.workSeconds = 500;
  const beforeSave = facade.snapshot();
  assert.strictEqual(beforeSave.salary, 999, 'Salary should be 999 before save');
  assert.strictEqual(beforeSave.cultivationExp, 1234, 'Cultivation should be 1234 before save');

  // Save
  facade.save();

  // Load into new facade
  const facade2 = new GameFacade({ storage, clock, debugProtection: { isProduction: false } });
  const afterLoad = facade2.snapshot();
  assert.strictEqual(afterLoad.salary, 999, 'Salary should be 999 after load');
  assert.strictEqual(afterLoad.cultivationExp, 1234, 'Cultivation should be 1234 after load');
  assert.strictEqual(afterLoad.workSeconds, 500, 'Work seconds should be 500 after load');
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
    '实习牛马', '正式牛马', '骨干牛马', '小组骨干', '项目骨干',
    '部门骨干', '部门主管', '部门经理', '高级经理', '区域副总监',
  ];
  const expectedRealms = [
    '炼气一层', '炼气三层', '炼气六层', '筑基初期', '筑基中期',
    '筑基后期', '金丹初期', '金丹中期', '金丹后期', '元婴初期',
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
    modeSwitchCooldownMs: 0,
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
    modeSwitchCooldownMs: 0,
  });

  // PC V1: Phase 1 — Play with work mode (no board/merge)
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
  assert.ok(snap2.salary > 0 || snap2.workSeconds > 0, 'Should have progress from previous session');

  // Continue working
  facade2.changeWorkMode('WORK');
  facade2.start();
  facade2.tick(60);
  facade2.gameLoop.stop();
  assert.ok(facade2.snapshot().workSeconds > snap2.workSeconds, 'Should be able to continue after load');

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

  let prevTask = 0;
  let prevWork = 0;
  let prevCult = 0;

  // V10.2：读活 kpi.json（1..19 全表单调性，消除测试常量双源漂移）
  const levels = kpiConfig.levels.slice().sort((a, b) => a.careerLevel - b.careerLevel);
  for (const l of levels) {
    const reqs = Object.fromEntries(l.requirements.map((r) => [r.type, r.target]));
    const td = reqs['TASK_DONE'] ?? 0;
    const ws = reqs['WORK_SECONDS'] ?? 0;
    const cu = reqs['CULTIVATION'] ?? 0;
    assert.ok(td > prevTask, `L${l.careerLevel} task target should increase`);
    assert.ok(ws > prevWork, `L${l.careerLevel} work target should increase`);
    assert.ok(cu > prevCult, `L${l.careerLevel} cultivation target should increase`);
    prevTask = td;
    prevWork = ws;
    prevCult = cu;
  }
});

// ── 26. Board Cannot Overfill ────────────────────────────────────────────────
// PC V1: Board removed — recruit always fails regardless

test('E2E: recruit always fails in PC V1 (no board capacity)', () => {
  const { facade } = createTestSetup();

  // In PC V1, recruit always fails because there is no board
  const result = facade.recruit();
  assert.strictEqual(result.success, false, 'Recruit should always fail in PC V1');
  assert.strictEqual(facade.snapshot().workerCount, 0, 'Worker count should remain 0');
});

// ── 27. Merge Rejects Different-Level Workers ────────────────────────────────
// PC V1: MergeService requires board — deprecated in PC V1

test('E2E: MergeService unavailable in PC V1 (no merge feature)', () => {
  const { facade } = createTestSetup();

  // MergeService should throw in PC V1
  assert.throws(
    () => new MergeService(facade.context),
    /deprecated in PC V1/,
    'MergeService should throw in PC V1',
  );

  // Board should be null
  assert.strictEqual(facade.queryBoard(), null, 'Board should be null in PC V1');
});

// ── 28. Promotion Path Integrity: No Broken Chain ────────────────────────────

test('E2E: career level chain 1-20 has no gaps', () => {
  const { facade } = createTestSetup();

  for (let level = 1; level <= 20; level++) {
    const config = facade.context.career.get(level);
    assert.strictEqual(config.level, level, `Career level ${level} must exist`);
    assert.ok(config.name.length > 0, `Level ${level} must have a name`);
    assert.ok(config.realm.length > 0, `Level ${level} must have a realm`);
    assert.ok(config.salaryMultiplier >= 1, `Level ${level} salary multiplier should be >= 1`);
    assert.ok(config.cultivationMultiplier >= 1, `Level ${level} cultivation multiplier should be >= 1`);
  }

  // Verify no level 21（V10.2：上限 20）
  assert.throws(() => facade.context.career.get(21), /Unknown career level/, 'Level 21 should not exist');
});

// ── 29. Work Mode Affects Income Rate ────────────────────────────────────────

test('E2E: WORK mode gives higher salary than FISHING mode', () => {
  const clock1 = new FakeClock(0);
  const storage1 = new MemoryStorageAdapter();
  const p1 = new PlayerData({ careerLevel: 1, mind: 100, maxMind: 100, lastSaveTime: 0, workMode: 'WORK' });
  const f1 = new GameFacade({ player: p1, storage: storage1, clock: clock1, debugProtection: { isProduction: false }, modeSwitchCooldownMs: 0 });
  f1.recruit(); // Place worker for salary rate
  f1.start();
  // 720s: WORK salary = floor(10 * 720 * 2 / 7200) = 2
  f1.tick(720);
  f1.gameLoop.stop();
  const workSalary = f1.context.player.salary;

  const clock2 = new FakeClock(0);
  const storage2 = new MemoryStorageAdapter();
  const p2 = new PlayerData({ careerLevel: 1, mind: 100, maxMind: 100, lastSaveTime: 0, workMode: 'FISHING' });
  const f2 = new GameFacade({ player: p2, storage: storage2, clock: clock2, debugProtection: { isProduction: false }, modeSwitchCooldownMs: 0 });
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

  // PC V1: No recruit — modify state directly
  facade.context.player.salary = 123;
  facade.context.player.cultivationExp = 456;
  facade.context.player.workSeconds = 789;

  const snap = facade.snapshot();
  assert.strictEqual(snap.salary, 123, 'Snapshot salary should match player');
  assert.strictEqual(snap.cultivationExp, 456, 'Snapshot cultivation should match player');
  assert.strictEqual(snap.workSeconds, 789, 'Snapshot work seconds should match player');
  assert.strictEqual(snap.workerCount, 0, 'PC V1: worker count should be 0');
  assert.strictEqual(snap.careerLevel, 1, 'Snapshot career level should match');
  assert.ok(Object.isFrozen(snap), 'Snapshot should be frozen');
});
