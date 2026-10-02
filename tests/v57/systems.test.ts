import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';

process.env.TZ = 'Asia/Shanghai';
const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function makeFacade(seed = 7501, profession = 'JAVA_BACKEND'): { facade: GameFacade; clock: FakeClock } {
  const clock = new FakeClock(MONDAY_0900);
  const facade = new GameFacade({
    clock, careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new MemoryStorageAdapter(), board: null,
    randomV2: new RandomService(mulberry32(seed)),
    randomProvider: { next: mulberry32(seed) },
    battleRng: mulberry32(seed), autoSaveIntervalSeconds: 0,
  });
  facade.context.messenger.ensureInitialized();
  facade.chooseProfession(profession);
  facade.context.gameDay.ensureStarted();
  facade.context.dailyPlanner.beginWorkday();
  return { facade, clock };
}

/** V5.7 Phase M：Fatigue 来源→效果→恢复→强制休息（§80~§82）。 */
function testFatigueRuntime(): void {
  const { facade } = makeFacade();
  try {
    const fatigue = facade.context.fatigue;
    assert.equal(fatigue.value(), 0, 'fresh player has 0 fatigue');
    // 工作 2 小时 → +4
    fatigue.add('WORK', 120);
    assert.equal(fatigue.value(), 4, '2h work adds 4 fatigue');
    assert.equal(fatigue.efficiencyMul(), 1, 'band 0-30 no penalty');
    // 事故 +8 × 多次 → 进入 31-60 轻微效率下降
    for (let i = 0; i < 4; i++) fatigue.add('INCIDENT');
    const v = fatigue.value();
    assert.ok(v >= 31 && v <= 60, `fatigue ${v} in LIGHT band`);
    assert.equal(fatigue.efficiencyMul(), 0.95, 'LIGHT band efficiency 0.95');
    // 推到 100 → 强制休息
    for (let i = 0; i < 20; i++) fatigue.add('INCIDENT');
    assert.equal(fatigue.value(), 100, 'fatigue capped at 100');
    assert.ok(fatigue.view().forcedRest, 'forced rest at 100');
    assert.equal(fatigue.efficiencyMul(), 0.5, 'forced rest halves efficiency');
    // 请假恢复 + 解除
    fatigue.takeRest(8);
    assert.ok(fatigue.value() < 80, 'rest recovers fatigue');
    assert.ok(!facade.context.player.fatigueForcedRest, 'forced rest cleared');
    console.log('fatigue runtime passed');
  } finally {
    facade.destroy();
  }
}

/** V5.7 Phase A：每日计划走职业任务池 + 跨职业 ≤2 条（§12/§13）。 */
function testProfessionTaskFilter(): void {
  const { facade } = makeFacade(7502, 'FRONTEND');
  try {
    const entries = facade.context.dailyPlanner.planEntries();
    assert.ok(entries.length >= 3 && entries.length <= 5, `plan 3-5 entries (got ${entries.length})`);
    const feTasks = new Set((facade.context.professionContent.taskPool() as readonly unknown[] as { id: string; title: string }[]).map((t) => t.title));
    const inPool = entries.filter((e) => feTasks.has(e.title)).length;
    assert.ok(inPool >= entries.length - 2, `profession tasks dominate plan (${inPool}/${entries.length}, cross ≤2)`);
    // 计划分钟被效率乘数调整后仍为正
    for (const e of entries) assert.ok(e.minutes > 0, 'entry minutes positive');
    console.log('profession task filter passed');
  } finally {
    facade.destroy();
  }
}

