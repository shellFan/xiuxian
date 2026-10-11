export const V59A_RULES_VERSION = 'v59a.1' as const;

export const STAT_KEYS = [
  'insight',
  'constitution',
  'perception',
  'fortune',
  'willpower',
] as const;

export type StatKey = typeof STAT_KEYS[number];

export interface CharacterStats {
  readonly insight: number;
  readonly constitution: number;
  readonly perception: number;
  readonly fortune: number;
  readonly willpower: number;
}

export const DESTINY_IDS = [
  'LABOR_SAINT',
  'KING_OF_GRIND',
  'FISHING_IMMORTAL',
  'SCAPEGOAT',
  'CODE_SPIRIT',
  'SOCIAL_FATE',
] as const;

export type DestinyId = typeof DESTINY_IDS[number];

export const PROFESSION_IDS = ['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS'] as const;
export type ProfessionId = typeof PROFESSION_IDS[number];

export const BACKGROUND_IDS = ['ORDINARY_WORKER', 'CULTIVATION_GRAD', 'CAREER_CHANGER'] as const;
export type CharacterBackground = typeof BACKGROUND_IDS[number];

export const CREATION_STEPS = [
  'INDUSTRY',
  'DIRECTION',
  'PROFESSION',
  'IDENTITY',
  'DESTINY',
  'ALLOCATION',
  'CONFIRM',
] as const;
export type CreationStep = typeof CREATION_STEPS[number];

export type CharacterCandidateId = 'A' | 'B' | 'C';

export interface CharacterCandidate {
  readonly id: CharacterCandidateId;
  readonly destinyId: DestinyId;
  readonly attributes: CharacterStats;
}

export type CharacterCandidateTriplet = readonly [
  CharacterCandidate,
  CharacterCandidate,
  CharacterCandidate,
];

const ZERO_SEED_FALLBACK = 0x9e3779b9;
const UINT32_RANGE = 0x1_0000_0000;

export function normalizeSeed(seed: number): number {
  const normalized = seed >>> 0;
  return normalized === 0 ? ZERO_SEED_FALLBACK : normalized;
}

export class XorShift32 {
  private currentState: number;

  public constructor(seed: number) {
    this.currentState = normalizeSeed(seed);
  }

  public get state(): number {
    return this.currentState;
  }

  public nextUint32(): number {
    let value = this.currentState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.currentState = value >>> 0;
    return this.currentState;
  }

