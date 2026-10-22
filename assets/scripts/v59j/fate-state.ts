import type { FateRunState, RebirthMetaState } from '../model/save-data';

export const DEFAULT_REBIRTH_META: RebirthMetaState = Object.freeze({
  karma: 0,
  talentRanks: Object.freeze({}),
  unlockedEndings: Object.freeze([]),
  settledRunIds: Object.freeze([]),
});

const FATE_TALENTS = new Set(['born_cow', 'fishing_master', 'steady_mind', 'office_veteran', 'lucky_worker', 'nine_lives']);
const MAX_KARMA = 1_000_000_000;

/**
 * Normalize the untrusted fate portion of a save independently from established player data.
 * Invalid active runs fail closed to null; account progression is bounded and salvaged.
 */
export function normalizeFateRun(value: unknown): FateRunState | null {
  if (!isRecord(value)
    || !boundedString(value.runId, 96)
    || !safeInt(value.startedAt)
    || !safeInt(value.seed)
    || (value.rngCursor !== undefined && !safeInt(value.rngCursor))
    || (value.cardBattleWins !== undefined && !safeInt(value.cardBattleWins))
    || (value.status !== 'ACTIVE' && value.status !== 'ENDED')
    || !safeInt(value.health)
    || !safeInt(value.maxHealth)
    || value.maxHealth < 1
    || value.maxHealth > 1_000_000
    || value.health > value.maxHealth
    || !safeInt(value.stage)
    || value.stage > 10_000
    || !Array.isArray(value.eventQueue)
    || (value.firedEventIds !== undefined && !Array.isArray(value.firedEventIds))
    || !Array.isArray(value.eventHistory)
    || (value.combatModifiers !== undefined && !Array.isArray(value.combatModifiers))
    || !isRecord(value.flags)) return null;

  const eventQueue = uniqueStrings(value.eventQueue, 100, 96);
  const eventHistory = value.eventHistory
    .filter(isFateHistoryEntry)
    .slice(-200)
    .map((entry) => ({ ...entry }));
  const combatModifiers = (value.combatModifiers ?? [])
    .filter(isFateCombatModifier)
    .slice(-8)
    .map((modifier) => ({ ...modifier }));
  const flags: Record<string, boolean> = {};
  for (const [key, flag] of Object.entries(value.flags).slice(0, 128)) {
    if (boundedString(key, 96) && typeof flag === 'boolean') flags[key] = flag;
  }
  const activeChallengeId = value.activeChallengeId === null || boundedString(value.activeChallengeId, 96)
    ? value.activeChallengeId
    : null;
  const activeChallengeBattleRunId = value.activeChallengeBattleRunId === null || boundedString(value.activeChallengeBattleRunId, 96)
    ? value.activeChallengeBattleRunId
    : null;
  const activeChallengeStartedAt = value.activeChallengeStartedAt === null || safeInt(value.activeChallengeStartedAt)
    ? value.activeChallengeStartedAt
    : null;
  const terminalOutcomeId = value.terminalOutcomeId === null || boundedString(value.terminalOutcomeId, 96)
    ? value.terminalOutcomeId
    : null;
  if (value.status === 'ACTIVE' && terminalOutcomeId !== null) return null;
  if (value.status === 'ENDED' && terminalOutcomeId === null) return null;

  return {
    runId: value.runId,
    startedAt: value.startedAt,
    seed: value.seed,
    rngCursor: safeInt(value.rngCursor) ? value.rngCursor : 0,
    cardBattleWins: safeInt(value.cardBattleWins) ? Math.min(value.cardBattleWins, 1_000_000) : 0,
    status: value.status,
    health: value.health,
    maxHealth: value.maxHealth,
    stage: value.stage,
    eventQueue,
    firedEventIds: uniqueStrings(value.firedEventIds, 256, 96),
    eventHistory,
    flags,
    combatModifiers,
    activeChallengeId,
    activeChallengeBattleRunId,
    activeChallengeStartedAt,
    terminalOutcomeId,
  };
}

export function normalizeRebirthMeta(value: unknown): RebirthMetaState {
  if (!isRecord(value)) return cloneRebirthMeta(DEFAULT_REBIRTH_META);
  const talentRanks: Partial<Record<keyof RebirthMetaState['talentRanks'], number>> = {};
  if (isRecord(value.talentRanks)) {
    for (const [talentId, rank] of Object.entries(value.talentRanks)) {
      if (FATE_TALENTS.has(talentId) && safeInt(rank) && rank > 0) {
        talentRanks[talentId as keyof RebirthMetaState['talentRanks']] = Math.min(6, rank);
      }
    }
  }
  return {
    karma: safeInt(value.karma) ? Math.min(MAX_KARMA, value.karma) : 0,
    talentRanks,
    unlockedEndings: uniqueStrings(value.unlockedEndings, 64, 96),
    settledRunIds: uniqueStrings(value.settledRunIds, 256, 96),
  };
}

export function cloneFateRun(value: FateRunState | null | undefined): FateRunState | null {
  return value ? {
    ...value,
    eventQueue: [...value.eventQueue],
    firedEventIds: [...value.firedEventIds],
    eventHistory: value.eventHistory.map((entry) => ({ ...entry })),
    flags: { ...value.flags },
    combatModifiers: value.combatModifiers.map((modifier) => ({ ...modifier })),
  } : null;
}

export function cloneRebirthMeta(value: RebirthMetaState | undefined): RebirthMetaState {
  const source = value ?? DEFAULT_REBIRTH_META;
  return {
    karma: source.karma,
    talentRanks: { ...source.talentRanks },
    unlockedEndings: [...source.unlockedEndings],
    settledRunIds: [...source.settledRunIds],
  };
}

function uniqueStrings(value: unknown, cap: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!boundedString(entry, maxLength) || seen.has(entry)) continue;
    result.push(entry);
    seen.add(entry);
    if (result.length >= cap) break;
  }
  return result;
}

function isFateHistoryEntry(value: unknown): value is { eventId: string; choiceId: string; resultId: string; resolvedAt: number } {
  return isRecord(value)
    && boundedString(value.eventId, 96)
    && boundedString(value.choiceId, 96)
    && boundedString(value.resultId, 96)
    && safeInt(value.resolvedAt);
}

function isFateCombatModifier(value: unknown): value is import('../model/save-data').FateCombatModifierState {
  return isRecord(value)
    && boundedString(value.id, 96)
    && safeInt(value.expiresAt)
    && isInRange(value.attackMultiplier, 0.25, 3)
    && isInRange(value.critChanceDelta, -0.5, 0.5)
    && isInRange(value.autoIntervalMultiplier, 0.25, 3)
    && isInRange(value.skillCooldownMultiplier, 0.25, 3);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}
function safeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function isInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
