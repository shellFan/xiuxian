import assert from 'node:assert/strict';

import {
  CARD_CATALOG,
  EVENT_CATALOG,
  CardBattleEngine,
  createCardBattleState,
  STARTER_CLASS_CARD_BY_PROFESSION,
  validateCardBattleState,
  type CardBattleState,
  type CardId,
  type EventId,
} from '../../assets/scripts/v59l/card-battle-engine';

function engineFor(cardIds: CardId[], seed = 5919): CardBattleEngine {
  const state = createCardBattleState({
    seed,
    deckCardIds: cardIds,
    enemies: [
      { id: 'target-a', kind: 'WORK_BUG', name: '测试 Bug A', hp: 80, maxHp: 80, attack: 6 },
      { id: 'target-b', kind: 'WORK_BUG', name: '测试 Bug B', hp: 80, maxHp: 80, attack: 6 },
    ],
  });
  const engine = new CardBattleEngine(state);
  engine.start();
  return engine;
}

function cardInstance(engine: CardBattleEngine, cardId: CardId): string {
  const card = engine.inspect().piles.hand.find((item) => item.cardId === cardId);
  assert.ok(card, `${cardId} must be in hand`);
  return card.instanceId;
}

function withPendingEvent(engine: CardBattleEngine, eventId: EventId): CardBattleEngine {
  const state = engine.inspect();
  state.pendingEventId = eventId;
  return CardBattleEngine.restore(state);
}

function observableSnapshot(state: CardBattleState): unknown {
  return {
    player: state.player,
    enemies: state.enemies,
    piles: state.piles,
    hitLog: state.hitLog,
    rareRewardBudget: state.rareRewardBudget,
    storyFlags: state.storyFlags,
    materials: state.materials,
  };
}

function testCatalogIsCompleteAndEveryDefinitionIsDistinct(): void {
  assert.equal(CARD_CATALOG.length, 36);
  assert.equal(new Set(CARD_CATALOG.map((card) => card.id)).size, 36);
  assert.equal(new Set(CARD_CATALOG.map((card) => card.effectId)).size, 36);
  assert.deepEqual(
    CARD_CATALOG.reduce<Record<string, number>>((counts, card) => {
      counts[card.type] = (counts[card.type] ?? 0) + 1;
      return counts;
    }, {}),
    { ATTACK: 12, DEFENSE: 8, SKILL: 8, FATE: 8 },
  );
  for (const card of CARD_CATALOG) {
    assert.ok(card.name.length > 0 && card.description.length > 0);
    assert.ok(Number.isInteger(card.cost) && card.cost >= 0);
    assert.ok(['COMMON', 'UNCOMMON', 'RARE'].includes(card.rarity));
    assert.notDeepEqual(card.upgrade, {}, `${card.id} needs an authoritative upgrade`);
  }
}

function testStarterDeckContainsFiveAttacksFourDefensesAndCareerCard(): void {
  const typeById = new Map(CARD_CATALOG.map((definition) => [definition.id, definition.type]));
  for (const professionId of ['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS'] as const) {
    const ids = createCardBattleState({ professionId }).piles.draw.map((instance) => instance.cardId);
    assert.equal(ids.length, 10);
    assert.equal(ids.filter((id) => id === 'ATK-01').length, 5);
    assert.equal(ids.filter((id) => id === 'DEF-01').length, 4);
    assert.equal(ids.filter((id) => id === STARTER_CLASS_CARD_BY_PROFESSION[professionId]).length, 1);
    assert.equal(typeById.get(STARTER_CLASS_CARD_BY_PROFESSION[professionId]),
      professionId === 'DEVOPS' ? 'DEFENSE' : professionId === 'QA' ? 'SKILL' : 'ATTACK');
  }
}

function testStartDrawEnergyAndIllegalPlayAreAuthoritative(): void {
  const first = engineFor(['ATK-01', 'DEF-01', 'SKL-03', 'SKL-05', 'FTE-01', 'ATK-02']);
  const second = engineFor(['ATK-01', 'DEF-01', 'SKL-03', 'SKL-05', 'FTE-01', 'ATK-02']);
  assert.deepEqual(first.inspect(), second.inspect(), 'same seed must replay exactly');
  const before = first.inspect();
  assert.equal(before.phase, 'PLAYER_ACTION');
  assert.equal(before.player.energy, 3);
  assert.equal(before.piles.hand.length, 5);
  const invalid = first.playCard('missing-instance', 'target-a');
  assert.equal(invalid.applied, false);
  assert.deepEqual(first.inspect(), before, 'illegal play is atomic');
}

