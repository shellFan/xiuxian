import assert from 'node:assert/strict';
import { GameContext } from '../../assets/scripts/core/game-context';
import { FakeClock } from '../../assets/scripts/core/clock';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { GameFacade } from '../../assets/scripts/facade/game-facade';

const NOW = 1_800_000_000_000;

function context(playTimeScale = 1) {
  return new GameContext({
    board: null,
    player: new PlayerData({ profession: 'QA', characterSetupStatus: 'BACKFILL_REQUIRED' }),
    storage: new MemoryStorageAdapter(),
    clock: new FakeClock(NOW),
    playTimeScale,
    battleRng: () => 0.99,
  });
}

function unlockOnlineIncident(game: ReturnType<typeof context>): void {
  game.gameDay.ensureStarted();
  game.fateEvents.beginRun(441);
  game.fateEvents.triggerMilestone('arena:3:2');
  for (const id of ['boss_s1', 'boss_s2', 'boss_s3']) {
    const event = game.fateEvents.currentEvent();
    assert.equal(event?.id, id);
    game.fateEvents.choose(id, 'NEGOTIATE');
  }
  const event = game.fateEvents.currentEvent();
  assert.equal(event?.id, 'boss_s4');
  assert.equal(game.fateEvents.choose('boss_s4', 'NEGOTIATE').challengeId, 'online_incident');
}

function api(game: ReturnType<typeof context>) {
  const service = game.fateEvents as unknown as {
    startActiveChallenge(buildId: string): { battleRunId: string; source: string; challengeId: string };
    settleActiveChallenge(): 'VICTORY' | 'DEFEAT' | null;
    tickActiveChallenge(): void;
  };
  assert.equal(typeof service.startActiveChallenge, 'function', 'fate challenges must start through the authoritative service');
  assert.equal(typeof service.settleActiveChallenge, 'function', 'fate challenges must settle from the V3 battle result');
  return service;
}

function testChallengeVictoryUsesV3BattleAndSettlesOnlyOnce(): void {
  const game = context();
  unlockOnlineIncident(game);
  const service = api(game);
  const started = service.startActiveChallenge('build_java');
  assert.equal(started.challengeId, 'online_incident');
  assert.equal(started.source, 'INCIDENT');
  assert.equal(game.battle.current()?.runId, started.battleRunId);
  assert.equal(game.player.fateRun?.activeChallengeBattleRunId, started.battleRunId);
  const battle = game.battle.current()!;
  battle.attack = 1_000_000;
  for (let index = 0; index < 100 && (game.battle.current()?.wave ?? 99) < (game.battle.current()?.waveTotal ?? 0) - 1; index += 1) {
    game.battle.tick(0.2);
    if (game.battle.current()?.skillOffers) game.battle.chooseSkill(null);
  }
  assert.ok(game.battle.current()?.enemies.some((enemy) => enemy.name === '线上事故·回滚魔君'));
  for (let index = 0; index < 20 && game.battle.current(); index += 1) {
    game.battle.tick(0.2);
    if (game.battle.current()?.skillOffers) game.battle.chooseSkill(null);
  }
  assert.equal(game.battle.finished()?.status, 'VICTORY');
  assert.equal(service.settleActiveChallenge(), 'VICTORY');
  assert.equal(service.settleActiveChallenge(), null);
  assert.equal(game.player.fateRun?.flags['challenge:online_incident:VICTORY'], true);
  assert.equal(game.player.fateRun?.activeChallengeId, null);
}

function testChallengeDefeatUsesV3BattleAndRecordsFailureBranch(): void {
  const game = context();
  unlockOnlineIncident(game);
  const service = api(game);
  service.startActiveChallenge('build_java');
  const battle = game.battle.current()!;
  battle.playerHp = 1;
  for (const enemy of battle.enemies) {
    enemy.attack = 1_000_000;
    enemy.intervalSec = 0.2;
  }
  game.battle.tick(1);
  assert.equal(game.battle.finished()?.status, 'DEFEAT');
  assert.equal(service.settleActiveChallenge(), 'DEFEAT');
  assert.equal(game.player.fateRun?.flags['challenge:online_incident:DEFEAT'], true);
  assert.equal(game.player.fateRun?.activeChallengeId, null);
}

function testChallengeTimesOutAgainstTheAuthoritativeGameClock(): void {
  const game = context(2);
  unlockOnlineIncident(game);
  const service = api(game);
  service.startActiveChallenge('build_java');
  (game.clockV2 as unknown as { advancePlayTime(milliseconds: number): void }).advancePlayTime(180_001);
  service.tickActiveChallenge();
  assert.equal(game.battle.finished()?.status, 'DEFEAT');
  assert.equal(game.player.fateRun?.flags['challenge:online_incident:DEFEAT'], true);
  assert.equal(game.player.fateRun?.activeChallengeId, null);
}

function testFacadeAbandonSettlesFateChallengeBeforeFinishedBattleCanBeDismissed(): void {
  const facade = new GameFacade({
    player: new PlayerData({ profession: 'QA', characterSetupStatus: 'BACKFILL_REQUIRED' }),
    storage: new MemoryStorageAdapter(),
    clock: new FakeClock(NOW),
    board: null,
    playTimeScale: 1,
  });
  unlockOnlineIncident(facade.context);
  facade.startFateChallenge('build_java');

  facade.abandonBattleRun();

  assert.equal(facade.queryFateRun()?.flags['challenge:online_incident:DEFEAT'], true,
    'abandoning a challenge through the player facade must persist its Fate outcome synchronously');
  assert.equal(facade.queryFateRun()?.activeChallengeId, null);
  facade.clearFinishedBattle();
  assert.equal(facade.queryFateRun()?.flags['challenge:online_incident:DEFEAT'], true,
    'closing the visible result must not erase the battle record before challenge settlement');
  facade.destroy();
}

testChallengeVictoryUsesV3BattleAndSettlesOnlyOnce();
testChallengeDefeatUsesV3BattleAndRecordsFailureBranch();
testChallengeTimesOutAgainstTheAuthoritativeGameClock();
testFacadeAbandonSettlesFateChallengeBeforeFinishedBattleCanBeDismissed();
console.log('v59j fate challenge tests passed');
