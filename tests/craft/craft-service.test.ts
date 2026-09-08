import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { CraftService, type CraftConfig, type CraftRecipe } from '../../assets/scripts/services/craft-service';

// ── Test fixtures ───────────────────────────────────────────────────────────

const TEST_RECIPES: readonly CraftRecipe[] = [
  {
    id: 'pill_basic',
    name: '基础丹',
    description: '基础修为丹',
    costCultivation: 100,
    costSpiritStones: 0,
    effect: { cultivation: 50 },
    unlockCareerLevel: 1,
    maxCraftCount: 0, // unlimited
  },
  {
    id: 'pill_advanced',
    name: '高级丹',
    description: '高级修为丹',
    costCultivation: 500,
    costSpiritStones: 10,
    effect: { cultivation: 200 },
    unlockCareerLevel: 2,
    maxCraftCount: 0,
  },
  {
    id: 'artifact_limited',
    name: '限时法器',
    description: '限次法器',
    costCultivation: 200,
    costSpiritStones: 5,
    effect: { performance: 50 },
    unlockCareerLevel: 1,
    maxCraftCount: 2, // max 2 times
  },
];

const TEST_CONFIG: CraftConfig = { recipes: TEST_RECIPES };

function createContext(playerOverrides: Record<string, unknown> = {}): GameContext {
  return new GameContext({
    player: new PlayerData(playerOverrides),
    saveService: new SaveService(new MemoryStorageAdapter()),
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

function testAllRecipesReturnsAll(): void {
  const ctx = createContext();
  const craft = new CraftService(ctx, TEST_CONFIG);
  assert.equal(craft.allRecipes.length, 3);
  assert.equal(craft.allRecipes[0].id, 'pill_basic');
  assert.equal(craft.allRecipes[2].id, 'artifact_limited');
  console.log('✔ CraftService: allRecipes returns all recipes');
}

function testGetAvailableRecipesFiltersByCareerLevel(): void {
  const ctx = createContext({ careerLevel: 1 });
  const craft = new CraftService(ctx, TEST_CONFIG);
  const available = craft.getAvailableRecipes();
  assert.equal(available.length, 2); // pill_basic + artifact_limited
  assert.ok(available.every((r) => r.unlockCareerLevel <= 1));
  console.log('✔ CraftService: getAvailableRecipes filters by career level');
}

function testGetAvailableRecipesAtLevel2(): void {
  const ctx = createContext({ careerLevel: 2 });
  const craft = new CraftService(ctx, TEST_CONFIG);
  const available = craft.getAvailableRecipes();
  assert.equal(available.length, 3);
  console.log('✔ CraftService: getAvailableRecipes at level 2 returns all');
}

function testCanCraftReturnsTrueWhenAllConditionsMet(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 500, spiritStones: 10 });
  const craft = new CraftService(ctx, TEST_CONFIG);
  const check = craft.canCraft('pill_basic');
  assert.equal(check.canCraft, true);
  assert.equal(check.reason, undefined);
  console.log('✔ CraftService: canCraft returns true when conditions met');
}

function testCanCraftReturnsFalseForUnknownRecipe(): void {
  const ctx = createContext();
  const craft = new CraftService(ctx, TEST_CONFIG);
  const check = craft.canCraft('nonexistent');
  assert.equal(check.canCraft, false);
  assert.equal(check.reason, '配方不存在');
  console.log('✔ CraftService: canCraft returns false for unknown recipe');
}

function testCanCraftReturnsFalseWhenCareerLevelTooLow(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 1000, spiritStones: 100 });
  const craft = new CraftService(ctx, TEST_CONFIG);
  const check = craft.canCraft('pill_advanced');
  assert.equal(check.canCraft, false);
  assert.equal(check.reason, '职级不足');
  console.log('✔ CraftService: canCraft returns false when career level too low');
}

function testCanCraftReturnsFalseWhenCultivationInsufficient(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 50, spiritStones: 10 });
  const craft = new CraftService(ctx, TEST_CONFIG);
  const check = craft.canCraft('pill_basic');
  assert.equal(check.canCraft, false);
  assert.equal(check.reason, '修为不足');
  console.log('✔ CraftService: canCraft returns false when cultivation insufficient');
}

