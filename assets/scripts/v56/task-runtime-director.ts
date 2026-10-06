import type { GameContext } from '../core/game-context';
import type { ActiveTaskState } from '../model/save-data';
import { MESSENGER_CONTENT, type MessengerEventDef } from '../v5/messenger-content';

/**
 * V5.6 P0-1：TaskRuntimeDirector（§4）。
 *
 * 长任务不再是「开始→等待→50%事件→完成」：
 *  - runtimeSeed 派生确定性触发表（进度 %），save/load 后不变（§4.2）
 *  - 按时长分级决定事件次数：QUICK 0-1 / SHORT 0-2 / MEDIUM 1-3 / LONG 2-4 / EPIC 3-6
 *  - 事件按职业加权（§4.3），效果经 domain 桥落地（§4.4）：任务时长±/暂停/新任务/债/证据/NPC/绩效/道心
 *  - 任务状态机：ACTIVE / PAUSED / BLOCKED / COMPLETED / FAILED / CANCELLED（§4.5）
 *  - 前台唯一：同时只有 1 个 foreground 任务自然流逝；switchTask 带上下文切换损耗（§4.6）
 */

const MINUTE = 60_000;

export type TaskRuntimeStatus = 'ACTIVE' | 'PAUSED' | 'BLOCKED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/** §4.4：任务运行时事件的效果域。 */
export interface TaskRuntimeEffect {
  readonly durationAddedMinutes?: number;
  readonly durationReducedMinutes?: number;
  readonly pauseMinutes?: number;
  readonly blockedReason?: string;
  readonly newTask?: { readonly title: string; readonly priority: 'P0' | 'P1' | 'P2' | 'P3'; readonly source: string };
  readonly priorityChange?: 1 | -1;
  readonly techDebt?: readonly (readonly [string, number])[];
  readonly evidence?: readonly (readonly [string, string])[];
  readonly npc?: readonly (readonly [string, number])[];
  readonly mind?: number;
  readonly performance?: number;
  readonly professionExp?: number;
  readonly incidentRisk?: number;
  readonly nextEventId?: string;
  readonly realityText?: string;
  readonly achievementKey?: string;
}

export interface TaskRuntimeReplyDef {
  readonly id: string;
  readonly text: string;
  readonly tag?: string;
  readonly minCareerLevel?: number;
  readonly effects?: TaskRuntimeEffect;
}

export interface TaskRuntimeEventDef {
  readonly id: string;
  readonly professions?: readonly string[];
  readonly category: 'TECH' | 'WORKPLACE' | 'POSITIVE' | 'FUNNY' | 'MEETING' | 'INCIDENT';
  readonly weight: number;
  readonly steps: readonly { readonly sender: string; readonly text: string }[];
  readonly replies?: readonly TaskRuntimeReplyDef[];
}

/** 进度触发表：按 seed 洗牌取样，落在 12%~88% 区间且彼此间隔 ≥12%。
 *  ULTRA-DEEP #1（BLOCKER 修复）：count=6 时拒绝采样对多数 seed 无解 → 无限循环冻结游戏。
 *  现在带迭代上限并逐级降级（间距 12→8→5→0，最终均匀布点），保持同 seed 确定性且必然终止。 */
export function buildTriggerSchedule(seed: number, count: number): number[] {
  if (count <= 0) return [];
  let state = (seed >>> 0) || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (const gap of [12, 8, 5, 0]) {
    const points: number[] = [];
    let attempts = 0;
    while (points.length < count && attempts < 500) {
      attempts += 1;
      const p = Math.round((0.12 + next() * 0.76) * 100);
      if (points.every((x) => Math.abs(x - p) >= gap)) points.push(p);
    }
    if (points.length === count) return points.sort((a, b) => a - b);
  }
  // 最终兜底：确定性均匀布点（12% ~ 88%）
  const even: number[] = [];
  for (let i = 0; i < count; i++) {
    even.push(Math.round(12 + (76 * i) / Math.max(1, count - 1)));
  }
  return even.sort((a, b) => a - b);
}

