import type { Clock } from '../core/clock';
import { DEFAULT_CLOCK } from '../core/clock';
import type { GameContext } from '../core/game-context';

/** Buff type identifiers known by the game. */
export type BuffType =
  | 'WORK_SALARY_BOOST'
  | 'WORK_CULTIVATION_BOOST'
  | 'FISHING_MIND_BOOST'
  | 'MERGE_REWARD_BOOST'
  | 'KPI_PROGRESS_BOOST'
  | 'EVENT_REROLL';

/** A single active buff instance. */
export interface ActiveBuff {
  readonly id: string;
  readonly type: BuffType;
  /** Multiplier applied to the relevant rate (e.g. 2.0 = double). */
  readonly multiplier: number;
  /** Absolute game-time seconds when this buff expires. */
  readonly expiresAtSeconds: number;
}

export interface BuffServiceOptions {
  readonly clock?: Clock;
}

/**
 * Manages temporary buffs that modify game rates.
 *
 * Buffs are tracked in real game-seconds (accumulated via `tick`).
 * They are completely frame-rate independent — the GameLoopService
 * calls `tick(deltaSeconds)` and `getMultiplier(type)` each step.
 *
 * Buff state is NOT persisted to save data in V1 (buffs expire on
 * session end). A future version can serialize `activeBuffs` if
 * cross-session buff continuity is needed.
 */
export class BuffService {
  private readonly clock: Clock;
  private readonly activeBuffs: ActiveBuff[] = [];
  private gameSeconds = 0;
  private nextBuffId = 1;

  public constructor(options: BuffServiceOptions = {}) {
    this.clock = options.clock ?? DEFAULT_CLOCK;
  }

  /** Current accumulated game time in seconds. */
  public getGameSeconds(): number { return this.gameSeconds; }

  /** All currently active buffs (snapshot). */
  public getActiveBuffs(): readonly ActiveBuff[] {
    return [...this.activeBuffs];
  }

  /** Advance game time and expire finished buffs. Called by GameLoopService. */
  public tick(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.gameSeconds += deltaSeconds;
    this.expireBuffs();
  }

  /**
   * Add a buff that lasts `durationSeconds` of game time.
   * Returns the assigned buff id.
   */
  public addBuff(type: BuffType, multiplier: number, durationSeconds: number): string {
    if (!Number.isFinite(multiplier) || multiplier <= 0) throw new Error('Invalid buff multiplier');
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Invalid buff duration');
    const id = `buff_${this.nextBuffId}`;
    this.nextBuffId += 1;
    const buff: ActiveBuff = {
      id,
      type,
      multiplier,
      expiresAtSeconds: this.gameSeconds + durationSeconds,
    };
    this.activeBuffs.push(buff);
    return id;
  }

  /** Remove a buff by id. Returns true if found and removed. */
  public removeBuff(id: string): boolean {
    const index = this.activeBuffs.findIndex((b) => b.id === id);
    if (index === -1) return false;
    this.activeBuffs.splice(index, 1);
    return true;
  }

  /**
   * Get the combined multiplier for a buff type.
   * If multiple buffs of the same type are active, their multipliers
   * are multiplied together (not added).
   * Returns 1.0 if no buffs of the given type are active.
   */
  public getMultiplier(type: BuffType): number {
    let multiplier = 1.0;
    for (const buff of this.activeBuffs) {
      if (buff.type === type) multiplier *= buff.multiplier;
    }
    return multiplier;
  }

  /** Check if any buff of the given type is currently active. */
  public hasBuff(type: BuffType): boolean {
    return this.activeBuffs.some((b) => b.type === type);
  }

  /** Clear all active buffs. */
  public clearAll(): void {
    this.activeBuffs.length = 0;
  }

  /** Reset the service to initial state. */
  public reset(): void {
    this.activeBuffs.length = 0;
    this.gameSeconds = 0;
    this.nextBuffId = 1;
  }

  private expireBuffs(): void {
    for (let i = this.activeBuffs.length - 1; i >= 0; i -= 1) {
      if (this.gameSeconds >= this.activeBuffs[i].expiresAtSeconds) {
        this.activeBuffs.splice(i, 1);
      }
    }
  }
}