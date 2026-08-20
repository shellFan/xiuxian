import { CURRENT_SAVE_VERSION, type GameSaveData, type WorkerSaveData } from '../model/save-data';
import { PlayerData } from '../model/player-data';
import type { StorageAdapter } from './storage-adapter';

export const DEFAULT_SAVE_KEY = 'game-save';

export class SaveService {
  public constructor(private readonly storage: StorageAdapter, private readonly key = DEFAULT_SAVE_KEY) {}

  public load(): GameSaveData {
    const raw = this.storage.getItem(this.key);
    if (!raw || !raw.trim()) return PlayerData.createDefault().toSaveData();
    try {
      return migrate(JSON.parse(raw));
    } catch {
      return PlayerData.createDefault().toSaveData();
    }
  }

  public save(player: PlayerData): void {
    const data = player.toSaveData();
    this.storage.setItem(this.key, JSON.stringify(data));
  }

  public autoSave(player: PlayerData): void { this.save(player); }
}

function migrate(raw: unknown): GameSaveData {
  if (!isRecord(raw) || (raw.saveVersion !== undefined && (!isFiniteNumber(raw.saveVersion) || raw.saveVersion > CURRENT_SAVE_VERSION))) {
    throw new Error('Unsupported save data');
  }
  const workers = Array.isArray(raw.workers) ? raw.workers.filter(isWorker).map((worker) => ({ ...worker })) : [];
  const maxWorkerLevel = isNonNegativeSafeInteger(raw.maxWorkerLevel) ? raw.maxWorkerLevel : workers.reduce((max, worker) => Math.max(max, worker.level), 0);
  return {
    saveVersion: CURRENT_SAVE_VERSION,
    salary: isNonNegativeSafeInteger(raw.salary) ? raw.salary : 0,
    maxWorkerLevel,
    lastSaveTime: isNonNegativeSafeInteger(raw.lastSaveTime) ? raw.lastSaveTime : 0,
    workers,
  };
}

function isWorker(value: unknown): value is WorkerSaveData {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  return isFiniteNumber(value.level) && isFiniteNumber(value.row) && isFiniteNumber(value.column);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
