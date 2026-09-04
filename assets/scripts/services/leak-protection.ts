/**
 * LeakProtection — prevent object/event listener leaks.
 *
 * Tracks subscriptions and provides a single dispose() to clean up all
 * registered listeners, timers, and resources. Prevents the common
 * start→stop→start duplicate registration bug.
 *
 * Usage:
 *   const guard = new LeakProtection();
 *   guard.addSubscription(eventBus.on('foo', handler));
 *   guard.addInterval(setInterval(...));
 *   // On destroy:
 *   guard.dispose(); // Cleans up everything
 */

export type Unsubscribe = () => void;

export class LeakProtection {
  private readonly subscriptions: Unsubscribe[] = [];
  private readonly intervals: ReturnType<typeof setInterval>[] = [];
  private readonly timeouts: ReturnType<typeof setTimeout>[] = [];
  private disposed = false;

  /**
   * Register an unsubscribe function (from EventBus.on, facade.onUiEvent, etc.).
   * Will be called during dispose().
   */
  public addSubscription(unsubscribe: Unsubscribe): Unsubscribe {
    this.assertNotDisposed();
    this.subscriptions.push(unsubscribe);
    // Return a wrapped unsubscribe that also removes from our list
    return () => {
      const index = this.subscriptions.indexOf(unsubscribe);
      if (index >= 0) this.subscriptions.splice(index, 1);
      unsubscribe();
    };
  }

  /**
   * Register an interval timer. Will be cleared during dispose().
   * Returns the interval ID for manual clearing if needed.
   */
  public addInterval(id: ReturnType<typeof setInterval>): ReturnType<typeof setInterval> {
    this.assertNotDisposed();
    this.intervals.push(id);
    return id;
  }

  /**
   * Register a timeout timer. Will be cleared during dispose().
   * Returns the timeout ID for manual clearing if needed.
   */
  public addTimeout(id: ReturnType<typeof setTimeout>): ReturnType<typeof setTimeout> {
    this.assertNotDisposed();
    this.timeouts.push(id);
    return id;
  }

  /** Number of active subscriptions. */
  public get subscriptionCount(): number {
    return this.subscriptions.length;
  }

  /** Number of active intervals. */
  public get intervalCount(): number {
    return this.intervals.length;
  }

  /** Whether this guard has been disposed. */
  public isDisposed(): boolean { return this.disposed; }

  /**
   * Dispose all tracked resources:
   *   - Unsubscribe all event listeners
   *   - Clear all intervals
   *   - Clear all timeouts
   */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Unsubscribe all event listeners (in reverse order)
    for (let i = this.subscriptions.length - 1; i >= 0; i--) {
      try { this.subscriptions[i](); } catch { /* unsubscribe errors must not propagate */ }
    }
    this.subscriptions.length = 0;

    // Clear all intervals
    for (const id of this.intervals) {
      clearInterval(id);
    }
    this.intervals.length = 0;

    // Clear all timeouts
    for (const id of this.timeouts) {
      clearTimeout(id);
    }
    this.timeouts.length = 0;
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('LeakProtection: cannot add resources after dispose()');
    }
  }
}

/**
 * Utility: wrap a start/stop lifecycle to prevent double registration.
 * Returns a controller that ensures start() can only be called once
 * between stop() calls.
 */
export class LifecycleGuard {
  private started = false;

  public get isStarted(): boolean { return this.started; }

  /**
   * Start with protection against double-start.
   * Returns true if this is a new start, false if already started.
   */
  public start(): boolean {
    if (this.started) return false;
    this.started = true;
    return true;
  }

  /**
   * Stop with protection against double-stop.
   * Returns true if this is a new stop, false if already stopped.
   */
  public stop(): boolean {
    if (!this.started) return false;
    this.started = false;
    return true;
  }

  /** Reset to initial state. */
  public reset(): void {
    this.started = false;
  }
}