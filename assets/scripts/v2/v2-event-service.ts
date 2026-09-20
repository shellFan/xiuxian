/**
 * V2EventService — 事件引擎运行时（Gameplay V2 §31~§42/§186~§191）。
 *
 * 与 V1 CareerEventService 的关系：V1 事件保留兼容（老测试/老存档），V2 主路径走本服务。
 * GameLoop 每 tick 调 poll()；玩家选择走 choose()；效果经 applyEffects() 落到 context。
 */
import type { GameContext } from '../core/game-context';
import type { GameClockV2 } from './v2-clock';
import type { GameDayService } from './game-day-service';
import type { InnerDemonService } from './inner-demon-service';
import type { RandomService, Rng } from './random-service';
import eventsConfig from '../../configs/v2/events.json';
import { OVERTIME_EVENTS, mergeUniqueById } from '../v3/overtime-content';
import { WORKPLACE_EVENTS } from '../v3/workplace-content';
import {
  type EventDefinition,
  type EventChoice,
  type EventEffects,
  EventScheduler,
  type EventWorldState,
  checkEventConditions,
  visibleChoices,
  triageOfflineEvents,
} from './event-engine';

export const EVENTS: readonly EventDefinition[] = mergeUniqueById(
  mergeUniqueById(
    (eventsConfig as { events: EventDefinition[] }).events,
    OVERTIME_EVENTS,
    'event',
  ),
  WORKPLACE_EVENTS,
  'event',
);
export const EVENT_MAP: ReadonlyMap<string, EventDefinition> = new Map(EVENTS.map((e) => [e.id, e]));

/** NPC id（§44）。 */
export type NpcId = 'BOSS' | 'PRODUCT' | 'TESTER' | 'JUNIOR' | 'VETERAN' | 'HR';

export interface EventResolutionResult {
  readonly eventId: string;
  readonly choiceId: string | null;
  readonly success: boolean | null;
  readonly summary: string;
  readonly effectsApplied: EventEffects;
}

export class V2EventService {
  private scheduler: EventScheduler;
  private rng: Rng;
  /** 当前弹出等待处理的事件（在线时一次一个）。 */
  private current: EventDefinition | null = null;

  public constructor(
    private readonly context: GameContext,
    private readonly clock: GameClockV2,
    private readonly gameDay: GameDayService,
    private readonly demons: InnerDemonService,
    private readonly random: RandomService,
  ) {
    const player = context.player;
    this.scheduler = new EventScheduler(undefined, {
      nextEventAt: player.eventCooldowns['__nextEventAt'] ?? 0,
      lastFiredAt: {},
      firedToday: [],
      negativeStreak: Number(player.eventFlags['__negativeStreak'] ?? 0) || 0,
      firedTodayDay: 0,
    });
    this.rng = random.forDay(0, 0); // 占位：poll 时按 dayIndex 重置种子（§144）
  }

  /** 世界状态快照（条件评估用）。 */
  private world(): EventWorldState {
    const p = this.context.player;
    const date = this.clock.getGameDate();
    const day = this.gameDay.current();
    return {
      careerLevel: p.careerLevel,
      workMode: p.workMode,
      mind: p.mind,
      innerDemon: p.innerDemon,
      salary: p.salary,
      cultivation: p.cultivationExp,
      weekday: date.weekday,
      hour: date.hour,
      minuteOfDay: date.hour * 60 + date.minute,
      overtimeActive: this.context.overtime.current()?.status === 'ACTIVE',
      situationIds: day?.situationIds ?? [],
      sectId: p.sectId,
      relationships: { ...p.relationships },
      materials: { ...p.materials },
      ownedTechniques: [...p.ownedTechniques],
      ownedEquipment: [...p.ownedEquipment],
      eventFlags: { ...p.eventFlags },
      eventWeights: { ...this.gameDay.aggregateEffects().eventWeights },
      evidenceTypes: this.context.evidence.heldTypes(),
    };
  }

