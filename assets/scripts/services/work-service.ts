import idleConfig from '../../configs/idle.json';
import type { GameContext } from '../core/game-context';
import type { WorkMode } from '../model/save-data';

export interface WorkServiceOptions {
  readonly salaryPerHour?: number | readonly number[];
  readonly cultivationPerHour?: number | readonly number[];
  /** 旧版语义： magnitude，WORK/CULTIVATING 取负、FISHING/SOCIAL 取正。缺省用 MODE_RULES。 */
  readonly mindPerHour?: number;
  /** 每模式倍率覆写（余数机制测试注入旧倍率用）。 */
  readonly modeMultipliers?: Partial<Record<WorkMode, { salaryMul?: number; cultivationMul?: number }>>;
}

export interface WorkTickResult {
  readonly salary: number;
  readonly cultivationExp: number;
  readonly mind: number;
  readonly elapsedSeconds: number;
  readonly mode: WorkMode;
}

/**
 * V2 四模式经济表（§19~§22）。
 * salary/cultivation 为基础率的倍率；mindPerHour 为道心每小时变化（负=流失）。
 */
export const MODE_RULES: Record<WorkMode, {
  secondsKey: 'workSeconds' | 'fishingSeconds' | 'cultivatingSeconds' | 'socialSeconds';
  salaryMul: number;
  cultivationMul: number;
  mindPerHour: number;
}> = {
  WORK: { secondsKey: 'workSeconds', salaryMul: 1.3, cultivationMul: 0.8, mindPerHour: -12 },
  FISHING: { secondsKey: 'fishingSeconds', salaryMul: 0.6, cultivationMul: 1.1, mindPerHour: 36 },
  CULTIVATING: { secondsKey: 'cultivatingSeconds', salaryMul: 0.3, cultivationMul: 2.0, mindPerHour: -9 },
  SOCIAL: { secondsKey: 'socialSeconds', salaryMul: 0.5, cultivationMul: 0.6, mindPerHour: 24 },
};

const ZERO_RESULT = (mode: WorkMode): WorkTickResult => ({ salary: 0, cultivationExp: 0, mind: 0, elapsedSeconds: 0, mode });

export class WorkService {
  private readonly salaryPerHour: readonly number[];
  private readonly cultivationPerHour: readonly number[];
  private readonly mindPerHour: number;
  private committedSnapshot: ReturnType<GameContext['player']['toSaveData']>;
  /** Last observed game-clock time, used to split a tick that crosses lunch/off-work. */
  private lastTickAt: number | null = null;

  private readonly options: WorkServiceOptions;

  public constructor(private readonly context: GameContext, options: WorkServiceOptions = {}) {
    this.options = options;
    this.salaryPerHour = normalizeRates(options.salaryPerHour ?? idleConfig.salaryPerHour, 'salary');
    this.cultivationPerHour = normalizeRates(options.cultivationPerHour ?? idleConfig.cultivationPerHour, 'cultivation');
    this.mindPerHour = options.mindPerHour ?? 60;
    if (!Number.isSafeInteger(this.mindPerHour) || this.mindPerHour < 0) throw new Error('Invalid work mind rate');
    this.committedSnapshot = this.context.player.toSaveData();
  }

  public get mode(): WorkMode { return this.context.player.workMode; }

  public setMode(mode: WorkMode): void {
    if (!MODE_RULES[mode]) throw new Error('Invalid work mode');
    if (this.context.player.workMode === mode) return;
    this.context.player.workMode = mode;
    this.save();
    this.context.events.emit('workModeChanged', { mode });
  }

  public save(): void {
    const previous = this.context.player.toSaveData();
    try {
      this.context.saveService.save(this.context.player);
      this.committedSnapshot = this.context.player.toSaveData();
    } catch (error) {
      restorePlayer(this.context.player, this.context.saveService.getLatestCommittedSnapshot() ?? this.committedSnapshot ?? previous);
      throw error;
    }
  }

