/**
 * AnimationDispatcher — bridges PresentationEvents to Cocos Tween/Sprite animations.
 *
 * Subscribes to GameFacade's UI event stream and dispatches visual feedback
 * based on the animation-trigger-map.json configuration. In headless/test
 * environments, all animations are no-ops.
 *
 * Design:
 *   - Event → trigger lookup via mapping table
 *   - Trigger → Cocos tween or sprite animation on target node
 *   - Reduced-motion: skip tween, apply instant state change
 *   - Audio: delegate to AudioService for mapped audioId
 */

import type { GameFacade } from '../facade/game-facade';
import type { AudioService, AudioId } from '../services/audio-service';
import type { PresentationEvent } from '../facade/presentation-events';

// ── Animation Trigger Mapping ───────────────────────────────────────────────

export interface AnimationTrigger {
  readonly id: string;
  readonly sourceEvent: string | null;
  readonly animation: string;
  readonly target: string;
  readonly audioId: AudioId | null;
  readonly durationMs: number;
}

// ── Animation Callback ──────────────────────────────────────────────────────

/**
 * Callback that performs the actual visual animation on a Cocos node.
 * The dispatcher calls this with the trigger config and event data.
 * Cocos components register their callbacks for specific target names.
 */
export type AnimationCallback = (trigger: AnimationTrigger, event: PresentationEvent) => void;

// ── Dispatcher ──────────────────────────────────────────────────────────────

export class AnimationDispatcher {
  private readonly triggers = new Map<string, AnimationTrigger>();
  private readonly callbacks = new Map<string, Set<AnimationCallback>>();
  private readonly eventToTriggers = new Map<string, AnimationTrigger[]>();
  private unsubUiEvents: (() => void) | null = null;
  private reducedMotion = false;
  private disposed = false;

  public constructor(
    private readonly facade: GameFacade,
    private readonly audio?: AudioService,
  ) {}

  // ── Setup ─────────────────────────────────────────────────────────────────

  /** Load trigger mappings from configuration. */
  public loadTriggers(triggers: readonly AnimationTrigger[]): void {
    this.triggers.clear();
    this.eventToTriggers.clear();
    for (const trigger of triggers) {
      this.triggers.set(trigger.id, trigger);
      if (trigger.sourceEvent) {
        const list = this.eventToTriggers.get(trigger.sourceEvent) ?? [];
        list.push(trigger);
        this.eventToTriggers.set(trigger.sourceEvent, list);
      }
    }
  }

  /** Start listening to facade UI events. */
  public start(): void {
    if (this.unsubUiEvents) return;

    // Subscribe to all UI event categories that might produce animations
    const categories: readonly import('../facade/ui-event-types').UiEventCategory[] = [
      'STATE_CHANGED', 'RESOURCE_CHANGED', 'WORK_MODE_CHANGED',
      'CAREER_CHANGED', 'BOARD_CHANGED', 'EVENT_CHANGED',
      'ACHIEVEMENT_CHANGED', 'DAILY_CHANGED', 'BUFF_CHANGED',
      'TUTORIAL_CHANGED', 'OFFLINE_REWARD', 'REWARD_COMPLETED',
    ];
    const unsubscribers: Array<() => void> = [];

    for (const category of categories) {
      unsubscribers.push(
        this.facade.onUiEvent(category, (event) => {
          this.onUiEvent(event.source, event.detail as PresentationEvent);
        }),
      );
    }

    this.unsubUiEvents = () => {
      for (const unsub of unsubscribers) unsub();
    };
  }

  /** Register a visual callback for a target name (e.g., 'salary counter'). */
  public registerCallback(target: string, callback: AnimationCallback): () => void {
    let set = this.callbacks.get(target);
    if (!set) {
      set = new Set();
      this.callbacks.set(target, set);
    }
    set.add(callback);
    return () => {
      set!.delete(callback);
      if (set!.size === 0) this.callbacks.delete(target);
    };
  }

  /** Set reduced-motion preference. When true, animations are skipped. */
  public setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────

