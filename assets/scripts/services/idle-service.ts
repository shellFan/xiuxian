import idleConfig from '../../configs/idle.json';
import { DEFAULT_CLOCK, type Clock } from '../core/clock';
import type { GameContext } from '../core/game-context';

export interface IdleServiceOptions {
  readonly clock?: Clock;
  readonly maxOfflineSeconds?: number;
  readonly salaryPerHour?: number | readonly number[];
  readonly cultivationPerHour?: number | readonly number[];
}

export interface IdleSettlementResult {
  readonly salary: number;
  readonly cultivationExp: number;
  readonly elapsedSeconds: number;
  readonly capped: boolean;
  readonly duplicate: boolean;
}

const ZERO_RESULT: IdleSettlementResult = { salary: 0, cultivationExp: 0, elapsedSeconds: 0, capped: false, duplicate: false };

export class IdleService {
  private readonly clock: Clock;
  private readonly maxOfflineSeconds: number;
  private readonly salaryPerHour: readonly number[];
  private readonly cultivationPerHour: readonly number[];

  public constructor(private readonly context: GameContext, options: IdleServiceOptions = {}) {
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.maxOfflineSeconds = options.maxOfflineSeconds ?? idleConfig.maxOfflineSeconds;
    this.salaryPerHour = normalizeRates(options.salaryPerHour ?? idleConfig.salaryPerHour, 'salary');
    this.cultivationPerHour = normalizeRates(options.cultivationPerHour ?? idleConfig.cultivationPerHour, 'cultivation');
    if (!Number.isSafeInteger(this.maxOfflineSeconds) || this.maxOfflineSeconds <= 0) throw new Error('Invalid idle duration');
  }

  public settle(settlementId: string): IdleSettlementResult {
    if (typeof settlementId !== 'string' || settlementId.trim() === '') throw new Error('Invalid settlement id');
    if (this.context.player.lastIdleSettlementId === settlementId) return { ...ZERO_RESULT, duplicate: true };

    const now = this.clock.now();
    const deltaMilliseconds = now - this.context.player.lastSaveTime;
    if (!Number.isFinite(now) || !Number.isFinite(deltaMilliseconds) || deltaMilliseconds <= 0) {
      this.context.events.emit('clockAnomaly', { code: 'CLOCK_ANOMALY', now, lastSaveTime: this.context.player.lastSaveTime });
      return ZERO_RESULT;
    }

    const rawSeconds = deltaMilliseconds / 1000;
    const elapsedSeconds = Math.min(rawSeconds, this.maxOfflineSeconds);
    const capped = rawSeconds > this.maxOfflineSeconds;
    const salary = Math.floor(this.rateForBoard(this.salaryPerHour) * elapsedSeconds / 3600);
    const cultivationExp = Math.floor(this.rateForBoard(this.cultivationPerHour) * elapsedSeconds / 3600);
    const previous = {
      salary: this.context.player.salary,
      cultivationExp: this.context.player.cultivationExp,
      lastSaveTime: this.context.player.lastSaveTime,
      lastIdleSettlementId: this.context.player.lastIdleSettlementId,
    };
    this.context.player.salary += salary;
    this.context.player.cultivationExp += cultivationExp;
    this.context.player.lastIdleSettlementId = settlementId;
    try {
      if (!Number.isSafeInteger(this.context.player.salary) || !Number.isSafeInteger(this.context.player.cultivationExp)) throw new Error('Invalid idle reward');
      this.context.saveService.saveAt(this.context.player, previous.lastSaveTime + elapsedSeconds * 1000);
    } catch (error) {
      this.context.player.salary = previous.salary;
      this.context.player.cultivationExp = previous.cultivationExp;
      this.context.player.lastSaveTime = previous.lastSaveTime;
      this.context.player.lastIdleSettlementId = previous.lastIdleSettlementId;
      throw error;
    }
    try {
      if (salary > 0) this.context.events.emit('salaryChanged', { amount: salary, total: this.context.player.salary });
      this.context.events.emit('idleSettled', { settlementId, salary, cultivationExp, elapsedSeconds, capped });
      this.context.events.emit('gameSaved', { reason: 'idle' });
    } catch { /* UI feedback cannot undo a committed transaction. */ }
    return { salary, cultivationExp, elapsedSeconds, capped, duplicate: false };
  }

  private rateForBoard(rates: readonly number[]): number {
    return this.context.board.cells.reduce((total, cell) => total + (cell.occupant ? rates[cell.occupant.level - 1] ?? 0 : 0), 0);
  }
}

function normalizeRates(value: number | readonly number[], name: string): readonly number[] {
  const rates = typeof value === 'number' ? Array(6).fill(value) : [...value];
  if (rates.length !== 6 || rates.some((rate) => !Number.isSafeInteger(rate) || rate < 0)) throw new Error(`Invalid idle ${name} rates`);
  return Object.freeze(rates);
}
