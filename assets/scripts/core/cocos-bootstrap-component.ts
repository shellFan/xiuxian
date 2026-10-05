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
import { ElectronStorageAdapter } from '../services/electron-storage-adapter';
import { LocalStorageAdapter, MemoryStorageAdapter, type StorageAdapter, type StorageLoadResult } from '../services/storage-adapter';
import { AudioService } from '../services/audio-service';
import { CocosAudioBackend } from '../services/cocos-audio-backend';
import { SafeAreaService } from '../services/safe-area-service';

const { ccclass, property } = _decorator;

@ccclass('CocosBootstrapComponent')
export class CocosBootstrapComponent extends Component {
  private static _instance: CocosBootstrapComponent | null = null;
  private _facade: GameFacade | null = null;
  private _storage: StorageAdapter | null = null;
  private _initPromise: Promise<StorageLoadResult | null> | null = null;
  private _loadFailed = false;
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

    console.log('[BOOT] Game bootstrap starting');

    // Create storage adapter — Electron file storage > Cocos localStorage > in-memory
    let storage: StorageAdapter;
    const isElectron = typeof window !== 'undefined' && (window as unknown as { electronAPI?: unknown }).electronAPI;
    if (isElectron) {
      console.log('[BOOT] Detected Electron environment — using ElectronStorageAdapter');
      storage = new ElectronStorageAdapter();
    } else if (sys.localStorage) {
      console.log('[BOOT] Using LocalStorageAdapter (browser)');
      storage = new LocalStorageAdapter(sys.localStorage);
    } else {
      console.log('[BOOT] Using MemoryStorageAdapter (fallback)');
      storage = new MemoryStorageAdapter();
    }
    this._storage = storage;

    // F05: register the save-signal listener in onLoad — it must ack close-flush
    // even in fail-closed mode (LOAD_FAILED), where createFacade never runs.
    this.wireElectronSaveSignals();

    // F01: Kick off async initialization — facade creation deferred to start()
    this._initPromise = this.initializeStorage(storage);
    console.log('[BOOT] Storage adapter created — awaiting async initialization');

    // Create AudioService with CocosAudioBackend
    this._audioService = new AudioService({
      backend: new CocosAudioBackend(),
    });

    // Wire Cocos visibility events → platform lifecycle
    this.wireCocosVisibility();

    // F09: audio lifecycle wiring is deferred to start() — it needs the facade,
    // which is only created after async storage initialization completes.

