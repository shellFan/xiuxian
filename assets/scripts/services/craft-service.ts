/**
 * CraftService — PC V1 crafting system.
 *
 * Replaces the merge board as the core interactive mechanic.
 * Players spend cultivation exp and spirit stones to craft items
 * that provide resource bonuses. Recipes unlock based on career level.
 */

import type { GameContext } from '../core/game-context';
import type { GameEffect } from '../model/game-effect';

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
}

export interface CraftConfig {
  readonly recipes: readonly CraftRecipe[];
}

export interface CraftResult {
  readonly success: boolean;
  readonly recipe?: CraftRecipe;
  readonly reason?: string;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class CraftService {
  private readonly recipes: readonly CraftRecipe[];

  public constructor(
    private readonly context: GameContext,
    config?: CraftConfig,
  ) {
    this.recipes = Object.freeze([...(config?.recipes ?? [])]);
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

    if (player.spiritStones < recipe.costSpiritStones) {
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

  /** Execute a craft. Deducts resources and applies the effect. */
  public craft(recipeId: string): CraftResult {
    const check = this.canCraft(recipeId);
    if (!check.canCraft) {
      return { success: false, reason: check.reason };
    }

    const recipe = this.recipes.find((r) => r.id === recipeId)!;
    const player = this.context.player;

    // Deduct costs
    player.cultivationExp -= recipe.costCultivation;
    player.spiritStones -= recipe.costSpiritStones;

    // Track crafted item
    player.craftedItemIds = [...player.craftedItemIds, recipeId];

    // Apply effect
    this.context.effects.apply(recipe.effect);

    // Emit event
    this.context.events.emit('itemCrafted', { recipeId, recipeName: recipe.name });

    return { success: true, recipe };
  }

  /** How many times a recipe has been crafted. */
  public getCraftedCount(recipeId: string): number {
    return this.context.player.craftedItemIds.filter((id) => id === recipeId).length;
  }

  /** Total number of items crafted. */
  public getTotalCraftedCount(): number {
    return this.context.player.craftedItemIds.length;
  }
}