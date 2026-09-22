import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { selectNextPresentation, type PresentationCandidate } from '../../assets/scripts/v2/v2-event-service';

const START = 1_000;
const S1_EVENT_ID = 'wp_incident_boss_random';
const NORMAL_EVENT_ID = 'incident_s2';

function testProtectedS1RemainsCanonicalButIsNotPresentedForFiveMinutes(): void {
  const clock = new FakeClock(START);
  const player = new PlayerData({
    tutorialStartedAt: START,
    pendingEvents: [
      { uid: 'pending-normal', eventId: NORMAL_EVENT_ID, occurredAt: START, priority: 'NORMAL' },
      { uid: 'pending-s1', eventId: S1_EVENT_ID, occurredAt: START + 1, priority: 'CRITICAL' },
    ],
  });
  const context = new GameContext({ player, clock, board: null });

  assert.equal(context.v2Events.currentEvent()?.id, NORMAL_EVENT_ID, 'a protected S1 must not block a lower presentable item');
  assert.deepEqual(context.player.pendingEvents.map((event) => event.uid), ['pending-normal', 'pending-s1'], 'presentation filtering must not mutate canonical pending storage');

  clock.advance(299_999);
  assert.equal(context.v2Events.currentEvent()?.id, NORMAL_EVENT_ID);
  clock.advance(1);
  assert.equal(context.v2Events.currentEvent()?.id, S1_EVENT_ID, 'the persisted half-open five-minute window ends exactly at 300 seconds');
}

function testDevForceTriggerBypassesFirstDayProtection(): void {
  const clock = new FakeClock(START);
  const context = new GameContext({ player: new PlayerData({ tutorialStartedAt: START }), clock, board: null });
  assert.equal(context.v2Events.forceTrigger(S1_EVENT_ID), true);
  assert.equal(context.v2Events.currentEvent()?.id, S1_EVENT_ID, 'explicit DEV event paths remain available for testing');
}

function testCanonicalS1IncidentHasAProtectedPresentationProjection(): void {
  const clock = new FakeClock(START);
  const player = new PlayerData({
    tutorialStartedAt: START,
    incidents: [{
      id: 'inc-s1', type: 'PAYMENT_FAILURE', severity: 'S1', dayIndex: 1, createdAt: START,
      status: 'DETECTED', forcedRelease: false, riskConfirmed: false, mitigationSeconds: 0,
    }],
  });
  const context = new GameContext({ player, clock, board: null });

  assert.equal(context.incidents.active()?.id, 'inc-s1', 'canonical incident storage remains unchanged');
  assert.equal(context.incidents.presentableActive(), null, 'presentation withholds S1 inside the first five minutes');
  clock.advance(300_000);
  assert.equal(context.incidents.presentableActive()?.id, 'inc-s1');
}

function testExistingPresentationPrioritySelectsOneWithoutDroppingLowerItems(): void {
  const candidates: PresentationCandidate[] = [
    { id: 'info', kind: 'INFO' },
    { id: 'daily', kind: 'DAILY' },
    { id: 'workplace', kind: 'WORKPLACE' },
    { id: 'tutorial', kind: 'TUTORIAL_CRITICAL' },
    { id: 'promotion', kind: 'PROMOTION' },
    { id: 'pending', kind: 'PENDING' },
    { id: 's1', kind: 'S1' },
  ];
  const expected = ['s1', 'pending', 'promotion', 'tutorial', 'workplace', 'daily', 'info'];
  const retained = [...candidates];

  for (const id of expected) {
    assert.equal(selectNextPresentation(retained)?.id, id);
    const index = retained.findIndex((candidate) => candidate.id === id);
    retained.splice(index, 1); // existing owner consumes only the selected record
  }
  assert.deepEqual(candidates.map((candidate) => candidate.id), ['info', 'daily', 'workplace', 'tutorial', 'promotion', 'pending', 's1'], 'selector is a projection, not a second queue');
}

testProtectedS1RemainsCanonicalButIsNotPresentedForFiveMinutes();
testDevForceTriggerBypassesFirstDayProtection();
testCanonicalS1IncidentHasAProtectedPresentationProjection();
testExistingPresentationPrioritySelectsOneWithoutDroppingLowerItems();
console.log('v4.1 first-day protection tests passed');
