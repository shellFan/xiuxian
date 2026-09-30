import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';

process.env.TZ = 'Asia/Shanghai';

const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');

function makeFacade(): { facade: GameFacade; clock: FakeClock } {
  const clock = new FakeClock(MONDAY_0900);
  const facade = new GameFacade({
    clock,
    careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new MemoryStorageAdapter(),
    board: null,
    randomV2: new RandomService(mulberry32(6101)),
  });
  return { facade, clock };
}

function todayEarned(facade: GameFacade): number {
  return facade.queryGameDay()?.income.salary ?? 0;
}

function startWork(facade: GameFacade): void {
  if (facade.snapshot().workMode !== 'WORK') facade.changeWorkMode('WORK');
}

/** §202: 09:00→10:00 工作中，今日已赚必须 > 0 且随时间增长。 */
function testLiveSalaryGrowsDuringWork(): void {
  const { facade, clock } = makeFacade();
  try {
    facade.gameLoop.start();
    facade.gameLoop.tick(1);
    startWork(facade);
    assert.equal(facade.snapshot().workMode, 'WORK', 'player is working');
    assert.equal(todayEarned(facade), 0, 'salary starts at 0 at 09:00');

    clock.advance(10 * 60_000);
    facade.gameLoop.tick(600);
    const after10min = todayEarned(facade);
    assert.ok(after10min > 0, `10 work minutes must earn salary (got ${after10min})`);

    clock.advance(50 * 60_000);
    facade.gameLoop.tick(3000);
    const after1h = todayEarned(facade);
    assert.ok(after1h > after10min, `one work hour keeps earning (${after10min} -> ${after1h})`);

    // 已赚与玩家工资总额同步增长
    assert.ok(facade.snapshot().salary > 0, 'player salary total grows too');
    console.log(`live salary grows during work: 10min=¥${after10min} 1h=¥${after1h}`);
  } finally {
    facade.destroy();
  }
}

/** §59: 带薪摸鱼 0.6× 工资继续增长。 */
function testFishingStillPays(): void {
  const { facade, clock } = makeFacade();
  try {
    facade.gameLoop.start();
    facade.gameLoop.tick(1);
    startWork(facade);
    clock.advance(30 * 60_000);
    facade.gameLoop.tick(1800);
    const workEarned = todayEarned(facade);

    facade.changeWorkMode('FISHING');
    clock.advance(30 * MINUTE);
    facade.gameLoop.tick(1800);
    const fishingEarned = todayEarned(facade);
    assert.ok(fishingEarned > workEarned, `fishing keeps paying at reduced rate (${workEarned} -> ${fishingEarned})`);
    console.log(`fishing pays: work30m=¥${workEarned} fishing30m adds to ¥${fishingEarned}`);
  } finally {
    facade.destroy();
  }
}

/** §61: 免费加班 18:00 后今日已赚不增长。 */
function testFreeOvertimePaysNothing(): void {
  const { facade, clock } = makeFacade();
  try {
    facade.gameLoop.start();
    facade.gameLoop.tick(1);
    startWork(facade);
    // 推进到 18:00（跳过午休与下班窗口直接 set）
    clock.set(Date.parse('2026-09-21T17:00:00+08:00'));
    facade.gameLoop.tick(3600);
    const at1800 = todayEarned(facade);
    assert.ok(at1800 > 0, `normal day earns salary (got ${at1800})`);

    // 免费加班到 20:00
    clock.set(Date.parse('2026-09-21T18:00:00+08:00'));
    facade.startVoluntaryOvertime(2 * 3600, false);
    clock.set(Date.parse('2026-09-21T20:00:00+08:00'));
    facade.gameLoop.tick(7200);
    const afterFreeOT = todayEarned(facade);
    assert.equal(afterFreeOT, at1800, '免费加班：工资已经下班了，你还没有');
    console.log(`free overtime pays nothing: 18:00=¥${at1800} 20:00=¥${afterFreeOT}`);
  } finally {
    facade.destroy();
  }
}

/** §64: 日结算收入与当日已赚一致（普通工资部分）。 */
function testSettlementMatchesLiveEarned(): void {
  const { facade, clock } = makeFacade();
  try {
    facade.gameLoop.start();
    facade.gameLoop.tick(1);
    startWork(facade);
    clock.advance(8 * 3600_000);
    facade.gameLoop.tick(8 * 3600);
    const liveEarned = todayEarned(facade);
    assert.ok(liveEarned > 0, 'full workday earns salary');
    clock.set(Date.parse('2026-09-21T18:00:00+08:00'));
    const view = facade.settleDay();
    assert.equal(view.income.salary, liveEarned, `settlement income (${view.income.salary}) must equal live earned (${liveEarned})`);
    console.log(`settlement matches live earned: ¥${view.income.salary}`);
  } finally {
    facade.destroy();
  }
}

/** §65: save/load 后继续正确累计。 */
function testLiveEarnedSurvivesSaveLoad(): void {
  const { facade, clock } = makeFacade();
  const storage = facade.context.saveService;
  try {
    facade.gameLoop.start();
    facade.gameLoop.tick(1);
    startWork(facade);
    clock.advance(30 * 60_000);
    facade.gameLoop.tick(1800);
    const before = todayEarned(facade);
    facade.save();
    const reloaded = new GameFacade({
      clock,
      careerEventClock: clock,
      storage: facade.context.saveService['storage'] as never,
      board: null,
      randomV2: new RandomService(mulberry32(6101)),
    });
    try {
      const after = todayEarned(reloaded);
      assert.equal(after, before, `live earned survives save/load (${before} -> ${after})`);
      clock.advance(10 * MINUTE);
      reloaded.gameLoop.start();
      reloaded.gameLoop.tick(600);
      if (reloaded.snapshot().workMode !== 'WORK') reloaded.changeWorkMode('WORK');
      reloaded.gameLoop.tick(600);
      assert.ok(todayEarned(reloaded) > after, 'earning continues after reload');
      console.log('live earned survives save/load and continues');
    } finally {
      reloaded.destroy();
    }
  } finally {
    facade.destroy();
  }
  void storage;
}

const MINUTE = 60_000;

testLiveSalaryGrowsDuringWork();
testFishingStillPays();
testFreeOvertimePaysNothing();
testSettlementMatchesLiveEarned();
testLiveEarnedSurvivesSaveLoad();
console.log('salary live earned regression passed');