/** §4.2：时长分级 → 事件次数区间。 */
export function eventCountForDuration(durationSeconds: number): number {
  const minutes = durationSeconds / 60;
  const band: [number, number] =
    minutes <= 15 ? [0, 1] :
    minutes <= 45 ? [0, 2] :
    minutes <= 120 ? [1, 3] :
    minutes <= 240 ? [2, 4] :
    [3, 6];
  let state = (seedFromDuration(durationSeconds) >>> 0) || 1;
  const t = Math.imul(state ^ (state >>> 15), state | 1) ^ (state + 0x6d2b79f5 | 0);
  const roll = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  state = (state + 1) | 0;
  void state;
  return band[0] + Math.floor(roll * (band[1] - band[0] + 1));
}

function seedFromDuration(durationSeconds: number): number {
  return Math.floor(durationSeconds) * 31 + 7;
}

/** 可变补丁：绕开 readonly 映射（patchTask 内部做浅拷贝替换，不原地改）。 */
type MutableTaskPatch = { -readonly [K in keyof ActiveTaskState]?: ActiveTaskState[K] };

export class TaskRuntimeDirector {
  /** V5.6：为任务初始化运行时状态（runtimeSeed + 确定性进度触发表）。 */
  public ensureRuntime(task: ActiveTaskState): ActiveTaskState {
    if (task.runtimeSeed !== undefined) return task;
    const seed = Math.floor(this.context.clockV2.now() / 1000) ^ (task.taskId.length * 2654435761);
    const count = eventCountForDuration(task.durationSeconds);
    const triggers = buildTriggerSchedule(seed >>> 0, count);
    const runtime: ActiveTaskState = {
      ...task,
      runtimeSeed: seed >>> 0,
      runtimeEventIds: [],
      runtimeNextTriggerProgress: triggers.length > 0 ? triggers[0] : undefined,
      runtimeStage: 'ACTIVE',
      runtimePausedSeconds: 0,
      runtimeAddedSeconds: 0,
      runtimeReducedSeconds: 0,
      interruptionCount: 0,
      foreground: !this.hasOtherForeground(task.taskId),
    };
    this.context.player.activeTasks = this.context.player.activeTasks.map((t) =>
      t.taskId === task.taskId ? runtime : t,
    );
    return runtime;
  }

  public constructor(private readonly context: GameContext) {}

  /** 任务真实流逝秒数（扣除暂停/阻塞）。 */
  public effectiveElapsedSeconds(task: ActiveTaskState, nowMs: number): number {
    const elapsed = Math.max(0, (nowMs - task.startedAt) / 1000);
    return Math.max(0, elapsed - (task.runtimePausedSeconds ?? 0) - (task.runtimeAddedSeconds ?? 0) + (task.runtimeReducedSeconds ?? 0));
  }

  /** 剩余游戏秒（含 runtime 增减）。 */
  public remainingSeconds(task: ActiveTaskState, nowMs: number): number {
    return Math.max(0, task.durationSeconds + (task.runtimeAddedSeconds ?? 0) - (task.runtimeReducedSeconds ?? 0)
      - this.effectiveElapsedSeconds(task, nowMs));
  }

  /** 进度 0~100。 */
  public progress(task: ActiveTaskState, nowMs: number): number {
    const total = task.durationSeconds + (task.runtimeAddedSeconds ?? 0) - (task.runtimeReducedSeconds ?? 0);
    if (total <= 0) return 100;
    return Math.min(100, Math.round((this.effectiveElapsedSeconds(task, nowMs) / total) * 100));
  }

  /** game loop 每秒：检查触发点 / 恢复到期暂停。 */
  public tick(nowMs: number): void {
    const player = this.context.player;
    for (const task of player.activeTasks) {
      if (task.claimed || task.completed) continue;
      const runtime = this.ensureRuntime(task);
      if (runtime.runtimeStage === 'PAUSED' && runtime.runtimePauseUntil !== undefined && runtime.runtimePauseUntil <= nowMs) {
        this.setStatus(task.taskId, 'ACTIVE', undefined);
        this.context.events.emit('taskRuntimeResumed', { taskId: task.taskId });
      }
    }
    for (const task of player.activeTasks) {
      if (task.claimed || task.completed) continue;
      const runtime = this.ensureRuntime(task);
      if (runtime.runtimeStage !== 'ACTIVE' || runtime.foreground === false) continue;
      const nextProgress = runtime.runtimeNextTriggerProgress;
      if (nextProgress === undefined) continue;
      if (this.progress(runtime, nowMs) >= nextProgress) {
        this.fireRuntimeEvent(runtime, nowMs);
      }
    }
  }

