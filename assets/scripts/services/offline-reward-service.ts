import type { GameContext } from '../core/game-context';
import type { IdleService, IdleSettlementResult } from './idle-service';
import type { GameSaveData } from '../model/save-data';
import { isRewardGranted } from './reward-provider';

/**
 * Wraps IdleService to provide the offline reward popup flow:
 *  - preview: shows the would-be reward without granting (reuses IdleService).
 *  - claimNormal: 1x base reward (delegates to IdleService.settle).
 *  - claimDouble: 2x total via the mock reward provider (an extra base grant on top
 *    of the normal settlement, never re-running IdleService so time is not advanced twice).
 *
 * The double-reward guard is SCOPED PER SETTLEMENT. A single settlement can be claimed at most
 * once (normal or double), and a double reward is granted at most once per settlement id; this is
 * independent across different settlement ids. Durable de-duplication still relies on
 * `player.lastIdleSettlementId` (set by IdleService on commit). The in-service state below only
 * guards against re-entrancy (a request still in flight) and duplicate reward-provider callbacks.
 */
export class OfflineRewardService {
  private claimingSettlementId?: string;
  private readonly claimedDoubleSettlementIds = new Set<string>();

  public constructor(
    private readonly context: GameContext,
    private readonly idle: IdleService,
  ) {}

  public preview(settlementId: string): IdleSettlementResult {
    return this.idle.preview(settlementId);
  }

  public isSettled(settlementId: string): boolean {
    return this.context.player.lastIdleSettlementId === settlementId;
  }

  public claimNormal(settlementId: string): IdleSettlementResult {
    if (this.isSettled(settlementId)) throw new Error('Offline reward already claimed');
    if (this.claimedDoubleSettlementIds.has(settlementId)) throw new Error('Double reward already claimed for this settlement');
    return this.idle.settle(settlementId);
  }

  public claimDouble(settlementId: string, onResult: (success: boolean) => void): void {
    // Reject if the settlement is already settled, already doubled, or a double request for any
    // settlement is currently in flight (re-entrancy / double click).
    if (this.isSettled(settlementId) || this.claimedDoubleSettlementIds.has(settlementId) || this.claimingSettlementId !== undefined) {
      onResult(false);
      return;
    }
    this.claimingSettlementId = settlementId;
    let settled = false;
    this.context.rewardProvider.requestReward('OFFLINE_DOUBLE', (result) => {
      // A duplicate provider callback (e.g. a misbehaving ad SDK firing twice) must not grant
      // the reward a second time nor invoke the result callback again.
      if (settled) return;
      if (this.claimingSettlementId !== settlementId) return;
      settled = true;
      this.claimingSettlementId = undefined;
      if (!isRewardGranted(result)) {
        onResult(false);
        return;
      }
      // Belt-and-suspenders: never grant a second double for the same settlement id.
      if (this.claimedDoubleSettlementIds.has(settlementId)) return;
      const base = this.idle.preview(settlementId);
      const previous = this.context.player.toSaveData();
      try {
        if (base.salary > 0) this.context.economy.applyIdleSalary(base.salary * 2);
        if (base.cultivationExp > 0) this.context.cultivation.applyIdleExperience(base.cultivationExp * 2);
        if (!Number.isSafeInteger(this.context.player.salary) || !Number.isSafeInteger(this.context.player.cultivationExp)) {
          throw new Error('Invalid offline reward');
        }
        this.idle.commitSettlement(settlementId);
      } catch (error) {
        this.restore(previous);
        onResult(false);
        throw error;
      }
      // Mark this settlement id as doubled only after the commit succeeds, so a failed save
      // leaves the settlement open for a retry.
      this.claimedDoubleSettlementIds.add(settlementId);
      try {
        if (base.salary > 0) this.context.events.emit('salaryChanged', { amount: base.salary * 2, total: this.context.player.salary });
        this.context.events.emit('idleSettled', {
          settlementId,
          salary: base.salary * 2,
          cultivationExp: base.cultivationExp * 2,
          elapsedSeconds: base.elapsedSeconds,
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

  private restore(data: GameSaveData): void {
    const player = this.context.player;
    player.salary = data.salary;
    player.cultivationExp = data.cultivationExp;
    player.lastSaveTime = data.lastSaveTime;
    player.lastIdleSettlementId = data.lastIdleSettlementId;
  }
}
