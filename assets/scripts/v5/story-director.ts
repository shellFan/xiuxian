import type { GameContext } from '../core/game-context';
import type { DailyRealityEntryState, IncidentType } from '../model/save-data';
import {
  MESSENGER_CONTENT,
  messengerEventById,
  type MessengerEffectDef,
  type MessengerEventDef,
} from './messenger-content';
import type { MessengerService } from './messenger-service';

/** V5 事件里的事故别名 → 现有 IncidentType（复用现有 IncidentService，§31）。 */
type IncidentTypeAlias = IncidentType;

/**
 * V5 WorkdayStoryDirector（§18~§20）。
 * 不替代 EventEngine —— 只负责「今天什么时候适合发生什么」：
 * 预算/张力/时间窗权重/角色限频/首周剧本/每日计划与实际。
 * 全部调度支持 seed（random.forDay），测试确定性（§51）。
 */

const MINUTE = 60_000;

export type StoryWindow = 'workday' | 'lunch' | 'preOff' | 'afterHours' | 'lateNight' | 'weekend' | 'any';

interface StoryBudgets {
  readonly normalDay: [number, number];
  readonly calmDay: [number, number];
  readonly hellDay: [number, number];
}

const BUDGETS: StoryBudgets = {
  normalDay: [3, 6],
  calmDay: [1, 3],
  hellDay: [6, 10],
};

/** 同一角色最小间隔（分钟）。 */
const ACTOR_COOLDOWN_MINUTES = 45;
/** 两条消息最小间隔（分钟）。 */
const MESSAGE_GAP_MINUTES = 12;

export class StoryDirectorService {
  public constructor(
    private readonly context: GameContext,
    private readonly messenger: MessengerService,
  ) {
    // §47/§52：任务里程碑 → 飞剑传书任务事件（统一走 messenger，不另建弹窗系统）。
    this.context.events.on('taskMilestone', (payload: { taskId: string; taskName: string; progress: number }) => {
      const nowMs = this.context.clockV2.now();
      const event = messengerEventById('ms_task_milestone');
      if (event) {
        const key = `taskms:${payload.taskId}:${this.context.player.gameDay?.dayIndex ?? 1}`;
        this.messenger.deliverEvent(event, nowMs, key);
      }
    });
  }

  /** 新的一天：重置预算 + 生成今日计划（09:00 由 tick 首次触发）。 */
  public beginWorkday(): void {
    const player = this.context.player;
    const day = player.gameDay;
    if (!day) return;
    const rng = this.context.randomV2.forDay(day.dayIndex, 101);
    const hell = day.situationIds.some((id) => /deadline|incident|kpi/i.test(id ?? ''));
    const calm = day.situationIds.some((id) => /calm|water/i.test(id ?? ''));
    const range = hell ? BUDGETS.hellDay : calm ? BUDGETS.calmDay : BUDGETS.normalDay;
    const budget = range[0] + Math.floor(rng.next() * (range[1] - range[0] + 1));
    player.storyDirector = {
      ...(player.storyDirector ?? {
        lastMessageAt: 0,
        lastMajorEventAt: 0,
        recentActors: {},
        activeChains: [],
        unresolvedCases: [],
        firedKeys: [],
      }),
      storyBudget: budget,
      interruptBudget: budget,
      tension: hell ? 3 : 1,
    };
    player.dailyPlan = this.rollDailyPlan(rng);
    player.dailyReality = [];
  }

