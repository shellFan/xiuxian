import type { FateTalentId } from '../model/save-data';
import type { GameContext } from '../core/game-context';
import { PlayerData } from '../model/player-data';

export const FATE_TALENTS: Readonly<Record<FateTalentId, { readonly name: string; readonly maxRank: number; readonly baseCost: number }>> = Object.freeze({
  born_cow: { name: '天生牛马', maxRank: 3, baseCost: 3 },
  fishing_master: { name: '摸鱼大师', maxRank: 3, baseCost: 3 },
  steady_mind: { name: '道心稳固', maxRank: 3, baseCost: 4 },
  office_veteran: { name: '职场老油条', maxRank: 3, baseCost: 5 },
  lucky_worker: { name: '幸运打工人', maxRank: 3, baseCost: 5 },
  nine_lives: { name: '九命牛马', maxRank: 1, baseCost: 20 },
});

export interface FateRunSettlement {
  readonly runId: string;
  readonly karmaAwarded: number;
  readonly duplicate: boolean;
}

/** Account-level fate progression. Never mutates the established economy or career resources. */
export class RebirthService {
  public constructor(private readonly context: GameContext) {}

  public talentRank(id: FateTalentId): number {
    return this.context.player.rebirthMeta.talentRanks[id] ?? 0;
  }

  public talentOptions() {
    return (Object.entries(FATE_TALENTS) as [FateTalentId, typeof FATE_TALENTS[FateTalentId]][]).map(([id, definition]) => {
      const rank = this.talentRank(id);
      return { id, name: definition.name, rank, maxRank: definition.maxRank, nextCost: rank < definition.maxRank ? definition.baseCost * (rank + 1) : null };
    });
  }

  public settleRun(): FateRunSettlement {
    const run = this.context.player.fateRun;
    if (!run || run.status !== 'ENDED' || !run.terminalOutcomeId) throw new Error('No ended fate run to settle');
    const meta = this.context.player.rebirthMeta;
    if (meta.settledRunIds.includes(run.runId)) return { runId: run.runId, karmaAwarded: 0, duplicate: true };
    const award = Math.max(1, Math.min(200, 2 + run.stage * 2 + run.eventHistory.length));
    return this.transaction(() => {
      const currentMeta = this.context.player.rebirthMeta;
      if (currentMeta.settledRunIds.includes(run.runId)) return { runId: run.runId, karmaAwarded: 0, duplicate: true };
      this.context.player.rebirthMeta = {
        ...currentMeta,
        karma: Math.min(1_000_000_000, currentMeta.karma + award),
        unlockedEndings: Array.from(new Set([...currentMeta.unlockedEndings, run.terminalOutcomeId!])).slice(-64),
        settledRunIds: [...currentMeta.settledRunIds, run.runId].slice(-256),
      };
      return { runId: run.runId, karmaAwarded: award, duplicate: false };
    });
  }

  public rebirth(seed: number): { readonly runId: string; readonly settledRunId: string } {
    const ended = this.context.player.fateRun;
    if (!ended || ended.status !== 'ENDED') throw new Error('Cannot rebirth before the current run ends');
    this.settleRun();
    return this.transaction(() => {
      const current = this.context.player.fateRun;
      if (!current || current.status !== 'ENDED') throw new Error('Current fate run changed before rebirth');
      const settledRunId = current.runId;
      const next = this.context.fateEvents.initializeRun(seed);
      return { runId: next.runId, settledRunId };
    });
  }

  public purchaseTalent(id: string): { readonly id: FateTalentId; readonly rank: number; readonly karmaRemaining: number } {
    if (!Object.prototype.hasOwnProperty.call(FATE_TALENTS, id)) throw new Error('Unknown fate talent');
    const talentId = id as FateTalentId;
    const definition = FATE_TALENTS[talentId];
    const rank = this.talentRank(talentId);
    if (rank >= definition.maxRank) throw new Error('Fate talent is already at maximum rank');
    const cost = definition.baseCost * (rank + 1);
    if (this.context.player.rebirthMeta.karma < cost) throw new Error('Not enough fate karma');
    return this.transaction(() => {
      const meta = this.context.player.rebirthMeta;
      const nextRank = (meta.talentRanks[talentId] ?? 0) + 1;
      if (meta.karma < cost || nextRank > definition.maxRank) throw new Error('Fate talent purchase is no longer valid');
      this.context.player.rebirthMeta = {
        ...meta,
        karma: meta.karma - cost,
        talentRanks: { ...meta.talentRanks, [talentId]: nextRank },
      };
      return { id: talentId, rank: nextRank, karmaRemaining: this.context.player.rebirthMeta.karma };
    });
  }

  private transaction<T>(action: () => T): T {
    const snapshot = this.context.player.toSaveData();
    try {
      const result = action();
      this.context.saveService.save(this.context.player);
      return result;
    } catch (error) {
      Object.assign(this.context.player, new PlayerData(snapshot));
      throw error;
    }
  }
}
