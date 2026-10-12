import {
  DESTINY_IDS,
  STAT_KEYS,
  type CharacterStats,
  type DestinyId,
  type StatKey,
} from './character-rules';

export type CharacterEffectHookId =
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
  | 'RELATIONSHIP_GAIN'
  | 'FISHING_EVENT_WEIGHT'
  | 'BLAME_EVENT_WEIGHT';

export interface CharacterAttributeRecord {
  readonly destinyId?: DestinyId;
  readonly innateAttributes?: CharacterStats;
  readonly earnedAttributeDelta?: Partial<CharacterStats>;
}

export interface CharacterAttributeDeltas {
  readonly temporary?: Partial<CharacterStats>;
  readonly equipment?: Partial<CharacterStats>;
}

interface AttributeHookRule {
  readonly stat: StatKey;
  readonly ratePerPointFromTen: number;
  readonly minimum: number;
  readonly maximum: number;
}

const ATTRIBUTE_HOOK_RULES: Readonly<Partial<Record<CharacterEffectHookId, AttributeHookRule>>> = Object.freeze({
  CULTIVATION_REWARD: { stat: 'insight', ratePerPointFromTen: 0.02, minimum: 0.9, maximum: 1.2 },
  FATIGUE_GAIN: { stat: 'constitution', ratePerPointFromTen: -0.015, minimum: 0.8, maximum: 1.1 },
  TASK_PROGRESS: { stat: 'perception', ratePerPointFromTen: 0.015, minimum: 0.9, maximum: 1.2 },
  BATTLE_CRIT_CHANCE: { stat: 'fortune', ratePerPointFromTen: 0.02, minimum: 0.9, maximum: 1.2 },
  MIND_COST: { stat: 'willpower', ratePerPointFromTen: -0.02, minimum: 0.8, maximum: 1.1 },
});

const DESTINY_HOOK_RULES: Readonly<Record<DestinyId, Readonly<Partial<Record<CharacterEffectHookId, number>>>>> = Object.freeze({
  LABOR_SAINT: Object.freeze({ FATIGUE_GAIN: 0.8 }),
  KING_OF_GRIND: Object.freeze({ PROFESSION_GROWTH: 1.2, WORK_MIND_COST: 1.25 }),
  FISHING_IMMORTAL: Object.freeze({ REGULAR_WORK_OUTPUT: 0.9, FISHING_EVENT_WEIGHT: 1.5 }),
  SCAPEGOAT: Object.freeze({ RESPONSIBILITY_SUCCESS_GROWTH: 1.5, BLAME_EVENT_WEIGHT: 1.5 }),
  CODE_SPIRIT: Object.freeze({ TECHNICAL_TASK_PROGRESS: 1.1 }),
  SOCIAL_FATE: Object.freeze({ NPC_ASSIST_CHANCE: 1.15, RELATIONSHIP_GAIN: 1.25, SOLO_TASK_PROGRESS: 0.9 }),
});

const DESTINY_ID_SET: ReadonlySet<string> = new Set<string>(DESTINY_IDS);
const MIN_RUNTIME_DELTA = -20;
const MAX_RUNTIME_DELTA = 20;
const MIN_EFFECTIVE_ATTRIBUTE = 0;
const MAX_EFFECTIVE_ATTRIBUTE = 40;
const MIN_COMBINED_MULTIPLIER = 0.5;
const MAX_COMBINED_MULTIPLIER = 1.5;

/**
 * Projects immutable effective attributes from persisted character values and
 * caller-supplied runtime deltas. A missing or malformed persisted record is
 * represented as null so legacy callers can preserve identity behavior.
 */
export function projectCharacterAttributes(
  record: Pick<CharacterAttributeRecord, 'innateAttributes' | 'earnedAttributeDelta'>,
  deltas: CharacterAttributeDeltas = {},
): CharacterStats | null {
  if (!isInnateAttributes(record.innateAttributes) || !isEarnedDelta(record.earnedAttributeDelta)) return null;
  validateRuntimeDelta(deltas.temporary, 'temporary');
  validateRuntimeDelta(deltas.equipment, 'equipment');

  const values: number[] = [];
  for (const key of STAT_KEYS) {
    const value = record.innateAttributes[key]
      + (record.earnedAttributeDelta?.[key] ?? 0)
      + (deltas.temporary?.[key] ?? 0)
      + (deltas.equipment?.[key] ?? 0);
    if (value < MIN_EFFECTIVE_ATTRIBUTE || value > MAX_EFFECTIVE_ATTRIBUTE) {
      throw new RangeError(`Projected attribute ${key} is outside supported bounds`);
    }
    values.push(value);
  }
  return Object.freeze({
    insight: values[0],
    constitution: values[1],
    perception: values[2],
    fortune: values[3],
    willpower: values[4],
  });
}

/** Looks up the bounded multiplier for one existing business settlement hook. */
export function characterEffectMultiplier(
  record: CharacterAttributeRecord,
  hook: CharacterEffectHookId,
  deltas: CharacterAttributeDeltas = {},
): number {
  if (!isDestinyId(record.destinyId)) return 1;
  const attributes = projectCharacterAttributes(record, deltas);
  if (!attributes) return 1;

  const attributeRule = ATTRIBUTE_HOOK_RULES[hook];
  const attributeMultiplier = attributeRule
    ? clamp(
      1 + (attributes[attributeRule.stat] - 10) * attributeRule.ratePerPointFromTen,
      attributeRule.minimum,
      attributeRule.maximum,
    )
    : 1;
  const destinyMultiplier = DESTINY_HOOK_RULES[record.destinyId][hook] ?? 1;
  return clamp(attributeMultiplier * destinyMultiplier, MIN_COMBINED_MULTIPLIER, MAX_COMBINED_MULTIPLIER);
}

/**
 * Applies a hook to an integer settlement while keeping rewards conservative
 * (floor) and costs conservative (ceil magnitude).
 */
export function applyCharacterEffectToInteger(
  amount: number,
  record: CharacterAttributeRecord,
  hook: CharacterEffectHookId,
  deltas: CharacterAttributeDeltas = {},
): number {
  if (!Number.isSafeInteger(amount)) throw new Error('Character effect amount must be a safe integer');
  const multiplier = characterEffectMultiplier(record, hook, deltas);
  if (amount >= 0) return Math.floor(amount * multiplier);
  return -Math.ceil(Math.abs(amount) * multiplier);
}

function isInnateAttributes(value: CharacterStats | undefined): value is CharacterStats {
  if (!value) return false;
  let total = 0;
  for (const key of STAT_KEYS) {
    const stat = value[key];
    if (!Number.isSafeInteger(stat) || stat < 6 || stat > 20) return false;
    total += stat;
  }
  return total >= 50 && total <= 55;
}

function isEarnedDelta(value: Partial<CharacterStats> | undefined): boolean {
  if (!value) return true;
  for (const key of STAT_KEYS) {
    const delta = value[key];
    if (delta !== undefined && (!Number.isSafeInteger(delta) || delta < 0 || delta > 20)) return false;
  }
  return true;
}

function validateRuntimeDelta(value: Partial<CharacterStats> | undefined, label: string): void {
  if (!value) return;
  for (const key of STAT_KEYS) {
    const delta = value[key];
    if (delta !== undefined && (!Number.isSafeInteger(delta) || delta < MIN_RUNTIME_DELTA || delta > MAX_RUNTIME_DELTA)) {
      throw new RangeError(`Invalid ${label} attribute delta for ${key}`);
    }
  }
}

function isDestinyId(value: DestinyId | undefined): value is DestinyId {
  return typeof value === 'string' && DESTINY_ID_SET.has(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
