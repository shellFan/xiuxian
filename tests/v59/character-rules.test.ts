import assert from 'node:assert/strict';

import {
  DESTINY_IDS,
  BACKGROUND_IDS,
  CREATION_STEPS,
  PROFESSION_IDS,
  STAT_KEYS,
  V59A_RULES_VERSION,
  XorShift32,
  applyAllocation,
  emptyAllocation,
  generateCandidateTriplet,
  mixRerollSeed,
  resetAllocation,
  serializeCandidate,
  serializeCandidateTriplet,
  validateNickname,
  type CharacterCandidate,
  type CharacterStats,
  type ProfessionId,
} from '../../assets/scripts/v59/character-rules';

function assertValidCandidate(candidate: CharacterCandidate): void {
  for (const key of STAT_KEYS) {
    assert.ok(Number.isInteger(candidate.attributes[key]));
    assert.ok(candidate.attributes[key] >= 50 && candidate.attributes[key] <= 88);
  }
}

function testPublishedDomainConstants(): void {
  assert.equal(V59A_RULES_VERSION, 'v59a.1');
  assert.deepEqual(STAT_KEYS, ['insight', 'constitution', 'perception', 'fortune', 'willpower']);
  assert.deepEqual(DESTINY_IDS, [
    'LABOR_SAINT', 'KING_OF_GRIND', 'FISHING_IMMORTAL',
    'SCAPEGOAT', 'CODE_SPIRIT', 'SOCIAL_FATE',
  ]);
  assert.deepEqual(PROFESSION_IDS, ['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS']);
}

function testCreationStatesAndBackgroundIds(): void {
  assert.deepEqual(CREATION_STEPS, [
    'INDUSTRY', 'DIRECTION', 'PROFESSION', 'IDENTITY', 'DESTINY', 'ALLOCATION', 'CONFIRM',
  ]);
  assert.deepEqual(BACKGROUND_IDS, ['ORDINARY_WORKER', 'CULTIVATION_GRAD', 'CAREER_CHANGER']);
}

function testXorShift32IsDeterministicAndNormalizesZero(): void {
  const rng = new XorShift32(1);
  assert.deepEqual([rng.nextUint32(), rng.nextUint32(), rng.nextUint32()], [270369, 67634689, 2647435461]);
  assert.equal(new XorShift32(0).state, 0x9e3779b9);
  assert.equal(new XorShift32(0x1_0000_0001).state, 1);

  const floats = new XorShift32(7);
  for (let index = 0; index < 20; index += 1) {
    const value = floats.nextFloat();
    assert.ok(value >= 0 && value < 1);
  }
  const integers = new XorShift32(7);
  for (let index = 0; index < 20; index += 1) {
    const value = integers.nextInt(2, 5);
    assert.ok(Number.isInteger(value) && value >= 2 && value < 5);
  }
  assert.throws(() => integers.nextInt(5, 5), /range/i);
}

function testRerollSeedsAreStableAndOneBased(): void {
  assert.equal(mixRerollSeed(1234, 1), mixRerollSeed(1234, 1));
  assert.notEqual(mixRerollSeed(1234, 1), mixRerollSeed(1234, 2));
  assert.notEqual(mixRerollSeed(0, 1), 0);
  assert.throws(() => mixRerollSeed(1234, 0), /one-based/i);
  assert.throws(() => mixRerollSeed(1234, 1.5), /one-based/i);
}

function testCandidateTripletsUseTheCreationAttributeRange(): void {
  for (const professionId of PROFESSION_IDS) {
    const candidates = generateCandidateTriplet(0x12345678, professionId);
    assert.deepEqual(candidates.map((candidate) => candidate.id), ['A', 'B', 'C']);
    candidates.forEach(assertValidCandidate);

    assert.equal(new Set(candidates.map((candidate) => candidate.destinyId)).size, 3);
    assert.equal(new Set(candidates.map(serializeCandidate)).size, 3);
  }
}

function testCandidateReplayAndCanonicalSerialization(): void {
  const first = generateCandidateTriplet(42, 'QA');
  const replay = generateCandidateTriplet(42, 'QA');
  assert.deepEqual(replay, first);
  assert.equal(serializeCandidateTriplet('QA', first), serializeCandidateTriplet('QA', replay));
  assert.match(serializeCandidate(first[0]), /^A\|(?:LABOR_SAINT|KING_OF_GRIND|FISHING_IMMORTAL|SCAPEGOAT|CODE_SPIRIT|SOCIAL_FATE)\|insight=\d+\|constitution=\d+\|perception=\d+\|fortune=\d+\|willpower=\d+$/);
  assert.ok(serializeCandidateTriplet('QA', first).startsWith('v59a.1|QA|'));
  assert.notDeepEqual(generateCandidateTriplet(43, 'QA'), first);
}

