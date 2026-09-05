/**
 * SceneBindingComponent — Phase 5 central UI wiring component.
 *
 * Attached to the scene root, it:
 *   1. Resolves CocosBootstrapComponent.instance → facade
 *   2. Creates and owns ModalManager + ToastManager singletons
 *   3. Wires AnimationDispatcher to facade UI event stream
 *   4. Bridges facade events → modal/toast dispatch (event→modal, error→toast)
 *   5. Manages offline reward popup lifecycle (hide→settle→show)
 *   6. Manages tutorial overlay visibility
 *   7. Provides a single destroy point for all UI subscriptions
 *
 * Other UI components find this via SceneBindingComponent.instance
 * to access modalManager, toastManager, animationDispatcher.
 */

import { _decorator, Component } from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { UiEventCategory, UiEvent } from '../facade/ui-event-types';
import { ModalManager, type ModalRequest } from './modal-manager';
import { ToastManager, type ToastLevel } from './toast-manager';
import { AnimationDispatcher, type AnimationTrigger } from './animation-dispatcher';

const { ccclass } = _decorator;

// ── Error → Toast mapping ──────────────────────────────────────────────────

const ERROR_TOAST_LEVEL: Record<string, ToastLevel> = {
  CLOCK_ANOMALY: 'WARNING',
  BOARD_FULL: 'WARNING',
  RECRUIT_FAILED: 'WARNING',
  PROMOTION_FAILED: 'WARNING',
  MIND_BREAKDOWN: 'ERROR',
};

// ── Event → Modal mapping ──────────────────────────────────────────────────

const EVENT_MODAL_MAP: Record<string, ModalType> = {
  eventChanged: 'OFFICE_EVENT',
  promotionChanged: 'PROMOTION',
  offlineRewardChanged: 'OFFLINE_REWARD',
  achievementUnlocked: 'ACHIEVEMENT_CLAIM',
  dailyTaskClaimed: 'DAILY_TASK_CLAIM',
};

type ModalType = ModalRequest['type'];

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('SceneBinding')
export class SceneBindingComponent extends Component {
  private static _instance: SceneBindingComponent | null = null;

  private facade: GameFacade | null = null;
  public readonly modalManager = new ModalManager();
  public readonly toastManager = new ToastManager();
  public readonly animationDispatcher: AnimationDispatcher;

  private readonly unsubs: Array<() => void> = [];
  private disposed = false;

  public constructor() {
    super();
    // AnimationDispatcher is created without facade/audio — will be wired in onLoad
    this.animationDispatcher = new AnimationDispatcher(null as any);
  }

  /** Singleton instance — null after destroy. */
  public static get instance(): SceneBindingComponent | null {
    return SceneBindingComponent._instance;
  }

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    // Singleton guard
    if (SceneBindingComponent._instance && SceneBindingComponent._instance !== this) {
      this.destroy();
      return;
    }
    SceneBindingComponent._instance = this;

    // Resolve facade from bootstrap
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('SceneBindingComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;

    // Wire animation dispatcher with real facade + audio
    (this.animationDispatcher as any).facade = this.facade;
    if (bootstrap.audioService) {
      (this.animationDispatcher as any).audio = bootstrap.audioService;
    }

    // Subscribe to facade UI events for modal/toast/animation dispatch
    this.subscribeFacadeEvents();

    // Wire offline reward lifecycle: on show → check settlement
    this.facade.lifecycle.onShow(() => {
      if (!this.disposed) this.checkOfflineReward();
    });

    // Check tutorial state on load
    this.checkTutorial();
  }

