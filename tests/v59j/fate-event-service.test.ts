import assert from 'node:assert/strict';
import { GameContext } from '../../assets/scripts/core/game-context';
import { FakeClock } from '../../assets/scripts/core/clock';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

const NOW = 1_800_000_000_000;

function createContext() {
  return new GameContext({
    board: null,
    player: new PlayerData({ salary: 1_200, cultivationExp: 77, careerLevel: 3, mind: 70, spiritStones: 18, profession: 'QA', characterSetupStatus: 'BACKFILL_REQUIRED', materials: { mat_page: 2 } }),
    storage: new MemoryStorageAdapter(),
    clock: new FakeClock(NOW),
    homeArenaSeed: 5917,
  });
}

function startAtFirstFateEvent(context: ReturnType<typeof createContext>) {
  context.fateEvents.beginRun(73);
  const queued = context.fateEvents.triggerMilestone('arena:1:2');
  assert.equal(queued.length, 1);
  const event = context.fateEvents.currentEvent();
  assert.ok(event);
  return event;
}

function testRunAndEventChoiceUseOneAuthoritativeSave(): void {
  const context = createContext();
  const event = startAtFirstFateEvent(context);
  const option = context.fateEvents.visibleOptions()[0];
  const result = context.fateEvents.choose(event.id, option.id);
  assert.equal(context.player.fateRun?.eventHistory.length, 1);
  assert.equal(context.player.fateRun?.eventHistory[0].eventId, event.id);
  assert.ok(context.player.fateRun?.flags[event.id + '_help']);
  assert.equal(context.player.mind, 72);
  assert.equal(context.player.relationships.INTERN, 6);
  assert.equal(context.fateEvents.currentEvent()?.id, 'intern_s2');
  assert.deepEqual(context.player.fateRun?.firedEventIds, ['intern_s1', 'intern_s2']);
  assert.equal(result.outcomeText.includes('协作奏效'), true);
  assert.equal(result.outcomeText.includes('INTERN关系 +6'), true);
  const persisted = JSON.parse((context.storage as MemoryStorageAdapter).getItem('game-save') ?? '{}') as Record<string, unknown>;
  assert.equal((persisted.fateRun as Record<string, unknown>).eventQueue instanceof Array, true);
  assert.deepEqual((persisted.fateRun as Record<string, unknown>).firedEventIds, ['intern_s1', 'intern_s2']);
}

function testDuplicateAndOutOfOrderChoicesCannotResolve(): void {
  const context = createContext();
  const event = startAtFirstFateEvent(context);
  const option = context.fateEvents.visibleOptions()[0];
  context.fateEvents.choose(event.id, option.id);
  const after = context.player.toSaveData();
  assert.throws(() => context.fateEvents.choose(event.id, option.id), /not current/i);
  assert.deepEqual(context.player.toSaveData(), after);
}

function testFailedPersistenceRollsBackTheWholeChoice(): void {
  const context = createContext();
  const event = startAtFirstFateEvent(context);
  const option = context.fateEvents.visibleOptions()[1];
  const before = context.player.toSaveData();
  const save = context.saveService.save.bind(context.saveService);
  context.saveService.save = () => { throw new Error('disk full'); };
  assert.throws(() => context.fateEvents.choose(event.id, option.id), /disk full/);
  assert.deepEqual(context.player.toSaveData(), before);
  context.saveService.save = save;
}

function testSameSeedAndMilestonesProduceSameChoiceResult(): void {
  const first = createContext();
  const second = createContext();
  const firstEvent = startAtFirstFateEvent(first);
  const secondEvent = startAtFirstFateEvent(second);
  assert.equal(firstEvent.id, secondEvent.id);
  const option = first.fateEvents.visibleOptions()[2];
  const left = first.fateEvents.choose(firstEvent.id, option.id);
  const right = second.fateEvents.choose(secondEvent.id, option.id);
  assert.equal(left.success, right.success);
  assert.equal(left.outcomeText, right.outcomeText);
  assert.deepEqual(first.player.fateRun, second.player.fateRun);
}

function testLiveHomeArenaProgressAutomaticallyQueuesTheFirstStory(): void {
  const clock = new FakeClock(NOW);
  const context = new GameContext({
    board: null,
    player: new PlayerData({ profession: 'QA', characterSetupStatus: 'BACKFILL_REQUIRED' }),
    storage: new MemoryStorageAdapter(),
    clock,
    homeArenaSeed: 5917,
  });
  context.homeArena.setActive(true);
  for (let index = 0; index < 40 && !context.fateEvents.currentEvent(); index += 1) {
    clock.advance(60);
    const view = context.homeArena.view();
    const result = context.homeArena.attack(view.enemy.id, `arena-milestone-${index}`);
    assert.equal(result.ok, true);
  }
  assert.equal(context.fateEvents.currentEvent()?.id, 'intern_s1');
  assert.equal(context.player.fateRun?.eventQueue.length, 1);
}