  /** 每秒 tick：预算内调度消息（时间窗 + 权重 + 限频 + 幂等）。 */
  public tick(nowMs: number): void {
    const player = this.context.player;
    const day = player.gameDay;
    if (!day) return;
    this.messenger.tickScheduledSteps(nowMs);
    const expiredEffects = this.messenger.expireStaleReplies(nowMs);
    for (const effects of expiredEffects) this.applyEffects(effects, nowMs);

    const director = player.storyDirector!;
    const clock = this.context.clockV2.getGameDate();
    const minuteOfDay = clock.hour * 60 + clock.minute;
    if (director.interruptBudget <= 0) return;

    // 首周剧本优先（§20）：首周未完成时，当日节拍未触发完之前不跑随机池。
    if (!player.firstWeekStory?.completed) {
      if (this.tryFirstWeekBeat(nowMs, day.dayIndex, minuteOfDay)) return;
      if (!this.firstWeekDayDone(day.dayIndex, minuteOfDay)) return;
    }

    // 消息间隔
    if (nowMs - director.lastMessageAt < MESSAGE_GAP_MINUTES * MINUTE) return;

    const window = this.currentWindow(clock.hour, clock.weekday);
    const candidates = this.candidateEvents(window, minuteOfDay, nowMs);
    if (candidates.length === 0) return;
    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    const rng = this.context.randomV2.forDay(day.dayIndex, 202);
    let roll = rng.next() * totalWeight;
    let picked: MessengerEventDef | null = null;
    for (const candidate of candidates) {
      roll -= candidate.weight;
      if (roll <= 0) { picked = candidate; break; }
    }
    if (!picked) picked = candidates[candidates.length - 1];
    const key = `${picked.id}:${day.dayIndex}`;
    if (this.messenger.deliverEvent(picked, nowMs, key)) {
      player.storyDirector = {
        ...player.storyDirector!,
        interruptBudget: player.storyDirector!.interruptBudget - 1,
        lastMessageAt: nowMs,
        tension: Math.min(10, player.storyDirector!.tension + (picked.priority === 'CRITICAL' ? 3 : picked.priority === 'HIGH' ? 2 : 1)),
      };
      // typing 演出（§67/§38）
      if (picked.priority === 'CRITICAL' || picked.priority === 'HIGH') {
        const typRng = this.context.randomV2.forDay(day.dayIndex, 303);
        const duration = (0.8 + typRng.next() * 2.2) * 1000;
        this.messenger.setTyping(picked.conversation, duration);
      }
    }
  }

