/**
 * CocosBootstrapComponent — Phase 5 bootstrap for the Cocos Creator runtime.
 *
 * Replaces the legacy GameBootstrapComponent with a proper GameFacade-driven
 * bootstrap that:
 *   - Initializes GameFacade as the single business entry point
 *   - Wires Cocos game visibility events (EVENT_HIDE / EVENT_SHOW) to
 *     PlatformLifecycle so that hide/show callbacks fire correctly
 *   - Wires AudioService BGM pause/resume on lifecycle hide/show
 *   - Is a singleton — prevents double initialization on scene reload
 *   - Does NOT create duplicate GameLoop, Scheduler, OfflineSettlement,
 *     or Event subscriptions (all managed by GameFacade)
 *   - Exposes the facade reference for UI binding
 */

import { _decorator, Component, sys, game } from 'cc';
import { GameFacade } from '../facade/game-facade';
import { LocalStorageAdapter, MemoryStorageAdapter } from '../services/storage-adapter';
import { AudioService } from '../services/audio-service';
import { CocosAudioBackend } from '../services/cocos-audio-backend';
import { SafeAreaService } from '../services/safe-area-service';

const { ccclass, property } = _decorator;

@ccclass('CocosBootstrapComponent')
export class CocosBootstrapComponent extends Component {
  private static _instance: CocosBootstrapComponent | null = null;
  private _facade: GameFacade | null = null;
  private _audioService: AudioService | null = null;
  private _safeAreaService: SafeAreaService | null = null;
  private _lastBgmId: string | null = null;

  /** Singleton instance — null after destroy. */
  public static get instance(): CocosBootstrapComponent | null {
    return CocosBootstrapComponent._instance;
  }

  /** Current GameFacade reference for UI binding. */
  public get facade(): GameFacade | null {
    return this._facade;
  }

  /** AudioService instance (created in onLoad with CocosAudioBackend). */
  public get audioService(): AudioService | null {
    return this._audioService;
  }

  /** SafeAreaService instance (created in onLoad). */
  public get safeAreaService(): SafeAreaService | null {
    return this._safeAreaService;
  }

  /**
   * Inject an AudioService to enable BGM pause/resume on lifecycle events.
   * Set this after onLoad if audio is managed externally.
   */
  public set audioService(service: AudioService | null) {
    this._audioService = service;
  }

  // ── Cocos Lifecycle ────────────────────────────────────────────────────────

  protected onLoad(): void {
    // Singleton guard — prevent double initialization on scene reload
    if (CocosBootstrapComponent._instance && CocosBootstrapComponent._instance !== this) {
      this.destroy();
      return;
    }
    CocosBootstrapComponent._instance = this;

    // Create storage adapter — prefer Cocos persistent storage, fallback to memory
    const storage = sys.localStorage
      ? new LocalStorageAdapter(sys.localStorage)
      : new MemoryStorageAdapter();

    // Initialize GameFacade as the single business entry point
    this._facade = new GameFacade({ storage });

    // Create AudioService with CocosAudioBackend
    this._audioService = new AudioService({
      backend: new CocosAudioBackend(),
    });

    // Create SafeAreaService for UI layout
    const platformKind = this._facade.platform.getPlatform();
    this._safeAreaService = new SafeAreaService(platformKind);

    // Wire Cocos visibility events → platform lifecycle
    this.wireCocosVisibility();

    // Wire audio service lifecycle (pause/resume BGM)
    this.wireAudioLifecycle();
  }

  protected start(): void {
    this._facade?.start();
  }

  protected update(dt: number): void {
    this._facade?.tick(dt);
  }

  protected onDestroy(): void {
    // Unregister Cocos game event listeners
    game.off(game.EVENT_HIDE, this.onGameHide, this);
    game.off(game.EVENT_SHOW, this.onGameShow, this);

    // Destroy the facade and release all resources
    this._facade?.destroy();
    this._audioService?.dispose();
    this._facade = null;
    this._audioService = null;
    this._safeAreaService = null;
    this._lastBgmId = null;

    if (CocosBootstrapComponent._instance === this) {
      CocosBootstrapComponent._instance = null;
    }
  }

  // ── Cocos Visibility Bridging ──────────────────────────────────────────────

  /**
   * Bridge Cocos game visibility events to the PlatformService so that
   * PlatformLifecycle hide/show callbacks fire correctly.
   *
   * For WeChat, the WechatPlatformService already wires wx.onShow/wx.onHide
   * in its onShow/onHide overrides. For Web/Desktop/Mock, the BasePlatform
   * only stores listeners — we must emit them from Cocos game events here.
   */
  private wireCocosVisibility(): void {
    game.on(game.EVENT_HIDE, this.onGameHide, this);
    game.on(game.EVENT_SHOW, this.onGameShow, this);
  }

  private onGameHide(): void {
    const platform = this._facade?.platform;
    if (platform && 'emitHide' in platform) {
      (platform as { emitHide(): void }).emitHide();
    }
  }

  private onGameShow(): void {
    const platform = this._facade?.platform;
    if (platform && 'emitShow' in platform) {
      (platform as { emitShow(): void }).emitShow();
    }
  }

  // ── Audio Lifecycle ────────────────────────────────────────────────────────

  /**
   * Wire BGM pause/resume to PlatformLifecycle hide/show events.
   * When the game is hidden, BGM is stopped and the last BGM ID is saved.
   * When the game returns, BGM resumes if it was previously playing.
   */
  private wireAudioLifecycle(): void {
    this._facade?.lifecycle.onHide(() => {
      if (this._audioService) {
        this._lastBgmId = this._audioService.getCurrentBgmId();
        this._audioService.stopBgm();
      }
    });

    this._facade?.lifecycle.onShow(() => {
      if (this._audioService && this._lastBgmId) {
        this._audioService.playBgm(this._lastBgmId);
        this._lastBgmId = null;
      }
    });
  }
}