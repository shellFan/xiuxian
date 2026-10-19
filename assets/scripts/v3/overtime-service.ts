import idleConfig from '../../configs/idle.json';
import type { GameContext } from '../core/game-context';
import type { OvertimeSource, WorkMode } from '../model/save-data';
import type { OvertimeApplicationState } from '../model/save-data';
import { PlayerData } from '../model/player-data';
import type { GameDayService } from '../v2/game-day-service';
import type { GameClockV2 } from '../v2/v2-clock';

export type OvertimeFatigue = 'RESTED' | 'TIRED' | 'EXHAUSTED';

export interface OvertimeSession {
  readonly sessionId?: string;
  readonly approvalId?: string;
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
    if (!free && this.context.player.eventFlags['career:unemployed'] === true) throw new Error('待业期间不能获得宗门带薪加班');
    if (!free) {
      const rule = this.context.sect.current()?.employment?.overtimeRule;
      if (rule && rule !== 'SELF_DIRECTED' && rule !== 'PRE_APPROVED') {
        throw new Error(rule === 'CLIENT_APPROVAL' ? '外包宗带薪加班必须先申请并获得客户审批' : '该宗门的带薪加班必须先提交审批');
      }
    }
    if (this.session) throw new Error('已有待处理的加班');
    this.gameDay.ensureStarted();
    this.session = { sessionId: this.createSessionId(source), source, free, plannedSeconds, elapsedSeconds: 0, mode: null, status: 'OFFERED', startedAt: null };
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

  /** Submit at most one persisted approval request per workday. Retrying after a
   * reload returns the original decision instead of drawing another roll. */
  public applyForApproval(plannedSeconds: number): OvertimeApplicationState {
    this.assertApprovedDuration(plannedSeconds);
    if (this.context.player.eventFlags['career:unemployed'] === true) throw new Error('待业期间不能申请宗门带薪加班');
    this.gameDay.ensureStarted();
    const dayIndex = Math.max(1, this.gameDay.dayIndex());
    const previous = this.context.player.overtimeApplications.find((entry) => entry.dayIndex === dayIndex);
    if (previous) return { ...previous };
    if (this.session) throw new Error('已有待处理的加班');

    const sect = this.context.sect.current();
    if (!sect) throw new Error('请先选择职场宗门');
    const professionId = this.context.profession.currentId();
    const taskId = overtimeTaskForProfession(professionId);
    const employment = sect.employment;
    const rule = employment?.overtimeRule ?? 'REQUEST';
    const approvalPercent = rule === 'SELF_DIRECTED' || rule === 'PRE_APPROVED'
      ? 100 : employment?.overtimeApprovalPercent ?? 100;
    const roll = Math.floor(this.context.randomV2.forDay(dayIndex, overtimeSalt(sect.id, professionId)).next() * 100) + 1;
    const id = `overtime-${dayIndex}-${sect.id}-${professionId}`;
    const application: OvertimeApplicationState = {
      id, dayIndex, sectId: sect.id, professionId, taskId, plannedSeconds,
      approvalPercent, approvalRoll: roll,
      status: roll <= approvalPercent ? 'APPROVED' : 'REJECTED',
      appliedAt: this.clock.now(),
    };
    this.context.player.overtimeApplications = [...this.context.player.overtimeApplications, application].slice(-30);
    this.context.saveService.save(this.context.player);
    this.context.events.emit('playerChanged', { reason: 'overtimeApplication' });
    return { ...application };
  }

