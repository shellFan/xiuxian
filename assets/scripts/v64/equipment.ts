/**
 * V6.4 战斗装备系统 — 为自动推关提供装备养成
 *
 * 与v2装备系统（修仙侧：工资/修为加成）独立：
 *   v2装备 → 挂机/修炼收益加成
 *   v64装备 → 战斗属性加成（攻击/生命/暴击/护盾）
 *
 * 装备来源：关卡掉落 + 宝箱 + 通天塔 + 商店
 * 装备强化：消耗灵石+装备碎片，提升装备等级×属性
 */

// ── 装备类型 ─────────────────────────────────────────────────────────────────

export type EquipSlot = 'WEAPON' | 'ARMOR' | 'ACCESSORY' | 'RELIC';

export type EquipRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export interface EquipDef {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly slot: EquipSlot;
  readonly rarity: EquipRarity;
  readonly desc: string;
  /** 基础攻击加成 */
  readonly atk: number;
  /** 基础生命加成（转化为护盾） */
  readonly hp: number;
  /** 暴击率加成（0~1） */
  readonly critRate: number;
  /** 暴击伤害加成倍率 */
  readonly critMult: number;
  /** 强化成长：每级攻击加成 */
  readonly atkPerLevel: number;
  /** 强化成长：每级生命加成 */
  readonly hpPerLevel: number;
  /** 掉落关卡要求（最低关卡） */
  readonly minStage: number;
}

// ── 装备定义池 ───────────────────────────────────────────────────────────────

export const EQUIP_DEFS: readonly EquipDef[] = [
  // 武器 — 键盘法器
  { id: 'eq_weapon_1', name: '机械键盘', emoji: '⌨️', slot: 'WEAPON', rarity: 'COMMON', desc: '青轴机械键盘，敲击如飞剑', atk: 5, hp: 0, critRate: 0.02, critMult: 0.1, atkPerLevel: 2, hpPerLevel: 0, minStage: 1 },
  { id: 'eq_weapon_2', name: '静电容键盘', emoji: '🎹', slot: 'WEAPON', rarity: 'UNCOMMON', desc: 'HHKB静电容，代码如行云流水', atk: 12, hp: 0, critRate: 0.04, critMult: 0.2, atkPerLevel: 4, hpPerLevel: 0, minStage: 8 },
  { id: 'eq_weapon_3', name: '光轴圣键', emoji: '✨', slot: 'WEAPON', rarity: 'RARE', desc: '光轴触发零延迟，攻击速度+30%', atk: 25, hp: 0, critRate: 0.06, critMult: 0.3, atkPerLevel: 8, hpPerLevel: 0, minStage: 20 },
  { id: 'eq_weapon_4', name: '量子键盘', emoji: '🔮', slot: 'WEAPON', rarity: 'EPIC', desc: '量子纠缠键盘，同时敲击所有按键', atk: 50, hp: 0, critRate: 0.10, critMult: 0.5, atkPerLevel: 15, hpPerLevel: 0, minStage: 40 },
  { id: 'eq_weapon_5', name: '天道键盘', emoji: '🌌', slot: 'WEAPON', rarity: 'LEGENDARY', desc: '传说中996祖师爷的键盘，一键成神', atk: 120, hp: 0, critRate: 0.15, critMult: 1.0, atkPerLevel: 30, hpPerLevel: 0, minStage: 70 },
  // 防具 — 防加班护甲
  { id: 'eq_armor_1', name: '格子衫', emoji: '👔', slot: 'ARMOR', rarity: 'COMMON', desc: '程序员标配格子衫，聊胜于无', atk: 0, hp: 20, critRate: 0, critMult: 0, atkPerLevel: 0, hpPerLevel: 8, minStage: 1 },
  { id: 'eq_armor_2', name: '冲锋衣', emoji: '🧥', slot: 'ARMOR', rarity: 'UNCOMMON', desc: '全天候冲锋衣，抵御需求风暴', atk: 0, hp: 50, critRate: 0, critMult: 0, atkPerLevel: 0, hpPerLevel: 18, minStage: 8 },
  { id: 'eq_armor_3', name: '防弹背心', emoji: '🦺', slot: 'ARMOR', rarity: 'RARE', desc: '背锅专用防弹背心', atk: 0, hp: 120, critRate: 0, critMult: 0, atkPerLevel: 0, hpPerLevel: 40, minStage: 20 },
  { id: 'eq_armor_4', name: '金钟罩工装', emoji: '🛡️', slot: 'ARMOR', rarity: 'EPIC', desc: '金钟罩铁布衫融合现代工装', atk: 0, hp: 300, critRate: 0, critMult: 0, atkPerLevel: 0, hpPerLevel: 90, minStage: 40 },
  { id: 'eq_armor_5', name: '不灭袈裟', emoji: '⚜️', slot: 'ARMOR', rarity: 'LEGENDARY', desc: '996不灭之身，加班无法击垮', atk: 0, hp: 800, critRate: 0, critMult: 0, atkPerLevel: 0, hpPerLevel: 200, minStage: 70 },
  // 饰品 — 咖啡灵戒
  { id: 'eq_acc_1', name: '速溶咖啡', emoji: '☕', slot: 'ACCESSORY', rarity: 'COMMON', desc: '提神醒脑，攻击+3%', atk: 3, hp: 10, critRate: 0.03, critMult: 0, atkPerLevel: 1, hpPerLevel: 4, minStage: 3 },
  { id: 'eq_acc_2', name: '手冲咖啡套装', emoji: '🫖', slot: 'ACCESSORY', rarity: 'UNCOMMON', desc: '精品手冲，暴击+5%', atk: 8, hp: 25, critRate: 0.05, critMult: 0.1, atkPerLevel: 3, hpPerLevel: 9, minStage: 12 },
  { id: 'eq_acc_3', name: '浓缩咖啡灵戒', emoji: '💍', slot: 'ACCESSORY', rarity: 'RARE', desc: '三倍浓缩注入灵魂', atk: 18, hp: 60, critRate: 0.08, critMult: 0.2, atkPerLevel: 6, hpPerLevel: 20, minStage: 25 },
  { id: 'eq_acc_4', name: '咖啡因法珠', emoji: '🧿', slot: 'ACCESSORY', rarity: 'EPIC', desc: '过量咖啡因结晶，暴击伤害+40%', atk: 40, hp: 150, critRate: 0.12, critMult: 0.4, atkPerLevel: 12, hpPerLevel: 45, minStage: 50 },
  { id: 'eq_acc_5', name: '永动咖啡圣杯', emoji: '🏆', slot: 'ACCESSORY', rarity: 'LEGENDARY', desc: '永远喝不完的咖啡，永远不需要睡觉', atk: 100, hp: 400, critRate: 0.18, critMult: 0.8, atkPerLevel: 25, hpPerLevel: 100, minStage: 80 },
  // 法宝 — 服务器护符
  { id: 'eq_relic_1', name: 'U盘护符', emoji: '💾', slot: 'RELIC', rarity: 'COMMON', desc: '祖传U盘，数据永不丢失', atk: 2, hp: 15, critRate: 0, critMult: 0, atkPerLevel: 1, hpPerLevel: 5, minStage: 5 },
  { id: 'eq_relic_2', name: 'SSD护符', emoji: '📀', slot: 'RELIC', rarity: 'UNCOMMON', desc: 'NVMe SSD，加载速度极快', atk: 6, hp: 35, critRate: 0.02, critMult: 0, atkPerLevel: 2, hpPerLevel: 12, minStage: 15 },
  { id: 'eq_relic_3', name: '服务器护符', emoji: '🖥️', slot: 'RELIC', rarity: 'RARE', desc: '双路E5护身，稳定运行千日', atk: 15, hp: 80, critRate: 0.04, critMult: 0.1, atkPerLevel: 5, hpPerLevel: 25, minStage: 30 },
  { id: 'eq_relic_4', name: '云服务器法宝', emoji: '☁️', slot: 'RELIC', rarity: 'EPIC', desc: '弹性伸缩云服务器，无限算力', atk: 35, hp: 200, critRate: 0.06, critMult: 0.2, atkPerLevel: 10, hpPerLevel: 60, minStage: 55 },
  { id: 'eq_relic_5', name: '量子服务器', emoji: '⚛️', slot: 'RELIC', rarity: 'LEGENDARY', desc: '量子计算服务器，算力超越天道', atk: 90, hp: 500, critRate: 0.10, critMult: 0.4, atkPerLevel: 22, hpPerLevel: 120, minStage: 85 },
];

