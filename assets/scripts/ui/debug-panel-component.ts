/**
 * DebugPanelComponent — WEB V1 developer panel.
 *
 * Provides time acceleration, save management, and state reset
 * for development and testing purposes.
 *
 * Toggle with a debug button or keyboard shortcut.
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import { SceneBindingComponent } from './scene-binding-component';
import type { GameFacade } from '../facade/game-facade';

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

// ── Time scale options ───────────────────────────────────────────────────────

const TIME_SCALES = [1, 2, 5, 10, 50] as const;

@ccclass('DebugPanel')
export class DebugPanelComponent extends Component {
  // ── Scene-bound properties ────────────────────────────────────────────────

  /** Debug panel container (toggle visibility) */
  @property(resolveCocosType('Node'))
  public panelNode?: NodeLike;

  /** Time scale label */
  @property(resolveCocosType('Label'))
  public timeScaleLabel?: TextLike;

  /** Game state summary label */
  @property(resolveCocosType('Label'))
  public stateLabel?: TextLike;

  /** Toggle button */
  @property(resolveCocosType('Button'))
  public toggleButton?: ButtonLike;

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private timeScaleIndex = 0;
  private isVisible = false;
  private disposed = false;

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('DebugPanelComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;

    // Bind toggle button
    this.toggleButton?.on?.('click', this.togglePanel, this);

    // Initially hidden
    this.hidePanel();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.toggleButton?.off?.('click', this.togglePanel, this);
    this.facade = null;
  }

  protected update(_dt: number): void {
    if (!this.isVisible || !this.facade || this.disposed) return;
    this.updateStateLabel();
  }

  // ── Toggle ────────────────────────────────────────────────────────────────

  public togglePanel(): void {
    this.isVisible = !this.isVisible;
    if (this.isVisible) {
      this.showPanel();
    } else {
      this.hidePanel();
    }
  }

  private showPanel(): void {
    if (this.panelNode) this.panelNode.active = true;
    this.isVisible = true;
    this.updateTimeScaleLabel();
    this.updateStateLabel();
  }

  private hidePanel(): void {
    if (this.panelNode) this.panelNode.active = false;
    this.isVisible = false;
  }

  // ── Time Scale ────────────────────────────────────────────────────────────

  public cycleTimeScale(): void {
    this.timeScaleIndex = (this.timeScaleIndex + 1) % TIME_SCALES.length;
    this.updateTimeScaleLabel();
    // Note: actual time scaling would require GameLoopService integration
    SceneBindingComponent.instance?.showToast(
      `时间倍率: ${TIME_SCALES[this.timeScaleIndex]}x`, 'INFO',
    );
  }

  private updateTimeScaleLabel(): void {
    if (this.timeScaleLabel) {
      this.timeScaleLabel.string = `时间: ${TIME_SCALES[this.timeScaleIndex]}x`;
    }
  }

  // ── State Display ─────────────────────────────────────────────────────────

  private updateStateLabel(): void {
    if (!this.stateLabel || !this.facade) return;
    const snap = this.facade.snapshot();
    this.stateLabel.string = [
      `境界: Lv.${snap.careerLevel}`,
      `灵石: ${snap.salary}`,
      `修为: ${snap.cultivationExp}`,
      `道心: ${snap.mind}/${snap.maxMind}`,
      `绩效: ${snap.performance}`,
      `模式: ${snap.isFishingMode ? '摸鱼' : '工作'}`,
    ].join('\n');
  }

  // ── Debug Actions ─────────────────────────────────────────────────────────

  /** Force save the game. */
  public debugSave(): void {
    if (!this.facade || this.disposed) return;
    this.facade.save();
    SceneBindingComponent.instance?.showToast('已保存', 'SUCCESS');
  }

  /** Clear save data. */
  public debugClearSave(): void {
    if (!this.facade || this.disposed) return;
    SceneBindingComponent.instance?.showModal({
      entityId: 'debug-clear-save',
      type: 'CONFIRM',
      payload: { message: '[DEBUG] 确定清除存档？' },
      dismissible: true,
    });
  }

  /** Advance tutorial step. */
  public debugAdvanceTutorial(): void {
    if (!this.facade || this.disposed) return;
    this.facade.advanceTutorial();
    SceneBindingComponent.instance?.showToast('教程步骤已推进', 'INFO');
  }
}