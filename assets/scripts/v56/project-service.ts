import type { GameContext } from '../core/game-context';
import type { ProjectDecisionRecord, ProjectState } from '../model/save-data';

/**
 * V5.6 P0-4：项目状态机（§7）。
 * 项目结局从 UI 移入 domain：resolveProjectDecision 由 facade 暴露，UI 只渲染。
 * 状态机：PLANNING→DEVELOPMENT→TESTING→BUG_FIX→READY_TO_RELEASE→RELEASING→PRODUCTION→COMPLETED；
 * 分支：DELAYED / CANCELLED / FAILED。跨天后果（§7.6 带病上线→未来事故概率）落 eventFlags。
 */

export interface ProjectDecisionDef {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly nextStatus: ProjectState['status'];
  readonly victoryOnly: boolean;
  /** 结局效果（domain 落地，§7.4~§7.7）。 */
  readonly apply: (ctx: GameContext, project: ProjectState) => void;
}

const DAY = 86_400_000;

export const PROJECT_DECISIONS: readonly ProjectDecisionDef[] = [
  {
    id: 'delay', label: '领导：延期两天，把问题解决干净。',
    note: 'deadline +2d · 技术债下降机会 · 道心 +',
    nextStatus: 'DELAYED', victoryOnly: true,
    apply: (ctx, project) => {
      project.deadlineAt += 2 * DAY;
      project.status = 'DELAYED';
      ctx.player.mind = Math.min(ctx.player.maxMind, ctx.player.mind + 4);
      ctx.player.performance = Math.max(0, ctx.player.performance - 2);
      ctx.messenger.appendReality({ time: ctx.clockV2.now(), text: '项目延期两天', kind: 'CHANGE' });
    },
  },
  {
    id: 'add_requirements', label: '产品：客户又加了三个需求。',
    note: '新增 3 个真实项目任务 · requirementChanges +3 · deadline 不变',
    nextStatus: 'DEVELOPMENT', victoryOnly: false,
    apply: (ctx, project) => {
      project.requirementChanges += 3;
      project.requirementCount += 3;
      project.plannedMinutes += 3 * 90;
      const names = PROFESSION_TASK_TITLES[ctx.profession?.currentId() ?? 'JAVA_BACKEND'] ?? PROFESSION_TASK_TITLES.JAVA_BACKEND;
      for (let i = 0; i < 3; i += 1) {
        try {
          ctx.assignedTasks.assign({ title: names[i % names.length], priority: i === 0 ? 'P1' : 'P2', source: 'PRODUCT' });
          (project.linkedTaskIds as string[]).push(`req_${Date.now().toString(36)}_${i}`);
        } catch { /* best-effort */ }
      }
      ctx.player.mind = Math.max(0, ctx.player.mind - 3);
    },
  },
  {
    id: 'force_release', label: '老板：今晚必须上线（风险自担）。',
    note: 'releaseRisk ↑ · 技术债 +8 · 未来 1~3 天事故概率 ↑',
    nextStatus: 'RELEASING', victoryOnly: true,
    apply: (ctx, project) => {
      project.status = 'RELEASING';
      project.releaseRisk += 40;
      project.techDebt += 8;
      ctx.player.eventFlags = { ...ctx.player.eventFlags, sickReleaseDay: true };
      ctx.player.eventFlags = { ...ctx.player.eventFlags, [`sickReleaseDayIndex:${ctx.gameDay.dayIndex()}`]: true };
      ctx.player.mind = Math.max(0, ctx.player.mind - 4);
    },
  },
  {
    id: 'early_release', label: '领导：做得不错，提前上线！',
    note: '绩效 +8 · 工资奖金 · 稀有掉落',
    nextStatus: 'COMPLETED', victoryOnly: true,
    apply: (ctx, project) => {
      project.status = 'COMPLETED';
      project.progress = 100;
      ctx.player.performance += 8;
      ctx.economy.applyIdleSalary(120);
      ctx.gameDay.addIncome('salary', 120);
      ctx.profession.grantExp(30);
      ctx.player.mind = Math.min(ctx.player.maxMind, ctx.player.mind + 6);
    },
  },
  {
    id: 'bug_fix', label: '测试：还有 7 个 Bug。进入 BUG_FIX 阶段。',
    note: 'BUG_FIX 阶段 · 修复后重新评估',
    nextStatus: 'BUG_FIX', victoryOnly: false,
    apply: (ctx, project) => {
      project.status = 'BUG_FIX';
      project.bugCount += 7;
      ctx.player.mind = Math.max(0, ctx.player.mind - 2);
    },
  },
  {
    id: 'cancel', label: '客户：这个功能不要了。（需求作废）',
    note: '项目 CANCELLED · 无效劳动统计 · 道心 -5',
    nextStatus: 'CANCELLED', victoryOnly: false,
    apply: (ctx, project) => {
      project.status = 'CANCELLED';
      project.wastedWorkMinutes += project.spentMinutes;
      ctx.player.mind = Math.max(0, ctx.player.mind - 5);
      ctx.player.lifetimeStats = { ...ctx.player.lifetimeStats, wastedWorkMinutes: (ctx.player.lifetimeStats?.wastedWorkMinutes ?? 0) + project.wastedWorkMinutes };
    },
  },
  {
    id: 'sick_release', label: '领导：败了也先上线，边跑边修。',
    note: '带病上线 · releaseRisk ↑↑ · 技术债 +10',
    nextStatus: 'PRODUCTION', victoryOnly: false,
    apply: (ctx, project) => {
      project.status = 'PRODUCTION';
      project.releaseRisk += 55;
      project.techDebt += 10;
      ctx.player.eventFlags = { ...ctx.player.eventFlags, sickReleaseDay: true };
      ctx.player.mind = Math.max(0, ctx.player.mind - 3);
    },
  },
];

