/**
 * V6.3 关卡内容 — 100关 × 8章节 + 敌人成长曲线
 *
 * 参考《咸鱼之王》节奏：前期秒杀爽快（1~3秒/关），中期渐缓（5~15秒），
 * 后期需要小队成长（30秒~2分钟）。每5关一个小Boss，每章末尾大Boss
 * （触发卡牌战斗衔接）。
 */

import type { ChapterDef, EnemyDef } from './auto-battle-types';

// ── 章节定义 ─────────────────────────────────────────────────────────────────

export const CHAPTERS: readonly ChapterDef[] = [
  { id: 1, title: '需求分析', theme: '产品经理的异想天开', emoji: '📋', startStage: 1, endStage: 12, enemyPrefix: '伪需求' },
  { id: 2, title: '概要设计', theme: '架构师的纸上谈兵', emoji: '🏗️', startStage: 13, endStage: 25, enemyPrefix: '设计坑' },
  { id: 3, title: '编码开发', theme: '从入门到入土', emoji: '⌨️', startStage: 26, endStage: 40, enemyPrefix: '祖传代码' },
  { id: 4, title: '联调测试', theme: '测试仙子的十八般兵器', emoji: '🧪', startStage: 41, endStage: 55, enemyPrefix: '复现Bug' },
  { id: 5, title: '性能优化', theme: '压测面前的众生平等', emoji: '⚡', startStage: 56, endStage: 70, enemyPrefix: '性能瓶颈' },
  { id: 6, title: '上线发布', theme: '周五上线的自我修养', emoji: '🚀', startStage: 71, endStage: 85, enemyPrefix: '上线事故' },
  { id: 7, title: '运维保障', theme: '凌晨三点的告警短信', emoji: '🛡️', startStage: 86, endStage: 95, enemyPrefix: '线上故障' },
  { id: 8, title: '996飞升', theme: '渡劫飞升的终极试炼', emoji: '🌌', startStage: 96, endStage: 100, enemyPrefix: '天劫' },
];

export const TOTAL_STAGES = 100;

export function chapterOfStage(stage: number): ChapterDef {
  for (const ch of CHAPTERS) {
    if (stage >= ch.startStage && stage <= ch.endStage) return ch;
  }
  return CHAPTERS[CHAPTERS.length - 1];
}

// ── 敌人命名池 ───────────────────────────────────────────────────────────────

const ENEMY_NAMES: Readonly<Record<string, readonly string[]>> = {
  伪需求: ['「加个按钮就行」', '「很简单的不用设计」', '「参考竞品抄一下」', '「明天就要上线」', '「用户肯定喜欢」', '「这个不用测试」', '「先做了再改」', '「老板说的必须做」'],
  设计坑: ['循环依赖妖', '接口地狱兽', '数据库死锁灵', '缓存穿透鬼', '时区错乱怪', '编码乱码精', '无限递归魂', '配置漂移魔'],
  祖传代码: ['八百行ifelse', '魔法数字仙', '注释为零怪', '全局变量王', '复制粘贴妖', '深嵌套之魂', '无人维护灵', '屎山领主'],
  复现Bug: ['偶现崩溃灵', '并发死锁鬼', '内存泄漏怪', '竞态条件妖', '边界溢出魂', '时序错乱魔', '环境差异精', '玄学复现王'],
  性能瓶颈: ['慢SQL之王', '全表扫描妖', 'N+1查询鬼', '内存溢出怪', 'GC停顿灵', '连接池耗尽魂', 'CPU飙红魔', '磁盘IO堵'],
  上线事故: ['回滚失败灵', '配置遗漏鬼', '依赖冲突怪', '证书过期妖', '白屏之魂', '接口超时魔', '数据丢失王', '降级失效精'],
  线上故障: ['Redis宕机妖', '数据库主从断', '网络分区鬼', '磁盘写满怪', 'DDoS攻击灵', '消息堆积魂', '时钟漂移魔', '机房断电王'],
  天劫: ['需求变更劫', '架构重构劫', '全量重写劫', '技术选型劫', '团队解散劫', '项目砍掉劫', '面试造火箭劫', '35岁危机劫'],
};

