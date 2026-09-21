import { FakeClock } from '../assets/scripts/core/clock';
import { GameContext } from '../assets/scripts/core/game-context';
import { PlayerData } from '../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../assets/scripts/services/storage-adapter';
import { RewardAdPolicy } from '../assets/scripts/services/reward-ad-policy';
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
  readonly paidOvertimeHours: number;
  readonly freeOvertimeHours: number;
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

export const BALANCE_HORIZONS = [7, 30, 60] as const;
export const BALANCE_STATUS_PRECEDENCE = ['FAIL', 'WARN', 'PASS'] as const;

export type BalanceHorizon = typeof BALANCE_HORIZONS[number];
export type BalanceStatus = typeof BALANCE_STATUS_PRECEDENCE[number];
export type TechDebtStrategy = 'RUSH' | 'QUALITY' | 'BALANCED';
export type PersonalityStrategy = 'GRINDER' | 'NORMAL' | 'SLACKER';
export type BalanceCriterion =
  | 'FREE_OVERTIME'
  | 'ALWAYS_DOMINANCE'
  | 'NEVER_VIABLE'
  | 'MIND_LOCK'
  | 'DEAD_END'
  | 'AD_FREQ'
  | 'AD_ECONOMY'
  | 'CAREER_PACING';

export interface BalanceProfile {
  readonly seed: number;
  readonly initialState: {
    readonly mind: number;
    readonly innerDemon: number;
    readonly careerLevel: number;
    readonly averageTechDebt: number;
    readonly salary: number;
    readonly performance: number;
  };
  readonly cadence: {
    readonly startsOn: 'MONDAY';
    readonly workdaysPerWeek: 5;
    readonly recoveryDaysPerWeek: 2;
    readonly standardWorkHours: 8;
    readonly overtimeOpportunityPerWorkday: 1;
    readonly recoveryMindPerDay: 10;
    readonly recoveryInnerDemonPerDay: 3;
    readonly adSpacingSeconds: 120;
  };
}

export const DEFAULT_BALANCE_PROFILE: BalanceProfile = Object.freeze({
  seed: 20260921,
  initialState: Object.freeze({
    mind: 80,
    innerDemon: 10,
    careerLevel: 1,
    averageTechDebt: 8,
    salary: 0,
    performance: 0,
  }),
  cadence: Object.freeze({
    startsOn: 'MONDAY',
    workdaysPerWeek: 5,
    recoveryDaysPerWeek: 2,
    standardWorkHours: 8,
    overtimeOpportunityPerWorkday: 1,
    recoveryMindPerDay: 10,
    recoveryInnerDemonPerDay: 3,
    adSpacingSeconds: 120,
  }),
});

interface HighBadThreshold {
  readonly direction: 'HIGH_BAD';
  readonly warnAt: number;
  readonly failAt: number;
  readonly unit: string;
}

interface BandThreshold {
  readonly direction: 'BAND';
  readonly passMin: number;
  readonly passMax: number;
  readonly warnMin: number;
  readonly warnMax: number;
  readonly unit: string;
}

type BalanceThreshold = HighBadThreshold | BandThreshold;

/** Numeric thresholds are intentionally exported so reports cannot invent qualitative verdicts. */
export const BALANCE_THRESHOLDS: Readonly<Record<BalanceCriterion, BalanceThreshold>> = Object.freeze({
  FREE_OVERTIME: { direction: 'HIGH_BAD', warnAt: 24, failAt: 48, unit: 'hours/60d' },
  ALWAYS_DOMINANCE: { direction: 'HIGH_BAD', warnAt: 5, failAt: 15, unit: 'score advantage %' },
  NEVER_VIABLE: { direction: 'HIGH_BAD', warnAt: 35, failAt: 60, unit: 'score gap %' },
  MIND_LOCK: { direction: 'HIGH_BAD', warnAt: 1, failAt: 1, unit: 'max consecutive days' },
  DEAD_END: { direction: 'HIGH_BAD', warnAt: 1, failAt: 1, unit: 'strategies without promotion' },
  AD_FREQ: { direction: 'HIGH_BAD', warnAt: 6, failAt: 10, unit: 'ads/day' },
  AD_ECONOMY: { direction: 'HIGH_BAD', warnAt: 20, failAt: 35, unit: 'ad salary share %' },
  CAREER_PACING: { direction: 'BAND', passMin: 5, passMax: 14, warnMin: 3, warnMax: 21, unit: 'first promotion day' },
});

