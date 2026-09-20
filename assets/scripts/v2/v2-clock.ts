/**
 * GameClockV2 — 统一游戏时间服务（Gameplay V2）。
 *
 * 设计要点（对应 V2 规格 §7/§8/§10）：
 *  - 工作日 = 现实时间 09:00~18:00，其中 12:00~13:00 为午休（不计入有效工作时长）。
 *  - 关闭 EXE 时间照走：所有经济结算基于 timestamp 差值。
 *  - DEV 时间加速通过 devOffsetMs 实现（持久化在存档中，Release 不暴露入口）。
 *  - 系统时间倒退：elapsed 一律 max(0, delta)，不产生负奖励（配合 IdleService 的 anomaly 检测）。
 *
 * 本服务不直接发放资源；它只回答"现在是什么时间/工作日进度"。
 * 所有模块需要时间都必须依赖它，禁止散落 Date.now()。
 */
import { DEFAULT_CLOCK, type Clock } from '../core/clock';

export interface GameClockV2Options {
  readonly clock?: Clock;
  /** 工作日开始小时（默认 9）。 */
  readonly workStartHour?: number;
  /** 工作日结束小时（默认 18，即 18:00 下班）。 */
  readonly workEndHour?: number;
  /** 午休开始小时（默认 12）。 */
  readonly lunchStartHour?: number;
  /** 午休结束小时（默认 13）。 */
  readonly lunchEndHour?: number;
}

export interface GameDateInfo {
  /** 距游戏纪元的天数（真实自然日）。 */
  readonly dayNumber: number;
  /** 0=周日 … 6=周六。 */
  readonly weekday: number;
  readonly hour: number;
  readonly minute: number;
}

/** 一天的毫秒数。 */
const DAY_MS = 86_400_000;

export class GameClockV2 {
  private readonly clock: Clock;
  public readonly workStartHour: number;
  public readonly workEndHour: number;
  public readonly lunchStartHour: number;
  public readonly lunchEndHour: number;

  /** DEV 时间偏移（毫秒）。持久化在存档 devTimeOffsetMs。 */
  private devOffsetMs = 0;

  public constructor(options: GameClockV2Options = {}) {
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.workStartHour = options.workStartHour ?? 9;
    this.workEndHour = options.workEndHour ?? 18;
    this.lunchStartHour = options.lunchStartHour ?? 12;
    this.lunchEndHour = options.lunchEndHour ?? 13;
  }

  /** 当前游戏时间戳（含 DEV 偏移）。 */
  public now(): number {
    return this.clock.now() + this.devOffsetMs;
  }

  /** 不含 DEV 偏移的真实时间戳（用于保存真实 lastSaveTime 基准）。 */
  public realNow(): number {
    return this.clock.now();
  }

  // ── DEV 时间加速 ──────────────────────────────────────────────────────────

  /** DEV：前进指定毫秒。仅 DEV 面板调用。 */
  public advanceDevTime(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs === 0) return;
    this.devOffsetMs += Math.floor(deltaMs);
  }

  /** DEV：直接把游戏时间设为今天/明天的指定时刻。 */
  public jumpToHour(hour: number, minute = 0, nextDayIfPast = true): void {
    const real = this.clock.now();
    const target = new Date(real);
    target.setHours(hour, minute, 0, 0);
    if (nextDayIfPast && target.getTime() <= real) target.setDate(target.getDate() + 1);
    this.devOffsetMs += target.getTime() - real;
  }

  /** DEV：跳到下一天 09:00（用于"明天见"/Next Day）。 */
  public jumpToNextWorkdayStart(): void {
    this.jumpToHour(this.workStartHour, 0, true);
  }

  public getDevOffsetMs(): number { return this.devOffsetMs; }
  public setDevOffsetMs(value: number): void {
    this.devOffsetMs = Number.isSafeInteger(value) ? value : 0;
  }

  // ── 日期信息 ──────────────────────────────────────────────────────────────

  public getGameDate(): GameDateInfo {
    const d = new Date(this.now());
    return {
      dayNumber: Math.floor(this.now() / DAY_MS),
      weekday: d.getDay(),
      hour: d.getHours(),
      minute: d.getMinutes(),
    };
  }

  public isWeekend(): boolean {
    const wd = this.getGameDate().weekday;
    return wd === 0 || wd === 6;
  }

  // ── 工作日窗口 ────────────────────────────────────────────────────────────

  public isWorkingHours(): boolean {
    const { hour } = this.getGameDate();
    return hour >= this.workStartHour && hour < this.workEndHour;
  }

  public isLunchBreak(): boolean {
    const { hour } = this.getGameDate();
    return hour >= this.lunchStartHour && hour < this.lunchEndHour;
  }

  public isPreOffWorkRiskWindow(nowMs = this.now()): boolean {
    const d = new Date(nowMs);
    return d.getHours() === this.workEndHour - 1 && d.getMinutes() >= 30;
  }
  public isOvertimeWindow(nowMs = this.now()): boolean {
    return nowMs >= this.workdayEndTs(nowMs);
  }
  public isNightShift(nowMs = this.now()): boolean {
    const hour = new Date(nowMs).getHours();
    return hour >= 20 || hour < this.workStartHour;
  }
  public isMidnight(nowMs = this.now()): boolean { return new Date(nowMs).getHours() === 0; }

  /** 今天 09:00 的时间戳。 */
  public workdayStartTs(nowMs = this.now()): number {
    const d = new Date(nowMs);
    d.setHours(this.workStartHour, 0, 0, 0);
    return d.getTime();
  }

  /** 今天 18:00 的时间戳。 */
  public workdayEndTs(nowMs = this.now()): number {
    const d = new Date(nowMs);
    d.setHours(this.workEndHour, 0, 0, 0);
    return d.getTime();
  }

  /**
   * 工作日进度 0~1：以 09:00~18:00 的 9 小时真实窗口为分母。
   * 09:00 前为 0，18:00 后为 1。
   */
  public getWorkdayProgress(nowMs = this.now()): number {
    const start = this.workdayStartTs(nowMs);
    const end = this.workdayEndTs(nowMs);
    if (nowMs <= start) return 0;
    if (nowMs >= end) return 1;
    return (nowMs - start) / (end - start);
  }

  /** 今天 09:00 以来经过的毫秒（下班后封顶为全窗口）。 */
  public getWorkdayElapsedMs(nowMs = this.now()): number {
    return Math.max(0, Math.min(nowMs - this.workdayStartTs(nowMs), this.workdayEndTs(nowMs) - this.workdayStartTs(nowMs)));
  }

  /** 距 18:00 下班的毫秒；下班后为 0。 */
  public getTimeUntilOffWorkMs(nowMs = this.now()): number {
    return Math.max(0, this.workdayEndTs(nowMs) - nowMs);
  }

  /**
   * 时间倒退检测：与上次记录时间比较，若倒退超过阈值返回 true。
   * 调用方据此跳过本次收益（elapsed 一律 max(0, delta) 兜底）。
   */
  public detectClockRollback(previousNow: number, thresholdMs = 60_000, nowMs = this.now()): boolean {
    return nowMs < previousNow - thresholdMs;
  }
}
