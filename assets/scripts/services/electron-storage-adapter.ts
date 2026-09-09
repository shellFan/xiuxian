/**
 * ElectronStorageAdapter — Bridges Electron IPC file storage to StorageAdapter interface.
 *
 * In Electron mode, window.electronAPI is exposed by preload.cjs via contextBridge.
 * This adapter provides the same getItem/setItem/removeItem interface as LocalStorageAdapter,
 * but persists data to the filesystem via Electron's userData directory.
 *
 * Fallback: If electronAPI is not available (e.g. running in browser), falls back to
 * localStorage or in-memory storage.
 */
import type { StorageAdapter } from './storage-adapter';

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

// Augment Window type
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

// ── Electron Storage Adapter ───────────────────────────────────────────────
export class ElectronStorageAdapter implements StorageAdapter {
  private _cache: Map<string, string> = new Map();
  private _loaded = false;
  private _loadPromise: Promise<void> | null = null;

  public constructor() {
    this._loadPromise = this.loadFromElectron();
  }

  /** Ensure data is loaded before any operation */
  private async ensureLoaded(): Promise<void> {
    if (!this._loaded && this._loadPromise) {
      await this._loadPromise;
    }
  }

  /** Load all data from Electron file storage into cache */
  private async loadFromElectron(): Promise<void> {
    if (typeof window === 'undefined' || !window.electronAPI?.storage) {
      this._loaded = true;
      return;
    }

    try {
      const result = await window.electronAPI.storage.load();
      if (result.success && result.data) {
        for (const [key, value] of Object.entries(result.data)) {
          if (typeof value === 'string') {
            this._cache.set(key, value);
          } else {
            this._cache.set(key, JSON.stringify(value));
          }
        }
      }
    } catch (e) {
      console.warn('[ElectronStorage] Failed to load from Electron, using empty cache:', e);
    }
    this._loaded = true;
  }

  /** Get item — synchronous from cache */
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
    await this.ensureLoaded();
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

  /** Debounced persist — coalesces rapid writes within 500ms */
  private persistToElectron(): void {
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => {
      this.doPersist();
    }, 500);
  }

  /** Actually write cache to Electron */
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

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Create the best available StorageAdapter for the current environment.
 * Priority: Electron file storage > Cocos localStorage > In-memory
 */
export function createStorageAdapter(): StorageAdapter {
  // Check if running in Electron
  if (typeof window !== 'undefined' && window.electronAPI?.storage) {
    console.log('[Storage] Using ElectronStorageAdapter (file-based)');
    return new ElectronStorageAdapter();
  }

  // Check if Cocos localStorage is available
  if (typeof sys !== 'undefined' && sys.localStorage) {
    console.log('[Storage] Using LocalStorageAdapter (browser)');
    // Dynamic import guard — sys may not be available at module load time
    const { LocalStorageAdapter } = require('./storage-adapter') as typeof import('./storage-adapter');
    return new LocalStorageAdapter(sys.localStorage as unknown as StorageAdapter);
  }

  // Fallback to in-memory
  console.log('[Storage] Using MemoryStorageAdapter (fallback)');
  const { MemoryStorageAdapter } = require('./storage-adapter') as typeof import('./storage-adapter');
  return new MemoryStorageAdapter();
}

// Need sys import for the factory function
import { sys } from 'cc';