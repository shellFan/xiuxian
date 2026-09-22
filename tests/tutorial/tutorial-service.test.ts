import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { FakeClock } from '../../assets/scripts/core/clock';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import type { StorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveService } from '../../assets/scripts/services/save-service';
import { WorkService } from '../../assets/scripts/services/work-service';

function makeContext(player = new PlayerData()): { context: GameContext; clock: FakeClock } {
  const clock = new FakeClock(1_000);
  return {
    context: new GameContext({ player, storage: new MemoryStorageAdapter(), clock, careerEventClock: clock }),
    clock,
  };
}

function testNewPlayerStartsVersionedWelcomeGuide(): void {
  const { context } = makeContext();

  assert.deepEqual(context.tutorial.getSteps(), [
    'WELCOME',
    'FIRST_WORK',
    'FIRST_FISH',
    'FIRST_CULTIVATE',
    'FIRST_TASK',
  ]);
  assert.equal(context.tutorial.currentStep(), 'WELCOME');
  assert.equal(context.tutorial.currentStepIndex(), 0);
  assert.equal(context.player.tutorialVersion, 2);
  assert.equal(context.player.tutorialStartedAt, 1_000);
}

function testGuidesAdvanceAfterTheirAction(): void {
  const { context } = makeContext();

  context.tutorial.advance();
  assert.equal(context.tutorial.currentStep(), 'FIRST_WORK');

  context.player.workMode = 'WORK';
  context.player.workSeconds = 1;
  assert.equal(context.tutorial.checkAutoAdvance(), true);
  assert.equal(context.tutorial.currentStep(), 'FIRST_FISH');

  context.player.workMode = 'FISHING';
  context.player.fishingSeconds = 1;
  assert.equal(context.tutorial.checkAutoAdvance(), true);
  assert.equal(context.tutorial.currentStep(), 'FIRST_CULTIVATE');

  context.player.cultivatingSeconds = 1;
  assert.equal(context.tutorial.checkAutoAdvance(), true);
  assert.equal(context.tutorial.currentStep(), 'FIRST_TASK');

  context.player.activeTasks.push({
    taskId: 'first-task',
    taskType: 'WORK',
    name: '首个任务',
    description: '完成首个任务',
    durationSeconds: 1,
    startedAt: 1_000,
    rewardSalary: 1,
    rewardCultivation: 0,
    rewardSpiritStones: 0,
    completed: false,
    claimed: false,
  });
  assert.equal(context.tutorial.checkAutoAdvance(), true);
  assert.equal(context.tutorial.currentStep(), 'NONE');
  assert.equal(context.tutorial.isCompleted(), true);
}

function testAlternateActionDoesNotLockTheGuide(): void {
  const { context, clock } = makeContext();
  context.tutorial.advance();

  context.player.workMode = 'FISHING';
  context.player.fishingSeconds = 10;
  assert.equal(context.tutorial.checkAutoAdvance(), false);
  assert.equal(context.player.fishingSeconds, 10);
  assert.equal(context.tutorial.currentStep(), 'FIRST_WORK');

  clock.advance(30_000);
  assert.equal(context.tutorial.checkAutoAdvance(), true);
  assert.equal(context.tutorial.currentStep(), 'FIRST_FISH');
}

function testEveryHintExpiresAfterThirtyGameSeconds(): void {
  const { context, clock } = makeContext();

  for (const expected of ['WELCOME', 'FIRST_WORK', 'FIRST_FISH', 'FIRST_CULTIVATE', 'FIRST_TASK'] as const) {
    assert.equal(context.tutorial.currentStep(), expected);
    clock.advance(29_999);
    assert.equal(context.tutorial.checkAutoAdvance(), false);
    clock.advance(1);
    assert.equal(context.tutorial.checkAutoAdvance(), true);
  }

  assert.equal(context.tutorial.currentStep(), 'NONE');
  assert.equal(context.tutorial.isCompleted(), true);
}

function testSkipIsPersistentAndIdempotent(): void {
  const player = new PlayerData({ tutorialStep: 'FIRST_FISH', tutorialVersion: 2, tutorialStartedAt: 500 });
  const { context } = makeContext(player);
  const events: Array<{ step: string; completed: boolean }> = [];
  context.events.on('tutorialStepChanged', (event) => events.push(event));

  context.tutorial.complete();
  context.tutorial.complete();
  context.player.tutorialStep = 'WELCOME';

  assert.equal(context.player.tutorialCompleted, true);
  assert.equal(context.player.tutorialVersion, 2);
  assert.equal(context.tutorial.currentStep(), 'NONE');
  assert.deepEqual(events, [{ step: 'NONE', completed: true }]);
}

function testInvalidDirectPlayerStateIsNormalizedOnce(): void {
  const player = new PlayerData({ tutorialStep: 'FIRST_MERGE', tutorialStartedAt: Number.NaN });
  const { context, clock } = makeContext(player);

  assert.equal(context.tutorial.currentStep(), 'WELCOME');
  assert.equal(player.tutorialStartedAt, 1_000);
  clock.advance(5_000);
  assert.equal(context.tutorial.currentStep(), 'WELCOME');
  assert.equal(player.tutorialStartedAt, 1_000);
}

function testWorkRollbackRestoresEveryTutorialFieldExactly(): void {
  const durable = new MemoryStorageAdapter();
  const baselinePlayer = new PlayerData({
    tutorialVersion: 2,
    tutorialStartedAt: 321,
    tutorialStep: 'FIRST_FISH',
    tutorialCompleted: false,
  });
  new SaveService(durable, 'game-save', () => 1_000).save(baselinePlayer);
  const failingStorage: StorageAdapter = {
    getItem: (key) => durable.getItem(key),
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => undefined,
  };
  const clock = new FakeClock(1_000);
  const context = new GameContext({ player: baselinePlayer, saveService: new SaveService(failingStorage, 'game-save', clock), clock });
  const work = new WorkService(context);
  context.player.tutorialVersion = 99;
  context.player.tutorialStartedAt = 999;
  context.player.tutorialStep = 'WELCOME';
  context.player.tutorialCompleted = true;

  assert.throws(() => work.save(), /quota exceeded/);
  assert.deepEqual(
    {
      tutorialVersion: context.player.tutorialVersion,
      tutorialStartedAt: context.player.tutorialStartedAt,
      tutorialStep: context.player.tutorialStep,
      tutorialCompleted: context.player.tutorialCompleted,
    },
    {
      tutorialVersion: 2,
      tutorialStartedAt: 321,
      tutorialStep: 'FIRST_FISH',
      tutorialCompleted: false,
    },
  );
}

testNewPlayerStartsVersionedWelcomeGuide();
testGuidesAdvanceAfterTheirAction();
testAlternateActionDoesNotLockTheGuide();
testEveryHintExpiresAfterThirtyGameSeconds();
testSkipIsPersistentAndIdempotent();
testInvalidDirectPlayerStateIsNormalizedOnce();
testWorkRollbackRestoresEveryTutorialFieldExactly();

console.log('tutorial service tests passed');
