import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { CraftService, rollQuality, type CraftConfig, type CraftRecipe } from '../../assets/scripts/services/craft-service';
import { SequenceRandomProvider } from '../../assets/scripts/core/random-provider';

/** V11-S2：确定性随机源（恒 0 → 必成功 + 普通品质 ×1），保持既有期望值成立。 */
const DETERMINISTIC_RNG = new SequenceRandomProvider([0]);
import { FakeClock } from '../../assets/scripts/core/clock';

const QUEUE_RECIPE: CraftRecipe = {
  id: 'pill_timed', name: '定时丹', description: '60 秒炼制',
  costCultivation: 100, costSpiritStones: 0, effect: { cultivation: 50 },
  unlockCareerLevel: 1, maxCraftCount: 0, durationSeconds: 60,
};
const QUEUE_CONFIG: CraftConfig = { recipes: [QUEUE_RECIPE] };

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
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
  assert.equal(craft.allRecipes.length, 3);
  assert.equal(craft.allRecipes[0].id, 'pill_basic');
  assert.equal(craft.allRecipes[2].id, 'artifact_limited');
  console.log('✔ CraftService: allRecipes returns all recipes');
}

function testGetAvailableRecipesFiltersByCareerLevel(): void {
  const ctx = createContext({ careerLevel: 1 });
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
  const available = craft.getAvailableRecipes();
  assert.equal(available.length, 2); // pill_basic + artifact_limited
  assert.ok(available.every((r) => r.unlockCareerLevel <= 1));
  console.log('✔ CraftService: getAvailableRecipes filters by career level');
}

function testGetAvailableRecipesAtLevel2(): void {
  const ctx = createContext({ careerLevel: 2 });
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
  const available = craft.getAvailableRecipes();
  assert.equal(available.length, 3);
  console.log('✔ CraftService: getAvailableRecipes at level 2 returns all');
}

function testCanCraftReturnsTrueWhenAllConditionsMet(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 500, spiritStones: 10 });
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
  const check = craft.canCraft('pill_basic');
  assert.equal(check.canCraft, true);
  assert.equal(check.reason, undefined);
  console.log('✔ CraftService: canCraft returns true when conditions met');
}

function testCanCraftReturnsFalseForUnknownRecipe(): void {
  const ctx = createContext();
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
  const check = craft.canCraft('nonexistent');
  assert.equal(check.canCraft, false);
  assert.equal(check.reason, '配方不存在');
  console.log('✔ CraftService: canCraft returns false for unknown recipe');
}

function testCanCraftReturnsFalseWhenCareerLevelTooLow(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 1000, spiritStones: 100 });
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
  const check = craft.canCraft('pill_advanced');
  assert.equal(check.canCraft, false);
  assert.equal(check.reason, '职级不足');
  console.log('✔ CraftService: canCraft returns false when career level too low');
}

function testCanCraftReturnsFalseWhenCultivationInsufficient(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 50, spiritStones: 10 });
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
  const check = craft.canCraft('pill_basic');
  assert.equal(check.canCraft, false);
  assert.equal(check.reason, '修为不足');
  console.log('✔ CraftService: canCraft returns false when cultivation insufficient');
}

function testCanCraftReturnsFalseWhenSpiritStonesInsufficient(): void {
  const ctx = createContext({ careerLevel: 2, cultivationExp: 1000, spiritStones: 0 });
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
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
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
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
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
  const check = craft.canCraft('artifact_limited');
  assert.equal(check.canCraft, true);
  console.log('✔ CraftService: canCraft returns true when under max craft count');
}

function testCraftDeductsResourcesAndAppliesEffect(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 500, spiritStones: 10 });
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
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
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
  const result = craft.craft('pill_basic');
  assert.equal(result.success, false);
  assert.equal(result.reason, '修为不足');
  assert.equal(ctx.player.cultivationExp, 10); // unchanged
  console.log('✔ CraftService: craft fails when cannot craft');
}

