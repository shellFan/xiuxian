/**
 * V2 物品系统服务（Gameplay V2 §49~§68/§99~§101）。
 *
 * - MaterialService 语义并入本文件（库存即 player.materials，直接操作）。
 * - TechniqueService：1 主修 + 2 辅助（§49），Lv1~3（§53），升级耗残页+道心墨。
 * - EquipmentService：DESK/BADGE/ACCESSORY 三槽（§57）。
 * - ConsumableService：使用消耗品 → 效果（复用 V2EventService.applyEffects 的语义子集）。
 * - ShopService：每日刷新货架（dayIndex 种子），工资购买（§99 工资必须有消耗）。
 *
 * 全部操作 clamp + 事务式（校验 → 变更 → 事件），材料永远 >= 0（§262）。
 */
import type { GameContext } from '../core/game-context';
import type { RandomService, Rng } from './random-service';
import type { GameClockV2 } from './v2-clock';
import type { GameDayService } from './game-day-service';
import itemsConfig from '../../configs/v2/items.json';

export interface MaterialDef {
  readonly id: string;
  readonly name: string;
  readonly rarity: 'COMMON' | 'RARE' | 'EPIC';
  readonly sources: readonly string[];
  readonly description: string;
}

export interface TechniqueModifiers {
  readonly mode?: string;
  readonly salaryMul?: number;
  readonly performanceMul?: number;
  readonly cultivationMul?: number;
  readonly relationshipMul?: number;
  readonly mindRecoveryMul?: number;
  readonly mindPerHour?: number;
  readonly innerDemonPerHour?: number;
  readonly eventWeight?: Readonly<Record<string, number>>;
  readonly eventRewardMul?: Readonly<Record<string, number>>;
  readonly eventMindLossMul?: Readonly<Record<string, number>>;
  readonly eventRewardMulAll?: number;
  readonly eventMindLossMulAll?: number;
  readonly offlineMul?: number;
  readonly materialMul?: number;
  readonly bossEventWeight?: number;
  readonly fishingRiskMul?: number;
  /** 触发型功法标记（文案/条件展示用）。 */
  readonly trigger?: string;
  readonly [k: string]: unknown;
}

export interface TechniqueDef {
  readonly id: string;
  readonly name: string;
  readonly rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  readonly slot: 'main' | 'either';
  readonly description: string;
  readonly maxLevel: number;
  readonly upgradeCost: Readonly<Record<string, number>>;
  readonly modifiers: TechniqueModifiers;
}

export interface EquipmentDef {
  readonly id: string;
  readonly name: string;
  readonly rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  readonly slot: 'DESK' | 'BADGE' | 'ACCESSORY';
  readonly description: string;
  readonly modifiers: TechniqueModifiers;
}

export interface RecipeDef {
  readonly id: string;
  readonly category: '丹药' | '功法' | '法宝' | '材料';
  readonly name: string;
  readonly ingredients: Readonly<Record<string, number>>;
  readonly output: {
    readonly consumable?: string;
    readonly technique?: string;
    readonly equipment?: string;
    readonly material?: Readonly<Record<string, number>>;
  };
  readonly description: string;
  readonly salaryCost?: number;
}

export interface ConsumableDef {
  readonly id: string;
  readonly name: string;
  readonly effect: { mind?: number; innerDemon?: number; salary?: number; buff?: string; flag?: string };
  readonly description: string;
}

export interface ShopStockItem {
  readonly itemId: string;
  readonly price: number;
  readonly stock: number;
}

export interface ShopDef {
  readonly refreshPerDay: number;
  readonly stock: readonly ShopStockItem[];
  readonly rarePool: readonly string[];
  readonly blackMarketPool: readonly string[];
}

interface ItemsBundle {
  readonly materials: readonly MaterialDef[];
  readonly techniques: readonly TechniqueDef[];
  readonly equipment: readonly EquipmentDef[];
  readonly recipes: readonly RecipeDef[];
  readonly consumables: readonly ConsumableDef[];
  readonly shop: ShopDef;
}

export const ITEMS = itemsConfig as unknown as ItemsBundle;
export const MATERIAL_MAP = new Map(ITEMS.materials.map((m) => [m.id, m]));
export const TECHNIQUE_MAP = new Map(ITEMS.techniques.map((t) => [t.id, t]));
export const EQUIPMENT_MAP = new Map(ITEMS.equipment.map((e) => [e.id, e]));
export const RECIPE_MAP = new Map(ITEMS.recipes.map((r) => [r.id, r]));
export const CONSUMABLE_MAP = new Map(ITEMS.consumables.map((c) => [c.id, c]));