/** V5.7 Phase F：NPC 记忆（§51~§53）。 */
function testNpcMemory(): void {
  const { facade } = makeFacade();
  try {
    const mem = facade.context.npcMemory;
    mem.remember('VETERAN', 'HELPED_ME', '你周二帮他解决了线上问题');
    mem.remember('VETERAN', 'HELPED_ME', '你周三又帮他看了一个Bug');
    mem.remember('VETERAN', 'STOLE_MY_CREDIT', '他抢了你一次功劳');
    assert.equal(mem.countOf('VETERAN', 'HELPED_ME'), 2, 'helped count = 2');
    const card = facade.queryNpcCard('VETERAN');
    assert.equal(card.stageName.length > 0, true, 'card has stage name');
    assert.ok(card.memories.length >= 3, 'card shows recent memories');
    assert.ok(card.flags.includes('STOLE_MY_CREDIT'), 'credit-stealing remembered');
    // 记恩 → 协助概率提升但不保证（§56）
    const chanceHelped = mem.assistChance('VETERAN');
    const chanceStranger = mem.assistChance('JUNIOR');
    assert.ok(chanceHelped > chanceStranger, 'goodwill raises assist chance');
    assert.ok(chanceHelped < 0.9, 'never 100% (personality remains)');
    console.log('npc memory passed');
  } finally {
    facade.destroy();
  }
}

/** V5.7 Phase D：套装/Affix/Compare/分解（§34~§40）。 */
function testEquipmentLoot(): void {
  const { facade } = makeFacade();
  try {
    const player = facade.context.player;
    // JVM调优套 4 件
    for (const eq of ['eq_jvm_tome', 'eq_gc_chronicle', 'eq_concurrent_bracer', 'eq_heap_amulet']) {
      player.ownedEquipment.push(eq);
    }
    const sets = facade.querySets();
    const jvm = sets.find((s) => s.id === 'set_jvm');
    assert.ok(jvm && jvm.activeCount === 4, 'JVM set fully collected');
    assert.ok(jvm.bonuses.some((b) => b.active && b.count === 4), '4-piece bonus active');
    // 战斗聚合含套装攻击
    const stats = facade.context.loot.battleStats();
    assert.ok(stats.atkMul > 0.1, `set+affix atkMul aggregated (${stats.atkMul.toFixed(2)})`);
    assert.ok(stats.maxHpBonus >= 70, 'hp bonuses aggregated');
    // Compare
    const cmp = facade.queryEquipmentCompare('eq_exec_plan');
    if (!cmp) throw new Error('compare view generated');
    assert.ok((cmp.next?.lines ?? []).length > 0, 'compare shows stat lines');
    // 分解
    const stonesBefore = player.spiritStones;
    const d = facade.dismantleLoot('eq_gc_chronicle');
    assert.ok(d.success, 'dismantle ok');
    assert.ok(player.spiritStones > stonesBefore, 'dismantle refunds spirit stones');
    assert.ok(!player.ownedEquipment.includes('eq_gc_chronicle'), 'dismantled equipment removed');
    console.log('equipment loot passed');
  } finally {
    facade.destroy();
  }
}

/** V5.7：图鉴（??? + 发现记录 §41）。 */
function testCodex(): void {
  const { facade } = makeFacade();
  try {
    const codex = facade.context.codex;
    const before = facade.queryCodex('BOSS');
    assert.ok(before.total >= 18, `codex boss total ${before.total} >= 18`);
    assert.ok(before.discovered === 0, 'new player discovered nothing');
    assert.ok(before.entries.every((e) => e.name === '???'), 'undiscovered entries show ???');
    codex.discoverMonster('boss_oom_lord');
    codex.discoverEquipment('eq_heap_amulet');
    const after = facade.queryCodex('BOSS');
    assert.equal(after.discovered, 1, 'boss discovery recorded');
    assert.ok(after.entries.find((e) => e.id === 'boss_oom_lord')?.name === 'OOM魔尊', 'discovered boss named');
    console.log('codex passed');
  } finally {
    facade.destroy();
  }
}

