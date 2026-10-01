import type { GameContext } from '../core/game-context';
import type { DailyRealityEntryState } from '../model/save-data';

/**
 * V5.6 P0-2：Workday Planner（§5）。
 * 09:00 生成今日计划（分钟级），实时计算 Today Capacity：
 * 剩余工时 vs 剩余计划 → 预计下班时间（§5.1~§5.3）。
 * PlanVsReality（§5.2）按分钟记账：planned/unplanned/meeting/incident/helping/blame/fishing/cultivation/switch/overtime。
 */

export interface DailyPlanEntry {
  readonly title: string;
  readonly minutes: number;
  readonly source: string;
  readonly taskId?: string;
  readonly done: boolean;
}

export interface TodayCapacityView {
  readonly remainingWorkMinutes: number;
  readonly remainingPlanMinutes: number;
  readonly projectedOvertimeMinutes: number;
  readonly projectedOffWorkTime: string;
  readonly overload: boolean;
  readonly advice: string;
}

export interface PlanVsRealityView {
  readonly plan: readonly DailyPlanEntry[];
  readonly plannedMinutes: number;
  readonly unplannedMinutes: number;
  readonly meetingMinutes: number;
  readonly incidentMinutes: number;
  readonly helpingMinutes: number;
  readonly blameMinutes: number;
  readonly fishingMinutes: number;
  readonly cultivationMinutes: number;
  readonly contextSwitchCount: number;
  readonly contextSwitchMinutes: number;
  readonly overtimeMinutes: number;
}

const PLANNED_POOL: readonly { title: string; minutes: number; source: string }[] = [
  { title: '修复线上登录异常', minutes: 120, source: '测试仙子' },
  { title: '接口 B 开发与联调', minutes: 100, source: '自己计划' },
  { title: '慢 SQL 优化', minutes: 90, source: '自己计划' },
  { title: '代码评审 ×2', minutes: 30, source: '同事' },
  { title: '写日报', minutes: 20, source: '系统' },
  { title: '需求文档确认', minutes: 20, source: '产品经理' },
  { title: '补充单元测试', minutes: 80, source: '自己计划' },
];

export class DailyPlannerService {
  public constructor(private readonly context: GameContext) {}

  /**
   * §5.1 09:00 生成今日计划：V5.7 从**职业任务池**抽主体（80%+），
   * 跨职业 10~20%（NPC 价值/跨职业问题 §13），疲劳与装备降低任务效率（分钟膨胀）。
   */
  public beginWorkday(): void {
    const player = this.context.player;
    if ((player.dailyPlan ?? []).length > 0) return; // 已生成（loop 首日只调一次）
    const rng = this.context.randomV2.forDay(this.context.gameDay.dayIndex() || 1, 6101);
    const picked: DailyPlanEntry[] = [];
    // 职业池（V5.7）优先
    const profContent = this.context.professionContent;
    const profPool = profContent ? [...profContent.taskPool()] : [];
    if (profPool.length >= 6) {
      const count = 3 + Math.floor(rng.next() * 3); // 3~5 条
      const used = new Set<string>();
      let crossBudget = rng.next() < 0.65 ? 1 : 0; // 每天最多 1~2 条跨职业
      if (rng.next() < 0.4) crossBudget += 1;
      // 跨职业：从其他职业池抽
      const others: { title: string; minutes: number; source: string; taskId?: string }[] = [];
      if (crossBudget > 0) {
        for (const otherId of ['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS']) {
          const other = profContent?.taskPoolOf(otherId) ?? [];
          if (other.length > 0) others.push(...other.slice(0, 4));
        }
      }
      while (picked.length < count && used.size < profPool.length + others.length) {
        const useCross = crossBudget > 0 && others.length > 0 && (picked.length >= count - crossBudget);
        const pool = useCross ? others : profPool;
        const idx = Math.floor(rng.next() * pool.length);
        const entry = pool[idx];
        if (used.has(entry.title)) continue;
        used.add(entry.title);
        if (useCross) {
          crossBudget -= 1;
          others.splice(idx, 1);
        }
        picked.push({
          title: entry.title,
          minutes: Math.round(entry.minutes * this.efficiencyMul()),
          source: entry.source,
          taskId: (entry as { id?: string }).id,
          done: false,
        });
      }
    } else {
      // 兜底：V5.6 通用池
      const pool = PLANNED_POOL;
      const count = 3 + Math.floor(rng.next() * 3);
      const used = new Set<number>();
      while (picked.length < count && used.size < pool.length) {
        const idx = Math.floor(rng.next() * pool.length);
        if (used.has(idx)) continue;
        used.add(idx);
        picked.push({ ...pool[idx], minutes: Math.round(pool[idx].minutes * this.efficiencyMul()), done: false });
      }
    }
    player.dailyPlan = picked.map((p) => `${p.title}（${p.minutes}分钟 · ${p.source}）`);
    // 计划明细落 messenger side-state（taskRuntime 也能读）
    (player as unknown as { dailyPlanEntries?: DailyPlanEntry[] }).dailyPlanEntries = picked;
    this.context.events.emit('dailyPlanGenerated', { entries: picked, totalMinutes: picked.reduce((s, p) => s + p.minutes, 0) });
  }