  protected onDestroy(): void {
    this.disposed = true;
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
    this.modalManager.dispose();
    this.toastManager.dispose();
    this.animationDispatcher.dispose();
    this.facade = null;
    if (SceneBindingComponent._instance === this) {
      SceneBindingComponent._instance = null;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Get the facade (convenience for child components). */
  public getFacade(): GameFacade | null {
    return this.facade;
  }

  /** Enqueue a modal request through the central modal manager. */
  public showModal(request: ModalRequest): void {
    this.modalManager.enqueue(request);
  }

  /** Show a toast message through the central toast manager. */
  public showToast(message: string, level: ToastLevel = 'INFO', durationMs?: number): void {
    this.toastManager.show(message, level, durationMs);
  }

  // ── Facade Event Subscription ─────────────────────────────────────────────

  private subscribeFacadeEvents(): void {
    if (!this.facade) return;

    // Subscribe to all UI event categories for dispatch
    const categories: readonly UiEventCategory[] = [
      'STATE_CHANGED',
      'RESOURCE_CHANGED',
      'WORK_MODE_CHANGED',
      'CAREER_CHANGED',
      'BOARD_CHANGED',
      'EVENT_CHANGED',
      'ACHIEVEMENT_CHANGED',
      'DAILY_CHANGED',
      'BUFF_CHANGED',
      'TUTORIAL_CHANGED',
      'OFFLINE_REWARD',
      'REWARD_REQUESTED',
      'REWARD_COMPLETED',
      'ERROR_OCCURRED',
    ];

    for (const category of categories) {
      const unsub = this.facade.onUiEvent(category, (event) => {
        if (!this.disposed) this.dispatchUiEvent(event);
      });
      this.unsubs.push(unsub);
    }
  }

  // ── Event Dispatch ────────────────────────────────────────────────────────

  private dispatchUiEvent(event: UiEvent): void {
    // 1. Error events → toast
    if (event.category === 'ERROR_OCCURRED') {
      const level = ERROR_TOAST_LEVEL[event.source] ?? 'ERROR';
      const message = this.formatErrorMessage(event);
      this.toastManager.show(message, level);
      return;
    }

    // 2. Domain events → modal
    const modalType = EVENT_MODAL_MAP[event.source];
    if (modalType && event.detail && typeof event.detail === 'object') {
      const detail = event.detail as Record<string, unknown>;
      const entityId = this.deriveEntityId(modalType, detail);
      if (entityId) {
        this.modalManager.enqueue({
          entityId,
          type: modalType,
          payload: detail,
          dismissible: modalType !== 'TUTORIAL',
        });
      }
    }

    // 3. Board full → toast
    if (event.source === 'recruitmentFailed') {
      this.toastManager.show('工位已满，无法招募', 'WARNING');
    }

    // 4. Success feedback → toast
    if (event.source === 'workerRecruited') {
      this.toastManager.show('招募成功！', 'SUCCESS');
    }
    if (event.source === 'mergeCompleted') {
      this.toastManager.show('合成成功！', 'SUCCESS');
    }
    if (event.source === 'achievementUnlocked') {
      this.toastManager.show('成就解锁！', 'SUCCESS');
    }
  }

  // ── Offline Reward ────────────────────────────────────────────────────────

  private checkOfflineReward(): void {
    if (!this.facade) return;
    const player = this.facade.snapshot();
    if (!player.lastSaveTime || player.lastSaveTime <= 0) return;

    // Generate a settlement ID based on current timestamp
    const settlementId = `offline-${Date.now()}`;
    const preview = this.facade.queryOfflinePreview(settlementId);

    // Only show modal if there's meaningful offline reward
    if (preview.salary > 0 || preview.cultivationExp > 0) {
      this.modalManager.enqueue({
        entityId: settlementId,
        type: 'OFFLINE_REWARD',
        payload: { settlementId, salary: preview.salary, cultivationExp: preview.cultivationExp, elapsedSeconds: preview.elapsedSeconds, capped: preview.capped },
        dismissible: false,
        priority: 50, // Higher priority than normal modals
      });
    }
  }

  // ── Tutorial ──────────────────────────────────────────────────────────────

  private checkTutorial(): void {
    if (!this.facade) return;
    const tutorial = this.facade.queryTutorial();
    if (!tutorial.isCompleted && tutorial.currentStep !== 'NONE') {
      this.modalManager.enqueue({
        entityId: 'tutorial',
        type: 'TUTORIAL',
        payload: { step: tutorial.currentStep, stepIndex: tutorial.stepIndex, steps: tutorial.steps },
        dismissible: false,
        priority: 100, // Highest priority
      });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private deriveEntityId(modalType: ModalType, detail: Record<string, unknown>): string | null {
    switch (modalType) {
      case 'OFFICE_EVENT':
        return typeof detail.eventId === 'string' ? `event-${detail.eventId}` : null;
      case 'PROMOTION':
        return 'promotion';
      case 'OFFLINE_REWARD':
        return typeof detail.settlementId === 'string' ? detail.settlementId : null;
      case 'ACHIEVEMENT_CLAIM':
        return typeof detail.achievementId === 'string' ? `achievement-${detail.achievementId}` : null;
      case 'DAILY_TASK_CLAIM':
        return typeof detail.taskId === 'string' ? `daily-${detail.taskId}` : null;
      default:
        return null;
    }
  }

  private formatErrorMessage(event: UiEvent): string {
    const detail = event.detail as Record<string, unknown> | undefined;
    if (detail?.code === 'CLOCK_ANOMALY') return '检测到时间异常，离线收益已跳过';
    if (event.source === 'MIND_BREAKDOWN') return '道心崩溃！请及时恢复';
    return '发生错误，请稍后重试';
  }
}