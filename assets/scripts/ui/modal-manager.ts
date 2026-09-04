/**
 * ModalManager — unified modal queue for Phase 5 UI.
 *
 * Enforces one active modal at a time with FIFO queue (max 3).
 * Supports modal lifecycle: CLOSED → OPENING → OPEN → SUBMITTING → CLOSING → CLOSED.
 * De-duplicates by entity ID to prevent duplicate modals for the same business entity.
 *
 * Usage:
 *   const manager = new ModalManager();
 *   manager.enqueue({ id: 'event-123', type: 'OFFICE_EVENT', ... });
 *   manager.enqueue({ id: 'promotion', type: 'PROMOTION', ... });
 */

// ── Modal Types ─────────────────────────────────────────────────────────────

export type ModalType =
  | 'OFFICE_EVENT'
  | 'PROMOTION'
  | 'OFFLINE_REWARD'
  | 'ACHIEVEMENT_CLAIM'
  | 'DAILY_TASK_CLAIM'
  | 'SECT_SELECT'
  | 'SETTINGS'
  | 'CONFIRM'
  | 'TUTORIAL'
  | 'REWARD_AD';

export type ModalLifecycleState =
  | 'CLOSED'
  | 'OPENING'
  | 'OPEN'
  | 'SUBMITTING'
  | 'CLOSING';

export interface ModalRequest {
  /** Unique entity ID for de-duplication (e.g., 'event-123', 'promotion'). */
  readonly entityId: string;
  /** Modal type determines which component renders. */
  readonly type: ModalType;
  /** Arbitrary payload for the modal component. */
  readonly payload?: unknown;
  /** Priority: higher priority modals jump the queue. System messages = 100, normal = 0. */
  readonly priority?: number;
  /** Whether the modal can be dismissed by pressing outside or back button. */
  readonly dismissible?: boolean;
}

export interface ActiveModal {
  readonly request: ModalRequest;
  readonly state: ModalLifecycleState;
  readonly enqueuedAt: number;
  readonly openedAt: number | null;
}

// ── Listener ────────────────────────────────────────────────────────────────

export type ModalListener = (active: ActiveModal | null, queueSize: number) => void;

// ── Manager ─────────────────────────────────────────────────────────────────

const MAX_QUEUE_SIZE = 3;

export class ModalManager {
  private readonly queue: ModalRequest[] = [];
  private active: ActiveModal | null = null;
  private readonly listeners = new Set<ModalListener>();
  private readonly entityIds = new Set<string>();
  private disposed = false;

  // ── Queue Operations ──────────────────────────────────────────────────────

  /**
   * Enqueue a modal request. If no modal is active, it opens immediately.
   * De-duplicates by entityId — if a modal for the same entity is already
   * queued or active, the request is silently dropped.
   */
  public enqueue(request: ModalRequest): void {
    if (this.disposed) return;

    // De-duplicate by entity ID
    if (this.entityIds.has(request.entityId)) return;

    // Enforce queue size limit
    if (this.queue.length >= MAX_QUEUE_SIZE) return;

    this.entityIds.add(request.entityId);

    // Priority insertion: higher priority goes first
    const priority = request.priority ?? 0;
    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      const existingPriority = this.queue[i].priority ?? 0;
      if (priority > existingPriority) {
        this.queue.splice(i, 0, request);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.queue.push(request);
    }

    // If no active modal, open the next one
    if (!this.active) {
      this.openNext();
    }

    this.notify();
  }

  /**
   * Transition the active modal to SUBMITTING state.
   * During SUBMITTING, the modal cannot be dismissed or re-submitted.
   */
  public submit(): void {
    if (!this.active || this.active.state !== 'OPEN') return;
    this.active = {
      ...this.active,
      state: 'SUBMITTING',
    };
    this.notify();
  }

  /**
   * Close the active modal. Transitions to CLOSING then CLOSED.
   * After closing, the next queued modal opens automatically.
   */
  public close(): void {
    if (!this.active) return;

    // Can't close while submitting (must wait for result)
    if (this.active.state === 'SUBMITTING') return;

    // Remove entity ID from de-dup set
    this.entityIds.delete(this.active.request.entityId);

    // Close immediately (CLOSING → CLOSED in one step for headless)
    this.active = null;

    // Open next queued modal
    this.openNext();
    this.notify();
  }

  /**
   * Complete a submitting modal with a result.
   * Transitions from SUBMITTING to CLOSING → CLOSED.
   */
  public complete(): void {
    if (!this.active || this.active.state !== 'SUBMITTING') return;

    // Remove entity ID from de-dup set
    this.entityIds.delete(this.active.request.entityId);

    this.active = null;
    this.openNext();
    this.notify();
  }

  /** Dismiss the active modal (only if dismissible). */
  public dismiss(): void {
    if (!this.active) return;
    if (!this.active.request.dismissible) return;
    if (this.active.state === 'SUBMITTING') return;
    this.close();
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  /** Get the current active modal (null if none). */
  public getActive(): ActiveModal | null {
    return this.active;
  }

  /** Get the current queue size (excluding active modal). */
  public getQueueSize(): number {
    return this.queue.length;
  }

  /** Check if a modal for the given entity ID is active or queued. */
  public isEntityActive(entityId: string): boolean {
    return this.entityIds.has(entityId);
  }

  // ── Listener ──────────────────────────────────────────────────────────────

  /** Subscribe to modal state changes. Returns unsubscribe function. */
  public onStateChange(listener: ModalListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Dispose the manager and clear all modals. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.queue.length = 0;
    this.active = null;
    this.entityIds.clear();
    this.listeners.clear();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private openNext(): void {
    if (this.queue.length === 0) return;

    const request = this.queue.shift()!;
    this.active = {
      request,
      state: 'OPEN',
      enqueuedAt: Date.now(),
      openedAt: Date.now(),
    };
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