export interface TechDebtMetrics {
  readonly calendarDays: number;
  readonly workdays: number;
  readonly endingAverageDebt: number;
  readonly peakAverageDebt: number;
  readonly debtRepaid: number;
  readonly throughput: number;
  readonly incidentCount: number;
  readonly sustainableScore: number;
}

export interface PersonalityMetrics {
  readonly calendarDays: number;
  readonly workdays: number;
  readonly salary: number;
  readonly adRewardSalary: number;
  readonly adRewardSharePercent: number;
  readonly adViews: number;
  readonly maxAdsPerDay: number;
  readonly overtimeHours: number;
  readonly freeOvertimeHours: number;
  readonly endingMind: number;
  readonly zeroMindDays: number;
  readonly maxConsecutiveZeroMindDays: number;
  readonly endingCareerLevel: number;
  readonly firstPromotionDay: number | null;
  readonly performance: number;
  readonly sustainableScore: number;
}

export interface MatrixOvertimeMetrics extends OvertimePolicyMetrics {
  readonly calendarDays: number;
  readonly workdays: number;
}

export interface CriterionEvidence {
  readonly status: BalanceStatus;
  readonly value: number;
  readonly unit: string;
  readonly thresholds: readonly number[];
}

export interface BalanceMatrixResult {
  readonly profile: BalanceProfile;
  readonly overtime: Readonly<Record<BalanceHorizon, Readonly<Record<OvertimePolicy, MatrixOvertimeMetrics>>>>;
  readonly techDebt: Readonly<Record<BalanceHorizon, Readonly<Record<TechDebtStrategy, TechDebtMetrics>>>>;
  readonly personality: Readonly<Record<BalanceHorizon, Readonly<Record<PersonalityStrategy, PersonalityMetrics>>>>;
  readonly criteria: Readonly<Record<BalanceCriterion, CriterionEvidence>>;
  readonly overallStatus: BalanceStatus;
}

export interface BalanceMatrixOptions {
  readonly seed?: number;
}

const TECH_DEBT_STRATEGIES: readonly TechDebtStrategy[] = ['RUSH', 'QUALITY', 'BALANCED'];
const PERSONALITIES: readonly PersonalityStrategy[] = ['GRINDER', 'NORMAL', 'SLACKER'];
const CRITERIA: readonly BalanceCriterion[] = [
  'FREE_OVERTIME',
  'ALWAYS_DOMINANCE',
  'NEVER_VIABLE',
  'MIND_LOCK',
  'DEAD_END',
  'AD_FREQ',
  'AD_ECONOMY',
  'CAREER_PACING',
];

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