  /** 回复效果落地：桥接 NPC/证据/任务/事故/加班/技术债/成就（§7）。 */
  public applyEffects(effects: MessengerEffectDef, nowMs: number): void {
    const player = this.context.player;
    if (effects.npc) {
      for (const [npcId, delta] of effects.npc) {
        this.context.npc.change(npcId as never, delta);
      }
    }
    if (effects.memory) {
      for (const [npcId, flag] of effects.memory) {
        player.eventFlags = { ...player.eventFlags, [`mem:${npcId}:${flag}`]: true };
      }
    }
    if (effects.evidence) {
      for (const [type, label] of effects.evidence) {
        this.context.evidence.grant(type as never, label);
        this.context.events.emit('evidenceGained', { type, label });
      }
    }
    if (effects.task) {
      try {
        this.context.assignedTasks.assign({
          title: effects.task.title,
          priority: effects.task.priority,
          source: (effects.task.source === 'BOSS' || effects.task.source === 'PRODUCT' ||
            effects.task.source === 'TEST' || effects.task.source === 'CLIENT' ||
            effects.task.source === 'INCIDENT' || effects.task.source === 'SYSTEM' ? effects.task.source : 'SYSTEM'),
          isFakeP0: effects.task.fakeP0,
        });
      } catch { /* 指派任务失败不阻塞消息流 */ }
    }
    if (effects.mind) {
      player.mind = Math.max(0, Math.min(player.maxMind, player.mind + effects.mind));
    }
    if (effects.innerDemon) {
      this.context.innerDemon.add(effects.innerDemon);
    }
    if (effects.performance) {
      player.performance = Math.max(0, player.performance + effects.performance);
    }
    if (effects.techDebt) {
      for (const [domain, amount] of effects.techDebt) {
        if (amount >= 0) this.context.techDebt.add(domain, amount);
        else this.context.techDebt.repay(domain, Math.ceil(-amount * 6));
      }
    }
    if (effects.incident) {
      try {
        const typeAliasMap: Record<string, IncidentTypeAlias> = {
          PAYMENT_FAILURE: 'PAYMENT_FAILURE', GATEWAY_5XX: 'NGINX_502', OOM: 'OOM',
          SLOW_SQL_BOSS: 'SLOW_SQL', CACHE_STAMPEDE: 'CACHE_AVALANCHE', GATEWAY_502: 'NGINX_502',
          S1_WEEKEND: 'OOM', RELEASE_NIGHT: 'BAD_DEPLOY', PROD_DOWN: 'BAD_DEPLOY',
          DEADLOCK_BOSS: 'DATABASE_LOCK',
        };
        const incidentType = typeAliasMap[effects.incident.type] ?? 'BAD_DEPLOY';
        this.context.incidents.raise({
          type: incidentType,
          severity: effects.incident.severity,
          forcedRelease: false,
        });
        this.context.events.emit('messengerIncident', effects.incident);
      } catch { /* 事故创建失败不阻塞 */ }
    }
    if (effects.incidentDungeon) {
      // 记录待进入的事故副本（UI 横幅入口 → startBattleRun('INCIDENT')，§31）。
      player.eventFlags = { ...player.eventFlags, ['v5_dungeon_pending']: true };
      player.eventFlags = { ...player.eventFlags, ['v5_dungeon_type']: true };
      (player as unknown as { pendingIncidentDungeon?: string }).pendingIncidentDungeon = effects.incidentDungeon.incidentType;
      this.context.events.emit('messengerIncidentDungeon', { incidentType: effects.incidentDungeon.incidentType });
    }
    if (effects.overtime) {
      try {
        this.context.overtime.offer(effects.overtime.source, effects.overtime.free, effects.overtime.seconds);
      } catch { /* 加班询问失败不阻塞 */ }
    }
    if (effects.dialogFlag) {
      player.dialogFlags = { ...(player.dialogFlags ?? {}), [effects.dialogFlag]: true };
    }
    if (effects.reality) {
      this.messenger.appendReality({ time: nowMs, text: effects.reality.text, kind: effects.reality.kind });
    }
    // 群聊甩锅 → ResponsibilityCase（§12/§32）：公开可见，证据反杀走现有 acceptBlame/clearWithEvidence。
    if (effects.responsibility) {
      try {
        const cased = this.context.responsibility.openCase({
          sourceNpc: (effects.responsibility.blamedBy === 'CLIENT' ? 'CLIENT' : effects.responsibility.blamedBy) as never,
          actualOwnerNpc: effects.responsibility.blamedBy as never,
          blamedPlayer: true,
          cause: effects.responsibility.title,
          severity: 'S2',
        });
        const directorNow = player.storyDirector!;
        player.storyDirector = { ...directorNow, unresolvedCases: [...directorNow.unresolvedCases, cased.id].slice(-24) };
        this.context.events.emit('messengerBlame', { caseId: cased.id, title: effects.responsibility.title });
      } catch { /* 立案失败不阻塞消息流 */ }
    }
    if (effects.nextEvent) {
      const followup = messengerEventById(effects.nextEvent.eventId);
      if (followup) {
        this.messenger.deliverEvent(
          followup,
          nowMs + effects.nextEvent.delayMinutes * MINUTE,
          `${followup.id}:${player.gameDay?.dayIndex ?? 1}:${Math.floor(nowMs / MINUTE)}`,
        );
      }
    }
  }

  /** 今日计划 vs 实际（§26/§27）。 */
  public planReality(): { plan: readonly string[]; reality: readonly DailyRealityEntryState[] } {
    const player = this.context.player;
    return { plan: player.dailyPlan ?? [], reality: player.dailyReality ?? [] };
  }

  // ── 内部 ──

