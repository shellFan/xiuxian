import weekContent from '../../configs/v57/week-content.json';
import { registerMessengerEvents } from '../v5/messenger-content';
import type { GameContext } from '../core/game-context';
import type { WeekStoryState } from '../model/save-data';

/**
 * V5.7 Phase E/H/I/J/K — Week Director。
 * 第一周剧情节拍（Mon~Sun）/ 每日情境 DailySituation / 公司宗门 CompanyProfile /
 * 周目标 WeeklyGoal / 周结算 WeeklySettlement / 隐藏事件 SecretEvent。
 * 剧情节拍走 messenger.deliverEvent（幂等 key=fw57:stepId:day），与 V5.6 firstWeekBeat 互不冲突。
 */

interface WeekStepDef {
  readonly id: string;
  readonly atMinute: number;
  readonly conversation: string;
  readonly actor: string;
  readonly priority: string;
  readonly sender: string;
  readonly text: string;
  readonly replies?: readonly { readonly id: string; readonly text: string; readonly tag?: string; readonly effects: Record<string, unknown> }[];
}

interface WeekDayDef { readonly id: string; readonly theme: string; readonly steps: readonly WeekStepDef[] }

interface Bundle {
  readonly firstWeekStory: Readonly<Record<string, WeekDayDef>>;
  readonly weeklyHooks: readonly string[];
  readonly dailySituations: readonly { id: string; name: string; desc: string; weight: number; interruptBudget: [number, number]; effects: Record<string, number> }[];
  readonly weeklyGoalPool: readonly { id: string; name: string; type: string; target: number; reward: Record<string, number> }[];
  readonly secretEvents: readonly SecretEventDef[];
  readonly companyProfiles: readonly CompanyProfileDef[];
}

export interface SecretEventDef {
  readonly id: string;
  readonly name: string;
  readonly condition: { readonly type: string; readonly days?: number; readonly npcId?: string; readonly count?: number; readonly value?: number; readonly hours?: number };
  readonly text: string;
  readonly reward: Record<string, unknown>;
}

export interface CompanyProfileDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly overtimeChanceMul?: number;
  readonly meetingMinutesMul?: number;
  readonly salaryMul?: number;
  readonly default?: boolean;
}

export interface DailySituationView {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly interruptBudget: readonly [number, number];
}

export interface WeeklyGoalView {
  readonly goalId: string;
  readonly name: string;
  readonly type: string;
  readonly target: number;
  readonly progress: number;
  readonly done: boolean;
  readonly rewardDesc: string;
}

export interface WeeklySettlementView {
  readonly weekIndex: number;
  readonly workMinutes: number;
  readonly overtimeMinutes: number;
  readonly freeOvertimeMinutes: number;
  readonly fishingMinutes: number;
  readonly cultivationMinutes: number;
  readonly salary: number;
  readonly plannedTasks: number;
  readonly doneTasks: number;
  readonly unplannedTasks: number;
  readonly projectLines: readonly string[];
  readonly bossKills: number;
  readonly epicLoot: number;
  readonly blamedCount: number;
  readonly blameReturned: number;
  readonly ontimeDays: number;
  readonly ontimeTarget: number;
  readonly weekTitle: string;
  readonly goals: readonly WeeklyGoalView[];
  readonly nextWeekHooks: readonly string[];
}

const BUNDLE = weekContent as unknown as Bundle;

/** dayIndex(1起) → 周几（1=周一 … 7=周日）。 */
export function dayOfWeek(dayIndex: number): number {
  return ((dayIndex - 1) % 7) + 1;
}

export function weekIndexOf(dayIndex: number): number {
  return Math.floor((dayIndex - 1) / 7) + 1;
}

export class WeekService {
  public constructor(private readonly context: GameContext) {
    // 第一周剧情步注册进信使扩展池：replyToMessage 需要按 id 查回事件定义
    const events: import('../v5/messenger-content').MessengerEventDef[] = [];
    for (const dayDef of Object.values(BUNDLE.firstWeekStory)) {
      for (const step of dayDef.steps) events.push(this.weekStepEvent(dayDef.id, step) as never);
    }
    registerMessengerEvents(events);
  }

  // ── 每日情境 ──

  public situationId(): string {
    return this.context.player.dailySituation ?? 'sit_normal';
  }

  public situationView(): DailySituationView {
    const sit = BUNDLE.dailySituations.find((s) => s.id === this.situationId()) ?? BUNDLE.dailySituations[0];
    return { id: sit.id, name: sit.name, desc: sit.desc, interruptBudget: sit.interruptBudget };
  }

  public situationEffects(): Record<string, number> {
    const sit = BUNDLE.dailySituations.find((s) => s.id === this.situationId());
    return sit?.effects ?? {};
  }

