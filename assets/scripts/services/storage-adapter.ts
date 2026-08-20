export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class LocalStorageAdapter implements StorageAdapter {
  public getItem(key: string): string | null {
    return globalThis.localStorage.getItem(key);
  }

  public setItem(key: string, value: string): void {
    globalThis.localStorage.setItem(key, value);
  }

  public removeItem(key: string): void {
    globalThis.localStorage.removeItem(key);
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
  public removeItem(key: string): void { this.values.delete(key); }
}