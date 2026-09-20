import idleConfig from '../../configs/idle.json';
import type { GameContext } from '../core/game-context';
import type { OvertimeSource, WorkMode } from '../model/save-data';
import type { GameDayService } from '../v2/game-day-service';
import type { GameClockV2 } from '../v2/v2-clock';

export type OvertimeFatigue = 'RESTED' | 'TIRED' | 'EXHAUSTED';

export interface OvertimeSession {
  readonly source: Exclude<OvertimeSource, null>;
  readonly free: boolean;
  readonly plannedSeconds: number;
  readonly elapsedSeconds: number;
  readonly mode: WorkMode | null;
  readonly status: 'OFFERED' | 'ACTIVE';
  readonly startedAt: number | null;
}

/** 付费加班工资倍率（§13：支持 1.0/1.5/2.0；周末与补偿按 2.0）。 */
export function paidOvertimeMultiplier(source: Exclude<OvertimeSource, null>): number {
  if (source === 'WEEKEND' || source === 'COMPENSATED') return 2.0;
  return 1.5;
}

/**
 * Owns an explicit after-hours work decision.  The service intentionally does
 * not pay salary itself: free sessions can therefore never obtain an ordinary
 * work wage through this path, while the economy layer can later apply the
 * configured compensation rules to paid sessions.
 */
export class OvertimeService {
  private session: OvertimeSession | null;

  public constructor(
    private readonly context: GameContext,
    private readonly clock: GameClockV2,
    private readonly gameDay: GameDayService,
  ) {
    // V4: 会话随存档恢复——重启/Electron 重开不允许"洗掉"一次进行中的加班。
    this.session = context.player.activeOvertimeSession ? { ...context.player.activeOvertimeSession } : null;
  }

  public current(): OvertimeSession | null {
    return this.session ? { ...this.session } : null;
  }

  public canSettleDay(): boolean {
    return this.session === null;
  }

  public offer(source: Exclude<OvertimeSource, null>, free: boolean, plannedSeconds: number): OvertimeSession {
    this.assertDuration(plannedSeconds);
    if (this.session) throw new Error('已有待处理的加班');
    this.gameDay.ensureStarted();
    this.session = { source, free, plannedSeconds, elapsedSeconds: 0, mode: null, status: 'OFFERED', startedAt: null };
    this.persist();
    this.gameDay.setOvertimeState(source, 'OFFERED', free);
    return this.current()!;
  }

  public accept(mode: WorkMode): OvertimeSession {
    if (!this.session || this.session.status !== 'OFFERED') throw new Error('没有可接受的加班');
    this.session = { ...this.session, mode, status: 'ACTIVE', startedAt: this.clock.now() };
    this.persist();
    this.gameDay.setOvertimeState(this.session.source, 'ACTIVE', this.session.free);
    return this.current()!;
  }

  public startVoluntary(plannedSeconds: number, paid: boolean): OvertimeSession {
    this.offer('VOLUNTARY', !paid, plannedSeconds);
    return this.accept(this.context.player.workMode);
  }

  /** Record only authorised after-hours time.  The normal wage path remains closed. */
  public tick(seconds: number): OvertimeSession | null {
    if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error('Invalid overtime duration');
    if (!this.session || this.session.status !== 'ACTIVE' || seconds === 0) return this.current();
    const remaining = Math.max(0, this.session.plannedSeconds - this.session.elapsedSeconds);
    const elapsed = Math.min(seconds, remaining);
    if (elapsed === 0) return this.current();
    this.session = { ...this.session, elapsedSeconds: this.session.elapsedSeconds + elapsed };
    const day = this.gameDay.current();
    if (day) {
      this.context.player.gameDay = { ...day, durations: { ...day.durations, overtime: day.durations.overtime + elapsed } };
    }
    this.persist();
    return this.current();
  }

