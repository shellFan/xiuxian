import type { GameContext } from '../core/game-context';
import type { EvidenceItemState, EvidenceType } from '../model/save-data';

const MAX_EVIDENCE = 60;

/**
 * V4 证据系统（§18~§21）。
 *
 * 证据不是库存垃圾：它不解锁商店、不加属性，唯一作用是解锁事件选项
 * （EventChoiceRequirements.evidence）并在责任判定中把锅送回原主。
 * 来源刻意克制：Git 记录来自干活、聊天记录来自"让他群里说清楚"这类选择。
 */
export class EvidenceService {
  public constructor(private readonly context: GameContext) {}

  public all(): EvidenceItemState[] {
    return [...this.context.player.evidence];
  }

  public has(type: EvidenceType): boolean {
    return this.context.player.evidence.some((e) => e.type === type);
  }

  public count(type: EvidenceType): number {
    return this.context.player.evidence.filter((e) => e.type === type).length;
  }

  /** 持有可反击的证据类型集合（事件条件评估用）。 */
  public heldTypes(): EvidenceType[] {
    return [...new Set(this.context.player.evidence.map((e) => e.type))];
  }

  public grant(type: EvidenceType, label: string): EvidenceItemState {
    const player = this.context.player;
    const existing = player.evidence.find((e) => e.type === type && e.label === label);
    if (existing) return existing;
    const day = Math.max(1, player.gameDay?.dayIndex ?? 1);
    const item: EvidenceItemState = {
      id: `ev_${type}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`,
      type,
      label,
      dayIndex: day,
      createdAt: Date.now(),
    };
    // 上限保护：最旧的先淘汰，防止无限膨胀。
    const next = [...player.evidence, item];
    player.evidence = next.length > MAX_EVIDENCE ? next.slice(next.length - MAX_EVIDENCE) : next;
    return item;
  }

  /** 消耗一份证据（用于复盘定责：拿出来的记录就交出去了）。 */
  public consume(type: EvidenceType): EvidenceItemState | null {
    const player = this.context.player;
    const idx = player.evidence.findIndex((e) => e.type === type);
    if (idx < 0) return null;
    const [item] = player.evidence.splice(idx, 1);
    player.evidence = [...player.evidence];
    return item ?? null;
  }
}