    console.log('[BOOT] onLoad complete — facade creation deferred to start()');
  }

  /** F01: Async storage initialization. Returns the load result or null for sync adapters. */
  private async initializeStorage(storage: StorageAdapter): Promise<StorageLoadResult | null> {
    if (storage.initialize) {
      const result = await storage.initialize();
      console.log('[BOOT] Storage initialization result:', result.status, result.error ?? '');
      return result;
    }
    return null; // sync adapter (browser/memory), no initialization needed
  }

  protected async start(): Promise<void> {
    // F01: Await storage initialization before creating GameFacade
    var loadResult: StorageLoadResult | null = null;
    if (this._initPromise) {
      loadResult = await this._initPromise;
    }

    if (loadResult && loadResult.status === 'LOAD_FAILED') {
      // F01 §3.2: LOAD_FAILED — do NOT create auto-saving facade that would overwrite old save
      console.error('[BOOT] F01 LOAD_FAILED — refusing to create auto-saving game. Error:', loadResult.error);
      this._loadFailed = true;
      this.showLoadError(loadResult.error ?? 'Unknown storage error');
      return;
    }

    // Storage is ready — safe to create GameFacade
    try {
      this.createFacade();
    } catch (e) {
      // F01: SaveService.load() throws SaveLoadError for corrupted save data
      var msg = e instanceof Error ? e.message : String(e);
      console.error('[BOOT] F01 GameFacade creation failed — save data corrupted:', msg);
      this._loadFailed = true;
      this.showLoadError(msg);
      return;
    }
    this._facade?.start();
    // F09: facade now exists — wire audio lifecycle and expose it for external management
    this.wireAudioLifecycle();
    console.log('[BOOT] GameFacade started — game loop running');

    // Defer GAME_READY check to allow UI to render
    setTimeout(() => {
      this.checkGameReady();
    }, 500);
  }

  private createFacade(): void {
    if (!this._storage) return;
    this._facade = new GameFacade({ storage: this._storage, playTimeScale: 16 });
    console.log('[BOOT] GameFacade initialized');

    // Expose facade on window for DOM overlay UI access
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__GAME_FACADE__ = this._facade;
      console.log('[BOOT] GameFacade exposed on window.__GAME_FACADE__');
    }

    // Create SafeAreaService for UI layout
    const platformKind = this._facade.platform.getPlatform();
    this._safeAreaService = new SafeAreaService(platformKind);
  }

  private showLoadError(error: string): void {
    console.error('[BOOT] Storage load failed — old save will NOT be overwritten:', error);
    if (typeof window !== 'undefined') {
      var overlay = document.getElementById('UiOverlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'UiOverlay';
        document.body.appendChild(overlay);
      }
      overlay.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1a2e;color:#e0e0e0;font-family:sans-serif;">' +
        '<div style="text-align:center;padding:40px;border:1px solid #ff6b6b;border-radius:12px;background:#2a2a3e;">' +
        '<h2 style="color:#ff6b6b;margin:0 0 16px">存档读取失败</h2>' +
        '<p style="margin:0 0 8px">无法读取游戏存档，为防止数据覆盖已暂停加载。</p>' +
        '<p style="margin:0 0 16px;color:#aaa;font-size:13px">' + error + '</p>' +
        '<button onclick="location.reload()" style="padding:8px 24px;border:1px solid #4ecdc4;border-radius:8px;background:transparent;color:#4ecdc4;cursor:pointer">重试</button>' +
        '</div></div>';
      // F01: the error screen IS the final UI state — report readiness so the
      // Electron boot-timeout watchdog doesn't log a false hang.
      (window as unknown as { electronAPI?: { gameReady?: () => void } }).electronAPI?.gameReady?.();
    }
  }

  protected update(dt: number): void {
    // F01: Guard — don't tick until facade exists (async init may still be pending)
    if (!this._facade) return;
    this._facade.tick(dt);
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

  // ── Electron Save Signals ────────────────────────────────────────────────

  /**
   * Wire Electron save signals to GameFacade.save().
   * When Electron sends 'game:save-requested' (on minimize, close, autosave),
   * the game saves its state via the ElectronStorageAdapter.
   */
  private wireElectronSaveSignals(): void {
    if (typeof window === 'undefined') return;
    const electronAPI = (window as unknown as { electronAPI?: { onSaveRequested?: (cb: (data: { reason: string }) => void) => void } }).electronAPI;
    if (!electronAPI?.onSaveRequested) return;

    electronAPI.onSaveRequested((data: { reason: string }) => {
      if (this._facade && !this._facade['disposed']) {
        try {
          this._facade.save();
          console.log(`[ElectronBridge] Game saved (reason: ${data.reason})`);
        } catch (e) {
          console.error('[ElectronBridge] Save failed:', e);
        }
      }
      // F05 hardening: EVERY lifecycle save signal flushes to disk immediately —
      // the 500ms debounce would otherwise lose the tail if the app is killed
      // while minimized/blurred. Close additionally acks the main process.
      if (data.reason === 'close' || data.reason === 'before-quit') {
        void this.flushAndAckClose();
      } else {
        void this.flushNow();
      }
    });
  }

  private async flushNow(): Promise<void> {
    try {
      if (this._storage instanceof ElectronStorageAdapter) {
        await this._storage.flush();
      }
    } catch (e) {
      console.error('[ElectronBridge] flush failed:', e);
    }
  }

  private async flushAndAckClose(): Promise<void> {
    await this.flushNow();
    if (typeof window !== 'undefined') {
      const api = (window as unknown as { electronAPI?: { saveFlushed?: (info: { reason: string }) => void } }).electronAPI;
      api?.saveFlushed?.({ reason: 'close' });
      console.log('[ElectronBridge] F05 close flush acked to main process');
    }
  }

  // ── Game Ready Check ────────────────────────────────────────────────────

  /**
   * Check if the game is fully rendered and print GAME_READY.
   * This verifies that the Canvas exists and the scene is active.
   */
  private checkGameReady(): void {
    const canvas = document.querySelector('canvas');
    const gameDiv = document.getElementById('GameDiv');
    const canvasOk = !!canvas && canvas.width > 0 && canvas.height > 0;
    const gameDivOk = !!gameDiv;

    if (canvasOk && gameDivOk) {
      console.log('[BOOT] ✅ GAME_READY — Canvas and GameDiv are active');
      // Notify Electron main process that the game is ready
      if (typeof window !== 'undefined' && (window as unknown as { electronAPI?: { gameReady?: () => void } }).electronAPI?.gameReady) {
        (window as unknown as { electronAPI: { gameReady: () => void } }).electronAPI.gameReady();
        console.log('[BOOT] GAME_READY signal sent to Electron main process');
      }
    } else {
      console.warn(`[BOOT] ⚠️ Game not fully ready — Canvas=${canvasOk} GameDiv=${gameDivOk}`);
      // Retry after a short delay
      setTimeout(() => {
        this.checkGameReady();
      }, 1000);
    }
  }
}