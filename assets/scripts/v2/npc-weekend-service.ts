/**
 * V2 NPC 与周末系统（Gameplay V2 §43~§48/§12）。
 *
 * NPC 关系 -100~100，阶段 HOSTILE/COLD/NORMAL/FRIENDLY/TRUSTED（§45）。
 * 关系主要来自事件选择（§46，V2EventService.applyEffects 已写 relationships），
 * 本服务提供：阶段查询、关系驱动的数值效果（晋升成功率/事件权重）、
 * NPC 信息视图（UI §128）。
 *
 * 周末活动（§12）：周六首次打开游戏时三选一（闭关/补觉/聚会），
 * exactly-once（dayIndex 记录），效果即时结算。
 */
import type { GameContext } from '../core/game-context';
import type { GameClockV2 } from './v2-clock';
import type { GameDayService } from './game-day-service';
import type { InnerDemonService } from './inner-demon-service';

export type NpcId = 'BOSS' | 'PRODUCT' | 'TESTER' | 'JUNIOR' | 'VETERAN' | 'HR';
export const NPC_IDS: readonly NpcId[] = ['BOSS', 'PRODUCT', 'TESTER', 'JUNIOR', 'VETERAN', 'HR'];

export interface NpcDef {
  readonly id: NpcId;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** 关系增益领域（文案）。 */
  readonly influence: string;
}

/** §44 六位核心 NPC。 */
export const NPCS: readonly NpcDef[] = [
  { id: 'BOSS', name: '老板', title: '炼气九层·部门总监', description: '画的饼能当饭吃，发的火能当空调用。', influence: '晋升答辩 / 绩效 / 查岗事件' },
  { id: 'PRODUCT', name: '产品经理', title: '筑基三层·需求化身', description: '口头禅是"很简单"。手中的原型图能把楼砍掉三层。', influence: '需求事件 / 改版风险' },
  { id: 'TESTER', name: '测试小哥', title: '金丹一层·bug猎人', description: '能在 demo 环境复现生产问题。他的红色标注是团队的福音。', influence: 'Bug 预警 / 测试打回' },
  { id: 'JUNIOR', name: '摸鱼小师妹', title: '炼气四层·入职一年', description: '摸鱼天赋异禀，运气好到离谱。总在正确的时间出现在错误的地方。', influence: '摸鱼 / 材料 / 情报' },
  { id: 'VETERAN', name: '老油条前辈', title: '元婴三层·十年司龄', description: '见过四任老板。他的茶杯里泡的不是茶，是历史。', influence: '隐藏功法 / 甩锅 / 情报' },
  { id: 'HR', name: 'HR仙子', title: '化神一层·人心管理', description: '微笑是她的法器。她知道每个人的薪资，没人知道她的。', influence: '晋升窗口 / 裁员 / 工资' },
];

export type RelationshipStage = 'HOSTILE' | 'COLD' | 'NORMAL' | 'FRIENDLY' | 'TRUSTED';

export interface NpcView {
  readonly id: NpcId;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly influence: string;
  readonly value: number;
  readonly stage: RelationshipStage;
  readonly stageLabel: string;
}

/** 关系 → 阶段（§45）。 */
export function relationshipStage(value: number): RelationshipStage {
  if (value >= 60) return 'TRUSTED';
  if (value >= 20) return 'FRIENDLY';
  if (value > -20) return 'NORMAL';
  if (value > -60) return 'COLD';
  return 'HOSTILE';
}

const STAGE_LABELS: Record<RelationshipStage, string> = {
  HOSTILE: '敌视', COLD: '冷淡', NORMAL: '普通', FRIENDLY: '友好', TRUSTED: '信任',
};

export type WeekendActivityId = 'SECLUDED_CULTIVATE' | 'SLEEP_MADLY' | 'FRIENDS_GATHER';

export interface WeekendActivityResult {
  readonly activity: WeekendActivityId;
  readonly summary: string;
}

export class NpcService {
  public constructor(private readonly context: GameContext) {}

  public value(npc: NpcId): number {
    return this.context.player.relationships[npc] ?? 0;
  }

  public stage(npc: NpcId): RelationshipStage {
    return relationshipStage(this.value(npc));
  }

  /** 变更关系（clamp -100~100，§265）。 */
  public change(npc: NpcId, delta: number): number {
    const p = this.context.player;
    const before = p.relationships[npc] ?? 0;
    const after = Math.max(-100, Math.min(100, before + Math.floor(delta)));
    if (after === before) return 0;
    p.relationships[npc] = after;
    this.context.events.emit('relationshipChanged', { npc, delta: after - before, total: after });
    return after - before;
  }

  /** UI 视图（§128）。 */
  public views(): NpcView[] {
    return NPCS.map((def) => {
      const value = this.value(def.id);
      const stage = relationshipStage(value);
      return { ...def, value, stage, stageLabel: STAGE_LABELS[stage] };
    });
  }

