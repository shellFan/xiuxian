import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import type { CardBattleState, CardDefinition } from '../../assets/scripts/v59l/card-battle-engine';

function make(storage = new MemoryStorageAdapter()): { facade: GameFacade; storage: MemoryStorageAdapter } {
  const clock = new FakeClock(new Date(2026, 9, 17, 10, 0, 0, 0).getTime());
  return {
    facade: new GameFacade({ storage, clock, board: null, modeSwitchCooldownMs: 0 }),
    storage,
  };
}

function firstPlayableAttack(state: CardBattleState, catalog: readonly CardDefinition[]): { instanceId: string; targetId?: string } {
  const definitions = new Map(catalog.map((entry) => [entry.id, entry]));
  for (const card of state.piles.hand) {
    const definition = definitions.get(card.cardId);
    if (definition?.type === 'ATTACK' && definition.cost <= state.player.energy) {
      return { instanceId: card.instanceId, targetId: definition.target === 'ENEMY' ? state.enemies[0]?.id : undefined };
    }
  }
  throw new Error('deterministic opening hand should contain a playable attack');
}

function testCatalogsExposeCanonicalEngineContent(): void {
  const { facade } = make();
  assert.equal(facade.queryCardCatalog().length, 36);
  const events = facade.queryCardEventCatalog();
  assert.equal(events.length, 12);
  assert.ok(events.every((event) => event.choices.length === 3));
}

function testDeterministicStartUsesAuthoritativeBattleRun(): void {
  const left = make().facade;
  const right = make().facade;
  const first = left.startCardBattle('NORMAL', 0x59_10);
  const second = right.startCardBattle('NORMAL', 0x59_10);
  assert.deepEqual(first, second);
  const authoritative = left.context.player.activeBattleRun as { status?: string; cardBattle?: CardBattleState };
  assert.equal(authoritative.status, 'FIGHTING');
  assert.deepEqual(authoritative.cardBattle, first);
  assert.equal(first.phase, 'PLAYER_ACTION');
  assert.equal(first.piles.hand.length, 5);
}

function testLegacyTickCannotAutoAttackCardRun(): void {
  const { facade } = make();
  const before = facade.startCardBattle('NORMAL', 1234);
  facade.context.battle.tick(120);
  assert.deepEqual(facade.queryCardBattle(), before);
}

function testActionPersistsAcrossRestartAndOperationReceiptDeduplicates(): void {
  const { facade, storage } = make();
  const started = facade.startCardBattle('NORMAL', 9917);
  const attack = firstPlayableAttack(started, facade.queryCardCatalog());
  const firstReceipt = facade.playCard(attack.instanceId, attack.targetId, 'play-once');
  const afterFirst = facade.queryCardBattle();
  assert.equal(firstReceipt.applied, true);
  assert.ok(afterFirst);

  const duplicate = facade.playCard(attack.instanceId, attack.targetId, 'play-once');
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.reason, 'duplicate operation');
  assert.deepEqual(facade.queryCardBattle(), afterFirst);

  const restarted = make(storage).facade;
  assert.deepEqual(restarted.queryCardBattle(), afterFirst);
  const duplicateAfterRestart = restarted.playCard(attack.instanceId, attack.targetId, 'play-once');
  assert.equal(duplicateAfterRestart.applied, false);
  assert.equal(duplicateAfterRestart.reason, 'duplicate operation');
  assert.deepEqual(restarted.queryCardBattle(), afterFirst);
}

function testMalformedNestedCardStateCannotResume(): void {
  const { facade, storage } = make();
  facade.startCardBattle('NORMAL', 711);
  const raw = JSON.parse(storage.getItem('game-save') ?? '{}') as { activeBattleRun?: { cardBattle?: CardBattleState } };
  assert.ok(raw.activeBattleRun?.cardBattle);
  raw.activeBattleRun!.cardBattle!.piles.hand[0].cardId = 'NOT-A-CARD' as CardBattleState['piles']['hand'][number]['cardId'];
  storage.setItem('game-save', JSON.stringify(raw));

  const restarted = make(storage).facade;
  assert.equal(restarted.queryCardBattle(), null);
  assert.equal(restarted.context.player.activeBattleRun, null);
}

function testVictoryClaimRoutesRewardsAndPermanentDeckThroughPlayerSave(): void {
  const { facade, storage } = make();
  let state = facade.startCardBattle('NORMAL', 5919);
  const run = facade.context.player.activeBattleRun as { cardBattle: CardBattleState };
  run.cardBattle.pendingEventId = 'EVT-07';
  const material = facade.chooseCardBattleEvent('EVT-07', 'C', 'event-material');
  assert.equal(material.applied, true);

  run.cardBattle.enemies[0].hp = 1;
  state = facade.queryCardBattle()!;
  const attack = firstPlayableAttack(state, facade.queryCardCatalog());
  assert.equal(facade.playCard(attack.instanceId, attack.targetId, 'winning-hit').applied, true);
  state = facade.queryCardBattle()!;
  assert.equal(state.phase, 'VICTORY');
  assert.equal((facade.context.player.activeBattleRun as { status: string }).status, 'VICTORY');
  assert.equal(facade.queryFinishedBattle(), null, 'legacy result modal must ignore card battles');

  const cardReward = state.rewards.find((reward) => reward.kind === 'ADD_CARD');
  assert.ok(cardReward);
  assert.equal(facade.chooseCardBattleReward(cardReward!.id, 'choose-card').applied, true);
  assert.equal(facade.claimCardBattleRewards('claim-once').applied, true);
  assert.equal(facade.context.player.materials.mat_legacy_code, 1);
  assert.equal(facade.context.player.cardBattleDeck?.length, 11);
  const duplicate = facade.claimCardBattleRewards('claim-once');
  assert.equal(duplicate.applied, false, 'a repeated claim cannot apply rewards twice');
  assert.equal(duplicate.reason, 'duplicate operation');
  assert.equal(facade.context.player.materials.mat_legacy_code, 1);

  const restarted = make(storage).facade;
  assert.equal(restarted.context.player.cardBattleDeck?.length, 11);
  restarted.clearFinishedBattle();
  assert.equal(restarted.queryCardBattle(), null);
  const next = restarted.startCardBattle('NORMAL', 5920);
  const permanentCount = [...next.piles.draw, ...next.piles.hand, ...next.piles.discard, ...next.piles.exhaust]
    .filter((card) => !card.temporary).length;
  assert.equal(permanentCount, 11, 'starter cards are not duplicated when a saved deck exists');
}

