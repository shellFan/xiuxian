/**
 * V6.4 留存系统 — 每日目标 + 七日成长 + V6.4成就
 *
 * 每日目标：每天刷新3个战斗相关任务，合理完成时间5~15分钟
 * 七日目标：新玩家7天成长引导，每天一个核心目标
 * V6.4成就：战斗/养成/收集类长期成就
 *
 * 所有奖励领取幂等（通过claimed标记防重）。
 */

// ── 每日目标 ─────────────────────────────────────────────────────────────────

export type DailyGoalId = 'kill_10' | 'stage_3' | 'skill_5' | 'tap_50' | 'tower_5' | 'chest_1';

export interface DailyGoalDef {
  readonly id: DailyGoalId;
  readonly name: string;
  readonly emoji: string;
  readonly desc: string;
  readonly target: number;
  readonly reward: { spiritStones: number; salary: number };
}

export const DAILY_GOALS: readonly DailyGoalDef[] = [
  { id: 'kill_10', name: '击杀10个敌人', emoji: '⚔️', desc: '在自动推关中击杀10个敌人', target: 10, reward: { spiritStones: 5, salary: 200 } },
  { id: 'stage_3', name: '推进3关', emoji: '📈', desc: '通过3个新关卡', target: 3, reward: { spiritStones: 8, salary: 300 } },
  { id: 'skill_5', name: '释放5次技能', emoji: '✨', desc: '使用主动技能5次', target: 5, reward: { spiritStones: 5, salary: 150 } },
  { id: 'tap_50', name: '点击攻击50次', emoji: '👊', desc: '手动点击攻击50次', target: 50, reward: { spiritStones: 3, salary: 100 } },
  { id: 'tower_5', name: '通天塔5层', emoji: '🗼', desc: '在996通天塔推进5层', target: 5, reward: { spiritStones: 10, salary: 500 } },
  { id: 'chest_1', name: '开启1个宝箱', emoji: '🎁', desc: '开启1个战斗宝箱', target: 1, reward: { spiritStones: 5, salary: 200 } },
];

/** 每日随机选3个目标（确定性：基于dayIndex种子） */
export function dailyGoalsFor(dayIndex: number): DailyGoalDef[] {
  const seed = dayIndex % DAILY_GOALS.length;
  const result: DailyGoalDef[] = [];
  for (let i = 0; i < 3; i++) {
  result.push(DAILY_GOALS[(seed + i) % DAILY_GOALS.length]);
  }
  return result;
}

export interface DailyGoalProgress {
  readonly goalId: DailyGoalId;
  readonly name: string;
  readonly emoji: string;
  readonly desc: string;
  readonly progress: number;
  readonly target: number;
  readonly completed: boolean;
  readonly claimed: boolean;
  readonly reward: { spiritStones: number; salary: number };
}

// ── 七日成长目标 ─────────────────────────────────────────────────────────────

export interface SevenDayGoalDef {
  readonly day: number;
  readonly name: string;
  readonly emoji: string;
  readonly desc: string;
  readonly checkKey: string; // 检查的统计键
  readonly target: number;
  readonly reward: { spiritStones: number; label: string };
}

export const SEVEN_DAY_GOALS: readonly SevenDayGoalDef[] = [
  { day: 1, name: '初入职场', emoji: '🌱', desc: '完成首次推关（通过第1关）', checkKey: 'maxStage', target: 1, reward: { spiritStones: 20, label: '20灵石' } },
  { day: 2, name: '组建团队', emoji: '👥', desc: '招募第1名项目小队成员', checkKey: 'squadSize', target: 2, reward: { spiritStones: 30, label: '30灵石' } },
  { day: 3, name: '技能觉醒', emoji: '✨', desc: '释放3次主动技能', checkKey: 'totalSkillUses', target: 3, reward: { spiritStones: 40, label: '40灵石' } },
  { day: 4, name: '塔的试炼', emoji: '🗼', desc: '挑战996通天塔达到5层', checkKey: 'towerBestFloor', target: 5, reward: { spiritStones: 50, label: '50灵石' } },
  { day: 5, name: '羁绊之力', emoji: '🔗', desc: '激活任意1个职业羁绊', checkKey: 'synergyCount', target: 1, reward: { spiritStones: 60, label: '60灵石' } },
  { day: 6, name: '装备加持', emoji: '⚔️', desc: '装备任意1件战斗装备', checkKey: 'equippedCount', target: 1, reward: { spiritStones: 80, label: '80灵石' } },
  { day: 7, name: '独当一面', emoji: '🏆', desc: '通过第15关', checkKey: 'maxStage', target: 15, reward: { spiritStones: 150, label: '150灵石+传说装备碎片×5' } },
];

