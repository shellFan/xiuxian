/**
 * PromotionPageComponent — WEB V1 career promotion page.
 *
 * Shows current career level, promotion eligibility, probability,
 * and allows the player to attempt promotion (渡劫).
 *
 * Layout (750×1334 design):
 *   ┌─────────────────────────────────────┐
 *   │ 渡劫晋升                             │
 *   │ ┌─ Current Status ────────────────┐ │
 *   │ │ 当前境界: 练气期                  │ │
 *   │ │ 晋升概率: 45%                    │ │
 *   │ └─────────────────────────────────┘ │
 *   │ ┌─ Promotion Options ─────────────┐ │
 *   │ │ [普通渡劫] [天劫渡劫]            │ │
 *   │ └─────────────────────────────────┘ │
 *   │ 不可晋升原因: 修为不足              │
 *   └─────────────────────────────────────┘
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import { SceneBindingComponent } from './scene-binding-component';
import type { GameFacade } from '../facade/game-facade';
import type { PromotionViewModel } from './view-models';
import { buildPromotionViewModel } from './view-models';
import type { UiEventCategory } from '../facade/ui-event-types';
import { formatPercent } from './number-formatter';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

// ── Cocos Node Interfaces ────────────────────────────────────────────────────

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

// ── Refresh categories ───────────────────────────────────────────────────────

const PROMOTION_REFRESH_CATEGORIES: readonly UiEventCategory[] = [
  'STATE_CHANGED',
  'CAREER_CHANGED',
  'RESOURCE_CHANGED',
  'BUFF_CHANGED',
];

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('PromotionPage')
export class PromotionPageComponent extends Component {
  // ── Scene-bound properties ────────────────────────────────────────────────

  /** Title label */
  @property(resolveCocosType('Label'))
  public titleLabel?: TextLike;

  /** Current career level label */
  @property(resolveCocosType('Label'))
  public careerLabel?: TextLike;

  /** Promotion probability label */
  @property(resolveCocosType('Label'))
  public probabilityLabel?: TextLike;

  /** Reason label (shown when promotion not allowed) */
  @property(resolveCocosType('Label'))
  public reasonLabel?: TextLike;

  /** Retry hint label */
  @property(resolveCocosType('Label'))
  public retryLabel?: TextLike;

  /** Container for promotion option buttons */
  @property(resolveCocosType('Node'))
  public optionsContainer?: NodeLike;

  /** Empty state label */
  @property(resolveCocosType('Label'))
  public emptyLabel?: TextLike;

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private viewModel: PromotionViewModel | null = null;
  private unsubs: Array<() => void> = [];
  private disposed = false;

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('PromotionPageComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;
    this.subscribeEvents();
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    this.facade = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  public refresh(): void {
    if (!this.facade || this.disposed) return;
    this.viewModel = buildPromotionViewModel(this.facade);
    this.render(this.viewModel);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private render(vm: PromotionViewModel): void {
    // Title
    if (this.titleLabel) {
      this.titleLabel.string = '渡劫晋升';
    }

    // Career level — read from snapshot
    if (this.careerLabel) {
      const snap = this.facade!.snapshot();
      this.careerLabel.string = `当前境界: Lv.${snap.careerLevel}`;
    }

    // Probability
    if (this.probabilityLabel) {
      if (vm.allowed) {
        this.probabilityLabel.string = `晋升概率: ${formatPercent(vm.probability)}`;
      } else {
        this.probabilityLabel.string = '晋升概率: --';
      }
    }

    // Reason (shown when not allowed)
    if (this.reasonLabel) {
      this.reasonLabel.active = !vm.allowed;
      if (!vm.allowed) {
        this.reasonLabel.string = `不可晋升: ${vm.reason}`;
      }
    }

    // Retry hint
    if (this.retryLabel) {
      this.retryLabel.active = vm.needsRetry;
      if (vm.needsRetry) {
        this.retryLabel.string = '上次渡劫失败，可重试';
      }
    }

    // Empty state
    if (this.emptyLabel) {
      this.emptyLabel.active = vm.options.length === 0;
      if (vm.options.length === 0) {
        this.emptyLabel.string = '暂无可用晋升途径';
      }
    }

    // Render promotion options
    this.renderOptions(vm);
  }

  private renderOptions(vm: PromotionViewModel): void {
    if (!this.optionsContainer) return;

    for (let i = 0; i < vm.options.length && i < 5; i++) {
      const option = vm.options[i];
      const nodeName = `PromotionOption_${i}`;
      const node = this.optionsContainer.getChildByName?.(nodeName);
      if (node) {
        node.active = true;

        const nameLabel = this.findLabel(node, 'NameLabel');
        if (nameLabel) nameLabel.string = option.name;

        const descLabel = this.findLabel(node, 'DescLabel');
        if (descLabel) descLabel.string = option.description;

        const button = this.findButton(node, 'PromoteButton');
        if (button) {
          button.interactable = vm.allowed;
          // Bind click handler
          button.on?.('click', () => this.promote(option.id), this);
        }
      }
    }

    // Hide unused slots
    for (let i = vm.options.length; i < 5; i++) {
      const nodeName = `PromotionOption_${i}`;
      const node = this.optionsContainer.getChildByName?.(nodeName);
      if (node) node.active = false;
    }
  }

  // ── User Actions ──────────────────────────────────────────────────────────

  /** Attempt promotion with a specific option. */
  public promote(optionId: string): void {
    if (!this.facade || this.disposed) return;

    const result = this.facade.promote(optionId);
    if (result.success) {
      SceneBindingComponent.instance?.showToast(
        `渡劫成功！晋升至 Lv.${result.newLevel}`, 'SUCCESS',
      );
    } else {
      SceneBindingComponent.instance?.showToast(
        result.reason ?? '渡劫失败', 'WARNING',
      );
    }

    this.refresh();
  }

  // ── Event Subscription ────────────────────────────────────────────────────

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const category of PROMOTION_REFRESH_CATEGORIES) {
      const unsub = this.facade.onUiEvent(category, () => {
        if (!this.disposed && this.facade) this.refresh();
      });
      this.unsubs.push(unsub);
    }
  }

  private unsubscribeEvents(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }

  // ── Node Helpers ──────────────────────────────────────────────────────────

  private findLabel(parent: NodeLike, childName: string): TextLike | null {
    const child = parent.getChildByName?.(childName);
    if (!child) return null;
    const comp = child.getComponent?.(resolveCocosType('Label'));
    return (comp as unknown as TextLike) ?? null;
  }

  private findButton(parent: NodeLike, childName: string): ButtonLike | null {
    const child = parent.getChildByName?.(childName);
    if (!child) return null;
    const comp = child.getComponent?.(resolveCocosType('Button'));
    return (comp as unknown as ButtonLike) ?? null;
  }
}