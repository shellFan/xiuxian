import assert from 'node:assert/strict';
import { EventScheduler, normalizeEventWeights, type EventDefinition, type EventWorldState } from '../../assets/scripts/v2/event-engine';
import { EVENT_MAP, EVENTS, projectDestinyEventWeightMultipliers, V2EventService } from '../../assets/scripts/v2/v2-event-service';
import { GameContext } from '../../assets/scripts/core/game-context';
import { FakeClock } from '../../assets/scripts/core/clock';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { createRng, mulberry32 } from '../../assets/scripts/v2/random-service';
import { characterEffectMultiplier } from '../../assets/scripts/v59/character-attributes';

const STATS = { insight: 10, constitution: 10, perception: 10, fortune: 10, willpower: 10 } as const;

function world(overrides: Partial<EventWorldState> = {}): EventWorldState {
  return {
    careerLevel: 4, workMode: 'FISHING', mind: 80, innerDemon: 0,
    salary: 100, cultivation: 100, weekday: 2, hour: 10,
    situationIds: [], sectId: null, relationships: {}, materials: {},
    ownedTechniques: [], ownedEquipment: [], eventFlags: {},
    ...overrides,
  };
}

function countTargetPicks(defs: readonly EventDefinition[], inputWorld: EventWorldState, seed: number, rounds: number, target: (def: EventDefinition) => boolean): number {
  const random = createRng(mulberry32(seed));
  let count = 0;
  for (let i = 0; i < rounds; i += 1) {
    const picked = new EventScheduler().pick(defs, inputWorld, random, i * 60_000);
    if (picked && target(picked)) count += 1;
  }
  return count;
}

function testDestinyEventHooks(): void {
  assert.equal(characterEffectMultiplier({ destinyId: 'FISHING_IMMORTAL', innateAttributes: STATS }, 'FISHING_EVENT_WEIGHT'), 1.5);
  assert.equal(characterEffectMultiplier({ destinyId: 'SCAPEGOAT', innateAttributes: STATS }, 'BLAME_EVENT_WEIGHT'), 1.5);
  assert.equal(characterEffectMultiplier({ destinyId: 'LABOR_SAINT', innateAttributes: STATS }, 'FISHING_EVENT_WEIGHT'), 1);
  assert.deepEqual(projectDestinyEventWeightMultipliers(new PlayerData({ destinyId: 'FISHING_IMMORTAL', innateAttributes: STATS })), { fishing: 1.5, blame: 1 });
  assert.deepEqual(projectDestinyEventWeightMultipliers(new PlayerData({ destinyId: 'SCAPEGOAT', innateAttributes: STATS })), { fishing: 1, blame: 1.5 });
}

function testFishingEventDistributionUsesExistingScheduler(): void {
  const fishing: EventDefinition = {
    id: 'fish_encounter', title: '', description: '', category: 'SECRET', rarity: 'COMMON', priority: 'NORMAL', baseWeight: 100,
    allowedModes: ['FISHING'],
  };
  const ordinary: EventDefinition = {
    id: 'ordinary_encounter', title: '', description: '', category: 'WORK', rarity: 'COMMON', priority: 'NORMAL', baseWeight: 100,
  };
  const defs = [fishing, ordinary];
  const baseline = countTargetPicks(defs, world(), 5901, 20_000, (def) => def.id === fishing.id);
  const enhanced = countTargetPicks(defs, world({ destinyEventWeightMultipliers: projectDestinyEventWeightMultipliers(new PlayerData({ destinyId: 'FISHING_IMMORTAL', innateAttributes: STATS })) }), 5901, 20_000, (def) => def.id === fishing.id);
  assert.ok(enhanced > baseline * 1.15, `fishing destiny should raise target rate: baseline=${baseline}, enhanced=${enhanced}`);
  console.log(`FISHING_IMMORTAL fixed-seed distribution: ${baseline}/20000 -> ${enhanced}/20000 target encounters`);
}

