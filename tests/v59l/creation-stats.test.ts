import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { characterEffectMultiplier } from '../../assets/scripts/v59/character-attributes';
import {
  STAT_KEYS,
  applyAllocation,
  emptyAllocation,
  generateCandidateTriplet,
  type CharacterStats,
} from '../../assets/scripts/v59/character-rules';
import { buildCharacterCreationViewModel } from '../../assets/scripts/ui/character-creation-view-model';
import type { CharacterCreationView } from '../../assets/scripts/v59/character-creation-service';

const NOW = 1_800_000_000_000;

function createContext(storage: MemoryStorageAdapter, seed = 42): GameContext {
  return new GameContext({
    storage,
    clock: new FakeClock(NOW),
    board: null,
    characterSeedProvider: () => seed,
  } as never);
}

function advanceToDestiny(context: GameContext): any {
  const service = (context as any).characterCreation;
  service.query();
  service.selectIndustry('INTERNET'); service.advance();
  service.selectDirection('TECH_RND'); service.advance();
  service.selectProfession('QA'); service.advance();
  service.selectSect('BIG_TECH'); service.advance();
  service.setIdentity('量纲剑修', 'avatar-2');
  service.setBackground('CULTIVATION_GRAD'); service.advance();
  return service;
}

function testCreationRollsAreClosedIntegerRangeAndReplayBySeed(): void {
  const first = generateCandidateTriplet(0x12345678, 'QA');
  assert.deepEqual(generateCandidateTriplet(0x12345678, 'QA'), first);
  assert.notDeepEqual(generateCandidateTriplet(0x12345679, 'QA'), first);
  for (const candidate of first) {
    for (const key of STAT_KEYS) {
      assert.ok(Number.isInteger(candidate.attributes[key]));
      assert.ok(candidate.attributes[key] >= 50 && candidate.attributes[key] <= 88);
    }
  }

  let endpointReached = false;
  for (let seed = 1; seed <= 10_000 && !endpointReached; seed += 1) {
    endpointReached = generateCandidateTriplet(seed, 'QA')
      .some((candidate) => STAT_KEYS.some((key) => candidate.attributes[key] === 88));
  }
  assert.equal(endpointReached, true, 'the inclusive upper endpoint 88 must be reachable');
}

function testAtomicAllocationUsesOnlyTheFivePointPool(): void {
  const base: CharacterStats = { insight: 50, constitution: 86, perception: 70, fortune: 60, willpower: 80 };
  const empty = emptyAllocation();
  const added = applyAllocation(base, empty, 'insight', 5);
  assert.equal(added.ok, true);
  assert.equal(added.attributes.insight, 55);
  assert.equal(added.remainingPoints, 0);
  assert.equal(applyAllocation(base, empty, 'constitution', 5).ok, false, '86 + 5 exceeds 88 atomically');
  assert.equal(applyAllocation(base, empty, 'insight', -1).ok, false, 'base 50 cannot be decremented');
  assert.equal(applyAllocation(base, empty, 'insight', 1).ok, false, 'increase is an atomic +5 action');

  let current = added;
  for (let index = 0; index < 5; index += 1) {
    current = applyAllocation(base, current.allocation, 'insight', -1) as typeof added;
    assert.equal(current.ok, true);
  }
  assert.deepEqual(current.allocation, empty);
  assert.deepEqual(current.attributes, base);
  assert.equal(current.remainingPoints, 5);
}

