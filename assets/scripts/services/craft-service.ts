/**
 * CraftService — PC V1 crafting system（V11-S2 炼丹深化）.
 *
 * Players spend cultivation exp and spirit stones to craft items
 * that provide resource bonuses. Recipes unlock based on career level.
 *
 * V11 变更（任务书§11，技能 rpg/game-feel，见 docs/V11_V15/DEVELOPMENT_LOG.md）：
 *  - 新增成功率（successRate）：失败消耗材料、不产出、计 itemCraftFailed 事件
 *  - 新增品质（normal/good/fine/perfect）：按 qualityWeights 掷取，效果 ×1/1.3/1.7/2.5
 *  - 注入 RandomProvider（确定性测试；旧两参构造兼容，默认 MathRandomProvider）
 *  - 事务一致性（任务书§23）：效果应用失败时回滚材料扣除与计数，杜绝「扣材料无产出」
 *  - 构造期配置校验：successRate∈(0,1]、weights 长度/非负/和>0，坏配置快速失败
 * 修为→修为类配方在品质乘子下 EV 仍为负（净消耗池），不会形成无限产资源回路。
 */

import type { GameContext } from '../core/game-context';
import type { GameEffect } from '../model/game-effect';
import type { RandomProvider } from '../core/random-provider';
import { DEFAULT_RANDOM_PROVIDER } from '../core/random-provider';
import type { Clock } from '../core/clock';
import { DEFAULT_CLOCK } from '../core/clock';

// ── Recipe Types ─────────────────────────────────────────────────────────────

export interface CraftRecipe {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly costCultivation: number;
  readonly costSpiritStones: number;
  readonly effect: GameEffect;
  readonly unlockCareerLevel: number;
  /** Max times this recipe can be crafted. 0 = unlimited. */
  readonly maxCraftCount: number;
  /** V12-R3：炼丹时长（秒）。缺省 0 = 即时炼制（旧配置/测试兼容）；>0 走队列挂机+领取。 */
  readonly durationSeconds?: number;
  /** 成功率 (0,1]。缺省 1.0（旧配置兼容）。 */
  readonly successRate?: number;
  /** 品质权重 [普通,良品,上品,极品]，非负且和>0。缺省 DEFAULT_QUALITY_WEIGHTS。 */
  readonly qualityWeights?: readonly [number, number, number, number];
}

export interface CraftConfig {
  readonly recipes: readonly CraftRecipe[];
}

// ── Quality ──────────────────────────────────────────────────────────────────

export type CraftQuality = 'normal' | 'good' | 'fine' | 'perfect';

export const CRAFT_QUALITIES: readonly CraftQuality[] = Object.freeze(['normal', 'good', 'fine', 'perfect'] as const);

export const CRAFT_QUALITY_MULTIPLIERS: Readonly<Record<CraftQuality, number>> = Object.freeze({
  normal: 1,
  good: 1.3,
  fine: 1.7,
  perfect: 2.5,
});

export const CRAFT_QUALITY_LABELS: Readonly<Record<CraftQuality, string>> = Object.freeze({
  normal: '普通',
  good: '良品',
  fine: '上品',
  perfect: '极品',
});

const DEFAULT_QUALITY_WEIGHTS: readonly [number, number, number, number] = [0.6, 0.25, 0.12, 0.03];

// ── Result ───────────────────────────────────────────────────────────────────

