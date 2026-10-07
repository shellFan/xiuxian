import type { GameContext } from '../core/game-context';
import type { WorkMode } from '../model/save-data';

export type TodayLifeKind = 'COFFEE' | 'LUNCH' | 'MILK_TEA' | 'CODE_COMMIT' | 'DOCUMENT';

export interface RuntimeTodoItem { readonly id: string; readonly title: string; readonly source: string; readonly priority?: string; }
export interface RuntimeActivityItem { readonly time: number; readonly text: string; readonly kind: string; }
export interface RuntimeLifeItem { readonly kind: TodayLifeKind; readonly label: string; readonly icon: string; readonly count: number; }

export interface RuntimeDataSnapshot {
  readonly clock: Readonly<{ hour: number; minute: number; weekday: number; isWeekend: boolean }>;
  readonly mode: WorkMode;
  readonly salaryBalance: number;
  readonly todayEarned: number;
  readonly incomeRate: Readonly<{ perSecond: number; perMinute: number; perHour: number }>;
  readonly todo: Readonly<{ pendingCount: number; items: readonly RuntimeTodoItem[] }>;
  readonly messages: Readonly<{ unreadCount: number; pendingReplyCount: number; latest: string | null }>;
  readonly activity: readonly RuntimeActivityItem[];
  readonly life: readonly RuntimeLifeItem[];
  readonly task: readonly RuntimeTodoItem[];
  readonly project: Readonly<{ name: string; status: string }> | null;
  readonly goal: Readonly<{ title: string; detail: string }> | null;
}

const LIFE: Readonly<Record<TodayLifeKind, { label: string; icon: string }>> = {
  COFFEE: { label: '咖啡', icon: '☕' }, LUNCH: { label: '午饭', icon: '🍜' },
  MILK_TEA: { label: '奶茶', icon: '🧋' }, CODE_COMMIT: { label: '提交代码', icon: '💻' },
  DOCUMENT: { label: '查看需求', icon: '📄' },
};

export function recordTodayLife(context: GameContext, kind: TodayLifeKind): { ok: boolean; reason?: string } {
  if (!LIFE[kind]) return { ok: false, reason: '未知今日生活行为' };
  context.gameDay.ensureStarted();
  context.messenger.appendReality({ time: context.clockV2.now(), text: LIFE[kind].label, kind: 'LIFE', lifeAction: kind });
  context.saveService.save(context.player);
  context.events.emit('playerChanged', { reason: 'todayLifeRecorded' });
  return { ok: true };
}

export function createRuntimeDataSnapshot(context: GameContext): RuntimeDataSnapshot {
  const player = context.player;
  const day = context.gameDay.current();
  const clock = context.clockV2.getGameDate();
  const assigned = context.assignedTasks.open().map((item) => ({ id: item.id, title: item.title, source: item.source, priority: item.priority }));
  const tasks = player.activeTasks.filter((item) => !item.claimed).map((item) => ({ id: item.taskId, title: item.name, source: '任务' }));
  const project = context.projectService.current();
  const projectTodo = project && !['COMPLETED', 'CANCELLED', 'FAILED'].includes(project.status)
    ? [{ id: project.id, title: `推进项目「${project.name}」`, source: '项目', priority: project.status }] : [];
  const incidentTodo = player.incidents.filter((item) => !['CLOSED', 'POSTMORTEM_DONE'].includes(item.status))
    .map((item) => ({ id: item.id, title: `处理${item.severity}事故`, source: '事故', priority: item.severity }));
  const replyTodo = context.messenger.pendingReplies().map((item) => ({ id: item.id, title: '回复飞剑传书', source: '传书', priority: '待回复' }));
  const todo = [...assigned, ...tasks, ...projectTodo, ...incidentTodo, ...replyTodo];
  const activity = [
    ...(player.dailyReality ?? []).map((item) => ({ time: item.time, text: item.text, kind: item.kind })),
    ...(day?.eventHistory ?? []).map((item) => ({ time: item.occurredAt, text: item.eventId ?? item.kind, kind: item.kind })),
  ].sort((a, b) => a.time - b.time).slice(-40).map((item) => Object.freeze({ ...item }));
  // 「今日」生活计数：只统计本工作日窗口（今日 09:00 起）内的行为，跨日自然清零
  const dayStartTs = context.clockV2.workdayStartTs();
  const lifeCounts = new Map<TodayLifeKind, number>();
  for (const item of player.dailyReality ?? []) {
    if (item.kind === 'LIFE' && item.lifeAction && LIFE[item.lifeAction] && item.time >= dayStartTs) {
      lifeCounts.set(item.lifeAction, (lifeCounts.get(item.lifeAction) ?? 0) + 1);
    }
  }
  // Array.from，NOT spread —— Cocos 转译会破坏 Map.entries() 展开（iterator-spread 扫描）
  const life = Array.from(lifeCounts.entries(), ([kind, count]) => Object.freeze({ kind, count, ...LIFE[kind] }));
  const conversations = context.messenger.conversationsView();
  const latest = conversations[0]?.lastPreview ?? null;
  const goal = context.goalDirector.nowGoal();
  return Object.freeze({
    clock: Object.freeze({ hour: clock.hour, minute: clock.minute, weekday: clock.weekday, isWeekend: context.clockV2.isWeekend() }),
    mode: player.workMode, salaryBalance: player.salary, todayEarned: day?.income.salary ?? 0,
    incomeRate: Object.freeze({ ...context.work.incomeRate() }),
    todo: Object.freeze({ pendingCount: todo.length, items: Object.freeze(todo.map((item) => Object.freeze(item))) }),
    messages: Object.freeze({ unreadCount: context.messenger.badge().totalUnread, pendingReplyCount: replyTodo.length, latest }),
    activity: Object.freeze(activity), life: Object.freeze(life), task: Object.freeze(tasks.map((item) => Object.freeze(item))),
    project: project ? Object.freeze({ name: project.name, status: project.status }) : null,
    goal: goal ? Object.freeze({ title: goal.text, detail: goal.sub }) : null,
  });
}
