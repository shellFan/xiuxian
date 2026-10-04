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
}

export class LocalStorageAdapter implements StorageAdapter {
  public constructor(private readonly storage?: StorageAdapter) {}

  public getItem(key: string): string | null {
    return this.requireStorage().getItem(key);
  }

  public setItem(key: string, value: string): void {
    this.requireStorage().setItem(key, value);
  }

  public removeItem(key: string): void {
    this.requireStorage().removeItem(key);
  }

  private requireStorage(): StorageAdapter {
    if (!this.storage) {
      throw new Error('Persistent storage is unavailable; inject a StorageAdapter for this environment');
    }
    return this.storage;
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
  public removeItem(key: string): void { this.values.delete(key); }
}