function testAStoryChoiceChangesWhichLaterBranchIsAvailable(): void {
  const context = createContext();
  let event = startAtFirstFateEvent(context);
  context.fateEvents.choose(event.id, 'HELP');
  event = context.fateEvents.currentEvent()!;
  assert.equal(event.id, 'intern_s2');
  context.fateEvents.choose(event.id, 'NEGOTIATE');
  event = context.fateEvents.currentEvent()!;
  assert.equal(event.id, 'intern_s3');
  assert.deepEqual(context.fateEvents.visibleOptions().map((option) => option.id), ['NEGOTIATE']);
}

function testStoryRewardChangesRealCombatCalculationsUntilGameClockExpiry(): void {
  const clock = new FakeClock(NOW);
  const context = new GameContext({
    board: null,
    player: new PlayerData({ profession: 'QA', characterSetupStatus: 'BACKFILL_REQUIRED' }),
    storage: new MemoryStorageAdapter(),
    clock,
    homeArenaSeed: 5917,
  });
  const base = context.battle.homeAttackProfile(0);
  startAtFirstFateEvent(context);
  context.fateEvents.choose('intern_s1', 'HELP');
  const buffed = context.battle.homeAttackProfile(0);
  assert.ok(buffed.attack > base.attack);
  assert.ok(buffed.critChance > base.critChance);
  assert.equal(context.fateEvents.combatModifiers().autoIntervalMultiplier, 0.9);
  clock.advance(120_001);
  const expired = context.battle.homeAttackProfile(0);
  assert.equal(expired.attack, base.attack);
  assert.equal(context.fateEvents.combatModifiers().autoIntervalMultiplier, 1);
}

function actualV3FirstHitDamage(withFateBuff: boolean): number {
  const clock = new FakeClock(NOW);
  const context = new GameContext({
    board: null,
    player: new PlayerData({ profession: 'QA', characterSetupStatus: 'BACKFILL_REQUIRED' }),
    storage: new MemoryStorageAdapter(),
    clock,
    battleRng: () => 0.99,
  });
  context.gameDay.ensureStarted();
  if (withFateBuff) {
    context.fateEvents.beginRun(73);
    context.fateEvents.triggerMilestone('arena:1:2');
    context.fateEvents.choose('intern_s1', 'HELP');
  }
  const run = context.battle.start('INCIDENT', 'build_java');
  const target = run.enemies[0];
  assert.ok(target);
  const hpBefore = target.hp;
  context.battle.tick(1);
  const current = context.battle.current();
  const hpAfter = current?.enemies.find((enemy) => enemy.uid === target.uid)?.hp;
  assert.ok(hpAfter !== undefined && hpAfter < hpBefore);
  const dealt = hpBefore - hpAfter;
  assert.ok(dealt > 0);
  assert.ok(current?.log.some((line) => line.includes('伤害')));
  return dealt;
}

function testFateCombatBuffChangesActualV3BattleDamage(): void {
  const baselineDamage = actualV3FirstHitDamage(false);
  const fateBuffedDamage = actualV3FirstHitDamage(true);
  assert.ok(fateBuffedDamage > baselineDamage, `fate buff should raise actual V3 damage (${baselineDamage} -> ${fateBuffedDamage})`);
}

function testCoffeeFateChoiceChargesTheExistingWalletExactlyOnce(): void {
  const clock = new FakeClock(NOW);
  const context = new GameContext({
    board: null,
    player: new PlayerData({ salary: 100, profession: 'QA', characterSetupStatus: 'BACKFILL_REQUIRED' }),
    storage: new MemoryStorageAdapter(),
    clock,
    homeArenaSeed: 5917,
  });
  context.gameDay.ensureStarted();
  context.fateEvents.beginRun(73);
  context.fateEvents.triggerMilestone('arena:1:2');
  context.fateEvents.choose('intern_s1', 'HELP');
  context.fateEvents.choose('intern_s2', 'HELP');
  context.fateEvents.choose('intern_s3', 'HELP');
  const coffee = context.fateEvents.currentEvent();
  assert.equal(coffee?.id, 'coffee_event');
  const before = context.player.salary;
  context.fateEvents.choose('coffee_event', 'HELP');
  assert.equal(context.player.salary, before - 18);
  assert.equal(context.home.lifeOptions().find((option) => option.kind === 'COFFEE')?.used, 1);
  assert.throws(() => context.fateEvents.choose('coffee_event', 'HELP'), /not current/i);
  assert.equal(context.player.salary, before - 18);
}

testRunAndEventChoiceUseOneAuthoritativeSave();
testDuplicateAndOutOfOrderChoicesCannotResolve();
testFailedPersistenceRollsBackTheWholeChoice();
testSameSeedAndMilestonesProduceSameChoiceResult();
testLiveHomeArenaProgressAutomaticallyQueuesTheFirstStory();
testAStoryChoiceChangesWhichLaterBranchIsAvailable();
testStoryRewardChangesRealCombatCalculationsUntilGameClockExpiry();
testFateCombatBuffChangesActualV3BattleDamage();
testCoffeeFateChoiceChargesTheExistingWalletExactlyOnce();
console.log('v59j fate event service tests passed');