function testScapegoatDistributionOnlyChangesBlameEvents(): void {
  const blame: EventDefinition = {
    id: 'blame_encounter', title: '', description: '', category: 'CHAIN', rarity: 'COMMON', priority: 'NORMAL', baseWeight: 100,
    choices: [{ id: 'take', text: '', effects: { openCase: { sourceNpc: 'BOSS', actualOwnerNpc: 'JUNIOR', blamedPlayer: true, cause: 'blame', severity: 'S2' } } }],
  };
  const ordinary: EventDefinition = {
    id: 'ordinary_workplace', title: '', description: '', category: 'CHAIN', rarity: 'COMMON', priority: 'NORMAL', baseWeight: 100,
    choices: [{ id: 'continue', text: '', effects: { performance: 1 } }],
  };
  const defs = [blame, ordinary];
  const baseline = countTargetPicks(defs, world({ workMode: 'WORK' }), 5911, 20_000, (def) => def.id === blame.id);
  const enhanced = countTargetPicks(defs, world({ workMode: 'WORK', destinyEventWeightMultipliers: projectDestinyEventWeightMultipliers(new PlayerData({ destinyId: 'SCAPEGOAT', innateAttributes: STATS })) }), 5911, 20_000, (def) => def.id === blame.id);
  assert.ok(enhanced > baseline * 1.15, `scapegoat should raise blame-event rate: baseline=${baseline}, enhanced=${enhanced}`);
  console.log(`SCAPEGOAT fixed-seed distribution: ${baseline}/20000 -> ${enhanced}/20000 blame encounters`);
}

function testExistingEventsKeepNonTargetBaseWeightsAndNormalizedProbabilities(): void {
  const fishingDefs = EVENTS.filter((def) => def.allowedModes?.includes('FISHING'));
  assert.ok(fishingDefs.length > 0);
  const unrelated = EVENTS.find((def) => !def.allowedModes?.includes('FISHING') && def.baseWeight > 0);
  assert.ok(unrelated);
  assert.equal(unrelated.baseWeight, EVENT_MAP.get(unrelated.id)?.baseWeight, 'non-target base weight stays unchanged');
  const values = normalizeEventWeights([0, 1, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE]);
  const total = values.reduce((sum, value) => sum + value, 0);
  assert.ok(Number.isFinite(total), 'effective event probability total stays finite');
  assert.ok(values.every((value) => value >= 0), 'effective weights stay nonnegative');
}

function testUnrelatedEventSelectionIsUnchanged(): void {
  const defs: EventDefinition[] = [
    { id: 'ordinary_a', title: '', description: '', category: 'WORK', rarity: 'COMMON', priority: 'NORMAL', baseWeight: 3 },
    { id: 'ordinary_b', title: '', description: '', category: 'NPC', rarity: 'RARE', priority: 'NORMAL', baseWeight: 7 },
  ];
  const choose = (multipliers: EventWorldState['destinyEventWeightMultipliers']): string[] => {
    const rng = createRng(mulberry32(5921));
    const input = world({ workMode: 'WORK', destinyEventWeightMultipliers: multipliers });
    return Array.from({ length: 200 }, (_, i) => new EventScheduler().pick(defs, input, rng, i * 60_000)?.id ?? 'none');
  };
  assert.deepEqual(choose(undefined), choose({ fishing: 1.5, blame: 1.5 }));
}

function testRealBlameEncounterSettlement(): void {
  const now = new Date(2026, 9, 12, 10, 0, 0, 0).getTime();
  const clock = new FakeClock(now);
  const context = new GameContext({
    storage: new MemoryStorageAdapter(),
    player: new PlayerData({ lastSaveTime: now, destinyId: 'SCAPEGOAT', innateAttributes: STATS, careerLevel: 4 }),
    clock,
  });
  const event = EVENT_MAP.get('wp_blame_api_s0');
  assert.ok(event, 'real blame encounter is registered in V2 event pool');
  const takeBlame = event.choices?.find((choice) => choice.effects?.openCase?.blamedPlayer === true);
  assert.ok(takeBlame, 'encounter has the configured blame settlement branch');
  const service: V2EventService = context.v2Events;
  context.evidence.grant('GIT_LOG', '回归测试 Git 记录');
  assert.equal(service.forceTrigger(event.id), true);
  const result = service.choose(takeBlame.id);
  assert.equal(result.eventId, event.id);
  assert.equal(context.player.responsibilityCases.length, 1, 'settlement creates the real responsibility case');
  assert.equal(context.player.responsibilityCases[0].blamedPlayer, true);
}

testScapegoatDistributionOnlyChangesBlameEvents();
testFishingEventDistributionUsesExistingScheduler();
testDestinyEventHooks();
testExistingEventsKeepNonTargetBaseWeightsAndNormalizedProbabilities();
testUnrelatedEventSelectionIsUnchanged();
testRealBlameEncounterSettlement();
console.log('V5.9-A.1 destiny event weight tests passed');