function testRepresentativeCardBranchesMutateRealState(): void {
  let engine = engineFor(['ATK-02']);
  let before = engine.inspect();
  engine.playCard(cardInstance(engine, 'ATK-02'), 'target-a');
  let after = engine.inspect();
  assert.equal(before.enemies[0].hp - after.enemies[0].hp, 6);
  assert.equal(after.hitLog.length - before.hitLog.length, 2);

  engine = engineFor(['ATK-07', 'ATK-01']);
  engine.playCard(cardInstance(engine, 'ATK-07'));
  before = engine.inspect();
  engine.playCard(cardInstance(engine, 'ATK-01'), 'target-a');
  after = engine.inspect();
  assert.equal(before.enemies[0].hp - after.enemies[0].hp, 12);
  assert.equal(after.player.statuses.nextAttackCritical, 0);

  engine = engineFor(['ATK-04']);
  const low = engine.inspect();
  low.player.hp = 5;
  engine = CardBattleEngine.restore(low);
  before = engine.inspect();
  assert.equal(engine.playCard(cardInstance(engine, 'ATK-04'), 'target-a').applied, false);
  assert.deepEqual(engine.inspect(), before);

  engine = engineFor(['DEF-02']);
  const debuffed = engine.inspect();
  debuffed.player.statuses.poison = 2;
  engine = CardBattleEngine.restore(debuffed);
  engine.playCard(cardInstance(engine, 'DEF-02'));
  assert.equal(engine.inspect().player.statuses.poison, 0);
  assert.equal(engine.inspect().player.block, 5);

  engine = engineFor(['SKL-08']);
  engine.playCard(cardInstance(engine, 'SKL-08'));
  assert.equal(engine.inspect().player.maxEnergy, 4);
  assert.equal(engine.inspect().player.energy, 3, 'cost then immediate energy gain');

  engine = engineFor(['FTE-02']);
  before = engine.inspect();
  engine.playCard(cardInstance(engine, 'FTE-02'), 'target-a');
  after = engine.inspect();
  assert.equal(after.enemies[0].maxHp, before.enemies[0].maxHp + 6);
  assert.equal(after.enemies[0].attack, before.enemies[0].attack + 2);
  assert.equal(after.rareRewardBudget, before.rareRewardBudget + 1);
}

function testEveryCardHasAnObservableEffectAndUpgradeChangesIt(): void {
  for (const definition of CARD_CATALOG) {
    const base = engineFor([definition.id], 5000 + definition.id.charCodeAt(definition.id.length - 1));
    let state = base.inspect();
    state.player.hp = 70;
    state.player.will = 5;
    state.player.relationship = 50;
    state.player.energy = 20;
    state.player.maxEnergy = 20;
    state.enemies[0].hp = state.enemies[0].maxHp = 200;
    if (definition.id === 'ATK-05') state.enemies[0].statuses.weakness = 2;
    let preparedBase = CardBattleEngine.restore(state);
    if (definition.id === 'FTE-03') {
      preparedBase = withPendingEvent(preparedBase, 'EVT-06');
      preparedBase.chooseEvent('EVT-06', 'C');
    }
    const before = observableSnapshot(preparedBase.inspect());
    const receipt = preparedBase.playCard(cardInstance(preparedBase, definition.id), 'target-a');
    assert.equal(receipt.applied, true, `${definition.id} must be playable`);
    assert.notDeepEqual(observableSnapshot(preparedBase.inspect()), before, `${definition.id} must mutate state`);

    const upgraded = engineFor([definition.id], 5000 + definition.id.charCodeAt(definition.id.length - 1));
    state = upgraded.inspect();
    state.player.hp = 70;
    state.player.will = 5;
    state.player.relationship = 50;
    state.player.energy = 20;
    state.player.maxEnergy = 20;
    state.enemies[0].hp = state.enemies[0].maxHp = 200;
    if (definition.id === 'ATK-05') state.enemies[0].statuses.weakness = 2;
    state.piles.hand[0].upgraded = true;
    let preparedUpgrade = CardBattleEngine.restore(state);
    if (definition.id === 'FTE-03') {
      preparedUpgrade = withPendingEvent(preparedUpgrade, 'EVT-06');
      preparedUpgrade.chooseEvent('EVT-06', 'C');
    }
    preparedUpgrade.playCard(cardInstance(preparedUpgrade, definition.id), 'target-a');
    assert.notDeepEqual(observableSnapshot(preparedUpgrade.inspect()), observableSnapshot(preparedBase.inspect()), `${definition.id} upgrade must change its outcome`);
  }
}

