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
interface ToggleLike {
  isChecked?: boolean;
  checkEvents?: Array<{ emit: () => void }>;
  on?: (event: string, callback: (toggle?: unknown) => void, target?: unknown) => void;
  off?: (event: string, callback: (toggle?: unknown) => void, target?: unknown) => void;
}
interface SliderLike {
  progress?: number;
  on?: (event: string, callback: (slider?: unknown) => void, target?: unknown) => void;
  off?: (event: string, callback: (slider?: unknown) => void, target?: unknown) => void;
}

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

    // V11-S3：BGM/SFX 状态来自 AudioService 真实状态（此前硬编码「开」），
    // 开关初始态同步持久化设置。
    const audioService = CocosBootstrapComponent.instance?.audioService;
    const settings = this.facade.context?.settings;
    const musicEnabled = audioService ? audioService.isMusicEnabled() : (settings?.musicEnabled ?? true);
    const sfxEnabled = audioService ? audioService.isSfxEnabled() : (settings?.sfxEnabled ?? true);

    if (this.bgmStatusLabel) {
      this.bgmStatusLabel.string = `BGM: ${musicEnabled ? '开' : '关'}`;
    }
    if (this.sfxStatusLabel) {
      this.sfxStatusLabel.string = `SFX: ${sfxEnabled ? '开' : '关'}`;
    }
    if (this.bgmToggle && audioService) {
      this.bgmToggle.isChecked = musicEnabled;
    }
    if (this.sfxToggle && audioService) {
      this.sfxToggle.isChecked = sfxEnabled;
    }
    if (this.bgmVolumeSlider && audioService) {
      this.bgmVolumeSlider.progress = audioService.getBgmVolume();
    }
    if (this.sfxVolumeSlider && audioService) {
      this.sfxVolumeSlider.progress = audioService.getSfxVolume();
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
    // V11-S3：真实开关接线——此前 checkEvents[0].emit() 是无意义调用、无任何 handler，
    // BGM/SFX 开关与音量滑条均为空壳（违反「每个按钮都有真实行为」）。
    // 每次变更同时应用 AudioService（立即生效）+ SettingsService（持久化）。
    const audio = () => CocosBootstrapComponent.instance?.audioService ?? null;
    const settings = () => this.facade?.context?.settings ?? null;

    this.bgmToggle?.on?.('toggle', () => {
      const enabled = this.bgmToggle?.isChecked ?? true;
      audio()?.setMusicEnabled(enabled);
      settings()?.setMusicEnabled(enabled);
      if (this.bgmStatusLabel) this.bgmStatusLabel.string = `BGM: ${enabled ? '开' : '关'}`;
    }, this);

    this.sfxToggle?.on?.('toggle', () => {
      const enabled = this.sfxToggle?.isChecked ?? true;
      audio()?.setSfxEnabled(enabled);
      settings()?.setSfxEnabled(enabled);
      if (this.sfxStatusLabel) this.sfxStatusLabel.string = `SFX: ${enabled ? '开' : '关'}`;
    }, this);

    this.bgmVolumeSlider?.on?.('slide', () => {
      const volume = this.bgmVolumeSlider?.progress;
      if (volume === undefined) return;
      audio()?.setBgmVolume(volume);
      settings()?.setBgmVolume(volume);
    }, this);

    this.sfxVolumeSlider?.on?.('slide', () => {
      const volume = this.sfxVolumeSlider?.progress;
      if (volume === undefined) return;
      audio()?.setSfxVolume(volume);
      settings()?.setSfxVolume(volume);
    }, this);

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

    // Fullscreen toggle（Electron 专属，真机绑定仍欠：见 docs/V11_V15/BACKLOG）
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