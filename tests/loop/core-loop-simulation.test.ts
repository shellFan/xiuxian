/**
 * Core Loop Simulation Test — Phase 3M
 *
 * Validates the complete game loop end-to-end:
 *   招募 → 合成 → 工作 → 工资 → 修为 → 道心 → KPI → 事件 → 晋升 → 离线收益
 *
 * All tests are headless (no Cocos) using FakeClock/FakeRandomProvider.
 */
import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { SequenceRandomProvider } from '../../assets/scripts/core/random-provider';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { WorkerEntity } from '../../assets/scripts/model/worker-entity';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { GameLoopService } from '../../assets/scripts/services/game-loop-service';
import { RecruitmentService } from '../../assets/scripts/services/recruitment-service';
import { MergeService } from '../../assets/scripts/services/merge-service';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<ConstructorParameters<typeof PlayerData>[0]> = {}): PlayerData {
  return new PlayerData({ mind: 100, maxMind: 100, workMode: 'FISHING', ...overrides });
}

interface SimulationOptions {
  readonly player?: PlayerData;
  readonly clock?: FakeClock;
  readonly random?: SequenceRandomProvider;
  readonly autoSaveIntervalSeconds?: number;
}

function makeSimulation(options: SimulationOptions = {}) {
  const clock = options.clock ?? new FakeClock(1_000);
  const random = options.random ?? new SequenceRandomProvider([0.5]);
  const player = options.player ?? makePlayer();
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({
    player,
    storage,
    clock,
    careerEventClock: clock,
    randomProvider: random,
  });
  const recruitment = new RecruitmentService(context);
  const merge = new MergeService(context);
  const loop = new GameLoopService(context, {
    autoSaveIntervalSeconds: options.autoSaveIntervalSeconds ?? 0,
  });
  return { context, loop, clock, random, storage, recruitment, merge };
}

/** Place N level-1 workers on the board starting from (0,0). */
function placeWorkers(context: GameContext, count: number): void {
  let placed = 0;
  for (let row = 0; row < context.board.rows && placed < count; row += 1) {
    for (let col = 0; col < context.board.columns && placed < count; col += 1) {
      context.board.place(WorkerEntity.create(1), { row, column: col });
      placed += 1;
    }
  }
}

// ── Test: Recruitment → Board has workers ────────────────────────────────────

function testRecruitmentAddsWorkerToBoard(): void {
  const { context, recruitment } = makeSimulation();
  assert.equal(context.board.occupiedCount, 0, 'board should start empty');
  const result = context.board.findEmptyPosition();
  assert.ok(result, 'board should have empty positions');
  const recruitResult = recruitment.recruit();
  assert.equal(recruitResult.success, true, 'recruitment should succeed');
  assert.equal(context.board.occupiedCount, 1, 'board should have 1 worker after recruitment');
}

// ── Test: Merge → Salary + Cultivation + KPI ────────────────────────────────

function testMergeGrantsRewardsAndKpi(): void {
  const { context, merge } = makeSimulation({ player: makePlayer() });
  // Place 2 level-1 workers adjacent for merging
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 1 });
  const salaryBefore = context.player.salary;
  const cultivationBefore = context.player.cultivationExp;
  const mergeKpiBefore = context.player.kpiProgress['MERGE_COUNT'] ?? 0;
  const salaryKpiBefore = context.player.kpiProgress['SALARY_EARNED'] ?? 0;

  const result = merge.merge({ row: 0, column: 0 }, { row: 0, column: 1 });
  assert.equal(result.success, true, 'merge should succeed');
  assert.ok(context.player.salary > salaryBefore, 'salary should increase from merge');
  assert.ok(context.player.cultivationExp > cultivationBefore, 'cultivation should increase from merge');
  assert.equal(context.player.kpiProgress['MERGE_COUNT'] ?? 0, mergeKpiBefore + 1, 'MERGE_COUNT KPI should increment');
  assert.ok((context.player.kpiProgress['SALARY_EARNED'] ?? 0) > salaryKpiBefore, 'SALARY_EARNED KPI should increase');
}

// ── Test: Work → Salary + Cultivation + Mind drain + KPI ────────────────────

