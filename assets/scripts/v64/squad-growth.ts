/**
 * V6.4 员工品质 + 升星 + 职业羁绊
 *
 * 品质（Rarity）：招募时随机决定，影响基础属性倍率
 *   普通(0)×1.0 | 优秀(1)×1.2 | 精英(2)×1.5 | 史诗(3)×2.0 | 传说(4)×3.0
 *
 * 升星（Stars）：消耗同品质碎片+灵石，每星+25%攻击成长
 *   1~5星，升星不改变品质，是平行成长线
 *
 * 羁绊（Synergy）：根据阵容职业组合激活团队增益
 *   Java+测试=Bug追踪 | 前端+运维=稳定发布 | Java+运维=高可用 | 四职=全栈攻坚
 */

import type { SquadProfession } from '../v63/auto-battle-types';

// ── 品质 ─────────────────────────────────────────────────────────────────────

export type Rarity = 0 | 1 | 2 | 3 | 4;

export interface RarityDef {
  readonly level: Rarity;
  readonly label: string;
  readonly emoji: string;
  readonly color: string;
  /** 基础攻击倍率 */
  readonly atkMult: number;
  /** 成长系数额外加成 */
  readonly growthBonus: number;
  /** 招募权重（概率权重） */
  readonly weight: number;
}

export const RARITIES: readonly RarityDef[] = [
  { level: 0, label: '普通', emoji: '⬜', color: '#9e9e9e', atkMult: 1.0, growthBonus: 0, weight: 50 },
  { level: 1, label: '优秀', emoji: '🟩', color: '#4caf50', atkMult: 1.2, growthBonus: 0.05, weight: 30 },
  { level: 2, label: '精英', emoji: '🟦', color: '#2196f3', atkMult: 1.5, growthBonus: 0.10, weight: 13 },
  { level: 3, label: '史诗', emoji: '🟪', color: '#9c27b0', atkMult: 2.0, growthBonus: 0.18, weight: 6 },
  { level: 4, label: '传说', emoji: '🟧', color: '#ff5722', atkMult: 3.0, growthBonus: 0.30, weight: 1 },
];

export function rarityDef(level: Rarity): RarityDef {
  return RARITIES.find(r => r.level === level) ?? RARITIES[0];
}

/** 招募时随机品质（权重随机，可注入random函数用于测试） */
export function rollRarity(rand: () => number = Math.random): Rarity {
  const total = RARITIES.reduce((s, r) => s + r.weight, 0);
  let roll = rand() * total;
  for (const r of RARITIES) {
    roll -= r.weight;
    if (roll <= 0) return r.level;
  }
  return 0;
}

// ── 升星 ─────────────────────────────────────────────────────────────────────

export const MAX_STARS = 5;

/** 升星消耗：碎片×(star×3) + 灵石×(star×50) */
export function starUpCost(currentStars: number): { fragments: number; spiritStones: number } {
  if (currentStars >= MAX_STARS) return { fragments: 0, spiritStones: 0 };
  return { fragments: currentStars * 3, spiritStones: currentStars * 50 };
}

/** 星级攻击加成：每星+25% */
export function starAtkBonus(stars: number): number {
  return 1 + (stars - 1) * 0.25;
}

// ── 职业羁绊 ─────────────────────────────────────────────────────────────────

export type SynergyId = 'bug_tracking' | 'stable_release' | 'high_availability' | 'fullstack';

export interface SynergyDef {
  readonly id: SynergyId;
  readonly name: string;
  readonly emoji: string;
  readonly desc: string;
  /** 激活所需职业组合 */
  readonly required: readonly SquadProfession[];
  /** 全队攻击倍率加成 */
  readonly atkMult: number;
  /** 额外效果 */
  readonly bonus: 'ANTI_SHIELD' | 'SHIELD_BOOST' | 'REGEN' | 'ALL_STAT';
  readonly bonusValue: number;
}

export const SYNERGIES: readonly SynergyDef[] = [
  {
    id: 'bug_tracking',
    name: 'Bug追踪',
    emoji: '🐛',
    desc: 'Java+测试：对护盾型/异常状态敌人伤害+30%',
    required: ['JAVA_BACKEND', 'QA'],
    atkMult: 1.1,
    bonus: 'ANTI_SHIELD',
    bonusValue: 0.3,
  },
  {
    id: 'stable_release',
    name: '稳定发布',
    emoji: '🚀',
    desc: '前端+运维：护盾效果+50%，生存能力大幅提升',
    required: ['FRONTEND', 'DEVOPS'],
    atkMult: 1.05,
    bonus: 'SHIELD_BOOST',
    bonusValue: 0.5,
  },
  {
    id: 'high_availability',
    name: '高可用架构',
    emoji: '⚖️',
    desc: 'Java+运维：持续输出+20%，每秒恢复少量护盾',
    required: ['JAVA_BACKEND', 'DEVOPS'],
    atkMult: 1.2,
    bonus: 'REGEN',
    bonusValue: 2,
  },
  {
    id: 'fullstack',
    name: '全栈攻坚',
    emoji: '🔥',
    desc: '四职业齐全：全属性+25%，终极阵容',
    required: ['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS'],
    atkMult: 1.25,
    bonus: 'ALL_STAT',
    bonusValue: 0.25,
  },
];

/** 根据阵容职业列表计算激活的羁绊 */
export function activeSynergies(professions: readonly SquadProfession[]): SynergyDef[] {
  const profSet = new Set(professions);
  return SYNERGIES.filter(s => s.required.every(p => profSet.has(p)));
}

// ── 战力计算 ─────────────────────────────────────────────────────────────────

export interface PowerScoreInput {
  /** 小队成员攻击力总和 */
  squadAttack: number;
  /** 点击伤害 */
  clickDamage: number;
  /** 平均品质等级 */
  avgRarity: number;
  /** 总星级 */
  totalStars: number;
  /** 激活羁绊数 */
  synergyCount: number;
  /** 装备加成攻击 */
  equipmentAttack: number;
}

/** 统一战力分：综合所有养成维度的参考值 */
export function powerScore(input: PowerScoreInput): number {
  const rarityBonus = 1 + input.avgRarity * 0.15;
  const starBonus = 1 + input.totalStars * 0.05;
  const synergyBonus = 1 + input.synergyCount * 0.1;
  const base = (input.squadAttack * 10 + input.clickDamage * 5 + input.equipmentAttack * 8);
  return Math.round(base * rarityBonus * starBonus * synergyBonus);
}