  /**
   * 每 tick 轮询：到点则抽事件。返回当前应展示的事件（无则 null）。
   * 链事件（chainId 且有进度）优先插队。
   */
  public poll(): EventDefinition | null {
    if (this.current) return this.current;
    const now = this.clock.now();
    const dayIndex = Math.max(1, this.gameDay.dayIndex());
    // §144: 每日种子——同一天内事件序列可复现；pickSeq 保证每次 pick 消耗新随机数
    this.rng = this.random.forDay(dayIndex, this.scheduler.nextPickSalt());
    if (!this.scheduler.isDue(now, dayIndex)) return this.pollChain(now);

    const world = this.world();
    const def = this.scheduler.pick(EVENTS, world, this.rng, now);
    if (!def) {
      this.scheduler.scheduleNext(now, this.rng);
      return this.pollChain(now);
    }
    this.scheduler.markFired(def, now);
    this.startEvent(def, now);
    return this.current;
  }

  /** 链事件到期检测（次日推进，§40 历史选择后果）。 */
  private pollChain(nowMs: number): EventDefinition | null {
    const chains = this.context.player.eventChainState;
    let world: EventWorldState | undefined;
    for (const [chainId, state] of Object.entries(chains)) {
      const nextId = `${chainId}_s${state.stage + 1}`;
      const nextDef = EVENT_MAP.get(nextId);
      if (!nextDef) continue;
      // 链下一阶段：距离上阶段 >= 半天 或 同日 4 小时后触发
      if (nowMs - state.lastDayIndex >= 4 * 3600_000 && checkEventConditions(nextDef, world ??= this.world())) {
        this.startEvent(nextDef, nowMs);
        return this.current;
      }
    }
    return null;
  }

  private startEvent(def: EventDefinition, nowMs: number): void {
    this.current = def;
    // onceEver 立即记录
    if (def.onceEver && !this.context.player.firedEvents.includes(def.id)) {
      this.context.player.firedEvents.push(def.id);
    }
    void nowMs;
  }

  /** 当前待处理事件（含离线 pending 队列头）。 */
  public currentEvent(): EventDefinition | null {
    if (this.current) return this.current;
    const pending = this.context.player.pendingEvents;
    if (pending.length > 0) {
      const head = pending[0];
      return EVENT_MAP.get(head.eventId) ?? null;
    }
    return null;
  }

  /** 当前事件的可用选择（Build 隐藏选项过滤）。 */
  public currentChoices(): EventChoice[] {
    const def = this.currentEvent();
    if (!def) return [];
    return visibleChoices(def, this.world());
  }

  /**
   * 玩家选择（或 FLAVOR 自动结算传 choiceId=null）。
   * 成功率分支 → effects/successEffects/failureEffects；链 → nextEvent 排队。
   * @returns 结算摘要（UI 结果页用）
   */
  public choose(choiceId: string | null): EventResolutionResult {
    const def = this.currentEvent();
    if (!def) throw new Error('没有待处理事件');
    const now = this.clock.now();

    let choice: EventChoice | null = null;
    if (choiceId !== null) {
      choice = visibleChoices(def, this.world()).find((c) => c.id === choiceId) ?? null;
      if (!choice) throw new Error('无效选项');
    }

    const rng = this.rng;
    const chance = choice?.successChance ?? 1;
    const success = choice && chance < 1 ? rng.chance(chance) : choice ? true : null;

    let effects: EventEffects = {};
    let summary = '';
    if (choice) {
      if (success) effects = choice.successEffects ?? choice.effects ?? {};
      else effects = choice.failureEffects ?? {};
      summary = choice.resultText ?? (success ? '事情解决了。' : '事情没有想象中顺利。');
    } else {
      effects = def.effects ?? {};
      summary = def.description;
    }

    // 链推进：choice.nextEvent 或 effects.nextEvent
    const nextId = choice?.nextEvent ?? effects.nextEvent;
    if (def.chainId) this.advanceChain(def.chainId, def.chainStage ?? 0, def.id);
    this.scheduler.reportOutcome(classifyImpact(effects));

    this.applyEffects(effects);
    this.gameDay.addEventHandled();

    // 关闭当前事件 / 弹出 pending 队列头
    if (this.current) {
      this.current = null;
    } else {
      const pending = this.context.player.pendingEvents;
      if (pending.length > 0 && pending[0].eventId === def.id) {
        this.context.player.pendingEvents = pending.slice(1);
      }
    }

    // 链后续：直接排入当前（在线即时体验）
    if (nextId) {
      const nextDef = EVENT_MAP.get(nextId);
      if (nextDef && checkEventConditions(nextDef, this.world())) this.current = nextDef;
    }

    this.context.events.emit('v2EventResolved', { eventId: def.id, choiceId, success, summary });
    // §260: 事件选择立即持久化
    try { this.context.saveService.save(this.context.player); } catch { /* 存档失败不吞结算 */ }
    return { eventId: def.id, choiceId, success, summary, effectsApplied: effects };
  }