  /** 开工日：掷今日情境 + 新周生成周目标。 */
  public beginWorkday(): void {
    const player = this.context.player;
    const day = player.gameDay;
    if (!day) return;
    const dow = dayOfWeek(day.dayIndex);
    const weekIndex = weekIndexOf(day.dayIndex);
    // 周一 → 新周目标（首周剧情例外，按天数直接生成）
    if (dow === 1 && (player.weeklyGoals?.weekIndex ?? 0) !== weekIndex) {
      this.rollWeeklyGoals(weekIndex);
    }
    if (dow === 6 || dow === 7) return; // 周末无情境
    const rng = this.context.randomV2.forDay(day.dayIndex, 5701);
    const total = BUNDLE.dailySituations.reduce((s, x) => s + x.weight, 0);
    let roll = rng.next() * total;
    let picked = BUNDLE.dailySituations[0];
    for (const sit of BUNDLE.dailySituations) {
      roll -= sit.weight;
      if (roll <= 0) { picked = sit; break; }
    }
    // 固定日：周一/周五覆盖部分随机
    if (dow === 1 && rng.next() < 0.6) picked = BUNDLE.dailySituations.find((s) => s.id === 'sit_monday') ?? picked;
    if (dow === 5 && rng.next() < 0.6) picked = BUNDLE.dailySituations.find((s) => s.id === 'sit_friday') ?? picked;
    player.dailySituation = picked.id;
  }

  // ── 周目标 ──

  public rollWeeklyGoals(weekIndex: number): void {
    const rng = this.context.randomV2.forDay(weekIndex * 7, 5702);
    const pool = [...BUNDLE.weeklyGoalPool];
    const picked: string[] = [];
    while (picked.length < 3 && pool.length > 0) {
      const idx = Math.floor(rng.next() * pool.length);
      picked.push(pool.splice(idx, 1)[0].id);
    }
    this.context.player.weeklyGoals = { weekIndex, goalIds: picked, progress: {}, claimed: false };
  }

  public goals(): WeeklyGoalView[] {
    const state = this.context.player.weeklyGoals;
    if (!state) return [];
    return state.goalIds.map((goalId) => {
      const def = BUNDLE.weeklyGoalPool.find((g) => g.id === goalId);
      if (!def) return { goalId, name: goalId, type: '?', target: 1, progress: 0, done: false, rewardDesc: '' };
      const progress = state.progress?.[goalId] ?? 0;
      return {
        goalId,
        name: def.name,
        type: def.type,
        target: def.target,
        progress: Math.min(progress, def.target),
        done: progress >= def.target,
        rewardDesc: `职业经验 +${def.reward.professionExp ?? 0}`,
      };
    });
  }

  /** 周目标计数入口（任务完成/Boss/准点/技术债/帮助/掉落/证据/项目阶段）。 */
  public recordProgress(type: string, amount = 1): void {
    const state = this.context.player.weeklyGoals;
    if (!state) return;
    const def = BUNDLE.weeklyGoalPool.find((g) => g.id && g.type === type);
    if (!def) return;
    const progress = { ...(state.progress ?? {}) };
    progress[def.id] = (progress[def.id] ?? 0) + amount;
    this.context.player.weeklyGoals = { ...state, progress };
    const done = this.goals().filter((g) => g.done).length;
    if (this.goals().some((g) => g.goalId === def.id && g.done && (state.progress?.[def.id] ?? 0) < def.target)) {
      this.context.events.emit('weeklyGoalDone', { goalId: def.id, doneCount: done });
    }
  }

  public claimWeeklyReward(): { success: boolean; reason?: string; professionExp?: number } {
    const state = this.context.player.weeklyGoals;
    if (!state) return { success: false, reason: '本周没有周目标' };
    if (state.claimed) return { success: false, reason: '本周奖励已领取' };
    const views = this.goals();
    const doneAll = views.length > 0 && views.every((g) => g.done);
    if (!doneAll) return { success: false, reason: '周目标未全部完成' };
    let exp = 0;
    for (const goalId of state.goalIds) {
      const def = BUNDLE.weeklyGoalPool.find((g) => g.id === goalId);
      exp += def?.reward.professionExp ?? 0;
    }
    this.context.player.weeklyGoals = { ...state, claimed: true };
    if (exp > 0) this.context.profession.grantExp(exp);
    this.context.events.emit('weeklyRewardClaimed', { professionExp: exp });
    return { success: true, professionExp: exp };
  }

  // ── 公司宗门 ──

  public companyProfile(): CompanyProfileDef {
    const id = this.context.player.companyProfile ?? 'COMP_MIN_PRIVATE';
    return BUNDLE.companyProfiles.find((c) => c.id === id) ?? BUNDLE.companyProfiles[0];
  }

  // ── 第一周剧情节拍 ──