function simulatePolicy(
  policy: OvertimePolicy,
  options: Required<OvertimeSimulationOptions>,
  calendarDayOffsets: readonly number[] = Array.from({ length: options.workdays }, (_, index) => index),
): OvertimePolicyMetrics {
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
  let paidOvertimeHours = 0;
  let freeOvertimeHours = 0;
  let consecutiveOvertimeDays = 0;
  let previousCalendarDayIndex = -1;

  for (let opportunityIndex = 0; opportunityIndex < calendarDayOffsets.length; opportunityIndex += 1) {
    const calendarDayIndex = calendarDayOffsets[opportunityIndex];
    const recoveryDays = Math.max(0, calendarDayIndex - previousCalendarDayIndex - 1);
    if (recoveryDays > 0) {
      consecutiveOvertimeDays = 0;
      context.mind.applyDelta(recoveryDays * DEFAULT_BALANCE_PROFILE.cadence.recoveryMindPerDay);
      context.innerDemon.reduce(recoveryDays * DEFAULT_BALANCE_PROFILE.cadence.recoveryInnerDemonPerDay);
    }
    previousCalendarDayIndex = calendarDayIndex;
    clock.set(BASE_TIMESTAMP + calendarDayIndex * DAY_MS);
    const day = context.gameDay.ensureStarted();
    const opportunity = createOpportunity(deterministic.seeded(mixSeed(options.seed, calendarDayIndex + 1)));
    const incidentRisk = context.incidents.currentRisk();
    const accepts = shouldAcceptOvertime(policy, opportunity, {
      mind: context.mind.current,
      innerDemon: context.innerDemon.value(),
      consecutiveOvertimeDays,
      incidentRisk,
    });

    if (accepts) {
      overtimeDays += 1;
      if (opportunity.paid) paidOvertimeHours += opportunity.durationHours;
      else freeOvertimeHours += opportunity.durationHours;
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
      context.techDebt.add(TECH_DEBT_DOMAINS[opportunityIndex % TECH_DEBT_DOMAINS.length], 4 + Math.ceil(opportunity.urgency * 8));
      incidentExposure += context.incidents.currentRisk() * (1 + opportunity.durationHours / 4);
    } else {
      consecutiveOvertimeDays = 0;
      context.mind.applyDelta(6);
      context.innerDemon.reduce(2);
      context.techDebt.repay(TECH_DEBT_DOMAINS[opportunityIndex % TECH_DEBT_DOMAINS.length], 5);
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
    paidOvertimeHours,
    freeOvertimeHours,
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

/**
 * Builds the complete analysis-only matrix. A horizon is a calendar-day count;
 * day zero is Monday, so 7/30/60 days contain 5/22/44 workdays respectively.
 */
export function generateBalanceMatrix(options: BalanceMatrixOptions = {}): BalanceMatrixResult {
  const seed = options.seed ?? DEFAULT_BALANCE_PROFILE.seed;
  assertIntegerInRange('seed', seed, 0, 0xffff_ffff);
  const profile: BalanceProfile = {
    seed,
    initialState: { ...DEFAULT_BALANCE_PROFILE.initialState },
    cadence: { ...DEFAULT_BALANCE_PROFILE.cadence },
  };
  const overtime = {} as Record<BalanceHorizon, Record<OvertimePolicy, MatrixOvertimeMetrics>>;
  const techDebt = {} as Record<BalanceHorizon, Record<TechDebtStrategy, TechDebtMetrics>>;
  const personality = {} as Record<BalanceHorizon, Record<PersonalityStrategy, PersonalityMetrics>>;

  for (const calendarDays of BALANCE_HORIZONS) {
    const workdays = countWorkdays(calendarDays);
    const overtimeOptions = normalizeOptions({
      seed,
      workdays,
      initialMind: profile.initialState.mind,
      initialInnerDemon: profile.initialState.innerDemon,
      careerLevel: profile.initialState.careerLevel,
    });
    const workdayOffsets = Array.from({ length: calendarDays }, (_, index) => index).filter(isCadenceWorkday);
    const overtimeRun: OvertimeSimulationResult = {
      ALWAYS: simulatePolicy('ALWAYS', overtimeOptions, workdayOffsets),
      NEVER: simulatePolicy('NEVER', overtimeOptions, workdayOffsets),
      SELECTIVE: simulatePolicy('SELECTIVE', overtimeOptions, workdayOffsets),
    };
    overtime[calendarDays] = {
      ALWAYS: { calendarDays, workdays, ...overtimeRun.ALWAYS },
      NEVER: { calendarDays, workdays, ...overtimeRun.NEVER },
      SELECTIVE: { calendarDays, workdays, ...overtimeRun.SELECTIVE },
    };

    const debtCells = {} as Record<TechDebtStrategy, TechDebtMetrics>;
    for (const strategy of TECH_DEBT_STRATEGIES) {
      debtCells[strategy] = simulateTechDebtStrategy(strategy, calendarDays, profile);
    }
    techDebt[calendarDays] = debtCells;

    const personalityCells = {} as Record<PersonalityStrategy, PersonalityMetrics>;
    for (const strategy of PERSONALITIES) {
      personalityCells[strategy] = simulatePersonality(strategy, calendarDays, profile);
    }
    personality[calendarDays] = personalityCells;
  }

  const criteria = createCriterionEvidence(overtime, personality);
  const overallStatus = CRITERIA.reduce<BalanceStatus>(
    (worst, criterion) => worseStatus(worst, criteria[criterion].status),
    'PASS',
  );
  return { profile, overtime, techDebt, personality, criteria, overallStatus };
}

function simulateTechDebtStrategy(
  strategy: TechDebtStrategy,
  calendarDays: BalanceHorizon,
  profile: BalanceProfile,
): TechDebtMetrics {
  const context = createAnalysisContext(profile, 0xd3b7);
  const rngService = new RandomService(forbiddenRuntimeRandom);
  let workdays = 0;
  let peakAverageDebt = context.techDebt.average();
  let debtRepaid = 0;
  let throughput = 0;
  let incidentCount = 0;

  for (let dayIndex = 0; dayIndex < calendarDays; dayIndex += 1) {
    const isWorkday = isCadenceWorkday(dayIndex);
    if (!isWorkday) {
      for (const domain of TECH_DEBT_DOMAINS) debtRepaid += context.techDebt.repay(domain, 2);
      peakAverageDebt = Math.max(peakAverageDebt, context.techDebt.average());
      continue;
    }

    workdays += 1;
    const rng = rngService.seeded(mixSeed(profile.seed, 0xd3b700 + dayIndex));
    const domain = TECH_DEBT_DOMAINS[dayIndex % TECH_DEBT_DOMAINS.length];
    if (strategy === 'RUSH') {
      context.techDebt.add(domain, rng.int(8, 13));
      throughput += rng.int(138, 152);
    } else if (strategy === 'QUALITY') {
      context.techDebt.add(domain, 2);
      debtRepaid += context.techDebt.repay(domain, 8);
      throughput += rng.int(100, 112);
    } else {
      context.techDebt.add(domain, rng.int(4, 7));
      if (workdays % 2 === 0) debtRepaid += context.techDebt.repay(domain, 5);
      throughput += rng.int(118, 132);
    }
    if (rng.chance(context.incidents.currentRisk())) incidentCount += 1;
    peakAverageDebt = Math.max(peakAverageDebt, context.techDebt.average());
  }

  const endingAverageDebt = round(context.techDebt.average());
  const sustainableScore = round(Math.max(0,
    throughput - endingAverageDebt * 8 - peakAverageDebt * 3 - incidentCount * 85 + debtRepaid * 2,
  ));
  return {
    calendarDays,
    workdays,
    endingAverageDebt,
    peakAverageDebt: round(peakAverageDebt),
    debtRepaid,
    throughput,
    incidentCount,
    sustainableScore,
  };
}

function simulatePersonality(
  strategy: PersonalityStrategy,
  calendarDays: BalanceHorizon,
  profile: BalanceProfile,
): PersonalityMetrics {
  const context = createAnalysisContext(profile, 0xa44d);
  const random = new RandomService(forbiddenRuntimeRandom);
  let currentTime = BASE_TIMESTAMP;
  const adPolicy = new RewardAdPolicy(() => currentTime);
  let workdays = 0;
  let salary = 0;
  let adRewardSalary = 0;
  let adViews = 0;
  let maxAdsPerDay = 0;
  let overtimeHours = 0;
  let freeOvertimeHours = 0;
  let zeroMindDays = 0;
  let consecutiveZeroMindDays = 0;
  let maxConsecutiveZeroMindDays = 0;
  let firstPromotionDay: number | null = null;

  for (let dayIndex = 0; dayIndex < calendarDays; dayIndex += 1) {
    currentTime = BASE_TIMESTAMP + dayIndex * DAY_MS;
    adPolicy.resetSession();
    const rng = random.seeded(mixSeed(profile.seed, 0xa44d00 + dayIndex));
    const isWorkday = isCadenceWorkday(dayIndex);
    let dailyAds = 0;

    if (isWorkday) {
      workdays += 1;
      const workHours = strategy === 'GRINDER' ? 9 : strategy === 'NORMAL' ? 8 : 5;
      const basePerformance = strategy === 'GRINDER' ? 75 : strategy === 'NORMAL' ? 55 : 35;
      salary += workHours * 20;
      context.player.performance += basePerformance;
      context.mind.applyDelta(strategy === 'GRINDER' ? -10 : strategy === 'NORMAL' ? -7 : -2);

      const paid = rng.chance(0.7);
      const acceptsOvertime = strategy === 'GRINDER'
        ? context.mind.current >= 30
        : strategy === 'NORMAL' && paid && context.mind.current >= 45 && rng.chance(0.55);
      if (acceptsOvertime) {
        overtimeHours += 2;
        context.player.performance += 15;
        context.mind.applyDelta(strategy === 'GRINDER' ? -5 : -3);
        if (paid) salary += 50;
        else freeOvertimeHours += 2;
      }

      if (context.career.canPromote()) {
        context.career.promote();
        if (firstPromotionDay === null) firstPromotionDay = dayIndex + 1;
      }
    } else {
      context.mind.applyDelta(strategy === 'GRINDER' ? 40 : strategy === 'NORMAL' ? 25 : 30);
    }

    const requestedAds = strategy === 'GRINDER' ? 7 : strategy === 'NORMAL' ? 3 : 2;
    for (let requestIndex = 0; requestIndex < requestedAds; requestIndex += 1) {
      currentTime += profile.cadence.adSpacingSeconds * 1000;
      if (!adPolicy.check().allowed) continue;
      adPolicy.recordShown();
      adViews += 1;
      dailyAds += 1;
      adRewardSalary += 10;
      salary += 10;
      if ((requestIndex + 1) % 3 === 0) context.mind.applyDelta(3);
    }
    maxAdsPerDay = Math.max(maxAdsPerDay, dailyAds);

    if (context.mind.current === 0) {
      zeroMindDays += 1;
      consecutiveZeroMindDays += 1;
      maxConsecutiveZeroMindDays = Math.max(maxConsecutiveZeroMindDays, consecutiveZeroMindDays);
    } else {
      consecutiveZeroMindDays = 0;
    }
  }

  const adRewardSharePercent = salary === 0 ? 0 : round(adRewardSalary / salary * 100);
  const sustainableScore = round(Math.max(0,
    salary
      + context.player.performance * 3
      + context.mind.current * 8
      + context.player.careerLevel * 250
      - freeOvertimeHours * 35
      - zeroMindDays * 300
      - adRewardSharePercent * 8,
  ));
  return {
    calendarDays,
    workdays,
    salary,
    adRewardSalary,
    adRewardSharePercent,
    adViews,
    maxAdsPerDay,
    overtimeHours,
    freeOvertimeHours,
    endingMind: context.mind.current,
    zeroMindDays,
    maxConsecutiveZeroMindDays,
    endingCareerLevel: context.player.careerLevel,
    firstPromotionDay,
    performance: context.player.performance,
    sustainableScore,
  };
}

function createCriterionEvidence(
  overtime: Readonly<Record<BalanceHorizon, Readonly<Record<OvertimePolicy, MatrixOvertimeMetrics>>>>,
  personality: Readonly<Record<BalanceHorizon, Readonly<Record<PersonalityStrategy, PersonalityMetrics>>>>,
): Record<BalanceCriterion, CriterionEvidence> {
  const longOvertime = overtime[60];
  const longPersonality = personality[60];
  const bestOvertimeScore = Math.max(...POLICIES.map((policy) => longOvertime[policy].sustainableScore), 1);
  const values: Record<BalanceCriterion, number> = {
    FREE_OVERTIME: longOvertime.ALWAYS.freeOvertimeHours,
    ALWAYS_DOMINANCE: round(Math.max(0,
      (longOvertime.ALWAYS.sustainableScore - longOvertime.SELECTIVE.sustainableScore)
        / Math.max(1, longOvertime.SELECTIVE.sustainableScore) * 100,
    )),
    NEVER_VIABLE: round(Math.max(0,
      (bestOvertimeScore - longOvertime.NEVER.sustainableScore) / bestOvertimeScore * 100,
    )),
    MIND_LOCK: Math.max(...PERSONALITIES.map((strategy) => longPersonality[strategy].maxConsecutiveZeroMindDays)),
    DEAD_END: PERSONALITIES.filter((strategy) => longPersonality[strategy].endingCareerLevel <= DEFAULT_BALANCE_PROFILE.initialState.careerLevel).length,
    AD_FREQ: Math.max(...PERSONALITIES.map((strategy) => longPersonality[strategy].maxAdsPerDay)),
    AD_ECONOMY: round(Math.max(...PERSONALITIES.map((strategy) => longPersonality[strategy].adRewardSharePercent))),
    CAREER_PACING: longPersonality.NORMAL.firstPromotionDay ?? 60,
  };
  return {
    FREE_OVERTIME: evidenceFor('FREE_OVERTIME', values.FREE_OVERTIME),
    ALWAYS_DOMINANCE: evidenceFor('ALWAYS_DOMINANCE', values.ALWAYS_DOMINANCE),
    NEVER_VIABLE: evidenceFor('NEVER_VIABLE', values.NEVER_VIABLE),
    MIND_LOCK: evidenceFor('MIND_LOCK', values.MIND_LOCK),
    DEAD_END: evidenceFor('DEAD_END', values.DEAD_END),
    AD_FREQ: evidenceFor('AD_FREQ', values.AD_FREQ),
    AD_ECONOMY: evidenceFor('AD_ECONOMY', values.AD_ECONOMY),
    CAREER_PACING: evidenceFor('CAREER_PACING', values.CAREER_PACING),
  };
}

function evidenceFor(criterion: BalanceCriterion, value: number): CriterionEvidence {
  const threshold = BALANCE_THRESHOLDS[criterion];
  const status = evaluateBalanceStatus(criterion, value);
  if (threshold.direction === 'HIGH_BAD') {
    return { status, value, unit: threshold.unit, thresholds: [threshold.warnAt, threshold.failAt] };
  }
  return {
    status,
    value,
    unit: threshold.unit,
    thresholds: [threshold.passMin, threshold.passMax, threshold.warnMin, threshold.warnMax],
  };
}

/** Evaluates FAIL first, then WARN, then PASS, including overlapping binary thresholds. */
export function evaluateBalanceStatus(criterion: BalanceCriterion, value: number): BalanceStatus {
  if (!Number.isFinite(value)) throw new Error(`${criterion} value must be finite`);
  const threshold = BALANCE_THRESHOLDS[criterion];
  if (threshold.direction === 'HIGH_BAD') {
    if (value >= threshold.failAt) return 'FAIL';
    if (value >= threshold.warnAt) return 'WARN';
    return 'PASS';
  }
  if (value < threshold.warnMin || value > threshold.warnMax) return 'FAIL';
  if (value < threshold.passMin || value > threshold.passMax) return 'WARN';
  return 'PASS';
}

function createAnalysisContext(profile: BalanceProfile, salt: number): GameContext {
  const clock = new FakeClock(BASE_TIMESTAMP);
  const deterministic = new RandomService(forbiddenRuntimeRandom);
  const debt = Object.fromEntries(TECH_DEBT_DOMAINS.map((domain) => [domain, profile.initialState.averageTechDebt]));
  return new GameContext({
    board: null,
    clock,
    storage: new MemoryStorageAdapter(),
    randomV2: deterministic,
    battleRng: deterministic.seeded(mixSeed(profile.seed, salt)).next,
    player: new PlayerData({
      lastSaveTime: BASE_TIMESTAMP,
      careerLevel: profile.initialState.careerLevel,
      mind: profile.initialState.mind,
      maxMind: 100,
      innerDemon: profile.initialState.innerDemon,
      salary: profile.initialState.salary,
      performance: profile.initialState.performance,
      technicalDebt: debt,
      workMode: 'WORK',
    }),
  });
}

function countWorkdays(calendarDays: number): number {
  let count = 0;
  for (let dayIndex = 0; dayIndex < calendarDays; dayIndex += 1) {
    if (isCadenceWorkday(dayIndex)) count += 1;
  }
  return count;
}

function isCadenceWorkday(dayIndex: number): boolean {
  return dayIndex % 7 < DEFAULT_BALANCE_PROFILE.cadence.workdaysPerWeek;
}

function worseStatus(left: BalanceStatus, right: BalanceStatus): BalanceStatus {
  return BALANCE_STATUS_PRECEDENCE.indexOf(left) <= BALANCE_STATUS_PRECEDENCE.indexOf(right) ? left : right;
}

function readNumericArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix));
  return raw ? Number(raw.slice(prefix.length)) : fallback;
}

if (require.main === module) {
  const result = generateBalanceMatrix({ seed: readNumericArg('seed', DEFAULT_BALANCE_PROFILE.seed) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
