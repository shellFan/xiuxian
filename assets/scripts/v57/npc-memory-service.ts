import type { GameContext } from '../core/game-context';
import type { NpcId } from '../v2/npc-weekend-service';
import type { NpcMemoryState } from '../model/save-data';

/**
 * V5.7 Phase F — NPC 记忆（NpcMemory）。
 * 关系不只是数字：flags 记住"他抢过你的功/你帮过他"，影响后续 NPC 行为倾向。
 * 记忆跨天持久，不随日结算重置。
 */

export type NpcMemoryKind =
  | 'HELPED_ME' | 'REFUSED_ME' | 'BLAMED_ME' | 'DEFENDED_ME'
  | 'STOLE_MY_CREDIT' | 'I_STOLE_CREDIT' | 'COVERED_SHIFT'
  | 'SHARED_EVIDENCE' | 'BACKED_ME_IN_MEETING' | 'LEFT_ME_ALONE'
  | 'WORKED_OVERTIME_TOGETHER' | 'PROTECTED_ME' | 'THREW_ME_UNDER_BUS';

export const MEMORY_CN: Record<NpcMemoryKind, string> = {
  HELPED_ME: '帮过我',
  REFUSED_ME: '拒绝过我',
  BLAMED_ME: '甩锅给我',
  DEFENDED_ME: '为我辩护过',
  STOLE_MY_CREDIT: '抢过我功劳',
  I_STOLE_CREDIT: '我抢过他功劳',
  COVERED_SHIFT: '替我值过班',
  SHARED_EVIDENCE: '分享过证据',
  BACKED_ME_IN_MEETING: '会上帮我说过话',
  LEFT_ME_ALONE: '对我袖手旁观',
  WORKED_OVERTIME_TOGETHER: '一起加过班',
  PROTECTED_ME: '保护过我',
  THREW_ME_UNDER_BUS: '把我卖过',
};

export interface NpcMemoryEntry {
  readonly dayIndex: number;
  readonly kind: string;
  readonly text: string;
}


export interface NpcCardView {
  readonly npcId: NpcId;
  readonly name: string;
  readonly stageName: string;
  readonly memories: readonly NpcMemoryEntry[];
  readonly flags: readonly string[];
  /** 基于 flags 的行为倾向说明（展示用）。 */
  readonly disposition: string;
}

const STAGE_CN: Record<string, string> = {
  STRANGER: '陌生', ACQUAINTANCE: '一般', FAMILIAR: '熟悉', TRUSTED: '信任', BRO: '铁哥们',
};

export class NpcMemoryService {
  public constructor(private readonly context: GameContext) {}

  public memory(npcId: string): NpcMemoryState {
    const all = this.context.player.npcMemories ?? {};
    return all[npcId] ?? { flags: [], entries: [] };
  }

  /** 记忆写入（去重 flag；entries 保留最近 12 条）。 */
  public remember(npcId: string, kind: NpcMemoryKind, text: string): void {
    if (!npcId || !kind) return;
    const all: Record<string, NpcMemoryState> = { ...(this.context.player.npcMemories ?? {}) };
    const current: NpcMemoryState = all[npcId] ?? { flags: [], entries: [] };
    const flags: readonly string[] = current.flags.includes(kind) ? current.flags : [...current.flags, kind];
    const entries = [...current.entries, { dayIndex: this.context.gameDay?.dayIndex() ?? 1, kind, text }].slice(-12);
    all[npcId] = { flags, entries };
    this.context.player.npcMemories = all;
  }

  public countOf(npcId: string, kind: string): number {
    return this.memory(npcId).entries.filter((e) => e.kind === kind).length;
  }

  /** 恩情值：帮他次数 - 甩他次数。 */
  private goodwill(npcId: string): number {
    return this.countOf(npcId, 'HELPED_ME') + this.countOf(npcId, 'COVERED_SHIFT') + this.countOf(npcId, 'PROTECTED_ME')
      - this.countOf(npcId, 'THREW_ME_UNDER_BUS') - this.countOf(npcId, 'I_STOLE_CREDIT');
  }

  /**
   * NPC 记恩/记仇 → 关键时刻行为概率。
   * 事故时他是否帮你作证 / 跨职业求助时是否搭把手。不是100%，性格仍在。
   */
  public assistChance(npcId: string, base = 0.3): number {
    const relation = this.context.npc?.value(npcId as NpcId) ?? 50;
    let chance = base + this.goodwill(npcId) * 0.08 + Math.max(0, (relation - 50) / 200);
    if (this.memory(npcId).flags.includes('THREW_ME_UNDER_BUS')) chance *= 0.7;
    if (this.memory(npcId).flags.includes('BLAMED_ME')) chance *= 0.8;
    return Math.max(0.05, Math.min(0.9, chance));
  }

  /** NPC 卡视图（§117：不显示内部 relation 数字）。 */
  public card(npcId: NpcId): NpcCardView {
    const stage = this.context.npc?.stage(npcId) ?? 'STRANGER';
    const m = this.memory(npcId);
    let disposition = '他记不太清你了。';
    if (m.flags.includes('THREW_ME_UNDER_BUS') || m.flags.includes('STOLE_MY_CREDIT')) {
      disposition = '他欠你一次。你自己心里有数。';
    } else if (this.goodwill(npcId) >= 2) {
      disposition = '关键时刻，他大概率会拉你一把。';
    } else if (m.flags.includes('HELPED_ME')) {
      disposition = '你们有过几次互助，还算靠谱。';
    }
    return {
      npcId,
      name: this.npcName(npcId),
      stageName: STAGE_CN[stage] ?? '一般',
      memories: m.entries.slice(-5),
      flags: m.flags,
      disposition,
    };
  }

  private npcName(npcId: NpcId): string {
    const names: Record<string, string> = {
      SENIOR: '老油条', JUNIOR: '新人', TESTER: '测试仙子', PRODUCT: '产品真君',
      OPS: '运维老哥', BOSS: '领导', HR: 'HR仙子', CLIENT: '客户',
    };
    return names[npcId] ?? String(npcId);
  }
}
