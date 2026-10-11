import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData, type PlayerDataOptions } from '../../assets/scripts/model/player-data';
import { CultivationService } from '../../assets/scripts/services/cultivation-service';
import { WorkService } from '../../assets/scripts/services/work-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import type { ActiveTaskState } from '../../assets/scripts/model/save-data';
import type { CharacterStats, DestinyId, StatKey } from '../../assets/scripts/v59/character-rules';

type HookId =
  | 'CULTIVATION_REWARD'
  | 'FATIGUE_GAIN'
  | 'TASK_PROGRESS'
  | 'MIND_COST'
  | 'PROFESSION_GROWTH'
  | 'WORK_MIND_COST'
  | 'REGULAR_WORK_OUTPUT'
  | 'RESPONSIBILITY_SUCCESS_GROWTH'
  | 'TECHNICAL_TASK_PROGRESS'
  | 'SOLO_TASK_PROGRESS'
  | 'BATTLE_CRIT_CHANCE'
  | 'NPC_ASSIST_CHANCE'
  | 'RELATIONSHIP_GAIN';

interface EffectsModule {
  projectCharacterAttributes(
    record: { readonly innateAttributes?: CharacterStats; readonly earnedAttributeDelta?: Partial<CharacterStats> },
    deltas?: { readonly temporary?: Partial<CharacterStats>; readonly equipment?: Partial<CharacterStats> },
  ): CharacterStats | null;
  characterEffectMultiplier(
    record: { readonly destinyId?: DestinyId; readonly innateAttributes?: CharacterStats; readonly earnedAttributeDelta?: Partial<CharacterStats> },
    hook: HookId,
  ): number;
}

function loadEffects(): EffectsModule {
  try {
    return require('../../assets/scripts/v59/character-attributes') as EffectsModule;
  } catch (error) {
    assert.fail(`character attribute projection module is missing: ${String(error)}`);
  }
}

const effects = loadEffects();
const BASE_STATS: CharacterStats = Object.freeze({ insight: 10, constitution: 10, perception: 10, fortune: 10, willpower: 10 });

function v59Options(destinyId: DestinyId, boosted?: StatKey): PlayerDataOptions {
  return {
    destinyId,
    innateAttributes: boosted ? { ...BASE_STATS, [boosted]: 15 } : BASE_STATS,
    earnedAttributeDelta: {},
    characterSetupStatus: 'COMPLETE',
  };
}

function makeContext(options: PlayerDataOptions = {}): GameContext {
  return new GameContext({
    player: new PlayerData(options),
    storage: new MemoryStorageAdapter(),
    board: null,
    clock: new FakeClock(Date.parse('2026-10-08T10:00:00+08:00')),
    battleRng: () => 0.5,
  });
}

function testProjectionIsImmutableAndComposesLegalDeltas(): void {
  const innate = { ...BASE_STATS };
  const earned = { insight: 2, fortune: 1 };
  const temporary = { insight: 3, willpower: -2 };
  const equipment = { constitution: 4 };
  const projected = effects.projectCharacterAttributes(
    { innateAttributes: innate, earnedAttributeDelta: earned },
    { temporary, equipment },
  );

  assert.deepEqual(projected, { insight: 15, constitution: 14, perception: 10, fortune: 11, willpower: 8 });
  assert.ok(projected && Object.isFrozen(projected), 'projection is immutable');
  temporary.insight = -5;
  assert.equal(innate.insight, 10, 'temporary deltas never mutate innate attributes');
  assert.equal(earned.insight, 2, 'temporary deltas never mutate earned attributes');
  assert.equal(projected?.insight, 15, 'an existing projection does not retain mutable delta references');
  assert.equal(effects.projectCharacterAttributes({}, { temporary: { insight: 3 } }), null, 'missing V5.9 attributes project to no record');
  assert.throws(
    () => effects.projectCharacterAttributes({ innateAttributes: BASE_STATS }, { temporary: { insight: -20 } }),
    /outside supported bounds/,
    'legal deltas must keep the exact projected sum within runtime bounds',
  );
}

