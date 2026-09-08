import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';
import { SequenceRandomProvider } from '../../assets/scripts/core/random-provider';
import { GameLoopService } from '../../assets/scripts/services/game-loop-service';

function makeContext(player?: PlayerData): GameContext {
  const clock = new FakeClock(1_000);
  const random = new SequenceRandomProvider([0.5]);
  return new GameContext({
    player: player ?? new PlayerData({ mind: 100, maxMind: 100 }),
    storage: new MemoryStorageAdapter(),
    clock,
    careerEventClock: clock,
    randomProvider: random,
  });
}

// ── Test: Initial tutorial step ──────────────────────────────────────────────

function testInitialStep(): void {
  const context = makeContext();
  assert.equal(context.tutorial.currentStep(), 'FIRST_RECRUIT');
  assert.equal(context.tutorial.isCompleted(), false);
  assert.equal(context.tutorial.currentStepIndex(), 0);
}

// ── Test: Advance through all steps ──────────────────────────────────────────

function testAdvanceThroughAllSteps(): void {
  const context = makeContext();
  const steps = context.tutorial.getSteps();
  assert.equal(steps.length, 6);

  // FIRST_RECRUIT → SECOND_RECRUIT
  context.tutorial.advance();
  assert.equal(context.tutorial.currentStep(), 'SECOND_RECRUIT');

  // SECOND_RECRUIT → FIRST_MERGE
  context.tutorial.advance();
  assert.equal(context.tutorial.currentStep(), 'FIRST_MERGE');

  // FIRST_MERGE → START_WORK
  context.tutorial.advance();
  assert.equal(context.tutorial.currentStep(), 'START_WORK');

  // START_WORK → CHECK_KPI
  context.tutorial.advance();
  assert.equal(context.tutorial.currentStep(), 'CHECK_KPI');

  // CHECK_KPI → FIRST_PROMOTION (last step → completes)
  context.tutorial.advance();
  assert.equal(context.tutorial.currentStep(), 'FIRST_PROMOTION');

  // FIRST_PROMOTION → complete
  context.tutorial.advance();
  assert.equal(context.tutorial.currentStep(), 'NONE');
  assert.equal(context.tutorial.isCompleted(), true);
  assert.equal(context.tutorial.currentStepIndex(), -1);
}

// ── Test: Complete skips remaining steps ─────────────────────────────────────

function testCompleteSkipsRemaining(): void {
  const context = makeContext();
  assert.equal(context.tutorial.currentStep(), 'FIRST_RECRUIT');
  context.tutorial.complete();
  assert.equal(context.tutorial.isCompleted(), true);
  assert.equal(context.tutorial.currentStep(), 'NONE');
}

// ── Test: Complete is idempotent ─────────────────────────────────────────────

function testCompleteIsIdempotent(): void {
  const context = makeContext();
  context.tutorial.complete();
  context.tutorial.complete(); // should not throw
  assert.equal(context.tutorial.isCompleted(), true);
}

// ── Test: Advance after complete is no-op ────────────────────────────────────

function testAdvanceAfterCompleteIsNoOp(): void {
  const context = makeContext();
  context.tutorial.complete();
  context.tutorial.advance(); // should not throw
  assert.equal(context.tutorial.currentStep(), 'NONE');
}

// ── Test: Auto-advance FIRST_RECRUIT when careerLevel >= 1 (PC V1) ────────────

function testAutoAdvanceFirstRecruit(): void {
  // PC V1: FIRST_RECRUIT condition is careerLevel >= 1 (not board placement).
  // Default player starts at careerLevel=1, so condition is immediately met.
  const context = makeContext();
  assert.equal(context.tutorial.currentStep(), 'FIRST_RECRUIT');
  assert.equal(context.tutorial.isConditionMet('FIRST_RECRUIT'), true);
  const advanced = context.tutorial.checkAutoAdvance();
  assert.equal(advanced, true);
  assert.equal(context.tutorial.currentStep(), 'SECOND_RECRUIT');
}

