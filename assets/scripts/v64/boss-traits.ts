/**
 * V6.4 Boss差异化 + 敌人克制类型
 *
 * Boss不再只是血量更高，拥有机制性差异：
 *   SHIELD型：开局带护盾，需要Bug追踪羁绊/需求粉碎破盾
 *   BURST型：攻击力高但间隔长，需要稳定发布羁绊/紧急回滚防御
 *   CONTROL型：定期眩晕小队（暂停攻击2秒），需要高DPS速杀
 *   DOT型：持续伤害叠加，需要快速击杀或恢复
 *
 * 敌人类型（普通怪也有类型差异）：
 *   NORMAL / ARMORED(高防) / SWARM(群攻) / SHIELDED(护盾)
 */

// ── Boss特性 ─────────────────────────────────────────────────────────────────

export type BossTrait = 'SHIELD' | 'BURST' | 'CONTROL' | 'DOT' | 'NONE';

export interface BossTraitDef {
  readonly trait: BossTrait;
  readonly label: string;
  readonly emoji: string;
  readonly desc: string;
  /** 护盾型：Boss开局护盾=HP的百分比 */
  readonly shieldPct?: number;
  /** 爆发型：攻击倍率 */
  readonly atkMult?: number;
  /** 控制型：眩晕间隔秒数 */
  readonly stunIntervalSec?: number;
  /** 控制型：眩晕持续秒数 */
  readonly stunDurationSec?: number;
  /** DOT型：每秒附加伤害占Boss攻击比例 */
  readonly dotRatio?: number;
}

export const BOSS_TRAITS: readonly BossTraitDef[] = [
  { trait: 'NONE', label: '普通', emoji: '⬜', desc: '无特殊机制' },
  { trait: 'SHIELD', label: '护盾型', emoji: '🛡️', desc: '开局获得50%最大生命护盾', shieldPct: 0.5 },
  { trait: 'BURST', label: '爆发型', emoji: '💥', desc: '攻击力×2.5但攻击间隔×1.5', atkMult: 2.5 },
  { trait: 'CONTROL', label: '控制型', emoji: '🌀', desc: '每12秒眩晕小队2秒', stunIntervalSec: 12, stunDurationSec: 2 },
  { trait: 'DOT', label: '持续伤害型', emoji: '☠️', desc: '攻击附加持续伤害效果', dotRatio: 0.3 },
];

export function bossTraitDef(trait: BossTrait): BossTraitDef {
  return BOSS_TRAITS.find(t => t.trait === trait) ?? BOSS_TRAITS[0];
}

/** 确定性Boss特性分配：cardBoss按章节轮换，miniBoss按stage轮换 */
export function bossTraitForStage(stage: number, isCardBoss: boolean): BossTrait {
  if (!isCardBoss) {
  // miniBoss：按stage轮换NONE/SHIELD/BURST
  const cycle = Math.floor(stage / 5) % 3;
  return cycle === 0 ? 'NONE' : cycle === 1 ? 'SHIELD' : 'BURST';
  }
  // cardBoss：按章节轮换4种特性
  const chapter = Math.floor((stage - 1) / 13); // 近似章节
  const traits: BossTrait[] = ['SHIELD', 'BURST', 'CONTROL', 'DOT'];
  return traits[chapter % traits.length];
}

// ── 敌人类型 ─────────────────────────────────────────────────────────────────

export type EnemyType = 'NORMAL' | 'ARMORED' | 'SWARM' | 'SHIELDED';

export interface EnemyTypeDef {
  readonly type: EnemyType;
  readonly label: string;
  readonly emoji: string;
  /** HP倍率 */
  readonly hpMult: number;
  /** 攻击倍率 */
  readonly atkMult: number;
  /** 受伤减免（ARMORED用） */
  readonly damageReduction?: number;
  /** 护盾比例（SHIELDED用） */
  readonly shieldPct?: number;
}

export const ENEMY_TYPES: readonly EnemyTypeDef[] = [
  { type: 'NORMAL', label: '普通', emoji: '👾', hpMult: 1, atkMult: 1 },
  { type: 'ARMORED', label: '高防', emoji: '🛡️', hpMult: 1.2, atkMult: 0.8, damageReduction: 0.3 },
  { type: 'SWARM', label: '群攻', emoji: '🐜', hpMult: 0.7, atkMult: 1.3 },
  { type: 'SHIELDED', label: '护盾', emoji: '🔮', hpMult: 1, atkMult: 0.9, shieldPct: 0.3 },
];

export function enemyTypeDef(type: EnemyType): EnemyTypeDef {
  return ENEMY_TYPES.find(t => t.type === type) ?? ENEMY_TYPES[0];
}

/** 确定性敌人类型分配（普通怪） */
export function enemyTypeForStage(stage: number): EnemyType {
  // 每4关轮换一种类型，stage 1-4 NORMAL, 5-8 ARMORED, 9-12 SWARM, 13-16 SHIELDED...
  const cycle = (stage - 1) % 8;
  if (cycle < 4) return 'NORMAL';
  if (cycle === 4 || cycle === 5) return 'ARMORED';
  if (cycle === 6) return 'SWARM';
  return 'SHIELDED';
}

// ── 失败建议 ─────────────────────────────────────────────────────────────────

export interface DefeatAdvice {
  readonly reason: string;
  readonly suggestions: readonly string[];
  readonly recommendedPower: number;
}

/** 根据关卡和战力生成失败建议 */
export function defeatAdviceFor(stage: number, currentPower: number, enemyTrait: BossTrait): DefeatAdvice {
  const recommendedPower = Math.round(50 * Math.pow(1.13, stage - 1) * 10);
  const suggestions: string[] = [];
  if (currentPower < recommendedPower * 0.5) {
  suggestions.push('战力差距过大，建议先回低关卡刷经验升级小队');
  suggestions.push('升级点击伤害等级可立即提升输出');
  } else if (currentPower < recommendedPower * 0.8) {
  suggestions.push('战力接近推荐值，尝试招募更高品质队员');
  suggestions.push('调整阵容激活职业羁绊可获得20%+团队增益');
  }
  switch (enemyTrait) {
  case 'SHIELD':
    suggestions.push('护盾型Boss：释放「需求粉碎」快速破盾，Java+测试羁绊对护盾+30%伤害');
    break;
  case 'BURST':
    suggestions.push('爆发型Boss：保持「紧急回滚」护盾不断，前端+运维羁绊护盾+50%');
    break;
  case 'CONTROL':
    suggestions.push('控制型Boss：眩晕期间无法攻击，提高DPS缩短战斗时间');
    break;
  case 'DOT':
    suggestions.push('持续伤害Boss：速战速决，运维的「一键回滚」可恢复');
    break;
  }
  if (suggestions.length === 0) {
  suggestions.push('尝试强化装备或提升角色星级');
  }
  return { reason: `第${stage}关挑战失败`, suggestions, recommendedPower };
}