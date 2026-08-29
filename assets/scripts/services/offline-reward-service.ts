import type { GameContext } from '../core/game-context';
import type { IdleService, IdleSettlementResult } from './idle-service';
import type { GameSaveData } from '../model/save-data';

/**
 * Wraps IdleService to provide the offline reward popup flow:
 *  - preview: shows the would-be reward without granting (reuses IdleService).
 *  - claimNormal: 1x base reward (delegates to IdleService.settle).
 *  - claimDouble: 2x total via the mock reward provider (an extra base grant on top
 *    of the normal settlement, never re-running IdleService so time is not advanced twice).
 *
 * Normal and double are mutually exclusive and a settlement id is claimed only once,
 * so reopening the popup or double-clicking cannot grant rewards repeatedly.
 */
export class OfflineRewardService {
  private doubleClaimed = false;
  private claimingDouble = false;

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
    if (this.doubleClaimed) throw new Error('Double reward already claimed');
    return this.idle.settle(settlementId);
  }

  public claimDouble(settlementId: string, onResult: (success: boolean) => void): void {
    if (this.isSettled(settlementId) || this.doubleClaimed || this.claimingDouble) {
      onResult(false);
      return;
    }
    this.claimingDouble = true;
    this.context.rewardProvider.requestReward('OFFLINE_DOUBLE', (granted) => {
      if (!granted) {
        this.claimingDouble = false;
        onResult(false);
        return;
      }
      // A duplicate provider callback (e.g. a misbehaving ad SDK firing twice) must
      // not grant the reward a second time nor invoke the result callback again.
      if (this.doubleClaimed) {
        this.claimingDouble = false;
        return;
      }
      this.doubleClaimed = true;
      this.claimingDouble = false;
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
        this.doubleClaimed = false;
        onResult(false);
        throw error;
      }
      try {
        if (base.salary > 0) this.context.events.emit('salaryChanged', { amount: base.salary * 2, total: this.context.player.salary });
        this.context.events.emit('idleSettled', {
          settlementId,
          salary: base.salary * 2,
          cultivationExp: base.cultivationExp * 2,
          elapsedSeconds: base.elapsedSeconds,
          capped: base.capped,
        });
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