function testCardBattleVictoryStartsAndPersistsTheFateStoryMilestone(): void {
  const { facade, storage } = make();
  const started = facade.startCardBattle('NORMAL', 5919);
  const run = facade.context.player.activeBattleRun as { cardBattle: CardBattleState };
  run.cardBattle.enemies[0].hp = 1;
  const attack = firstPlayableAttack(facade.queryCardBattle()!, facade.queryCardCatalog());

  const receipt = facade.playCard(attack.instanceId, attack.targetId, 'fate-story-first-win');
  assert.equal(receipt.applied, true);
  assert.equal(facade.queryCardBattle()?.phase, 'VICTORY');
  assert.equal(facade.queryFateRun()?.cardBattleWins, 1);
  assert.equal(facade.queryFateEvent()?.id, 'intern_s1');

  const restarted = make(storage).facade;
  assert.equal(restarted.queryFateRun()?.cardBattleWins, 1);
  assert.equal(restarted.queryFateEvent()?.id, 'intern_s1');
  assert.equal(restarted.queryCardBattle()?.battleId, started.battleId);
}

function winCardBattle(facade: GameFacade, operationId: string): void {
  const run = facade.context.player.activeBattleRun as { cardBattle: CardBattleState };
  run.cardBattle.enemies[0].hp = 1;
  const attack = firstPlayableAttack(facade.queryCardBattle()!, facade.queryCardCatalog());
  assert.equal(facade.playCard(attack.instanceId, attack.targetId, operationId).applied, true);
  assert.equal(facade.queryCardBattle()?.phase, 'VICTORY');
}

function testSecondCardBattleVictoryQueuesTheGatedFateEvent(): void {
  const { facade } = make();
  facade.startCardBattle('NORMAL', 5919);
  winCardBattle(facade, 'first-fate-win');
  assert.equal(facade.queryFateEvent()?.id, 'intern_s1');
  facade.resolveFateEvent('intern_s1', 'HELP');
  assert.equal(facade.queryFateEvent()?.id, 'intern_s2');
  facade.resolveFateEvent('intern_s2', 'HELP');
  assert.equal(facade.queryFateEvent()?.id, 'intern_s3', 'the Fate chain continues after the gated choice');

  facade.clearFinishedBattle();
  facade.startCardBattle('NORMAL', 5920);
  winCardBattle(facade, 'second-fate-win');

  assert.equal(facade.queryFateRun()?.cardBattleWins, 2);
  assert.ok(facade.queryFateRun()?.eventQueue.includes('coffee_event'), 'the second-win event is queued behind the ongoing story chain');
}

function testDuplicateVictoryOperationDoesNotAdvanceFateTwice(): void {
  const { facade } = make();
  const started = facade.startCardBattle('NORMAL', 5919);
  const run = facade.context.player.activeBattleRun as { cardBattle: CardBattleState };
  run.cardBattle.enemies[0].hp = 1;
  const attack = firstPlayableAttack(facade.queryCardBattle()!, facade.queryCardCatalog());
  const first = facade.playCard(attack.instanceId, attack.targetId, 'same-winning-operation');
  assert.equal(first.applied, true);
  assert.equal(facade.queryFateRun()?.cardBattleWins, 1);

  const duplicate = facade.playCard(attack.instanceId, attack.targetId, 'same-winning-operation');
  assert.equal(duplicate.applied, false);
  assert.equal(facade.queryFateRun()?.cardBattleWins, 1);
  assert.equal(facade.queryCardBattle()?.battleId, started.battleId);
}

const tests: Array<[string, () => void]> = [
  ['catalogs expose canonical engine content', testCatalogsExposeCanonicalEngineContent],
  ['deterministic start uses authoritative battle run', testDeterministicStartUsesAuthoritativeBattleRun],
  ['legacy tick cannot auto attack card run', testLegacyTickCannotAutoAttackCardRun],
  ['action persists across restart and receipt deduplicates', testActionPersistsAcrossRestartAndOperationReceiptDeduplicates],
  ['malformed nested card state cannot resume', testMalformedNestedCardStateCannotResume],
  ['victory claim routes rewards and permanent deck through player save', testVictoryClaimRoutesRewardsAndPermanentDeckThroughPlayerSave],
  ['card battle victory starts and persists the fate story milestone', testCardBattleVictoryStartsAndPersistsTheFateStoryMilestone],
  ['second card battle victory queues the gated Fate event', testSecondCardBattleVictoryQueuesTheGatedFateEvent],
  ['duplicate victory operation does not advance Fate twice', testDuplicateVictoryOperationDoesNotAdvanceFateTwice],
];

let failures = 0;
for (const [name, test] of tests) {
  try {
    test();
    console.log('ok - ' + name);
  } catch (error) {
    failures += 1;
    console.error('not ok - ' + name);
    console.error(error);
  }
}
if (failures > 0) process.exit(1);
console.log('V5.9-L card battle integration tests passed');