export const EQUIP_SLOTS = ['DESK', 'BADGE', 'ACCESSORY'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export interface CraftResult {
  readonly success: boolean;
  readonly reason?: string;
  readonly message?: string;
}

export class V2ItemService {
  private readonly rng: Rng;

  public constructor(
    private readonly context: GameContext,
    private readonly clock: GameClockV2,
    private readonly gameDay: GameDayService,
    random: RandomService,
  ) {
    this.rng = random.rng();
  }

  // ── 材料（§61~§63） ───────────────────────────────────────────────────────

  public addMaterial(id: string, count: number): void {
    const p = this.context.player;
    if (!MATERIAL_MAP.has(id) && !CONSUMABLE_MAP.has(id)) throw new Error(`未知材料 ${id}`);
    if (!Number.isFinite(count) || count === 0) return;
    p.materials[id] = Math.max(0, (p.materials[id] ?? 0) + Math.floor(count));
    if (count > 0) this.gameDay.addMaterialsGained(Math.floor(count));
    this.context.events.emit('materialChanged', { materialId: id, total: p.materials[id] });
  }

  public materialCount(id: string): number {
    return this.context.player.materials[id] ?? 0;
  }

  private tryConsumeMaterials(cost: Readonly<Record<string, number>>): boolean {
    for (const [id, count] of Object.entries(cost)) {
      if (count <= 0) continue;
      if (this.materialCount(id) < count) return false;
    }
    for (const [id, count] of Object.entries(cost)) {
      if (count > 0) this.addMaterial(id, -count);
    }
    return true;
  }

  // ── 功法（§49/§53） ───────────────────────────────────────────────────────

  public grantTechnique(id: string): boolean {
    const p = this.context.player;
    if (!TECHNIQUE_MAP.has(id) || p.ownedTechniques.includes(id)) return false;
    p.ownedTechniques.push(id);
    this.context.events.emit('techniqueAcquired', { techniqueId: id });
    return true;
  }

  /** 随机获得一个未拥有的功法（按稀有度池；全拥有则折材料）。 */
  public grantRandomTechnique(rarity: 'COMMON' | 'RARE'): string | null {
    const pool = ITEMS.techniques.filter(
      (t) => t.rarity === rarity && !this.context.player.ownedTechniques.includes(t.id),
    );
    if (!pool.length) {
      this.addMaterial('mat_page', 3);
      return null;
    }
    const picked = this.rng.pick(pool);
    if (!picked) return null;
    this.grantTechnique(picked.id);
    return picked.id;
  }

  public equipTechnique(slotIndex: 0 | 1 | 2, techniqueId: string | null): boolean {
    const p = this.context.player;
    if (techniqueId !== null && !p.ownedTechniques.includes(techniqueId)) return false;
    if (techniqueId !== null) {
      const def = TECHNIQUE_MAP.get(techniqueId);
      if (!def) return false;
      // 主修槽只能放 main/either；辅助槽只能放 either
      if (slotIndex === 0 && def.slot !== 'main' && def.slot !== 'either') return false;
      if (slotIndex !== 0 && def.slot !== 'either') return false;
    }
    // 不能重复装备
    const current = [...p.equippedTechniques];
    if (techniqueId !== null && current.includes(techniqueId)) return false;
    current[slotIndex] = techniqueId;
    p.equippedTechniques = current;
    this.context.events.emit('techniqueEquipped', { slotIndex, techniqueId });
    return true;
  }

  /** 升级功法（§53）：消耗功法残页+道心墨（按稀有度），Lv3 质变。 */
  public upgradeTechnique(id: string): CraftResult {
    const p = this.context.player;
    const def = TECHNIQUE_MAP.get(id);
    if (!def || !p.ownedTechniques.includes(id)) return { success: false, reason: '未拥有该功法' };
    const level = p.techniqueLevels[id] ?? 1;
    if (level >= def.maxLevel) return { success: false, reason: '已达最高等级' };
    const mul = level === 1 ? 1 : 2; // Lv2 → Lv3 双倍消耗
    const cost: Record<string, number> = {};
    for (const [mat, n] of Object.entries(def.upgradeCost)) {
      if (n > 0) cost[mat] = n * mul;
    }
    if (!this.tryConsumeMaterials(cost)) return { success: false, reason: '材料不足' };
    p.techniqueLevels[id] = level + 1;
    if (level + 1 === 3) {
      this.context.events.emit('techniqueEvolved', { techniqueId: id, level: 3 });
    }
    this.context.events.emit('techniqueUpgraded', { techniqueId: id, level: level + 1 });
    return { success: true, message: `${def.name} 升至 Lv${level + 1}` };
  }

  // ── 装备（§57） ───────────────────────────────────────────────────────────

  public grantEquipment(id: string): boolean {
    const p = this.context.player;
    if (!EQUIPMENT_MAP.has(id) || p.ownedEquipment.includes(id)) return false;
    p.ownedEquipment.push(id);
    this.context.events.emit('equipmentAcquired', { equipmentId: id });
    return true;
  }

  public equipItem(slot: EquipSlot, equipmentId: string | null): boolean {
    const p = this.context.player;
    if (equipmentId !== null) {
      const def = EQUIPMENT_MAP.get(equipmentId);
      if (!def || !p.ownedEquipment.includes(equipmentId) || def.slot !== slot) return false;
    }
    p.equippedEquipment = { ...p.equippedEquipment, [slot]: equipmentId };
    this.context.events.emit('equipmentEquipped', { slot, equipmentId });
    return true;
  }

  // ── 合成（§64~§67） ───────────────────────────────────────────────────────

  /** 合成（§262 事务式：先校验材料与工资，再原子扣除/产出）。 */
  public craft(recipeId: string): CraftResult {
    const p = this.context.player;
    const def = RECIPE_MAP.get(recipeId);
    if (!def) return { success: false, reason: '配方不存在' };
    if ((def.salaryCost ?? 0) > p.salary) return { success: false, reason: '工资不足' };

    // 校验快照
    for (const [mat, count] of Object.entries(def.ingredients)) {
      if (count > 0 && this.materialCount(mat) < count) return { success: false, reason: `材料不足：${MATERIAL_MAP.get(mat)?.name ?? mat}` };
    }
    // 产出检查
    if (def.output.consumable && !CONSUMABLE_MAP.has(def.output.consumable)) return { success: false, reason: '配方产物无效' };

    // 原子执行
    for (const [mat, count] of Object.entries(def.ingredients)) {
      if (count > 0) this.addMaterial(mat, -count);
    }
    if (def.salaryCost) {
      p.salary -= def.salaryCost;
      this.context.events.emit('salaryChanged', { amount: -def.salaryCost, total: p.salary });
    }
    let message = '';
    if (def.output.consumable) {
      this.addMaterial(def.output.consumable, 1);
      message = `炼得 ${CONSUMABLE_MAP.get(def.output.consumable)?.name}`;
    } else if (def.output.technique) {
      if (def.output.technique === 'random_common' || def.output.technique === 'random_rare') {
        const got = this.grantRandomTechnique(def.output.technique === 'random_common' ? 'COMMON' : 'RARE');
        message = got ? `参悟出 ${TECHNIQUE_MAP.get(got)?.name}` : '残页化作了修为（功法已集齐）';
        if (!got) this.addMaterial('mat_page', 0);
      } else {
        const ok = this.grantTechnique(def.output.technique);
        message = ok ? `习得 ${TECHNIQUE_MAP.get(def.output.technique)?.name}` : '已拥有该功法，残页化为感悟';
        if (!ok) p.cultivationExp += 50;
      }
    } else if (def.output.equipment) {
      const ok = this.grantEquipment(def.output.equipment);
      message = ok ? `炼得 ${EQUIPMENT_MAP.get(def.output.equipment)?.name}` : '已拥有该法宝';
      if (!ok) this.addMaterial('mat_stone_fragment', 3);
    } else if (def.output.material) {
      for (const [mat, count] of Object.entries(def.output.material)) {
        this.addMaterial(mat, count);
      }
      message = '材料合成完成';
    }
    this.context.events.emit('v2Crafted', { recipeId, message });
    return { success: true, message };
  }

  // ── 消耗品（§68） ─────────────────────────────────────────────────────────

  public useConsumable(id: string): CraftResult {
    const p = this.context.player;
    const def = CONSUMABLE_MAP.get(id);
    if (!def) return { success: false, reason: '未知消耗品' };
    if (this.materialCount(id) <= 0) return { success: false, reason: '数量不足' };
    // 摸鱼符一次性旗标
    if (def.effect.flag) {
      if (p.eventFlags[def.effect.flag]) return { success: false, reason: '同类符箓已生效' };
      p.eventFlags[def.effect.flag] = true;
    }
    this.addMaterial(id, -1);
    const eff = def.effect;
    if (eff.mind) this.context.mind.applyDelta(eff.mind);
    if (eff.innerDemon) {
      this.context.innerDemon.add(eff.innerDemon);
    }
    if (eff.salary) {
      p.salary += eff.salary;
      this.context.events.emit('salaryChanged', { amount: eff.salary, total: p.salary });
    }
    if (eff.buff) {
      const [buffId, mulStr, secStr] = eff.buff.split(':');
      this.context.buffs.addBuff(
        buffId as Parameters<typeof this.context.buffs.addBuff>[0],
        Number(mulStr) || 1.5,
        Number(secStr) || 600,
      );
    }
    this.context.events.emit('consumableUsed', { consumableId: id });
    return { success: true, message: `使用了 ${def.name}` };
  }

  // ── 商店（§99/§100/§101） ────────────────────────────────────────────────

  /** 今日货架（dayIndex 种子刷新，每天不同但可复现）。 */
  public todayShop(): { item: ShopStockItem; name: string; sold: boolean }[] {
    const p = this.context.player;
    const dayIndex = Math.max(1, this.gameDay.dayIndex());
    const rng = this.context.randomV2.forDay(dayIndex, 777);
    const base = [...ITEMS.shop.stock];
    // 每天 1 个稀有位替换
    const rareIdx = rng.int(0, base.length - 1);
    const rareItem = rng.pick(ITEMS.shop.rarePool) ?? 'cons_spirit';
    base[rareIdx] = { itemId: rareItem, price: 250, stock: 1 };
    const result: { item: ShopStockItem; name: string; sold: boolean }[] = [];
    for (const stock of base) {
      const name = MATERIAL_MAP.get(stock.itemId)?.name
        ?? CONSUMABLE_MAP.get(stock.itemId)?.name
        ?? EQUIPMENT_MAP.get(stock.itemId)?.name
        ?? stock.itemId;
      result.push({ item: stock, name, sold: p.eventFlags[`shop_bought_${dayIndex}_${stock.itemId}`] === true });
    }
    return result;
  }

  public buy(itemId: string, price: number): CraftResult {
    const p = this.context.player;
    const dayIndex = Math.max(1, this.gameDay.dayIndex());
    const flagKey = `shop_bought_${dayIndex}_${itemId}`;
    if (p.eventFlags[flagKey]) return { success: false, reason: '今日已购罄' };
    if (p.salary < price) return { success: false, reason: '工资不足' };
    p.salary -= price;
    p.eventFlags[flagKey] = true;
    // 交付
    if (CONSUMABLE_MAP.has(itemId)) this.addMaterial(itemId, 1);
    else if (MATERIAL_MAP.has(itemId)) this.addMaterial(itemId, 1);
    else if (EQUIPMENT_MAP.has(itemId)) this.grantEquipment(itemId);
    else if (TECHNIQUE_MAP.has(itemId)) this.grantTechnique(itemId);
    else return { success: false, reason: '商品不存在' };
    this.context.events.emit('salaryChanged', { amount: -price, total: p.salary });
    return { success: true, message: '购买成功' };
  }

  /** 神秘黑市（§101）：低概率事件中开放一次购买窗口。 */
  public blackMarketOffer(): { itemId: string; name: string; price: number } | null {
    const dayIndex = Math.max(1, this.gameDay.dayIndex());
    const rng = this.context.randomV2.forDay(dayIndex, 999);
    if (!rng.chance(0.15)) return null;
    const id = rng.pick(ITEMS.shop.blackMarketPool);
    if (!id) return null;
    const name = TECHNIQUE_MAP.get(id)?.name ?? EQUIPMENT_MAP.get(id)?.name ?? MATERIAL_MAP.get(id)?.name ?? id;
    return { itemId: id, name, price: 600 + rng.int(0, 400) };
  }
}
