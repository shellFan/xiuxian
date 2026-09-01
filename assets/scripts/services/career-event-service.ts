import { DEFAULT_CLOCK, type Clock } from '../core/clock';
import { DEFAULT_RANDOM_PROVIDER, type RandomProvider } from '../core/random-provider';
import type { GameContext } from '../core/game-context';
import type { CareerEventConfig } from '../model/config-types';
import { CareerEventScheduler } from './career-event-scheduler';

export interface CareerEventServiceOptions { readonly clock?: Clock; readonly randomProvider?: RandomProvider; }

export class CareerEventService {
  private readonly random: RandomProvider;
  private readonly scheduler: CareerEventScheduler;
  private pending: CareerEventConfig | undefined;

  public constructor(private readonly context: GameContext, options: CareerEventServiceOptions = {}) {
    this.random = options.randomProvider ?? DEFAULT_RANDOM_PROVIDER;
    this.scheduler = new CareerEventScheduler({
      clock: options.clock ?? DEFAULT_CLOCK,
      randomProvider: this.random,
    });
  }

  public current(): CareerEventConfig | undefined { return this.pending; }

  public pause(): void { this.scheduler.pause(); }

  public resume(): void { this.scheduler.resume(); }

  public destroy(): void { this.scheduler.destroy(); }

  public poll(): CareerEventConfig | undefined {
    if (this.pending) return this.pending;
    if (!this.scheduler.isDue()) return undefined;
    const events = this.context.configService.careerEvents.events;
    if (events.length === 0) return undefined;
    this.pending = events[Math.min(events.length - 1, Math.floor(this.random.next() * events.length))];
    this.scheduler.markTriggered();
    this.context.events.emit('eventChanged', { eventId: this.pending.id, pending: true });
    return this.pending;
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
      this.pending = undefined;
      this.context.events.emit('eventChanged', { eventId: event.id, pending: false });
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
      this.pending = undefined;
      this.context.events.emit('eventChanged', { eventId: event.id, pending: false });
    } catch (error) {
      this.context.player.kpiProgress = kpiProgressBefore;
      throw error;
    }
  }
}
