import type { GameContext } from '../core/game-context';
import type { AssignedTaskPriority, AssignedTaskSource, AssignedTaskState } from '../model/save-data';

const MAX_OPEN = 12;
const MAX_CASES_KEEP = 40;

const PRIORITY_ORDER: Record<AssignedTaskPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export interface AssignTaskInput {
  readonly title: string;
  readonly detail?: string;
  readonly priority: AssignedTaskPriority;
  readonly source: AssignedTaskSource;
  readonly rewardSalary?: number;
  readonly rewardPerformance?: number;
  readonly rewardCultivation?: number;
  readonly rewardMind?: number;
  readonly isFakeP0?: boolean;
}

export interface AssignedTaskReward {
  readonly taskId: string;
  readonly salary: number;
  readonly performance: number;
  readonly cultivation: number;
  readonly mind: number;
  readonly summary: string;
}

/**
 * V4 指派任务系统（§33~§40）。
 *
 * 任务不再全部由玩家主动领取：老板/同事/产品/测试/客户/事故随时塞过来。
 * 假 P0（isFakeP0）完成后收益极低——玩家需要自己判断哪句"P0"是真的。
 */
export class AssignedTaskService {
  public constructor(private readonly context: GameContext) {}

  public all(): AssignedTaskState[] {
    return [...this.context.player.assignedTasks];
  }

  /** 首页待办：OPEN 按 P0→P3 + 新任务优先，截前 n 个。 */
  public topForHome(n = 4): AssignedTaskState[] {
    return this.open()
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.createdAt - a.createdAt)
      .slice(0, Math.max(1, n));
  }

  public open(): AssignedTaskState[] {
    return this.all().filter((t) => t.status === 'OPEN');
  }

  public overflowCount(n = 4): number {
    return Math.max(0, this.open().length - n);
  }

  public assign(input: AssignTaskInput): AssignedTaskState {
    const player = this.context.player;
    const day = Math.max(1, player.gameDay?.dayIndex ?? 1);
    const task: AssignedTaskState = {
      id: `at_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`,
      title: input.title,
      detail: input.detail,
      priority: input.priority,
      source: input.source,
      createdDay: day,
      createdAt: Date.now(),
      status: 'OPEN',
      rewardSalary: input.rewardSalary ?? 0,
      rewardPerformance: input.rewardPerformance ?? 0,
      rewardCultivation: input.rewardCultivation ?? 0,
      rewardMind: input.rewardMind ?? 0,
      isFakeP0: input.isFakeP0 ?? false,
    };
    // 溢出保护：超过上限时自动过期最旧的 P3/P2。
    const open = [...player.assignedTasks.filter((t) => t.status === 'OPEN')];
    if (open.length >= MAX_OPEN) {
      const victim = open
        .filter((t) => t.priority === 'P3' || t.priority === 'P2')
        .sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority] || a.createdAt - b.createdAt)[0];
      if (victim) {
        player.assignedTasks = player.assignedTasks.map((t) => (t.id === victim.id ? { ...t, status: 'EXPIRED' as const } : t));
      }
    }
    const next = [...player.assignedTasks, task];
    player.assignedTasks = next.length > MAX_CASES_KEEP ? next.slice(next.length - MAX_CASES_KEEP) : next;
    this.context.events.emit('playerChanged', { reason: 'assignedTask', mode: player.workMode });
    return task;
  }

  /** 完成：真任务给真实收益；假 P0 几乎白干（§36）。 */
  public complete(taskId: string): AssignedTaskReward {
    const task = this.mustTask(taskId);
    if (task.status !== 'OPEN') throw new Error('任务已处理');
    const scale = task.isFakeP0 ? 0.2 : 1;
    const salary = Math.floor(task.rewardSalary * scale);
    const performance = Math.floor(task.rewardPerformance * scale);
    const cultivation = Math.floor(task.rewardCultivation * scale);
    const player = this.context.player;
    if (salary > 0) {
      player.salary += salary;
      this.context.gameDay.addIncome('salary', salary);
      this.context.kpi.recordSalaryEarned(salary);
    }
    if (performance !== 0) {
      player.performance = Math.max(0, player.performance + performance);
      this.context.gameDay.addIncome('performance', performance);
    }
    if (cultivation > 0) {
      player.cultivationExp += cultivation;
      this.context.gameDay.addIncome('cultivation', cultivation);
    }
    if (task.rewardMind !== 0) this.context.mind.applyDelta(task.rewardMind);
    this.replace({ ...task, status: 'DONE' });
    this.bumpLifetime('assignedTasksDone', 1);
    this.bumpLifetime('fakeP0Done', task.isFakeP0 ? 1 : 0);
    const summary = task.isFakeP0
      ? `你认真处理了"假 P0"。收益：¥${salary}。`
      : `任务完成：${task.title}。收益：¥${salary}。`;
    this.context.events.emit('playerChanged', { reason: 'assignedTaskDone', mode: player.workMode });
    return { taskId, salary, performance, cultivation, mind: task.rewardMind, summary };
  }

  /**
   * 拒绝/搁置：后果由情境决定——真 P0 拒绝绩效大跌，假 P0 拒绝反而是正确答案（§39~§40）。
   */
  public refuse(taskId: string): AssignedTaskReward {
    const task = this.mustTask(taskId);
    if (task.status !== 'OPEN') throw new Error('任务已处理');
    const player = this.context.player;
    const isRealP0 = task.priority === 'P0' && !task.isFakeP0;
    const performance = isRealP0 ? -6 : task.priority === 'P0' ? 1 : -1;
    const mind = isRealP0 ? -4 : 4;
    player.performance = Math.max(0, player.performance + performance);
    this.context.gameDay.addIncome('performance', performance);
    this.context.mind.applyDelta(mind);
    this.replace({ ...task, status: 'REFUSED' });
    this.bumpLifetime('assignedTasksRefused', 1);
    if (task.isFakeP0) this.bumpLifetime('fakeP0Refused', 1);
    const summary = isRealP0
      ? `你拒了真 P0（${task.title}）。绩效 ${performance}，领导记住了。`
      : task.isFakeP0
        ? '你判断这是假 P0 并拒绝了。道心 +4。'
        : `你搁置了「${task.title}」。`;
    this.context.events.emit('playerChanged', { reason: 'assignedTaskRefused', mode: player.workMode });
    return { taskId, salary: 0, performance, cultivation: 0, mind, summary };
  }

  /** 每日 tick：两天前的旧任务过期（世界不等人）。 */
  public expireStale(currentDay: number): number {
    const stale = this.context.player.assignedTasks.filter(
      (t) => t.status === 'OPEN' && currentDay - t.createdDay >= 2,
    );
    if (!stale.length) return 0;
    this.context.player.assignedTasks = this.context.player.assignedTasks.map((t) =>
      stale.some((s) => s.id === t.id) ? { ...t, status: 'EXPIRED' as const } : t,
    );
    return stale.length;
  }

  private mustTask(id: string): AssignedTaskState {
    const task = this.all().find((t) => t.id === id);
    if (!task) throw new Error('指派任务不存在');
    return task;
  }

  private replace(next: AssignedTaskState): void {
    this.context.player.assignedTasks = this.context.player.assignedTasks.map((t) => (t.id === next.id ? next : t));
  }

  private bumpLifetime(key: string, delta: number): void {
    const stats = this.context.player.lifetimeStats;
    this.context.player.lifetimeStats = { ...stats, [key]: (stats[key] ?? 0) + delta };
  }
}