  /** Dispatch a presentation event to registered callbacks. */
  public dispatch(event: PresentationEvent): void {
    if (this.disposed) return;

    // Find triggers matching this event type
    const eventTriggers = this.eventToTriggers.get(event.type) ?? [];

    for (const trigger of eventTriggers) {
      // Play audio if mapped
      if (trigger.audioId && this.audio) {
        this.audio.playSfx(trigger.audioId);
      }

      // Skip visual animation in reduced-motion mode
      if (this.reducedMotion) continue;

      // Dispatch to registered callbacks for this target
      const targetCallbacks = this.callbacks.get(trigger.target);
      if (targetCallbacks) {
        for (const cb of targetCallbacks) {
          try {
            cb(trigger, event);
          } catch {
            // Animation callback errors must not propagate
          }
        }
      }
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private onUiEvent(source: string, detail?: PresentationEvent): void {
    if (!detail || typeof detail !== 'object' || !('type' in detail)) return;
    this.dispatch(detail as PresentationEvent);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Dispose the dispatcher and release all resources. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.unsubUiEvents) {
      this.unsubUiEvents();
      this.unsubUiEvents = null;
    }
    this.triggers.clear();
    this.callbacks.clear();
    this.eventToTriggers.clear();
  }
}

// ── Default trigger mappings ────────────────────────────────────────────────

/** Built-in animation triggers matching animation-trigger-map.json. */
export const DEFAULT_ANIMATION_TRIGGERS: readonly AnimationTrigger[] = [
  {
    id: 'salary_gain',
    sourceEvent: 'salaryChanged',
    animation: 'coin sprites to salary HUD anchor over 280ms',
    target: 'salary counter',
    audioId: 'game_salary',
    durationMs: 280,
  },
  {
    id: 'cultivation_gain',
    sourceEvent: 'cultivationGained',
    animation: 'cultivation wisp to cultivation HUD anchor over 280ms',
    target: 'cultivation counter',
    audioId: 'game_cultivation',
    durationMs: 280,
  },
  {
    id: 'mind_decrease',
    sourceEvent: 'mindChanged',
    animation: 'icon light scale-down and signed delta over 180ms',
    target: 'mind bar',
    audioId: 'ui_fail',
    durationMs: 180,
  },
  {
    id: 'worker_merge',
    sourceEvent: 'mergeCompleted',
    animation: 'source converges to target over 320ms',
    target: 'merge board target slot',
    audioId: 'game_merge',
    durationMs: 320,
  },
  {
    id: 'worker_recruit',
    sourceEvent: 'workerRecruited',
    animation: 'worker card appear over 200ms',
    target: 'merge board empty slot',
    audioId: 'game_recruit',
    durationMs: 200,
  },
  {
    id: 'promotion_success',
    sourceEvent: 'promotionChanged',
    animation: 'promotion seal/halo over 900ms',
    target: 'promotion modal result',
    audioId: 'game_promotion',
    durationMs: 900,
  },
  {
    id: 'achievement_unlock',
    sourceEvent: 'AchievementUnlocked',
    animation: 'achievement toast over 280ms with 1600ms hold',
    target: 'achievement toast',
    audioId: 'game_achievement',
    durationMs: 1880,
  },
  {
    id: 'office_event',
    sourceEvent: 'eventChanged',
    animation: 'office event modal in 180ms',
    target: 'OfficeEventModal',
    audioId: 'ui_open',
    durationMs: 180,
  },
  {
    id: 'offline_reward',
    sourceEvent: 'idleSettled',
    animation: 'wage slip expand over 180ms',
    target: 'offline reward modal',
    audioId: 'ui_open',
    durationMs: 180,
  },
  {
    id: 'daily_task_complete',
    sourceEvent: 'dailyTaskCompleted',
    animation: 'check mark over 220ms',
    target: 'daily task item',
    audioId: 'ui_success',
    durationMs: 220,
  },
  {
    id: 'buff_activate',
    sourceEvent: 'buffAdded',
    animation: 'buff icon appear over 200ms',
    target: 'buff indicator',
    audioId: 'ui_success',
    durationMs: 200,
  },
  {
    id: 'tutorial_step',
    sourceEvent: 'tutorialStepChanged',
    animation: 'highlight pulse over 400ms',
    target: 'tutorial overlay',
    audioId: null,
    durationMs: 400,
  },
  {
    id: 'work_mode_change',
    sourceEvent: 'workModeChanged',
    animation: 'toggle switch over 120ms',
    target: 'work mode toggle',
    audioId: 'ui_click',
    durationMs: 120,
  },
];