function testCraftWithSpiritStoneCost(): void {
  const ctx = createContext({ careerLevel: 2, cultivationExp: 1000, spiritStones: 20 });
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
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
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
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
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
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
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
  assert.equal(craft.getTotalCraftedCount(), 3);
  console.log('✔ CraftService: getTotalCraftedCount returns total');
}

function testCraftIncrementsCraftedCount(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 2000, spiritStones: 100 });
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
  assert.equal(craft.getCraftedCount('pill_basic'), 0);
  craft.craft('pill_basic');
  assert.equal(craft.getCraftedCount('pill_basic'), 1);
  craft.craft('pill_basic');
  assert.equal(craft.getCraftedCount('pill_basic'), 2);
  console.log('✔ CraftService: craft increments crafted count');
}

function testCraftLimitedRecipeRespectsMaxCount(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 5000, spiritStones: 100 });
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
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

// ── V11-S2：成功率 / 品质 / 事务回滚 ─────────────────────────────────────────

const RATE_RECIPE: CraftRecipe = {
  id: 'pill_risky',
  name: '险丹',
  description: '成功率 50% 的丹药',
  costCultivation: 100,
  costSpiritStones: 0,
  effect: { cultivation: 50 },
  unlockCareerLevel: 1,
  maxCraftCount: 0,
  successRate: 0.5,
};

const RATE_CONFIG: CraftConfig = { recipes: [RATE_RECIPE] };

class ThrowingSaveService extends SaveService {
  public save(): void { throw new Error('disk full'); }
}

function testCraftFailureConsumesMaterialsWithoutEffectOrCount(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 500, spiritStones: 10 });
  const craft = new CraftService(ctx, RATE_CONFIG, new SequenceRandomProvider([0.95])); // 0.95 >= 0.5 → 失败
  const result = craft.craft('pill_risky');
  assert.equal(result.success, false);
  assert.equal(result.reason, '炼制失败，材料已消耗');
  assert.equal(ctx.player.cultivationExp, 400); // 500-100：材料消耗
  assert.equal(ctx.player.spiritStones, 10);
  assert.deepEqual(ctx.player.craftedItemIds, []); // 无产出登记
  assert.equal(craft.getCraftedCount('pill_risky'), 0);
  console.log('✔ CraftService(V11): failure consumes materials, no effect, no count');
}

function testCraftSuccessRateRollBoundary(): void {
  // roll 0.49 < 0.5 → 成功；roll 0.5 >= 0.5 → 失败（左闭右开区间）
  const a = createContext({ careerLevel: 1, cultivationExp: 500 });
  const craftA = new CraftService(a, RATE_CONFIG, new SequenceRandomProvider([0.49]));
  assert.equal(craftA.craft('pill_risky').success, true);
  const b = createContext({ careerLevel: 1, cultivationExp: 500 });
  const craftB = new CraftService(b, RATE_CONFIG, new SequenceRandomProvider([0.5]));
  assert.equal(craftB.craft('pill_risky').success, false);
  console.log('✔ CraftService(V11): successRate roll boundary [roll < rate)');
}

function testQualityMultipliersScaleEffectDeterministically(): void {
  // 成功掷 0.1(<1) + 品质掷 0.99 → 累计权重 [0.6,0.85,0.97) 之外 → perfect ×2.5 → 50×2.5=125
  const ctx = createContext({ careerLevel: 1, cultivationExp: 500 });
  const craft = new CraftService(ctx, TEST_CONFIG, new SequenceRandomProvider([0.1, 0.99]));
  const result = craft.craft('pill_basic');
  assert.equal(result.success, true);
  assert.equal(result.quality, 'perfect');
  assert.equal(result.qualityMultiplier, 2.5);
  assert.equal(result.appliedEffect?.cultivation, 125);
  assert.equal(ctx.player.cultivationExp, 525); // 500-100+125
  console.log('✔ CraftService(V11): quality roll scales effect (perfect ×2.5)');
}

