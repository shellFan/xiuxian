import { DEFAULT_CLOCK, type Clock } from '../core/clock';
import { DEFAULT_RANDOM_PROVIDER, type RandomProvider } from '../core/random-provider';
import type { GameContext } from '../core/game-context';
import type { CareerEventConfig } from '../model/config-types';

export interface CareerEventServiceOptions { readonly clock?: Clock; readonly randomProvider?: RandomProvider; }

export class CareerEventService {
  private readonly clock: Clock;
  private readonly random: RandomProvider;
  private nextEventAt: number | undefined;
  private pending: CareerEventConfig | undefined;

  public constructor(private readonly context: GameContext, options: CareerEventServiceOptions = {}) {
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.random = options.randomProvider ?? DEFAULT_RANDOM_PROVIDER;
  }

  public current(): CareerEventConfig | undefined { return this.pending; }

  public poll(): CareerEventConfig | undefined {
    if (this.pending) return this.pending;
    const now = this.clock.now();
    if (this.nextEventAt === undefined) this.nextEventAt = now + this.intervalMilliseconds();
    if (now < this.nextEventAt) return undefined;
    const events = this.context.configService.careerEvents.events;
    if (events.length === 0) return undefined;
    this.pending = events[Math.min(events.length - 1, Math.floor(this.random.next() * events.length))];
    this.nextEventAt = undefined;
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
    } catch (error) {
      this.context.player.kpiProgress = kpiProgressBefore;
      throw error;
    }
  }

  private intervalMilliseconds(): number {
    const minimum = 3 * 60 * 1000;
    const maximum = 8 * 60 * 1000;
    return minimum + Math.floor(this.random.next() * (maximum - minimum + 1));
  }
}
