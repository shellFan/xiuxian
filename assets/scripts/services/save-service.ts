import { CURRENT_SAVE_VERSION, type GameSaveData, type WorkerSaveData } from '../model/save-data';
import { PlayerData } from '../model/player-data';
import type { StorageAdapter } from './storage-adapter';
import { DEFAULT_CLOCK, type Clock } from '../core/clock';

export const DEFAULT_SAVE_KEY = 'game-save';

export class SaveService {
  private latestSnapshot: GameSaveData | null = null;
  public constructor(
    private readonly storage: StorageAdapter,
    private readonly key = DEFAULT_SAVE_KEY,
    private readonly clockOrNow: Clock | (() => number) = DEFAULT_CLOCK,
  ) {}

  public load(): GameSaveData {
    const raw = this.storage.getItem(this.key);
    if (!raw || !raw.trim()) return this.commitLoaded(PlayerData.createDefault().toSaveData());
    try {
      return this.commitLoaded(migrate(JSON.parse(raw)));
    } catch {
      return this.commitLoaded(PlayerData.createDefault().toSaveData());
    }
  }

  public getLatestCommittedSnapshot(): GameSaveData | null {
    return this.latestSnapshot ? cloneSaveData(this.latestSnapshot) : null;
  }

  public get latestCommittedSnapshot(): GameSaveData | null { return this.getLatestCommittedSnapshot(); }

  public save(player: PlayerData): void {
    const now = typeof this.clockOrNow === 'function' ? this.clockOrNow() : this.clockOrNow.now();
    this.saveAt(player, now);
  }

  public saveAt(player: PlayerData, timestamp: number): void {
    if (!Number.isFinite(timestamp)) throw new Error('Invalid save time');
    const saveTime = Math.max(player.lastSaveTime, timestamp);
    const data = { ...player.toSaveData(), lastSaveTime: saveTime };
    this.storage.setItem(this.key, JSON.stringify(data));
    this.latestSnapshot = cloneSaveData(data);
    player.lastSaveTime = saveTime;
  }

  public saveIdleSettlement(player: PlayerData, settlementId: string, timestamp: number): void {
    if (typeof settlementId !== 'string' || settlementId.trim() === '') throw new Error('Invalid settlement id');
    if (!Number.isFinite(timestamp)) throw new Error('Invalid save time');
    const saveTime = Math.max(player.lastSaveTime, timestamp);
    const data = { ...player.toSaveData(), lastIdleSettlementId: settlementId, lastSaveTime: saveTime };
    this.storage.setItem(this.key, JSON.stringify(data));
    this.latestSnapshot = cloneSaveData(data);
    player.lastIdleSettlementId = settlementId;
    player.lastSaveTime = saveTime;
  }

  public autoSave(player: PlayerData): void { this.save(player); }

  private commitLoaded(data: GameSaveData): GameSaveData {
    this.latestSnapshot = cloneSaveData(data);
    return cloneSaveData(data);
  }
}

function migrate(raw: unknown): GameSaveData {
  if (!isRecord(raw) || (raw.saveVersion !== undefined && (!isFiniteNumber(raw.saveVersion) || raw.saveVersion > CURRENT_SAVE_VERSION))) {
    throw new Error('Unsupported save data');
  }
  const workers = Array.isArray(raw.workers) ? raw.workers.filter(isWorker).map((worker) => ({ ...worker })) : [];
  const maxWorkerLevel = isNonNegativeSafeInteger(raw.maxWorkerLevel) ? raw.maxWorkerLevel : workers.reduce((max, worker) => Math.max(max, worker.level), 0);
  const data: GameSaveData = {
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
  if (isNonNegativeSafeInteger(raw.salaryRemainder) && raw.salaryRemainder !== 0) dataWithRemainder(data, 'salaryRemainder', raw.salaryRemainder);
  if (isNonNegativeSafeInteger(raw.cultivationRemainder) && raw.cultivationRemainder !== 0) dataWithRemainder(data, 'cultivationRemainder', raw.cultivationRemainder);
  if (isNonNegativeSafeInteger(raw.mindRemainder) && raw.mindRemainder !== 0) dataWithRemainder(data, 'mindRemainder', raw.mindRemainder);
  return data;
}

function dataWithRemainder(data: GameSaveData, key: 'salaryRemainder' | 'cultivationRemainder' | 'mindRemainder', value: number): void {
  Object.assign(data, { [key]: value });
}
function cloneSaveData(data: GameSaveData): GameSaveData {
  return { ...data, workers: data.workers.map((worker) => ({ ...worker })), kpiProgress: { ...data.kpiProgress } };
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
