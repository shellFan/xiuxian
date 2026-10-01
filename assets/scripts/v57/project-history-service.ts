import type { GameContext } from '../core/game-context';

/**
 * V5.7 Phase G — Project History（项目连续性）。
 * 项目不再"完成即消失"：历史持久化，跨天可回归（祖传后台又炸了），战绩（Career Record）沉淀。
 */

export interface ProjectHistoryRecord {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly status: string;
  readonly ending: string;
  readonly startedDayIndex: number;
  readonly completedDayIndex: number;
  readonly delays: number;
  readonly requirementChanges: number;
  readonly bugCount: number;
  readonly techDebt: number;
  readonly spentMinutes: number;
  readonly decisionCount: number;
  readonly s1Count: number;
  readonly npcIds: readonly string[];
  readonly bossIds: readonly string[];
}

export interface CareerRecordView {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly reached: boolean;
}

const ENDING_CN: Record<string, string> = {
  COMPLETED: '完美上线', DELAYED: '延期上线', CANCELLED: '项目取消', FAILED: '项目烂尾',
  READY_TO_RELEASE: '待上线', RELEASED: '上线', PRODUCTION: '生产运行', RELEASING: '发布中',
};

export class ProjectHistoryService {
  public constructor(private readonly context: GameContext) {}

  public history(): readonly ProjectHistoryRecord[] {
    return this.context.player.projectHistory ?? [];
  }

  /** 项目终结时归档（ProjectService 调用）。 */
  public archiveFromCurrent(ending: string): ProjectHistoryRecord | null {
    const project = this.context.projectService.current();
    if (!project) return null;
    const dayIndex = this.context.player.gameDay?.dayIndex ?? 1;
    const record: ProjectHistoryRecord = {
      id: project.id,
      name: project.name,
      type: project.type,
      status: project.status,
      ending,
      startedDayIndex: Math.max(1, dayIndex - Math.max(1, Math.round(project.spentMinutes / 480))),
      completedDayIndex: dayIndex,
      delays: project.status === 'DELAYED' ? 1 : 0,
      requirementChanges: project.requirementChanges,
      bugCount: project.bugCount,
      techDebt: Math.round(project.techDebt),
      spentMinutes: project.spentMinutes,
      decisionCount: project.decisionHistory.length,
      s1Count: project.linkedIncidentIds.length,
      npcIds: ['PRODUCT', 'TESTER'],
      bossIds: this.bossesForProjectType(project.type),
    };
    const history = [...(this.context.player.projectHistory ?? []), record];
    this.context.player.projectHistory = history;
    this.context.events.emit('projectArchived', { projectId: record.id, name: record.name, ending: record.ending });
    return record;
  }

  private bossesForProjectType(type: string): string[] {
    const map: Record<string, string[]> = {
      PAYMENT: ['boss_slowsql_ancestor'], LEGACY: ['boss_oom_lord', 'boss_cache_avalanche'],
      GROWTH: ['boss_req_demon'], INFRA: ['boss_production_incident'], DATA: ['boss_slowsql_ancestor'],
    };
    return map[type] ?? ['boss_req_demon'];
  }

  /**
   * 项目回归（§59）：新事故/新项目有概率是历史项目复发。
   * 返回命中的历史项目（ProjectService 用它命名新项目/加成事故概率）。
   */
  public pickReturning(rng: () => number): ProjectHistoryRecord | null {
    const history = this.history().filter((h) => h.techDebt >= 55 && h.status !== 'CANCELLED');
    if (history.length === 0) return null;
    if (rng() > 0.25) return null;
    return history[Math.floor(rng() * history.length)];
  }

  /** 战绩（§62）。 */
  public careerRecords(): CareerRecordView[] {
    const history = this.history();
    const stats = this.context.player.lifetimeStats ?? {};
    const totalChanges = history.reduce((s, h) => s + h.requirementChanges, 0);
    const legacyCount = history.filter((h) => h.techDebt >= 55).length;
    return [
      { id: 'cr_payment_guard', name: '支付系统守夜人', desc: '处理过支付系统的 S1 事故', reached: history.some((h) => h.type === 'PAYMENT' && h.s1Count > 0) || (stats.s1Handled ?? 0) > 0 },
      { id: 'cr_legacy_keeper', name: '祖传代码继承者', desc: '维护过 3 次祖传系统', reached: legacyCount >= 3 },
      { id: 'cr_req_terminator', name: '需求终结者', desc: `经历 ${totalChanges} 次需求变更（≥10 解锁）`, reached: totalChanges >= 10 },
      { id: 'cr_perfect_ship', name: '完美交付', desc: '零延期零事故完成一个项目', reached: history.some((h) => h.ending === '完美上线' && h.bugCount === 0) },
      { id: 'cr_veteran', name: '项目老兵', desc: '完成 5 个项目', reached: history.length >= 5 },
    ];
  }
}