  /** 触发一个运行时事件：按职业加权挑池，经 messenger 送达，回复落 domain。 */
  private fireRuntimeEvent(task: ActiveTaskState, nowMs: number): void {
    const event = this.pickEvent(task);
    const delivered = event
      ? this.context.messenger.deliverEvent(event as unknown as MessengerEventDef, nowMs, `rt:${task.taskId}:${nextProgressKey(task)}:${nowMs}`)
      : false;
    if (!delivered && event) {
      // messenger 已有同会话待回复：直接以无选项 toast 语义丢弃本次，避免堆积
      return;
    }
    // ULTRA-DEEP #3（MEDIUM 修复）：重建触发表必须沿用本任务分带事件数（eventCountForDuration），
    // 不得硬编码 6 —— 否则 SHORT 任务实际事件数超出 0~2 分带（此前实测 30min 任务触发 4 次）。
    const bandedCount = eventCountForDuration(task.durationSeconds);
    const triggers = (task.runtimeSeed !== undefined ? buildTriggerSchedule(task.runtimeSeed >>> 0, bandedCount) : []);
    const current = task.runtimeNextTriggerProgress ?? 0;
    const upcoming = triggers.filter((p) => p > current);
    const patch: MutableTaskPatch = {};
    if (event) patch.runtimeEventIds = [...(task.runtimeEventIds ?? []), event.id];
    patch.runtimeNextTriggerProgress = upcoming.length > 0 ? upcoming[0] : undefined;
    patch.interruptionCount = (task.interruptionCount ?? 0) + 1;
    this.patchTask(task.taskId, patch);
    if (event) {
      this.pendingEventByTask.set(task.taskId, event);
      this.context.events.emit('taskRuntimeEvent', { taskId: task.taskId, eventId: event.id });
    }
  }