  private advanceChain(chainId: string, stage: number, eventId: string): void {
    const chains = { ...this.context.player.eventChainState };
    const prev = chains[chainId];
    chains[chainId] = { stage: Math.max(stage, prev?.stage ?? 0), lastDayIndex: this.clock.now() };
    this.context.player.eventChainState = chains;
    void eventId;
  }

  /** 效果落地（§34 全量）。 */
  public applyEffects(effects: EventEffects): void {
    const p = this.context.player;
    if (effects.salary) {
      p.salary = Math.max(0, p.salary + effects.salary);
      this.context.events.emit('salaryChanged', { amount: effects.salary, total: p.salary });
      this.gameDay.addIncome('salary', effects.salary);
    }
    if (effects.salaryCost && effects.salaryCost > 0) {
      p.salary = Math.max(0, p.salary - effects.salaryCost);
    }
    if (effects.cultivation) {
      p.cultivationExp = Math.max(0, p.cultivationExp + effects.cultivation);
      this.gameDay.addIncome('cultivation', effects.cultivation);
    }
    if (effects.performance) {
      p.performance = Math.max(0, p.performance + effects.performance);
      this.gameDay.addIncome('performance', effects.performance);
    }
    if (effects.mind) this.context.mind.applyDelta(effects.mind);
    if (effects.innerDemon) this.demons.add(effects.innerDemon);
    if (effects.relationship) {
      for (const [npc, delta] of Object.entries(effects.relationship)) {
        const cur = p.relationships[npc] ?? 0;
        p.relationships[npc] = Math.max(-100, Math.min(100, cur + delta));
      }
    }
    if (effects.material) {
      for (const [mat, count] of Object.entries(effects.material)) {
        p.materials[mat] = Math.max(0, (p.materials[mat] ?? 0) + count);
        if (count > 0) this.gameDay.addMaterialsGained(count);
      }
    }
    if (effects.grantTechnique && !p.ownedTechniques.includes(effects.grantTechnique)) {
      p.ownedTechniques.push(effects.grantTechnique);
    }
    if (effects.grantEquipment && !p.ownedEquipment.includes(effects.grantEquipment)) {
      p.ownedEquipment.push(effects.grantEquipment);
    }
    if (effects.grantConsumable) {
      p.materials[effects.grantConsumable] = (p.materials[effects.grantConsumable] ?? 0) + 1;
    }
    if (effects.buff) {
      // V2 buff 值约定 "TYPE:multiplier:seconds"，缺省 ×1.5/600s
      for (const spec of Object.keys(effects.buff)) {
        const [buffId, mulStr, secStr] = spec.split(':');
        const multiplier = Number(mulStr) || 1.5;
        const seconds = Number(secStr) || effects.buff[buffId] || 600;
        this.context.buffs.addBuff(
          buffId as Parameters<typeof this.context.buffs.addBuff>[0],
          multiplier,
          seconds,
        );
      }
    }
    if (effects.setFlags) {
      for (const flag of effects.setFlags) p.eventFlags[flag] = true;
    }
    if (effects.removeFlags) {
      for (const flag of effects.removeFlags) delete p.eventFlags[flag];
    }
    if (effects.promotionCooldownDays) {
      p.eventFlags[`promoCooldownUntil:${Date.now() + effects.promotionCooldownDays * 86_400_000}`] = true;
    }
    // ── V4 职场地狱效果 ──
    if (effects.evidence) {
      this.context.evidence.grant(
        effects.evidence.type as Parameters<typeof this.context.evidence.grant>[0],
        effects.evidence.label,
      );
    }
    if (effects.assignTask) {
      this.context.assignedTasks.assign(effects.assignTask);
    }
    if (effects.openCase) {
      this.context.responsibility.openCase(effects.openCase);
    }
    if (effects.raiseIncident && !this.context.incidents.active()) {
      const risk = this.context.incidents.currentRisk();
      // raiseIncident 表示剧情必然而至；risk<0.5 时降一档严重度，模拟"运气好"。
      const severity = downgradeSeverity(effects.raiseIncident.severity, risk < 0.5);
      this.context.incidents.raise({
        ...effects.raiseIncident,
        severity,
        type: effects.raiseIncident.type as Parameters<typeof this.context.incidents.raise>[0]['type'],
      });
    }
    if (effects.techDebt) {
      for (const [domain, delta] of Object.entries(effects.techDebt)) {
        this.context.techDebt.add(domain, delta);
      }
    }
    if (effects.startOvertime && !this.context.overtime.current()) {
      const { source, free, plannedMinutes } = effects.startOvertime;
      this.context.overtime.offer(source, free, Math.max(1, Math.floor(plannedMinutes)) * 60);
      this.context.overtime.accept(p.workMode);
    }
    if (effects.lifetime) {
      const stats = { ...p.lifetimeStats };
      for (const [key, delta] of Object.entries(effects.lifetime)) {
        stats[key] = (stats[key] ?? 0) + delta;
      }
      p.lifetimeStats = stats;
    }
  }

