/**
 * SettingsPageComponent — PC V1 settings (设置) page.
 *
 * Provides: BGM toggle, SFX toggle, volume sliders,
 * fullscreen toggle, window mode, quit button.
 * Also shows game version and Electron info.
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { UiEventCategory } from '../facade/ui-event-types';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

interface TextLike { string: string; active?: boolean; }
interface ButtonLike { on?: (event: string, callback: () => void, target?: unknown) => void; off?: (event: string, callback: () => void, target?: unknown) => void; interactable?: boolean; }
interface ToggleLike { isChecked?: boolean; checkEvents?: Array<{ emit: () => void }>; }
interface SliderLike { progress?: number; }

const SETTINGS_REFRESH_CATEGORIES: readonly UiEventCategory[] = ['SETTINGS_CHANGED'];

@ccclass('SettingsPage')
export class SettingsPageComponent extends Component {
  /** Title label */
  @property(resolveCocosType('Label'))
  public titleLabel?: TextLike;

  /** BGM toggle */
  @property(resolveCocosType('Toggle'))
  public bgmToggle?: ToggleLike;

  /** SFX toggle */
  @property(resolveCocosType('Toggle'))
  public sfxToggle?: ToggleLike;

  /** BGM volume slider */
  @property(resolveCocosType('Slider'))
  public bgmVolumeSlider?: SliderLike;

  /** SFX volume slider */
  @property(resolveCocosType('Slider'))
  public sfxVolumeSlider?: SliderLike;

  /** Fullscreen toggle */
  @property(resolveCocosType('Toggle'))
  public fullscreenToggle?: ToggleLike;

  /** BGM status label */
  @property(resolveCocosType('Label'))
  public bgmStatusLabel?: TextLike;

  /** SFX status label */
  @property(resolveCocosType('Label'))
  public sfxStatusLabel?: TextLike;

  /** Version label */
  @property(resolveCocosType('Label'))
  public versionLabel?: TextLike;

  /** Save game button */
  @property(resolveCocosType('Button'))
  public saveButton?: ButtonLike;

  /** Quit game button */
  @property(resolveCocosType('Button'))
  public quitButton?: ButtonLike;

  private facade: GameFacade | null = null;
  private unsubs: Array<() => void> = [];
  private disposed = false;

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) throw new Error('SettingsPageComponent requires facade');
    this.facade = bootstrap.facade;
    this.subscribeEvents();
    this.bindButtons();
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    this.facade = null;
  }

  public refresh(): void {
    if (!this.facade || this.disposed) return;

    // BGM/SFX status
    const audioService = CocosBootstrapComponent.instance?.audioService;
    if (this.bgmStatusLabel) {
      this.bgmStatusLabel.string = audioService ? 'BGM: 开' : 'BGM: 关';
    }
    if (this.sfxStatusLabel) {
      this.sfxStatusLabel.string = 'SFX: 开';
    }

    // Fullscreen status
    if (typeof window !== 'undefined' && (window as unknown as { electronAPI?: { isFullscreen: () => Promise<boolean> } }).electronAPI?.isFullscreen) {
      (window as unknown as { electronAPI: { isFullscreen: () => Promise<boolean> } }).electronAPI.isFullscreen().then((fs: boolean) => {
        if (this.fullscreenToggle && !this.disposed) {
          this.fullscreenToggle.isChecked = fs;
        }
      });
    }

    // Version
    if (this.versionLabel) {
      if (typeof window !== 'undefined' && (window as unknown as { electronAPI?: { getVersion: () => Promise<string> } }).electronAPI?.getVersion) {
        (window as unknown as { electronAPI: { getVersion: () => Promise<string> } }).electronAPI.getVersion().then((v: string) => {
          if (this.versionLabel && !this.disposed) {
            this.versionLabel.string = `版本: ${v}`;
          }
        });
      } else {
        this.versionLabel.string = '版本: 1.0.0-web';
      }
    }
  }

  private bindButtons(): void {
    // BGM toggle
    this.bgmToggle?.checkEvents?.[0]?.emit();

    // Save button
    this.saveButton?.on?.('click', () => {
      this.facade?.save();
    }, this);

    // Quit button
    this.quitButton?.on?.('click', () => {
      // Save before quit
      this.facade?.save();
      // Try Electron close, fallback to web close
      if (typeof window !== 'undefined' && (window as unknown as { electronAPI?: { close: () => Promise<void> } }).electronAPI?.close) {
        (window as unknown as { electronAPI: { close: () => Promise<void> } }).electronAPI.close();
      } else if (typeof window !== 'undefined') {
        window.close();
      }
    }, this);

    // Fullscreen toggle
    this.fullscreenToggle?.checkEvents?.[0]?.emit();
  }

  /** Toggle fullscreen via Electron API */
  public async toggleFullscreen(flag: boolean): Promise<void> {
    if (typeof window !== 'undefined' && (window as unknown as { electronAPI?: { setFullscreen: (f: boolean) => Promise<void> } }).electronAPI?.setFullscreen) {
      await (window as unknown as { electronAPI: { setFullscreen: (f: boolean) => Promise<void> } }).electronAPI.setFullscreen(flag);
    }
  }

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const cat of SETTINGS_REFRESH_CATEGORIES) {
      this.unsubs.push(this.facade.onUiEvent(cat, () => { if (!this.disposed) this.refresh(); }));
    }
  }

  private unsubscribeEvents(): void {
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
  }
}