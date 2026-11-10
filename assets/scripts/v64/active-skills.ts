/**
 * V6.4 主动技能系统 — 玩家可手动释放的战斗技能
 *
 * 与小队自动技能（professionDef.skill）独立：
 *   - 自动技能：小队成员自动释放，无需操作
 *   - 主动技能：玩家点击释放，有冷却，有策略选择
 *
 * 4个主动技能覆盖不同战斗场景：
 *   - 代码飞剑：日常推关加速（多段点击伤害）
 *   - Bug炸弹：群体AOE（基于全队DPS）
 *   - 需求粉碎：Boss特化（对Boss巨额伤害）
 *   - 紧急回滚：生存防御（全队护盾+恢复）
 */

// ── 技能定义 ─────────────────────────────────────────────────────────────────

export type ActiveSkillId = 'code_sword' | 'bug_bomb' | 'req_crusher' | 'emergency_rollback';

export type ActiveSkillKind = 'MULTI_TAP' | 'AOE_DPS' | 'BOSS_BURST' | 'DEFENSE';

export interface ActiveSkillDef {
  readonly id: ActiveSkillId;
  readonly name: string;
  readonly emoji: string;
  readonly desc: string;
  /** 冷却时间（秒，真实时间不受倍速影响） */
  readonly cooldownSec: number;
  readonly kind: ActiveSkillKind;
  /** 效果数值（倍率或系数） */
  readonly power: number;
  /** 多段攻击段数（MULTI_TAP用） */
  readonly hits?: number;
  /** 解锁条件：需要的关卡数 */
  readonly unlockStage: number;
}

export const ACTIVE_SKILLS: readonly ActiveSkillDef[] = [
  {
    id: 'code_sword',
    name: '代码飞剑',
    emoji: '🗡️',
    desc: '召唤5柄代码飞剑连续攻击，每段造成点击伤害×2',
    cooldownSec: 8,
    kind: 'MULTI_TAP',
    power: 2,
    hits: 5,
    unlockStage: 1,
  },
  {
    id: 'bug_bomb',
    name: 'Bug炸弹',
    emoji: '💣',
    desc: '投掷Bug炸弹造成范围伤害，伤害=全队DPS×3',
    cooldownSec: 15,
    kind: 'AOE_DPS',
    power: 3,
    unlockStage: 5,
  },
  {
    id: 'req_crusher',
    name: '需求粉碎',
    emoji: '🔨',
    desc: '对Boss造成巨额伤害=点击伤害×15，非Boss减半',
    cooldownSec: 25,
    kind: 'BOSS_BURST',
    power: 15,
    unlockStage: 10,
  },
  {
    id: 'emergency_rollback',
    name: '紧急回滚',
    emoji: '🛡️',
    desc: '紧急回滚生产环境，全队获得护盾+清除Debuff',
    cooldownSec: 20,
    kind: 'DEFENSE',
    power: 80,
    unlockStage: 15,
  },
];

export function activeSkillDef(id: ActiveSkillId): ActiveSkillDef {
  return ACTIVE_SKILLS.find(s => s.id === id) ?? ACTIVE_SKILLS[0];
}

// ── 技能释放结果 ─────────────────────────────────────────────────────────────

export interface ActiveSkillResult {
  ok: boolean;
  skillId: ActiveSkillId;
  /** 总伤害（DEFENSE类型为0） */
  totalDamage: number;
  /** 护盾值（DEFENSE类型） */
  shieldGained: number;
  /** 是否击杀敌人 */
  enemyDefeated: boolean;
  /** 冷却剩余秒数 */
  cooldownRemaining: number;
  reason?: string;
}