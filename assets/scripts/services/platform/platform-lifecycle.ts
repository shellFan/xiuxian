/**
 * Platform Lifecycle — extended lifecycle hooks for game pause/resume/save/restore.
 *
 * Extends the existing PlatformService onShow/onHide with:
 *   - onPause / onResume: platform-level suspension (e.g. WeChat background)
 *   - onSaveState / onRestoreState: cooperative save/restore hooks
 *
 * GameFacade uses this to coordinate save-on-hide, offline-calculation-on-show,
 * and loop pause/resume across all platforms.
 */

import type { PlatformService } from './platform-service';

/** Callback types for lifecycle events. */
export type LifecycleCallback = () => void;
export type SaveStateCallback = () => void;
export type RestoreStateCallback = () => void;

/**
 * PlatformLifecycle coordinates platform visibility events with game actions.
 *
 * Usage:
 *   const lifecycle = new PlatformLifecycle(platformService);
 *   lifecycle.onHide(() => { saveGame(); pauseLoop(); });
 *   lifecycle.onShow(() => { resumeLoop(); calculateOffline(); });
 *   lifecycle.onPause(() => { /* low-memory cleanup *\/ });
 *   lifecycle.onResume(() => { /* re-warm caches *\/ });
 */
export class PlatformLifecycle {
  private readonly pauseListeners = new Set<LifecycleCallback>();
  private readonly resumeListeners = new Set<LifecycleCallback>();
  private readonly saveStateListeners = new Set<SaveStateCallback>();
  private readonly restoreStateListeners = new Set<RestoreStateCallback>();
  private readonly hideCallbacks = new Set<LifecycleCallback>();
  private readonly showCallbacks = new Set<LifecycleCallback>();
  private hidden = false;
  private paused = false;

  public constructor(private readonly platform: PlatformService) {
    // Wire platform show/hide to our lifecycle once
    this.platform.onHide(() => {
      this.hidden = true;
      this.emitHide();
      this.emitSaveState();
    });

    this.platform.onShow(() => {
      this.hidden = false;
      this.emitShow();
      if (this.paused) {
        this.paused = false;
        this.emitResume();
      }
      this.emitRestoreState();
    });
  }

  /** Whether the platform is currently hidden (backgrounded). */
  public isHidden(): boolean { return this.hidden; }

  /** Whether the game is paused (suspended). */
  public isPaused(): boolean { return this.paused; }

  /** Register a callback for when the platform goes to background. */
  public onHide(callback: LifecycleCallback): () => void {
    this.hideCallbacks.add(callback);
    return () => { this.hideCallbacks.delete(callback); };
  }

  /** Register a callback for when the platform returns to foreground. */
  public onShow(callback: LifecycleCallback): () => void {
    this.showCallbacks.add(callback);
    return () => { this.showCallbacks.delete(callback); };
  }

  /** Register a callback for game pause (low-priority suspension). */
  public onPause(callback: LifecycleCallback): () => void {
    this.pauseListeners.add(callback);
    return () => this.pauseListeners.delete(callback);
  }

  /** Register a callback for game resume (after pause). */
  public onResume(callback: LifecycleCallback): () => void {
    this.resumeListeners.add(callback);
    return () => this.resumeListeners.delete(callback);
  }

  /** Register a callback for save-state (triggered on hide/pause). */
  public onSaveState(callback: SaveStateCallback): () => void {
    this.saveStateListeners.add(callback);
    return () => this.saveStateListeners.delete(callback);
  }

  /** Register a callback for restore-state (triggered on show/resume). */
  public onRestoreState(callback: RestoreStateCallback): () => void {
    this.restoreStateListeners.add(callback);
    return () => this.restoreStateListeners.delete(callback);
  }

  /** Manually trigger pause (for testing or programmatic pause). */
  public pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.emitPause();
    this.emitSaveState();
  }

  /** Manually trigger resume (for testing or programmatic resume). */
  public resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.emitResume();
    this.emitRestoreState();
  }

  /** Dispose all listeners. */
  public dispose(): void {
    this.pauseListeners.clear();
    this.resumeListeners.clear();
    this.saveStateListeners.clear();
    this.restoreStateListeners.clear();
    this.hideCallbacks.clear();
    this.showCallbacks.clear();
  }

  private emitPause(): void {
    for (const cb of this.pauseListeners) {
      try { cb(); } catch { /* listener errors must not propagate */ }
    }
  }

  private emitResume(): void {
    for (const cb of this.resumeListeners) {
      try { cb(); } catch { /* listener errors must not propagate */ }
    }
  }

  private emitHide(): void {
    for (const cb of this.hideCallbacks) {
      try { cb(); } catch { /* listener errors must not propagate */ }
    }
  }

  private emitShow(): void {
    for (const cb of this.showCallbacks) {
      try { cb(); } catch { /* listener errors must not propagate */ }
    }
  }

  private emitSaveState(): void {
    for (const cb of this.saveStateListeners) {
      try { cb(); } catch { /* save failures must not crash lifecycle */ }
    }
  }

  private emitRestoreState(): void {
    for (const cb of this.restoreStateListeners) {
      try { cb(); } catch { /* restore failures must not crash lifecycle */ }
    }
  }
}