const MINI_BOSS_NAMES: Readonly<Record<string, string>> = {
  伪需求: '产品总监·画饼真人',
  设计坑: '首席架构·PPT仙人',
  祖传代码: '屎山之主·祖师爷',
  复现Bug: '测试组长·Bug猎手',
  性能瓶颈: '性能总监·压测真君',
  上线事故: '发布经理·背锅侠',
  线上故障: 'SRE长老·救火真仙',
  天劫: '天劫使者·996尊者',
};

const CARD_BOSS_NAMES: Readonly<Record<string, string>> = {
  伪需求: '产品VP·需求灭世者',
  设计坑: 'CTO·架构毁灭者',
  祖传代码: '屎山帝·万行遗码',
  复现Bug: '测试大宗师·万虫噬天',
  性能瓶颈: '性能天尊·万核压境',
  上线事故: '发布大帝·周五黄昏',
  线上故障: '运维道祖·永夜告警',
  天劫: '996天道·飞升终局',
};

const ENEMY_EMOJIS = ['👾', '👹', '👺', '🤖', '💀', '👻', '🐍', '🦇', '🕷️', '🦂'];
const BOSS_EMOJIS = ['😈', '👿', '🐲', '🦖'];

// ── 成长曲线 ─────────────────────────────────────────────────────────────────

/** 敌人HP成长：50 × 1.18^(stage-1)，Boss×5，卡牌Boss×8 */
export function enemyHpFor(stage: number, kind: 'normal' | 'miniBoss' | 'cardBoss'): number {
  const base = 50 * Math.pow(1.18, stage - 1);
  const mult = kind === 'cardBoss' ? 8 : kind === 'miniBoss' ? 5 : 1;
  return Math.round(base * mult);
}

/** 敌人攻击成长：5 × 1.12^(stage-1)，Boss×2 */
export function enemyAttackFor(stage: number, kind: 'normal' | 'miniBoss' | 'cardBoss'): number {
  const base = 5 * Math.pow(1.12, stage - 1);
  const mult = kind === 'normal' ? 1 : 2;
  return Math.round(base * mult);
}

/** 敌人攻击间隔：普通2.0s，Boss3.0s */
export function enemyIntervalFor(kind: 'normal' | 'miniBoss' | 'cardBoss'): number {
  return kind === 'normal' ? 2.0 : 3.0;
}

/** 击杀奖励：工资 10×1.1^(stage-1)，修为 5×1.1^(stage-1)，灵石 boss才有 */
export function enemyRewardsFor(stage: number, kind: 'normal' | 'miniBoss' | 'cardBoss'): { salary: number; cultivation: number; spiritStones: number } {
  const salary = Math.round(10 * Math.pow(1.1, stage - 1) * (kind === 'normal' ? 1 : kind === 'miniBoss' ? 3 : 6));
  const cultivation = Math.round(5 * Math.pow(1.1, stage - 1) * (kind === 'normal' ? 1 : kind === 'miniBoss' ? 3 : 6));
  const spiritStones = kind === 'cardBoss' ? 5 + Math.floor(stage / 10) : kind === 'miniBoss' ? 1 : 0;
  return { salary, cultivation, spiritStones };
}

// ── 关卡敌人生成 ─────────────────────────────────────────────────────────────

/** 每章末尾(大Boss) → cardBoss；每5关 → miniBoss；其余 normal */
export function stageKind(stage: number): 'normal' | 'miniBoss' | 'cardBoss' {
  const ch = chapterOfStage(stage);
  if (stage === ch.endStage) return 'cardBoss';
  if (stage % 5 === 0) return 'miniBoss';
  return 'normal';
}