function testQualityRollPerRecipeWeights(): void {
  // weights [0.45,0.3,0.18,0.07]：品质掷 0.5 → 累计 [0.45,0.75,...) → good ×1.3
  const weighted: CraftConfig = {
    recipes: [{ ...RATE_RECIPE, id: 'artifact_weighted', successRate: 1, qualityWeights: [0.45, 0.3, 0.18, 0.07] }],
  };
  const ctx = createContext({ careerLevel: 1, cultivationExp: 500 });
  const craft = new CraftService(ctx, weighted, new SequenceRandomProvider([0.1, 0.5]));
  const result = craft.craft('artifact_weighted');
  assert.equal(result.quality, 'good');
  assert.equal(result.appliedEffect?.cultivation, 65); // round(50×1.3)
  console.log('✔ CraftService(V11): per-recipe quality weights honored');
}

function testRollQualityHelperBoundary(): void {
  const weights = [0.6, 0.25, 0.12, 0.03];
  assert.equal(rollQuality(weights, () => 0), 'normal');
  assert.equal(rollQuality(weights, () => 0.6), 'good');
  assert.equal(rollQuality(weights, () => 0.85), 'fine');
  assert.equal(rollQuality(weights, () => 0.97), 'perfect');
  assert.equal(rollQuality(weights, () => 0.9999), 'perfect'); // 末段兜底
  console.log('✔ CraftService(V11): rollQuality cumulative boundaries');
}

function testInvalidRecipeConfigThrows(): void {
  const base: CraftRecipe = { ...RATE_RECIPE, id: 'bad' };
  assert.throws(() => new CraftService(createContext(), { recipes: [{ ...base, successRate: 0 }] }), /successRate/);
  assert.throws(() => new CraftService(createContext(), { recipes: [{ ...base, successRate: 1.5 }] }), /successRate/);
  assert.throws(() => new CraftService(createContext(), { recipes: [{ ...base, qualityWeights: [1, 0, 0] as unknown as [number, number, number, number] }] }), /qualityWeights/);
  assert.throws(() => new CraftService(createContext(), { recipes: [{ ...base, qualityWeights: [1, 0, 0, -0.5] }] }), /qualityWeights/);
  assert.throws(() => new CraftService(createContext(), { recipes: [{ ...base, qualityWeights: [0, 0, 0, 0] }] }), /qualityWeights/);
  console.log('✔ CraftService(V11): invalid successRate/qualityWeights rejected at construction');
}

function testRollbackOnApplyFailureRestoresMaterialsAndCount(): void {
  const ctx = new GameContext({
    player: new PlayerData({ careerLevel: 1, cultivationExp: 500, spiritStones: 10 }),
    saveService: new ThrowingSaveService(new MemoryStorageAdapter()),
  });
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
  assert.throws(() => craft.craft('pill_basic'), /disk full/);
  // 事务一致性：材料与产出登记全部回滚（要么全成、要么无痕）
  assert.equal(ctx.player.cultivationExp, 500);
  assert.equal(ctx.player.spiritStones, 10);
  assert.deepEqual(ctx.player.craftedItemIds, []);
  assert.equal(craft.getCraftedCount('pill_basic'), 0);
  console.log('✔ CraftService(V11): apply failure rolls back materials + count (no half-state)');
}

// ── V11-S4：炼丹 lifetime 统计（成就条件源） ─────────────────────────────────

function testLifetimeStatsIncrementOnSuccessAndFailure(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 10_000, spiritStones: 100 });
  // 注意：成功路径消耗 2 个随机数（成功掷 + 品质掷），失败路径消耗 1 个。
  // 序列 [0.9 | 0.1,0.9 | 0.9 | 0.1,0.9] → 失败,成功,失败,成功
  const craft = new CraftService(ctx, RATE_CONFIG, new SequenceRandomProvider([0.9, 0.1, 0.9, 0.9, 0.1]));
  craft.craft('pill_risky'); // 0.9>=0.5 失败
  craft.craft('pill_risky'); // 0.1<0.5 成功（品质掷 0.9 → normal）
  craft.craft('pill_risky'); // 0.9>=0.5 失败
  craft.craft('pill_risky'); // 0.1<0.5 成功（品质掷 0.9 → normal）
  const stats = ctx.player.lifetimeStats;
  assert.equal(stats.craftSuccessCount, 2);
  assert.equal(stats.craftFailCount, 2);
  assert.equal(stats.craftPerfectCount ?? 0, 0); // 品质掷 0.9 落在 normal 段（未 increment 时键缺省）
  console.log('✔ CraftService(V11): lifetime stats count success/fail separately');
}