function testFateRerollRequiresARecordedReversibleEvent(): void {
  let engine = engineFor(['FTE-03']);
  const before = engine.inspect();
  const rejected = engine.playCard(cardInstance(engine, 'FTE-03'));
  assert.equal(rejected.applied, false);
  assert.match(rejected.reason ?? '', /reversible event/i);
  assert.deepEqual(engine.inspect(), before, 'rejected reroll consumes no resource and writes no receipt');

  engine = withPendingEvent(engineFor(['FTE-03']), 'EVT-06');
  assert.equal(engine.chooseEvent('EVT-06', 'C').applied, true);
  const eventState = engine.inspect();
  const played = engine.playCard(cardInstance(engine, 'FTE-03'));
  assert.equal(played.applied, true);
  const after = engine.inspect();
  assert.equal(after.eventLog.length, eventState.eventLog.length + 1);
  const reroll = after.eventLog[after.eventLog.length - 1];
  assert.equal(reroll.choiceId, 'FTE-03');
  assert.ok(reroll.originalValue !== undefined);
  assert.ok(reroll.newValue !== undefined);
  assert.ok(reroll.newValue === 8 || reroll.newValue === -2, 'EVT-06 rerolls the same shield/poison outcome table');
  if (reroll.newValue === 8) {
    assert.equal(after.player.block, 8);
    assert.equal(after.player.statuses.poison ?? 0, 0);
  } else {
    assert.equal(after.player.block, 0);
    assert.equal(after.player.statuses.poison, 2);
  }
}

function testEventDrawIsDeterministicPersistentAndRequiredForChoice(): void {
  const first = engineFor(['ATK-01'], 91234);
  const second = engineFor(['ATK-01'], 91234);
  const left = first.drawEvent('milestone-1');
  const right = second.drawEvent('milestone-1');
  assert.equal(left.applied, true);
  assert.deepEqual(left, right);
  assert.equal(first.inspect().pendingEventId, second.inspect().pendingEventId);
  assert.ok(EVENT_CATALOG.some((event) => event.id === first.inspect().pendingEventId));
  assert.deepEqual(CardBattleEngine.restore(JSON.stringify(first.inspect())).inspect(), first.inspect());
  const frozen = first.inspect();
  assert.equal(first.drawEvent('milestone-2').applied, false);
  assert.deepEqual(first.inspect(), frozen);

  const noPending = engineFor(['ATK-01']);
  const before = noPending.inspect();
  assert.equal(noPending.chooseEvent('EVT-01', 'A').applied, false);
  assert.deepEqual(noPending.inspect(), before, 'choosing a non-pending event is atomic and writes no receipt');

  const wrongPending = withPendingEvent(engineFor(['ATK-01']), 'EVT-02');
  const wrongBefore = wrongPending.inspect();
  assert.equal(wrongPending.chooseEvent('EVT-01', 'A').applied, false);
  assert.deepEqual(wrongPending.inspect(), wrongBefore);
}

function testEndTurnRunsVisibleIntentAndPreservesCardConservation(): void {
  const engine = engineFor(['DEF-01', 'ATK-01', 'SKL-03', 'ATK-02', 'DEF-02', 'SKL-04']);
  const before = engine.inspect();
  const visible = before.enemies[0].intent;
  const count = Object.values(before.piles).reduce((sum, pile) => sum + pile.length, 0);
  engine.endTurn();
  const after = engine.inspect();
  assert.ok(after.actionLog.some((entry) => entry.intent === visible.kind));
  assert.equal(after.phase, 'PLAYER_ACTION');
  assert.equal(after.piles.hand.length, 5);
  assert.equal(Object.values(after.piles).reduce((sum, pile) => sum + pile.length, 0), count);
}

