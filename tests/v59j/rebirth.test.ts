import assert from 'node:assert/strict';
import { GameContext } from '../../assets/scripts/core/game-context';
import { FakeClock } from '../../assets/scripts/core/clock';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

const NOW = 1_800_000_000_000;

function context() {
  return new GameContext({
    board: null,
    player: new PlayerData({
      salary: 4_200,
      spiritStones: 888,
      cultivationExp: 120,
      careerLevel: 4,
      profession: 'QA',
      ownedEquipment: ['eq_heap_armor'],
      characterSetupStatus: 'BACKFILL_REQUIRED',
      rebirthMeta: { karma: 100, talentRanks: {}, unlockedEndings: [], settledRunIds: [] },
    }),
    storage: new MemoryStorageAdapter(),
    clock: new FakeClock(NOW),
    battleRng: () => 0.99,
  });
}

function endRun(game: ReturnType<typeof context>, expectedStatus: 'ENDED' | 'ACTIVE' = 'ENDED'): string {
  game.fateEvents.beginRun(988);
  game.fateEvents.triggerMilestone('card-battle:first-win');
  for (let index = 0; index < 10 && game.fateEvents.currentEvent()?.id !== 'intern_s5'; index += 1) {
    const event = game.fateEvents.currentEvent();
    assert.ok(event);
    game.fateEvents.choose(event.id, event.id.startsWith('intern_s') ? 'HELP' : 'NEGOTIATE');
  }
  const last = game.fateEvents.currentEvent();
  assert.equal(last?.id, 'intern_s5');
  game.fateEvents.choose('intern_s5', 'RISK');
  assert.equal(game.player.fateRun?.status, expectedStatus);
  return game.player.fateRun!.runId;
}

function api(game: ReturnType<typeof context>) {
  const service = (game as unknown as { rebirth?: {
    settleRun(): { runId: string; karmaAwarded: number; duplicate: boolean };
    rebirth(seed: number): { runId: string; settledRunId: string };
    purchaseTalent(id: string): { rank: number; karmaRemaining: number };
  } }).rebirth;
  assert.ok(service, 'GameContext should expose the authoritative rebirth service');
  return service;
}

function testRunRewardSettlesOnceByRunId(): void {
  const game = context();
  const runId = endRun(game);
  const service = api(game);
  const first = service.settleRun();
  const second = service.settleRun();
  assert.equal(first.runId, runId);
  assert.ok(first.karmaAwarded > 0);
  assert.equal(second.duplicate, true);
  assert.equal(second.karmaAwarded, 0);
  assert.equal(game.player.rebirthMeta.settledRunIds.filter((id) => id === runId).length, 1);
  assert.deepEqual(game.player.rebirthMeta.unlockedEndings, [game.player.fateRun?.terminalOutcomeId]);
}

function testRebirthPreservesWalletSalaryProfessionAndEquipment(): void {
  const game = context();
  const oldRunId = endRun(game);
  const before = {
    salary: game.player.salary,
    spiritStones: game.player.spiritStones,
    cultivationExp: game.player.cultivationExp,
    careerLevel: game.player.careerLevel,
    profession: game.player.profession,
    ownedEquipment: [...game.player.ownedEquipment],
  };
  const restarted = api(game).rebirth(989);
  assert.equal(restarted.settledRunId, oldRunId);
  assert.equal(game.player.fateRun?.status, 'ACTIVE');
  assert.notEqual(game.player.fateRun?.runId, oldRunId);
  assert.deepEqual({
    salary: game.player.salary,
    spiritStones: game.player.spiritStones,
    cultivationExp: game.player.cultivationExp,
    careerLevel: game.player.careerLevel,
    profession: game.player.profession,
    ownedEquipment: game.player.ownedEquipment,
  }, before);
}

function testTalentPurchaseUsesOnlyKarmaAndIsPersisted(): void {
  const game = context();
  const result = api(game).purchaseTalent('born_cow');
  assert.equal(result.rank, 1);
  assert.equal(result.karmaRemaining, 97);
  assert.equal(game.player.rebirthMeta.talentRanks.born_cow, 1);
  assert.equal(game.player.spiritStones, 888);
  assert.throws(() => api(game).purchaseTalent('unknown'), /Unknown fate talent/);
}

function testCombatTalentsChangeAuthoritativeBattleModifiers(): void {
  const game = context();
  api(game).purchaseTalent('born_cow');
  api(game).purchaseTalent('fishing_master');
  const modifiers = game.fateEvents.combatModifiers();
  assert.equal(modifiers.attackMultiplier, 1.03);
  assert.equal(modifiers.autoIntervalMultiplier, 0.98);
}

function testNineLivesPreventsOneDeathEndingAndIsConsumedForThatRun(): void {
  const game = context();
  api(game).purchaseTalent('nine_lives');
  endRun(game, 'ACTIVE');
  assert.equal(game.player.fateRun?.status, 'ACTIVE');
  assert.ok((game.player.fateRun?.health ?? 0) > 0);
  assert.equal(game.player.fateRun?.flags.nine_lives_used, true);
  assert.equal(game.fateEvents.currentEvent(), null);
}

testRunRewardSettlesOnceByRunId();
testRebirthPreservesWalletSalaryProfessionAndEquipment();
testTalentPurchaseUsesOnlyKarmaAndIsPersisted();
testCombatTalentsChangeAuthoritativeBattleModifiers();
testNineLivesPreventsOneDeathEndingAndIsConsumedForThatRun();
console.log('v59j rebirth tests passed');