  public tick(elapsedSeconds: number): WorkTickResult {
    if (!Number.isSafeInteger(elapsedSeconds) || elapsedSeconds < 0) throw new Error('Invalid work duration');
    const mode = this.mode;
    if (elapsedSeconds === 0) return ZERO_RESULT(mode);
    const standardSeconds = this.standardSeconds(elapsedSeconds);
    if (standardSeconds === 0) return ZERO_RESULT(mode);
    const baseRules = MODE_RULES[mode];
    const override = this.options.modeMultipliers?.[mode];
    const rules = {
      secondsKey: baseRules.secondsKey,
      salaryMul: override?.salaryMul ?? baseRules.salaryMul,
      cultivationMul: override?.cultivationMul ?? baseRules.cultivationMul,
      mindPerHour: this.options.mindPerHour !== undefined
        ? (mode === 'WORK' || mode === 'CULTIVATING' ? -this.options.mindPerHour : this.options.mindPerHour)
        : baseRules.mindPerHour,
    };
    const secondsKey = rules.secondsKey;
    const previousSeconds = this.context.player[secondsKey];
    const nextSeconds = previousSeconds + standardSeconds;
    if (!Number.isSafeInteger(nextSeconds)) throw new Error('Invalid work duration');
    const salaryRate = this.rateForBoard(this.salaryPerHour);
    const cultivationRate = this.rateForBoard(this.cultivationPerHour);
    const previous = this.context.player.toSaveData();
    const salaryBuffMul = this.context.buffs.getMultiplier('WORK_SALARY_BOOST');
    const cultivationBuffMul = this.context.buffs.getMultiplier('WORK_CULTIVATION_BOOST');
    const careerMul = this.context.career.current();
    const salaryResult = accumulate(salaryRate, standardSeconds, rules.salaryMul, this.context.player.salaryRemainder, 7200);
    const cultivationResult = accumulate(cultivationRate, standardSeconds, rules.cultivationMul, this.context.player.cultivationRemainder, 7200);
    // 道心按模式方向累积余数（负向与正向共用 player.mindRemainder 槽）
    const mindRate = rules.mindPerHour;
    const mindRemainderKey = MODE_RULES[mode].secondsKey.replace('Seconds', 'MindRemainder') as
      'workMindRemainder' | 'fishingMindRemainder' | 'cultivatingMindRemainder' | 'socialMindRemainder';
    const mindResult = accumulate(Math.abs(mindRate), standardSeconds, 1, this.context.player[mindRemainderKey] ?? 0, 3600);
    const salary = Math.floor(salaryResult.reward * salaryBuffMul * careerMul.salaryMultiplier);
    const cultivationExp = Math.floor(cultivationResult.reward * cultivationBuffMul * careerMul.cultivationMultiplier);
    const mindBuffMul = mode === 'FISHING' ? this.context.buffs.getMultiplier('FISHING_MIND_BOOST') : 1;
    const mindDelta = mindRate >= 0 ? Math.floor(mindResult.reward * mindBuffMul) : -mindResult.reward;
    try {
      this.context.economy.applyIdleSalary(salary);
      this.context.cultivation.applyIdleExperience(cultivationExp);
      const actualMindDelta = this.context.mind.applyDelta(mindDelta);
      this.context.player[secondsKey] = nextSeconds;
      this.context.player.salaryRemainder = salaryResult.remainder;
      this.context.player.cultivationRemainder = cultivationResult.remainder;
      this.context.player[mindRemainderKey] = mindResult.remainder;
      // Update daily task progress for time-based tasks (absolute value from player state).
      if (mode === 'WORK') {
        this.context.dailyTasks.setProgress('WORK_10_MIN', nextSeconds);
      } else if (mode === 'FISHING') {
        this.context.dailyTasks.setProgress('FISH_3_MIN', nextSeconds);
      }
      return { salary, cultivationExp, mind: actualMindDelta, elapsedSeconds: standardSeconds, mode };
    } catch (error) {
      restorePlayer(this.context.player, previous);
      throw error;
    }
  }

  private rateForBoard(rates: readonly number[]): number {
    if (this.context.board) {
      return this.context.board.cells.reduce((total, cell) => total + (cell.occupant ? rates[cell.occupant.level - 1] ?? 0 : 0), 0);
    }
    // PC V1: career-level-based rate when no merge board
    const careerLevel = this.context.player.careerLevel;
    const levelIndex = Math.min(careerLevel - 1, rates.length - 1);
    return rates[levelIndex] ?? rates[0] ?? 0;
  }

  /**
   * Ordinary work may only accrue during 09:00–12:00 and 13:00–18:00.
   * When a real clock advances between ticks, intersect the elapsed range with
   * those windows. A frozen test clock deliberately uses its current phase.
   */
  private standardSeconds(requestedSeconds: number): number {
    const clock = this.context.clockV2;
    if (!clock) return requestedSeconds;
    const now = clock.now();
    // Legacy deterministic tests use an epoch-like clock-less sentinel. It is
    // not a playable wall-clock instant, so preserve their pre-V3 behaviour.
    if (now < 946_684_800_000) return requestedSeconds;
    const previous = this.lastTickAt;
    this.lastTickAt = now;
    if (previous === null) return clock.isWorkingHours() && !clock.isLunchBreak() ? requestedSeconds : 0;
    if (now <= previous) return clock.isWorkingHours() && !clock.isLunchBreak() ? requestedSeconds : 0;
    const observedSeconds = Math.floor((now - previous) / 1000);
    if (observedSeconds <= 0) return clock.isWorkingHours() && !clock.isLunchBreak() ? requestedSeconds : 0;
    const windowSeconds = standardSecondsBetween(previous, now, clock.workStartHour, clock.lunchStartHour, clock.lunchEndHour, clock.workEndHour);
    // A stalled tab can report a larger wall-clock gap than the loop delta;
    // never create more payable time than the loop explicitly advanced.
    return Math.min(requestedSeconds, windowSeconds);
  }
}

