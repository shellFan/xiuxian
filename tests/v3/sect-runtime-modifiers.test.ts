import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import type { SectId, SectModifiers } from '../../assets/scripts/model/config-types';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { ConfigService, ConfigValidationError } from '../../assets/scripts/services/config-service';
import type { EventDefinition } from '../../assets/scripts/v2/event-engine';
import { EVENTS } from '../../assets/scripts/v2/v2-event-service';

const NOW = new Date(2026, 8, 21, 18, 0, 0, 0).getTime();
const baseContext = new GameContext({ board: null, clock: new FakeClock(NOW), player: new PlayerData() });

function configWithSectModifiers(overrides: Partial<Record<SectId, Partial<SectModifiers>>>): ConfigService {
  const base = baseContext.configService;
  return ConfigService.load({
    worker: base.worker,
    economy: base.economy,
    game: base.game,
    sect: {
      sects: base.sect.sects.map((sect) => ({
        ...sect,
        modifiers: { ...sect.modifiers, ...overrides[sect.id] },
      })),
    },
  });
}

function contextFor(sectId: SectId, overrides: Partial<Record<SectId, Partial<SectModifiers>>>): GameContext {
  const clock = new FakeClock(NOW);
  const context = new GameContext({
    board: null,
    clock,
    configService: configWithSectModifiers(overrides),
    player: new PlayerData({ lastSaveTime: clock.now(), sectId }),
  });
  context.gameDay.ensureStarted();
  return context;
}

function paidCompensatedHour(context: GameContext, free = false): number {
  context.overtime.offer('COMPENSATED', free, 3600);
  context.overtime.accept('WORK');
  context.overtime.tick(3600);
  return context.overtime.paidOvertimeSalary(context.overtime.current()!);
}

function candidateWeights(context: GameContext): Map<string, number> {
  let candidates: readonly EventDefinition[] | undefined;
  const scheduler = (context.v2Events as unknown as {
    scheduler: {
      isDue(nowMs: number, dayIndex: number): boolean;
      pick(defs: readonly EventDefinition[]): EventDefinition | null;
      scheduleNext(nowMs: number): void;
    };
  }).scheduler;
  scheduler.isDue = () => true;
  scheduler.pick = (defs) => {
    candidates = defs;
    return null;
  };
  scheduler.scheduleNext = () => undefined;
  context.v2Events.poll();
  assert.ok(candidates, 'event poll must pass candidates to the scheduler');
  return new Map(candidates.map((event) => [event.id, event.baseWeight]));
}

function testSectOvertimePayMultipliersAndFreeOvertime(): void {
  const modifiers: Partial<Record<SectId, Partial<SectModifiers>>> = {
    PRIVATE: { overtimePayMultiplier: 1.20 },
    FOREIGN: { overtimePayMultiplier: 0.90 },
    STATE: { overtimePayMultiplier: 0.80 },
    BIG_TECH: { overtimePayMultiplier: 1.35 },
  };
  assert.equal(paidCompensatedHour(contextFor('PRIVATE', modifiers)), 24);
  assert.equal(paidCompensatedHour(contextFor('FOREIGN', modifiers)), 18);
  assert.equal(paidCompensatedHour(contextFor('STATE', modifiers)), 16);
  assert.equal(paidCompensatedHour(contextFor('BIG_TECH', modifiers)), 27);
  assert.equal(paidCompensatedHour(contextFor('BIG_TECH', modifiers), true), 0, 'free overtime remains unpaid');
}

function testLegacySectConfigDefaultsOvertimePayToOne(): void {
  assert.equal(paidCompensatedHour(contextFor('PRIVATE', { PRIVATE: { overtimePayMultiplier: undefined } })), 20);
}

function testIncidentRiskScalesOnlyBugCandidateWeights(): void {
  const riskBySect: Record<SectId, number> = { PRIVATE: 1.15, FOREIGN: 0.85, STATE: 0.70, BIG_TECH: 1.25 };
  const sourceBug = EVENTS.find((event) => event.category === 'BUG');
  const sourceNonBug = EVENTS.find((event) => event.category !== 'BUG');
  assert.ok(sourceBug);
  assert.ok(sourceNonBug);

  for (const [sectId, incidentRiskMultiplier] of Object.entries(riskBySect) as [SectId, number][]) {
    const weights = candidateWeights(contextFor(sectId, { [sectId]: { incidentRiskMultiplier } }));
    assert.equal(weights.get(sourceBug.id), sourceBug.baseWeight * incidentRiskMultiplier, `${sectId} BUG weight`);
    assert.equal(weights.get(sourceNonBug.id), sourceNonBug.baseWeight, `${sectId} non-BUG weight`);
  }
}

function testLegacySectConfigDefaultsIncidentRiskToOne(): void {
  const sourceBug = EVENTS.find((event) => event.category === 'BUG');
  assert.ok(sourceBug);
  const weights = candidateWeights(contextFor('PRIVATE', { PRIVATE: { incidentRiskMultiplier: undefined } }));
  assert.equal(weights.get(sourceBug.id), sourceBug.baseWeight);
}

function testSectRuntimeMultipliersMustBeFiniteAndNonNegative(): void {
  for (const [key, value] of [
    ['overtimePayMultiplier', -0.01],
    ['overtimePayMultiplier', Number.POSITIVE_INFINITY],
    ['incidentRiskMultiplier', -0.01],
    ['incidentRiskMultiplier', Number.NaN],
  ] as const) {
    assert.throws(
      () => configWithSectModifiers({ PRIVATE: { [key]: value } }),
      (error: unknown) => error instanceof ConfigValidationError && error.message.includes(key),
      `${key}=${String(value)} must be rejected`,
    );
  }
}

testSectOvertimePayMultipliersAndFreeOvertime();
testLegacySectConfigDefaultsOvertimePayToOne();
testIncidentRiskScalesOnlyBugCandidateWeights();
testLegacySectConfigDefaultsIncidentRiskToOne();
testSectRuntimeMultipliersMustBeFiniteAndNonNegative();
console.log('sect runtime modifier tests passed');
