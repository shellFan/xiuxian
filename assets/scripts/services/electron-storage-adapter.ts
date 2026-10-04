/**
 * ElectronStorageAdapter — Bridges Electron IPC file storage to StorageAdapter interface.
 *
 * F01: Requires explicit async initialize() before getItem() returns meaningful data.
 * Distinguishes NO_SAVE / LOADED / LOAD_FAILED to prevent new-save overwrites.
 */
import type { StorageAdapter, StorageLoadResult, StorageLoadStatus } from './storage-adapter';

// Re-export for consumers that import from this module
export type { StorageLoadResult, StorageLoadStatus };

// ── Electron API Types ─────────────────────────────────────────────────────
interface ElectronStorageAPI {
  save: (data: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  load: () => Promise<{ success: boolean; data: Record<string, unknown> | null; error?: string }>;
  backup: () => Promise<{ success: boolean }>;
  recover: () => Promise<{ success: boolean; data: Record<string, unknown> }>;
}

interface ElectronAppAPI {
  isElectron: () => Promise<boolean>;
  getVersion: () => Promise<string>;
  getPath: (name: string) => Promise<string>;
}

interface ElectronAPI {
  storage: ElectronStorageAPI;
  app: ElectronAppAPI;
  onSaveRequested: (callback: (data: { reason: string; timestamp: number }) => void) => void;
  removeSaveListener: () => void;
  setFullscreen: (flag: boolean) => Promise<void>;
  isFullscreen: () => Promise<boolean>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

// ── Electron Storage Adapter ───────────────────────────────────────────────
export class ElectronStorageAdapter implements StorageAdapter {
  private _cache: Map<string, string> = new Map();
  private _initialized = false;
  private _initPromise: Promise<StorageLoadResult> | null = null;
  private _loadResult: StorageLoadResult = { status: 'NOT_INITIALIZED' };

  /**
   * F01: Explicit async initialization. Must be called and awaited before
   * getItem() returns meaningful data. Distinguishes NO_SAVE / LOADED / LOAD_FAILED.
   */
  public initialize(): Promise<StorageLoadResult> {
    if (!this._initPromise) {
      this._initPromise = this.loadFromElectron();
    }
    return this._initPromise;
  }

  /** Whether initialization has completed successfully (cache is populated). */
  public get isInitialized(): boolean {
    return this._initialized;
  }

  /** Last initialization result. */
  public get loadResult(): StorageLoadResult {
    return this._loadResult;
  }

  private async loadFromElectron(): Promise<StorageLoadResult> {
    if (typeof window === 'undefined' || !window.electronAPI?.storage) {
      this._initialized = true;
      this._loadResult = { status: 'NO_SAVE' };
      return this._loadResult;
    }

    try {
      const result = await window.electronAPI.storage.load();
      if (!result.success) {
        // IPC responded but reported failure — this is LOAD_FAILED, not NO_SAVE
        this._initialized = true;
        this._loadResult = { status: 'LOAD_FAILED', error: result.error ?? 'IPC load reported failure' };
        return this._loadResult;
      }
      if (result.data && typeof result.data === 'object' && Object.keys(result.data).length > 0) {
        for (const [key, value] of Object.entries(result.data)) {
          if (typeof value === 'string') {
            this._cache.set(key, value);
          } else {
            this._cache.set(key, JSON.stringify(value));
          }
        }
        this._initialized = true;
        this._loadResult = { status: 'LOADED' };
        return this._loadResult;
      }
      // IPC succeeded but no data — this is a new player
      this._initialized = true;
      this._loadResult = { status: 'NO_SAVE' };
      return this._loadResult;
    } catch (e) {
      // IPC reject / timeout / IO error — LOAD_FAILED, NOT NO_SAVE
      this._initialized = true;
      this._loadResult = { status: 'LOAD_FAILED', error: e instanceof Error ? e.message : String(e) };
      return this._loadResult;
    }
  }

  /** Get item — synchronous from cache. Returns null until initialize() completes. */
  public getItem(key: string): string | null {
    return this._cache.get(key) ?? null;
  }

  /** Set item — updates cache and schedules async persist */
  public setItem(key: string, value: string): void {
    this._cache.set(key, value);
    this.persistToElectron();
  }

  /** Remove item — updates cache and schedules async persist */
  public removeItem(key: string): void {
    this._cache.delete(key);
    this.persistToElectron();
  }

  /** Force persist current cache to Electron file storage */
  public async flush(): Promise<void> {
    await this.doPersist();
  }

  /** Register listener for Electron save signals (minimize/close/autosave) */
  public onSaveRequested(callback: (reason: string) => void): void {
    if (typeof window !== 'undefined' && window.electronAPI?.onSaveRequested) {
      window.electronAPI.onSaveRequested((data) => {
        callback(data.reason);
      });
    }
  }

  /** Remove save signal listener */
  public removeSaveListener(): void {
    if (typeof window !== 'undefined' && window.electronAPI?.removeSaveListener) {
      window.electronAPI.removeSaveListener();
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private _persistTimer: ReturnType<typeof setTimeout> | null = null;

  private persistToElectron(): void {
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => {
      this.doPersist();
    }, 500);
  }

  private async doPersist(): Promise<void> {
    if (typeof window === 'undefined' || !window.electronAPI?.storage) return;
    const data: Record<string, unknown> = {};
    for (const [key, value] of this._cache) {
      try {
        data[key] = JSON.parse(value);
      } catch {
        data[key] = value;
      }
    }
    try {
      await window.electronAPI.storage.save(data);
    } catch (e) {
      console.error('[ElectronStorage] Failed to persist:', e);
    }
  }
}
