/**
 * V6.3 咸鱼式自动推关 — 类型定义
 *
 * 双战斗模式：
 *   - 自动战斗（本系统）：日常项目/普通怪物/快速推关/挂机收益
 *   - 主动卡牌战斗（v59o）：重大项目/精英Boss/晋升答辩/特殊剧情
 *
 * 首页常驻战斗区域：敌人血条 + 项目小队 + 点击攻击 + 关卡进度。
 */

// ── 职业 ─────────────────────────────────────────────────────────────────────

export type SquadProfession = 'JAVA_BACKEND' | 'FRONTEND' | 'QA' | 'DEVOPS';

export interface ProfessionDef {
  readonly id: SquadProfession;
  readonly label: string;
  readonly emoji: string;
  readonly desc: string;
  /** 基础攻击（每秒DPS贡献） */
  readonly baseAttack: number;
  /** 攻击间隔（秒） */
  readonly intervalSec: number;
  /** 技能定义 */
  readonly skill: ProfessionSkillDef;
}

export interface ProfessionSkillDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  /** 冷却（秒） */
  readonly cooldownSec: number;
  /** 技能效果类型 */
  readonly kind: 'CRIT_BURST' | 'MULTI_HIT' | 'HEAL' | 'SHIELD' | 'DEBUFF' | 'AOE' | 'DOT';
  /** 效果数值（倍率或固定值） */
  readonly power: number;
}

export const PROFESSIONS: readonly ProfessionDef[] = [
  {
    id: 'JAVA_BACKEND', label: 'Java后端', emoji: '☕',
    desc: '稳定输出，代码暴击，自我恢复',
    baseAttack: 12, intervalSec: 1.2,
    skill: { id: 'code_crit', name: '代码暴击', desc: '下次攻击造成3倍伤害', cooldownSec: 12, kind: 'CRIT_BURST', power: 3 },
  },
  {
    id: 'FRONTEND', label: '前端', emoji: '🎨',
    desc: '快速攻击，连击叠加，渲染护盾',
    baseAttack: 7, intervalSec: 0.6,
    skill: { id: 'render_shield', name: '渲染重构', desc: '为全队生成护盾', cooldownSec: 15, kind: 'SHIELD', power: 20 },
  },
  {
    id: 'QA', label: '测试', emoji: '🐛',
    desc: '弱点识别，暴击加成，Debuff',
    baseAttack: 9, intervalSec: 1.0,
    skill: { id: 'weak_spot', name: '弱点识别', desc: '标记敌人弱点，全队伤害+50%持续8秒', cooldownSec: 18, kind: 'DEBUFF', power: 0.5 },
  },
  {
    id: 'DEVOPS', label: '运维', emoji: '🔧',
    desc: '防御恢复，减伤护盾，一键回滚',
    baseAttack: 8, intervalSec: 1.5,
    skill: { id: 'rollback', name: '一键回滚', desc: '恢复全队生命并减伤', cooldownSec: 20, kind: 'HEAL', power: 15 },
  },
];

export function professionDef(id: SquadProfession): ProfessionDef {
  return PROFESSIONS.find(p => p.id === id) ?? PROFESSIONS[0];
}

// ── 章节 ─────────────────────────────────────────────────────────────────────

export interface ChapterDef {
  readonly id: number;
  readonly title: string;
  readonly theme: string;
  readonly emoji: string;
  /** 该章节起始关卡（1-based） */
  readonly startStage: number;
  /** 该章节结束关卡（inclusive） */
  readonly endStage: number;
  /** 章节敌人前缀名 */
  readonly enemyPrefix: string;
}

// ── 敌人 ─────────────────────────────────────────────────────────────────────

export interface EnemyDef {
  readonly defId: string;
  readonly name: string;
  readonly emoji: string;
  readonly hp: number;
  readonly attack: number;
  readonly intervalSec: number;
  readonly isBoss: boolean;
  readonly isCardBoss: boolean;
  /** 击杀奖励 */
  readonly rewardSalary: number;
  readonly rewardCultivation: number;
  readonly rewardSpiritStones: number;
}

// ── 存档状态 ─────────────────────────────────────────────────────────────────

export interface V63EnemyState {
  readonly defId: string;
  name: string;
  emoji: string;
  hp: number;
  readonly maxHp: number;
  attack: number;
  readonly intervalSec: number;
  attackTimer: number;
  readonly isBoss: boolean;
  readonly isCardBoss: boolean;
  /** V6.4 敌人护盾（SHIELD型Boss/SHIELDED型敌人） */
  enemyShield?: number;
  /** V6.4 Boss特性 */
  bossTrait?: string;
  /** V6.4 敌人类型 */
  enemyType?: string;
  /** V6.4 控制型Boss眩晕计时器 */
  stunTimer?: number;
  /** V6.4 DOT型Boss持续伤害计时器 */
  dotTimer?: number;
}

export interface V63SquadMemberState {
  readonly id: string;
  readonly name: string;
  readonly profession: SquadProfession;
  level: number;
  exp: number;
  /** 槽位 0=队长(玩家) 1~4=队员；-1=候补 */
  slot: number;
  /** 攻击计时器（秒） */
  attackTimer: number;
  /** 技能冷却计时器（秒） */
  skillTimer: number;
  hiredAtDay: number;
  /** V6.4 品质等级 0~4（普通/优秀/精英/史诗/传说），默认0 */
  rarity?: number;
  /** V6.4 星级 1~5，默认1 */
  stars?: number;
  /** V6.4 升星碎片（同角色碎片） */
  fragments?: number;
}

