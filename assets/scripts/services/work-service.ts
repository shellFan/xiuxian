import idleConfig from '../../configs/idle.json';
import type { GameContext } from '../core/game-context';
import type { WorkMode } from '../model/save-data';

export interface WorkServiceOptions {
  readonly salaryPerHour?: number | readonly number[];
  readonly cultivationPerHour?: number | readonly number[];
  readonly mindPerHour?: number;
}

export interface WorkTickResult {
  readonly salary: number;
  readonly cultivationExp: number;
  readonly mind: number;
  readonly elapsedSeconds: number;
  readonly mode: WorkMode;
}

const ZERO_RESULT = (mode: WorkMode): WorkTickResult => ({ salary: 0, cultivationExp: 0, mind: 0, elapsedSeconds: 0, mode });

export class WorkService {
  private readonly salaryPerHour: readonly number[];
  private readonly cultivationPerHour: readonly number[];
  private readonly mindPerHour: number;
  private committedSnapshot: ReturnType<GameContext['player']['toSaveData']>;

  public constructor(private readonly context: GameContext, options: WorkServiceOptions = {}) {
    this.salaryPerHour = normalizeRates(options.salaryPerHour ?? idleConfig.salaryPerHour, 'salary');
    this.cultivationPerHour = normalizeRates(options.cultivationPerHour ?? idleConfig.cultivationPerHour, 'cultivation');
    this.mindPerHour = options.mindPerHour ?? 60;
    if (!Number.isSafeInteger(this.mindPerHour) || this.mindPerHour < 0) throw new Error('Invalid work mind rate');
    this.committedSnapshot = this.context.player.toSaveData();
  }

  public get mode(): WorkMode { return this.context.player.workMode; }

  public setMode(mode: WorkMode): void {
    if (mode !== 'WORK' && mode !== 'FISHING') throw new Error('Invalid work mode');
    if (this.context.player.workMode === mode) return;
    this.context.player.workMode = mode;
    this.save();
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
    const secondsKey = mode === 'WORK' ? 'workSeconds' : 'fishingSeconds';
    const previousSeconds = this.context.player[secondsKey];
    const nextSeconds = previousSeconds + elapsedSeconds;
    if (!Number.isSafeInteger(nextSeconds)) throw new Error('Invalid work duration');
    const multiplier = mode === 'WORK' ? 2 : 1;
    const salaryRate = this.rateForBoard(this.salaryPerHour);
    const cultivationRate = this.rateForBoard(this.cultivationPerHour);
    const previous = this.context.player.toSaveData();
    const salaryResult = accumulate(salaryRate, elapsedSeconds, multiplier, this.context.player.salaryRemainder, 7200);
    const cultivationResult = accumulate(cultivationRate, elapsedSeconds, multiplier, this.context.player.cultivationRemainder, 7200);
    const mindRemainderKey = mode === 'WORK' ? 'workMindRemainder' : 'fishingMindRemainder';
    const mindResult = accumulate(this.mindPerHour, elapsedSeconds, 1, this.context.player[mindRemainderKey], 3600);
    const salary = salaryResult.reward;
    const cultivationExp = cultivationResult.reward;
    const mindDelta = mode === 'WORK' ? -mindResult.reward : mindResult.reward;
    try {
      this.context.economy.applyIdleSalary(salary);
      this.context.cultivation.applyIdleExperience(cultivationExp);
      const actualMindDelta = this.context.mind.applyDelta(mindDelta);
      this.context.player[secondsKey] = nextSeconds;
      this.context.player.salaryRemainder = salaryResult.remainder;
      this.context.player.cultivationRemainder = cultivationResult.remainder;
      this.context.player[mindRemainderKey] = mindResult.remainder;
      return { salary, cultivationExp, mind: actualMindDelta, elapsedSeconds, mode };
    } catch (error) {
      restorePlayer(this.context.player, previous);
      throw error;
    }
  }

  private rateForBoard(rates: readonly number[]): number {
    return this.context.board.cells.reduce((total, cell) => total + (cell.occupant ? rates[cell.occupant.level - 1] ?? 0 : 0), 0);
  }
}

function normalizeRates(value: number | readonly number[], name: string): readonly number[] {
  const rates = typeof value === 'number' ? Array(6).fill(value) : [...value];
  if (rates.length !== 6 || rates.some((rate) => !Number.isSafeInteger(rate) || rate < 0)) throw new Error(`Invalid work ${name} rates`);
  return Object.freeze(rates);
}

function accumulate(rate: number, seconds: number, multiplier: number, remainder: number, denominator: number): { reward: number; remainder: number } {
  const numerator = remainder + rate * seconds * multiplier;
  if (!Number.isSafeInteger(numerator)) throw new Error('Invalid work reward');
  return { reward: Math.floor(numerator / denominator), remainder: numerator % denominator };
}

function restorePlayer(player: GameContext['player'], data: ReturnType<GameContext['player']['toSaveData']>): void {
  player.maxWorkerLevel = data.maxWorkerLevel;
  player.workers = data.workers.map((worker) => ({ ...worker }));
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
}