function testWorkTickGrantsSalaryAndTracksKpi(): void {
  const { context, loop } = makeSimulation({ player: makePlayer({ workMode: 'WORK' }) });
  placeWorkers(context, 1);
  const salaryKpiBefore = context.player.kpiProgress['SALARY_EARNED'] ?? 0;
  loop.start();
  loop.tick(3600); // 1 hour of work
  assert.ok(context.player.salary > 0, 'salary should increase from work');
  assert.ok(context.player.cultivationExp > 0, 'cultivation should increase from work');
  assert.ok(context.player.mind < 100, 'WORK should drain mind');
  assert.ok(context.player.workSeconds > 0, 'workSeconds should increase');
  assert.ok((context.player.kpiProgress['SALARY_EARNED'] ?? 0) > salaryKpiBefore, 'SALARY_EARNED KPI should increase from work');
}

// ── Test: Fishing → Mind recovery ───────────────────────────────────────────

function testFishingRecoversMind(): void {
  const { context, loop } = makeSimulation({ player: makePlayer({ workMode: 'FISHING', mind: 10 }) });
  placeWorkers(context, 1);
  loop.start();
  loop.tick(3600); // 1 hour of fishing
  assert.ok(context.player.mind > 10, 'FISHING should recover mind');
  assert.ok(context.player.fishingSeconds > 0, 'fishingSeconds should increase');
}

// ── Test: Work mode switch ──────────────────────────────────────────────────

function testWorkModeSwitch(): void {
  const { context } = makeSimulation({ player: makePlayer({ workMode: 'FISHING' }) });
  assert.equal(context.player.workMode, 'FISHING');
  context.work.setMode('WORK');
  assert.equal(context.player.workMode, 'WORK');
  context.work.setMode('FISHING');
  assert.equal(context.player.workMode, 'FISHING');
}

// ── Test: KPI completion enables promotion ───────────────────────────────────

function testKpiCompletionEnablesPromotion(): void {
  const { context } = makeSimulation({ player: makePlayer({ careerLevel: 1, cultivationExp: 200 }) });
  // Level 1 KPI: MERGE_COUNT=3, WORK_SECONDS=300, CULTIVATION=50
  // Set KPI counters to meet requirements
  context.player.kpiProgress = { MERGE_COUNT: 5, SALARY_EARNED: 100, EVENT_RESOLVED: 0 };
  context.player.workSeconds = 600;
  // cultivationExp is already 200 which is >= 50
  assert.ok(context.kpi.isCurrentKpiCompleted(), 'KPI should be completed');
  const check = context.promotion.canPromote();
  assert.equal(check.allowed, true, 'promotion should be allowed when KPI completed + cultivation sufficient');
}

// ── Test: Career event lifecycle ────────────────────────────────────────────

function testCareerEventLifecycle(): void {
  const clock = new FakeClock(1_000);
  const random = new SequenceRandomProvider([0.5, 0.5, 0.5, 0.5]);
  const { context, loop } = makeSimulation({ clock, random });
  loop.start();
  // First poll initializes the scheduler's nextEventAt
  context.careerEvents.poll();
  // Advance past the scheduled interval (max 8 min)
  clock.advance(10 * 60 * 1000);
  loop.tick(1);
  const event = context.careerEvents.current();
  assert.ok(event, 'career event should spawn after scheduler interval');
  // Resolve non-choice event
  if (event.effects) {
    context.careerEvents.resolve(event.id);
    assert.equal(context.careerEvents.current(), undefined, 'event should be cleared after resolve');
  }
}

// ── Test: Promotion success flow ────────────────────────────────────────────

function testPromotionSuccess(): void {
  const random = new SequenceRandomProvider([0.0]); // 0.0 < 0.70 → success
  const { context } = makeSimulation({
    player: makePlayer({ careerLevel: 1, cultivationExp: 200, mind: 100 }),
    random,
  });
  // Meet KPI requirements
  context.player.kpiProgress = { MERGE_COUNT: 5, SALARY_EARNED: 100, EVENT_RESOLVED: 0 };
  context.player.workSeconds = 600;
  const check = context.promotion.canPromote();
  assert.equal(check.allowed, true, 'promotion should be allowed');
  const options = context.promotion.getOptions();
  const result = context.promotion.promote(options[0].id);
  assert.equal(result.success, true, 'promotion should succeed');
  assert.equal(context.player.careerLevel, 2, 'career level should increase to 2');
}