  /** 离线恢复时分流积压事件（§41：最多 5 个重要，其余自动结算）。 */
  public triagePending(occurredDefs: EventDefinition[]): void {
    const { toPending, autoResolve } = triageOfflineEvents(occurredDefs, this.context.player.pendingEvents);
    const uid = () => `pe_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const newPending = toPending.map((def) => ({
      uid: uid(),
      eventId: def.id,
      occurredAt: this.clock.now(),
      priority: def.priority,
    }));
    this.context.player.pendingEvents = [...this.context.player.pendingEvents, ...newPending];
    for (const def of autoResolve) this.applyEffects(def.effects ?? {});
  }

  /** DEV：强制触发指定事件。 */
  public forceTrigger(eventId: string): boolean {
    const def = EVENT_MAP.get(eventId);
    if (!def) return false;
    this.startEvent(def, this.clock.now());
    return true;
  }
}

/** 效果净影响分类（负面连击保护用）。 */
function classifyImpact(effects: EventEffects): 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE' {
  let score = 0;
  score += effects.mind ?? 0;
  score += effects.innerDemon != null ? -effects.innerDemon : 0;
  score += effects.cultivation ?? 0;
  score += effects.performance ?? 0;
  score += (effects.salary ?? 0) - (effects.salaryCost ?? 0);
  if (score < 0) return 'NEGATIVE';
  if (score > 0) return 'POSITIVE';
  return 'NEUTRAL';
}

/** 严重度降一档（运气好/风险低时事故更轻）。 */
function downgradeSeverity(severity: 'S1' | 'S2' | 'S3' | 'S4', downgrade: boolean): 'S1' | 'S2' | 'S3' | 'S4' {
  if (!downgrade) return severity;
  switch (severity) {
    case 'S1': return 'S2';
    case 'S2': return 'S3';
    default: return 'S4';
  }
}