function testCanCraftReturnsFalseWhenSpiritStonesInsufficient(): void {
  const ctx = createContext({ careerLevel: 2, cultivationExp: 1000, spiritStones: 0 });
  const craft = new CraftService(ctx, TEST_CONFIG);
  const check = craft.canCraft('pill_advanced');
  assert.equal(check.canCraft, false);
  assert.equal(check.reason, '灵石不足');
  console.log('✔ CraftService: canCraft returns false when spirit stones insufficient');
}

function testCanCraftReturnsFalseWhenMaxCraftCountReached(): void {
  const ctx = createContext({
    careerLevel: 1,
    cultivationExp: 1000,
    spiritStones: 100,
    craftedItemIds: ['artifact_limited', 'artifact_limited'],
  });
  const craft = new CraftService(ctx, TEST_CONFIG);
  const check = craft.canCraft('artifact_limited');
  assert.equal(check.canCraft, false);
  assert.equal(check.reason, '已达上限');
  console.log('✔ CraftService: canCraft returns false when max craft count reached');
}

function testCanCraftReturnsTrueWhenUnderMaxCraftCount(): void {
  const ctx = createContext({
    careerLevel: 1,
    cultivationExp: 1000,
    spiritStones: 100,
    craftedItemIds: ['artifact_limited'],
  });
  const craft = new CraftService(ctx, TEST_CONFIG);
  const check = craft.canCraft('artifact_limited');
  assert.equal(check.canCraft, true);
  console.log('✔ CraftService: canCraft returns true when under max craft count');
}

function testCraftDeductsResourcesAndAppliesEffect(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 500, spiritStones: 10 });
  const craft = new CraftService(ctx, TEST_CONFIG);
  const result = craft.craft('pill_basic');
  assert.equal(result.success, true);
  assert.equal(result.recipe?.id, 'pill_basic');
  // 500 - 100 (cost) + 50 (effect) = 450 cultivation
  assert.equal(ctx.player.cultivationExp, 450);
  // 10 - 0 = 10 spirit stones remaining
  assert.equal(ctx.player.spiritStones, 10);
  // craftedItemIds tracked
  assert.deepEqual(ctx.player.craftedItemIds, ['pill_basic']);
  console.log('✔ CraftService: craft deducts resources and applies effect');
}

function testCraftFailsWhenCannotCraft(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 10, spiritStones: 0 });
  const craft = new CraftService(ctx, TEST_CONFIG);
  const result = craft.craft('pill_basic');
  assert.equal(result.success, false);
  assert.equal(result.reason, '修为不足');
  assert.equal(ctx.player.cultivationExp, 10); // unchanged
  console.log('✔ CraftService: craft fails when cannot craft');
}

function testCraftWithSpiritStoneCost(): void {
  const ctx = createContext({ careerLevel: 2, cultivationExp: 1000, spiritStones: 20 });
  const craft = new CraftService(ctx, TEST_CONFIG);
  const result = craft.craft('pill_advanced');
  assert.equal(result.success, true);
  // 1000 - 500 = 500, then effect cultivation +200 = 700
  assert.equal(ctx.player.cultivationExp, 700);
  // 20 - 10 = 10
  assert.equal(ctx.player.spiritStones, 10);
  console.log('✔ CraftService: craft with spirit stone cost');
}

function testCraftEmitsItemCraftedEvent(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 500, spiritStones: 10 });
  const craft = new CraftService(ctx, TEST_CONFIG);
  let emitted = false;
  let emittedRecipeId = '';
  ctx.events.on('itemCrafted', (data) => {
    emitted = true;
    emittedRecipeId = data.recipeId;
  });
  craft.craft('pill_basic');
  assert.equal(emitted, true);
  assert.equal(emittedRecipeId, 'pill_basic');
  console.log('✔ CraftService: craft emits itemCrafted event');
}

