import type { Clock } from '../core/clock';
import { DEFAULT_CLOCK } from '../core/clock';
import type { RandomProvider } from '../core/random-provider';
import { DEFAULT_RANDOM_PROVIDER } from '../core/random-provider';

export interface CareerEventSchedulerOptions {
  readonly clock?: Clock;
  readonly randomProvider?: RandomProvider;
  readonly minIntervalMs?: number;
  readonly maxIntervalMs?: number;
}

/** Schedules career events on a fixed clock + RNG. Does not own pending event state. */
export class CareerEventScheduler {
  private readonly clock: Clock;
  private readonly random: RandomProvider;
  private readonly minIntervalMs: number;
  private readonly maxIntervalMs: number;
  private nextEventAt: number | undefined;
  private paused = false;
  private destroyed = false;

  public constructor(options: CareerEventSchedulerOptions = {}) {
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.random = options.randomProvider ?? DEFAULT_RANDOM_PROVIDER;
    this.minIntervalMs = options.minIntervalMs ?? 3 * 60 * 1000;
    this.maxIntervalMs = options.maxIntervalMs ?? 8 * 60 * 1000;
  }

  public isPaused(): boolean { return this.paused; }

  public pause(): void { this.paused = true; }

  public resume(): void { this.paused = false; }

  public destroy(): void {
    this.destroyed = true;
    this.paused = true;
    this.nextEventAt = undefined;
  }

  public resetSchedule(): void { this.nextEventAt = undefined; }

  public isDue(): boolean {
    if (this.destroyed || this.paused) return false;
    const now = this.clock.now();
    if (this.nextEventAt === undefined) this.nextEventAt = now + this.intervalMilliseconds();
    return now >= this.nextEventAt;
  }

  public markTriggered(): void { this.nextEventAt = undefined; }

  private intervalMilliseconds(): number {
    const span = this.maxIntervalMs - this.minIntervalMs;
    return this.minIntervalMs + Math.floor(this.random.next() * (span + 1));
  }
}