  private currentWindow(hour: number, weekday: number): StoryWindow {
    if (weekday === 0 || weekday === 6) return 'weekend';
    if (hour < 6) return 'lateNight';
    if (hour < 9) return 'afterHours';
    if (hour < 12 || (hour >= 13 && hour < 17)) return 'workday';
    if (hour < 13) return 'lunch';
    if (hour < 18) return 'preOff';
    if (hour < 22) return 'afterHours';
    return 'lateNight';
  }

  private candidateEvents(window: StoryWindow, minuteOfDay: number, nowMs: number): MessengerEventDef[] {
    const player = this.context.player;
    const director = player.storyDirector!;
    const day = player.gameDay?.dayIndex ?? 1;
    return MESSENGER_CONTENT.events.filter((event) => {
      if (event.weight <= 0) return false;
      const eventWindow = event.window ?? 'workday';
      if (eventWindow !== 'any' && eventWindow !== window) {
        // workday 事件可在 afterHours 低概率出现（§17）
        if (!(eventWindow === 'workday' && window === 'afterHours')) return false;
      }
      if (event.minMinute !== undefined && minuteOfDay < event.minMinute) return false;
      if (event.maxMinute !== undefined && minuteOfDay > event.maxMinute) return false;
      const cooldownDays = event.cooldownDays ?? 3;
      const lastAt = director.recentActors[event.actor] ?? 0;
      const dayMs = 86_400_000;
      if (nowMs - lastAt < cooldownDays * dayMs * (event.weight > 0 ? 1 : 1) && lastAt > 0) {
        // 角色级冷却：按冷却天数的 1/8 概率放行，避免完全静默
        const rng = this.context.randomV2.forDay(day, 404);
        if (rng.next() > 1 / 8) return false;
      }
      if (nowMs - lastAt < ACTOR_COOLDOWN_MINUTES * MINUTE) return false;
      if (event.minRelation !== undefined && this.context.npc.value(event.actor as never) < event.minRelation) return false;
      if (event.maxRelation !== undefined && this.context.npc.value(event.actor as never) > event.maxRelation) return false;
      const key = `${event.id}:${day}`;
      if ((player.storyDirector?.firedKeys ?? []).includes(key)) return false;
      return true;
    });
  }

  private rollDailyPlan(rng: { next(): number }): string[] {
    const pool = [
      '修复登录接口偶发报错', '写接口 B 的单元测试', '摸鱼一小时养道心',
      '评审产品 PRD', '排查线上慢查询', '整理本周技术债', '准时 18:00 下班',
    ];
    const count = 2 + Math.floor(rng.next() * 2);
    const plan: string[] = [];
    for (let i = 0; i < count; i += 1) {
      plan.push(pool[Math.floor(rng.next() * pool.length)]);
    }
    return plan;
  }

  /** §47/§166~171：按职业加权挑选任务运行时事件（职业 60% / 通用池兜底）。 */
  private taskRuntimeEvent(): MessengerEventDef | null {
    const def = this.context.profession?.def();
    const professionPrefixes: Record<string, string[]> = {
      JAVA_BACKEND: ['ms_task_java_', 'ms_task_gen_'],
      FRONTEND: ['ms_task_fe_', 'ms_task_gen_'],
      QA: ['ms_task_qa_', 'ms_task_gen_'],
      DEVOPS: ['ms_task_ops_', 'ms_task_gen_'],
      DBA: ['ms_task_java_', 'ms_task_gen_'],
      PRODUCT_OWNER: ['ms_task_gen_'],
    };
    const prefixes = professionPrefixes[this.context.profession?.currentId() ?? 'JAVA_BACKEND'] ?? ['ms_task_gen_'];
    const primary = prefixes[0];
    const pool = MESSENGER_CONTENT.events.filter((e) => e.weight === 0 && (e.id.startsWith(primary) || (this.rng() < 0.4 && e.id.startsWith(prefixes[1]))));
    const fallback = MESSENGER_CONTENT.events.filter((e) => e.id === 'ms_task_milestone');
    const candidates = pool.length > 0 ? pool : fallback;
    if (candidates.length === 0) return null;
    return candidates[Math.floor(this.rng() * candidates.length)];
  }

