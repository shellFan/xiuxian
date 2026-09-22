import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { mulberry32, RandomService } from '../../assets/scripts/v2/random-service';

process.env.TZ = 'Asia/Shanghai';

const SEED = 4101;
const MONDAY_0900_SHANGHAI = Date.parse('2026-09-21T09:00:00+08:00');

interface FirstDayResult {
  readonly eventId: string;
  readonly choiceId: string;
  readonly settlementRank: string;
  readonly settlementTitle: string;
}

function makeFacade(): { facade: GameFacade; clock: FakeClock } {
  const clock = new FakeClock(MONDAY_0900_SHANGHAI);
  const seeded = mulberry32(SEED);
  const facade = new GameFacade({
    clock,
    careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new MemoryStorageAdapter(),
    board: null,
    modeSwitchCooldownMs: 0,
    randomV2: new RandomService(mulberry32(SEED)),
    randomProvider: { next: seeded },
    battleRng: mulberry32(SEED),
    autoSaveIntervalSeconds: 0,
  });
  return { facade, clock };
}

function reachNaturallyScheduledChoice(facade: GameFacade, clock: FakeClock): { eventId: string; choices: string[] } {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    facade.gameLoop.tick(1);
    const event = facade.queryV2CurrentEvent();
    const choices = facade.queryV2CurrentChoices();
    if (event && choices.length >= 2) return { eventId: event.id, choices: choices.map((choice) => choice.id) };
    if (event) facade.resolveV2Event(null);
    clock.advance(26 * 60_000);
  }
  throw new Error('seed 4101 did not reach a two-choice event during the first workday');
}

function finishProjectRoute(facade: GameFacade): void {
  const options = facade.queryBattleBuildOptions();
  const build = options.find((item) => item.id === 'build_redis') ?? options[0];
  assert.ok(build, 'the normal project route exposes at least one existing combat build');
  const started = facade.startBattleRun('PROJECT', build.id);
  assert.equal(started.source, 'PROJECT');
  assert.equal(started.status, 'FIGHTING');

  for (let tick = 0; tick < 1_200 && !facade.queryFinishedBattle(); tick += 1) {
    const active = facade.queryBattle();
    if (active?.skillOffers) facade.chooseBattleSkill(active.skillOffers[0]);
    facade.gameLoop.tick(1);
  }
  const finished = facade.queryFinishedBattle();
  assert.ok(finished, 'the project combat route reaches its existing terminal result');
  assert.equal(finished.rewardsClaimed, true, 'combat uses the existing exactly-once reward settlement');
}