function testNicknameValidationUsesVisibleGraphemeClusters(): void {
  assert.deepEqual(validateNickname('  牛马仙人  '), {
    valid: true, value: '牛马仙人', graphemeCount: 4,
  });
  assert.equal(validateNickname('   ').valid, false);
  assert.equal(validateNickname('bad\nname').valid, false);
  assert.equal(validateNickname(`bad\u200ename`).valid, false);
  assert.equal(validateNickname('\u200d').valid, false);

  const combiningName = 'e\u0301'.repeat(12);
  assert.deepEqual(validateNickname(combiningName), {
    valid: true, value: combiningName, graphemeCount: 12,
  });
  assert.equal(validateNickname(`${combiningName}a`).valid, false);

  const family = '👨‍👩‍👧‍👦';
  assert.deepEqual(validateNickname(family.repeat(12)), {
    valid: true, value: family.repeat(12), graphemeCount: 12,
  });
  assert.equal(validateNickname(family.repeat(13)).valid, false);
}

function testNicknameFallbackGroupsMarksAndJoinerSequences(): void {
  const intl = Intl as unknown as { Segmenter?: unknown };
  const originalSegmenter = intl.Segmenter;
  intl.Segmenter = undefined;
  try {
    assert.equal(validateNickname('e\u0301'.repeat(12)).graphemeCount, 12);
    assert.equal(validateNickname('👨‍👩‍👧‍👦'.repeat(12)).graphemeCount, 12);
  } finally {
    intl.Segmenter = originalSegmenter;
  }
}

function testAllocationAppliesAtMostFivePointsWithoutBreakingCaps(): void {
  const base: CharacterStats = { insight: 50, constitution: 86, perception: 70, fortune: 60, willpower: 80 };
  const empty = emptyAllocation();
  assert.deepEqual(empty, { insight: 0, constitution: 0, perception: 0, fortune: 0, willpower: 0 });

  const first = applyAllocation(base, empty, 'insight', 5);
  assert.equal(first.ok, true);
  assert.deepEqual(first.allocation, { ...empty, insight: 5 });
  assert.deepEqual(first.attributes, { ...base, insight: 55 });
  assert.equal(first.remainingPoints, 0);

  const second = applyAllocation(base, first.allocation, 'insight', -1);
  assert.equal(second.ok, true);
  assert.equal(second.remainingPoints, 1);
  assert.equal(second.attributes.insight, 54);

  assert.equal(applyAllocation(base, second.allocation, 'willpower', 5).ok, false);
  assert.equal(applyAllocation(base, empty, 'constitution', 5).ok, false);
  assert.equal(applyAllocation(base, empty, 'fortune', -1).ok, false);
  assert.equal(applyAllocation(base, empty, 'fortune', 1).ok, false);
  assert.equal(applyAllocation(base, empty, 'fortune', 1.5).ok, false);

  const reset = resetAllocation(base);
  assert.deepEqual(reset.allocation, empty);
  assert.deepEqual(reset.attributes, base);
  assert.equal(reset.remainingPoints, 5);
}

function testAllocationRejectsInvalidBaseAndExistingAllocation(): void {
  const valid: CharacterStats = { insight: 50, constitution: 50, perception: 50, fortune: 50, willpower: 50 };
  assert.throws(
    () => applyAllocation({ ...valid, insight: 49 }, emptyAllocation(), 'insight', 5),
    /base attribute/i,
  );
  assert.throws(
    () => applyAllocation(valid, { ...emptyAllocation(), fortune: -1 }, 'insight', 1),
    /allocation/i,
  );
  assert.throws(
    () => applyAllocation(valid, { ...emptyAllocation(), fortune: 6 }, 'insight', 0),
    /five points/i,
  );
}

testPublishedDomainConstants();
testCreationStatesAndBackgroundIds();
testXorShift32IsDeterministicAndNormalizesZero();
testRerollSeedsAreStableAndOneBased();
testCandidateTripletsUseTheCreationAttributeRange();
testCandidateReplayAndCanonicalSerialization();
testNicknameValidationUsesVisibleGraphemeClusters();
testNicknameFallbackGroupsMarksAndJoinerSequences();
testAllocationAppliesAtMostFivePointsWithoutBreakingCaps();
testAllocationRejectsInvalidBaseAndExistingAllocation();

console.log('V5.9-A character rules tests passed');