  private rng(): number {
    return this.context.randomV2.next();
  }

  /** 首周当日节拍是否全部到达过触发窗口（到达后放行随机池，避免首周死板）。 */
  private firstWeekDayDone(dayIndex: number, minuteOfDay: number): boolean {
    const beats = FIRST_WEEK_BEATS[dayIndex] ?? [];
    const done = this.context.player.firstWeekStory?.doneSteps ?? [];
    return beats.every((beat) => done.includes(beat.stepId) || minuteOfDay >= beat.minMinute + 30);
  }

  /** 首周剧本（§20）：D1-D7 的定时节拍，每拍触发一次即销毁。 */
  private tryFirstWeekBeat(nowMs: number, dayIndex: number, minuteOfDay: number): boolean {
    if (dayIndex > 7) {
      this.context.player.firstWeekStory = { completed: true, doneSteps: this.context.player.firstWeekStory?.doneSteps ?? [] };
      return false;
    }
    const beats = FIRST_WEEK_BEATS[dayIndex] ?? [];
    for (const beat of beats) {
      const done = this.context.player.firstWeekStory?.doneSteps ?? [];
      if (done.includes(beat.stepId)) continue;
      if (minuteOfDay < beat.minMinute) continue;
      const event = messengerEventById(beat.eventId);
      if (!event) continue;
      const key = `fw:${beat.stepId}:${dayIndex}`;
      if (this.messenger.deliverEvent(event, nowMs, key)) {
        this.context.player.firstWeekStory = {
          completed: false,
          doneSteps: [...done, beat.stepId],
        };
        this.context.player.storyDirector = {
          ...this.context.player.storyDirector!,
          interruptBudget: this.context.player.storyDirector!.interruptBudget - 1,
          lastMessageAt: nowMs,
        };
        return true;
      }
    }
    // 首周日内节拍用尽 → 视为完成当日；D7 结束后 overall 完成
    return false;
  }
}

/** 首周节拍表（D1 入职 → D2 需求变化 → D3 甩锅 → D4 线上风险 → D5 周五 17:55）。 */
const FIRST_WEEK_BEATS: Readonly<Record<number, readonly { stepId: string; eventId: string; minMinute: number }[]>> = {
  1: [
    { stepId: 'd1_welcome', eventId: 'ms_jun_001', minMinute: 555 },
    { stepId: 'd1_work', eventId: 'ms_prod_003', minMinute: 590 },
    { stepId: 'd1_task', eventId: 'ms_prod_016', minMinute: 640 },
  ],
  2: [
    { stepId: 'd2_change', eventId: 'ms_prod_017', minMinute: 580 },
    { stepId: 'd2_confirm', eventId: 'ms_prod_002', minMinute: 650 },
  ],
  3: [
    { stepId: 'd3_blame', eventId: 'ms_test_002', minMinute: 570 },
    { stepId: 'd3_evidence', eventId: 'ms_prod_010', minMinute: 660 },
  ],
  4: [
    { stepId: 'd4_isk', eventId: 'ms_boss_010', minMinute: 575 },
    { stepId: 'd4_ops', eventId: 'ms_ops_001', minMinute: 640 },
  ],
  5: [
    { stepId: 'd5_1755', eventId: 'ms_1755_001', minMinute: 1070 },
    { stepId: 'd5_product', eventId: 'ms_1755_002', minMinute: 1075 },
  ],
  6: [
    { stepId: 'd6_weekend', eventId: 'ms_wkd_001', minMinute: 600 },
  ],
  7: [
    { stepId: 'd7_rest', eventId: 'ms_wkd_002', minMinute: 600 },
  ],
};