// ── Test: Auto-advance SECOND_RECRUIT when workSeconds > 0 (PC V1) ────────────

function testAutoAdvanceSecondRecruit(): void {
  const context = makeContext();
  // PC V1: SECOND_RECRUIT condition is workSeconds > 0 (not 2 workers on board)
  context.player.careerLevel = 1; // meet FIRST_RECRUIT condition
  context.tutorial.checkAutoAdvance(); // FIRST_RECRUIT → SECOND_RECRUIT
  assert.equal(context.tutorial.currentStep(), 'SECOND_RECRUIT');
  assert.equal(context.tutorial.isConditionMet('SECOND_RECRUIT'), false);
  context.player.workSeconds = 1;
  assert.equal(context.tutorial.isConditionMet('SECOND_RECRUIT'), true);
  const advanced = context.tutorial.checkAutoAdvance();
  assert.equal(advanced, true);
  assert.equal(context.tutorial.currentStep(), 'FIRST_MERGE');
}

// ── Test: Auto-advance FIRST_MERGE when cultivationExp >= 10 (PC V1) ──────────

function testAutoAdvanceFirstMerge(): void {
  const context = makeContext();
  context.player.tutorialStep = 'FIRST_MERGE';
  assert.equal(context.tutorial.isConditionMet('FIRST_MERGE'), false);
  // PC V1: FIRST_MERGE condition is cultivationExp >= 10 (not maxWorkerLevel >= 2)
  context.player.cultivationExp = 10;
  assert.equal(context.tutorial.isConditionMet('FIRST_MERGE'), true);
  const advanced = context.tutorial.checkAutoAdvance();
  assert.equal(advanced, true);
  assert.equal(context.tutorial.currentStep(), 'START_WORK');
}

// ── Test: Auto-advance START_WORK when working ───────────────────────────────

function testAutoAdvanceStartWork(): void {
  const context = makeContext();
  context.player.tutorialStep = 'START_WORK';
  context.player.workMode = 'FISHING';
  assert.equal(context.tutorial.isConditionMet('START_WORK'), false);
  context.player.workMode = 'WORK';
  context.player.workSeconds = 0;
  assert.equal(context.tutorial.isConditionMet('START_WORK'), false);
  context.player.workSeconds = 60;
  assert.equal(context.tutorial.isConditionMet('START_WORK'), true);
  const advanced = context.tutorial.checkAutoAdvance();
  assert.equal(advanced, true);
  assert.equal(context.tutorial.currentStep(), 'CHECK_KPI');
}

// ── Test: Auto-advance CHECK_KPI when KPI completed ─────────────────────────

function testAutoAdvanceCheckKpi(): void {
  const context = makeContext();
  context.player.tutorialStep = 'CHECK_KPI';
  context.player.careerLevel = 1;
  context.player.kpiProgress = { MERGE_COUNT: 0, SALARY_EARNED: 0, EVENT_RESOLVED: 0 };
  assert.equal(context.tutorial.isConditionMet('CHECK_KPI'), false);
  // Meet KPI requirements for level 1: MERGE_COUNT=3, WORK_SECONDS=300, CULTIVATION=50
  context.player.kpiProgress = { MERGE_COUNT: 5, SALARY_EARNED: 100, EVENT_RESOLVED: 0 };
  context.player.workSeconds = 600;
  context.player.cultivationExp = 200;
  assert.equal(context.tutorial.isConditionMet('CHECK_KPI'), true);
  const advanced = context.tutorial.checkAutoAdvance();
  assert.equal(advanced, true);
  assert.equal(context.tutorial.currentStep(), 'FIRST_PROMOTION');
}

// ── Test: Auto-advance FIRST_PROMOTION when careerLevel >= 2 ─────────────────