function standardSecondsBetween(fromMs: number, toMs: number, startHour: number, lunchStartHour: number, lunchEndHour: number, endHour: number): number {
  let total = 0;
  const cursor = new Date(fromMs);
  cursor.setHours(0, 0, 0, 0);
  const finalDate = new Date(toMs);
  finalDate.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= finalDate.getTime()) {
    const day = cursor.getTime();
    for (const [start, end] of [[startHour, lunchStartHour], [lunchEndHour, endHour]] as const) {
      const windowStart = day + start * 3_600_000;
      const windowEnd = day + end * 3_600_000;
      total += Math.max(0, Math.min(toMs, windowEnd) - Math.max(fromMs, windowStart));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.floor(total / 1000);
}

function normalizeRates(value: number | readonly number[], name: string): readonly number[] {
  const rates = typeof value === 'number' ? Array(6).fill(value) : [...value];
  if (rates.length !== 6 || rates.some((rate) => !Number.isSafeInteger(rate) || rate < 0)) throw new Error(`Invalid work ${name} rates`);
  return Object.freeze(rates);
}

function accumulate(rate: number, seconds: number, multiplier: number, remainder: number, denominator: number): { reward: number; remainder: number } {
  // V2 倍率含小数（1.3/0.8/…）：rate/mul 各 ×10³ 保持整数运算，
  // remainder 为全精度分子余量（跨 tick/save 精确衔接）。
  const numerator = remainder + Math.round(rate * 1000) * seconds * Math.round(multiplier * 1000);
  const scaledDenominator = denominator * 1_000_000;
  if (!Number.isSafeInteger(numerator)) throw new Error('Invalid work reward');
  const reward = Math.floor(numerator / scaledDenominator);
  return { reward, remainder: numerator % scaledDenominator };
}

function restorePlayer(player: GameContext['player'], data: ReturnType<GameContext['player']['toSaveData']>): void {
  // maxWorkerLevel and workers are deprecated in PC V1 — skip restoration
  player.careerLevel = data.careerLevel;
  player.maxMind = data.maxMind;
  player.performance = data.performance;
  player.sectId = data.sectId;
  player.talentId = data.talentId;
  player.kpiProgress = { ...data.kpiProgress };
  player.promotionFailCount = data.promotionFailCount;
  player.officeLevel = data.officeLevel;
  player.lastIdleSettlementId = data.lastIdleSettlementId;
  player.salary = data.salary;
  player.cultivationExp = data.cultivationExp;
  player.mind = data.mind;
  player.workMode = data.workMode;
  player.workSeconds = data.workSeconds;
  player.fishingSeconds = data.fishingSeconds;
  player.lastSaveTime = data.lastSaveTime;
  player.salaryRemainder = data.salaryRemainder ?? 0;
  player.cultivationRemainder = data.cultivationRemainder ?? 0;
  player.mindRemainder = data.mindRemainder ?? 0;
  player.workMindRemainder = data.workMindRemainder ?? 0;
  player.fishingMindRemainder = data.fishingMindRemainder ?? 0;
  player.dailyTasks = (data.dailyTasks ?? []).map((t) => ({ ...t }));
  player.dailyTaskDay = data.dailyTaskDay ?? -1;
  player.tutorialStep = data.tutorialStep ?? 'FIRST_RECRUIT';
  player.tutorialCompleted = data.tutorialCompleted ?? false;
  player.spiritStones = data.spiritStones ?? 0;
  player.lastCultivateTime = data.lastCultivateTime ?? 0;
  player.activeTasks = (data.activeTasks ?? []).map((t) => ({ ...t }));
  player.craftedItemIds = [...(data.craftedItemIds ?? [])];
  player.unlockedAchievementIds = [...(data.unlockedAchievementIds ?? [])];
  player.claimedAchievementIds = [...(data.claimedAchievementIds ?? [])];
  player.dailySignIn = data.dailySignIn ? { ...data.dailySignIn } : null;
  player.lastSectSwitchTime = data.lastSectSwitchTime ?? 0;
}
