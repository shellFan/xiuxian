/** F01: Result of async storage initialization. */
export type StorageLoadStatus = 'NO_SAVE' | 'LOADED' | 'LOAD_FAILED' | 'NOT_INITIALIZED';
export interface StorageLoadResult {
  status: StorageLoadStatus;
  error?: string;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** F01: Optional async initialization. If present, must be awaited before creating GameFacade. */
  initialize?(): Promise<StorageLoadResult>;
  /**
   * F10: Optional write lockdown. Called when the persisted save was rejected
   * (LOAD_FAILED or SaveLoadError) — every write path must become a no-op so
   * the close flush can never touch the unreadable file.
   */
  markFailClosed?(): void;
}

export class LocalStorageAdapter implements StorageAdapter {
  private failClosed = false;

  public constructor(private readonly storage?: StorageAdapter) {}

  public getItem(key: string): string | null {
    return this.requireStorage().getItem(key);
  }

  public setItem(key: string, value: string): void {
    if (this.failClosed) return;
    this.requireStorage().setItem(key, value);
  }

  public removeItem(key: string): void {
    if (this.failClosed) return;
    this.requireStorage().removeItem(key);
  }

  public markFailClosed(): void { this.failClosed = true; }

  private requireStorage(): StorageAdapter {
    if (!this.storage) {
      throw new Error('Persistent storage is unavailable; inject a StorageAdapter for this environment');
    }
    return this.storage;
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<string, string>();
  private failClosed = false;

  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { if (this.failClosed) return; this.values.set(key, value); }
  public removeItem(key: string): void { if (this.failClosed) return; this.values.delete(key); }
  public markFailClosed(): void { this.failClosed = true; }
}