function testAutoAdvanceFirstPromotion(): void {
  const context = makeContext();
  context.player.tutorialStep = 'FIRST_PROMOTION';
  context.player.careerLevel = 1;
  assert.equal(context.tutorial.isConditionMet('FIRST_PROMOTION'), false);
  context.player.careerLevel = 2;
  assert.equal(context.tutorial.isConditionMet('FIRST_PROMOTION'), true);
  const advanced = context.tutorial.checkAutoAdvance();
  assert.equal(advanced, true);
  assert.equal(context.tutorial.isCompleted(), true);
  assert.equal(context.tutorial.currentStep(), 'NONE');
}

// ── Test: Full tutorial flow via game loop (PC V1) ───────────────────────────

function testFullTutorialFlowViaGameLoop(): void {
  const clock = new FakeClock(1_000);
  const random = new SequenceRandomProvider([0.0]); // 0.0 ensures promotion success
  const player = new PlayerData({ mind: 100, maxMind: 100, workMode: 'WORK' });
  const context = new GameContext({
    player,
    storage: new MemoryStorageAdapter(),
    clock,
    careerEventClock: clock,
    randomProvider: random,
  });
  const loop = new GameLoopService(context, { autoSaveIntervalSeconds: 0 });

  // Step 1: FIRST_RECRUIT — PC V1: careerLevel >= 1
  assert.equal(context.tutorial.currentStep(), 'FIRST_RECRUIT');
  context.player.careerLevel = 1;
  context.tutorial.checkAutoAdvance();
  assert.equal(context.tutorial.currentStep(), 'SECOND_RECRUIT');

  // Step 2: SECOND_RECRUIT — PC V1: workSeconds > 0
  context.player.workSeconds = 1;
  context.tutorial.checkAutoAdvance();
  assert.equal(context.tutorial.currentStep(), 'FIRST_MERGE');

  // Step 3: FIRST_MERGE — PC V1: cultivationExp >= 10
  context.player.cultivationExp = 10;
  context.tutorial.checkAutoAdvance();
  assert.equal(context.tutorial.currentStep(), 'START_WORK');

  // Step 4: START_WORK (already in WORK mode)
  loop.start();
  loop.tick(60);
  context.tutorial.checkAutoAdvance();
  assert.equal(context.tutorial.currentStep(), 'CHECK_KPI');

  // Step 5: CHECK_KPI - meet KPI requirements
  context.player.kpiProgress = { MERGE_COUNT: 5, SALARY_EARNED: 100, EVENT_RESOLVED: 0 };
  context.player.workSeconds = 600;
  context.player.cultivationExp = 200;
  context.tutorial.checkAutoAdvance();
  assert.equal(context.tutorial.currentStep(), 'FIRST_PROMOTION');

  // Step 6: FIRST_PROMOTION
  const options = context.promotion.getOptions();
  context.promotion.promote(options[0].id);
  context.tutorial.checkAutoAdvance();
  assert.equal(context.tutorial.isCompleted(), true);
  assert.equal(context.tutorial.currentStep(), 'NONE');
}

// ── Test: Tutorial event emission ────────────────────────────────────────────

function testTutorialEventEmission(): void {
  const context = makeContext();
  const events: Array<{ step: string; completed: boolean }> = [];
  context.events.on('tutorialStepChanged', (e) => events.push(e));
  context.tutorial.advance();
  assert.equal(events.length, 1);
  assert.equal(events[0].step, 'SECOND_RECRUIT');
  assert.equal(events[0].completed, false);
  context.tutorial.complete();
  assert.equal(events.length, 2);
  assert.equal(events[1].step, 'NONE');
  assert.equal(events[1].completed, true);
}

// ── Run all tests ────────────────────────────────────────────────────────────

testInitialStep();
testAdvanceThroughAllSteps();
testCompleteSkipsRemaining();
testCompleteIsIdempotent();
testAdvanceAfterCompleteIsNoOp();
testAutoAdvanceFirstRecruit();
testAutoAdvanceSecondRecruit();
testAutoAdvanceFirstMerge();
testAutoAdvanceStartWork();
testAutoAdvanceCheckKpi();
testAutoAdvanceFirstPromotion();
testFullTutorialFlowViaGameLoop();
testTutorialEventEmission();

console.log('tutorial service tests passed');