  /** §47 关系驱动的数值效果。 */
  /** BOSS 关系 → 晋升成功率加成（TRUSTED +10 / FRIENDLY +5 / COLD -5 / HOSTILE -10）。 */
  public promotionChanceBonus(): number {
    const v = this.value('BOSS');
    if (v >= 60) return 10;
    if (v >= 20) return 5;
    if (v > -20) return 0;
    if (v > -60) return -5;
    return -10;
  }

  /** HR 关系 → 晋升窗口提前/额外信息（折算为成功率小加成）。 */
  public hrPromotionInsight(): number {
    const v = this.value('HR');
    if (v >= 60) return 5;
    if (v >= 20) return 2;
    return 0;
  }

  /** TESTER 关系 → BUG 事件权重乘子（好关系=预警，负面更少）。 */
  public bugEventWeightMul(): number {
    const v = this.value('TESTER');
    if (v >= 60) return 0.8;
    if (v >= 20) return 0.9;
    if (v > -20) return 1;
    return 1.15;
  }

  /** VETERAN 关系 → 负面事件伤害乘子（老油条帮你背锅/指点）。 */
  public negativeEventMul(): number {
    const v = this.value('VETERAN');
    if (v >= 60) return 0.7;
    if (v >= 20) return 0.85;
    if (v > -20) return 1;
    return 1.1;
  }

  /** JUNIOR 关系 → 材料/情报掉落乘子。 */
  public materialMul(): number {
    const v = this.value('JUNIOR');
    if (v >= 60) return 1.25;
    if (v >= 20) return 1.1;
    if (v > -20) return 1;
    return 0.95;
  }

  /** PRODUCT 关系 → PRODUCT 事件道心损耗乘子。 */
  public productMindLossMul(): number {
    const v = this.value('PRODUCT');
    if (v >= 60) return 0.75;
    if (v >= 20) return 0.9;
    if (v > -20) return 1;
    return 1.2;
  }

  /** 关系变化速率校验（§284 模拟用）：单日单 NPC 变化不应超过 30。 */
  public dailyDriftGuard(delta: number): boolean {
    return Math.abs(delta) <= 30;
  }
}

/** 周末活动（§12）。效果即时结算，每周末只可选一次。 */
export class WeekendService {
  public constructor(
    private readonly context: GameContext,
    private readonly clock: GameClockV2,
    private readonly gameDay: GameDayService,
    private readonly demons: InnerDemonService,
  ) {}

  /** 本周末是否已选择（按 weekendIndex 记录旗标）。 */
  public currentWeekendIndex(): number {
    return Math.floor(this.gameDay.dayIndex() / 7);
  }

  public hasChosen(): boolean {
    return this.context.player.eventFlags[`weekend_${this.currentWeekendIndex()}`] === true;
  }

  public options(): readonly { id: WeekendActivityId; name: string; description: string }[] {
    return [
      { id: 'SECLUDED_CULTIVATE', name: '闭关修炼', description: '修为大进（+80），道心恢复少（+10）。' },
      { id: 'SLEEP_MADLY', name: '疯狂补觉', description: '道心大复（+45），心魔消散（-15）。' },
      { id: 'FRIENDS_GATHER', name: '朋友聚会', description: 'JUNIOR/VETERAN 关系+8，道心+20，随机小机缘。' },
    ];
  }

  public choose(activity: WeekendActivityId): WeekendActivityResult {
    if (this.hasChosen()) throw new Error('本周末已选择过活动');
    if (!this.clock.isWeekend()) throw new Error('当前不是周末');
    const p = this.context.player;
    p.eventFlags[`weekend_${this.currentWeekendIndex()}`] = true;
    let summary = '';
    if (activity === 'SECLUDED_CULTIVATE') {
      p.cultivationExp += 80;
      this.context.mind.applyDelta(10);
      summary = '闭关两日，修为 +80，道心 +10。出关时窗外已是周一。';
    } else if (activity === 'SLEEP_MADLY') {
      this.context.mind.applyDelta(45);
      this.demons.reduce(15);
      summary = '睡了 16 小时。道心 +45，心魔 -15。梦里的需求文档全都自动关闭了。';
    } else {
      const npc = new NpcService(this.context);
      npc.change('JUNIOR', 8);
      npc.change('VETERAN', 8);
      this.context.mind.applyDelta(20);
      const luck = Math.random();
      if (luck < 0.3) {
        p.materials['mat_fishing_tip'] = (p.materials['mat_fishing_tip'] ?? 0) + 2;
        summary = '聚会尽兴：JUNIOR/VETERAN 关系 +8，道心 +20，还顺来了两份摸鱼心得。';
      } else if (luck < 0.5) {
        p.materials['mat_spirit_energy'] = (p.materials['mat_spirit_energy'] ?? 0) + 1;
        summary = '聚会上老油条神秘兮兮给了你一瓶仙气：关系 +8，道心 +20。';
      } else {
        summary = '普通但温暖的一次聚会：关系 +8，道心 +20。';
      }
    }
    this.context.events.emit('weekendActivityDone', { activity, summary });
    return { activity, summary };
  }
}