// ── V6.4 成就 ────────────────────────────────────────────────────────────────

export type V64AchievementId =
  | 'first_kill' | 'stage_10' | 'stage_25' | 'stage_50' | 'stage_100'
  | 'kills_100' | 'kills_1000' | 'tower_10' | 'tower_50'
  | 'hire_all_prof' | 'legendary_member' | 'star_up_1' | 'star_up_5'
  | 'full_synergy' | 'equip_legendary' | 'enhance_max' | 'skill_master';

export interface V64AchievementDef {
  readonly id: V64AchievementId;
  readonly name: string;
  readonly emoji: string;
  readonly desc: string;
  readonly checkKey: string;
  readonly target: number;
  readonly reward: { spiritStones: number };
}

export const V64_ACHIEVEMENTS: readonly V64AchievementDef[] = [
  { id: 'first_kill', name: '初战告捷', emoji: '🥇', desc: '击败第1个敌人', checkKey: 'totalKills', target: 1, reward: { spiritStones: 5 } },
  { id: 'stage_10', name: '小有所成', emoji: '📈', desc: '通过第10关', checkKey: 'maxStage', target: 10, reward: { spiritStones: 10 } },
  { id: 'stage_25', name: '项目骨干', emoji: '💪', desc: '通过第25关', checkKey: 'maxStage', target: 25, reward: { spiritStones: 20 } },
  { id: 'stage_50', name: '技术专家', emoji: '🎯', desc: '通过第50关', checkKey: 'maxStage', target: 50, reward: { spiritStones: 40 } },
  { id: 'stage_100', name: '996飞升', emoji: '🌌', desc: '通过第100关', checkKey: 'maxStage', target: 100, reward: { spiritStones: 100 } },
  { id: 'kills_100', name: '百人斩', emoji: '⚔️', desc: '累计击杀100个敌人', checkKey: 'totalKills', target: 100, reward: { spiritStones: 15 } },
  { id: 'kills_1000', name: '千人斩', emoji: '💀', desc: '累计击杀1000个敌人', checkKey: 'totalKills', target: 1000, reward: { spiritStones: 50 } },
  { id: 'tower_10', name: '塔的挑战者', emoji: '🗼', desc: '通天塔达到10层', checkKey: 'towerBestFloor', target: 10, reward: { spiritStones: 15 } },
  { id: 'tower_50', name: '塔之征服者', emoji: '🏰', desc: '通天塔达到50层', checkKey: 'towerBestFloor', target: 50, reward: { spiritStones: 50 } },
  { id: 'hire_all_prof', name: '全栈团队', emoji: '👥', desc: '招募全部4种职业', checkKey: 'profCount', target: 4, reward: { spiritStones: 30 } },
  { id: 'legendary_member', name: '传说降临', emoji: '🟧', desc: '招募1名传说品质队员', checkKey: 'legendaryCount', target: 1, reward: { spiritStones: 50 } },
  { id: 'star_up_1', name: '星辰初现', emoji: '⭐', desc: '首次升星任意队员', checkKey: 'totalStarUps', target: 1, reward: { spiritStones: 10 } },
  { id: 'star_up_5', name: '五星上将', emoji: '🌟', desc: '将1名队员升至5星', checkKey: 'maxStars', target: 5, reward: { spiritStones: 80 } },
  { id: 'full_synergy', name: '全栈攻坚', emoji: '🔥', desc: '激活四职业羁绊', checkKey: 'fullstackActive', target: 1, reward: { spiritStones: 40 } },
  { id: 'equip_legendary', name: '神器在手', emoji: '🏆', desc: '装备1件传说品质装备', checkKey: 'legendaryEquipped', target: 1, reward: { spiritStones: 60 } },
  { id: 'enhance_max', name: '强化大师', emoji: '🔨', desc: '将装备强化至10级', checkKey: 'maxEnhanceLevel', target: 10, reward: { spiritStones: 50 } },
  { id: 'skill_master', name: '技能大师', emoji: '✨', desc: '累计释放100次主动技能', checkKey: 'totalSkillUses', target: 100, reward: { spiritStones: 30 } },
];

// ── 留存状态 ─────────────────────────────────────────────────────────────────

export interface V64RetentionState {
  /** 每日目标：dayIndex → { goalId → { progress, claimed } } */
  dailyGoalDay: number;
  dailyGoals: { goalId: string; progress: number; claimed: boolean }[];
  /** 七日目标领取记录 */
  sevenDayClaimed: number[]; // 已领取的天数列表
  /** V6.4成就领取记录 */
  v64AchievementsClaimed: string[];
  /** 累计统计 */
  totalSkillUses: number;
  totalTapCount: number;
  totalStarUps: number;
  totalChestsOpened: number;
}