export interface V63SquadState {
  members: V63SquadMemberState[];
  /** 玩家点击伤害等级 */
  clickLevel: number;
  /** 全队共享护盾（临时，不持久化逻辑值但持久化当前值） */
  shield: number;
  /** 弱点Debuff剩余秒数（QA技能） */
  weakSpotTimer: number;
  /** V6.4 主动技能冷却（skillId → 剩余秒数） */
  activeSkillCooldowns?: Record<string, number>;
}

export type AutoBattleStatus = 'IDLE' | 'FIGHTING' | 'VICTORY' | 'DEFEAT' | 'BOSS_PENDING';

export interface V63AutoBattleState {
  /** 当前关卡（1-based） */
  stage: number;
  /** 最高已通关关卡 */
  maxStage: number;
  status: AutoBattleStatus;
  /** 当前敌人（运行时；持久化以便重启恢复） */
  enemy: V63EnemyState | null;
  /** 自动战斗开关 */
  autoEnabled: boolean;
  /** 累计击杀数 */
  totalKills: number;
  /** 胜利过渡计时器（秒，倒计时到0进入下一关） */
  victoryTimer: number;
  /** 败北重生计时器（秒） */
  defeatTimer: number;
  /** 离线累积战斗秒数（回归时结算） */
  pendingOfflineSeconds: number;
  /** 上次tick时间戳（ms） */
  lastTickAt: number;
  /** 996通天塔当前层数（0=未进入） */
  towerFloor: number;
  /** 通天塔最高层 */
  towerBestFloor: number;
  /** 宝箱击杀计数器（每N杀掉落宝箱） */
  chestKillCounter: number;
  /** 待领取宝箱数 */
  pendingChests: number;
  /** 挂机收益累积（离线结算用） */
  idleSalaryAccrued: number;
  idleCultivationAccrued: number;
  /** 上次离线结算ID（防重复结算） */
  lastOfflineSettlementId: string;
  /** V6.4 战斗倍速（1或2） */
  speedMultiplier?: number;
  /** V6.4 全队眩晕剩余秒数（CONTROL型Boss） */
  squadStunTimer?: number;
  /** V6.4 装备掉落计数器 */
  equipDropCounter?: number;
  /** V6.4 今日击杀数（每日目标用） */
  todayKills?: number;
  /** V6.4 今日推进关卡数（每日目标用） */
  todayStagesAdvanced?: number;
  /** V6.4 今日日期索引（每日目标重置用） */
  todayIndex?: number;
}

// ── 运行时视图（UI只读快照） ─────────────────────────────────────────────────

export interface AutoBattleView {
  stage: number;
  maxStage: number;
  status: AutoBattleStatus;
  autoEnabled: boolean;
  chapterTitle: string;
  chapterEmoji: string;
  stageProgress: string;
  enemy: {
    name: string;
    emoji: string;
    hp: number;
    maxHp: number;
    hpPct: number;
    isBoss: boolean;
    isCardBoss: boolean;
  } | null;
  squad: {
    id: string;
    name: string;
    profession: SquadProfession;
    professionLabel: string;
    professionEmoji: string;
    level: number;
    slot: number;
    attack: number;
    skillName: string;
    skillReady: boolean;
    skillCooldownPct: number;
  }[];
  clickDamage: number;
  totalKills: number;
  victoryTimer: number;
  defeatTimer: number;
  towerFloor: number;
  towerBestFloor: number;
  pendingChests: number;
  dps: number;
  /** V6.4 战斗倍速 */
  speedMultiplier: number;
  /** V6.4 主动技能列表 */
  activeSkills: {
    id: string;
    name: string;
    emoji: string;
    desc: string;
    cooldownSec: number;
    cooldownRemaining: number;
    ready: boolean;
    unlocked: boolean;
    unlockStage: number;
  }[];
  /** V6.4 激活的羁绊 */
  synergies: {
    id: string;
    name: string;
    emoji: string;
    desc: string;
  }[];
  /** V6.4 战力分 */
  powerScore: number;
  /** V6.4 敌人类型标签 */
  enemyTypeLabel: string;
  /** V6.4 Boss特性标签 */
  bossTraitLabel: string;
  /** V6.4 推荐战力 */
  recommendedPower: number;
  /** V6.4 队员品质/星级信息 */
  squadDetail: {
    id: string;
    rarity: number;
    rarityLabel: string;
    rarityEmoji: string;
    stars: number;
    fragments: number;
    starUpCost: { fragments: number; spiritStones: number } | null;
  }[];
  /** V6.4 待领取装备数 */
  pendingEquipDrops: number;
}

export interface TapAttackResult {
  ok: boolean;
  damage: number;
  isCrit: boolean;
  enemyHpAfter: number;
  enemyDefeated: boolean;
  stageCleared: boolean;
  rewards: { salary: number; cultivation: number; spiritStones: number } | null;
  reason?: string;
}