function testGetCraftedCount(): void {
  const ctx = createContext({
    careerLevel: 1,
    cultivationExp: 1000,
    spiritStones: 100,
    craftedItemIds: ['pill_basic', 'pill_basic', 'artifact_limited'],
  });
  const craft = new CraftService(ctx, TEST_CONFIG);
  assert.equal(craft.getCraftedCount('pill_basic'), 2);
  assert.equal(craft.getCraftedCount('artifact_limited'), 1);
  assert.equal(craft.getCraftedCount('pill_advanced'), 0);
  console.log('✔ CraftService: getCraftedCount returns correct counts');
}

function testGetTotalCraftedCount(): void {
  const ctx = createContext({
    careerLevel: 1,
    cultivationExp: 1000,
    spiritStones: 100,
    craftedItemIds: ['pill_basic', 'pill_basic', 'artifact_limited'],
  });
  const craft = new CraftService(ctx, TEST_CONFIG);
  assert.equal(craft.getTotalCraftedCount(), 3);
  console.log('✔ CraftService: getTotalCraftedCount returns total');
}

function testCraftIncrementsCraftedCount(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 2000, spiritStones: 100 });
  const craft = new CraftService(ctx, TEST_CONFIG);
  assert.equal(craft.getCraftedCount('pill_basic'), 0);
  craft.craft('pill_basic');
  assert.equal(craft.getCraftedCount('pill_basic'), 1);
  craft.craft('pill_basic');
  assert.equal(craft.getCraftedCount('pill_basic'), 2);
  console.log('✔ CraftService: craft increments crafted count');
}

function testCraftLimitedRecipeRespectsMaxCount(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 5000, spiritStones: 100 });
  const craft = new CraftService(ctx, TEST_CONFIG);
  // artifact_limited has maxCraftCount = 2
  const r1 = craft.craft('artifact_limited');
  assert.equal(r1.success, true);
  const r2 = craft.craft('artifact_limited');
  assert.equal(r2.success, true);
  const r3 = craft.craft('artifact_limited');
  assert.equal(r3.success, false);
  assert.equal(r3.reason, '已达上限');
  console.log('✔ CraftService: limited recipe respects max craft count');
}

function testCraftServiceWithEmptyConfig(): void {
  const ctx = createContext();
  const craft = new CraftService(ctx, { recipes: [] });
  assert.equal(craft.allRecipes.length, 0);
  assert.equal(craft.getAvailableRecipes().length, 0);
  assert.equal(craft.getCraftedCount('anything'), 0);
  assert.equal(craft.getTotalCraftedCount(), 0);
  const result = craft.craft('nonexistent');
  assert.equal(result.success, false);
  console.log('✔ CraftService: empty config works correctly');
}

function testCraftServiceWithNoConfig(): void {
  const ctx = createContext();
  const craft = new CraftService(ctx);
  assert.equal(craft.allRecipes.length, 0);
  console.log('✔ CraftService: no config defaults to empty recipes');
}

// ── Run ─────────────────────────────────────────────────────────────────────

testAllRecipesReturnsAll();
testGetAvailableRecipesFiltersByCareerLevel();
testGetAvailableRecipesAtLevel2();
testCanCraftReturnsTrueWhenAllConditionsMet();
testCanCraftReturnsFalseForUnknownRecipe();
testCanCraftReturnsFalseWhenCareerLevelTooLow();
testCanCraftReturnsFalseWhenCultivationInsufficient();
testCanCraftReturnsFalseWhenSpiritStonesInsufficient();
testCanCraftReturnsFalseWhenMaxCraftCountReached();
testCanCraftReturnsTrueWhenUnderMaxCraftCount();
testCraftDeductsResourcesAndAppliesEffect();
testCraftFailsWhenCannotCraft();
testCraftWithSpiritStoneCost();
testCraftEmitsItemCraftedEvent();
testGetCraftedCount();
testGetTotalCraftedCount();
testCraftIncrementsCraftedCount();
testCraftLimitedRecipeRespectsMaxCount();
testCraftServiceWithEmptyConfig();
testCraftServiceWithNoConfig();

console.log('craft service tests passed');