  public nextFloat(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  public nextInt(minInclusive: number, maxExclusive: number): number {
    if (!Number.isSafeInteger(minInclusive)
      || !Number.isSafeInteger(maxExclusive)
      || maxExclusive <= minInclusive) {
      throw new RangeError('Invalid integer range');
    }
    return minInclusive + Math.floor(this.nextFloat() * (maxExclusive - minInclusive));
  }
}

export function mix32(input: number): number {
  let value = input >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
}

export function mixRerollSeed(baseSeed: number, rerollNumber: number): number {
  if (!Number.isSafeInteger(rerollNumber) || rerollNumber < 1) {
    throw new RangeError('Reroll number must be a one-based integer');
  }
  const mixed = mix32((normalizeSeed(baseSeed) ^ Math.imul(rerollNumber, 0x9e3779b1)) >>> 0);
  return mixed === 0 ? ZERO_SEED_FALLBACK : mixed;
}

const FIXED_PROFESSION_STATS: Readonly<Record<ProfessionId, CharacterStats>> = {
  JAVA_BACKEND: { insight: 16, constitution: 10, perception: 10, fortune: 7, willpower: 7 },
  FRONTEND: { insight: 15, constitution: 8, perception: 12, fortune: 7, willpower: 8 },
  QA: { insight: 13, constitution: 8, perception: 16, fortune: 7, willpower: 6 },
  DEVOPS: { insight: 12, constitution: 14, perception: 10, fortune: 7, willpower: 7 },
};

function makeBalancedStats(rng: XorShift32): CharacterStats {
  const values = [10, 10, 10, 10, 10];
  const minusIndex = rng.nextInt(0, STAT_KEYS.length);
  const plusCandidates = STAT_KEYS.map((_, index) => index).filter((index) => index !== minusIndex);
  const plusIndex = plusCandidates[rng.nextInt(0, plusCandidates.length)];
  values[minusIndex] -= 1;
  values[plusIndex] += 1;
  return statsFromValues(values);
}

function makeFortuneStats(rng: XorShift32): CharacterStats {
  const otherValues = [9, 9, 8, 8];
  const donorIndex = rng.nextInt(0, otherValues.length);
  const recipientCandidates = otherValues.map((_, index) => index).filter((index) => index !== donorIndex);
  const recipientIndex = recipientCandidates[rng.nextInt(0, recipientCandidates.length)];
  otherValues[donorIndex] -= 1;
  otherValues[recipientIndex] += 1;
  return {
    insight: otherValues[0],
    constitution: otherValues[1],
    perception: otherValues[2],
    fortune: 16,
    willpower: otherValues[3],
  };
}

function statsFromValues(values: readonly number[]): CharacterStats {
  return {
    insight: values[0],
    constitution: values[1],
    perception: values[2],
    fortune: values[3],
    willpower: values[4],
  };
}

function drawDistinctDestinies(rng: XorShift32): readonly [DestinyId, DestinyId, DestinyId] {
  const available: DestinyId[] = [...DESTINY_IDS];
  const drawn: DestinyId[] = [];
  for (let index = 0; index < 3; index += 1) {
    drawn.push(available.splice(rng.nextInt(0, available.length), 1)[0]);
  }
  return [drawn[0], drawn[1], drawn[2]];
}

export function generateCandidateTriplet(
  seed: number,
  professionId: ProfessionId,
): CharacterCandidateTriplet {
  if (!(PROFESSION_IDS as readonly string[]).includes(professionId)) {
    throw new RangeError(`Unknown profession: ${String(professionId)}`);
  }
  const rng = new XorShift32(seed);
  const balanced = makeBalancedStats(rng);
  const fortune = makeFortuneStats(rng);
  const destinies = drawDistinctDestinies(rng);
  return [
    { id: 'A', destinyId: destinies[0], attributes: balanced },
    { id: 'B', destinyId: destinies[1], attributes: { ...FIXED_PROFESSION_STATS[professionId] } },
    { id: 'C', destinyId: destinies[2], attributes: fortune },
  ];
}

export function serializeCandidate(candidate: CharacterCandidate): string {
  const stats = STAT_KEYS.map((key) => `${key}=${candidate.attributes[key]}`).join('|');
  return `${candidate.id}|${candidate.destinyId}|${stats}`;
}

export function serializeCandidateTriplet(
  professionId: ProfessionId,
  candidates: CharacterCandidateTriplet,
): string {
  return `${V59A_RULES_VERSION}|${professionId}|${candidates.map(serializeCandidate).join('||')}`;
}

export type NicknameValidationError = 'EMPTY' | 'CONTROL_CHARACTER' | 'TOO_LONG';

export type NicknameValidationResult =
  | { readonly valid: true; readonly value: string; readonly graphemeCount: number }
  | {
    readonly valid: false;
    readonly value: string;
    readonly graphemeCount: number;
    readonly error: NicknameValidationError;
  };

type SegmenterLike = {
  segment(input: string): Iterable<unknown>;
};

type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: 'grapheme' },
) => SegmenterLike;

function isValidJoinerSequence(value: string): boolean {
  const codePoints = Array.from(value);
  for (let index = 0; index < codePoints.length; index += 1) {
    if (codePoints[index] !== '\u200d') continue;
    if (index === 0 || index === codePoints.length - 1 || codePoints[index - 1] === '\u200d' || codePoints[index + 1] === '\u200d') {
      return false;
    }
  }
  return true;
}