function testPureHooksAreBoundedAndRequireACompleteRecord(): void {
  assert.equal(effects.characterEffectMultiplier({}, 'FATIGUE_GAIN'), 1);
  assert.equal(effects.characterEffectMultiplier({ destinyId: 'LABOR_SAINT' }, 'FATIGUE_GAIN'), 1);
  assert.equal(effects.characterEffectMultiplier({ innateAttributes: BASE_STATS }, 'FATIGUE_GAIN'), 1);
  assert.equal(effects.characterEffectMultiplier(v59Options('LABOR_SAINT'), 'FATIGUE_GAIN'), 0.8);
  assert.equal(effects.characterEffectMultiplier(v59Options('KING_OF_GRIND'), 'PROFESSION_GROWTH'), 1.2);
  assert.equal(effects.characterEffectMultiplier(v59Options('KING_OF_GRIND'), 'WORK_MIND_COST'), 1.25);
  assert.equal(effects.characterEffectMultiplier(v59Options('FISHING_IMMORTAL'), 'REGULAR_WORK_OUTPUT'), 0.9);
  assert.equal(effects.characterEffectMultiplier(v59Options('SCAPEGOAT'), 'RESPONSIBILITY_SUCCESS_GROWTH'), 1.5);
  assert.equal(effects.characterEffectMultiplier(v59Options('CODE_SPIRIT'), 'TECHNICAL_TASK_PROGRESS'), 1.1);
  assert.equal(effects.characterEffectMultiplier(v59Options('SOCIAL_FATE'), 'NPC_ASSIST_CHANCE'), 1.15);
  assert.equal(effects.characterEffectMultiplier(v59Options('SOCIAL_FATE'), 'RELATIONSHIP_GAIN'), 1.25);
  assert.equal(effects.characterEffectMultiplier(v59Options('SOCIAL_FATE'), 'SOLO_TASK_PROGRESS'), 0.9);
  assert.ok(effects.characterEffectMultiplier(v59Options('LABOR_SAINT', 'constitution'), 'FATIGUE_GAIN') >= 0.5);
}

function testInsightIncreasesCultivationSettlementWithoutDestinySubstitution(): void {
  const baseContext = makeContext({ mind: 100, lastCultivateTime: 0 });
  const baseService = new CultivationService(baseContext, { cultivationClickReward: 100, clock: new FakeClock(10_000) });
  assert.equal(baseService.cultivate().cultivationExp, 100, 'legacy cultivation reward remains unchanged');

  const boostedContext = makeContext({ ...v59Options('LABOR_SAINT', 'insight'), mind: 100, lastCultivateTime: 0 });
  const boostedService = new CultivationService(boostedContext, { cultivationClickReward: 100, clock: new FakeClock(10_000) });
  assert.equal(boostedService.cultivate().cultivationExp, 110, 'insight owns cultivation growth');
}

function testConstitutionAndLaborSaintReduceFatigueGain(): void {
  const base = makeContext();
  base.fatigue.add('INCIDENT');
  assert.equal(base.player.fatigue, 8, 'legacy fatigue gain remains unchanged');

  const constitution = makeContext(v59Options('CODE_SPIRIT', 'constitution'));
  constitution.fatigue.add('INCIDENT');
  assert.equal(constitution.player.fatigue, 7, 'constitution reduces positive fatigue at settlement');

  const laborSaint = makeContext(v59Options('LABOR_SAINT'));
  laborSaint.fatigue.add('INCIDENT');
  assert.equal(laborSaint.player.fatigue, 6, 'Labor Saint adds fatigue tolerance at the same settlement');
}

function testPerceptionAcceleratesTaskProgress(): void {
  const task = {
    taskId: 'v59-perception', durationSeconds: 100, startedAt: 1_000,
    completed: false, claimed: false,
  } as ActiveTaskState;
  assert.equal(makeContext().taskRuntimeDirector.progress(task, 51_000), 50, 'legacy task progress remains unchanged');
  assert.equal(makeContext(v59Options('LABOR_SAINT', 'perception')).taskRuntimeDirector.progress(task, 51_000), 54);

  const technicalTask = { ...task, taskType: 'WORK' as const };
  assert.equal(makeContext(v59Options('CODE_SPIRIT')).taskRuntimeDirector.progress(technicalTask, 51_000), 55, 'Code Spirit accelerates technical work');
  const nonTechnicalTask = { ...task, taskType: 'CULTIVATION' as const };
  assert.equal(makeContext(v59Options('CODE_SPIRIT')).taskRuntimeDirector.progress(nonTechnicalTask, 51_000), 50, 'Code Spirit leaves nontechnical tasks unchanged');
}

function testWillpowerReducesMindCost(): void {
  const base = makeContext({ mind: 100 });
  assert.equal(base.mind.applyDelta(-20), -20, 'legacy mind cost remains unchanged');
  const boosted = makeContext({ ...v59Options('LABOR_SAINT', 'willpower'), mind: 100 });
  assert.equal(boosted.mind.applyDelta(-20), -18, 'willpower mitigates negative mind settlement');
}

function testKingOfGrindTradesMindForProfessionGrowth(): void {
  const legacy = makeContext();
  legacy.profession.grantExp(10);
  assert.equal(legacy.player.professionExp, 10, 'legacy profession growth remains unchanged');
  legacy.player.workMode = 'WORK';
  legacy.player.mind = 100;
  legacy.gameDay.ensureStarted();
  const legacyWork = new WorkService(legacy, { salaryPerHour: 0, cultivationPerHour: 0, mindPerHour: 20 });
  assert.equal(legacyWork.tick(3_600).mind, -20, 'legacy work mind cost remains unchanged');
  const king = makeContext({ ...v59Options('KING_OF_GRIND'), workMode: 'WORK', mind: 100 });
  king.profession.grantExp(10);
  assert.equal(king.player.professionExp, 12, 'King of Grind grows profession experience faster');
  king.gameDay.ensureStarted();
  const work = new WorkService(king, { salaryPerHour: 0, cultivationPerHour: 0, mindPerHour: 20 });
  assert.equal(work.tick(3_600).mind, -25, 'King of Grind pays an increased work mind cost');
}