function testPerfectQualityIncrementsPerfectStat(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 10_000 });
  // 成功掷 0.1 + 品质掷 0.99 → perfect
  const craft = new CraftService(ctx, TEST_CONFIG, new SequenceRandomProvider([0.1, 0.99]));
  craft.craft('pill_basic');
  assert.equal(ctx.player.lifetimeStats.craftPerfectCount, 1);
  assert.equal(ctx.player.lifetimeStats.craftSuccessCount, 1);
  assert.equal(ctx.player.lifetimeStats.craftFailCount, undefined);
  console.log('✔ CraftService(V11): perfect quality increments craftPerfectCount');
}

function testRollbackDoesNotLeaveStats(): void {
  const ctx = new GameContext({
    player: new PlayerData({ careerLevel: 1, cultivationExp: 500 }),
    saveService: new ThrowingSaveService(new MemoryStorageAdapter()),
  });
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG);
  assert.throws(() => craft.craft('pill_basic'), /disk full/);
  // 回滚路径不得残留成功统计
  assert.equal(ctx.player.lifetimeStats.craftSuccessCount, undefined);
  assert.equal(ctx.player.lifetimeStats.craftPerfectCount, undefined);
  console.log('✔ CraftService(V11): rollback leaves no success stats behind');
}


// ── V12-R3：炼丹队列（时间/挂机/防重复领取）─────────────────────────────────

function testStartCraftQueuesWithTimestampAndDeducts(): void {
  const clock = new FakeClock(1_000_000);
  const ctx = createContext({ careerLevel: 1, cultivationExp: 5000, spiritStones: 100 });
  const craft = new CraftService(ctx, QUEUE_CONFIG, DETERMINISTIC_RNG, clock);
  const r = craft.startCraft('pill_timed');
  assert.equal(r.success, true);
  assert.equal(r.completesAtMs, 1_000_000 + 60_000); // 60s
  assert.equal(ctx.player.cultivationExp, 4900); // 5000-100
  // 队列键入 lifetimeStats
  assert.equal(ctx.player.lifetimeStats['craftQueue:pill_timed'], 1_060_000);
  assert.equal(craft.getQueue().length, 1);
  console.log('✔ CraftService(V12): startCraft queues with Clock-based completion');
}

function testClaimCraftBeforeReadyReportsRemaining(): void {
  const clock = new FakeClock(1_000_000);
  const ctx = createContext({ careerLevel: 1, cultivationExp: 5000 });
  const craft = new CraftService(ctx, QUEUE_CONFIG, DETERMINISTIC_RNG, clock);
  craft.startCraft('pill_timed');
  clock.advance(10_000); // 仅 10s < 60s
  const claim = craft.claimCraft('pill_timed');
  assert.equal(claim.ready, false);
  assert.equal(claim.remainingSeconds, 50);
  assert.equal(craft.getQueue().length, 1);
  console.log('✔ CraftService(V12): claim before ready reports remaining seconds');
}

function testClaimCraftAfterReadyAppliesQualityAndClears(): void {
  const clock = new FakeClock(1_000_000);
  const ctx = createContext({ careerLevel: 1, cultivationExp: 5000, mind: 50 });
  const craft = new CraftService(ctx, QUEUE_CONFIG, new SequenceRandomProvider([0.7]), clock); // 品质掷 0.7 → 良品段 [0.6,0.85)
  craft.startCraft('pill_timed');
  clock.advance(61_000); // 完成
  const claim = craft.claimCraft('pill_timed');
  assert.equal(claim.ready, true);
  assert.equal(claim.quality, 'good'); // 0.7 ∈ [0.6,0.85)
  assert.equal(ctx.player.cultivationExp, 4900 + 65); // 排队扣 100，领取 +50×1.3=65
  assert.equal(ctx.player.lifetimeStats['craftQueue:pill_timed'], undefined); // 队列键清除
  assert.equal(ctx.player.lifetimeStats.craftSuccessCount, 1);
  // 防重复领取：再领 → 不在队列
  const again = craft.claimCraft('pill_timed');
  assert.equal(again.ready, false);
  assert.equal(again.reason, '该配方不在炼制队列');
  console.log('✔ CraftService(V12): claim applies quality, clears queue, double-claim blocked');
}

