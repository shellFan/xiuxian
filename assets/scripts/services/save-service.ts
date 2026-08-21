import { CURRENT_SAVE_VERSION, type GameSaveData, type WorkerSaveData } from '../model/save-data';
import { PlayerData } from '../model/player-data';
import type { StorageAdapter } from './storage-adapter';
import { DEFAULT_CLOCK, type Clock } from '../core/clock';

export const DEFAULT_SAVE_KEY = 'game-save';

export class SaveService {
  public constructor(
    private readonly storage: StorageAdapter,
    private readonly key = DEFAULT_SAVE_KEY,
    private readonly clockOrNow: Clock | (() => number) = DEFAULT_CLOCK,
  ) {}

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
    const now = typeof this.clockOrNow === 'function' ? this.clockOrNow() : this.clockOrNow.now();
    const saveTime = Math.max(player.lastSaveTime, now);
    const data = { ...player.toSaveData(), lastSaveTime: saveTime };
    this.storage.setItem(this.key, JSON.stringify(data));
    player.lastSaveTime = saveTime;
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
    cultivationExp: isNonNegativeSafeInteger(raw.cultivationExp) ? raw.cultivationExp : 0,
    careerLevel: isPositiveSafeInteger(raw.careerLevel) ? raw.careerLevel : 1,
    mind: isNonNegativeSafeInteger(raw.mind) ? raw.mind : 100,
    maxMind: isPositiveSafeInteger(raw.maxMind) ? raw.maxMind : 100,
    performance: isNonNegativeSafeInteger(raw.performance) ? raw.performance : 0,
    sectId: typeof raw.sectId === 'string' ? raw.sectId : null,
    talentId: typeof raw.talentId === 'string' ? raw.talentId : null,
    workMode: raw.workMode === 'WORK' ? 'WORK' : 'FISHING',
    workSeconds: isNonNegativeSafeInteger(raw.workSeconds) ? raw.workSeconds : 0,
    fishingSeconds: isNonNegativeSafeInteger(raw.fishingSeconds) ? raw.fishingSeconds : 0,
    kpiProgress: isRecord(raw.kpiProgress) ? numericRecord(raw.kpiProgress) : {},
    promotionFailCount: isNonNegativeSafeInteger(raw.promotionFailCount) ? raw.promotionFailCount : 0,
    officeLevel: isPositiveSafeInteger(raw.officeLevel) ? raw.officeLevel : 1,
    lastIdleSettlementId: typeof raw.lastIdleSettlementId === 'string' ? raw.lastIdleSettlementId : null,
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
function isPositiveSafeInteger(value: unknown): value is number { return isNonNegativeSafeInteger(value) && value >= 1; }
function numericRecord(value: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => isNonNegativeSafeInteger(item))) as Record<string, number>;
}