export interface CraftResult {
  readonly success: boolean;
  readonly recipe?: CraftRecipe;
  readonly reason?: string;
  /** 成功时的品质与乘子（UI 展示用）。 */
  readonly quality?: CraftQuality;
  readonly qualityMultiplier?: number;
  /** 实际生效的效果（已乘品质乘子、取整）。 */
  readonly appliedEffect?: GameEffect;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class CraftService {
  private readonly recipes: readonly CraftRecipe[];
  private readonly random: RandomProvider;
  private readonly clock: Clock;

  public constructor(
    private readonly context: GameContext,
    config?: CraftConfig,
    random: RandomProvider = DEFAULT_RANDOM_PROVIDER,
    clock: Clock = DEFAULT_CLOCK,
  ) {
    this.recipes = Object.freeze([...(config?.recipes ?? [])]);
    this.random = random;
    this.clock = clock;
    for (const recipe of this.recipes) validateRecipe(recipe);
  }

  /** All recipes, frozen. */
  public get allRecipes(): readonly CraftRecipe[] {
    return this.recipes;
  }

  /** Recipes available at the player's current career level. */
  public getAvailableRecipes(): readonly CraftRecipe[] {
    const level = this.context.player.careerLevel;
    return this.recipes.filter((r) => level >= r.unlockCareerLevel);
  }

  /** Whether the player can craft a specific recipe. */
  public canCraft(recipeId: string): { canCraft: boolean; reason?: string } {
    const recipe = this.recipes.find((r) => r.id === recipeId);
    if (!recipe) return { canCraft: false, reason: '配方不存在' };

    const player = this.context.player;
    if (player.careerLevel < recipe.unlockCareerLevel) {
      return { canCraft: false, reason: '职级不足' };
    }

    if (player.cultivationExp < recipe.costCultivation) {
      return { canCraft: false, reason: '修为不足' };
    }

    // V12-R2：资源管理大师天赋——材料成本乘子（<1 折扣），消耗判定与实际扣除同源
    const costMul = this.context.buffs.getMultiplier('CRAFT_COST_REDUCTION');
    const stonesCost = Math.ceil(recipe.costSpiritStones * costMul);
    if (player.spiritStones < stonesCost) {
      return { canCraft: false, reason: '灵石不足' };
    }

    if (recipe.maxCraftCount > 0) {
      const crafted = this.getCraftedCount(recipeId);
      if (crafted >= recipe.maxCraftCount) {
        return { canCraft: false, reason: '已达上限' };
      }
    }

    return { canCraft: true };
  }

  /**
   * Execute a craft attempt. Materials are consumed regardless of outcome;
   * success applies a quality-scaled effect, failure produces nothing.
   * 效果应用（含存档）失败时回滚本次材料与计数，保证「要么全成、要么无痕」。
   */
  public craft(recipeId: string): CraftResult {
    const check = this.canCraft(recipeId);
    if (!check.canCraft) {
      return { success: false, reason: check.reason };
    }

    const recipe = this.recipes.find((r) => r.id === recipeId)!;
    const player = this.context.player;

    // 1. 扣除材料（attempt 消耗）；灵石变动必须发事件（UI 资源显示依赖，失败路径同样生效）
    const costMul = this.context.buffs.getMultiplier('CRAFT_COST_REDUCTION');
    const stonesCost = Math.ceil(recipe.costSpiritStones * costMul);
    player.cultivationExp -= recipe.costCultivation;
    if (stonesCost !== 0) {
      player.spiritStones -= stonesCost;
      try {
        this.context.events.emit('spiritStonesChanged', { amount: -stonesCost, total: player.spiritStones });
      } catch { /* 反馈监听不得影响事务本身 */ }
    }

    // 2. 成功率掷骰：失败 → 材料已耗、无产出（防无限制造资源）
    // V12-R2：修仙奇才天赋——CRAFT_SUCCESS_BOOST 乘子（rate × mult，钳 ≤0.95 保底失败可能）
    const successBoost = this.context.buffs.getMultiplier('CRAFT_SUCCESS_BOOST');
    const successRate = Math.min(0.95, (recipe.successRate ?? 1) * successBoost);
    if (this.random.next() >= successRate) {
      this.trackLifetimeStat('craftFailCount'); // V11-S4：炼丹成就统计（失败也是经历）
      this.context.events.emit('itemCraftFailed', {
        recipeId: recipe.id,
        recipeName: recipe.name,
        reason: '炼制失败',
      });
      return { success: false, reason: '炼制失败，材料已消耗' };
    }

    // 3. 品质掷骰（分段权重），效果按品质乘子取整
    const quality = rollQuality(recipe.qualityWeights ?? DEFAULT_QUALITY_WEIGHTS, () => this.random.next());
    const multiplier = CRAFT_QUALITY_MULTIPLIERS[quality];
    const appliedEffect = scaleEffect(recipe.effect, multiplier);

    // 4. 产出登记 + 效果应用（事务：apply 失败则回滚产出与材料）
    player.craftedItemIds = [...player.craftedItemIds, recipeId];
    try {
      this.context.effects.apply(appliedEffect);
    } catch (error) {
      // 回滚本次产出登记（末尾追加的那一条）与材料扣除（灵石按折扣后实际扣除量还原）
      const ids = player.craftedItemIds;
      if (ids.length > 0 && ids[ids.length - 1] === recipeId) {
        player.craftedItemIds = ids.slice(0, -1);
      }
      player.cultivationExp += recipe.costCultivation;
      player.spiritStones += stonesCost;
      throw error;
    }

    // 5. 统计 + 事件（在 apply 成功后计入，回滚路径不残留）
    this.trackLifetimeStat('craftSuccessCount');
    if (quality === 'perfect') this.trackLifetimeStat('craftPerfectCount');
    this.context.events.emit('itemCrafted', { recipeId: recipe.id, recipeName: recipe.name });

    return { success: true, recipe, quality, qualityMultiplier: multiplier, appliedEffect };
  }

  /** How many times a recipe has been crafted（仅成功产出计数）. */
  public getCraftedCount(recipeId: string): number {
    return this.context.player.craftedItemIds.filter((id) => id === recipeId).length;
  }

  /** Total number of items crafted（仅成功产出计数）. */
  public getTotalCraftedCount(): number {
    return this.context.player.craftedItemIds.length;
  }

  /** V11-S4：lifetimeStats 计数（成就条件 LIFETIME_STAT 读这些键）。 */
  private trackLifetimeStat(key: 'craftSuccessCount' | 'craftFailCount' | 'craftPerfectCount'): void {
    const player = this.context.player;
    const stats = player.lifetimeStats;
    player.lifetimeStats = { ...stats, [key]: (stats[key] ?? 0) + 1 };
  }

  // ── V12-R3：炼丹队列（时间/挂机/离线完成/防重复领取）───────────────────────

  /** 队列容量上限（同时炼制中的配方数）。 */
  public static readonly QUEUE_CAPACITY = 3;
  private static readonly QUEUE_KEY_PREFIX = 'craftQueue:';

  private queueKey(recipeId: string): string {
    return CraftService.QUEUE_KEY_PREFIX + recipeId;
  }

  /** 队列视图：进行中条目（配方 id/完成时间戳/剩余秒）。 */
  public getQueue(): readonly { recipeId: string; completesAtMs: number; remainingSeconds: number }[] {
    const now = this.clock.now();
    const queue: { recipeId: string; completesAtMs: number; remainingSeconds: number }[] = [];
    for (const [key, completesAtMs] of Object.entries(this.context.player.lifetimeStats)) {
      if (!key.startsWith(CraftService.QUEUE_KEY_PREFIX)) continue;
      const recipeId = key.slice(CraftService.QUEUE_KEY_PREFIX.length);
      queue.push({
        recipeId,
        completesAtMs,
        remainingSeconds: Math.max(0, Math.ceil((completesAtMs - now) / 1000)),
      });
    }
    return queue;
  }

  /**
   * 开始炼制（配方 durationSeconds > 0 时走队列）：扣材料 → 写完成时间戳（Clock 注入，
   * 离线/挂机自然完成；时钟回拨只会延迟领取，不会提前）。防重复：同配方排队中拒绝。
   */
  public startCraft(recipeId: string): { success: boolean; reason?: string; completesAtMs?: number } {
    const recipe = this.recipes.find((r) => r.id === recipeId);
    if (!recipe) return { success: false, reason: '配方不存在' };
    const duration = recipe.durationSeconds ?? 0;
    if (duration <= 0) {
      // 即时配方：走原 craft() 快路径
      const instant = this.craft(recipeId);
      return instant.success ? { success: true, completesAtMs: this.clock.now() } : { success: false, reason: instant.reason };
    }
    if (this.context.player.lifetimeStats[this.queueKey(recipeId)] !== undefined) {
      return { success: false, reason: '该配方已在炼制中' };
    }
    if (this.getQueue().length >= CraftService.QUEUE_CAPACITY) {
      return { success: false, reason: '丹炉已满（最多 3 炉）' };
    }
    const check = this.canCraft(recipeId);
    if (!check.canCraft) return { success: false, reason: check.reason };

    const player = this.context.player;
    const statsBefore = player.lifetimeStats;
    const stonesBefore = player.spiritStones;
    const completesAtMs = this.clock.now() + duration * 1000;

    // 成功率掷骰在投入时点（与即时模式语义一致）：失败消耗材料、不入队、不计产出；
    // 入队后必得成品（等待不含二次随机，避免挂机后挫败）。
    const successBoost = this.context.buffs.getMultiplier('CRAFT_SUCCESS_BOOST');
    const successRate = Math.min(0.95, (recipe.successRate ?? 1) * successBoost);
    if (this.random.next() >= successRate) {
      player.cultivationExp -= recipe.costCultivation;
      player.spiritStones -= recipe.costSpiritStones;
      player.lifetimeStats = { ...statsBefore };
      try {
        this.context.saveService.save(player);
      } catch (error) {
        player.lifetimeStats = statsBefore;
        player.cultivationExp += recipe.costCultivation;
        player.spiritStones = stonesBefore;
        throw error;
      }
      this.trackLifetimeStat('craftFailCount');
      this.context.events.emit('itemCraftFailed', { recipeId, recipeName: recipe.name, reason: '炼制失败' });
      return { success: false, reason: '炼制失败，材料已消耗' };
    }

    player.cultivationExp -= recipe.costCultivation;
    player.spiritStones -= recipe.costSpiritStones;
    player.lifetimeStats = { ...statsBefore, [this.queueKey(recipeId)]: completesAtMs };
    try {
      this.context.saveService.save(player);
    } catch (error) {
      player.lifetimeStats = statsBefore;
      player.cultivationExp += recipe.costCultivation;
      player.spiritStones = stonesBefore;
      throw error;
    }
    if (recipe.costSpiritStones !== 0) {
      try {
        this.context.events.emit('spiritStonesChanged', { amount: -recipe.costSpiritStones, total: player.spiritStones });
      } catch { /* 反馈监听不得影响事务本身 */ }
    }
    this.context.events.emit('itemCraftQueued', { recipeId, recipeName: recipe.name, completesAtMs });
    return { success: true, completesAtMs };
  }

  /**
   * 领取成品（到期后）：品质掷骰 → 效果 → 计数 → 清队列键（同事务内防重复领取）。
   * 未到期返回 { ready:false, remainingSeconds }。
   */
  public claimCraft(recipeId: string): { ready: boolean; success?: boolean; quality?: CraftQuality; reason?: string; remainingSeconds?: number } {
    const key = this.queueKey(recipeId);
    const completesAtMs = this.context.player.lifetimeStats[key];
    if (completesAtMs === undefined) return { ready: false, reason: '该配方不在炼制队列' };
    const remainingMs = completesAtMs - this.clock.now();
    if (remainingMs > 0) {
      return { ready: false, remainingSeconds: Math.ceil(remainingMs / 1000) };
    }
    const recipe = this.recipes.find((r) => r.id === recipeId);
    if (!recipe) return { ready: false, reason: '配方不存在' };

    const player = this.context.player;
    const statsBefore = player.lifetimeStats;
    // 清队列键（事务内）→ 防重复领取
    const nextStats: Record<string, number> = { ...statsBefore };
    delete nextStats[key];
    player.lifetimeStats = nextStats;

    // 品质掷骰（成功率按 1 计：排队即投入，成品必得，品质随机）
    const quality = rollQuality(recipe.qualityWeights ?? DEFAULT_QUALITY_WEIGHTS, () => this.random.next());
    const multiplier = CRAFT_QUALITY_MULTIPLIERS[quality];
    const appliedEffect = scaleEffect(recipe.effect, multiplier);

    player.craftedItemIds = [...player.craftedItemIds, recipeId];
    try {
      this.context.effects.apply(appliedEffect);
    } catch (error) {
      player.lifetimeStats = statsBefore;
      const ids = player.craftedItemIds;
      if (ids.length > 0 && ids[ids.length - 1] === recipeId) {
        player.craftedItemIds = ids.slice(0, -1);
      }
      throw error;
    }

    this.trackLifetimeStat('craftSuccessCount');
    if (quality === 'perfect') this.trackLifetimeStat('craftPerfectCount');
    this.context.events.emit('itemCrafted', { recipeId: recipe.id, recipeName: recipe.name });
    return { ready: true, success: true, quality };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function validateRecipe(recipe: CraftRecipe): void {
  if (recipe.successRate !== undefined) {
    if (!Number.isFinite(recipe.successRate) || recipe.successRate <= 0 || recipe.successRate > 1) {
      throw new Error(`Craft recipe ${recipe.id}: successRate must be in (0, 1], got ${recipe.successRate}`);
    }
  }
  if (recipe.qualityWeights !== undefined) {
    const weights = recipe.qualityWeights;
    if (!Array.isArray(weights) || weights.length !== 4) {
      throw new Error(`Craft recipe ${recipe.id}: qualityWeights must have exactly 4 entries`);
    }
    const sum = weights.reduce((acc, w) => {
      if (!Number.isFinite(w) || w < 0) throw new Error(`Craft recipe ${recipe.id}: qualityWeights must be non-negative numbers`);
      return acc + w;
    }, 0);
    if (sum <= 0) throw new Error(`Craft recipe ${recipe.id}: qualityWeights sum must be > 0`);
  }
}

/** 按累计权重掷品质；输入掷点 [0,1)。 */
export function rollQuality(weights: readonly number[], roll: () => number): CraftQuality {
  const total = weights.reduce((acc, w) => acc + w, 0);
  let point = roll() * total;
  for (let i = 0; i < CRAFT_QUALITIES.length; i++) {
    point -= weights[i];
    if (point < 0) return CRAFT_QUALITIES[i];
  }
  return CRAFT_QUALITIES[CRAFT_QUALITIES.length - 1];
}

function scaleEffect(effect: GameEffect, multiplier: number): GameEffect {
  const scale = (value: number | undefined): number | undefined => {
    if (value === undefined) return undefined;
    const scaled = Math.round(value * multiplier);
    return value > 0 ? Math.max(1, scaled) : scaled;
  };
  const out: { salary?: number; performance?: number; cultivation?: number; mind?: number } = {};
  const salary = scale(effect.salary);
  const performance = scale(effect.performance);
  const cultivation = scale(effect.cultivation);
  const mind = scale(effect.mind);
  if (salary !== undefined) out.salary = salary;
  if (performance !== undefined) out.performance = performance;
  if (cultivation !== undefined) out.cultivation = cultivation;
  if (mind !== undefined) out.mind = mind;
  return out;
}
