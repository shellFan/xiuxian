/**
 * InnerDemonService（Gameplay V2 §26~§30）— 心魔系统。
 *
 * 心魔 innerDemon ∈ [0,100]，是长期风险资源：
 *  - 来源：低道心持续流失、连续加班、背锅、晋升失败、高压事件（事件效果直接调 add）。
 *  - Debuff：达到阈值解锁 8 种心魔（§28），对应真实数值效果，由 getModifier() 提供给经济/事件层。
 *  - 恢复：周末补觉、摸鱼、丹药、功法、NPC、晋升成功（调 reduce）。
 *
 * 道心 0 不死档（§26）：modoney 修为仍有 50% 基础挂机 —— 该保底在 economy tick 侧实现，
 * 本服务只提供 demonModifiers 供其读取。
 */
import type { GameContext } from '../core/game-context';

export interface InnerDemonDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** 解锁阈值。 */
  readonly threshold: number;
}

/** §28 心魔定义（8 个）。threshold 即解锁所需心魔值。 */
export const INNER_DEMONS: readonly InnerDemonDef[] = [
  { id: 'demon_mental_friction', name: '精神内耗', description: '夜里复盘白天的每一句话。道心恢复 -25%。', threshold: 10 },
  { id: 'demon_lie_flat', name: '摆烂', description: '工位常驻咸鱼气质。努力工作收益 -20%，摸鱼修为 +20%。', threshold: 25 },
  { id: 'demon_requirement_phobia', name: '需求恐惧症', description: '看到产品经理的头像弹出来就心悸。需求类事件道心损耗 +50%。', threshold: 40 },
  { id: 'demon_bug', name: 'Bug心魔', description: '你梦见自己变成了一个 Stack Overflow 上没人回答的问题。Bug 事件负面概率提高。', threshold: 50 },
  { id: 'demon_meeting_ptsd', name: '会议PTSD', description: '"简单同步一下"七个字让你血压飙升。会议类事件额外心魔。', threshold: 60 },
  { id: 'demon_overtime_hallucination', name: '加班幻觉', description: '你开始给工位的绿萝汇报进度。道心低于30时每小时额外心魔。', threshold: 70 },
  { id: 'demon_quit_impulse', name: '离职冲动', description: '辞职信在草稿箱里存了四个版本。绩效收益 -15%。', threshold: 80 },
  { id: 'demon_boss_phobia', name: '老板恐惧症', description: '老板的脚步声就是你的紧箍咒。Boss 事件道心损耗 +30%。', threshold: 90 },
];

export type InnerDemonModifier =
  | 'mindRecoveryDown'
  | 'workDown'
  | 'fishingCultivationUp'
  | 'productEventMindLossUp'
  | 'bugEventNegativeUp'
  | 'meetingEventDemonUp'
  | 'lowMindDemonPerHour'
  | 'performanceDown'
  | 'bossEventMindLossUp';

export class InnerDemonService {
  /** 触发 daemon tick 的累积秒数（每小时结算一次被动来源）。 */
  private demonAccumulatedSeconds = 0;

  public constructor(private readonly context: GameContext) {}

  public value(): number {
    return this.context.player.innerDemon;
  }

  /** 增加心魔（clamp 0~100）。返回实际变化。 */
  public add(amount: number): number {
    if (!Number.isFinite(amount) || amount === 0) return 0;
    const before = this.context.player.innerDemon;
    const after = Math.min(100, Math.max(0, Math.floor(before + amount)));
    if (after === before) return 0;
    this.context.player.innerDemon = after;
    this.refreshActiveDemons();
    this.context.events.emit('innerDemonChanged', { delta: after - before, total: after });
    return after - before;
  }

  /** 减少心魔（恢复途径）。返回实际变化（正数）。 */
  public reduce(amount: number): number {
    return -this.add(-Math.abs(amount));
  }

  /** 当前生效的心魔 id 列表（按解锁阈值）。 */
  public activeDemons(): string[] {
    const v = this.value();
    return INNER_DEMONS.filter((d) => v >= d.threshold).map((d) => d.id);
  }

  /** 重算并存档 activeDemons（有变化时发事件）。 */
  public refreshActiveDemons(): void {
    const next = this.activeDemons();
    const before = this.context.player.activeDemons;
    if (before.length !== next.length || before.some((id, i) => id !== next[i])) {
      this.context.player.activeDemons = next;
      this.context.events.emit('demonsChanged', { active: next });
    }
  }

  /** 查询某个 modifier 是否生效（供经济/事件层消费）。 */
  public has(modifier: InnerDemonModifier): boolean {
    const v = this.value();
    switch (modifier) {
      case 'mindRecoveryDown': return v >= 10;
      case 'workDown': return v >= 25;
      case 'fishingCultivationUp': return v >= 25;
      case 'productEventMindLossUp': return v >= 40;
      case 'bugEventNegativeUp': return v >= 50;
      case 'meetingEventDemonUp': return v >= 60;
      case 'lowMindDemonPerHour': return v >= 70;
      case 'performanceDown': return v >= 80;
      case 'bossEventMindLossUp': return v >= 90;
      default: return false;
    }
  }

  /** 数值化的 modifier 乘子（经济层直接乘）。 */
  public workMultiplier(): number {
    return this.has('workDown') ? 0.8 : 1;
  }

  public fishingCultivationMultiplier(): number {
    return this.has('fishingCultivationUp') ? 1.2 : 1;
  }

  public performanceMultiplier(): number {
    return this.has('performanceDown') ? 0.85 : 1;
  }

  public mindRecoveryMultiplier(): number {
    return this.has('mindRecoveryDown') ? 0.75 : 1;
  }

  /**
   * 每小时被动心魔来源（tick 驱动）：
   *  - 道心 < 30 且心魔 >= 70（加班幻觉）：+2/h
   *  - 道心 < 10（濒临崩溃）：+3/h
   */
  public tick(seconds: number): void {
    if (seconds <= 0) return;
    this.demonAccumulatedSeconds += seconds;
    if (this.demonAccumulatedSeconds < 3600) return;
    const hours = Math.floor(this.demonAccumulatedSeconds / 3600);
    this.demonAccumulatedSeconds -= hours * 3600;
    const player = this.context.player;
    let delta = 0;
    if (player.mind < 10) delta += 3;
    else if (player.mind < 30 && this.has('lowMindDemonPerHour')) delta += 2;
    if (delta > 0) this.add(delta * hours);
  }
}
