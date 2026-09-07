/**
 * CultivationPanelComponent — WEB V1 cultivation button with cooldown and efficiency.
 *
 * Displays cultivation progress, cooldown status, mind efficiency, and
 * cultivation efficiency. Provides a cultivate button that triggers
 * GameFacade.cultivate() when available.
 *
 * Layout:
 *   ┌─────────────────────────────────────┐
 *   │ 修炼进度: 1200/3000  ██████░░░░ 40% │
 *   │ 道心效率: 90%  修炼效率: 70%        │
 *   │ 道心状态: 正常牛马 80/100           │
 *   │ [ 修 炼 ] (cooldown: 5s)            │
 *   └─────────────────────────────────────┘
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { CultivationViewModel } from './view-models';
import { buildCultivationViewModel } from './view-models';
import type { UiEventCategory } from '../facade/ui-event-types';
import { formatNumber, formatPercent, formatDuration } from './number-formatter';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

// ── Cocos Node Interfaces ────────────────────────────────────────────────────

interface TextLike { string: string; }
interface ButtonLike {
  on?: (event: string, callback: () => void, target?: unknown) => void;
  off?: (event: string, callback: () => void, target?: unknown) => void;
  interactable?: boolean;
}
interface ProgressLike {
  progress?: number;
  fillRange?: number;
}

// ── Refresh categories ───────────────────────────────────────────────────────

const CULTIVATION_REFRESH_CATEGORIES: readonly UiEventCategory[] = [
  'STATE_CHANGED',
  'RESOURCE_CHANGED',
  'BUFF_CHANGED',
];

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('CultivationPanel')
export class CultivationPanelComponent extends Component {
  // ── Scene-bound properties (set in Cocos Editor) ──────────────────────────

  /** Cultivation progress text (e.g., "1200/3000") */
  @property(resolveCocosType('Label'))
  public progressLabel?: TextLike;

  /** Cultivation progress bar (0.0 to 1.0) */
  @property(resolveCocosType('ProgressBar'))
  public progressBar?: ProgressLike;

  /** Mind efficiency text (e.g., "90%") */
  @property(resolveCocosType('Label'))
  public mindEfficiencyLabel?: TextLike;

  /** Cultivation efficiency text (e.g., "70%") */
  @property(resolveCocosType('Label'))
  public cultivationEfficiencyLabel?: TextLike;

  /** Mind status text (e.g., "正常牛马 80/100") */
  @property(resolveCocosType('Label'))
  public mindStatusLabel?: TextLike;

  /** Cooldown text (e.g., "冷却: 5s" or empty when ready) */
  @property(resolveCocosType('Label'))
  public cooldownLabel?: TextLike;

  /** Cultivate button */
  @property(resolveCocosType('Button'))
  public cultivateButton?: ButtonLike;

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private viewModel: CultivationViewModel | null = null;
  private unsubs: Array<() => void> = [];
  private disposed = false;
  private cooldownTimer: number = 0;

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('CultivationPanelComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;

    // Bind cultivate button
    this.cultivateButton?.on?.('click', this.onCultivate, this);

    // Subscribe to UI events for re-render
    this.subscribeEvents();

    // Initial render
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    this.cultivateButton?.off?.('click', this.onCultivate, this);
    this.facade = null;
    this.viewModel = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Get current view model (for child components / testing). */
  public getViewModel(): CultivationViewModel | null {
    return this.viewModel;
  }

  /** Force refresh from facade state. */
  public refresh(): void {
    if (!this.facade || this.disposed) return;
    this.viewModel = buildCultivationViewModel(this.facade);
    this.render(this.viewModel);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private render(vm: CultivationViewModel): void {
    // Progress
    this.setText(this.progressLabel,
      `${formatNumber(vm.cultivationExp)}/${formatNumber(vm.cultivationRequired)}`);
    this.setProgress(this.progressBar, vm.cultivationProgress);

    // Efficiency
    this.setText(this.mindEfficiencyLabel, `道心: ${formatPercent(vm.mindEfficiency)}`);
    this.setText(this.cultivationEfficiencyLabel, `修炼: ${formatPercent(vm.cultivationEfficiency)}`);

    // Mind status
    this.setText(this.mindStatusLabel, `${vm.mindStatusText}`);

    // Cooldown
    if (vm.cooldownRemaining > 0) {
      this.setText(this.cooldownLabel, `冷却: ${formatDuration(vm.cooldownRemaining)}`);
      this.setButtonInteractable(this.cultivateButton, false);
    } else {
      this.setText(this.cooldownLabel, '');
      this.setButtonInteractable(this.cultivateButton, vm.canCultivate);
    }
  }

  // ── Event Subscription ────────────────────────────────────────────────────

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const category of CULTIVATION_REFRESH_CATEGORIES) {
      const unsub = this.facade.onUiEvent(category, () => {
        if (!this.disposed) this.refresh();
      });
      this.unsubs.push(unsub);
    }
  }

  private unsubscribeEvents(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private readonly onCultivate = (): void => {
    if (!this.facade) return;
    this.facade.cultivate();
    // Re-render immediately after cultivation click
    this.refresh();
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  private setText(label: TextLike | undefined, text: string): void {
    if (label) label.string = text;
  }

  private setProgress(bar: ProgressLike | undefined, value: number): void {
    if (bar) {
      if (bar.progress !== undefined) bar.progress = value;
      if (bar.fillRange !== undefined) bar.fillRange = value;
    }
  }

  private setButtonInteractable(button: ButtonLike | undefined, interactable: boolean): void {
    if (button) button.interactable = interactable;
  }
}