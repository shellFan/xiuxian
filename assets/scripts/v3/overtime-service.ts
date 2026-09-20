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
}

/**
 * Owns an explicit after-hours work decision.  The service intentionally does
 * not pay salary itself: free sessions can therefore never obtain an ordinary
 * work wage through this path, while the economy layer can later apply the
 * configured compensation rules to paid sessions.
 */
export class OvertimeService {
  private session: OvertimeSession | null = null;

  public constructor(
    private readonly context: GameContext,
    private readonly clock: GameClockV2,
    private readonly gameDay: GameDayService,
  ) {}

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
    this.session = { source, free, plannedSeconds, elapsedSeconds: 0, mode: null, status: 'OFFERED' };
    this.gameDay.setOvertimeState(source, 'OFFERED', free);
    return this.current()!;
  }

  public accept(mode: WorkMode): OvertimeSession {
    if (!this.session || this.session.status !== 'OFFERED') throw new Error('没有可接受的加班');
    this.session = { ...this.session, mode, status: 'ACTIVE' };
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
    return this.current();
  }

  public finish(): void {
    const session = this.session;
    if (!session) return;
    const stats = this.context.player.overtimeStats;
    const totalSeconds = stats.totalSeconds + session.elapsedSeconds;
    this.context.player.overtimeStats = {
      ...stats,
      totalSeconds,
      paidSeconds: stats.paidSeconds + (session.free ? 0 : session.elapsedSeconds),
      freeSeconds: stats.freeSeconds + (session.free ? session.elapsedSeconds : 0),
      sessions: stats.sessions + 1,
      consecutiveDays: session.elapsedSeconds > 0 ? stats.consecutiveDays + 1 : stats.consecutiveDays,
      longestStreak: Math.max(stats.longestStreak, session.elapsedSeconds > 0 ? stats.consecutiveDays + 1 : stats.longestStreak),
    };
    this.context.player.overtimeFatigue = fatigueForSeconds(session.elapsedSeconds);
    this.gameDay.setOvertimeState(session.source, 'COMPLETED', session.free);
    this.session = null;
  }

  public fatigue(): OvertimeFatigue {
    return this.session ? fatigueForSeconds(this.session.elapsedSeconds) : this.context.player.overtimeFatigue;
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