function testDraftNavigationAndRestartCannotRefreshAttributesOrAllocation(): void {
  const storage = new MemoryStorageAdapter();
  let context = createContext(storage, 73);
  let service = advanceToDestiny(context);
  const original = service.query().draft.candidates;
  service.selectCandidate('A'); service.advance();
  const selected = service.query().draft.candidates[0];
  const stat = STAT_KEYS.find((key) => selected.attributes[key] <= 83);
  assert.ok(stat, 'seed fixture must expose one legal +5 target');
  assert.equal(service.allocate(stat, 5).success, true);
  const allocated = service.query().draft;

  service.back();
  assert.deepEqual(service.query().draft.candidates, original);
  service.advance();
  assert.deepEqual(service.query().draft.allocation, allocated.allocation);

  context = createContext(storage, 999_999);
  service = (context as any).characterCreation;
  assert.deepEqual(service.query().draft.candidates, original);
  assert.deepEqual(service.query().draft.allocation, allocated.allocation);

  assert.equal(service.resetAllocation().success, true);
  assert.deepEqual(service.query().draft.allocation, emptyAllocation());
  service.back(); service.back(); service.back(); service.back();
  assert.equal(service.query().draft.step, 'PROFESSION');
  service.selectProfession('QA');
  service.advance();
  assert.equal(service.query().draft.step, 'SECT');
  service.selectSect('BIG_TECH');
  service.advance();
  assert.deepEqual(service.query().draft.candidates, original, 're-entering the same profession replays the original seed');
}

function testFinalAttributesAreAuthoritativeAcrossExecutableRestart(): void {
  const storage = new MemoryStorageAdapter();
  let context = createContext(storage, 101);
  let service = advanceToDestiny(context);
  const draft = service.query().draft;
  const candidate = draft.candidates.find((item: any) => STAT_KEYS.some((key) => item.attributes[key] <= 83));
  assert.ok(candidate);
  const stat = STAT_KEYS.find((key) => candidate.attributes[key] <= 83)!;
  service.selectCandidate(candidate.id); service.advance();
  assert.equal(service.allocate(stat, 5).success, true);
  service.advance();
  assert.equal(service.finalize().success, true);
  const expected = { ...candidate.attributes, [stat]: candidate.attributes[stat] + 5 };
  assert.deepEqual(context.player.innateAttributes, expected);

  context = createContext(storage, 202);
  assert.deepEqual(context.player.innateAttributes, expected);
  assert.equal(context.player.characterSetupStatus, 'COMPLETE');
}

function testBackgroundBonusIsCapAwareAtEightyEight(): void {
  let seed = 1;
  let candidateId: 'A' | 'B' | 'C' | undefined;
  while (seed <= 10_000 && !candidateId) {
    candidateId = generateCandidateTriplet(seed, 'QA')
      .find((candidate) => candidate.attributes.insight === 88)?.id;
    if (!candidateId) seed += 1;
  }
  assert.ok(candidateId, 'fixture search must find an insight 88 candidate');

  const storage = new MemoryStorageAdapter();
  let context = createContext(storage, seed);
  let service = advanceToDestiny(context);
  service.selectCandidate(candidateId); service.advance(); service.advance();
  assert.equal(service.finalize().success, true);
  assert.equal(context.player.innateAttributes?.insight, 88);
  assert.equal(context.player.earnedAttributeDelta?.insight, 0);
  assert.equal((context.player.innateAttributes?.insight ?? 0)
    + (context.player.earnedAttributeDelta?.insight ?? 0), 88);

  context = createContext(storage, seed + 1);
  assert.equal(context.player.innateAttributes?.insight, 88);
  assert.equal(context.player.earnedAttributeDelta?.insight, 0);
  assert.equal((context.player.innateAttributes?.insight ?? 0)
    + (context.player.earnedAttributeDelta?.insight ?? 0), 88);
}

