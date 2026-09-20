import type { GameContext } from '../core/game-context';
import type { IncidentSeverity, ResponsibilityCaseState, ResponsibilityStatus } from '../model/save-data';

/** 甩锅案件数量上限（保留最近 30 件）。 */
const MAX_CASES = 30;

export interface OpenCaseInput {
  readonly sourceNpc: string;
  readonly actualOwnerNpc: string;
  readonly blamedPlayer?: boolean;
  readonly cause: string;
  readonly severity: IncidentSeverity;
  readonly relatedTaskId?: string;
  readonly relatedIncidentId?: string;
}

export interface ResolveOutcome {
  readonly caseId: string;
  readonly status: ResponsibilityStatus;
  readonly performanceDelta: number;
  readonly relationshipEffects: Record<string, number>;
  readonly summary: string;
}

/**
 * V4 责任判定系统（§15~§17/§28~§29）。
 *
 * 案件由事件打开（同事甩锅/事故复盘）。结案走两条路：
 *  - 背锅（PLAYER_ACCEPTED）：绩效受损但甩锅者满意，且记住"这人能甩"。
 *  - 反击（PLAYER_CLEARED）：需要真实证据；甩锅者记恨，但绩效与道心受益。
 * 记忆旗标写入 eventFlags（`mem:<NPC>:<FLAG>`），供跨天事件引用（§31~§32）。
 */
export class ResponsibilityService {
  public constructor(private readonly context: GameContext) {}

  public all(): ResponsibilityCaseState[] {
    return [...this.context.player.responsibilityCases];
  }

  public openCases(): ResponsibilityCaseState[] {
    return this.all().filter((c) => c.status === 'OPEN' || c.status === 'DISPUTED');
  }

  public caseById(id: string): ResponsibilityCaseState | null {
    return this.all().find((c) => c.id === id) ?? null;
  }

  public openCase(input: OpenCaseInput): ResponsibilityCaseState {
    const day = Math.max(1, this.context.player.gameDay?.dayIndex ?? 1);
    const kase: ResponsibilityCaseState = {
      id: `case_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`,
      createdDay: day,
      createdAt: Date.now(),
      sourceNpc: input.sourceNpc,
      actualOwnerNpc: input.actualOwnerNpc,
      blamedPlayer: input.blamedPlayer ?? true,
      cause: input.cause,
      severity: input.severity,
      relatedTaskId: input.relatedTaskId,
      relatedIncidentId: input.relatedIncidentId,
      evidenceIds: [],
      status: 'OPEN',
      performanceDelta: 0,
      relationshipEffects: {},
    };
    const next = [...this.context.player.responsibilityCases, kase];
    this.context.player.responsibilityCases = next.length > MAX_CASES ? next.slice(next.length - MAX_CASES) : next;
    return kase;
  }

  public attachEvidence(caseId: string, evidenceId: string): void {
    const kase = this.caseById(caseId);
    if (!kase || kase.evidenceIds.includes(evidenceId)) return;
    this.replaceCase({ ...kase, evidenceIds: [...kase.evidenceIds, evidenceId] });
  }

  /** 背锅：接下不属于自己的责任。 */
  public acceptBlame(caseId: string): ResolveOutcome {
    const kase = this.mustCase(caseId);
    const severityPerf: Record<IncidentSeverity, number> = { S1: -8, S2: -5, S3: -3, S4: -1 };
    const perf = severityPerf[kase.severity] ?? -3;
    const rel: Record<string, number> = { [kase.sourceNpc]: 5 };
    return this.resolve(caseId, 'PLAYER_ACCEPTED', perf, rel, '你把锅接了下来。领导觉得你态度端正，甩锅的人松了一口气。');
  }

  /**
   * 拿证据反击：有证据 → 责任归位；没证据 → 反驳失败（DISPUTED 变 OPEN，加重后果）。
   * §29：前一天有没有风险确认/聊天记录/需求文档，直接决定这里的结果。
   */
  public clearWithEvidence(caseId: string): ResolveOutcome {
    const kase = this.mustCase(caseId);
    if (kase.evidenceIds.length === 0) {
      const perf = -2;
      const rel: Record<string, number> = { [kase.sourceNpc]: 3 };
      return this.resolve(caseId, 'PLAYER_ACCEPTED', perf, rel, '你空口反驳，没有证据。最后还是你"态度问题"。');
    }
    const perf = 3;
    const rel: Record<string, number> = { [kase.sourceNpc]: -8 };
    return this.resolve(caseId, 'PLAYER_CLEARED', perf, rel, '证据摆出来，会议室安静了三秒。锅物归原主。');
  }

  /** 领导和稀波单独结案（不了了之）。 */
  public closeUnresolved(caseId: string, summary: string): ResolveOutcome {
    return this.resolve(caseId, 'RESOLVED', 0, {}, summary);
  }

  private resolve(caseId: string, status: ResponsibilityStatus, performanceDelta: number, relationshipEffects: Record<string, number>, summary: string): ResolveOutcome {
    const kase = this.mustCase(caseId);
    this.replaceCase({
      ...kase,
      status,
      resolution: summary,
      performanceDelta,
      relationshipEffects,
    });
    // 落地后果
    const player = this.context.player;
    if (performanceDelta !== 0) {
      player.performance = Math.max(0, player.performance + performanceDelta);
      this.context.gameDay.addIncome('performance', performanceDelta);
    }
    for (const [npc, delta] of Object.entries(relationshipEffects)) {
      const cur = player.relationships[npc] ?? 0;
      player.relationships[npc] = Math.max(-100, Math.min(100, cur + delta));
    }
    // NPC 记忆：甩锅成功的人下次还找你；被反杀的人记仇（§31）。
    if (status === 'PLAYER_ACCEPTED' && kase.blamedPlayer) {
      setMemory(this.context, kase.sourceNpc, 'BLAMED_PLAYER_SUCCEEDED');
    }
    if (status === 'PLAYER_CLEARED') {
      setMemory(this.context, kase.sourceNpc, 'BLAME_FAILED');
      setMemory(this.context, kase.actualOwnerNpc, 'CAUGHT_BY_PLAYER');
    }
    this.bumpLifetime(status === 'PLAYER_CLEARED' ? 'blameCounters' : 'blamesTaken', 1);
    this.context.events.emit('playerChanged', { reason: 'responsibilityResolved', mode: player.workMode });
    return { caseId, status, performanceDelta, relationshipEffects, summary };
  }

  private mustCase(caseId: string): ResponsibilityCaseState {
    const kase = this.caseById(caseId);
    if (!kase) throw new Error('责任案件不存在');
    return kase;
  }

  private replaceCase(next: ResponsibilityCaseState): void {
    const cases = this.context.player.responsibilityCases;
    const idx = cases.findIndex((c) => c.id === next.id);
    if (idx < 0) return;
    const cloned = [...cases];
    cloned[idx] = next;
    this.context.player.responsibilityCases = cloned;
  }

  private bumpLifetime(key: string, delta: number): void {
    const stats = this.context.player.lifetimeStats;
    this.context.player.lifetimeStats = { ...stats, [key]: (stats[key] ?? 0) + delta };
  }
}

/** NPC 记忆统一落在 eventFlags（`mem:<npcId>:<flag>`），供事件条件与后续事件引用。 */
export function setMemory(context: GameContext, npcId: string, flag: string): void {
  context.player.eventFlags = { ...context.player.eventFlags, [`mem:${npcId}:${flag}`]: true };
}

export function hasMemory(context: GameContext, npcId: string, flag: string): boolean {
  return context.player.eventFlags[`mem:${npcId}:${flag}`] === true;
}
