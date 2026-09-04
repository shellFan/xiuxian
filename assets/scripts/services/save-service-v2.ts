/**
 * SaveServiceV2 — robust save with backup, validation, and corruption recovery.
 *
 * Enhancements over SaveService:
 *   1. Atomic logical save: validate → backup → write → verify
 *   2. Backup slot: keeps last known-good save in a separate key
 *   3. Corruption recovery: if load fails, try backup before default
 *   4. Configurable autosave strategy (interval + event-triggered)
 */

import { CURRENT_SAVE_VERSION, type GameSaveData, type WorkerSaveData } from '../model/save-data';
import { PlayerData } from '../model/player-data';
import type { StorageAdapter } from './storage-adapter';
import { DEFAULT_CLOCK, type Clock } from '../core/clock';
import { SaveService } from './save-service';
import { MemoryStorageAdapter } from './storage-adapter';

export const DEFAULT_SAVE_KEY = 'game-save';
export const BACKUP_SAVE_KEY = 'game-save-backup';

export interface SaveServiceV2Options {
  readonly saveKey?: string;
  readonly backupKey?: string;
  readonly clock?: Clock;
  /** Enable backup on every save. Default: true. */
  readonly enableBackup?: boolean;
  /** Max backup slots to keep. Default: 1. */
  readonly maxBackups?: number;
}

export class SaveServiceV2 {
  private latestSnapshot: GameSaveData | null = null;
  private readonly saveKey: string;
  private readonly backupKey: string;
  private readonly clockOrNow: Clock | (() => number);
  private readonly enableBackup: boolean;
  private readonly maxBackups: number;

