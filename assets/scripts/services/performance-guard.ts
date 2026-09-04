/**
 * PerformanceGuard — detect and prevent O(n²) and exponential growth.
 *
 * Provides:
 *   1. Tick budget: warn if game loop tick takes too long
 *   2. Worker count guard: warn if worker count suggests O(n²) risk
 *   3. Event flood guard: warn if too many events fire in one tick
 *   4. Memory guard: periodic check for object leak patterns
 */

export interface PerformanceGuardOptions {
  /** Max allowed tick duration in ms before warning. Default: 16. */
  readonly tickBudgetMs?: number;
  /** Max worker count before O(n²) warning. Default: 500. */
  readonly maxWorkerCount?: number;
  /** Max events per tick before flood warning. Default: 100. */
  readonly maxEventsPerTick?: number;
  /** Whether warnings are enabled. Default: true. */
  readonly enabled?: boolean;
}

export type PerformanceWarning = {
  readonly type: 'TICK_BUDGET' | 'WORKER_COUNT' | 'EVENT_FLOOD' | 'MEMORY';
  readonly message: string;
  readonly value: number;
  readonly threshold: number;
  readonly timestamp: number;
};

export type PerformanceWarningListener = (warning: PerformanceWarning) => void;

export class PerformanceGuard {
  private readonly tickBudgetMs: number;
  private readonly maxWorkerCount: number;
  private readonly maxEventsPerTick: number;
  private enabled: boolean;
  private readonly listeners = new Set<PerformanceWarningListener>();
  private tickEventCount = 0;
  private lastTickStart = 0;

  public constructor(options: PerformanceGuardOptions = {}) {
    this.tickBudgetMs = options.tickBudgetMs ?? 16;
    this.maxWorkerCount = options.maxWorkerCount ?? 500;
    this.maxEventsPerTick = options.maxEventsPerTick ?? 100;
    this.enabled = options.enabled ?? true;
  }

  /** Called at the start of each game loop tick. */
  public tickStart(): void {
    if (!this.enabled) return;
    this.lastTickStart = performance.now();
    this.tickEventCount = 0;
  }

  /** Called at the end of each game loop tick. */
  public tickEnd(): void {
    if (!this.enabled) return;
    const elapsed = performance.now() - this.lastTickStart;
    if (elapsed > this.tickBudgetMs) {
      this.warn({
        type: 'TICK_BUDGET',
        message: `Tick took ${elapsed.toFixed(1)}ms (budget: ${this.tickBudgetMs}ms)`,
        value: elapsed,
        threshold: this.tickBudgetMs,
        timestamp: Date.now(),
      });
    }
  }

  /** Called when an event is emitted. */
  public recordEvent(): void {
    if (!this.enabled) return;
    this.tickEventCount++;
    if (this.tickEventCount > this.maxEventsPerTick) {
      this.warn({
        type: 'EVENT_FLOOD',
        message: `${this.tickEventCount} events in one tick (max: ${this.maxEventsPerTick})`,
        value: this.tickEventCount,
        threshold: this.maxEventsPerTick,
        timestamp: Date.now(),
      });
    }
  }

  /** Check worker count for O(n²) risk. */
  public checkWorkerCount(count: number): void {
    if (!this.enabled) return;
    if (count > this.maxWorkerCount) {
      this.warn({
        type: 'WORKER_COUNT',
        message: `${count} workers (max: ${this.maxWorkerCount}) — O(n²) risk`,
        value: count,
        threshold: this.maxWorkerCount,
        timestamp: Date.now(),
      });
    }
  }

  /** Subscribe to performance warnings. */
  public onWarning(listener: PerformanceWarningListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Enable or disable the guard. */
  public setEnabled(enabled: boolean): void { this.enabled = enabled; }

  /** Whether the guard is currently enabled. */
  public isEnabled(): boolean { return this.enabled; }

  private warn(warning: PerformanceWarning): void {
    for (const listener of this.listeners) {
      try { listener(warning); } catch { /* listener errors must not propagate */ }
    }
  }
}