function runFirstDay(choiceBranch: 0 | 1): FirstDayResult {
  const { facade, clock } = makeFacade();
  try {
    facade.gameLoop.start();
    facade.gameLoop.tick(1);
    const openingClock = facade.queryGameClock();
    assert.deepEqual(
      { weekday: openingClock.weekday, hour: openingClock.hour, minute: openingClock.minute },
      { weekday: 1, hour: 9, minute: 0 },
      'the deterministic route starts Monday 09:00 in Asia/Shanghai',
    );
    assert.equal(facade.context.board, null, 'the first-day route does not require recruit or merge');

    facade.advanceTutorial();
    if (facade.snapshot().workMode !== 'WORK') assert.equal(facade.changeWorkMode('WORK').success, true);
    clock.advance(60_000);
    facade.gameLoop.tick(60);
    assert.ok(facade.snapshot().workSeconds > 0, 'ordinary work is reachable');

    assert.equal(facade.changeWorkMode('FISHING').success, true);
    clock.advance(60_000);
    facade.gameLoop.tick(60);
    assert.ok(facade.snapshot().fishingSeconds > 0, 'paid fishing is reachable');

    assert.equal(facade.changeWorkMode('CULTIVATING').success, true);
    clock.advance(1_000);
    facade.gameLoop.tick(1);
    const cultivationBefore = facade.snapshot().cultivationExp;
    const cultivation = facade.cultivate();
    assert.ok(cultivation.cultivationExp > 0, 'cultivation action is reachable');
    assert.ok(facade.snapshot().cultivationExp >= cultivationBefore);

    const task = facade.queryTaskConfigs().find((item) => item.id === 'task_daily_report');
    assert.ok(task, 'a named, described, rewarded first-day task is exposed');
    assert.ok(task.name.length > 0 && task.description.length > 0 && task.durationSeconds > 0);
    assert.ok(task.rewardSalary > 0 || task.rewardCultivation > 0 || task.rewardSpiritStones > 0);
    assert.equal(facade.startTask(task.id).success, true);
    clock.advance(task.durationSeconds * 1_000);
    facade.gameLoop.tick(1);
    assert.equal(facade.claimTask(task.id).success, true);
    assert.equal(facade.queryTutorial().isCompleted, true, 'the soft first-day guide completes on the non-merge path');

    const choiceEvent = reachNaturallyScheduledChoice(facade, clock);
    const choiceId = choiceEvent.choices[choiceBranch];
    assert.ok(choiceId, `choice branch ${choiceBranch === 0 ? 'A' : 'B'} is available`);
    const resolution = facade.resolveV2Event(choiceId);
    assert.equal(resolution.eventId, choiceEvent.eventId);
    assert.equal(resolution.choiceId, choiceId);

    finishProjectRoute(facade);

    clock.set(Date.parse('2026-09-21T17:55:00+08:00'));
    assert.equal(facade.queryTimeUntilOffWork(), 5 * 60_000);
    assert.equal(facade.queryWorkToday().countdownMs, 5 * 60_000, '17:55 exposes the five-minute off-work atmosphere');
    const offered = facade.offerOvertime('REQUESTED', true, 2 * 3600);
    assert.equal(offered.status, 'OFFERED');
    const overtimeStatsBefore = { ...facade.context.player.overtimeStats };
    const declined = facade.declineOvertime();
    assert.equal(declined.success, true, 'a first-day player may decline requested free overtime');
    assert.equal(facade.queryOvertime(), null);
    assert.deepEqual(facade.context.player.overtimeStats, overtimeStatsBefore, 'declining records no worked overtime or reward');

    clock.set(Date.parse('2026-09-21T18:00:00+08:00'));
    assert.equal(facade.queryCanSettleDay(), true);
    const summary = facade.settleDay();
    assert.equal(summary.weekday, 1);
    assert.equal(summary.freeOvertimeSeconds, 0);
    assert.match(summary.statusText, /准时下班/);
    assert.ok(summary.title.length > 0 && summary.rank.length > 0, 'settlement returns a meaningful first-day summary');
    assert.equal(facade.context.player.dailyHistory.length, 1);

    const final = facade.snapshot();
    for (const [name, value] of Object.entries({
      salary: final.salary,
      cultivationExp: final.cultivationExp,
      performance: final.performance,
      mind: final.mind,
      spiritStones: final.spiritStones,
    })) {
      assert.ok(Number.isFinite(value) && value >= 0, `${name} remains finite and nonnegative`);
    }
    return { eventId: choiceEvent.eventId, choiceId, settlementRank: summary.rank, settlementTitle: summary.title };
  } finally {
    facade.destroy();
  }
}

function testBothChoiceBranchesReachFirstDaySettlement(): void {
  const a = runFirstDay(0);
  const b = runFirstDay(1);
  assert.equal(a.eventId, b.eventId, 'seed 4101 reaches the same normal event in both runs');
  assert.notEqual(a.choiceId, b.choiceId, 'A and B exercise distinct real choices');
  assert.equal(a.settlementRank, b.settlementRank, 'both choice branches reach daily settlement');
  assert.ok(a.settlementTitle.length > 0 && b.settlementTitle.length > 0);
}

function testDesktopKeepsCompactFirstDayActionsOnOneHomeScreen(): void {
  const overlay = readFileSync(join(process.cwd(), 'desktop/ui-overlay.js'), 'utf8');
  const css = readFileSync(join(process.cwd(), 'desktop/ui-overlay.css'), 'utf8');
  assert.match(overlay, /data-action="declineOvertime"/, '17:55 free-overtime request exposes decline');
  assert.match(overlay, /data-action="acceptFreeOvertime"/, '17:55 request also keeps the choice meaningful');
  assert.match(overlay, /data-action="doSettle"/, 'off-work home exposes canonical day settlement');
  assert.match(overlay, /距离下班/);
  assert.match(overlay, /今日待办/);
  assert.match(overlay, /data-action="projectEntry"/);
  assert.match(css, /\.ux-body--home\s*\{[^}]*overflow:\s*hidden/s, 'home remains a single screen without vertical scroll');
}

testBothChoiceBranchesReachFirstDaySettlement();
testDesktopKeepsCompactFirstDayActionsOnOneHomeScreen();
console.log('v4.1 first-day reachability tests passed');