function testFishingImmortalTradesRegularWorkOutput(): void {
  const legacyWorkContext = makeContext({ workMode: 'WORK' });
  legacyWorkContext.gameDay.ensureStarted();
  const legacyWork = new WorkService(legacyWorkContext, { salaryPerHour: 100, cultivationPerHour: 0, mindPerHour: 0 });
  assert.equal(legacyWork.tick(7_200).salary, 130, 'legacy work salary remains unchanged');

  const fishingImmortalWorkContext = makeContext({ ...v59Options('FISHING_IMMORTAL'), workMode: 'WORK' });
  fishingImmortalWorkContext.gameDay.ensureStarted();
  const fishingImmortalWork = new WorkService(fishingImmortalWorkContext, { salaryPerHour: 100, cultivationPerHour: 0, mindPerHour: 0 });
  assert.equal(fishingImmortalWork.tick(7_200).salary, 117, 'Fishing Immortal gives up regular work output');

  const fishingModeContext = makeContext({ ...v59Options('FISHING_IMMORTAL'), workMode: 'FISHING', mind: 0 });
  fishingModeContext.gameDay.ensureStarted();
  const fishingMode = new WorkService(fishingModeContext, { salaryPerHour: 0, cultivationPerHour: 0, mindPerHour: 40 });
  assert.equal(fishingMode.tick(3_600).mind, 40, 'the old fishing recovery substitute is removed');
}

function testFortuneSettlesAtBattleStartWithoutCodeSpiritAttackSubstitution(): void {
  const base = makeContext();
  base.gameDay.ensureStarted();
  const baseRun = base.battle.start('PROJECT', 'build_db');

  const boosted = makeContext(v59Options('CODE_SPIRIT', 'fortune'));
  boosted.gameDay.ensureStarted();
  const boostedRun = boosted.battle.start('PROJECT', 'build_db');
  assert.equal(boostedRun.attack, baseRun.attack, 'Code Spirit no longer substitutes a general battle attack bonus');
  assert.equal(boostedRun.critChance, baseRun.critChance * 1.1);
}

function testScapegoatGrowsFromSuccessfulResolution(): void {
  const scapegoat = makeContext({ ...v59Options('SCAPEGOAT'), performance: 100 });
  const kase = scapegoat.responsibility.openCase({
    sourceNpc: 'BOSS', actualOwnerNpc: 'BOSS', blamedPlayer: true, cause: 'V5.9 test', severity: 'S1',
  });
  scapegoat.responsibility.attachEvidence(kase.id, 'evidence-v59');
  const outcome = scapegoat.responsibility.clearWithEvidence(kase.id);
  assert.equal(outcome.performanceDelta, 4);
  assert.equal(scapegoat.player.performance, 104);
}

function testSocialFateBoostsRelationshipsAndPenalizesSoloTaskProgress(): void {
  const legacy = makeContext();
  assert.equal(legacy.npcMemory.assistChance('JUNIOR'), 0.3, 'legacy NPC assistance remains unchanged');
  const social = makeContext(v59Options('SOCIAL_FATE'));
  assert.equal(social.npcMemory.assistChance('JUNIOR'), 0.345);
  assert.equal(social.npc.change('JUNIOR', 8), 10, 'Social Fate grows positive relationships faster');
  social.v2Events.applyEffects({ relationship: { BOSS: 8 } });
  assert.equal(social.player.relationships.BOSS, 10, 'configured event relationship gains use the same hook');

  const task = {
    taskId: 'v59-social-solo', taskType: 'CULTIVATION', name: 'solo', description: '',
    durationSeconds: 100, startedAt: 1_000, rewardSalary: 0, rewardCultivation: 0,
    rewardSpiritStones: 0, completed: false, claimed: false,
  } as ActiveTaskState;
  assert.equal(social.taskRuntimeDirector.progress(task, 51_000), 45, 'solo task progress pays the Social Fate tradeoff');
  social.player.workMode = 'SOCIAL';
  assert.equal(social.taskRuntimeDirector.progress(task, 51_000), 50, 'social mode avoids the solo tradeoff');
}

testProjectionIsImmutableAndComposesLegalDeltas();
testPureHooksAreBoundedAndRequireACompleteRecord();
testInsightIncreasesCultivationSettlementWithoutDestinySubstitution();
testConstitutionAndLaborSaintReduceFatigueGain();
testPerceptionAcceleratesTaskProgress();
testWillpowerReducesMindCost();
testKingOfGrindTradesMindForProfessionGrowth();
testFishingImmortalTradesRegularWorkOutput();
testFortuneSettlesAtBattleStartWithoutCodeSpiritAttackSubstitution();
testScapegoatGrowsFromSuccessfulResolution();
testSocialFateBoostsRelationshipsAndPenalizesSoloTaskProgress();
console.log('V59 character effects tests passed');
