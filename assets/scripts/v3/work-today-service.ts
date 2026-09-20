import type { PlayerData } from '../model/player-data';
import type { GameDayService } from '../v2/game-day-service';
import type { GameClockV2 } from '../v2/v2-clock';

export interface WorkTodaySnapshot {
  readonly countdownMs: number;
  readonly standardWorkSeconds: number;
  readonly overtimeSeconds: number;
  readonly freeOvertimeSeconds: number;
  readonly paidFishingSalary: number;
  readonly allocatedSeconds: number;
  readonly durations: Readonly<Record<string, number>>;
  readonly timeline: readonly { id: string; kind: 'MODE_TRANSITION' | 'EVENT'; occurredAt: number; eventId?: string }[];
}

/** Read-only Work Today projection. It deliberately never saves or mutates player state. */
export class WorkTodayService {
  public constructor(private readonly player: PlayerData, private readonly clock: GameClockV2, private readonly gameDay: GameDayService) {}
  public snapshot(nowMs = this.clock.now()): WorkTodaySnapshot {
    const day = this.gameDay.current();
    const start = day?.startedAt ?? this.clock.workdayStartTs(nowMs);
    const end = start + (this.clock.workEndHour - this.clock.workStartHour) * 3_600_000;
    const elapsed = Math.max(0, nowMs - start);
    const workWindow = Math.max(0, Math.min(nowMs, end) - start) / 1000;
    const lunchStart = new Date(start); lunchStart.setHours(this.clock.lunchStartHour, 0, 0, 0);
    const lunchEnd = new Date(start); lunchEnd.setHours(this.clock.lunchEndHour, 0, 0, 0);
    const lunch = Math.max(0, Math.min(nowMs, lunchEnd.getTime()) - Math.max(start, lunchStart.getTime())) / 1000;
    const standard = Math.max(0, workWindow - lunch);
    const overtime = Math.max(0, nowMs - end) / 1000;
    const recorded = { ...(day?.durations ?? { work: 0, fishing: 0, cultivating: 0, social: 0, meeting: 0, lunch: 0, overtime: 0, incident: 0 }) };
    const lastTransition = [...(day?.eventHistory ?? [])].reverse().find((entry) => entry.kind === 'MODE_TRANSITION');
    if (lastTransition && lastTransition.eventId) {
      const key = lastTransition.eventId.toLowerCase() as keyof typeof recorded;
      if (key in recorded) recorded[key] += Math.max(0, Math.floor((nowMs - lastTransition.occurredAt) / 1000)) - recorded.meeting - recorded.incident;
    }
    const recordedTotal = Object.values(recorded).reduce((total, value) => total + value, 0);
    return {
      countdownMs: Math.max(0, end - nowMs),
      standardWorkSeconds: Math.floor(standard),
      overtimeSeconds: Math.floor(overtime),
      freeOvertimeSeconds: day?.overtimeFree ? Math.floor(overtime) : 0,
      paidFishingSalary: day?.settlementInputs.paidFishingSalary ?? 0,
      allocatedSeconds: Math.floor(elapsed / 1000),
      durations: recordedTotal > 0 ? { ...recorded } : { ...recorded, work: Math.floor(standard), lunch: Math.floor(lunch), overtime: Math.floor(overtime) },
      timeline: (day?.eventHistory ?? []).map((entry) => ({ ...entry })),
    };
  }
}