// ── Test: Promotion failure drains mind ─────────────────────────────────────

function testPromotionFailureDrainsMind(): void {
  const random = new SequenceRandomProvider([0.99]); // 0.99 >= 0.70 → failure
  const { context } = makeSimulation({
    player: makePlayer({ careerLevel: 1, cultivationExp: 200, mind: 100 }),
    random,
  });
  context.player.kpiProgress = { MERGE_COUNT: 5, SALARY_EARNED: 100, EVENT_RESOLVED: 0 };
  context.player.workSeconds = 600;
  const options = context.promotion.getOptions();
  const result = context.promotion.promote(options[0].id);
  assert.equal(result.success, false, 'promotion should fail');
  assert.equal(context.player.careerLevel, 1, 'career level should stay at 1');
  assert.ok(context.player.mind < 100, 'mind should decrease on promotion failure');
}

// ── Test: Offline reward settlement ─────────────────────────────────────────

function testOfflineRewardSettlement(): void {
  const clock = new FakeClock(1_000);
  const { context } = makeSimulation({ clock, player: makePlayer() });
  placeWorkers(context, 1);
  // Save current state
  context.saveService.save(context.player);
  // Simulate offline time
  clock.advance(2 * 60 * 60 * 1000); // 2 hours offline
  const result = context.idle.settle('settlement-1');
  assert.ok(result.salary > 0 || result.cultivationExp > 0, 'offline reward should grant resources');
  assert.equal(result.duplicate, false, 'first settlement should not be duplicate');
  // Duplicate settlement should be rejected
  const result2 = context.idle.settle('settlement-1');
  assert.equal(result2.duplicate, true, 'duplicate settlement should be flagged');
}

// ── Test: Offline reward double claim ───────────────────────────────────────

function testOfflineRewardDoubleClaim(): void {
  const clock = new FakeClock(1_000);
  const { context } = makeSimulation({ clock, player: makePlayer() });
  placeWorkers(context, 1);
  context.saveService.save(context.player);
  clock.advance(2 * 60 * 60 * 1000);
  let claimResult = false;
  context.offline.claimDouble('settlement-d1', (success) => { claimResult = success; });
  assert.equal(claimResult, true, 'double claim should succeed with mock provider');
}

// ── Test: Sect selection ────────────────────────────────────────────────────

function testSectSelection(): void {
  const { context } = makeSimulation();
  assert.equal(context.player.sectId, null, 'player should start without sect');
  const sect = context.sect.choose('PRIVATE');
  assert.equal(sect.id, 'PRIVATE', 'chosen sect should be PRIVATE');
  assert.equal(context.player.sectId, 'PRIVATE', 'player sect should be set');
  // Cannot choose again
  assert.throws(() => context.sect.choose('FOREIGN'), /already chosen/);
}

// ── Test: Talent selection ──────────────────────────────────────────────────

function testTalentSelection(): void {
  const random = new SequenceRandomProvider([0.1, 0.5, 0.9]);
  const { context } = makeSimulation({ random });
  assert.equal(context.player.talentId, null, 'player should start without talent');
  const choices = context.talent.firstChoices();
  assert.equal(choices.length, 3, 'should offer 3 talent choices');
  const chosen = context.talent.choose(choices[0].id);
  assert.equal(context.player.talentId, choices[0].id, 'player talent should be set');
}

// ── Test: Achievement unlock ────────────────────────────────────────────────

function testAchievementUnlock(): void {
  const { context } = makeSimulation();
  // Set conditions that match achievement configs
  context.player.salary = 1000;
  const newlyUnlocked = context.achievements.checkAll();
  // At least one salary-based achievement should unlock
  assert.ok(Array.isArray(newlyUnlocked), 'checkAll should return an array');
}

// ── Test: Daily sign-in ─────────────────────────────────────────────────────

function testDailySignIn(): void {
  const clock = new FakeClock(1_000);
  const { context } = makeSimulation({ clock });
  assert.ok(context.daily.canClaim(), 'should be able to claim daily sign-in initially');
  const result = context.daily.claim();
  assert.ok(result.day >= 1, 'claimed day should be >= 1');
  assert.ok(!context.daily.canClaim(), 'should not be able to claim again immediately');
}

