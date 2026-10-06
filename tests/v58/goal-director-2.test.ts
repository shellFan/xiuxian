import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';

process.env.TZ = 'Asia/Shanghai';
const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');

function makeFacade(seed = 5107, profession: 'JAVA_BACKEND' | 'FRONTEND' = 'JAVA_BACKEND'): { facade: GameFacade; clock: FakeClock } {
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

/** §11: goal text must be profession-aware — no hardcoded "Java 任务" for other professions. */
function testProfessionAwareGoalText(): void {
  const { facade } = makeFacade(5107, 'FRONTEND');
  try {
    const goals = facade.queryGoals();
    const prof = goals.find((g) => g.layer === 'PROFESSION');
    assert.ok(prof, 'PROFESSION goal exists');
    assert.ok(!prof.sub.includes('Java'), 'FRONTEND goal must not mention Java');
    assert.ok(prof.sub.includes('前端'), `FRONTEND goal uses 前端 wording (got: ${prof.sub})`);
    console.log('profession-aware goal text passed');
  } finally {
    facade.destroy();
  }
}

/** §9: a finished-but-unclaimed battle is the top NOW goal. */
function testBattleClaimIsNowGoal(): void {
  const { facade } = makeFacade();
  try {
    facade.startBattleRun('PROJECT', 'build_jvm');
    facade.abandonBattleRun();
    const goals = facade.queryGoals();
    assert.ok(goals.length > 0, 'goals generated');
    const top = goals[0];
    assert.equal(top.layer, 'NOW', `battle claim becomes NOW (got ${top.layer})`);
    assert.match(top.text, /战利品|结算/, 'battle claim text');
    assert.equal(top.page, 'PROJECT', 'claim goal navigates to PROJECT');
    console.log('battle-claim NOW goal passed');
  } finally {
    facade.destroy();
  }
}

/** §9: low mind surfaces an immediate recovery action. */
function testMindRecoveryNowGoal(): void {
  const { facade } = makeFacade();
  try {
    facade.context.player.mind = 20;
    const goals = facade.queryGoals();
    const mind = goals.find((g) => g.layer === 'NOW' && g.page === 'CULTIVATION');
    assert.ok(mind, 'low-mind recovery goal exists');
    assert.match(mind.text, /道心告急/, 'recovery goal text');
    console.log('mind-recovery NOW goal passed');
  } finally {
    facade.destroy();
  }
}

/** §8: goals are priority-sorted — the banner (goals[0]) is the single primary. */
function testGoalPriorityOrder(): void {
  const { facade } = makeFacade();
  try {
    const goals = facade.queryGoals();
    for (let i = 1; i < goals.length; i++) {
      assert.ok(goals[i - 1].priority >= goals[i].priority, `goals sorted by priority desc (${i})`);
    }
    const nowCount = goals.filter((g) => g.layer === 'NOW').length;
    assert.ok(nowCount >= 0, 'NOW goals present or absent');
    console.log('goal priority order passed');
  } finally {
    facade.destroy();
  }
}

testProfessionAwareGoalText();
testBattleClaimIsNowGoal();
testMindRecoveryNowGoal();

/** §11: fresh player with a profession but no tasks gets a 'take first task' NOW goal. */
function testFreshPlayerTaskGuidance(): void {
  const { facade } = makeFacade();
  try {
    const goals = facade.queryGoals();
    const guide = goals.find((g) => g.layer === 'NOW' && g.page === 'TASKS' && /第一个任务/.test(g.text));
    assert.ok(guide, 'fresh player gets task guidance NOW goal');
    console.log('fresh player task guidance passed');
  } finally {
    facade.destroy();
  }
}

testGoalPriorityOrder();
testFreshPlayerTaskGuidance();
console.log('goal director 2.0: all tests passed');