/** V5.7：存档 v12 迁移（v11 旧档无损，新字段默认）。 */
function testSaveMigration(): void {
  const { facade } = makeFacade();
  try {
    const raw = facade.context.player.toSaveData();
    assert.equal(raw.saveVersion, 12, 'save version 12');
    const stored = new (facade.context.player.constructor as never as { new(o?: unknown): instanceOfPlayer })(JSON.parse(JSON.stringify(raw)));
    assert.deepEqual(stored.skillEvolutions, {}, 'skillEvolutions default empty');
    assert.deepEqual(stored.codex.monsters, [], 'codex default empty');
    assert.equal(stored.companyProfile, 'COMP_MIN_PRIVATE', 'company profile default 民企宗');
    assert.equal(stored.weekStory.weekIndex, 1, 'week story default week 1');
    console.log('save migration passed');
  } finally {
    facade.destroy();
  }
}
type instanceOfPlayer = import('../../assets/scripts/model/player-data').PlayerData;

/** V5.7 Phase J：周目标（§71~§73）。 */
function testWeeklyGoals(): void {
  const { facade } = makeFacade();
  try {
    facade.context.week.beginWorkday(); // 周一 → 掷周目标
    const goals = facade.queryWeeklyGoals();
    assert.equal(goals.length, 3, '3 weekly goals');
    assert.ok(goals.every((g) => g.target > 0), 'goals have targets');
    // 未完成不能领
    const early = facade.claimWeeklyReward();
    assert.equal(early.success, false, 'cannot claim incomplete goals');
    // 完成全部目标
    for (const g of goals) {
      for (let i = 0; i < g.target; i++) facade.context.week.recordProgress(g.type, 1);
    }
    const done = facade.queryWeeklyGoals();
    assert.ok(done.every((g) => g.done), 'all goals done after progress');
    const claim = facade.claimWeeklyReward();
    assert.ok(claim.success, 'claim succeeds when all done');
    assert.ok((claim.professionExp ?? 0) > 0, 'reward grants profession exp');
    const again = facade.claimWeeklyReward();
    assert.equal(again.success, false, 'cannot claim twice');
    console.log('weekly goals passed');
  } finally {
    facade.destroy();
  }
}

/** V5.7 Phase H/I：每日情境 + 公司宗门。 */
function testSituationAndCompany(): void {
  const { facade } = makeFacade();
  try {
    facade.context.week.beginWorkday();
    const sit = facade.queryTodaySituation();
    assert.ok(sit.id.startsWith('sit_'), `situation ${sit.id}`);
    assert.ok(sit.interruptBudget[0] <= sit.interruptBudget[1], 'interrupt budget range valid');
    const company = facade.queryCompanyProfile();
    assert.equal(company.id, 'COMP_MIN_PRIVATE', 'default company 民企宗');
    console.log('situation and company passed');
  } finally {
    facade.destroy();
  }
}

/** V5.7 Phase G：项目历史 + 战绩（§58/§62）。 */
function testProjectHistory(): void {
  const { facade } = makeFacade();
  try {
    facade.context.gameDay.ensureStarted();
    const project = facade.context.projectService.ensureProject();
    project.techDebt = 70;
    const record = facade.context.projectHistory.archiveFromCurrent('正常上线');
    assert.ok(record, 'project archived');
    assert.equal(record!.name, project.name, 'archived with same name');
    assert.ok(facade.context.player.projectHistory!.length === 1, 'history persisted');
    // 高技术债历史项目可回归（pickReturning 概率 25%——用受控 rng 强制命中）
    const hit = facade.context.projectHistory.pickReturning(() => 0.1);
    assert.ok(hit, 'returning project can hit for legacy debt');
    const miss = facade.context.projectHistory.pickReturning(() => 0.9);
    assert.equal(miss, null, 'rng 0.9 misses 25% window');
    // 战绩
    const records = facade.queryCareerRecords();
    assert.ok(records.length >= 5, 'career records rendered');
    console.log('project history passed');
  } finally {
    facade.destroy();
  }
}

testFatigueRuntime();
testProfessionTaskFilter();
testNpcMemory();
testEquipmentLoot();
testCodex();
testSaveMigration();
testWeeklyGoals();
testSituationAndCompany();
testProjectHistory();
console.log('V57 SYSTEMS TEST PASSED');
void HOUR;
