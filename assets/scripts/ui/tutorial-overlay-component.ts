/**
 * TutorialOverlayComponent — WEB V1 new-player onboarding overlay.
 *
 * Shows step-by-step guidance for the first 6 tutorial steps:
 *   FIRST_RECRUIT → SECOND_RECRUIT → FIRST_MERGE → START_WORK → CHECK_KPI → FIRST_PROMOTION
 *
 * Subscribes to TUTORIAL_CHANGED events and auto-updates.
 * Player can advance (confirm) or skip the tutorial entirely.
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import { SceneBindingComponent } from './scene-binding-component';
import {
  buildTutorialViewModel,
  type TutorialViewModel,
} from './view-models';
import type { GameFacade } from '../facade/game-facade';
import type { TutorialStep } from '../services/tutorial-service';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

interface TextLike { string: string; active?: boolean; }
interface ButtonLike {
  on?: (event: string, callback: () => void, target?: unknown) => void;
  off?: (event: string, callback: () => void, target?: unknown) => void;
  interactable?: boolean;
}
interface NodeLike {
  active?: boolean;
  name?: string;
  children?: readonly NodeLike[];
  getChildByName?: (name: string) => NodeLike | null;
  getComponent?: (type: unknown) => unknown;
}

// ── Step descriptions ───────────────────────────────────────────────────────

const STEP_INFO: Record<TutorialStep | 'NONE', { title: string; hint: string }> = {
  FIRST_RECRUIT: {
    title: '招募第一位员工',
    hint: '点击空位招募你的第一位员工吧！',
  },
  SECOND_RECRUIT: {
    title: '招募第二位员工',
    hint: '继续招募，让团队壮大起来！',
  },
  FIRST_MERGE: {
    title: '首次合成升级',
    hint: '将两个相同等级的员工拖拽到一起，合成更高级的员工！',
  },
  START_WORK: {
    title: '开始工作',
    hint: '点击"工作"按钮，开始赚取灵石！',
  },
  CHECK_KPI: {
    title: '查看KPI',
    hint: '打开KPI面板，查看你的绩效目标！',
  },
  FIRST_PROMOTION: {
    title: '首次晋升',
    hint: '前往晋升页面，尝试渡劫晋升！',
  },
  NONE: {
    title: '教程完成',
    hint: '恭喜！你已经掌握了基本操作，继续探索吧！',
  },
};

@ccclass('TutorialOverlay')
export class TutorialOverlayComponent extends Component {
  // ── Scene-bound properties ────────────────────────────────────────────────

  /** Overlay root (toggle visibility) */
  @property(resolveCocosType('Node'))
  public overlayNode?: NodeLike;

  /** Step title label */
  @property(resolveCocosType('Label'))
  public titleLabel?: TextLike;

  /** Step hint label */
  @property(resolveCocosType('Label'))
  public hintLabel?: TextLike;

  /** Progress label (e.g. "2/6") */
  @property(resolveCocosType('Label'))
  public progressLabel?: TextLike;

  /** Advance / confirm button */
  @property(resolveCocosType('Button'))
  public advanceButton?: ButtonLike;

  /** Skip button */
  @property(resolveCocosType('Button'))
  public skipButton?: ButtonLike;

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private viewModel: TutorialViewModel | null = null;
  private disposed = false;
  private unsub: (() => void) | null = null;

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('TutorialOverlayComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;

    // Bind buttons
    this.advanceButton?.on?.('click', this.onAdvance, this);
    this.skipButton?.on?.('click', this.onSkip, this);

    // Subscribe to tutorial events
    const unsub = this.facade.onUiEvent('TUTORIAL_CHANGED', () => {
      if (!this.disposed) this.refresh();
    });
    this.unsub = unsub;

    // Initial render
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.advanceButton?.off?.('click', this.onAdvance, this);
    this.skipButton?.off?.('click', this.onSkip, this);
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }
    this.facade = null;
  }

  // ── Refresh ───────────────────────────────────────────────────────────────

  public refresh(): void {
    if (!this.facade || this.disposed) return;
    this.viewModel = buildTutorialViewModel(this.facade);
    this.render();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private render(): void {
    if (!this.viewModel) return;
    const vm = this.viewModel;

    // Hide overlay when tutorial is completed
    if (vm.isCompleted) {
      this.hide();
      return;
    }

    this.show();

    // Step info
    const info = STEP_INFO[vm.currentStep] ?? STEP_INFO.NONE;
    if (this.titleLabel) this.titleLabel.string = info.title;
    if (this.hintLabel) this.hintLabel.string = info.hint;

    // Progress
    if (this.progressLabel) {
      this.progressLabel.string = `${vm.stepIndex + 1}/${vm.totalSteps}`;
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  private onAdvance(): void {
    if (!this.facade || this.disposed) return;
    this.facade.advanceTutorial();
    SceneBindingComponent.instance?.showToast('教程步骤完成！', 'SUCCESS');
  }

  private onSkip(): void {
    if (!this.facade || this.disposed) return;
    SceneBindingComponent.instance?.showModal({
      entityId: 'tutorial-skip',
      type: 'CONFIRM',
      payload: { message: '确定跳过新手教程？' },
      dismissible: true,
    });
    // The modal will call back; we also skip directly as a fallback
    this.facade.skipTutorial();
    this.hide();
    SceneBindingComponent.instance?.showToast('已跳过教程', 'INFO');
  }

  // ── Visibility ────────────────────────────────────────────────────────────

  private show(): void {
    if (this.overlayNode) this.overlayNode.active = true;
  }

  private hide(): void {
    if (this.overlayNode) this.overlayNode.active = false;
  }
}