function fallbackGraphemeCount(value: string): number {
  let count = 0;
  let joinsNext = false;
  for (const codePoint of Array.from(value)) {
    if (codePoint === '\u200d') {
      joinsNext = true;
      continue;
    }
    if (/\p{M}/u.test(codePoint) || /[\u{1f3fb}-\u{1f3ff}]/u.test(codePoint)) continue;
    if (joinsNext) {
      joinsNext = false;
    } else {
      count += 1;
    }
  }
  return count;
}

function countGraphemes(value: string): number {
  const constructor = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  if (typeof constructor === 'function') {
    return Array.from(new constructor(undefined, { granularity: 'grapheme' }).segment(value)).length;
  }
  return fallbackGraphemeCount(value);
}

export function validateNickname(input: string): NicknameValidationResult {
  const value = input.trim();
  if (value.length === 0) {
    return { valid: false, value, graphemeCount: 0, error: 'EMPTY' };
  }

  const withoutJoiners = value.replace(/\u200d/g, '');
  if (/[\p{Cc}\p{Cf}]/u.test(withoutJoiners) || !isValidJoinerSequence(value)) {
    return { valid: false, value, graphemeCount: 0, error: 'CONTROL_CHARACTER' };
  }

  const graphemeCount = countGraphemes(value);
  if (graphemeCount > 12) {
    return { valid: false, value, graphemeCount, error: 'TOO_LONG' };
  }
  return { valid: true, value, graphemeCount };
}

export const ALLOCATION_POINT_BUDGET = 5;

export interface AllocationState {
  readonly allocation: CharacterStats;
  readonly attributes: CharacterStats;
  readonly remainingPoints: number;
}

export type AllocationError = 'INVALID_DELTA' | 'STAT_CAP_EXCEEDED' | 'POINTS_EXCEEDED';

export type AllocationResult =
  | ({ readonly ok: true } & AllocationState)
  | ({ readonly ok: false; readonly error: AllocationError } & AllocationState);

export function emptyAllocation(): CharacterStats {
  return { insight: 0, constitution: 0, perception: 0, fortune: 0, willpower: 0 };
}

function validateAllocationState(base: CharacterStats, allocation: CharacterStats): AllocationState {
  let spent = 0;
  const attributeValues: number[] = [];
  for (const key of STAT_KEYS) {
    if (!Number.isInteger(base[key]) || base[key] < 6 || base[key] > 16) {
      throw new RangeError(`Invalid base attribute ${key}`);
    }
    if (!Number.isInteger(allocation[key]) || allocation[key] < 0) {
      throw new RangeError(`Invalid allocation for ${key}`);
    }
    spent += allocation[key];
    const finalValue = base[key] + allocation[key];
    if (finalValue > 20) {
      throw new RangeError(`Existing allocation exceeds stat cap for ${key}`);
    }
    attributeValues.push(finalValue);
  }
  if (spent > ALLOCATION_POINT_BUDGET) {
    throw new RangeError('Existing allocation exceeds five points');
  }
  return {
    allocation: { ...allocation },
    attributes: statsFromValues(attributeValues),
    remainingPoints: ALLOCATION_POINT_BUDGET - spent,
  };
}

export function applyAllocation(
  base: CharacterStats,
  allocation: CharacterStats,
  stat: StatKey,
  delta: number,
): AllocationResult {
  const current = validateAllocationState(base, allocation);
  if (!Number.isInteger(delta) || delta < 0) {
    return { ok: false, error: 'INVALID_DELTA', ...current };
  }
  if (delta > current.remainingPoints) {
    return { ok: false, error: 'POINTS_EXCEEDED', ...current };
  }
  if (base[stat] + allocation[stat] + delta > 20) {
    return { ok: false, error: 'STAT_CAP_EXCEEDED', ...current };
  }
  const nextAllocation = { ...allocation, [stat]: allocation[stat] + delta };
  return { ok: true, ...validateAllocationState(base, nextAllocation) };
}

export function resetAllocation(base: CharacterStats): AllocationState {
  return validateAllocationState(base, emptyAllocation());
}