function testAllEventChoicesAreDistinctRecordedAndIdempotent(): void {
  assert.equal(EVENT_CATALOG.length, 12);
  assert.equal(new Set(EVENT_CATALOG.map((event) => event.id)).size, 12);
  for (const event of EVENT_CATALOG) {
    assert.equal(event.choices.length, 3);
    const outcomes: string[] = [];
    for (const choice of event.choices) {
      const engine = engineFor(['DEF-01', 'SKL-01', 'ATK-01', 'FTE-07'], 7000 + Number(event.id.slice(-2)));
      const prepared = engine.inspect();
      prepared.player.energy = 20;
      prepared.player.hp = 80;
      prepared.player.will = 20;
      prepared.player.relationship = 50;
      prepared.player.statuses.poison = 2;
      prepared.pendingEventId = event.id as EventId;
      let preparedEngine = CardBattleEngine.restore(prepared);
      if (event.id === 'EVT-12' && choice.id === 'A') {
        preparedEngine = withPendingEvent(preparedEngine, 'EVT-06');
        assert.equal(preparedEngine.chooseEvent('EVT-06', 'C').applied, true);
        preparedEngine = withPendingEvent(preparedEngine, 'EVT-12');
      }
      const receipt = preparedEngine.chooseEvent(event.id as EventId, choice.id);
      assert.equal(receipt.applied, true, `${event.id}/${choice.id}`);
      const after = preparedEngine.inspect();
      const eventRecord = after.eventLog[after.eventLog.length - 1];
      assert.equal(eventRecord?.eventId, event.id);
      assert.equal(eventRecord?.choiceId, choice.id);
      assert.ok(eventRecord?.seed !== undefined);
      assert.ok(eventRecord?.receiptId);
      const frozen = preparedEngine.inspect();
      assert.equal(preparedEngine.chooseEvent(event.id as EventId, choice.id).applied, false);
      assert.deepEqual(preparedEngine.inspect(), frozen, 'event result must not apply twice');
      outcomes.push(JSON.stringify(observableSnapshot(after)));
    }
    assert.equal(new Set(outcomes).size, 3, `${event.id} choices must have distinct outcomes`);
  }
}

function testBossPhasesVictoryDefeatAndRewardsSettleOnce(): void {
  let state = createCardBattleState({ seed: 11, encounterId: 'MUTANT_BUG_KING', deckCardIds: ['ATK-04', 'ATK-04'] });
  let engine = new CardBattleEngine(state);
  engine.start();
  state = engine.inspect();
  state.player.hp = 100;
  state.player.energy = 20;
  state.enemies[0].hp = 39;
  engine = CardBattleEngine.restore(state);
  engine.playCard(cardInstance(engine, 'ATK-04'), state.enemies[0].id);
  assert.equal(engine.inspect().enemies[0].phase, 2);
  assert.equal(engine.inspect().enemies[0].phaseTransitions, 1);
  engine.playCard(cardInstance(engine, 'ATK-04'), state.enemies[0].id);
  assert.equal(engine.inspect().phase, 'VICTORY');
  assert.equal(engine.inspect().settlement?.result, 'VICTORY');
  assert.ok(engine.inspect().rewards.length >= 3);
  const reward = engine.inspect().rewards[0];
  assert.equal(engine.chooseReward(reward.id).applied, true);
  const claimed = engine.claimRewards();
  assert.equal(claimed.applied, true);
  const frozen = engine.inspect();
  assert.equal(engine.claimRewards().applied, false);
  assert.deepEqual(engine.inspect(), frozen);

  state = createCardBattleState({ seed: 12, deckCardIds: ['ATK-01'] });
  state.player.hp = 1;
  engine = new CardBattleEngine(state);
  engine.start();
  engine.endTurn();
  assert.equal(engine.inspect().phase, 'DEFEAT');
}