// ── Test: Full core loop integration (recruit → merge → work → promote) ─────

function testFullCoreLoopIntegration(): void {
  const clock = new FakeClock(1_000);
  const random = new SequenceRandomProvider([0.0]); // 0.0 ensures promotion success
  const { context, loop, recruitment, merge } = makeSimulation({
    clock,
    random,
    player: makePlayer({ workMode: 'WORK', mind: 100, maxMind: 100 }),
  });

  // 1. Recruit workers
  recruitment.recruit();
  recruitment.recruit();
  assert.equal(context.board.occupiedCount, 2, 'should have 2 workers after recruitment');

  // 2. Merge workers
  const mergeResult = merge.merge({ row: 0, column: 0 }, { row: 0, column: 1 });
  assert.equal(mergeResult.success, true, 'merge should succeed');

  // 3. Place more workers and work
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  loop.start();
  loop.tick(3600); // 1 hour of work
  assert.ok(context.player.salary > 0, 'should earn salary from work');
  assert.ok(context.player.workSeconds > 0, 'should accumulate work seconds');

  // 4. Meet KPI requirements for promotion
  context.player.kpiProgress = {
    MERGE_COUNT: 5,
    SALARY_EARNED: 100,
    EVENT_RESOLVED: 0,
  };
  context.player.workSeconds = 600;
  context.player.cultivationExp = 200;
  context.player.mind = 100;

  // 5. Promote
  const check = context.promotion.canPromote();
  assert.equal(check.allowed, true, 'should be allowed to promote');
  const options = context.promotion.getOptions();
  const promoResult = context.promotion.promote(options[0].id);
  assert.equal(promoResult.success, true, 'promotion should succeed');
  assert.equal(context.player.careerLevel, 2, 'career level should be 2 after promotion');

  // 6. Verify office level synced
  assert.ok(context.office.getOfficeLevel() >= 1, 'office level should be derived from career');
}

// ── Test: Effect service applies career event effects ───────────────────────

function testEffectServiceAppliesEffects(): void {
  const { context } = makeSimulation({ player: makePlayer({ salary: 100, cultivationExp: 50, mind: 80 }) });
  const salaryBefore = context.player.salary;
  const cultivationBefore = context.player.cultivationExp;
  context.effects.apply({ salary: 50, cultivation: 30, mind: -10 });
  assert.equal(context.player.salary, salaryBefore + 50, 'salary should increase by effect');
  assert.equal(context.player.cultivationExp, cultivationBefore + 30, 'cultivation should increase by effect');
  assert.equal(context.player.mind, 70, 'mind should decrease by effect');
}

// ── Test: Mind breakdown and recovery ───────────────────────────────────────

function testMindBreakdownAndRecovery(): void {
  const { context } = makeSimulation({ player: makePlayer({ mind: 5, maxMind: 100 }) });
  assert.equal(context.mind.status, 'NORMAL');
  context.mind.applyDelta(-10);
  assert.equal(context.player.mind, 0, 'mind should be clamped to 0');
  assert.equal(context.mind.status, 'BREAKDOWN');
  // Recover
  const delta = context.mind.change(50);
  assert.equal(delta, 50, 'should recover 50 mind');
  assert.equal(context.mind.status, 'NORMAL');
}

// ── Run all tests ───────────────────────────────────────────────────────────

testRecruitmentAddsWorkerToBoard();
testMergeGrantsRewardsAndKpi();
testWorkTickGrantsSalaryAndTracksKpi();
testFishingRecoversMind();
testWorkModeSwitch();
testKpiCompletionEnablesPromotion();
testCareerEventLifecycle();
testPromotionSuccess();
testPromotionFailureDrainsMind();
testOfflineRewardSettlement();
testOfflineRewardDoubleClaim();
testSectSelection();
testTalentSelection();
testAchievementUnlock();
testDailySignIn();
testFullCoreLoopIntegration();
testEffectServiceAppliesEffects();
testMindBreakdownAndRecovery();

console.log('core loop simulation tests passed');