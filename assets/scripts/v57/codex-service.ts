import { ALL_MONSTERS } from './battle-merge';
import { V57_EQUIPMENT, allEquipmentDefs, RARITY_CN } from './loot-service';
import type { GameContext } from '../core/game-context';

/**
 * V5.7 Phase D — Codex 修仙图鉴（§41）。
 * 五个页签：怪物 / Boss / 装备 / 事件 / 成就。未发现显示 ???，玩家自己探索。
 */

export type CodexTab = 'MONSTER' | 'BOSS' | 'EQUIPMENT' | 'EVENT' | 'ACHIEVEMENT';

export interface CodexEntryView {
  readonly id: string;
  readonly name: string;
  readonly discovered: boolean;
  readonly detail?: string;
}

export interface CodexView {
  readonly tab: CodexTab;
  readonly total: number;
  readonly discovered: number;
  readonly entries: readonly CodexEntryView[];
}

export class CodexService {
  public constructor(private readonly context: GameContext) {}

  private state(): { monsters: string[]; bosses: string[]; equipment: string[]; events: string[] } {
    const codex = this.context.player.codex ?? { monsters: [], bosses: [], equipment: [], events: [] };
    return {
      monsters: [...(codex.monsters ?? [])],
      bosses: [...(codex.bosses ?? [])],
      equipment: [...(codex.equipment ?? [])],
      events: [...(codex.events ?? [])],
    };
  }

  public discoverMonster(defId: string): void {
    if (!defId || ALL_MONSTERS.every((m) => m.id !== defId)) return;
    const s = this.state();
    const isBoss = ALL_MONSTERS.find((m) => m.id === defId)?.tier === 'BOSS';
    if (isBoss) {
      if (!s.bosses.includes(defId)) s.bosses.push(defId);
    } else if (!s.monsters.includes(defId)) {
      s.monsters.push(defId);
    }
    this.context.player.codex = s;
  }

  public discoverEquipment(id: string): void {
    if (!id) return;
    const s = this.state();
    if (!s.equipment.includes(id)) {
      s.equipment.push(id);
      this.context.player.codex = s;
    }
  }

  public discoverEvent(eventId: string): void {
    if (!eventId) return;
    const s = this.state();
    if (!s.events.includes(eventId)) {
      s.events.push(eventId);
      this.context.player.codex = s;
    }
  }

  /** 图鉴视图（§41：未发现 ???，不显示条件）。 */
  public view(tab: CodexTab): CodexView {
    const s = this.state();
    switch (tab) {
      case 'MONSTER': {
        const entries = ALL_MONSTERS.filter((m) => m.tier !== 'BOSS').map((m) => ({
          id: m.id, name: s.monsters.includes(m.id) ? m.name : '???', discovered: s.monsters.includes(m.id),
          detail: s.monsters.includes(m.id) ? `HP ${m.hp} · 攻击 ${m.attack}` : undefined,
        }));
        return { tab, total: entries.length, discovered: entries.filter((e) => e.discovered).length, entries };
      }
      case 'BOSS': {
        const entries = ALL_MONSTERS.filter((m) => m.tier === 'BOSS').map((m) => ({
          id: m.id, name: s.bosses.includes(m.id) ? m.name : '???', discovered: s.bosses.includes(m.id),
          detail: s.bosses.includes(m.id) ? `HP ${m.hp} · 攻击 ${m.attack}` : undefined,
        }));
        return { tab, total: entries.length, discovered: entries.filter((e) => e.discovered).length, entries };
      }
      case 'EQUIPMENT': {
        const entries = allEquipmentDefs().map((e) => ({
          id: e.id, name: s.equipment.includes(e.id) ? e.name : '???', discovered: s.equipment.includes(e.id),
          detail: s.equipment.includes(e.id) ? (RARITY_CN[e.rarity] ?? e.rarity) : undefined,
        }));
        return { tab, total: entries.length, discovered: entries.filter((e) => e.discovered).length, entries };
      }
      case 'EVENT': {
        const secretTotal = this.context.week?.secretTotal() ?? 0;
        const discoveredSecrets = this.context.week?.discoveredSecrets() ?? [];
        const entries: CodexEntryView[] = discoveredSecrets.map((sec) => ({ id: sec.id, name: sec.name, discovered: true, detail: sec.text }));
        const remaining = Math.max(0, secretTotal - discoveredSecrets.length);
        for (let i = 0; i < remaining; i += 1) entries.push({ id: `secret_unknown_${i}`, name: '???', discovered: false });
        return { tab, total: entries.length, discovered: discoveredSecrets.length, entries };
      }
      case 'ACHIEVEMENT': {
        const configs = this.context.achievements.getConfigs();
        const entries = configs.map((a) => ({
          id: a.id,
          name: this.context.achievements.isUnlocked(a.id) ? (a.name ?? a.id) : '???',
          discovered: this.context.achievements.isUnlocked(a.id),
          detail: a.description,
        }));
        return { tab, total: entries.length, discovered: entries.filter((e) => e.discovered).length, entries };
      }
      default:
        return { tab, total: 0, discovered: 0, entries: [] };
    }
  }
}