  private weekStoryState(): WeekStoryState {
    const player = this.context.player;
    return player.weekStory ?? { weekIndex: 1, doneSteps: [] };
  }

  /** 剧情步 → 信使事件（weight=0 不进随机池）。 */
  public weekStepEvent(dayKey: string, step: WeekStepDef): {
    id: string; conversation: string; actor: never; priority: 'CRITICAL' | 'HIGH' | 'NORMAL'; weight: number;
    steps: { sender: string; text: string }[]; replies: { id: string; text: string; tag?: string; effects: Record<string, unknown> }[];
  } {
    return {
      id: `fw57_${step.id}`,
      conversation: step.conversation,
      actor: step.actor as never,
      priority: (step.priority === 'CRITICAL' || step.priority === 'HIGH' ? step.priority : 'NORMAL'),
      weight: 0,
      steps: [{ sender: step.sender, text: step.text }],
      replies: (step.replies ?? [{ id: 'a', text: '（收到）', effects: {} }]) as never,
    };
  }

  /** tick：第一周节拍 + 周日结算提示 + 隐藏事件检查（GameLoop 每秒调用）。 */
  public tick(nowMs: number): void {
    const player = this.context.player;
    const day = player.gameDay;
    if (!day) return;
    const clock = this.context.clockV2.getGameDate();
    const minuteOfDay = clock.hour * 60 + clock.minute;
    const dayIndex = day.dayIndex;
    // V5.7：以真实日历星期为准（0=周日 → 7；1~6=周一~周六）
    const dow = clock.weekday === 0 ? 7 : clock.weekday;
    const state = this.weekStoryState();

    if (player.firstWeekStory?.completed !== true) {
      const dayDef = BUNDLE.firstWeekStory[String(dow)];
      if (dayDef) {
        for (const step of dayDef.steps) {
          if (state.doneSteps.includes(step.id)) continue;
          if (minuteOfDay < step.atMinute) continue;
          if (step.id === 'w1m_offwork' && minuteOfDay < 1075) continue;
          const event = this.weekStepEvent(dayDef.id, step);
          const key = `fw57:${step.id}:${dayIndex}`;
          if (this.context.messenger.deliverEvent(event as never, nowMs, key)) {
            player.weekStory = { weekIndex: 1, doneSteps: [...state.doneSteps, step.id] };
            return; // 一秒至多一拍
          }
        }
      }
    }
    if (dayIndex > 7 && this.weekStoryState().weekIndex === 1) {
      player.weekStory = { ...this.weekStoryState(), weekIndex: weekIndexOf(dayIndex) };
    }
    // 周日 10:00 → 周结算就绪
    if (dow === 7 && minuteOfDay >= 600 && !player.weekSettlementReady) {
      player.weekSettlementReady = true;
      this.context.events.emit('weekSettlementReady', { weekIndex: weekIndexOf(dayIndex) });
    }
    this.checkSecretEvents(nowMs);
  }

  /** 隐藏事件（§74：不显示条件，图鉴 ???）。 */
  public checkSecretEvents(nowMs: number): void {
    const player = this.context.player;
    const done = player.secretEventsDone ?? [];
    for (const secret of BUNDLE.secretEvents) {
      if (done.includes(secret.id)) continue;
      if (!this.secretConditionMet(secret)) continue;
      player.secretEventsDone = [...done, secret.id];
      // 奖励落地
      const reward = secret.reward as { professionExp?: number; spiritStones?: number; mind?: number; npc?: [string, number][]; incidentRisk?: number };
      if (reward.professionExp) this.context.profession.grantExp(reward.professionExp);
      if (reward.spiritStones) player.spiritStones = Math.min(9_999_999, (player.spiritStones ?? 0) + reward.spiritStones);
      if (reward.mind) player.mind = Math.max(0, Math.min(player.maxMind, player.mind + reward.mind));
      if (reward.npc) for (const [npcId, delta] of reward.npc) this.context.npc.change(npcId as never, delta);
      this.context.events.emit('secretEventFired', { id: secret.id, name: secret.name, text: secret.text });
      return; // 每次一个
    }
  }

