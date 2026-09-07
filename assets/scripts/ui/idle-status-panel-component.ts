/**
 * IdleStatusPanelComponent — WEB V1 idle efficiency display.
 *
 * Shows the current work/fishing mode with efficiency breakdown:
 * - Mode indicator (认真上班 / 带薪摸鱼)
 * - Salary efficiency, performance efficiency, mind recovery efficiency
 * - Cultivation efficiency
 * - Work income stopped warning
 * - Overall efficiency score
 *
 * Provides a toggle button to switch between WORK and FISHING modes.
 *
 * Layout:
 *   ┌─────────────────────────────────────┐
 *   │ [认真上班] ← toggle                  │
 *   │ 工资效率: ×1.3  绩效效率: ×1.2      │
 *   │ 道心恢复: ×0.5  修炼效率: ×0.7      │
 *   │ 综合效率: 85%                        │
 *   │ ⚠ 工资收入已停止                     │
 *   └─────────────────────────────────────┘
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { IdleViewModel } from './view-models';
import { buildIdleViewModel } from './view-models';
import type { WorkMode } from '../model/save-data';
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

interface TextLike { string: string; }
interface ButtonLike {
  on?: (event: string, callback: () => void, target?: unknown) => void;
  off?: (event: string, callback: () => void, target?: unknown) => void;
  interactable?: boolean;
}
interface NodeLike {
  active?: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const WORK_LABEL = '认真上班';
const FISHING_LABEL = '带薪摸鱼';
const WORK_ICON = '💼';
const FISHING_ICON = '🐟';

// ── Refresh categories ───────────────────────────────────────────────────────

const IDLE_REFRESH_CATEGORIES: readonly UiEventCategory[] = [
  'STATE_CHANGED',
  'WORK_MODE_CHANGED',
  'RESOURCE_CHANGED',
  'BUFF_CHANGED',
];

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('IdleStatusPanel')
export class IdleStatusPanelComponent extends Component {
  // ── Scene-bound properties (set in Cocos Editor) ──────────────────────────

  /** Mode label (e.g., "认真上班" or "带薪摸鱼") */
  @property(resolveCocosType('Label'))
  public modeLabel?: TextLike;

  /** Mode icon label */
  @property(resolveCocosType('Label'))
  public modeIconLabel?: TextLike;

  /** Toggle button to switch work/fishing mode */
  @property(resolveCocosType('Button'))
  public toggleButton?: ButtonLike;

  /** Salary efficiency label (e.g., "工资效率: ×1.3") */
  @property(resolveCocosType('Label'))
  public salaryEfficiencyLabel?: TextLike;

  /** Performance efficiency label */
  @property(resolveCocosType('Label'))
  public performanceEfficiencyLabel?: TextLike;

  /** Mind recovery efficiency label */
  @property(resolveCocosType('Label'))
  public mindRecoveryLabel?: TextLike;

  /** Cultivation efficiency label */
  @property(resolveCocosType('Label'))
  public cultivationEfficiencyLabel?: TextLike;

  /** Overall efficiency label */
  @property(resolveCocosType('Label'))
  public overallEfficiencyLabel?: TextLike;

  /** Mind status text (e.g., "精神饱满") */
  @property(resolveCocosType('Label'))
  public mindStatusLabel?: TextLike;

  /** Warning node for work income stopped */
  @property(resolveCocosType('Node'))
  public incomeStoppedWarning?: NodeLike;

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private viewModel: IdleViewModel | null = null;
  private unsubs: Array<() => void> = [];
  private disposed = false;

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('IdleStatusPanelComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;

    // Bind toggle button
    this.toggleButton?.on?.('click', this.onToggle, this);

    // Subscribe to UI events for re-render
    this.subscribeEvents();

    // Initial render
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    this.toggleButton?.off?.('click', this.onToggle, this);
    this.facade = null;
    this.viewModel = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Get current view model (for child components / testing). */
  public getViewModel(): IdleViewModel | null {
    return this.viewModel;
  }

  /** Force refresh from facade state. */
  public refresh(): void {
    if (!this.facade || this.disposed) return;
    this.viewModel = buildIdleViewModel(this.facade);
    this.render(this.viewModel);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private render(vm: IdleViewModel): void {
    // Mode indicator
    const isWork = vm.workMode === 'WORK';
    this.setText(this.modeLabel, isWork ? WORK_LABEL : FISHING_LABEL);
    this.setText(this.modeIconLabel, isWork ? WORK_ICON : FISHING_ICON);

    // Efficiency breakdown
    this.setText(this.salaryEfficiencyLabel, `工资: ×${vm.salaryEfficiency.toFixed(1)}`);
    this.setText(this.performanceEfficiencyLabel, `绩效: ×${vm.performanceEfficiency.toFixed(1)}`);
    this.setText(this.mindRecoveryLabel, `道心恢复: ×${vm.mindRecoveryEfficiency.toFixed(1)}`);
    this.setText(this.cultivationEfficiencyLabel, `修炼: ×${vm.cultivationEfficiency.toFixed(1)}`);

    // Overall efficiency
    this.setText(this.overallEfficiencyLabel, `综合效率: ${formatPercent(vm.overallEfficiency)}`);

    // Mind status
    this.setText(this.mindStatusLabel, vm.mindStatusText);

    // Work income stopped warning
    if (this.incomeStoppedWarning) {
      this.incomeStoppedWarning.active = vm.isWorkIncomeStopped;
    }
  }

  // ── Event Subscription ────────────────────────────────────────────────────

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const category of IDLE_REFRESH_CATEGORIES) {
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

  private readonly onToggle = (): void => {
    if (!this.facade) return;
    this.facade.toggleWorkMode();
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  private setText(label: TextLike | undefined, text: string): void {
    if (label) label.string = text;
  }
}