function testQueueCapacityAndDuplicateRecipe(): void {
  const clock = new FakeClock(0);
  const ctx = createContext({ careerLevel: 1, cultivationExp: 100_000, spiritStones: 10_000 });
  // 3 个不同 timed 配方占满 3 炉
  const cfg: CraftConfig = { recipes: [
    { ...QUEUE_RECIPE, id: 'q1' }, { ...QUEUE_RECIPE, id: 'q2' }, { ...QUEUE_RECIPE, id: 'q3' }, { ...QUEUE_RECIPE, id: 'q4' },
  ] };
  const craft = new CraftService(ctx, cfg, DETERMINISTIC_RNG, clock);
  assert.equal(craft.startCraft('q1').success, true);
  assert.equal(craft.startCraft('q2').success, true);
  assert.equal(craft.startCraft('q3').success, true);
  const full = craft.startCraft('q4');
  assert.equal(full.success, false);
  assert.equal(full.reason, '丹炉已满（最多 3 炉）');
  const dup = craft.startCraft('q1');
  assert.equal(dup.success, false);
  assert.equal(dup.reason, '该配方已在炼制中');
  console.log('✔ CraftService(V12): queue capacity 3 + per-recipe dedup');
}

function testStartCraftFailureDoesNotQueue(): void {
  const clock = new FakeClock(0);
  const ctx = createContext({ careerLevel: 1, cultivationExp: 5000 });
  const craft = new CraftService(ctx, RATE_CONFIG, new SequenceRandomProvider([0.95]), clock); // RATE_CONFIG successRate 0.5，0.95→失败
  const r = craft.startCraft('pill_risky');
  assert.equal(r.success, false);
  assert.equal(r.reason, '炼制失败，材料已消耗');
  assert.equal(craft.getQueue().length, 0); // 失败不入队
  assert.equal(ctx.player.cultivationExp, 4900); // 材料消耗
  assert.equal(ctx.player.lifetimeStats['craftQueue:pill_risky'], undefined);
  console.log('✔ CraftService(V12): failed roll consumes materials without queueing');
}

function testInstantRecipeBypassesQueue(): void {
  const ctx = createContext({ careerLevel: 1, cultivationExp: 500 });
  const craft = new CraftService(ctx, TEST_CONFIG, DETERMINISTIC_RNG, new FakeClock(0)); // TEST_CONFIG 无 durationSeconds → 即时
  const r = craft.startCraft('pill_basic');
  assert.equal(r.success, true);
  assert.equal(craft.getQueue().length, 0); // 即时无队列
  assert.equal(ctx.player.cultivationExp, 450); // 500-100+50
  console.log('✔ CraftService(V12): zero-duration recipes keep instant fast path');
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
testCraftFailureConsumesMaterialsWithoutEffectOrCount();
testCraftSuccessRateRollBoundary();
testQualityMultipliersScaleEffectDeterministically();
testQualityRollPerRecipeWeights();
testRollQualityHelperBoundary();
testInvalidRecipeConfigThrows();
testRollbackOnApplyFailureRestoresMaterialsAndCount();
testLifetimeStatsIncrementOnSuccessAndFailure();
testPerfectQualityIncrementsPerfectStat();
testRollbackDoesNotLeaveStats();
testStartCraftQueuesWithTimestampAndDeducts();
testClaimCraftBeforeReadyReportsRemaining();
testClaimCraftAfterReadyAppliesQualityAndClears();
testQueueCapacityAndDuplicateRecipe();
testStartCraftFailureDoesNotQueue();
testInstantRecipeBypassesQueue();

console.log('craft service tests passed');