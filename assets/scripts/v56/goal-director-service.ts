import type { GameContext } from '../core/game-context';

/**
 * V5.6 P0-5：GoalDirector（§8）。
 * 分层输出 NOW/TODAY/PROJECT/CAREER/PROFESSION/LONG_TERM。
 * 推荐而非强制（§8.7）。优先级：Incident > P0 > Deadline imminent > Active task >
 * Project > Promotion > Profession > Daily plan > Optional。
 */

export interface GoalView {
  readonly layer: 'NOW' | 'TODAY' | 'PROJECT' | 'CAREER' | 'PROFESSION' | 'LONG_TERM';
  readonly priority: number;
  readonly icon: string;
  readonly text: string;
  readonly sub: string;
  readonly action: 'goto' | 'select' | 'none';
  readonly page?: string;
  readonly btn: string;
}

export class GoalDirectorService {
  public constructor(private readonly context: GameContext) {}

  /** OVERNIGHT §42：项目生命周期 → 职场语义（玩家不该读内部枚举）。 */
  private static readonly LIFECYCLE_CN: Record<string, string> = {
    PLANNING: '需求评审', DEVELOPMENT: '开发中', TESTING: '测试中', BUG_FIX: '修 Bug 中',
    READY_TO_RELEASE: '待上线', RELEASING: '上线中', PRODUCTION: '运行中', DELAYED: '已延期',
    CANCELLED: '已取消', FAILED: '已烂尾', COMPLETED: '已交付',
  };

  public goals(): GoalView[] {
    const goals: GoalView[] = [];
    const f = this.context;
    const player = f.player;

    // NOW 0（OVERNIGHT §9）：战斗已结束但结算未领取 —— 掉落不领就白打了
    try {
      const finished = f.battle.finished?.() ?? null;
      if (finished) {
        const victory = finished.status === 'VICTORY';
        goals.push({
          layer: 'NOW', priority: 9.5, icon: '🎁',
          text: victory ? '战斗胜利：战利品待领取' : '项目受挫：结算待查看',
          sub: `第 ${finished.wave}/${finished.waveTotal} 波 · 掉落按 ${victory ? '100' : '30'}% 结算，还有决策等你拍板`,
          action: 'goto', page: 'PROJECT', btn: '领取结算',
        });
      }
    } catch { /* battle not ready */ }

    // NOW：事故 > P0 > 活跃任务
    try {
      const incident = f.incidents.presentableActive?.() ?? null;
      if (incident) {
        goals.push({ layer: 'NOW', priority: 10, icon: '🚨', text: `🔴 P0线上事故：${incident.type}`, sub: '全组等你，进入事故处置', action: 'goto', page: 'HOME', btn: '立即处理' });
      }
    } catch { /* noop */ }
    const pendingCritical = player.activeTasks.find((t) => !t.completed && !t.claimed && t.foreground);
    if (pendingCritical) {
      const remain = f.taskRuntimeDirector
        ? Math.max(0, Math.round(f.taskRuntimeDirector.remainingSeconds(pendingCritical, f.clockV2.now()) / 60))
        : 0;
      goals.push({ layer: 'NOW', priority: 7, icon: '📋', text: `继续：${pendingCritical.name}`, sub: `剩余约 ${remain} 分钟 · 完成可领工资绩效`, action: 'goto', page: 'TASKS', btn: '继续任务' });
    }

    // NOW（OVERNIGHT §9）：道心告急 —— 立即可执行的恢复行为
    try {
      if (player.mind < 35) {
        goals.push({
          layer: 'NOW', priority: 6.5, icon: '🧘',
          text: `道心告急（${player.mind}/100）`,
          sub: '去修仙页打坐或摸鱼恢复，硬扛事故只会更糟',
          action: 'goto', page: 'CULTIVATION', btn: '恢复道心',
        });
      }
    } catch { /* noop */ }

    // TODAY：DailyPlanner capacity
    try {
      const cap = f.dailyPlanner.capacity();
      goals.push({
        layer: 'TODAY', priority: 5,
        icon: cap.overload ? '⏰' : '📅',
        text: cap.overload ? `今天大概率走不了：预计${cap.projectedOffWorkTime}下班` : `预计${cap.projectedOffWorkTime}下班`,
        sub: `剩余工时 ${Math.floor(cap.remainingWorkMinutes / 60)}h${cap.remainingWorkMinutes % 60}m · 剩余计划 ${Math.floor(cap.remainingPlanMinutes / 60)}h${cap.remainingPlanMinutes % 60}m`,
        action: 'none', btn: cap.overload ? '考虑砍需求' : '按计划推进',
      });
    } catch { /* planner not ready */ }

    // PROJECT
    const project = f.projectService?.current() ?? null;
    if (project && !['COMPLETED', 'CANCELLED', 'FAILED'].includes(project.status)) {
      const stageCn = GoalDirectorService.LIFECYCLE_CN[project.status] ?? project.status;
      goals.push({
        layer: 'PROJECT', priority: 4,
        icon: '⚔️', text: `${project.name}：${stageCn}`,
        sub: `进度 ${project.progress}% · Bug ${project.bugCount} · 债 ${Math.round(project.techDebt)}`,
        action: 'goto', page: 'PROJECT', btn: '进入项目',
      });
    }

    // CAREER：晋升差距
    try {
      const promo = f.promotionV2.check();
      if (promo) {
        const gaps: string[] = [];
        const career = f.career.current();
        if (!promo.cultivationOk && career) {
          const rest = Math.max(0, (career.requiredExp ?? 0) - player.cultivationExp);
          if (rest > 0) gaps.push(`修为 ${rest}`);
        }
        if (promo.workdaysRequired > 0 && promo.workdaysCurrent < promo.workdaysRequired) {
          gaps.push(`工作 ${promo.workdaysRequired - promo.workdaysCurrent} 天`);
        }
        if (!promo.mindOk) gaps.push('道心 30');
        goals.push({
          layer: 'CAREER', priority: 3,
          icon: '🏯',
          text: gaps.length ? `距离晋升还差：${gaps.join(' · ')}` : '晋升条件已达成！',
          sub: '渡劫答辩三题，60 分通过',
          action: 'goto', page: 'PROMOTION', btn: gaps.length ? '查看差距' : '参加答辩',
        });
      }
    } catch { /* noop */ }

    // PROFESSION
    try {
      const level = f.profession.level();
      const toNext = f.profession.expToNext();
      const def = f.profession.def();
      if (toNext > 0) {
        goals.push({
          layer: 'PROFESSION', priority: 2,
          icon: '🗡️', text: `${def.name} ${def.title} Lv${level}`,
          // OVERNIGHT §11：职业感知文案 — 禁止所有职业都提示 "Java 任务"
          sub: `经验 ${f.profession.exp()}/${f.profession.exp() + toNext} · 完成${def.name}任务可升级`,
          action: 'goto', page: 'TASKS', btn: '做职业任务',
        });
      }
    } catch { /* noop */ }

    // LONG_TERM
    try {
      const career = f.career.current();
      const next = f.career.get((career ? career.level : 1) + 2) ?? null;
      goals.push({
        layer: 'LONG_TERM', priority: 1,
        icon: '🌤️',
        text: `长期目标：${next ? next.name : '更高职级'}`,
        sub: `当前职级进度 ${player.careerLevel} / 10`,
        action: 'none', btn: '脚踏实地',
      });
    } catch { /* noop */ }

    return goals.sort((a, b) => b.priority - a.priority);
  }

  /** NOW 层单独输出（首页横幅）。 */
  public nowGoal(): GoalView | null {
    return this.goals()[0] ?? null;
  }
}
