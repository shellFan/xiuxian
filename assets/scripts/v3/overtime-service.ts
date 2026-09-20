import type { GameContext } from '../core/game-context';
import type { OvertimeSource, WorkMode } from '../model/save-data';
import type { GameDayService } from '../v2/game-day-service';
import type { GameClockV2 } from '../v2/v2-clock';

export type OvertimeFatigue = 'NORMAL' | 'TIRED' | 'EXHAUSTED';

export interface OvertimeSession {
  readonly source: Exclude<OvertimeSource, null>;
  readonly free: boolean;
  readonly plannedSeconds: number;
  readonly mode: WorkMode | null;
  readonly status: 'OFFERED' | 'ACTIVE';
  readonly offeredAt: number;
  readonly startedAt: number | null;
  readonly elapsedSeconds: number;
}

/** Owns the offer -> active -> completed lifecycle for one overtime session. */
export class OvertimeService {
  private session: OvertimeSession | null = null;

  public constructor(
    private readonly context: GameContext,
    private readonly clock: GameClockV2,
    private readonly gameDay: GameDayService,
  ) {}

  public offer(source: Exclude<OvertimeSource, null>, free: boolean, plannedSeconds: number): void {
    if (this.session) throw new Error('An overtime session is already pending');
    const duration = normalizeSeconds(plannedSeconds);
    if (duration === 0) throw new Error('Overtime duration must be positive');
    this.gameDay.ensureStarted();
    this.session = {
      source,
      free,
      plannedSeconds: duration,
      mode: null,
      status: 'OFFERED',
      offeredAt: this.clock.now(),
      startedAt: null,
      elapsedSeconds: 0,
    };
    this.gameDay.setOvertimeState(source, 'OFFERED', free);
  }

  public accept(mode: WorkMode): void {
    if (!this.session || this.session.status !== 'OFFERED') {
      throw new Error('No overtime offer is available');
    }
    this.session = { ...this.session, mode, status: 'ACTIVE', startedAt: this.clock.now() };
    this.context.player.workMode = mode;
    this.gameDay.setOvertimeState(this.session.source, 'ACTIVE', this.session.free);
  }

  public startVoluntary(plannedSeconds: number, paid: boolean): void {
    this.offer('VOLUNTARY', !paid, plannedSeconds);
    this.accept(this.context.player.workMode);
  }

  public tick(seconds: number): void {
    if (!this.session || this.session.status !== 'ACTIVE') return;
    const elapsed = normalizeSeconds(seconds);
    if (elapsed === 0) return;
    const recorded = Math.min(elapsed, this.session.plannedSeconds - this.session.elapsedSeconds);
    if (recorded <= 0) return;
    this.session = { ...this.session, elapsedSeconds: this.session.elapsedSeconds + recorded };
    const day = this.gameDay.current();
    if (day) {
      this.context.player.gameDay = {
        ...day,
        durations: { ...day.durations, overtime: day.durations.overtime + recorded },
      };
    }
  }

  public finish(): void {
    if (!this.session) return;
    const completed = this.session;
    const stats = this.context.player.overtimeStats;
    this.context.player.overtimeStats = {
      ...stats,
      totalSeconds: stats.totalSeconds + completed.elapsedSeconds,
      paidSeconds: stats.paidSeconds + (completed.free ? 0 : completed.elapsedSeconds),
      freeSeconds: stats.freeSeconds + (completed.free ? completed.elapsedSeconds : 0),
      sessions: stats.sessions + 1,
    };
    this.gameDay.setOvertimeState(completed.source, 'COMPLETED', completed.free);
    this.session = null;
  }

  public current(): OvertimeSession | null {
    return this.session ? { ...this.session } : null;
  }

  public canSettleDay(): boolean {
    return this.session === null;
  }

  public fatigue(): OvertimeFatigue {
    const seconds = this.session?.elapsedSeconds ?? 0;
    if (seconds >= 4 * 3600) return 'EXHAUSTED';
    if (seconds >= 2 * 3600) return 'TIRED';
    return 'NORMAL';
  }
}

function normalizeSeconds(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