  /** Start paid work only from a successful, current-day approval record. */
  public startApprovedOvertime(applicationId: string): OvertimeSession {
    if (this.context.player.eventFlags['career:unemployed'] === true) throw new Error('待业期间不能开始宗门带薪加班');
    const application = this.context.player.overtimeApplications.find((entry) => entry.id === applicationId);
    if (!application || application.status !== 'APPROVED') throw new Error('加班申请未获批准或已使用');
    if (application.dayIndex !== Math.max(1, this.gameDay.dayIndex())) throw new Error('加班审批已过期');
    if (application.sectId !== this.context.player.sectId || application.professionId !== this.context.profession.currentId()) {
      throw new Error('宗门或职业已变化，原审批不可使用');
    }
    if (this.session) throw new Error('已有待处理的加班');
    const previous = this.context.player.toSaveData();
    this.gameDay.ensureStarted();
    const sessionId = `paid-${application.id}`;
    this.session = {
      sessionId, approvalId: application.id, source: 'REQUESTED', free: false,
      plannedSeconds: application.plannedSeconds, elapsedSeconds: 0, mode: 'WORK', status: 'ACTIVE', startedAt: this.clock.now(),
    };
    this.context.player.overtimeApplications = this.context.player.overtimeApplications.map((entry) =>
      entry.id === application.id ? { ...entry, status: 'STARTED', sessionId } : entry);
    this.persist();
    this.gameDay.setOvertimeState('REQUESTED', 'ACTIVE', false);
    try {
      this.context.saveService.save(this.context.player);
    } catch (error) {
      restorePlayer(this.context.player, previous);
      this.session = null;
      throw error;
    }
    return this.current()!;
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
    const before = this.context.player.toSaveData();
    const previousSession = this.session;
    try {
    if (session.status !== 'ACTIVE' || session.elapsedSeconds <= 0) {
      this.gameDay.setOvertimeState(session.source, 'COMPLETED', session.free);
      this.session = null;
      this.persist();
      this.context.saveService.save(this.context.player);
      return;
    }
    // 付费加班在结束时一次性发薪（免费加班永远是 0，§12/§176）。
    const sessionId = session.sessionId || this.createSessionId(session.source);
    const alreadySettled = this.context.player.settledOvertimeSessionIds.includes(sessionId);
    const playerIsUnemployed = this.context.player.eventFlags['career:unemployed'] === true;
    if (!session.free && !alreadySettled && !playerIsUnemployed) {
      const pay = this.paidOvertimeSalary(session);
      if (pay > 0) {
        this.context.economy.applyIdleSalary(pay);
        this.gameDay.addIncome('salary', pay);
        this.context.kpi.recordSalaryEarned(pay);
        this.context.events.emit('salaryChanged', { amount: pay, total: this.context.player.salary });
      }
    }
    if (!alreadySettled) {
      this.context.player.settledOvertimeSessionIds = [...this.context.player.settledOvertimeSessionIds, sessionId].slice(-90);
      const hours = session.elapsedSeconds / 3600;
      this.context.player.health = Math.max(0, this.context.player.health - Math.ceil(2 * hours));
      this.context.player.mood = Math.max(0, this.context.player.mood - Math.ceil(4 * hours));
      this.context.player.mind = Math.max(0, this.context.player.mind - Math.ceil(2 * hours));
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
    if (session.approvalId) {
      this.context.player.overtimeApplications = this.context.player.overtimeApplications.map((entry) =>
        entry.id === session.approvalId ? { ...entry, status: 'SETTLED' } : entry);
    }
    this.session = null;
    this.persist();
    this.context.saveService.save(this.context.player);
    } catch (error) {
      restorePlayer(this.context.player, before);
      this.session = previousSession;
      throw error;
    }
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
    const sectMultiplier = safeMultiplier(this.context.sect.current()?.modifiers.overtimePayMultiplier);
    const rawPay = ratePerSecond * session.elapsedSeconds * paidOvertimeMultiplier(session.source) * sectMultiplier;
    if (!Number.isFinite(rawPay)) return Number.MAX_SAFE_INTEGER;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(rawPay)));
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

  private assertApprovedDuration(seconds: number): void {
    if (seconds !== 3600 && seconds !== 7200 && seconds !== 10800) throw new Error('加班时长仅可选择 1、2 或 3 小时');
  }

  private createSessionId(source: Exclude<OvertimeSource, null>): string {
    return `ot-${Math.max(1, this.gameDay.dayIndex())}-${source}-${this.clock.now()}-${this.context.player.overtimeStats.sessions + 1}`;
  }
}

function overtimeTaskForProfession(professionId: string): string {
  const tasks: Readonly<Record<string, string>> = {
    JAVA_BACKEND: 'backend-payment-hotfix',
    FRONTEND: 'frontend-cross-device-fix',
    QA: 'qa-production-regression',
    DEVOPS: 'devops-release-incident',
  };
  return tasks[professionId] ?? `general-${professionId.toLowerCase()}-delivery`;
}

function overtimeSalt(sectId: string, professionId: string): number {
  const text = `${sectId}:${professionId}`;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash % 100000;
}

function restorePlayer(player: GameContext['player'], save: ReturnType<GameContext['player']['toSaveData']>): void {
  Object.assign(player, new PlayerData(save));
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
  return perHour * context.career.current().salaryMultiplier
    * context.sect.salaryMultiplierForProfession(context.profession.currentId()) / 3600;
}

/** Optional config stays backward-compatible and cannot introduce an invalid runtime multiplier. */
function safeMultiplier(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 1;
}
