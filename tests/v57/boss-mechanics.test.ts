import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';
import { CardRng } from '../../assets/scripts/v59o/card-battle/card-rng';
import type { CardBattleState, CardEnemy, CardEngineEnv } from '../../assets/scripts/v59o/card-battle/card-types';

process.env.TZ = 'Asia/Shanghai';
const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');

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

function cardView(facade: GameFacade): CardBattleState {
  const card = facade.queryBattleCard();
  assert.ok(card, 'card battle state present');
  return card;
}

function envOf(facade: GameFacade): CardEngineEnv {
  const cards = (facade.context.battle as unknown as { cards: { envFor: (r: unknown) => CardEngineEnv } }).cards;
  return cards.envFor(facade.context.battle.current()!);
}

/** V5.9-O.2 迁移：Boss 机制回合化——召唤/预警走 planIntent/runBossSpecial。 */
function testBossMechanics(): void {
  const { facade } = makeFacade();
  try {
    facade.startBattleRun('PROJECT', 'build_jvm');
    const card = cardView(facade);
    // 直接放置 OOM 魔尊（SUMMON + HP_DRAIN），并给玩家大量生命避免中途败北。
    const oom: CardEnemy = {
      uid: 'boss_oom_1', defId: 'boss_oom_lord', name: 'OOM 魔尊', tier: 'BOSS',
      hp: 420, maxHp: 420, attack: 16, block: 0, statuses: {}, intent: null,
      timers: {}, telegraphed: {}, revived: 0,
    };
    card.enemies = [oom];
    card.player.maxHp = 100_000;
    card.player.hp = 100_000;
    // 连续结束回合：意图规划累计机制计时 → 预警 → SPECIAL 触发召唤。
    let telegraphSeen = false;
    let minionSeen = false;
    for (let turn = 0; turn < 8 && !(telegraphSeen && minionSeen); turn += 1) {
      if (facade.queryFinishedBattle()) break;
      facade.endBattleTurn('bm' + turn);
      const live = cardView(facade);
      if (live.log.some((l) => l.includes('⚠️'))) telegraphSeen = true;
      if (live.enemies.filter((e) => e.tier === 'NORMAL').length > 0) minionSeen = true;
    }
    assert.ok(telegraphSeen, 'telegraph warning appears in battle log');
    assert.ok(minionSeen, 'boss summoned minions');
    console.log('boss mechanics passed');
  } finally {
    facade.destroy();
  }
}

/** V5.7 Phase C：死锁双尊——LINKED 互救（§26），回合化后走 tryEnemyRevive。 */
function testDeadlockTwins(): void {
  const { facade } = makeFacade();
  try {
    facade.startBattleRun('PROJECT', 'build_db');
    const card = cardView(facade);
    const twinA: CardEnemy = {
      uid: 'twin_a', defId: 'boss_deadlock_twins', name: '死锁双尊', tier: 'BOSS',
      hp: 10, maxHp: 10, attack: 13, block: 0, statuses: {}, intent: null,
      timers: {}, telegraphed: {}, revived: 0, linkGroup: 'twin_test',
    };
    const twinB: CardEnemy = { ...twinA, uid: 'twin_b', name: '死锁双尊·另一尊' };
    card.enemies = [twinA, twinB];
    // 击杀一尊（hp 归零）→ 互锁复活钩子救活它。
    const victim = card.enemies[0]!;
    victim.hp = 0;
    const revived = envOf(facade).tryEnemyRevive!(victim, card, new CardRng(3), () => {});
    assert.ok(revived, 'dead twin revived by its partner');
    assert.ok(victim.hp > 0, 'revived hp restored');
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
    let dropped = false;
    const neverRng = () => 0.99; // 永远不掉
    for (let i = 0; i < 8; i++) {
      const roll = loot.rollBossDrop('boss_oom_lord', neverRng);
      if (roll && roll.viaPity) { dropped = true; break; }
      if (roll && !roll.viaPity) assert.fail('never-rng must not drop before pity');
    }
    assert.ok(dropped, 'pity guarantees drop after attempts >= pityAt');
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