  public finish(): void {
    const session = this.session;
    if (!session) return;
    if (session.status !== 'ACTIVE' || session.elapsedSeconds <= 0) {
      this.gameDay.setOvertimeState(session.source, 'COMPLETED', session.free);
      this.session = null;
      this.persist();
      return;
    }
    // 付费加班在结束时一次性发薪（免费加班永远是 0，§12/§176）。
    if (!session.free) {
      const pay = this.paidOvertimeSalary(session);
      if (pay > 0) {
        this.context.economy.applyIdleSalary(pay);
        this.gameDay.addIncome('salary', pay);
        this.context.kpi.recordSalaryEarned(pay);
        this.context.events.emit('salaryChanged', { amount: pay, total: this.context.player.salary });
      }
    }
    const stats = this.context.player.overtimeStats;
    const totalSeconds = stats.totalSeconds + session.elapsedSeconds;
    const workdayStartAt = this.gameDay.current()?.startedAt ?? this.clock.workdayStartTs();
    const isNewOvertimeDay = session.elapsedSeconds > 0 && this.context.player.lastOvertimeWorkdayStartAt !== workdayStartAt;
    const isConsecutiveWorkday = isNewOvertimeDay && workdayStartAt - this.context.player.lastOvertimeWorkdayStartAt === 24 * 3600_000;
    const consecutiveDays = !isNewOvertimeDay
      ? stats.consecutiveDays
      : isConsecutiveWorkday ? stats.consecutiveDays + 1 : 1;
    this.context.player.overtimeStats = {
      ...stats,
      totalSeconds,
      paidSeconds: stats.paidSeconds + (session.free ? 0 : session.elapsedSeconds),
      freeSeconds: stats.freeSeconds + (session.free ? session.elapsedSeconds : 0),
      sessions: stats.sessions + 1,
      nightSessions: stats.nightSessions + (this.includesNightWork(session) ? 1 : 0),
      freeSessions: stats.freeSessions + (session.free ? 1 : 0),
      consecutiveDays,
      longestStreak: Math.max(stats.longestStreak, consecutiveDays),
    };
    if (session.elapsedSeconds > 0) this.context.player.lastOvertimeWorkdayStartAt = workdayStartAt;
    this.context.player.overtimeFatigue = this.fatigue();
    this.bumpLifetime('overtimeSeconds', session.elapsedSeconds);
    this.bumpLifetime(session.free ? 'freeOvertimeSessions' : 'paidOvertimeSessions', 1);
    this.gameDay.setOvertimeState(session.source, 'COMPLETED', session.free);
    this.session = null;
    this.persist();
  }

  public fatigue(): OvertimeFatigue {
    const current = fatigueForSeconds(this.session?.elapsedSeconds ?? 0);
    const persisted = this.context.player.overtimeFatigue;
    const severity: Record<OvertimeFatigue, number> = { RESTED: 0, TIRED: 1, EXHAUSTED: 2 };
    return severity[current] > severity[persisted] ? current : persisted;
  }

  /** 付费加班一次性工资：职业时薪 × 倍率 × 实际时长（免费永远 0）。 */
  public paidOvertimeSalary(session: OvertimeSession): number {
    if (session.free || session.elapsedSeconds <= 0) return 0;
    const ratePerSecond = paidOvertimeBaseRatePerSecond(this.context);
    return Math.floor(ratePerSecond * session.elapsedSeconds * paidOvertimeMultiplier(session.source));
  }

  /** Count only recorded work, not an unobserved clock jump or the planned duration. */
  private includesNightWork(session: OvertimeSession): boolean {
    if (session.startedAt === null || session.elapsedSeconds <= 0) return false;
    if (this.clock.isNightShift(session.startedAt)) return true;
    // A daytime start first enters the next night window at local 20:00.
    // Use a calendar boundary so DST does not shift that local time.
    const nightStart = new Date(session.startedAt);
    nightStart.setHours(20, 0, 0, 0);
    return session.startedAt + session.elapsedSeconds * 1000 > nightStart.getTime();
  }

  private bumpLifetime(key: string, delta: number): void {
    const stats = this.context.player.lifetimeStats;
    this.context.player.lifetimeStats = { ...stats, [key]: (stats[key] ?? 0) + delta };
  }

  private persist(): void {
    this.context.player.activeOvertimeSession = this.session ? { ...this.session } : null;
  }

  private assertDuration(seconds: number): void {
    if (!Number.isSafeInteger(seconds) || seconds <= 0) throw new Error('Invalid overtime duration');
  }
}

function fatigueForSeconds(seconds: number): OvertimeFatigue {
  if (seconds >= 8 * 3600) return 'EXHAUSTED';
  if (seconds >= 2 * 3600) return 'TIRED';
  return 'RESTED';
}

/** 职业等级决定的时薪（与 WorkService 的 rateForBoard 同源）。 */
function paidOvertimeBaseRatePerSecond(context: GameContext): number {
  const list = idleConfig.salaryPerHour;
  const levelIndex = Math.min(Math.max(1, context.player.careerLevel) - 1, list.length - 1);
  const perHour = list[levelIndex] ?? list[0] ?? 0;
  return perHour / 3600;
}
