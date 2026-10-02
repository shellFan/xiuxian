import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';
import { dayOfWeek, weekIndexOf } from '../../assets/scripts/v57/week-service';

process.env.TZ = 'Asia/Shanghai';
const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');
const MINUTE = 60_000;

function makeFacade(seed = 7601): { facade: GameFacade; clock: FakeClock } {
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
  return { facade, clock };
}

/** V5.7 Phase E：第一周剧情节拍——Mon~Sun 定时投递 + 幂等（§43~§49）。 */
function testFirstWeekBeats(): void {
  const { facade, clock } = makeFacade();
  try {
    facade.gameLoop.start();
    const minuteOfDayNow = () => {
      const d = new Date(clock.now());
      return d.getHours() * 60 + d.getMinutes();
    };
    const advanceTo = (h: number, m: number) => {
      const cur = minuteOfDayNow();
      const target = h * 60 + m;
      clock.advance((target >= cur ? target - cur : 24 * 60 - cur + target) * MINUTE);
    };
    const nextMorning = () => {
      // 结算当前日 → 推进到次日 09:04 → 开新日
      advanceTo(18, 5);
      facade.context.daySettlement.settle();
      advanceTo(9, 4);
      facade.context.gameDay.ensureStarted();
      facade.gameLoop.tick(60);
    };

    // 周一 09:05 → w1m_intro
    facade.context.gameDay.ensureStarted();
    clock.advance(5 * MINUTE);
    facade.gameLoop.tick(5 * MINUTE);
    assert.ok((facade.context.player.weekStory?.doneSteps ?? []).includes('w1m_intro'), 'Monday intro beat fired');

    // 周二：求助节拍
    nextMorning();
    advanceTo(10, 12);
    facade.gameLoop.tick(60);
    assert.ok((facade.context.player.weekStory?.doneSteps ?? []).includes('w1t_favor'), 'Tuesday favor beat fired');

    // 周三：需求变更
    nextMorning();
    advanceTo(10, 42);
    facade.gameLoop.tick(60);
    assert.ok((facade.context.player.weekStory?.doneSteps ?? []).includes('w1w_req'), 'Wednesday requirement beat fired');

    // 周四：事故复盘
    nextMorning();
    advanceTo(10, 52);
    facade.gameLoop.tick(60);
    assert.ok((facade.context.player.weekStory?.doneSteps ?? []).includes('w1th_alarm'), 'Thursday incident beat fired');

    // 周五 17:52 → typing 演出
    nextMorning();
    advanceTo(17, 52);
    facade.gameLoop.tick(60);
    assert.ok((facade.context.player.weekStory?.doneSteps ?? []).includes('w1f_typing'), 'Friday 17:55 typing beat fired');

    // 周六 12:01 → 召回
    nextMorning();
    advanceTo(12, 1);
    facade.gameLoop.tick(60);
    assert.ok((facade.context.player.weekStory?.doneSteps ?? []).includes('w1sa_call'), 'Saturday call beat fired');

    // 节拍不重复投递（幂等）
    const countBefore = (facade.context.player.weekStory?.doneSteps ?? []).length;
    clock.advance(10 * MINUTE);
    facade.gameLoop.tick(10 * MINUTE);
    assert.equal((facade.context.player.weekStory?.doneSteps ?? []).length, countBefore, 'no duplicate beats');
    console.log('first week beats passed');
  } finally {
    facade.destroy();
  }
}

/** V5.7：周结算就绪（周日 10:00）+ 明日钩子（§86/§96/§97）。 */
function testWeeklySettlementReady(): void {
  const { facade, clock } = makeFacade();
  try {
    facade.gameLoop.start();
    facade.context.gameDay.ensureStarted();
    // 推进到周日 09:59
    for (let d = 0; d < 6; d++) {
      clock.advance(24 * 60 * MINUTE);
      facade.context.gameDay.ensureStarted();
      facade.gameLoop.tick(60);
    }
    clock.advance(59 * MINUTE);
    facade.gameLoop.tick(MINUTE);
    assert.ok(!facade.context.player.weekSettlementReady, 'not ready before Sunday 10:00');
    clock.advance(MINUTE);
    facade.gameLoop.tick(MINUTE);
    assert.ok(facade.context.player.weekSettlementReady, 'weekly settlement ready Sunday 10:00');
    const view = facade.queryWeeklySettlement();
    assert.equal(view.weekIndex, 1, 'week index 1');
    assert.ok(view.nextWeekHooks.length >= 1, 'next week hooks exist');
    assert.ok(view.weekTitle.length > 0, 'week title generated');
    const hook = facade.queryTomorrowHook();
    assert.ok(hook.length > 0, 'tomorrow hook non-empty');
    console.log('weekly settlement ready passed');
  } finally {
    facade.destroy();
  }
}

/** V5.7：周/日换算。 */
function testWeekMath(): void {
  assert.equal(dayOfWeek(1), 1, 'day 1 = Monday');
  assert.equal(dayOfWeek(7), 7, 'day 7 = Sunday');
  assert.equal(dayOfWeek(8), 1, 'day 8 = next Monday');
  assert.equal(weekIndexOf(1), 1, 'week 1 starts day 1');
  assert.equal(weekIndexOf(8), 2, 'week 2 starts day 8');
  console.log('week math passed');
}

testFirstWeekBeats();
testWeeklySettlementReady();
testWeekMath();
console.log('FIRST WEEK STORY TEST PASSED');
