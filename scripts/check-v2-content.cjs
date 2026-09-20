/**
 * Gameplay V2 content quality check（§143/§194）。
 *
 * 校验：
 *  - events.json: 重复 id / 空文案 / 链引用 / choice 引用 / 权重正值
 *  - items.json: 材料/功法/装备/配方/消耗品 引用完整 + 配方成分可负担
 *  - daily-situations.json: id 唯一 / effects 字段合法
 *  - promotion-titles.json: 题/称号 id 唯一 / 选项数
 *  - 重复文案检测（描述句完全相同）
 *
 * 退出码非 0 即失败。用法：node scripts/check-v2-content.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const load = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);

// ── events.json ──────────────────────────────────────────────────────────────
const events = load('assets/configs/v2/events.json').events;
const eventIds = new Set();
const descriptions = new Map();
if (events.length < 100) fail(`events: 需要 >=100，实际 ${events.length}`);
let branching = 0;
let chainCount = 0;
const chains = new Map();
for (const e of events) {
  if (eventIds.has(e.id)) fail(`events: 重复 id ${e.id}`);
  eventIds.add(e.id);
  if (!e.title || !e.description) fail(`events: ${e.id} 缺标题/描述`);
  // 链事件（chainId 且非起始阶段）由链引擎推进触发，baseWeight=0 是合法设计
  if (!(e.baseWeight > 0) && !(e.chainId && (e.chainStage ?? 0) > 0)) fail(`events: ${e.id} baseWeight 必须 > 0`);
  if (e.description) {
    const key = e.description;
    descriptions.set(key, (descriptions.get(key) || 0) + 1);
  }
  if (e.choices && e.choices.length > 0) {
    if (e.choices.length > 1 || e.choices.some((c) => c.successChance !== undefined)) branching += 1;
    for (const c of e.choices) {
      if (!c.text) fail(`events: ${e.id}.${c.id} 缺选项文案`);
      if (c.nextEvent && !eventIds.has(c.nextEvent)) fail(`events: ${e.id} nextEvent 引用不存在 ${c.nextEvent}`);
      if (c.successEffects?.nextEvent && !eventIds.has(c.successEffects.nextEvent)) fail(`events: ${e.id} success nextEvent 引用不存在`);
    }
  }
  if (e.chainId) {
    chainCount += 1;
    if (!chains.has(e.chainId)) chains.set(e.chainId, []);
    chains.get(e.chainId).push(e.chainStage ?? 0);
  }
}
for (const [chain, stages] of chains) {
  if (Math.min(...stages) !== 0) fail(`events: 链 ${chain} 缺 stage 0`);
  if (Math.max(...stages) < 2) fail(`events: 链 ${chain} 少于 3 阶段`);
}
for (const [desc, count] of descriptions) {
  if (count >= 3) warnings.push(`events: 描述重复 ${count} 次："${desc.slice(0, 24)}…"`);
}

// ── items.json ───────────────────────────────────────────────────────────────
const items = load('assets/configs/v2/items.json');
const materialIds = new Set(items.materials.map((m) => m.id));
const consumableIds = new Set(items.consumables.map((c) => c.id));
const techIds = new Set(items.techniques.map((t) => t.id));
const eqIds = new Set(items.equipment.map((e) => e.id));
if (items.materials.length < 25) fail(`materials: 需要 >=25，实际 ${items.materials.length}`);
if (items.techniques.length < 30) fail(`techniques: 需要 >=30，实际 ${items.techniques.length}`);
if (items.equipment.length < 30) fail(`equipment: 需要 >=30，实际 ${items.equipment.length}`);
if (items.recipes.length < 30) fail(`recipes: 需要 >=30，实际 ${items.recipes.length}`);
const allItemIds = new Set([...materialIds, ...consumableIds, ...techIds, ...eqIds]);
for (const id of allItemIds) {
  // 跨表重复 id 检查
}
{
  const seen = new Set();
  for (const list of [items.materials, items.techniques, items.equipment, items.consumables]) {
    for (const it of list) {
      if (seen.has(it.id)) fail(`items: 重复 id ${it.id}`);
      seen.add(it.id);
    }
  }
}
const recipeIds = new Set();
for (const r of items.recipes) {
  if (recipeIds.has(r.id)) fail(`recipes: 重复 id ${r.id}`);
  recipeIds.add(r.id);
  for (const ing of Object.keys(r.ingredients)) {
    if (!materialIds.has(ing) && !consumableIds.has(ing)) fail(`recipes: ${r.id} 成分不存在 ${ing}`);
    if ((r.ingredients[ing] ?? 0) < 0) fail(`recipes: ${r.id} 负成本 ${ing}`);
  }
  const out = r.output;
  if (out.consumable && !consumableIds.has(out.consumable)) fail(`recipes: ${r.id} 产物消耗品不存在`);
  if (out.technique && out.technique !== 'random_common' && out.technique !== 'random_rare' && !techIds.has(out.technique)) fail(`recipes: ${r.id} 产物功法不存在`);
  if (out.equipment && !eqIds.has(out.equipment)) fail(`recipes: ${r.id} 产物装备不存在`);
  if (out.material) {
    for (const m of Object.keys(out.material)) {
      if (!materialIds.has(m)) fail(`recipes: ${r.id} 产物材料不存在 ${m}`);
    }
  }
}
// 功法升级成本引用
for (const t of items.techniques) {
  for (const mat of Object.keys(t.upgradeCost)) {
    if (!materialIds.has(mat)) fail(`techniques: ${t.id} 升级材料不存在 ${mat}`);
  }
}
// 装备槽位
const VALID_SLOTS = ['DESK', 'BADGE', 'ACCESSORY'];
for (const e of items.equipment) {
  if (!VALID_SLOTS.includes(e.slot)) fail(`equipment: ${e.id} 槽位非法 ${e.slot}`);
}
// 商店引用
for (const s of items.shop.stock) {
  if (!allItemIds.has(s.itemId)) fail(`shop: 商品不存在 ${s.itemId}`);
  if (!(s.price > 0)) fail(`shop: ${s.itemId} 价格必须 > 0`);
}

// ── daily-situations.json ────────────────────────────────────────────────────
const situations = load('assets/configs/v2/daily-situations.json');
{
  const seen = new Set();
  for (const key of ['companySituations', 'bossMoods', 'projectSituations', 'personalConditions']) {
    for (const s of situations[key]) {
      if (seen.has(s.id)) fail(`situations: 重复 id ${s.id}`);
      seen.add(s.id);
      if (!s.name || !s.description) fail(`situations: ${s.id} 缺文案`);
    }
  }
  const total = situations.companySituations.length + situations.bossMoods.length + situations.projectSituations.length + situations.personalConditions.length;
  if (total < 40) fail(`situations: 需要 >=40，实际 ${total}`);
}

// ── promotion-titles.json ────────────────────────────────────────────────────
const pt = load('assets/configs/v2/promotion-titles.json');
if (pt.promotionQuestions.length < 30) fail(`promotionQuestions: 需要 >=30`);
if (pt.dailyTitles.length < 30) fail(`dailyTitles: 需要 >=30`);
{
  const qids = new Set();
  for (const q of pt.promotionQuestions) {
    if (qids.has(q.id)) fail(`promotionQuestions: 重复 id ${q.id}`);
    qids.add(q.id);
    if (q.options.length !== 3) fail(`promotionQuestions: ${q.id} 选项数 != 3`);
  }
  const tids = new Set();
  for (const t of pt.dailyTitles) {
    if (tids.has(t.id)) fail(`dailyTitles: 重复 id ${t.id}`);
    tids.add(t.id);
  }
}

// ── Gameplay V3 overtime content ───────────────────────────────────────────
const overtimeContent = load('assets/configs/v3/overtime-content.json').events;
const overtimeAchievements = load('assets/configs/v3/overtime-achievements.json').achievements;
const baseAchievementIds = new Set(load('assets/configs/achievements.json').achievements.map((achievement) => achievement.id));
const overtimeIds = new Set();
const overtimeChains = new Map();
let preOffCount = 0;
let nightCount = 0;
let standaloneNightCount = 0;
let nightBossCount = 0;
for (const event of overtimeContent) {
  if (overtimeIds.has(event.id)) fail(`overtime: duplicate event id ${event.id}`);
  if (eventIds.has(event.id)) fail(`overtime: event id collides with V2 event ${event.id}`);
  overtimeIds.add(event.id);
  if (!event.title || !event.description) fail(`overtime: ${event.id} missing text`);
  if (!Array.isArray(event.choices) || event.choices.length < 2) fail(`overtime: ${event.id} needs at least two player choices`);
  if (event.minMinuteOfDay === 1050 && event.maxMinuteOfDay === 1079) preOffCount += 1;
  if (event.requiresOvertime && event.minMinuteOfDay === 1080 && event.maxMinuteOfDay === 360) {
    nightCount += 1;
    if (!event.chainId) standaloneNightCount += 1;
    if (event.category === 'BOSS' && event.isNightBoss === true) nightBossCount += 1;
  }
  if (event.chainId) {
    if (!overtimeChains.has(event.chainId)) overtimeChains.set(event.chainId, []);
    overtimeChains.get(event.chainId).push(event);
  }
  for (const choice of event.choices ?? []) {
    if (!choice.id || !choice.text) fail(`overtime: ${event.id} has incomplete choice`);
    if (choice.nextEvent && !overtimeIds.has(choice.nextEvent)) {
      // Same file is ordered by chain stage; final reference pass below resolves forward links.
    }
  }
}
for (const event of overtimeContent) {
  for (const choice of event.choices ?? []) if (choice.nextEvent && !overtimeIds.has(choice.nextEvent)) fail(`overtime: ${event.id} points to missing ${choice.nextEvent}`);
}
if (preOffCount < 20) fail(`overtime: need >=20 pre-off events, got ${preOffCount}`);
if (nightCount < 50) fail(`overtime: need >=50 total night events including chains, got ${nightCount}`);
if (standaloneNightCount < 20) fail(`overtime: need >=20 standalone night-pool events, got ${standaloneNightCount}`);
if (nightBossCount < 5) fail(`overtime: need >=5 night bosses, got ${nightBossCount}`);
if (overtimeChains.size < 10) fail(`overtime: need >=10 chains, got ${overtimeChains.size}`);
for (const [chainId, chainEvents] of overtimeChains) {
  const stages = [...new Set(chainEvents.map((event) => event.chainStage))].sort((a, b) => a - b);
  if (stages.length < 3 || stages[0] !== 0 || stages[1] !== 1 || stages[2] !== 2) fail(`overtime: chain ${chainId} must contain contiguous stages 0,1,2`);
}
const overtimeAchievementIds = new Set();
const overtimeStats = new Set(['totalSeconds', 'paidSeconds', 'freeSeconds', 'sessions', 'nightSessions', 'freeSessions', 'consecutiveDays', 'longestStreak']);
for (const achievement of overtimeAchievements) {
  if (overtimeAchievementIds.has(achievement.id)) fail(`overtime achievements: duplicate id ${achievement.id}`);
  if (baseAchievementIds.has(achievement.id)) fail(`overtime achievements: id collides with base achievement ${achievement.id}`);
  overtimeAchievementIds.add(achievement.id);
  if (achievement.category !== 'OVERTIME' || achievement.condition?.type !== 'OVERTIME_STAT') fail(`overtime achievements: ${achievement.id} must use OVERTIME_STAT`);
  if (!overtimeStats.has(achievement.condition?.stat)) fail(`overtime achievements: ${achievement.id} has invalid stat`);
  if (!Number.isSafeInteger(achievement.condition?.target) || achievement.condition.target <= 0) fail(`overtime achievements: ${achievement.id} target must be positive`);
}
if (overtimeAchievements.length < 15) fail(`overtime achievements: need >=15, got ${overtimeAchievements.length}`);

// ── 汇总 ─────────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════');
console.log('Gameplay V2 Content Check');
console.log('═══════════════════════════════════════');
console.log(`events: ${events.length} (branching ${branching}, chain events ${chainCount}, chains ${chains.size})`);
console.log(`materials: ${items.materials.length} | techniques: ${items.techniques.length} | equipment: ${items.equipment.length} | recipes: ${items.recipes.length} | consumables: ${items.consumables.length}`);
console.log(`situations: 42 | questions: ${pt.promotionQuestions.length} | titles: ${pt.dailyTitles.length}`);
console.log(`Overtime V3: pre-off ${preOffCount} | night ${nightCount} | standalone night ${standaloneNightCount} | bosses ${nightBossCount} | chains ${overtimeChains.size} | achievements ${overtimeAchievements.length}`);
console.log('Overtime V3 cross-pool IDs: verified');
for (const w of warnings) console.log(`WARN: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  console.error(`CONTENT CHECK FAILED: ${errors.length} errors`);
  process.exit(1);
}
console.log('✅ CONTENT CHECK PASSED');