  /** 玩家回复任务运行时事件 → 效果落地（§4.4）。 */
  public resolveRuntimeEvent(taskId: string, replyId: string): { ok: boolean; reason?: string; text?: string } {
    const event = this.pendingEventByTask.get(taskId);
    if (!event) return { ok: false, reason: '事件不存在或已处理' };
    const reply = (event.replies ?? []).find((r) => r.id === replyId);
    if (!reply) return { ok: false, reason: '回复选项不存在' };
    const task = this.context.player.activeTasks.find((t) => t.taskId === taskId);
    if (!task) return { ok: false, reason: '任务不存在' };

    const fx = reply.effects ?? {};
    const patch: MutableTaskPatch = {};
    if (fx.durationAddedMinutes) patch.runtimeAddedSeconds = (task.runtimeAddedSeconds ?? 0) + fx.durationAddedMinutes * 60;
    if (fx.durationReducedMinutes) patch.runtimeReducedSeconds = (task.runtimeReducedSeconds ?? 0) + fx.durationReducedMinutes * 60;
    if (fx.pauseMinutes) {
      patch.runtimeStage = 'PAUSED';
      patch.runtimePauseUntil = this.context.clockV2.now() + fx.pauseMinutes * MINUTE;
      patch.blockedReason = fx.blockedReason;
    }
    if (fx.blockedReason && !fx.pauseMinutes) {
      patch.runtimeStage = 'BLOCKED';
      patch.blockedReason = fx.blockedReason;
    }
    patch.interruptionCount = (task.interruptionCount ?? 0) + 1;
    this.patchTask(taskId, patch);

    if (fx.newTask) {
      try {
        this.context.assignedTasks.assign({ title: fx.newTask.title, priority: fx.newTask.priority, source: fx.newTask.source as never });
      } catch { /* best-effort */ }
    }
    if (fx.priorityChange) { /* 优先级在 ActiveTask 上暂存为 interruptionCount 旁路；P0 判定走 assignedTasks */ }
    if (fx.techDebt) for (const [domain, amount] of fx.techDebt) {
      if (amount >= 0) this.context.techDebt.add(domain, amount);
      else this.context.techDebt.repay(domain, Math.ceil(-amount * 6));
    }
    if (fx.evidence) for (const [type, label] of fx.evidence) {
      this.context.evidence.grant(type as never, label);
      try { this.context.week.recordProgress('EVIDENCE_COUNT', 1); } catch { /* ignore */ }
    }
    if (fx.npc) for (const [npc, delta] of fx.npc) {
      this.context.npc.change(npc as never, delta);
      // V5.7 NPC 记忆：帮人记恩，伤人记仇
      try {
        if (delta >= 2) this.context.npcMemory.remember(npc, 'HELPED_ME', `任务事件中你帮了他（${reply.text.slice(0, 24)}…）`);
        else if (delta <= -2) this.context.npcMemory.remember(npc, 'REFUSED_ME', `任务事件中你拒绝了他`);
      } catch { /* ignore */ }
    }
    if (fx.mind) this.context.player.mind = Math.max(0, Math.min(this.context.player.maxMind, this.context.player.mind + fx.mind));
    if (fx.performance) this.context.player.performance = Math.max(0, this.context.player.performance + fx.performance);
    if (fx.professionExp) this.context.profession.grantExp(fx.professionExp);
    if (fx.incidentRisk) this.context.player.eventFlags = { ...this.context.player.eventFlags, ['v5_incident_risk']: true };
    if (fx.realityText) this.context.messenger.appendReality({ time: this.context.clockV2.now(), text: fx.realityText, kind: fx.incidentRisk ? 'INCIDENT' : 'WORK' });
    if (fx.achievementKey) {
      const p2 = this.context.player as unknown as { lifetimeStats?: Record<string, number> };
      p2.lifetimeStats = { ...(p2.lifetimeStats ?? {}), [`msg_ach:${fx.achievementKey}`]: (p2.lifetimeStats?.[`msg_ach:${fx.achievementKey}`] ?? 0) + 1 };
    }
    if (fx.nextEventId) {
      const followup = this.pickEventById(fx.nextEventId);
      if (followup) this.context.messenger.deliverEvent(followup as unknown as MessengerEventDef, this.context.clockV2.now(), `rt2:${taskId}:${fx.nextEventId}`);
    }
    this.pendingEventByTask.delete(taskId);
    this.context.saveService.save(this.context.player);
    return { ok: true, text: reply.text };
  }

  /** §4.5：暂停 / 恢复 / 阻塞。 */
  public pauseTask(taskId: string, reason?: string): boolean {
    const task = this.find(taskId);
    if (!task || task.runtimeStage === 'BLOCKED') return false;
    this.setStatus(taskId, 'PAUSED', reason);
    return true;
  }

  public resumeTask(taskId: string): boolean {
    const task = this.find(taskId);
    if (!task || task.runtimeStage !== 'PAUSED') return false;
    this.setStatus(taskId, 'ACTIVE', undefined);
    return true;
  }

  /** §4.6：切换前台任务（上下文切换损耗 2~5 游戏分钟）。 */
  public switchTask(taskId: string): { ok: boolean; costMinutes?: number; reason?: string } {
    const player = this.context.player;
    const target = this.find(taskId);
    if (!target) return { ok: false, reason: '任务不存在' };
    if (target.runtimeStage === 'BLOCKED') return { ok: false, reason: target.blockedReason ?? '任务被阻塞' };
    let cost = 0;
    for (const t of player.activeTasks) {
      if (t.taskId === taskId) continue;
      if (t.foreground) {
        const frequent = (t.interruptionCount ?? 0) >= 3;
        // ULTRA-DEEP（§140）：玩法随机必须走种子化 rng —— 用 runtimeSeed 派生确定性损耗
        const jitterState = ((t.runtimeSeed ?? 0) ^ ((t.contextSwitchCount ?? 0) * 2654435761)) >>> 0;
        const jitter = Math.floor((((jitterState ^ (jitterState >>> 13)) >>> 0) % 1000) / 1000 * 4);
        cost = frequent ? 2 + Math.min(3, jitter) : 0; // 首次免费，频繁切换 2~5 分钟
        this.patchTask(t.taskId, { foreground: false, runtimeStage: 'PAUSED', contextSwitchCount: (t.contextSwitchCount ?? 0) + 1 });
        if (cost > 0) this.patchTask(t.taskId, { runtimeAddedSeconds: (t.runtimeAddedSeconds ?? 0) + cost * 60 });
      }
    }
    this.patchTask(taskId, { foreground: true, runtimeStage: 'ACTIVE' });
    this.context.events.emit('taskSwitched', { taskId, contextSwitchCostMinutes: cost });
    return { ok: true, costMinutes: cost };
  }