export function equipDef(id: string): EquipDef | undefined {
  return EQUIP_DEFS.find(e => e.id === id);
}

export function equipRarityMult(rarity: EquipRarity): number {
  switch (rarity) {
  case 'COMMON': return 1;
  case 'UNCOMMON': return 1.2;
  case 'RARE': return 1.5;
  case 'EPIC': return 2.0;
  case 'LEGENDARY': return 3.0;
  }
}

// ── 装备状态 ─────────────────────────────────────────────────────────────────

export interface V64EquipInstance {
  readonly id: string; // 唯一实例ID
  readonly defId: string; // 装备定义ID
  level: number; // 强化等级
}

export interface V64EquipmentState {
  /** 背包中的装备实例 */
  bag: V64EquipInstance[];
  /** 已装备：槽位→实例ID */
  equipped: Record<EquipSlot, string | null>;
  /** 装备碎片数量（升星/强化材料） */
  fragments: number;
}

// ── 强化 ─────────────────────────────────────────────────────────────────────

export const MAX_EQUIP_LEVEL = 10;

/** 强化消耗：灵石×(level×30) + 碎片×level */
export function enhanceCost(currentLevel: number): { spiritStones: number; fragments: number } {
  if (currentLevel >= MAX_EQUIP_LEVEL) return { spiritStones: 0, fragments: 0 };
  return { spiritStones: currentLevel * 30, fragments: currentLevel };
}

/** 计算装备实例当前属性 */
export function equipStats(inst: V64EquipInstance): { atk: number; hp: number; critRate: number; critMult: number } {
  const def = equipDef(inst.defId);
  if (!def) return { atk: 0, hp: 0, critRate: 0, critMult: 0 };
  const lv = inst.level - 1;
  return {
  atk: def.atk + def.atkPerLevel * lv,
  hp: def.hp + def.hpPerLevel * lv,
  critRate: def.critRate,
  critMult: def.critMult,
  };
}

/** 关卡掉落装备（确定性：基于stage和kills） */
export function dropEquipForStage(stage: number, killCount: number): EquipDef | null {
  // 每30杀掉落一件装备，品质随关卡提升
  if (killCount % 30 !== 0) return null;
  const pool = EQUIP_DEFS.filter(e => e.minStage <= stage);
  if (pool.length === 0) return null;
  // 确定性选择：基于killCount的种子
  const idx = Math.floor(killCount / 30) % pool.length;
  return pool[idx];
}