function testNewScaleEffectsMapMonotonicallyToLegacyTenThroughTwenty(): void {
  const at = (insight: number): number => characterEffectMultiplier({
    destinyId: 'LABOR_SAINT',
    innateAttributes: { insight, constitution: 50, perception: 50, fortune: 50, willpower: 50 },
    earnedAttributeDelta: {},
  }, 'CULTIVATION_REWARD');
  assert.equal(at(50), 1);
  assert.ok(at(69) > at(50));
  assert.ok(at(88) > at(69));
  assert.equal(at(88), 1.2);
  assert.equal(characterEffectMultiplier({
    destinyId: 'LABOR_SAINT',
    innateAttributes: { insight: 88, constitution: 50, perception: 50, fortune: 50, willpower: 50 },
    earnedAttributeDelta: { insight: 1 },
  }, 'CULTIVATION_REWARD'), 1.2, 'earned background points cannot exceed the old-scale 20 effect cap');
}

function testOldSavesRemainAcceptedWhileNewValuesPersist(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem('game-save', JSON.stringify({
    saveVersion: 15,
    destinyId: 'LABOR_SAINT',
    innateAttributes: { insight: 10, constitution: 10, perception: 10, fortune: 10, willpower: 10 },
    earnedAttributeDelta: {},
    characterSetupStatus: 'COMPLETE',
    characterCreationReceipt: 'V59A_CREATE_V1:legacy:A',
  }));
  const loaded = new SaveService(storage, 'game-save', () => NOW).load();
  assert.deepEqual(loaded.innateAttributes, { insight: 10, constitution: 10, perception: 10, fortune: 10, willpower: 10 });
  assert.equal(loaded.characterSetupStatus, 'COMPLETE');
}

function testAllocationViewExplainsDisabledActions(): void {
  const attributes: CharacterStats = { insight: 50, constitution: 86, perception: 70, fortune: 60, willpower: 80 };
  const source: CharacterCreationView = {
    status: 'CREATION_REQUIRED',
    isNewCharacterCreationRequired: true,
    draft: {
      rulesVersion: 'v59a.1', mode: 'CREATE', seed: 1, step: 'ALLOCATION',
      industry: 'INTERNET', direction: 'TECH_RND', professionId: 'QA', professionConfirmed: true,
      nickname: '量纲剑修', avatarId: 'avatar-1', background: 'ORDINARY_WORKER',
      candidates: [
        { id: 'A', destinyId: 'LABOR_SAINT', attributes },
        { id: 'B', destinyId: 'KING_OF_GRIND', attributes: { ...attributes } },
        { id: 'C', destinyId: 'CODE_SPIRIT', attributes: { ...attributes } },
      ],
      candidateHistory: [], selectedCandidateId: 'A', rerollsUsed: 0,
      allocation: emptyAllocation(), startedAt: NOW,
    },
  };
  const initial = buildCharacterCreationViewModel(source);
  assert.equal(initial.stats[0].canDecrease, false);
  assert.match(String((initial.stats[0] as any).decreaseDisabledReason), /尚未分配/);
  assert.equal(initial.stats[1].canIncrease, false);
  assert.match(String((initial.stats[1] as any).increaseDisabledReason), /88/);

  const exhausted = buildCharacterCreationViewModel({
    ...source,
    draft: { ...source.draft!, allocation: { ...emptyAllocation(), insight: 5 } },
  });
  assert.equal(exhausted.stats[2].canIncrease, false);
  assert.match(String((exhausted.stats[2] as any).increaseDisabledReason), /剩余潜力不足/);
  assert.equal(exhausted.stats[0].value, 55, 'view refreshes from authoritative allocation immediately');
  assert.equal(exhausted.remainingPoints, 0);
}

testCreationRollsAreClosedIntegerRangeAndReplayBySeed();
testAtomicAllocationUsesOnlyTheFivePointPool();
testDraftNavigationAndRestartCannotRefreshAttributesOrAllocation();
testFinalAttributesAreAuthoritativeAcrossExecutableRestart();
testBackgroundBonusIsCapAwareAtEightyEight();
testNewScaleEffectsMapMonotonicallyToLegacyTenThroughTwenty();
testOldSavesRemainAcceptedWhileNewValuesPersist();
testAllocationViewExplainsDisabledActions();

console.log('V5.9-L creation attribute tests passed');
