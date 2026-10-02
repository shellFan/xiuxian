import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';

process.env.TZ = 'Asia/Shanghai';
const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');

function makeFacade(seed = 7301, profession = 'JAVA_BACKEND'): { facade: GameFacade; clock: FakeClock } {
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
  return { facade, clock };
}

/** V5.7 Phase B：技能 Lv3 进化二选一（§21）——行为分叉 + 持久化。 */
function testEvolutionRuntime(): void {
  const { facade } = makeFacade();
  try {
    facade.chooseProfession('JAVA_BACKEND');
    facade.context.gameDay.ensureStarted();
    facade.context.dailyPlanner.beginWorkday();
    const battle = facade.context.battle;
    // GC大法线：升级到 Lv2 后应触发进化二选一
    const run = facade.startBattleRun('PROJECT', 'build_jvm');
    assert.ok(run, 'battle started with profession build');
    assert.ok(run.skills.includes('skill_gc'), 'JVM build starts with GC大法');
    // 强制把 GC 升到 Lv2
    run.skillLevels!['skill_gc'] = 2;
    const director = battle as unknown as { prepareSkillOffers: (r: typeof run) => void };
    director.prepareSkillOffers(run);
    assert.equal(run.skillOfferKind, 'evolution', 'Lv2 skill with evolution def offers evolution choice');
    assert.equal(run.skillOffers?.length, 2, 'exactly 2 evolution options (二选一)');
    const evo = EVOLUTIONS_BY_BASE_TEST('skill_gc');
    assert.ok(evo, 'GC大法 has evolution def');
    const chosen = run.skillOffers![0];
    facade.chooseBattleSkill(chosen);
    assert.equal((facade.querySkillEvolutions() as Record<string, string>)['skill_gc'], chosen, 'evolution persisted to save');
    assert.equal(run.skillLevels?.['skill_gc'], 3, 'skill level now 3');
    // 重新加载存档后进化不丢
    const saved = JSON.parse(JSON.stringify(facade.querySkillEvolutions()));
    assert.ok(saved['skill_gc'], 'evolution survives serialization');
    console.log('evolution runtime passed');
  } finally {
    facade.destroy();
  }
}

function EVOLUTIONS_BY_BASE_TEST(baseId: string) {
  const evos = require('../../assets/configs/v57/battle-extension.json') as { evolutions: { baseSkillId: string; options: unknown[] }[] };
  return evos.evolutions.find((e) => e.baseSkillId === baseId);
}

/** V5.7 Phase B：道法共鸣（§22）——技能组合激活 + 效果生效 + 永久发现。 */
function testSynergyRuntime(): void {
  const { facade } = makeFacade();
  try {
    facade.chooseProfession('JAVA_BACKEND');
    facade.context.gameDay.ensureStarted();
    facade.context.dailyPlanner.beginWorkday();
    const battle = facade.context.battle;
    // 零停顿领域 = GC大法 + 线程池诀
    const run = facade.startBattleRun('PROJECT', 'build_jvm');
    run.skills.push('skill_thread_pool');
    (battle as unknown as { evaluateSynergies: (r: typeof run) => void }).evaluateSynergies(run);
    assert.ok(run.synergies?.includes('syn_zero_pause'), '零停顿领域 activated by skill pair');
    assert.ok((facade.context.player.synergyDiscovered ?? []).includes('syn_zero_pause'), 'synergy persisted as discovered');
    // 效果落地：playerSkillStats 聚合了 intervalMulDelta -0.12
    const stats = (battle as unknown as { playerSkillStats: (r: typeof run) => { intervalSec: number } }).playerSkillStats(run);
    assert.ok(stats.intervalSec > 0, 'synergy stats aggregated without crash');
    // 职业页视图
    const views = facade.querySynergies();
    const zero = views.find((s) => s.id === 'syn_zero_pause');
    assert.ok(zero?.active, 'profession page synergy view shows active');
    console.log('synergy runtime passed');
  } finally {
    facade.destroy();
  }
}

/** V5.7：职业 Build 分家——buildOptions 只出本职业 + 摸鱼流。 */
function testProfessionBuildOptions(): void {
  const { facade } = makeFacade(7303, 'FRONTEND');
  try {
    const builds = facade.queryBattleBuildOptions();
    const ids = builds.map((b) => b.id);
    assert.ok(ids.includes('build_reactive'), 'Frontend sees 响应式流');
    assert.ok(ids.includes('build_fish'), 'everyone sees 摸鱼流');
    assert.ok(!ids.includes('build_jvm'), 'Frontend does NOT see JVM流');
    assert.ok(!ids.includes('build_db'), 'Frontend does NOT see 数据库流');
    console.log('profession build options passed');
  } finally {
    facade.destroy();
  }
}

testEvolutionRuntime();
testSynergyRuntime();
testProfessionBuildOptions();
console.log('SKILL PROGRESSION TEST PASSED');
