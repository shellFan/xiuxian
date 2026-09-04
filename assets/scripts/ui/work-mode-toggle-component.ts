/**
 * WorkModeToggleComponent — Phase 5 work/fishing mode toggle.
 *
 * Toggles between WORK and FISHING modes via GameFacade.
 * Displays current mode and responds to state changes.
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { WorkMode } from '../model/save-data';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

interface TextLike { string: string; }
interface ButtonLike {
  on?: (event: string, callback: () => void, target?: unknown) => void;
  off?: (event: string, callback: () => void, target?: unknown) => void;
}

const WORK_LABEL = '认真上班';
const FISHING_LABEL = '带薪摸鱼';

@ccclass('WorkModeToggle')
export class WorkModeToggleComponent extends Component {
  @property(resolveCocosType('Label'))
  public modeLabel?: TextLike;

  @property(resolveCocosType('Button'))
  public toggleButton?: ButtonLike;

  private facade: GameFacade | null = null;
  private currentMode: WorkMode = 'WORK';
  private unsubs: Array<() => void> = [];
  private disposed = false;

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('WorkModeToggleComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;

    // Read initial mode from snapshot
    this.currentMode = this.facade.snapshot().workMode;
    this.render();

    // Bind toggle button
    this.toggleButton?.on?.('click', this.onToggle, this);

    // Subscribe to work mode changes
    const unsub = this.facade.onUiEvent('WORK_MODE_CHANGED', () => {
      if (!this.disposed && this.facade) {
        this.currentMode = this.facade.snapshot().workMode;
        this.render();
      }
    });
    this.unsubs.push(unsub);
  }

  protected onDestroy(): void {
    this.disposed = true;
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
    this.toggleButton?.off?.('click', this.onToggle, this);
    this.facade = null;
  }

  /** Get current work mode. */
  public getMode(): WorkMode {
    return this.currentMode;
  }

  /** Programmatically toggle the mode. */
  public toggle(): void {
    if (!this.facade) return;
    const newMode: WorkMode = this.currentMode === 'WORK' ? 'FISHING' : 'WORK';
    this.facade.changeWorkMode(newMode);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private readonly onToggle = (): void => {
    this.toggle();
  };

  private render(): void {
    if (this.modeLabel) {
      this.modeLabel.string = this.currentMode === 'WORK' ? WORK_LABEL : FISHING_LABEL;
    }
  }
}