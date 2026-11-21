import { DEFAULT_CLOCK, type Clock } from '../core/clock';
import { DEFAULT_RANDOM_PROVIDER, type RandomProvider } from '../core/random-provider';
import type { GameContext } from '../core/game-context';
import type { CareerEventConfig } from '../model/config-types';
import { CareerEventScheduler } from './career-event-scheduler';
import { EventRuntimeAdapter, type EventEligibility, type PlayerSnapshot } from './event-runtime-adapter';

export interface CareerEventServiceOptions {
  readonly clock?: Clock;
  readonly randomProvider?: RandomProvider;
  /** 追加资格元数据（测试/上层注入）；生产默认合并 FISH_EVENT_ELIGIBILITY。 */
  readonly eligibilityOverrides?: ReadonlyMap<string, Partial<EventEligibility>>;
}

/**
 * V11-F5：摸鱼场景事件资格 sidecar（EVENT-ELIGIBILITY-CONTRACT `requiresWorkMode`）。
 *
 * 以 TS 常量而非 configs/*.json 落地：纯引擎元数据（非美术资产，无编辑器 .meta 需求）、
 * 类型化、可被测试直接引用。新增摸鱼事件必须在此登记，否则默认 ANY（任意模式可触发）。
 * 元数据契约：未知字段 fail closed（EventRuntimeAdapter.buildEligibility 白名单展开）。
 */
export const FISH_EVENT_ELIGIBILITY: ReadonlyMap<string, Partial<EventEligibility>> = new Map([
  ['FISH_TEABREAK', { requiresWorkMode: 'FISHING' }],
  ['FISH_MEETING', { requiresWorkMode: 'FISHING' }],
  ['FISH_TOILET_SECRET', { requiresWorkMode: 'FISHING' }],
  ['FISH_RED_PACKET', { requiresWorkMode: 'FISHING' }],
  ['FISH_CAUGHT', { requiresWorkMode: 'FISHING' }],
  ['FISH_COVER', { requiresWorkMode: 'FISHING' }],
  ['FISH_MASTER', { requiresWorkMode: 'FISHING' }],
]);

export class CareerEventService {
  private readonly random: RandomProvider;
  private readonly scheduler: CareerEventScheduler;
  private readonly adapter: EventRuntimeAdapter;
  private pending: CareerEventConfig | undefined;

  public constructor(private readonly context: GameContext, options: CareerEventServiceOptions = {}) {
    this.random = options.randomProvider ?? DEFAULT_RANDOM_PROVIDER;
    this.scheduler = new CareerEventScheduler({
      clock: options.clock ?? DEFAULT_CLOCK,
      randomProvider: this.random,
    });
    // V11-F5：接入 EVENT-POOL-V1 运行时（此前 poll() 是全池均匀随机——无冷却、无职级/
    // 模式门控、彩蛋可重复）。production 默认合并摸鱼门控元数据；测试可追加覆盖。
    const overrides = new Map<string, Partial<EventEligibility>>(FISH_EVENT_ELIGIBILITY);
    if (options.eligibilityOverrides) {
      for (const [id, meta] of options.eligibilityOverrides) overrides.set(id, meta);
    }
    this.adapter = new EventRuntimeAdapter(this.context.configService.careerEvents.events, {
      clock: options.clock ?? DEFAULT_CLOCK,
      randomProvider: this.random,
      eligibilityOverrides: overrides,
    });
  }

  public current(): CareerEventConfig | undefined { return this.pending; }

  public pause(): void { this.scheduler.pause(); }

  public resume(): void { this.scheduler.resume(); }

  public destroy(): void { this.scheduler.destroy(); }

  /** V7.0：推迟下一次事件（新玩家完成创建后的安静期），详见 CareerEventScheduler.deferNextEvent。 */
  public deferNextEvent(minIntervalMs: number): void { this.scheduler.deferNextEvent(minIntervalMs); }

  public poll(): CareerEventConfig | undefined {
    if (this.pending) return this.pending;
    if (!this.scheduler.isDue()) return undefined;
    // 本机会已消费（无论是否选中）：契约规定无合格候选时跳过本机会，不降级/不重抽。
    this.scheduler.markTriggered();
    const picked = this.adapter.poll(this.buildSnapshot());
    if (!picked) return undefined;
    this.pending = picked;
    this.adapter.recordShown(picked.id);
    this.context.events.emit('eventChanged', { eventId: picked.id, pending: true });
    return picked;
  }

  public update(): CareerEventConfig | undefined { return this.poll(); }

  /** Resolves a non-choice event by applying its top-level effects through the unified Effect Engine. */
  public resolve(eventId: string): void {
    const event = this.pending;
    if (!event || event.id !== eventId) throw new Error('Career event is not pending');
    if (!event.effects) throw new Error(`Career event ${eventId} has no direct effects`);
    const kpiProgressBefore = { ...this.context.player.kpiProgress };
    this.context.kpi?.recordEventResolved(event.id);
    try {
      this.context.effects.apply(event.effects);
      this.context.dailyTasks.addProgress('EVENT_3', 1);
      this.pending = undefined;
      this.context.events.emit('eventChanged', { eventId: event.id, pending: false });
      // Notify achievement system about event type (RARE, EASTER_EGG, etc.)
      if (event.type) {
        this.context.achievements.notifyEventType(event.type);
      }
    } catch (error) {
      this.context.player.kpiProgress = kpiProgressBefore;
      throw error;
    }
  }

  /** Resolves a choice event by applying the chosen branch's effects through the unified Effect Engine. */
  public choose(eventId: string, choiceId: string): void {
    const event = this.pending;
    if (!event || event.id !== eventId) throw new Error('Career event is not pending');
    const choices = event.choices ?? [];
    const choice = choices.find((item) => item.id === choiceId);
    if (!choice) throw new Error(`Unknown choice ${choiceId}`);
    const kpiProgressBefore = { ...this.context.player.kpiProgress };
    this.context.kpi?.recordEventResolved(event.id);
    try {
      this.context.effects.apply(choice.effects);
      this.context.dailyTasks.addProgress('EVENT_3', 1);
      this.pending = undefined;
      this.context.events.emit('eventChanged', { eventId: event.id, pending: false });
      // Notify achievement system about event type (RARE, EASTER_EGG, etc.)
      if (event.type) {
        this.context.achievements.notifyEventType(event.type);
      }
    } catch (error) {
      this.context.player.kpiProgress = kpiProgressBefore;
      throw error;
    }
  }

  /** V11-F5：资格快照（career/mode/mind/KPI），供 EventRuntimeAdapter 过滤。 */
  private buildSnapshot(): PlayerSnapshot {
    const player = this.context.player;
    const view = this.context.kpi?.getView();
    return {
      careerLevel: player.careerLevel,
      workMode: player.workMode === 'FISHING' ? 'FISHING' : 'WORK',
      mind: player.mind,
      maxMind: player.maxMind,
      kpiCompleted: view ? view.items.filter((item) => item.completed).length : 0,
      kpiTotal: view ? view.items.length : 0,
    };
  }
}
