/**
 * TutorialOverlayComponent — Phase 5 tutorial highlight/pointer/mask overlay.
 *
 * Renders a semi-transparent mask with a "hole" cutout highlighting the
 * target node for the current tutorial step. Shows a pointer arrow and
 * instruction text. Supports "Next" and "Skip" actions.
 *
 * 6-step tutorial flow:
 *   1. FIRST_RECRUIT  → highlight recruit button
 *   2. SECOND_RECRUIT → highlight recruit button again
 *   3. FIRST_MERGE    → highlight merge board cell
 *   4. START_WORK     → highlight work mode toggle
 *   5. CHECK_KPI      → highlight KPI panel
 *   6. FIRST_PROMOTION → highlight promote button
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { SceneBindingComponent } from './scene-binding-component';
import type { GameFacade } from '../facade/game-facade';
import type { TutorialStep } from '../services/tutorial-service';
import type { UiEventCategory } from '../facade/ui-event-types';

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

// ── Step configuration ──────────────────────────────────────────────────────

interface TutorialStepConfig {
  readonly targetNodeName: string;
  readonly instruction: string;
  readonly pointerDirection: 'up' | 'down' | 'left' | 'right';
}

const STEP_CONFIGS: Record<TutorialStep, TutorialStepConfig> = {
  FIRST_RECRUIT: {
    targetNodeName: 'RecruitButton',
    instruction: '点击招募按钮，雇佣你的第一个牛马！',
    pointerDirection: 'down',
  },
  SECOND_RECRUIT: {
    targetNodeName: 'RecruitButton',
    instruction: '再招募一个牛马，准备合成！',
    pointerDirection: 'down',
  },
  FIRST_MERGE: {
    targetNodeName: 'MergeBoard',
    instruction: '拖拽一个牛马到另一个相同等级的牛马上，完成合成！',
    pointerDirection: 'up',
  },
  START_WORK: {
    targetNodeName: 'WorkModeButton',
    instruction: '点击切换到认真上班模式！',
    pointerDirection: 'down',
  },
  CHECK_KPI: {
    targetNodeName: 'KpiPanel',
    instruction: '查看你的KPI进度，了解晋升条件！',
    pointerDirection: 'up',
  },
  FIRST_PROMOTION: {
    targetNodeName: 'PromoteButton',
    instruction: 'KPI已达标，尝试渡劫晋升！',
    pointerDirection: 'down',
  },
};

// ── Refresh categories ──────────────────────────────────────────────────────

const TUTORIAL_REFRESH_CATEGORIES: readonly UiEventCategory[] = [
  'TUTORIAL_CHANGED',
  'STATE_CHANGED',
];

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('TutorialOverlay')
export class TutorialOverlayComponent extends Component {
  // ── Scene-bound properties ────────────────────────────────────────────────

  /** The mask overlay node (full-screen semi-transparent) */
  @property(resolveCocosType('Node'))
  public maskNode?: SceneNodeLike;

  /** The highlight cutout node (positioned over target) */
  @property(resolveCocosType('Node'))
  public highlightNode?: SceneNodeLike;

  /** Instruction text label */
  @property(resolveCocosType('Label'))
  public instructionLabel?: TextLike;

  /** Step indicator label (e.g., "3/6") */
  @property(resolveCocosType('Label'))
  public stepLabel?: TextLike;

  /** Next button */
  @property(resolveCocosType('Button'))
  public nextButton?: ButtonLike;

  /** Skip button */
  @property(resolveCocosType('Button'))
  public skipButton?: ButtonLike;

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private currentStep: TutorialStep | 'NONE' = 'NONE';
  private stepIndex = -1;
  private totalSteps = 6;
  private unsubs: Array<() => void> = [];
  private disposed = false;

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const binding = SceneBindingComponent.instance;
    if (!binding) {
      throw new Error('TutorialOverlayComponent requires SceneBindingComponent');
    }
    this.facade = binding.getFacade();

    // Bind buttons
    this.nextButton?.on?.('click', this.onNext, this);
    this.skipButton?.on?.('click', this.onSkip, this);

    // Subscribe to tutorial events
    this.subscribeEvents();

    // Initial render
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
    this.nextButton?.off?.('click', this.onNext, this);
    this.skipButton?.off?.('click', this.onSkip, this);
    this.facade = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Get current tutorial step. */
  public getCurrentStep(): TutorialStep | 'NONE' {
    return this.currentStep;
  }

  /** Force refresh from facade state. */
  public refresh(): void {
    if (!this.facade || this.disposed) return;
    const tutorial = this.facade.queryTutorial();
    this.currentStep = tutorial.currentStep;
    this.stepIndex = tutorial.stepIndex;
    this.totalSteps = tutorial.steps.length;

    if (tutorial.isCompleted || this.currentStep === 'NONE') {
      this.hideOverlay();
      return;
    }

    this.renderStep(this.currentStep);
    this.showOverlay();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private renderStep(step: TutorialStep): void {
    const config = STEP_CONFIGS[step];
    if (!config) {
      this.hideOverlay();
      return;
    }

    // Update instruction text
    this.setText(this.instructionLabel, config.instruction);

    // Update step indicator
    this.setText(this.stepLabel, `${this.stepIndex + 1}/${this.totalSteps}`);

    // Position highlight over target node
    this.positionHighlight(config.targetNodeName);
  }

  private positionHighlight(targetNodeName: string): void {
    // Find the target node in the scene hierarchy
    const targetNode = this.findNodeByName(targetNodeName);
    if (targetNode && this.highlightNode) {
      // Position highlight over the target
      const pos = (targetNode as any).position;
      if (pos) {
        this.highlightNode.setPosition?.({ x: pos.x, y: pos.y, z: 0 });
      }
      this.highlightNode.active = true;
    } else if (this.highlightNode) {
      // Target not found — center the highlight
      this.highlightNode.setPosition?.({ x: 375, y: 667, z: 0 });
      this.highlightNode.active = true;
    }
  }

  // ── Event Subscription ────────────────────────────────────────────────────

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const category of TUTORIAL_REFRESH_CATEGORIES) {
      const unsub = this.facade.onUiEvent(category, () => {
        if (!this.disposed) this.refresh();
      });
      this.unsubs.push(unsub);
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private readonly onNext = (): void => {
    if (!this.facade) return;
    this.facade.advanceTutorial();
  };

  private readonly onSkip = (): void => {
    if (!this.facade) return;
    this.facade.skipTutorial();
  };

  // ── Overlay Visibility ────────────────────────────────────────────────────

  private showOverlay(): void {
    if (this.maskNode) this.maskNode.active = true;
    this.node && ((this.node as any).active = true);
  }

  private hideOverlay(): void {
    if (this.maskNode) this.maskNode.active = false;
    if (this.highlightNode) this.highlightNode.active = false;
    this.node && ((this.node as any).active = false);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private findNodeByName(name: string): SceneNodeLike | null {
    // Walk up to scene root and search
    let current: SceneNodeLike | undefined = this.node as any;
    while ((current as any)?.parent) {
      current = (current as any).parent;
    }
    return this.findInChildren(current, name);
  }

  private findInChildren(node: SceneNodeLike | undefined, name: string): SceneNodeLike | null {
    if (!node) return null;
    if (node.name === name) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = this.findInChildren(child, name);
        if (found) return found;
      }
    }
    return null;
  }

  private setText(label: TextLike | undefined, text: string): void {
    if (label) label.string = text;
  }
}