  /** 任务效率乘数：疲劳分档 + 装备词缀（996套/职业词缀）。 */
  private efficiencyMul(): number {
    let mul = 1;
    try { mul /= Math.max(0.5, this.context.fatigue.efficiencyMul()); } catch { /* ignore */ }
    try {
      const eq = this.context.loot.workStats();
      mul /= Math.max(0.6, 1 + eq.taskEfficiency);
    } catch { /* ignore */ }
    return Math.min(1.6, Math.max(0.6, mul));
  }

  /** §5.3 Today Capacity：剩余工时 vs 剩余计划 → 预计下班。 */
  public capacity(): TodayCapacityView {
    const clock = this.context.clockV2;
    const now = clock.now();
    const date = clock.getGameDate();
    const nowMinutes = date.hour * 60 + date.minute;
    const workEnd = clock.workEndHour * 60;
    const remainingWorkMinutes = Math.max(0, workEnd - nowMinutes);

    const entries = this.planEntries();
    const plan = this.context.gameDay.current();
    void plan;
    // 剩余计划 = 未完成条目分钟和 - 今日已推进（用 activeTasks 完成近似）
    const remainingPlanMinutes = entries.filter((e) => !e.done).reduce((s, e) => s + e.minutes, 0);
    const projectedOffMinutes = nowMinutes + remainingPlanMinutes;
    const overtimeMinutes = Math.max(0, projectedOffMinutes - workEnd);
    const overload = overtimeMinutes > 30;
    const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
    const advice = remainingWorkMinutes === 0
      ? '工时已用完。要么加班，要么明天见。'
      : overload
        ? `照这个速度，你今天大概${hhmm(projectedOffMinutes)}下班。今天大概率又走不了了。`
        : `理论上今天能准时下班（预计${hhmm(Math.min(projectedOffMinutes, workEnd))}）。`;
    return {
      remainingWorkMinutes,
      remainingPlanMinutes,
      projectedOvertimeMinutes: overtimeMinutes,
      projectedOffWorkTime: hhmm(Math.max(projectedOffMinutes, nowMinutes)),
      overload,
      advice,
    };
  }

  public planEntries(): DailyPlanEntry[] {
    return (this.context.player as unknown as { dailyPlanEntries?: DailyPlanEntry[] }).dailyPlanEntries
      ?? (this.context.player.dailyPlan ?? []).map((text) => ({ title: text, minutes: 60, source: '系统', done: false }));
  }

  /** 完成一条计划条目（任务完成/claim 时调用）。 */
  public markPlanDoneByTask(taskNamePart: string): void {
    const entries = this.planEntries();
    const target = entries.find((e) => !e.done && e.title.includes(taskNamePart));
    if (target) {
      (this.context.player as unknown as { dailyPlanEntries?: DailyPlanEntry[] }).dailyPlanEntries =
        entries.map((e) => (e === target ? { ...e, done: true } : e));
    }
  }

  /** §5.2 PlanVsReality 记账视图。 */
  public planVsReality(): PlanVsRealityView {
    const player = this.context.player;
    const reality: DailyRealityEntryState[] = player.dailyReality ?? [];
    const sum = (kind: DailyRealityEntryState['kind']) =>
      reality.filter((r) => r.kind === kind).length;
    const switchCount = reality.filter((r) => r.text.includes('上下文') || r.text.includes('切换')).length;
    const entries = this.planEntries();
    return {
      plan: entries,
      plannedMinutes: entries.reduce((s, e) => s + e.minutes, 0),
      unplannedMinutes: sum('WORK') * 15,
      meetingMinutes: sum('MEETING') * 30,
      incidentMinutes: sum('INCIDENT') * 40,
      helpingMinutes: sum('FAVOR') * 15,
      blameMinutes: sum('BLAME') * 20,
      fishingMinutes: Math.round((player.fishingSeconds ?? 0) % 86400 / 60),
      cultivationMinutes: Math.round((player.cultivatingSeconds ?? 0) % 86400 / 60),
      contextSwitchCount: player.activeTasks.reduce((s, t) => s + (t.contextSwitchCount ?? 0), 0),
      contextSwitchMinutes: player.activeTasks.reduce((s, t) => s + (t.contextSwitchCount ?? 0), 0) * 3,
      overtimeMinutes: Math.round((player.gameDay?.durations.overtime ?? 0) / 60),
    };
  }
}
