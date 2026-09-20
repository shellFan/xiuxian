import type { GameContext } from '../core/game-context';
import type { IncidentSeverity, IncidentState, IncidentStatus, IncidentType } from '../model/save-data';

const MAX_INCIDENTS = 40;

/** 各严重度的最低处置时长（秒）——事故必须真的"处理"而不是弹窗扣属性（§34）。 */
const MITIGATION_REQUIRED: Record<IncidentSeverity, number> = {
  S1: 60 * 90,
  S2: 60 * 45,
  S3: 60 * 20,
  S4: 60 * 10,
};

export interface RaiseIncidentInput {
  readonly type: IncidentType;
  readonly severity: IncidentSeverity;
  readonly forcedRelease?: boolean;
  readonly riskConfirmed?: boolean;
  readonly rootCause?: string;
}

export const INCIDENT_LABELS: Record<IncidentType, string> = {
  PAYMENT_FAILURE: '支付成功率暴跌',
  DATABASE_LOCK: '数据库锁表',
  SLOW_SQL: '慢 SQL 雪崩',
  REDIS_OUTAGE: 'Redis 集群失联',
  CACHE_AVALANCHE: '缓存雪崩',
  NGINX_502: 'Nginx 大面积 502',
  DISK_FULL: '磁盘写满',
  CPU_HIGH: 'CPU 100%',
  OOM: '内存泄漏 OOM',
  MESSAGE_BACKLOG: '消息积压',
  CERT_EXPIRED: '证书过期',
  THIRD_PARTY_FAILURE: '第三方接口故障',
  BAD_DEPLOY: '错误发布',
  CONFIG_ERROR: '配置被改错',
};

/**
 * V4 生产事故系统（§25/§30~§46）。
 *
 * 事故是玩法不是弹窗：DETECTED → MITIGATING（累计处置时长）→ RECOVERED，
 * 次日复盘事件把案件转交 ResponsibilityService 定责。
 * 强行上线 + 未风险确认 + 高技术债会推高风险（§24）。
 */
export class IncidentService {
  public constructor(private readonly context: GameContext) {}

  public all(): IncidentState[] {
    return [...this.context.player.incidents];
  }

  public active(): IncidentState | null {
    return this.all().find((i) => i.status === 'DETECTED' || i.status === 'MITIGATING') ?? null;
  }

  public raise(input: RaiseIncidentInput): IncidentState {
    if (this.active()) throw new Error('已有未恢复的事故');
    const day = Math.max(1, this.context.player.gameDay?.dayIndex ?? 1);
    const incident: IncidentState = {
      id: `inc_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`,
      type: input.type,
      severity: input.severity,
      dayIndex: day,
      createdAt: Date.now(),
      status: 'DETECTED',
      forcedRelease: input.forcedRelease ?? false,
      riskConfirmed: input.riskConfirmed ?? false,
      mitigationSeconds: 0,
      rootCause: input.rootCause,
    };
    const next = [...this.context.player.incidents, incident];
    this.context.player.incidents = next.length > MAX_INCIDENTS ? next.slice(next.length - MAX_INCIDENTS) : next;
    this.bumpLifetime('incidentCount', 1);
    this.context.events.emit('playerChanged', { reason: 'incidentRaised', mode: this.context.player.workMode });
    return incident;
  }

  /** 处置（进入应急状态/累计处置时长）。 */
  public mitigate(incidentId: string, seconds: number): IncidentState {
    const incident = this.mustIncident(incidentId);
    if (incident.status === 'RECOVERED' || incident.status === 'CLOSED' || incident.status === 'POSTMORTEM_DONE') {
      throw new Error('事故已恢复');
    }
    const add = Math.max(0, Math.min(60 * 240, Math.floor(seconds)));
    const next: IncidentState = {
      ...incident,
      status: incident.status === 'DETECTED' ? 'MITIGATING' : incident.status,
      mitigationSeconds: incident.mitigationSeconds + add,
    };
    this.replace(next);
    return next;
  }

  public requiredMitigationSeconds(incident: IncidentState): number {
    return MITIGATION_REQUIRED[incident.severity];
  }

  public canRecover(incident: IncidentState): boolean {
    return incident.mitigationSeconds >= this.requiredMitigationSeconds(incident);
  }

  /** 恢复：记入当日时长账本（work-today 的 incident 时段）。 */
  public recover(incidentId: string, summary?: string): IncidentState {
    const incident = this.mustIncident(incidentId);
    if (!this.canRecover(incident)) throw new Error('事故尚未处置完成');
    const day = this.context.player.gameDay;
    const next: IncidentState = {
      ...incident,
      status: 'RECOVERED',
      summary: summary ?? incident.summary,
    };
    this.replace(next);
    if (day) {
      this.context.gameDay.recordEventInterval('INCIDENT', incident.id, incident.createdAt, Date.now());
    }
    this.bumpLifetime('incidentMitigationSeconds', incident.mitigationSeconds);
    return next;
  }

  /** 次日复盘结案（由复盘事件调用）。 */
  public completePostmortem(incidentId: string, rootCause: string, summary?: string): IncidentState {
    const incident = this.mustIncident(incidentId);
    if (incident.status !== 'RECOVERED' && incident.status !== 'POSTMORTEM_DONE') throw new Error('事故尚未恢复');
    const next: IncidentState = { ...incident, status: 'CLOSED' as IncidentStatus, rootCause, summary: summary ?? incident.summary };
    this.replace(next);
    this.bumpLifetime('postmortems', 1);
    return next;
  }

  /**
   * 当前事故风险（0~1）：技术债为基底，强行上线/无风险确认加权。
   * 事件与模拟共用，保证"赶工→事故"因果成立（§48~§53）。
   */
  public currentRisk(): number {
    const debtAvg = this.context.techDebt.average();
    let risk = Math.min(0.55, debtAvg / 180);
    if (this.context.player.eventFlags['release_forced']) risk += 0.25;
    if (this.context.player.eventFlags['release_no_risk_confirm']) risk += 0.15;
    if (this.context.player.eventFlags['release_skipped_tests']) risk += 0.1;
    if (this.context.player.overtimeFatigue === 'EXHAUSTED') risk += 0.08;
    return Math.min(0.95, risk);
  }

  private mustIncident(id: string): IncidentState {
    const incident = this.all().find((i) => i.id === id);
    if (!incident) throw new Error('事故不存在');
    return incident;
  }

  private replace(next: IncidentState): void {
    const list = this.context.player.incidents;
    const idx = list.findIndex((i) => i.id === next.id);
    if (idx < 0) return;
    const cloned = [...list];
    cloned[idx] = next;
    this.context.player.incidents = cloned;
  }

  private bumpLifetime(key: string, delta: number): void {
    const stats = this.context.player.lifetimeStats;
    this.context.player.lifetimeStats = { ...stats, [key]: (stats[key] ?? 0) + delta };
  }
}
