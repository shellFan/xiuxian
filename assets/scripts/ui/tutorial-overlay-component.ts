/**
 * TutorialOverlayComponent — non-blocking first-day guidance.
 *
 * Shows five short hints. The overlay never acts as a command precondition;
 * gameplay remains available while a hint is visible.
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
import type { ActiveTutorialStep } from '../services/tutorial-service';

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

const STEP_INFO: Record<ActiveTutorialStep | 'NONE', { title: string; hint: string }> = {
  WELCOME: {
    title: '欢迎入职修仙公司',
    hint: '先随便逛逛：上班、摸鱼、修炼和任务都能直接点，引导不会挡住任何操作。',
  },
  FIRST_WORK: {
    title: '先上会儿班',
    hint: '试试“上班”，工资与绩效会随工作推进。',
  },
  FIRST_FISH: {
    title: '也可以摸鱼',
    hint: '切到“摸鱼”喘口气；你随时可以选择其他行动。',
  },
  FIRST_CULTIVATE: {
    title: '职场也能修仙',
    hint: '尝试一次修炼，积累修为并照顾好道心。',
  },
  FIRST_TASK: {
    title: '接个任务试试',
    hint: '打开任务并选择一项开始；不想做也可以继续探索。',
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
    const info = STEP_INFO[vm.currentStep as ActiveTutorialStep | 'NONE'] ?? STEP_INFO.NONE;
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
