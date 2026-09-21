import type { GameContext } from '../core/game-context';
import type { IdleOfflineProjection, IdleService, IdleSettlementResult } from './idle-service';
import type { GameSaveData } from '../model/save-data';
import { isRewardGranted } from './reward-provider';
import type { OfflineSimulationResult } from '../v3/auto-policy-service';

export type { OfflineSimulationResult } from '../v3/auto-policy-service';

interface OfflineClaimSnapshot {
  readonly idle: IdleOfflineProjection;
  readonly simulation: OfflineSimulationResult;
}

/**
 * Wraps IdleService to provide the offline reward popup flow:
 *  - preview: shows the would-be reward without granting (reuses IdleService).
 *  - claimNormal: 1x base reward (delegates to IdleService.settle).
 *  - claimDouble: 2x total via the mock reward provider (an extra base grant on top
 *    of the normal settlement, never re-running IdleService so time is not advanced twice).
 *
 * A single settlement can be claimed at most once (normal or double), and a double reward is
 * granted at most once per settlement id. Durable de-duplication relies on
 * `player.lastIdleSettlementId` (set by IdleService on commit). The service-wide in-flight lock
 * prevents normal/double races while an asynchronous reward request is unresolved.
 */
export class OfflineRewardService {
  private claimingSettlementId?: string;
  private readonly claimedDoubleSettlementIds = new Set<string>();
  private readonly snapshots = new Map<string, OfflineClaimSnapshot>();

  public constructor(
    private readonly context: GameContext,
    private readonly idle: IdleService,
  ) {}

  public preview(settlementId: string): IdleSettlementResult {
    return this.idle.preview(settlementId);
  }

  /** Unified, mutation-free policy/resource projection used by the welcome summary. */
  public previewSimulation(settlementId: string): OfflineSimulationResult {
    return this.snapshot(settlementId).simulation;
  }

  public isSettled(settlementId: string): boolean {
    return this.context.player.lastIdleSettlementId === settlementId;
  }

  public claimNormal(settlementId: string): OfflineSimulationResult {
    if (this.isSettled(settlementId)) throw new Error('Offline reward already claimed');
    if (this.claimedDoubleSettlementIds.has(settlementId)) throw new Error('Double reward already claimed for this settlement');
    if (this.claimingSettlementId !== undefined) throw new Error('Offline reward claim in progress');
    this.claimingSettlementId = settlementId;
    try {
      const snapshot = this.snapshot(settlementId);
      const settled = this.idle.settleProjection(snapshot.idle);
      this.snapshots.delete(settlementId);
      return Object.freeze({
        ...snapshot.simulation,
        salary: settled.salary,
        cultivation: settled.cultivationExp,
        cultivationExp: settled.cultivationExp,
        spiritStones: settled.spiritStones,
        effectiveSeconds: settled.elapsedSeconds,
        capped: settled.capped,
        duplicate: settled.duplicate,
      });
    } finally {
      this.claimingSettlementId = undefined;
    }
  }

  public claimDouble(settlementId: string, onResult: (success: boolean) => void): void {
    // Reject if the settlement is already settled, already doubled, or a double request for any
    // settlement is currently in flight (re-entrancy / double click).
    if (this.isSettled(settlementId) || this.claimedDoubleSettlementIds.has(settlementId) || this.claimingSettlementId !== undefined) {
      onResult(false);
      return;
    }
    this.claimingSettlementId = settlementId;
    let snapshot: OfflineClaimSnapshot;
    try {
      snapshot = this.snapshot(settlementId);
    } catch (error) {
      this.claimingSettlementId = undefined;
      throw error;
    }
    let callbackHandled = false;
    this.context.rewardProvider.requestReward('OFFLINE_DOUBLE', (result) => {
      // A duplicate provider callback (e.g. a misbehaving ad SDK firing twice) must not grant
      // the reward a second time nor invoke the result callback again.
      if (callbackHandled) return;
      if (this.claimingSettlementId !== settlementId) return;
      callbackHandled = true;
      if (!isRewardGranted(result)) {
        this.claimingSettlementId = undefined;
        onResult(false);
        return;
      }
      // Revalidate after the asynchronous provider boundary, before any resource mutation.
      if (this.isSettled(settlementId) || this.claimedDoubleSettlementIds.has(settlementId)) {
        this.claimingSettlementId = undefined;
        this.snapshots.delete(settlementId);
        onResult(false);
        return;
      }
      const base = snapshot.simulation;
      const previous = this.context.player.toSaveData();
      try {
        if (base.salary > 0) this.context.economy.applyIdleSalary(base.salary * 2);
        if (base.cultivation > 0) this.context.cultivation.applyIdleExperience(base.cultivation * 2);
        if (base.spiritStones > 0) this.context.economy.addSpiritStones(base.spiritStones * 2);
        if (!Number.isSafeInteger(this.context.player.salary) || !Number.isSafeInteger(this.context.player.cultivationExp)) {
          throw new Error('Invalid offline reward');
        }
        this.idle.commitSettlement(settlementId, snapshot.idle.projectedAtMs);
      } catch (error) {
        this.restore(previous);
        this.claimingSettlementId = undefined;
        onResult(false);
        throw error;
      }
      // Mark this settlement id as doubled only after the commit succeeds, so a failed save
      // leaves the settlement open for a retry.
      this.claimedDoubleSettlementIds.add(settlementId);
      this.snapshots.delete(settlementId);
      this.claimingSettlementId = undefined;
      try {
        if (base.salary > 0) this.context.events.emit('salaryChanged', { amount: base.salary * 2, total: this.context.player.salary });
        this.context.events.emit('idleSettled', {
          settlementId,
          salary: base.salary * 2,
          cultivationExp: base.cultivation * 2,
          spiritStones: base.spiritStones * 2,
          elapsedSeconds: base.effectiveSeconds,
          capped: base.capped,
        });
        this.context.events.emit('offlineRewardChanged', { settlementId, doubled: true });
        this.context.events.emit('gameSaved', { reason: 'idle' });
      } catch {
        // Feedback listeners cannot undo a committed transaction.
      }
      onResult(true);
    });
  }

  private snapshot(settlementId: string): OfflineClaimSnapshot {
    if (this.isSettled(settlementId)) {
      this.snapshots.delete(settlementId);
    } else {
      const cached = this.snapshots.get(settlementId);
      if (cached) return cached;
    }
    const idle = this.idle.project(settlementId);
    const simulation = Object.freeze(this.context.autoPolicy.projectOffline(idle));
    const snapshot = Object.freeze({ idle, simulation });
    if (!idle.duplicate) this.snapshots.set(settlementId, snapshot);
    return snapshot;
  }

  private restore(data: GameSaveData): void {
    const player = this.context.player;
    player.salary = data.salary;
    player.cultivationExp = data.cultivationExp;
    if (data.spiritStones !== undefined) player.spiritStones = data.spiritStones;
    player.lastSaveTime = data.lastSaveTime;
    player.lastIdleSettlementId = data.lastIdleSettlementId;
  }
}