  public constructor(
    private readonly storage: StorageAdapter,
    options: SaveServiceV2Options = {},
  ) {
    this.saveKey = options.saveKey ?? DEFAULT_SAVE_KEY;
    this.backupKey = options.backupKey ?? BACKUP_SAVE_KEY;
    this.clockOrNow = options.clock ?? DEFAULT_CLOCK;
    this.enableBackup = options.enableBackup ?? true;
    this.maxBackups = options.maxBackups ?? 1;
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  /**
   * Load save data with corruption recovery.
   * Strategy: primary → backup → default
   */
  public load(): GameSaveData {
    // Try primary
    const primary = this.tryLoad(this.saveKey);
    if (primary) {
      this.latestSnapshot = cloneSaveData(primary);
      return cloneSaveData(primary);
    }

    // Try backup
    const backup = this.tryLoad(this.backupKey);
    if (backup) {
      this.latestSnapshot = cloneSaveData(backup);
      return cloneSaveData(backup);
    }

    // Default
    const defaultData = PlayerData.createDefault().toSaveData();
    this.latestSnapshot = cloneSaveData(defaultData);
    return cloneSaveData(defaultData);
  }

  public getLatestCommittedSnapshot(): GameSaveData | null {
    return this.latestSnapshot ? cloneSaveData(this.latestSnapshot) : null;
  }

  public get latestCommittedSnapshot(): GameSaveData | null { return this.getLatestCommittedSnapshot(); }

  // ── Save ──────────────────────────────────────────────────────────────────

  /** Atomic save: validate → backup → write → verify. */
  public save(player: PlayerData): void {
    const now = typeof this.clockOrNow === 'function' ? this.clockOrNow() : this.clockOrNow.now();
    this.saveAt(player, now);
  }

  public saveAt(player: PlayerData, timestamp: number): void {
    if (!Number.isFinite(timestamp)) throw new Error('Invalid save time');
    const saveTime = Math.max(player.lastSaveTime, timestamp);
    const data = { ...player.toSaveData(), lastSaveTime: saveTime };

    // 1. Validate
    const validation = validateSaveData(data);
    if (!validation.valid) {
      throw new Error(`Save validation failed: ${validation.errors.join(', ')}`);
    }

    // 2. Write
    const json = JSON.stringify(data);
    this.storage.setItem(this.saveKey, json);

    // 3. Verify
    const verifyRaw = this.storage.getItem(this.saveKey);
    if (verifyRaw !== json) {
      // Verification failed — restore from backup
      this.restoreFromBackup();
      throw new Error('Save verification failed: written data does not match');
    }

    // 4. Backup after successful write (so backup always has last known-good)
    if (this.enableBackup) {
      this.storage.setItem(this.backupKey, json);
    }

    this.latestSnapshot = cloneSaveData(data);
    player.lastSaveTime = saveTime;
  }

  public saveIdleSettlement(player: PlayerData, settlementId: string, timestamp: number): void {
    if (typeof settlementId !== 'string' || settlementId.trim() === '') throw new Error('Invalid settlement id');
    if (!Number.isFinite(timestamp)) throw new Error('Invalid save time');
    const saveTime = Math.max(player.lastSaveTime, timestamp);
    const data = { ...player.toSaveData(), lastIdleSettlementId: settlementId, lastSaveTime: saveTime };

    if (this.enableBackup) this.backupCurrent();
    this.storage.setItem(this.saveKey, JSON.stringify(data));
    this.latestSnapshot = cloneSaveData(data);
    player.lastIdleSettlementId = settlementId;
    player.lastSaveTime = saveTime;
  }

  public autoSave(player: PlayerData): void { this.save(player); }

  /** Clear save data and backup (dev/debug only). */
  public clearSave(): void {
    this.storage.removeItem(this.saveKey);
    this.storage.removeItem(this.backupKey);
    this.latestSnapshot = null;
  }

  // ── Backup ────────────────────────────────────────────────────────────────

  /** Backup current save data to backup slot. */
  public backupCurrent(): void {
    const current = this.storage.getItem(this.saveKey);
    if (current) {
      this.storage.setItem(this.backupKey, current);
    }
  }

  /** Restore save data from backup. Returns true if backup existed. */
  public restoreFromBackup(): boolean {
    const backup = this.storage.getItem(this.backupKey);
    if (!backup) return false;
    this.storage.setItem(this.saveKey, backup);
    return true;
  }

  /** Check if backup exists. */
  public hasBackup(): boolean {
    return this.storage.getItem(this.backupKey) !== null;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private tryLoad(key: string): GameSaveData | null {
    const raw = this.storage.getItem(key);
    if (!raw || !raw.trim()) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!isRecord(parsed) || parsed.saveVersion !== CURRENT_SAVE_VERSION) return null;
      // Use SaveService's robust migration for the actual data
      const tempStorage = new MemoryStorageAdapter();
      tempStorage.setItem(key, raw);
      const tempSave = new SaveService(tempStorage, key, this.clockOrNow);
      return tempSave.load();
    } catch {
      return null;
    }
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface SaveValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateSaveData(data: GameSaveData): SaveValidationResult {
  const errors: string[] = [];

  if (data.saveVersion !== CURRENT_SAVE_VERSION) {
    errors.push(`Unexpected save version: ${data.saveVersion}`);
  }
  if (!Number.isSafeInteger(data.salary) || data.salary < 0) {
    errors.push(`Invalid salary: ${data.salary}`);
  }
  if (!Number.isSafeInteger(data.careerLevel) || data.careerLevel < 1) {
    errors.push(`Invalid careerLevel: ${data.careerLevel}`);
  }
  if (!Number.isSafeInteger(data.mind) || data.mind < 0) {
    errors.push(`Invalid mind: ${data.mind}`);
  }
  if (!Number.isSafeInteger(data.maxMind) || data.maxMind < 1) {
    errors.push(`Invalid maxMind: ${data.maxMind}`);
  }
  if (data.mind > data.maxMind) {
    errors.push(`mind (${data.mind}) exceeds maxMind (${data.maxMind})`);
  }
  if (!Array.isArray(data.workers)) {
    errors.push('workers is not an array');
  }
  if (data.workMode !== 'WORK' && data.workMode !== 'FISHING') {
    errors.push(`Invalid workMode: ${data.workMode}`);
  }

  return { valid: errors.length === 0, errors: Object.freeze(errors) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneSaveData(data: GameSaveData): GameSaveData {
  return {
    ...data,
    workers: data.workers.map(w => ({ ...w })),
    kpiProgress: { ...data.kpiProgress },
    unlockedAchievementIds: [...(data.unlockedAchievementIds ?? [])],
    claimedAchievementIds: [...(data.claimedAchievementIds ?? [])],
    dailySignIn: data.dailySignIn ? { ...data.dailySignIn } : null,
    dailyTasks: (data.dailyTasks ?? []).map(t => ({ ...t })),
    dailyTaskDay: data.dailyTaskDay ?? -1,
    tutorialStep: data.tutorialStep ?? 'FIRST_RECRUIT',
    tutorialCompleted: data.tutorialCompleted ?? false,
  };
}