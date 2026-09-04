/**
 * ToastManager — throttled toast/tooltip queue for Phase 5 UI.
 *
 * Rules (from UI-DESIGN-SYSTEM.md):
 *   - One visible toast at a time
 *   - Merge identical messages (same text within cooldown window)
 *   - Max 3 queued toasts; excess are silently dropped
 *   - Toast does not overlap primary action buttons
 *   - Tooltip: tap to open, tap outside to close; cannot carry unique necessary info
 *
 * Usage:
 *   const toast = new ToastManager();
 *   toast.show('招募成功！', 'SUCCESS');
 *   toast.show('道心不足', 'WARNING');
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type ToastLevel = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface ToastEntry {
  readonly id: number;
  readonly message: string;
  readonly level: ToastLevel;
  readonly createdAt: number;
  readonly durationMs: number;
}

export type ToastListener = (active: ToastEntry | null, queueSize: number) => void;

// ── Configuration ───────────────────────────────────────────────────────────

export interface ToastManagerOptions {
  /** Default toast display duration in ms. Default: 2500. */
  readonly defaultDurationMs?: number;
  /** Max queued toasts (excluding active). Default: 3. */
  readonly maxQueueSize?: number;
  /** Cooldown for merging identical messages in ms. Default: 3000. */
  readonly mergeCooldownMs?: number;
}

// ── Manager ─────────────────────────────────────────────────────────────────

let nextToastId = 1;

export class ToastManager {
  private readonly queue: ToastEntry[] = [];
  private active: ToastEntry | null = null;
  private readonly listeners = new Set<ToastListener>();
  private readonly recentMessages = new Map<string, number>(); // message → last shown timestamp
  private readonly defaultDurationMs: number;
  private readonly maxQueueSize: number;
  private readonly mergeCooldownMs: number;
  private activeTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  public constructor(options: ToastManagerOptions = {}) {
    this.defaultDurationMs = options.defaultDurationMs ?? 2500;
    this.maxQueueSize = options.maxQueueSize ?? 3;
    this.mergeCooldownMs = options.mergeCooldownMs ?? 3000;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Show a toast message. If an identical message was shown recently
   * (within mergeCooldownMs), it is silently merged/dropped.
   * If the queue is full, the message is silently dropped.
   */
  public show(message: string, level: ToastLevel = 'INFO', durationMs?: number): void {
    if (this.disposed) return;

    // Merge identical messages within cooldown window
    const now = Date.now();
    const lastShown = this.recentMessages.get(message);
    if (lastShown !== undefined && now - lastShown < this.mergeCooldownMs) {
      return; // Merge: drop duplicate
    }
    this.recentMessages.set(message, now);

    // Enforce queue size limit
    if (this.queue.length >= this.maxQueueSize) {
      return; // Drop: queue full
    }

    const entry: ToastEntry = {
      id: nextToastId++,
      message,
      level,
      createdAt: now,
      durationMs: durationMs ?? this.defaultDurationMs,
    };

    this.queue.push(entry);

    // If no active toast, show immediately
    if (!this.active) {
      this.showNext();
    }

    this.notify();
  }

  /** Dismiss the active toast immediately. */
  public dismiss(): void {
    if (!this.active) return;
    this.clearActiveTimer();
    this.active = null;
    this.showNext();
    this.notify();
  }

  /** Get the current active toast. */
  public getActive(): ToastEntry | null {
    return this.active;
  }

  /** Get the current queue size. */
  public getQueueSize(): number {
    return this.queue.length;
  }

  // ── Listener ──────────────────────────────────────────────────────────────

  /** Subscribe to toast state changes. Returns unsubscribe function. */
  public onStateChange(listener: ToastListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Dispose the manager and clear all toasts. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearActiveTimer();
    this.queue.length = 0;
    this.active = null;
    this.recentMessages.clear();
    this.listeners.clear();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private showNext(): void {
    if (this.queue.length === 0) return;

    this.active = this.queue.shift()!;

    // Auto-dismiss after duration
    this.activeTimer = setTimeout(() => {
      this.active = null;
      this.showNext();
      this.notify();
    }, this.active.durationMs);
  }

  private clearActiveTimer(): void {
    if (this.activeTimer !== null) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
  }

  private notify(): void {
    const active = this.active;
    const queueSize = this.queue.length;
    for (const listener of this.listeners) {
      try {
        listener(active, queueSize);
      } catch {
        // Listener errors must not propagate
      }
    }
  }
}