const PROFESSION_TASK_TITLES: Record<string, readonly string[]> = {
  JAVA_BACKEND: ['支付回调幂等改造', '订单服务接口重构', '库存扣减并发修复'],
  FRONTEND: ['白屏监控埋点', '跨域代理配置', '首屏懒加载改造'],
  QA: ['支付链路自动化用例', '0 元下单边界用例', '回归集裁剪与补齐'],
  DEVOPS: ['Pod 崩溃自愈脚本', 'Nginx 限流配置', '证书自动续期'],
  DBA: ['慢 SQL 索引重建', '连接池参数调优', '大事务拆分'],
  PRODUCT_OWNER: ['需求文档重写', '客户确认记录整理', '验收口径对齐'],
};

export class ProjectService {
  public constructor(private readonly context: GameContext) {}

  /** 当前项目（一个玩家同时一个活跃项目，§7.6 项目持续数小时到数天）。 */
  public current(): ProjectState | null {
    return this.context.player.project;
  }

  /** 确保存在活跃项目（战斗/任务/事件需要项目锚点时）。 */
  public ensureProject(): ProjectState {
    const existing = this.current();
    if (existing && !['COMPLETED', 'CANCELLED', 'FAILED'].includes(existing.status)) return existing;
    const rng = this.context.randomV2.forDay(this.context.gameDay.dayIndex() || 1, 7601);
    const names = ['支付系统', '祖传后台管理系统', '电商活动系统', 'Redis缓存改造', '微服务拆分', '双十一项目'];
    const name = names[Math.floor(rng.next() * names.length)];
    const now = this.context.clockV2.now();
    const plannedMinutes = 240 + Math.floor(rng.next() * 480);
    const project: ProjectState = {
      id: `proj_${now.toString(36)}`,
      name,
      type: 'GENERIC',
      status: 'DEVELOPMENT',
      startedAt: now,
      deadlineAt: now + 3 * DAY,
      plannedMinutes,
      spentMinutes: 0,
      progress: 0,
      techDebt: this.context.techDebt.average?.() ?? 0,
      bugCount: 0,
      criticalBugCount: 0,
      requirementCount: 1,
      requirementChanges: 0,
      risk: 10,
      releaseRisk: 0,
      clientRelation: 0,
      bossPressure: 20,
      linkedTaskIds: [],
      linkedIncidentIds: [],
      battleStage: 0,
      decisionHistory: [],
      wastedWorkMinutes: 0,
    };
    this.context.player.project = project;
    this.context.events.emit('projectStarted', { projectId: project.id, name });
    return project;
  }

  /** 战斗胜利推进项目阶段（§31：Boss 胜利自动完成待办 + 项目进度）。 */
  public advanceFromBattle(wave: number, victory: boolean): void {
    const project = this.ensureProject();
    project.battleStage = Math.max(project.battleStage, wave);
    project.progress = Math.min(95, Math.round((wave / 5) * 100));
    if (victory) project.status = 'TESTING';
  }

  /** 结算项目战斗耗时（战斗消耗 GameClock，§144~§147）。 */
  public addSpentMinutes(minutes: number): void {
    const project = this.current();
    if (project) project.spentMinutes += minutes;
  }

  /** 决策候选（胜利/失败各一组，按 dayIndex 确定性挑选）。 */
  public decisions(victory: boolean): ProjectDecisionDef[] {
    const pool = PROJECT_DECISIONS.filter((d) => (victory ? true : !d.victoryOnly || !d.victoryOnly));
    void pool;
    return PROJECT_DECISIONS.filter((d) => d.victoryOnly === victory || !d.victoryOnly)
      .filter((d) => (victory ? d.victoryOnly || !['CANCELLED'].includes(d.nextStatus) : ['BUG_FIX', 'CANCELLED', 'sick_release' as unknown].length >= 0));
  }

  /** §7.3：结局决策由 domain 处理。UI 只渲染。 */
  public resolveDecision(decisionId: string): { ok: boolean; reason?: string; label?: string } {
    const project = this.current();
    if (!project) return { ok: false, reason: '没有进行中的项目' };
    const decision = PROJECT_DECISIONS.find((d) => d.id === decisionId);
    if (!decision) return { ok: false, reason: '未知决策' };
    decision.apply(this.context, project);
    const record: ProjectDecisionRecord = {
      decisionId: decision.id,
      label: decision.label,
      dayIndex: this.context.gameDay.dayIndex() || 1,
      at: this.context.clockV2.now(),
    };
    project.decisionHistory = [...project.decisionHistory, record].slice(-32);
    this.context.saveService.save(this.context.player);
    this.context.events.emit('projectDecision', { projectId: project.id, decisionId, label: decision.label });
    return { ok: true, label: decision.label };
  }

  /** 跨天后果（§17）：带病上线 → 未来 1~3 天 incident 概率上升。 */
  public incidentRiskMultiplier(): number {
    const player = this.context.player;
    const flags = player.eventFlags ?? {};
    let mul = 1;
    for (const [key, value] of Object.entries(flags)) {
      if (key.startsWith('sickReleaseDayIndex:') && value) {
        const day = Number(key.split(':')[1]);
        const today = this.context.gameDay.dayIndex() || 1;
        if (today - day <= 3) mul += 0.5;
      }
    }
    if (flags.sickReleaseDay) mul += 0.25;
    const debt = this.context.techDebt.average?.() ?? 0;
    if (debt > 60) mul += 0.5;
    else if (debt > 40) mul += 0.25;
    return mul;
  }
}