function testNormalEnemyIntentRosterAndBothBossTransitions(): void {
  let state = createCardBattleState({
    seed: 21,
    deckCardIds: ['DEF-01'],
    player: { hp: 500, maxHp: 500 },
    enemies: [{ id: 'rotation', kind: 'WORK_BUG', name: '轮转 Bug', hp: 500, maxHp: 500, attack: 0 }],
  });
  let engine = new CardBattleEngine(state);
  engine.start();
  for (let turn = 0; turn < 10; turn += 1) engine.endTurn(`rotation-${turn}`);
  const intents = new Set(engine.inspect().actionLog.map((entry) => entry.intent).filter(Boolean));
  for (const expected of ['ATTACK', 'BLOCK', 'WEAKEN', 'POISON', 'LIFESTEAL', 'MUTATE', 'SPLIT', 'ENRAGE', 'SUMMON', 'CHARGE_ATTACK']) {
    assert.ok(intents.has(expected as never), `normal intent roster includes ${expected}`);
  }

  state = createCardBattleState({ seed: 22, encounterId: 'BLAME_MANAGER', deckCardIds: ['ATK-10', 'ATK-01'] });
  engine = new CardBattleEngine(state);
  engine.start();
  state = engine.inspect();
  state.enemies[0].hp = 61;
  state.enemies[0].block = 8;
  engine = CardBattleEngine.restore(state);
  engine.playCard(cardInstance(engine, 'ATK-10'), state.enemies[0].id);
  const manager = engine.inspect().enemies[0];
  assert.equal(manager.phase, 2);
  assert.equal(manager.phaseTransitions, 1);
  assert.equal(manager.block, 0);
  assert.equal(manager.intent.kind, 'DEFLECT');
}

function testNineLivesCanTriggerOnlyOncePerBattle(): void {
  let engine = new CardBattleEngine(createCardBattleState({ seed: 23, deckCardIds: ['DEF-08', 'DEF-08'] }));
  engine.start();
  engine.playCard(cardInstance(engine, 'DEF-08'));
  let state = engine.inspect();
  state.player.hp = 1;
  engine = CardBattleEngine.restore(state);
  engine.endTurn();
  assert.equal(engine.inspect().player.hp, 1);
  assert.equal(engine.inspect().player.statuses.nineLivesUsed, 1);
  const second = cardInstance(engine, 'DEF-08');
  const before = engine.inspect();
  assert.equal(engine.playCard(second).applied, false);
  assert.deepEqual(engine.inspect(), before);
}

function testUpgradeRemoveRestoreAndValidationAreSafeAndIdempotent(): void {
  const engine = engineFor(['ATK-01', 'DEF-01', 'SKL-01', 'FTE-01', 'ATK-02']);
  const instanceId = cardInstance(engine, 'ATK-01');
  assert.equal(engine.upgradeCard(instanceId).applied, true);
  const upgraded = engine.inspect();
  assert.equal(upgraded.piles.hand.find((card) => card.instanceId === instanceId)?.upgraded, true);
  assert.equal(engine.upgradeCard(instanceId).applied, false);
  assert.equal(engine.removeCard(instanceId).applied, true);
  const removed = engine.inspect();
  assert.ok(removed.piles.removed.some((card) => card.instanceId === instanceId));
  assert.equal(engine.removeCard(instanceId).applied, false);

  const serialized = JSON.stringify(removed);
  const restored = CardBattleEngine.restore(JSON.parse(serialized));
  assert.deepEqual(restored.inspect(), removed);
  assert.deepEqual(validateCardBattleState(restored.inspect()), []);

  const corrupted = restored.inspect();
  corrupted.piles.discard.push(corrupted.piles.removed[0]);
  assert.ok(validateCardBattleState(corrupted).some((error) => /duplicate/i.test(error)));
  assert.throws(() => CardBattleEngine.restore(corrupted), /invalid card battle state/i);
}

testCatalogIsCompleteAndEveryDefinitionIsDistinct();
testStarterDeckContainsFiveAttacksFourDefensesAndCareerCard();
testStartDrawEnergyAndIllegalPlayAreAuthoritative();
testRepresentativeCardBranchesMutateRealState();
testEveryCardHasAnObservableEffectAndUpgradeChangesIt();
testFateRerollRequiresARecordedReversibleEvent();
testEventDrawIsDeterministicPersistentAndRequiredForChoice();
testEndTurnRunsVisibleIntentAndPreservesCardConservation();
testAllEventChoicesAreDistinctRecordedAndIdempotent();
testBossPhasesVictoryDefeatAndRewardsSettleOnce();
testNormalEnemyIntentRosterAndBothBossTransitions();
testNineLivesCanTriggerOnlyOncePerBattle();
testUpgradeRemoveRestoreAndValidationAreSafeAndIdempotent();

console.log('V5.9-L authoritative card battle engine tests passed');
