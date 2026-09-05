/**
 * CommonModalComponent — Phase 5 modal layer driver.
 *
 * Renders modals from ModalManager onto the ModalLayer node.
 * Supports all ModalType variants with type-specific content rendering.
 * Manages modal lifecycle: OPENING → OPEN → SUBMITTING → CLOSING → CLOSED.
 *
 * Layout: full-screen overlay (750×1334) with centered content card.
 * Each modal type has its own render logic but shares the overlay/mask/close pattern.
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { SceneBindingComponent } from './scene-binding-component';
import type { GameFacade } from '../facade/game-facade';
import type { ActiveModal, ModalRequest, ModalType } from './modal-manager';
import { formatNumber } from './number-formatter';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

// ── Cocos Node Interfaces ───────────────────────────────────────────────────

interface TextLike { string: string; }
interface ButtonLike {
  on?: (event: string, callback: () => void, target?: unknown) => void;
  off?: (event: string, callback: () => void, target?: unknown) => void;
  interactable?: boolean;
}
interface SceneNodeLike {
  name?: string;
  children?: readonly SceneNodeLike[];
  parent?: SceneNodeLike;
  active?: boolean;
  getChildByName?: (name: string) => SceneNodeLike | null;
  getComponent?: (type: unknown) => unknown;
  setPosition?: (pos: { x: number; y: number; z?: number }) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('CommonModal')
export class CommonModalComponent extends Component {
  // ── Scene-bound properties ────────────────────────────────────────────────

  /** The modal overlay/mask node (full-screen semi-transparent) */
  @property(resolveCocosType('Node'))
  public overlayNode?: SceneNodeLike;

  /** The content card node (centered, type-specific content) */
  @property(resolveCocosType('Node'))
  public contentNode?: SceneNodeLike;

  /** Title label */
  @property(resolveCocosType('Label'))
  public titleLabel?: TextLike;

  /** Body/content label */
  @property(resolveCocosType('Label'))
  public bodyLabel?: TextLike;

  /** Primary action button */
  @property(resolveCocosType('Button'))
  public primaryButton?: ButtonLike;

  /** Secondary action button (cancel/dismiss) */
  @property(resolveCocosType('Button'))
  public secondaryButton?: ButtonLike;

  /** Primary button label */
  @property(resolveCocosType('Label'))
  public primaryButtonLabel?: TextLike;

  /** Secondary button label */
  @property(resolveCocosType('Label'))
  public secondaryButtonLabel?: TextLike;

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private currentModal: ActiveModal | null = null;
  private unsubModal: (() => void) | null = null;
  private disposed = false;

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const binding = SceneBindingComponent.instance;
    if (!binding) {
      throw new Error('CommonModalComponent requires SceneBindingComponent');
    }
    this.facade = binding.getFacade();

    // Subscribe to modal manager state changes
    this.unsubModal = binding.modalManager.onStateChange((active, queueSize) => {
      if (!this.disposed) this.onModalStateChanged(active, queueSize);
    });

    // Bind button handlers
    this.primaryButton?.on?.('click', this.onPrimaryAction, this);
    this.secondaryButton?.on?.('click', this.onSecondaryAction, this);

    // Initially hidden
    this.hideOverlay();
  }

  protected onDestroy(): void {
    this.disposed = true;
    if (this.unsubModal) this.unsubModal();
    this.primaryButton?.off?.('click', this.onPrimaryAction, this);
    this.secondaryButton?.off?.('click', this.onSecondaryAction, this);
    this.facade = null;
  }

  // ── Modal State Handler ───────────────────────────────────────────────────

  private onModalStateChanged(active: ActiveModal | null, queueSize: number): void {
    if (active && active.state === 'OPEN') {
      this.currentModal = active;
      this.renderModal(active.request);
      this.showOverlay();
    } else {
      this.currentModal = null;
      this.hideOverlay();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private renderModal(request: ModalRequest): void {
    switch (request.type) {
      case 'OFFICE_EVENT':
        this.renderEventModal(request.payload);
        break;
      case 'PROMOTION':
        this.renderPromotionModal(request.payload);
        break;
      case 'OFFLINE_REWARD':
        this.renderOfflineRewardModal(request.payload);
        break;
      case 'ACHIEVEMENT_CLAIM':
        this.renderAchievementModal(request.payload);
        break;
      case 'DAILY_TASK_CLAIM':
        this.renderDailyTaskModal(request.payload);
        break;
      case 'TUTORIAL':
        this.renderTutorialModal(request.payload);
        break;
      case 'SECT_SELECT':
        this.renderSectSelectModal(request.payload);
        break;
      case 'SETTINGS':
        this.renderSettingsModal(request.payload);
        break;
      case 'CONFIRM':
        this.renderConfirmModal(request.payload);
        break;
      case 'REWARD_AD':
        this.renderRewardAdModal(request.payload);
        break;
      default:
        this.renderGenericModal(request);
    }
  }

  // ── Type-specific Renderers ───────────────────────────────────────────────

  private renderEventModal(payload: unknown): void {
    const data = payload as Record<string, unknown> | undefined;
    this.setText(this.titleLabel, '职场事件');
    this.setText(this.bodyLabel, typeof data?.eventId === 'string' ? `事件: ${data.eventId}` : '职场事件发生了！');
    this.setText(this.primaryButtonLabel, '选择');
    this.setText(this.secondaryButtonLabel, '跳过');
    this.setButtonInteractable(this.primaryButton, true);
    this.setButtonInteractable(this.secondaryButton, true);
  }

  private renderPromotionModal(payload: unknown): void {
    if (!this.facade) return;
    const check = this.facade.queryPromotionCheck();
    this.setText(this.titleLabel, '渡劫晋升');
    if (check.allowed) {
      const prob = this.facade.queryPromotionProbability();
      this.setText(this.bodyLabel, `晋升概率: ${Math.round(prob * 100)}%\n是否尝试渡劫？`);
      this.setText(this.primaryButtonLabel, '渡劫！');
      this.setButtonInteractable(this.primaryButton, true);
    } else {
      this.setText(this.bodyLabel, `不可晋升：${check.reason}`);
      this.setText(this.primaryButtonLabel, '知道了');
      this.setButtonInteractable(this.primaryButton, true);
    }
    this.setText(this.secondaryButtonLabel, '取消');
    this.setButtonInteractable(this.secondaryButton, true);
  }

  private renderOfflineRewardModal(payload: unknown): void {
    const data = payload as Record<string, unknown> | undefined;
    const salary = typeof data?.salary === 'number' ? data.salary : 0;
    const cultivationExp = typeof data?.cultivationExp === 'number' ? data.cultivationExp : 0;
    const elapsedSeconds = typeof data?.elapsedSeconds === 'number' ? data.elapsedSeconds : 0;
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);

    this.setText(this.titleLabel, '离线收益');
    this.setText(this.bodyLabel, `离线 ${hours}小时${minutes}分钟\n灵石 +${formatNumber(salary)}\n修为 +${formatNumber(cultivationExp)}`);
    this.setText(this.primaryButtonLabel, '领取');
    this.setText(this.secondaryButtonLabel, '双倍领取(广告)');
    this.setButtonInteractable(this.primaryButton, true);
    this.setButtonInteractable(this.secondaryButton, true);
  }

  private renderAchievementModal(payload: unknown): void {
    const data = payload as Record<string, unknown> | undefined;
    const achievementId = typeof data?.achievementId === 'string' ? data.achievementId : '';
    this.setText(this.titleLabel, '成就解锁');
    this.setText(this.bodyLabel, `恭喜解锁成就: ${achievementId}`);
    this.setText(this.primaryButtonLabel, '领取奖励');
    this.setText(this.secondaryButtonLabel, '稍后');
    this.setButtonInteractable(this.primaryButton, true);
    this.setButtonInteractable(this.secondaryButton, true);
  }

  private renderDailyTaskModal(payload: unknown): void {
    const data = payload as Record<string, unknown> | undefined;
    const taskId = typeof data?.taskId === 'string' ? data.taskId : '';
    this.setText(this.titleLabel, '每日任务');
    this.setText(this.bodyLabel, `任务完成: ${taskId}`);
    this.setText(this.primaryButtonLabel, '领取');
    this.setText(this.secondaryButtonLabel, '关闭');
    this.setButtonInteractable(this.primaryButton, true);
    this.setButtonInteractable(this.secondaryButton, true);
  }

  private renderTutorialModal(payload: unknown): void {
    const data = payload as Record<string, unknown> | undefined;
    const step = typeof data?.step === 'string' ? data.step : '';
    const stepNames: Record<string, string> = {
      FIRST_RECRUIT: '第一步：招募你的第一个牛马',
      SECOND_RECRUIT: '第二步：再招募一个牛马',
      FIRST_MERGE: '第三步：拖拽合成两个相同等级的牛马',
      START_WORK: '第四步：开始认真上班',
      CHECK_KPI: '第五步：查看你的KPI进度',
      FIRST_PROMOTION: '第六步：尝试渡劫晋升！',
    };
    this.setText(this.titleLabel, '新手引导');
    this.setText(this.bodyLabel, stepNames[step] ?? `引导步骤: ${step}`);
    this.setText(this.primaryButtonLabel, '下一步');
    this.setText(this.secondaryButtonLabel, '跳过');
    this.setButtonInteractable(this.primaryButton, true);
    this.setButtonInteractable(this.secondaryButton, true);
  }

  private renderSectSelectModal(payload: unknown): void {
    this.setText(this.titleLabel, '选择宗门');
    this.setText(this.bodyLabel, '请选择你的宗门');
    this.setText(this.primaryButtonLabel, '确认');
    this.setText(this.secondaryButtonLabel, '取消');
    this.setButtonInteractable(this.primaryButton, true);
    this.setButtonInteractable(this.secondaryButton, true);
  }

  private renderSettingsModal(_payload: unknown): void {
    this.setText(this.titleLabel, '设置');
    this.setText(this.bodyLabel, '游戏设置');
    this.setText(this.primaryButtonLabel, '保存');
    this.setText(this.secondaryButtonLabel, '关闭');
    this.setButtonInteractable(this.primaryButton, true);
    this.setButtonInteractable(this.secondaryButton, true);
  }

  private renderConfirmModal(payload: unknown): void {
    const data = payload as Record<string, unknown> | undefined;
    this.setText(this.titleLabel, '确认');
    this.setText(this.bodyLabel, typeof data?.message === 'string' ? data.message : '确认操作？');
    this.setText(this.primaryButtonLabel, '确认');
    this.setText(this.secondaryButtonLabel, '取消');
    this.setButtonInteractable(this.primaryButton, true);
    this.setButtonInteractable(this.secondaryButton, true);
  }

  private renderRewardAdModal(_payload: unknown): void {
    this.setText(this.titleLabel, '奖励广告');
    this.setText(this.bodyLabel, '观看广告获得双倍奖励？');
    this.setText(this.primaryButtonLabel, '观看广告');
    this.setText(this.secondaryButtonLabel, '跳过');
    this.setButtonInteractable(this.primaryButton, true);
    this.setButtonInteractable(this.secondaryButton, true);
  }

  private renderGenericModal(request: ModalRequest): void {
    this.setText(this.titleLabel, request.type);
    this.setText(this.bodyLabel, `Modal: ${request.entityId}`);
    this.setText(this.primaryButtonLabel, '确定');
    this.setText(this.secondaryButtonLabel, '取消');
    this.setButtonInteractable(this.primaryButton, true);
    this.setButtonInteractable(this.secondaryButton, request.dismissible ?? true);
  }

  // ── Button Handlers ───────────────────────────────────────────────────────

  private readonly onPrimaryAction = (): void => {
    if (!this.currentModal) return;
    const binding = SceneBindingComponent.instance;
    if (!binding || !this.facade) return;

    const request = this.currentModal.request;

    // Submit the modal (transition to SUBMITTING)
    binding.modalManager.submit();

    // Execute type-specific primary action
    switch (request.type) {
      case 'OFFLINE_REWARD': {
        const data = request.payload as Record<string, unknown>;
        const settlementId = typeof data?.settlementId === 'string' ? data.settlementId : '';
        if (settlementId) {
          this.facade.claimOfflineReward(settlementId);
        }
        break;
      }
      case 'ACHIEVEMENT_CLAIM': {
        const data = request.payload as Record<string, unknown>;
        const achievementId = typeof data?.achievementId === 'string' ? data.achievementId : '';
        if (achievementId) {
          this.facade.claimAchievement(achievementId);
        }
        break;
      }
      case 'DAILY_TASK_CLAIM': {
        const data = request.payload as Record<string, unknown>;
        const taskId = typeof data?.taskId === 'string' ? data.taskId : '';
        if (taskId) {
          this.facade.claimDailyTask(taskId);
        }
        break;
      }
      case 'TUTORIAL': {
        this.facade.advanceTutorial();
        break;
      }
      case 'PROMOTION': {
        const options = this.facade.queryPromotionOptions();
        if (options.length > 0) {
          this.facade.promote(options[0].id);
        }
        break;
      }
      default:
        break;
    }

    // Complete the modal
    binding.modalManager.complete();
  };

  private readonly onSecondaryAction = (): void => {
    if (!this.currentModal) return;
    const binding = SceneBindingComponent.instance;
    if (!binding) return;

    const request = this.currentModal.request;

    // Type-specific secondary actions
    switch (request.type) {
      case 'OFFLINE_REWARD': {
        // Double claim via ad
        const data = request.payload as Record<string, unknown>;
        const settlementId = typeof data?.settlementId === 'string' ? data.settlementId : '';
        if (settlementId && this.facade) {
          binding.modalManager.submit();
          this.facade.claimOfflineDouble(settlementId, (success) => {
            if (success) {
              binding.showToast('双倍领取成功！', 'SUCCESS');
            } else {
              binding.showToast('广告未完成，领取普通奖励', 'WARNING');
              this.facade?.claimOfflineReward(settlementId);
            }
            binding.modalManager.complete();
          });
          return; // Don't dismiss yet — callback will handle it
        }
        break;
      }
      case 'TUTORIAL': {
        // Skip tutorial
        this.facade?.skipTutorial();
        break;
      }
      default:
        break;
    }

    // Dismiss or close
    if (request.dismissible !== false) {
      binding.modalManager.dismiss();
    } else {
      binding.modalManager.close();
    }
  };

  // ── Overlay Visibility ────────────────────────────────────────────────────

  private showOverlay(): void {
    if (this.overlayNode) this.overlayNode.active = true;
    if (this.contentNode) this.contentNode.active = true;
  }

  private hideOverlay(): void {
    if (this.overlayNode) this.overlayNode.active = false;
    if (this.contentNode) this.contentNode.active = false;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private setText(label: TextLike | undefined, text: string): void {
    if (label) label.string = text;
  }

  private setButtonInteractable(button: ButtonLike | undefined, interactable: boolean): void {
    if (button) button.interactable = interactable;
  }
}