import { FakeClock } from '../assets/scripts/core/clock';
import { GameContext } from '../assets/scripts/core/game-context';
import { PlayerData } from '../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../assets/scripts/services/storage-adapter';
import { RandomService, type Rng } from '../assets/scripts/v2/random-service';
import { OVERTIME_EVENTS } from '../assets/scripts/v3/overtime-content';
import { TECH_DEBT_DOMAINS } from '../assets/scripts/v3/tech-debt-service';

export type OvertimePolicy = 'ALWAYS' | 'NEVER' | 'SELECTIVE';

export interface OvertimeSimulationOptions {
  readonly seed: number;
  readonly workdays: number;
  readonly initialMind: number;
  readonly initialInnerDemon: number;
  readonly careerLevel?: number;
}

export interface OvertimePolicyMetrics {
  readonly salary: number;
  readonly performance: number;
  readonly cultivation: number;
  readonly totalRewards: number;
  readonly mindCost: number;
  readonly fatigueCost: number;
  readonly incidentExposure: number;
  readonly overtimeDays: number;
  readonly endingMind: number;
  readonly endingInnerDemon: number;
  readonly sustainableScore: number;
}

export type OvertimeSimulationResult = Readonly<Record<OvertimePolicy, OvertimePolicyMetrics>>;

interface Opportunity {
  readonly urgency: number;
  readonly durationHours: number;
  readonly paid: boolean;
  readonly performance: number;
  readonly cultivation: number;
  readonly eventMindCost: number;
  readonly demonCost: number;
}

interface DecisionState {
  readonly mind: number;
  readonly innerDemon: number;
  readonly consecutiveOvertimeDays: number;
  readonly incidentRisk: number;
}

