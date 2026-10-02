import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';

process.env.TZ = 'Asia/Shanghai';
const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');
const MINUTE = 60_000;

function makeFacade(seed = 7401): { facade: GameFacade; clock: FakeClock } {
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
  facade.chooseProfession('JAVA_BACKEND');
  facade.context.gameDay.ensureStarted();
  facade.context.dailyPlanner.beginWorkday();
  return { facade, clock };
}

/** V5.7 Phase C：Boss 机制引擎——召唤/增伤/预警（§25/§30）。 */
function testBossMechanics(): void {
  const { facade, clock } = makeFacade();
  try {
    const battle = facade.context.battle;
    const run = facade.startBattleRun('PROJECT', 'build_jvm');
    // 直接放置 OOM 魔尊（SUMMON + HP_DRAIN）——改存档里的运行态（tick 读取的是它）
    const stored = facade.context.player.activeBattleRun as typeof run;
    (battle as unknown as { addEnemy: (r: typeof run, id: string) => void }).addEnemy(stored, 'boss_oom_lord');
    stored.enemies = stored.enemies.filter((e) => e.defId === 'boss_oom_lord');
    assert.ok(stored.enemies.length === 1, 'boss placed');
    const attackBefore = stored.enemies[0].attack;
    // 推进 10 游戏秒：SUMMON(9s) 触发，预警在 7s 出现（30s 内 Boss 会被击杀，日志 12 条窗口会截断早期预警）
    for (let i = 0; i < 10; i++) {
      clock.advance(1000);
      battle.tick(1);
      if (stored.status !== 'FIGHTING') break;
    }
    const live = facade.context.player.activeBattleRun as typeof run;
    assert.ok(live.log.some((l) => l.includes('⚠️')), 'telegraph warning appears in battle log');
    assert.ok(live.enemies.filter((e) => e.tier === 'NORMAL').length > 0, 'boss summoned minions');
    void attackBefore;
    void run;
    console.log('boss mechanics passed');
  } finally {
    facade.destroy();
  }
}

/** V5.7 Phase C：死锁双尊——LINKED 互救（§26）。 */
function testDeadlockTwins(): void {
  const { facade } = makeFacade();
  try {
    const battle = facade.context.battle;
    const run = facade.startBattleRun('PROJECT', 'build_db');
    const storedTwins = facade.context.player.activeBattleRun as typeof run;
    storedTwins.enemies = []; // 清场，验证双尊成对生成
    (battle as unknown as { addEnemy: (r: typeof run, id: string) => void }).addEnemy(storedTwins, 'boss_deadlock_twins');
    assert.equal(storedTwins.enemies.length, 2, 'twin boss spawns two linked bosses');
    assert.ok(run.enemies[0].linkGroup, 'linked group set');
    // 击杀一尊 → 另一尊存在时它复活
    const victim = run.enemies[0];
    victim.hp = 0;
    const player = { healPerKill: 0 } as never;
    (battle as unknown as { onEnemyKilled: (r: typeof run, e: typeof victim, p: never) => void }).onEnemyKilled(run, victim, player);
    assert.ok(victim.hp > 0, 'dead twin revived by its partner');
    console.log('deadlock twins passed');
  } finally {
    facade.destroy();
  }
}

/** V5.7 Phase C：Boss 专属掉落 + 轻量保底（§31/§107）。 */
function testBossExclusiveDropPity(): void {
  const { facade } = makeFacade();
  try {
    const loot = facade.context.loot;
    // 0.2 掉率下连续 8 次未掉 → 第 8 次必掉（pityAt=8 for boss_oom_lord）
    let dropped = false;
    const neverRng = () => 0.99; // 永远不掉
    for (let i = 0; i < 8; i++) {
      const roll = loot.rollBossDrop('boss_oom_lord', neverRng);
      if (roll && roll.viaPity) { dropped = true; break; }
      if (roll && !roll.viaPity) assert.fail('never-rng must not drop before pity');
    }
    assert.ok(dropped, 'pity guarantees drop after attempts >= pityAt');
    // 掉落后 pity 重置
    const pity = facade.queryBossPity();
    assert.equal(pity['boss_oom_lord'] ?? 0, 0, 'pity reset after drop');
    console.log('boss pity passed');
  } finally {
    facade.destroy();
  }
}

testBossMechanics();
testDeadlockTwins();
testBossExclusiveDropPity();
console.log('BOSS MECHANICS TEST PASSED');