  private secretConditionMet(secret: SecretEventDef): boolean {
    const player = this.context.player;
    const stats = player.lifetimeStats ?? {};
    switch (secret.condition.type) {
      case 'ONTIME_STREAK': return (stats.ontimeStreak ?? 0) >= (secret.condition.days ?? 5);
      case 'HELP_NPC': return this.context.npcMemory.countOf(secret.condition.npcId ?? 'VETERAN', 'HELPED_ME') >= (secret.condition.count ?? 3);
      case 'EVIDENCE_TOTAL': return (stats.evidenceCollected ?? 0) >= (secret.condition.count ?? 15);
      case 'TECH_DEBT': {
        try {
          const domains = this.context.techDebt.all();
          const total = Object.values(domains).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
          return total >= (secret.condition.value ?? 100);
        } catch { return false; }
      }
      case 'WEEKEND_ONLINE': return (stats.weekendOnlineDays ?? 0) >= (secret.condition.days ?? 2);
      case 'BOSS_KILLS': return (stats.bossKills ?? 0) >= (secret.condition.count ?? 10);
      case 'FISH_TOTAL_HOURS': return ((player.fishingSeconds ?? 0) / 3600) >= (secret.condition.hours ?? 20);
      case 'BLAME_RETURNED': return (stats.blameReturned ?? 0) >= (secret.condition.count ?? 5);
      default: return false;
    }
  }

  public discoveredSecrets(): { id: string; name: string; text: string }[] {
    const done = this.context.player.secretEventsDone ?? [];
    return BUNDLE.secretEvents.filter((s) => done.includes(s.id)).map((s) => ({ id: s.id, name: s.name, text: s.text }));
  }

  public secretTotal(): number {
    return BUNDLE.secretEvents.length;
  }

  // ── 周结算 ──

  public weeklySettlement(): WeeklySettlementView {
    const view = this.computeWeeklySettlement();
    return { ...view, weekTitle: this.weekTitleFor(view) };
  }

  private weekTitleFor(view: WeeklySettlementView): string {
    if (view.ontimeDays >= 4) return '《准点下班仙尊》';
    if (view.blameReturned > view.blamedCount) return '《反甩锅宗师》';
    if (view.freeOvertimeMinutes > 300) return '《免费加班仙人》';
    if (view.bossKills >= 3) return '《屠龙勇士》';
    return '《计划赶不上变化》';
  }
  private computeWeeklySettlement(): WeeklySettlementView {
    const player = this.context.player;
    const day = player.gameDay;
    const weekIndex = weekIndexOf(day?.dayIndex ?? 1);
    const stats = player.lifetimeStats ?? {};
    const durations = player.gameDay?.durations;
    const reality = player.dailyReality ?? [];
    const projectLines: string[] = [];
    try {
      const project = this.context.projectService.current();
      if (project) projectLines.push(`${project.name} · ${project.status}`);
    } catch { /* 项目未开时为空 */ }
    const history = player.projectHistory ?? [];
    for (const h of history.slice(-2)) projectLines.push(`${h.name} · ${h.ending}`);
    const hooks = BUNDLE.weeklyHooks;
    const idx = (weekIndex * 3) % hooks.length;
    return {
      weekIndex,
      workMinutes: Math.round(((durations?.work ?? 0) + (durations?.meeting ?? 0)) / 60),
      overtimeMinutes: Math.round((durations?.overtime ?? 0) / 60),
      freeOvertimeMinutes: (player.gameDay?.overtimeFree ?? false) ? Math.round((durations?.overtime ?? 0) / 60) : 0,
      fishingMinutes: Math.round((player.fishingSeconds ?? 0) / 60),
      cultivationMinutes: Math.round((player.cultivatingSeconds ?? 0) / 60),
      salary: Math.round(player.salary ?? 0),
      plannedTasks: (player.dailyPlan ?? []).length,
      doneTasks: stats.tasksDone ?? 0,
      unplannedTasks: reality.filter((r) => r.kind === 'WORK').length,
      projectLines,
      bossKills: stats.bossKills ?? 0,
      epicLoot: stats.epicLoot ?? 0,
      blamedCount: stats.blamedCount ?? 0,
      blameReturned: stats.blameReturned ?? 0,
      ontimeDays: stats.ontimeDays ?? 0,
      ontimeTarget: 5,
      weekTitle: '',
      goals: this.goals(),
      nextWeekHooks: [hooks[idx], hooks[(idx + 1) % hooks.length]],
    };
  }

  /** 明日钩子（§96/§97）：每天结算时至少留一个钩子。 */
  public tomorrowHook(): string {
    const hooks = BUNDLE.weeklyHooks;
    const day = this.context.player.gameDay?.dayIndex ?? 1;
    const rng = this.context.randomV2.forDay(day + 1, 5703);
    const base = hooks[Math.floor(rng.next() * hooks.length)];
    const extras: string[] = [];
    const prof = this.context.professionContent?.depthView();
    if (prof && prof.expToNext > 0 && prof.expToNext <= 50) extras.push(`你的职业经验还差 ${prof.expToNext} 就能升级了。`);
    try {
      const project = this.context.projectService.current();
      if (project && project.status !== 'COMPLETED') extras.push(`「${project.name}」还没收尾，明天继续。`);
    } catch { /* ignore */ }
    extras.push(base);
    return extras[0];
  }
}

export const WEEK_CONTENT = BUNDLE;