const POLICIES: readonly OvertimePolicy[] = ['ALWAYS', 'NEVER', 'SELECTIVE'];
const BASE_TIMESTAMP = Date.UTC(2026, 0, 5, 18, 0, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Runs the same seeded opportunity stream through three overtime policies.
 * It is an analysis-only tool: production state and balance configuration are
 * read and exercised, but never changed.
 */
export function simulateOvertimePolicies(options: OvertimeSimulationOptions): OvertimeSimulationResult {
  const normalized = normalizeOptions(options);
  const result = {} as Record<OvertimePolicy, OvertimePolicyMetrics>;
  for (const policy of POLICIES) result[policy] = simulatePolicy(policy, normalized);
  return result;
}

/** The SELECTIVE policy is deliberately inspectable so balance changes remain explainable. */
export function shouldAcceptOvertime(
  policy: OvertimePolicy,
  opportunity: Readonly<Pick<Opportunity, 'urgency' | 'durationHours' | 'paid'>>,
  state: DecisionState,
): boolean {
  if (policy === 'ALWAYS') return true;
  if (policy === 'NEVER') return false;

  // A genuine emergency can still pull an unhealthy worker into overtime. This
  // is intentional: SELECTIVE is safer, not a disguised NEVER policy.
  const criticalOverride = opportunity.urgency >= 0.92 && state.incidentRisk <= 0.65;
  if (criticalOverride) return true;

  const requiredMind = 34 + opportunity.durationHours * 5;
  const worthwhile = opportunity.urgency >= 0.58 || (opportunity.paid && opportunity.urgency >= 0.42);
  return worthwhile
    && state.mind >= requiredMind
    && state.innerDemon < 70
    && state.consecutiveOvertimeDays < 2
    && state.incidentRisk < 0.45;
}

function simulatePolicy(policy: OvertimePolicy, options: Required<OvertimeSimulationOptions>): OvertimePolicyMetrics {
  const deterministic = new RandomService(forbiddenRuntimeRandom);
  const clock = new FakeClock(BASE_TIMESTAMP);
  const context = new GameContext({
    board: null,
    clock,
    storage: new MemoryStorageAdapter(),
    randomV2: deterministic,
    battleRng: deterministic.seeded(mixSeed(options.seed, 0x51f15e)).next,
    player: new PlayerData({
      lastSaveTime: BASE_TIMESTAMP,
      careerLevel: options.careerLevel,
      mind: options.initialMind,
      maxMind: 100,
      innerDemon: options.initialInnerDemon,
      workMode: 'WORK',
    }),
  });

  let salary = 0;
  let performance = 0;
  let cultivation = 0;
  let mindCost = 0;
  let fatigueCost = 0;
  let incidentExposure = 0;
  let overtimeDays = 0;
  let consecutiveOvertimeDays = 0;

  for (let dayIndex = 0; dayIndex < options.workdays; dayIndex += 1) {
    clock.set(BASE_TIMESTAMP + dayIndex * DAY_MS);
    const day = context.gameDay.ensureStarted();
    const opportunity = createOpportunity(deterministic.seeded(mixSeed(options.seed, dayIndex + 1)));
    const incidentRisk = context.incidents.currentRisk();
    const accepts = shouldAcceptOvertime(policy, opportunity, {
      mind: context.mind.current,
      innerDemon: context.innerDemon.value(),
      consecutiveOvertimeDays,
      incidentRisk,
    });

    if (accepts) {
      overtimeDays += 1;
      consecutiveOvertimeDays += 1;
      const durationSeconds = opportunity.durationHours * 3600;
      const salaryBefore = context.player.salary;
      context.overtime.startVoluntary(durationSeconds, opportunity.paid);
      context.overtime.tick(durationSeconds);
      context.overtime.finish();
      salary += context.player.salary - salaryBefore;

      const situation = context.gameDay.aggregateEffects();
      performance += opportunity.performance * situation.workPerformanceMul * context.innerDemon.performanceMultiplier();
      cultivation += opportunity.cultivation * situation.cultivationMul;

      const baseMindCost = Math.ceil(opportunity.durationHours * (1.5 + opportunity.urgency * 2));
      const requestedMindCost = baseMindCost + opportunity.eventMindCost;
      const appliedMindCost = -context.mind.applyDelta(-requestedMindCost);
      mindCost += appliedMindCost;
      context.innerDemon.add(opportunity.demonCost + (context.mind.current < 30 ? 2 : 0));

      fatigueCost += opportunity.durationHours * (1 + 0.25 * Math.max(0, consecutiveOvertimeDays - 1));
      context.techDebt.add(TECH_DEBT_DOMAINS[dayIndex % TECH_DEBT_DOMAINS.length], 4 + Math.ceil(opportunity.urgency * 8));
      incidentExposure += context.incidents.currentRisk() * (1 + opportunity.durationHours / 4);
    } else {
      consecutiveOvertimeDays = 0;
      context.mind.applyDelta(6);
      context.innerDemon.reduce(2);
      context.techDebt.repay(TECH_DEBT_DOMAINS[dayIndex % TECH_DEBT_DOMAINS.length], 5);
      incidentExposure += context.incidents.currentRisk() * 0.25;
    }

    context.gameDay.markSettled();
    // Keep the actual GameDayService lifecycle in control of the next index.
    if (context.player.gameDay?.dayIndex !== day.dayIndex) throw new Error('Unexpected workday mutation');
  }

  const roundedSalary = round(salary);
  const roundedPerformance = round(performance);
  const roundedCultivation = round(cultivation);
  const roundedMindCost = round(mindCost);
  const roundedFatigueCost = round(fatigueCost);
  const roundedExposure = round(incidentExposure);
  const totalRewards = round(roundedSalary + roundedPerformance + roundedCultivation);
  const endingMind = context.mind.current;
  const endingInnerDemon = context.innerDemon.value();
  const sustainableScore = round(Math.max(0,
    1000
      + roundedSalary * 0.08
      + roundedPerformance * 4
      + roundedCultivation * 3
      + endingMind * 2
      - endingInnerDemon * 4
      - roundedMindCost * 2.5
      - roundedFatigueCost * 8
      - roundedExposure * 150,
  ));

  return {
    salary: roundedSalary,
    performance: roundedPerformance,
    cultivation: roundedCultivation,
    totalRewards,
    mindCost: roundedMindCost,
    fatigueCost: roundedFatigueCost,
    incidentExposure: roundedExposure,
    overtimeDays,
    endingMind,
    endingInnerDemon,
    sustainableScore,
  };
}

function createOpportunity(rng: Rng): Opportunity {
  const overtimeEvents = OVERTIME_EVENTS.filter((event) => event.requiresOvertime && event.baseWeight > 0);
  const event = overtimeEvents[rng.int(0, overtimeEvents.length - 1)];
  const choices = event?.choices ?? [];
  const choice = choices[rng.int(0, Math.max(0, choices.length - 1))];
  const effects = choice?.effects ?? {};
  return {
    urgency: round(rng.next()),
    durationHours: rng.int(2, 4),
    paid: rng.chance(0.7),
    performance: Math.max(0, effects.performance ?? 0),
    cultivation: Math.max(0, effects.cultivation ?? 0),
    eventMindCost: Math.max(0, -(effects.mind ?? 0)),
    demonCost: Math.max(1, effects.innerDemon ?? 0),
  };
}

function normalizeOptions(options: OvertimeSimulationOptions): Required<OvertimeSimulationOptions> {
  assertIntegerInRange('seed', options.seed, 0, 0xffff_ffff);
  assertIntegerInRange('workdays', options.workdays, 1, 365);
  assertIntegerInRange('initialMind', options.initialMind, 0, 100);
  assertIntegerInRange('initialInnerDemon', options.initialInnerDemon, 0, 100);
  const careerLevel = options.careerLevel ?? 1;
  assertIntegerInRange('careerLevel', careerLevel, 1, 6);
  return { ...options, careerLevel };
}

function assertIntegerInRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  }
}

function mixSeed(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function forbiddenRuntimeRandom(): never {
  throw new Error('The overtime balance simulator requires a seeded RNG');
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function readNumericArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix));
  return raw ? Number(raw.slice(prefix.length)) : fallback;
}

if (require.main === module) {
  const result = simulateOvertimePolicies({
    seed: readNumericArg('seed', 417),
    workdays: readNumericArg('days', 30),
    initialMind: readNumericArg('mind', 80),
    initialInnerDemon: readNumericArg('demon', 10),
    careerLevel: readNumericArg('career', 3),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
