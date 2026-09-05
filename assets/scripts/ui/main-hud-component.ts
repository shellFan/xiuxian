/**
 * MainHudComponent — Phase 5 top-level HUD for 750×1334 portrait layout.
 *
 * Reads MainHUDViewModel from GameFacade via CocosBootstrapComponent.
 * Uses SafeAreaService for safe area insets.
 * Subscribes to facade UI events for re-render on state change.
 *
 * Layout (750×1334 design units):
 *   ┌─────────────────────────────────────┐
 *   │ [SafeArea.top]                      │
 *   │ ┌─ Identity Bar ──────────────────┐ │
 *   │ │ CareerName  Realm  SectName     │ │
 *   │ └─────────────────────────────────┘ │
 *   │ ┌─ Resource Bar ──────────────────┐ │
 *   │ │ 💰salary  ⚡cultivation  🧠mind  │ │
 *   │ └─────────────────────────────────┘ │
 *   │ ┌─ KPI Summary ───────────────────┐ │
 *   │ │ KPI: 2/5  Workers: 8/16         │ │
 *   │ └─────────────────────────────────┘ │
 *   │                                     │
 *   │   [Merge Board / Content Area]      │
 *   │                                     │
 *   │ ┌─ Bottom Bar ────────────────────┐ │
 *   │ │ [Work/Fishing] [Recruit] [Menu] │ │
 *   │ └─────────────────────────────────┘ │
 *   │ [SafeArea.bottom]                   │
 *   └─────────────────────────────────────┘
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { MainHUDViewModel } from './view-models';
import { buildMainHUDViewModel } from './view-models';
import type { SafeAreaService, SafeAreaInsets } from '../services/safe-area-service';
import type { UiEventCategory } from '../facade/ui-event-types';
import { formatNumber, formatProgress } from './number-formatter';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

// ── Cocos Node Interfaces (type-safe without importing Cocos runtime) ───────

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
  position?: { x: number; y: number; z: number };
}
interface TransformLike {
  setContentSize?: (size: { width: number; height: number }) => void;
  width?: number;
  height?: number;
}

// ── Refresh categories that trigger HUD re-render ────────────────────────────

const HUD_REFRESH_CATEGORIES: readonly UiEventCategory[] = [
  'STATE_CHANGED',
  'RESOURCE_CHANGED',
  'WORK_MODE_CHANGED',
  'CAREER_CHANGED',
  'BOARD_CHANGED',
  'BUFF_CHANGED',
];

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('MainHud')
export class MainHudComponent extends Component {
  // ── Scene-bound properties (set in Cocos Editor) ──────────────────────────

  /** Career name label (e.g., "初级打工人") */
  @property(resolveCocosType('Label'))
  public careerNameLabel?: TextLike;

  /** Realm label (e.g., "练气期") */
  @property(resolveCocosType('Label'))
  public realmLabel?: TextLike;

  /** Sect name label (e.g., "天机阁") */
  @property(resolveCocosType('Label'))
  public sectLabel?: TextLike;

  /** Salary amount label */
  @property(resolveCocosType('Label'))
  public salaryLabel?: TextLike;

  /** Cultivation exp label */
  @property(resolveCocosType('Label'))
  public cultivationLabel?: TextLike;

  /** Mind status label (e.g., "正常牛马") */
  @property(resolveCocosType('Label'))
  public mindLabel?: TextLike;

  /** KPI progress label (e.g., "KPI: 2/5") */
  @property(resolveCocosType('Label'))
  public kpiLabel?: TextLike;

  /** Worker count label (e.g., "8/16") */
  @property(resolveCocosType('Label'))
  public workerCountLabel?: TextLike;

  /** Work mode toggle button */
  @property(resolveCocosType('Button'))
  public workModeButton?: ButtonLike;

  /** Office name label */
  @property(resolveCocosType('Label'))
  public officeLabel?: TextLike;

  /** Talent name label */
  @property(resolveCocosType('Label'))
  public talentLabel?: TextLike;

  /** Top safe area spacer node */
  @property(resolveCocosType('Node'))
  public topSpacer?: SceneNodeLike;

  /** Bottom safe area spacer node */
  @property(resolveCocosType('Node'))
  public bottomSpacer?: SceneNodeLike;

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private safeArea: SafeAreaService | null = null;
  private viewModel: MainHUDViewModel | null = null;
  private unsubs: Array<() => void> = [];
  private disposed = false;

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('MainHudComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;
    this.safeArea = bootstrap.safeAreaService;

    // Apply safe area insets
    this.applySafeArea();

    // Bind work mode toggle
    this.workModeButton?.on?.('click', this.onWorkModeToggle, this);

    // Subscribe to UI events for re-render
    this.subscribeEvents();

    // Initial render
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    this.workModeButton?.off?.('click', this.onWorkModeToggle, this);
    this.facade = null;
    this.safeArea = null;
    this.viewModel = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Get current view model (for child components / testing). */
  public getViewModel(): MainHUDViewModel | null {
    return this.viewModel;
  }

  /** Force refresh from facade state. */
  public refresh(): void {
    if (!this.facade || this.disposed) return;
    this.viewModel = buildMainHUDViewModel(this.facade);
    this.render(this.viewModel);
  }

  // ── Safe Area ─────────────────────────────────────────────────────────────

  /** Apply safe area insets to spacer nodes. */
  public applySafeArea(): void {
    if (!this.safeArea) return;
    const insets = this.safeArea.getSafeArea();

    // Top spacer: push content below status bar / capsule
    if (this.topSpacer) {
      this.topSpacer.setPosition?.({ x: 0, y: -insets.top, z: 0 });
    }

    // Bottom spacer: push content above home indicator
    if (this.bottomSpacer) {
      this.bottomSpacer.setPosition?.({ x: 0, y: insets.bottom, z: 0 });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private render(vm: MainHUDViewModel): void {
    // Identity bar
    this.setText(this.careerNameLabel, vm.careerName);
    this.setText(this.realmLabel, vm.realm);
    this.setText(this.sectLabel, vm.sectName);

    // Resource bar
    this.setText(this.salaryLabel, formatNumber(vm.salary));
    this.setText(this.cultivationLabel, `${formatNumber(vm.cultivationExp)}/${formatNumber(vm.cultivationRequired)}`);
    this.setText(this.mindLabel, `${vm.mindStatusText} ${vm.mind}/${vm.maxMind}`);

    // KPI summary
    this.setText(this.kpiLabel, `KPI: ${formatProgress(vm.kpiCompleted, vm.kpiTotal)}${vm.kpiAllCompleted ? ' ✓' : ''}`);

    // Worker count
    this.setText(this.workerCountLabel, `牛马: ${formatProgress(vm.workerCount, vm.boardCapacity)}`);

    // Office & talent
    this.setText(this.officeLabel, vm.officeName);
    this.setText(this.talentLabel, vm.talentName);

    // Work mode button text
    if (this.workModeButton) {
      // Button text is set via child Label component — handled by child component
    }
  }

  // ── Event Subscription ────────────────────────────────────────────────────

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const category of HUD_REFRESH_CATEGORIES) {
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

  private readonly onWorkModeToggle = (): void => {
    if (!this.facade) return;
    this.facade.toggleWorkMode();
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  private setText(label: TextLike | undefined, text: string): void {
    if (label) label.string = text;
  }
}