/** 确定性敌人名生成（同关卡同名，不依赖随机） */
function enemyNameFor(stage: number, kind: 'normal' | 'miniBoss' | 'cardBoss'): string {
  const ch = chapterOfStage(stage);
  if (kind === 'cardBoss') return CARD_BOSS_NAMES[ch.enemyPrefix] ?? '终极Boss';
  if (kind === 'miniBoss') return MINI_BOSS_NAMES[ch.enemyPrefix] ?? '精英怪';
  const pool = ENEMY_NAMES[ch.enemyPrefix] ?? ENEMY_NAMES['伪需求'];
  const idx = (stage - 1) % pool.length;
  return pool[idx];
}

function enemyEmojiFor(stage: number, kind: 'normal' | 'miniBoss' | 'cardBoss'): string {
  if (kind === 'cardBoss') return '🐲';
  if (kind === 'miniBoss') return BOSS_EMOJIS[(Math.floor(stage / 5) - 1) % BOSS_EMOJIS.length];
  return ENEMY_EMOJIS[(stage - 1) % ENEMY_EMOJIS.length];
}

/** 生成指定关卡的敌人定义（纯函数，确定性） */
export function enemyDefForStage(stage: number): EnemyDef {
  const kind = stageKind(stage);
  const ch = chapterOfStage(stage);
  const rewards = enemyRewardsFor(stage, kind);
  return {
    defId: `v63_stage_${stage}`,
    name: enemyNameFor(stage, kind),
    emoji: enemyEmojiFor(stage, kind),
    hp: enemyHpFor(stage, kind),
    attack: enemyAttackFor(stage, kind),
    intervalSec: enemyIntervalFor(kind),
    isBoss: kind !== 'normal',
    isCardBoss: kind === 'cardBoss',
    rewardSalary: rewards.salary,
    rewardCultivation: rewards.cultivation,
    rewardSpiritStones: rewards.spiritStones,
  };
}

// ── 996通天塔 ────────────────────────────────────────────────────────────────

export const TOWER_TOTAL_FLOORS = 996;

/** 通天塔敌人：HP = 普通关 × (1 + floor×0.05)，每10层一个Boss */
export function towerEnemyDefFor(floor: number): EnemyDef {
  const isBoss = floor % 10 === 0;
  const baseStage = Math.min(TOTAL_STAGES, Math.max(1, Math.floor(floor / 10) + 1));
  const base = enemyDefForStage(baseStage);
  const hpMult = 1 + floor * 0.05;
  return {
    defId: `v63_tower_${floor}`,
    name: isBoss ? `第${floor}层·塔主` : `第${floor}层·守关者`,
    emoji: isBoss ? '👿' : '👹',
    hp: Math.round(base.hp * hpMult),
    attack: Math.round(base.attack * (1 + floor * 0.02)),
    intervalSec: base.intervalSec,
    isBoss,
    isCardBoss: false,
    rewardSalary: Math.round(base.rewardSalary * 2),
    rewardCultivation: Math.round(base.rewardCultivation * 2),
    rewardSpiritStones: isBoss ? 3 : 0,
  };
}

// ── 宝箱 ─────────────────────────────────────────────────────────────────────

/** 每25杀掉落一个宝箱 */
export const CHEST_KILL_INTERVAL = 25;

export interface ChestReward {
  readonly kind: 'SALARY' | 'CULTIVATION' | 'SPIRIT_STONES' | 'SQUAD_EXP';
  readonly label: string;
  readonly amount: number;
}

/** 宝箱奖励（基于当前关卡缩放） */
export function chestRewardFor(stage: number): ChestReward {
  const roll = (stage * 7 + 3) % 4;
  const scale = Math.pow(1.1, stage - 1);
  if (roll === 0) return { kind: 'SALARY', label: '💰 工资包', amount: Math.round(50 * scale) };
  if (roll === 1) return { kind: 'CULTIVATION', label: '💧 修为丹', amount: Math.round(30 * scale) };
  if (roll === 2) return { kind: 'SPIRIT_STONES', label: '💎 灵石袋', amount: 1 + Math.floor(stage / 8) };
  return { kind: 'SQUAD_EXP', label: '📖 团队经验书', amount: Math.round(20 * scale) };
}