  /** 通过消息的 replyEventId 找到对应 runtime 事件并落地。 */
  public resolveByMessageReplyEvent(replyEventId: string, replyId: string): { ok: boolean; reason?: string; text?: string } {
    for (const [taskId, event] of this.pendingEventByTask) {
      if (event.id !== replyEventId) continue;
      return this.resolveRuntimeEvent(taskId, replyId);
    }
    return { ok: false, reason: 'runtime 事件不存在' };
  }

  public hasPendingEventForEvent(eventId: string): boolean {
    for (const event of this.pendingEventByTask.values()) {
      if (event.id === eventId) return true;
    }
    return false;
  }

  public hasPendingEvent(taskId: string): boolean {
    return this.pendingEventByTask.has(taskId);
  }

  /** 当前前台任务。 */
  public foregroundTask(): ActiveTaskState | null {
    return this.context.player.activeTasks.find((t) => t.foreground && t.runtimeStage === 'ACTIVE' && !t.completed && !t.claimed) ?? null;
  }

  // ── 内部 ──

  private pendingEventByTask = new Map<string, TaskRuntimeEventDef>();

  private hasOtherForeground(taskId: string): boolean {
    return this.context.player.activeTasks.some((t) => t.taskId !== taskId && t.foreground && !t.claimed);
  }

  private find(taskId: string): ActiveTaskState | undefined {
    return this.context.player.activeTasks.find((t) => t.taskId === taskId);
  }

  private setStatus(taskId: string, stage: TaskRuntimeStatus, reason?: string): void {
    this.patchTask(taskId, { runtimeStage: stage, blockedReason: reason });
  }

  private patchTask(taskId: string, patch: Partial<ActiveTaskState>): void {
    this.context.player.activeTasks = this.context.player.activeTasks.map((t) =>
      t.taskId === taskId ? { ...t, ...patch } : t,
    );
  }

  private pickEvent(task: ActiveTaskState): TaskRuntimeEventDef | null {
    const professionId = this.context.profession?.currentId() ?? 'JAVA_BACKEND';
    const debtAvg = this.context.techDebt?.average?.() ?? 0;
    const pool = MESSENGER_CONTENT.events.filter((e): e is MessengerEventDef & TaskRuntimeEventDef => {
      const rt = e as unknown as TaskRuntimeEventDef;
      if (!rt.category) return false;
      if (rt.weight !== 0) return false; // 专用池：weight=0 不进随机消息池
      if (!rt.professions) return true;
      return rt.professions.includes(professionId);
    });
    if (pool.length === 0) return null;
    // 技术债越高，TECH 类事件权重越大（§15.3）；JSON 未配 weight 的运行时事件默认 2
    const weighted: TaskRuntimeEventDef[] = [];
    for (const e of pool) {
      const baseWeight = e.weight > 0 ? e.weight : 2;
      const boost = e.category === 'TECH' && debtAvg > 40 ? 2 : 1;
      for (let i = 0; i < baseWeight * boost; i += 1) weighted.push(e);
    }
    let state = (task.runtimeSeed ?? 1) + (task.interruptionCount ?? 0) * 7919;
    state = (state ^ 0x9e3779b9) >>> 0;
    const t = Math.imul(state ^ (state >>> 15), state | 1);
    const roll = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return weighted[Math.floor(roll * weighted.length)] ?? null;
  }

  private pickEventById(id: string): TaskRuntimeEventDef | null {
    return (MESSENGER_CONTENT.events.filter((e) => (e as unknown as TaskRuntimeEventDef).category)
      .find((e) => e.id === id) as unknown as TaskRuntimeEventDef) ?? null;
  }
}

function nextProgressKey(task: ActiveTaskState): string {
  return String(task.runtimeNextTriggerProgress ?? 0);
}
