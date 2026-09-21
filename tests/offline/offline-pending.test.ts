import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { FakeClock } from '../../assets/scripts/core/clock';
import { PlayerData } from '../../assets/scripts/model/player-data';
import type { AssignedTaskState, IncidentState, PendingEventState } from '../../assets/scripts/model/save-data';
import { DEFAULT_SAVE_KEY, SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

const NOW = 1_800_000_000_000;

function incident(id: string, severity: IncidentState['severity'], createdAt: number): IncidentState {
  return {
    id,
    type: 'PAYMENT_FAILURE',
    severity,
    dayIndex: 1,
    createdAt,
    status: 'DETECTED',
    forcedRelease: false,
    riskConfirmed: false,
    mitigationSeconds: 0,
  };
}

function task(id: string, priority: AssignedTaskState['priority'], createdAt: number): AssignedTaskState {
  return {
    id,
    title: id,
    priority,
    source: 'SYSTEM',
    createdDay: 1,
    createdAt,
    status: 'OPEN',
    rewardSalary: 0,
    rewardPerformance: 0,
    rewardCultivation: 0,
    rewardMind: 0,
    isFakeP0: false,
  };
}

function pending(uid: string, priority: PendingEventState['priority'], occurredAt: number): PendingEventState {
  return { uid, eventId: `event-${uid}`, priority, occurredAt };
}

function make(options: ConstructorParameters<typeof PlayerData>[0] = {}): GameContext {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(NOW);
  return new GameContext({
    player: new PlayerData({ lastSaveTime: NOW - 60_000, ...options }),
    saveService: new SaveService(storage, DEFAULT_SAVE_KEY, clock),
    clock,
    board: null,
  });
}

function testHighRiskOfflineWorkUsesCanonicalPendingEvents(): void {
  const context = make({
    incidents: [incident('s1-prod', 'S1', 200), incident('s3-prod', 'S3', 100)],
    assignedTasks: [task('p0-task', 'P0', 300), task('p2-task', 'P2', 50)],
  });

  const presentation = context.autoPolicy.prepareOfflineDecisionSession();

  assert.deepEqual(context.player.pendingEvents.map((event) => event.uid), [
    'offline:incident:s1-prod',
    'offline:task:p0-task',
  ]);
  assert.deepEqual(presentation.session?.pendingEventIds, [
    'offline:incident:s1-prod',
    'offline:task:p0-task',
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(presentation.session!, 'pendingEvents'), false, 'session must never copy event payloads');
  assert.equal(context.autoPolicy.prepareOfflineDecisionSession().session?.pendingEventIds.length, 2, 'routing is idempotent');
  assert.equal(
    context.autoPolicy.prepareWelcome().items.some((item) => item.entityId === 's1-prod' || item.entityId === 'p0-task'),
    false,
    'canonical high-risk decisions must not also appear in the legacy welcome queue',
  );
}

function testS1GetsMinimumMitigationWithoutBeingAutoResolved(): void {
  const context = make({ incidents: [incident('critical', 'S1', 100)] });

  context.autoPolicy.prepareOfflineDecisionSession();

  const s1 = context.player.incidents[0];
  assert.equal(s1.status, 'MITIGATING');
  assert.equal(s1.mitigationSeconds, 1);
  assert.equal(context.player.pendingEvents.some((event) => event.uid === 'offline:incident:critical'), true);
  assert.equal(context.player.offlineDecisionSession?.resolvedEventIds.length, 0);

  assert.deepEqual(context.autoPolicy.performOfflineDecision('offline:incident:critical'), { success: true, duplicate: false });
  const completed = context.autoPolicy.prepareOfflineDecisionSession();
  assert.equal(completed.session?.status, 'COMPLETED', 'same settlement must not reopen an accepted S1 decision');
  assert.deepEqual(context.player.pendingEvents, []);
}

function testStableOrderingAndTwelveItemPresentationCap(): void {
  const events: PendingEventState[] = [
    pending('normal-overflow', 'NORMAL', 1),
    pending('important-b', 'IMPORTANT', 20),
    pending('critical-late', 'CRITICAL', 30),
    pending('critical-a', 'CRITICAL', 10),
    pending('critical-b', 'CRITICAL', 10),
    pending('important-a', 'IMPORTANT', 5),
    ...Array.from({ length: 7 }, (_, index) => pending(`normal-${index}`, 'NORMAL', index + 2)),
  ];
  const context = make({ pendingEvents: events });

  const presentation = context.autoPolicy.prepareOfflineDecisionSession();

  assert.deepEqual(presentation.session?.pendingEventIds.slice(0, 6), [
    'critical-a', 'critical-b', 'critical-late', 'important-a', 'important-b', 'normal-overflow',
  ]);
  assert.equal(presentation.items.length, 12);
  assert.equal(presentation.session?.pendingEventIds.length, 13, 'canonical session retains every decision ID');
  assert.deepEqual(presentation.overflowSummary, { total: 1, byPriority: { NORMAL: 1 } });
  assert.equal(context.player.pendingEvents.length, 13, 'presentation cap must not truncate canonical storage');
  assert.equal(presentation.items.some((item) => item.priority === 'CRITICAL'), true);
}

function testEveryS1PreemptsLowerRiskItemsInsidePresentationCap(): void {
  const earlyP0s = Array.from({ length: 12 }, (_, index) => task(`early-p0-${index}`, 'P0', index + 1));
  const context = make({
    assignedTasks: earlyP0s,
    incidents: [incident('later-s1', 'S1', 100)],
  });

  const presentation = context.autoPolicy.prepareOfflineDecisionSession();

  assert.equal(presentation.items.length, 12);
  assert.equal(presentation.items.some((item) => item.id === 'offline:incident:later-s1'), true);
  assert.equal(presentation.session?.pendingEventIds[0], 'offline:incident:later-s1');
  assert.deepEqual(presentation.overflowSummary, { total: 1, byPriority: { CRITICAL: 1 } });
  assert.equal(context.player.pendingEvents.length, 13, 'overflow must remain canonical and unresolved');
}

function testLaterS1JoinsExistingCappedSessionAndDisplacesP0(): void {
  const context = make({
    assignedTasks: Array.from({ length: 12 }, (_, index) => task(`existing-p0-${index}`, 'P0', index + 1)),
  });
  const initial = context.autoPolicy.prepareOfflineDecisionSession();
  assert.equal(initial.items.length, 12);
  assert.equal(initial.items.some((item) => item.eventId.startsWith('incident:')), false);

  context.player.incidents.push(incident('later-unresolved-s1', 'S1', 100));
  const updated = context.autoPolicy.prepareOfflineDecisionSession();

  assert.equal(updated.items.length, 12);
  assert.equal(updated.items.some((item) => item.id === 'offline:incident:later-unresolved-s1'), true);
  assert.equal(updated.session?.pendingEventIds[0], 'offline:incident:later-unresolved-s1');
  assert.deepEqual(updated.overflowSummary, { total: 1, byPriority: { CRITICAL: 1 } });
  assert.equal(context.player.pendingEvents.length, 13, 'displaced P0 remains canonical and unresolved');
}

function testS1OverflowUsesOneDeterministicSummaryBeyondTwelveRows(): void {
  const incidents = Array.from({ length: 13 }, (_, index) => incident(`s1-${index}`, 'S1', index + 1));
  const context = make({ incidents });

  const presentation = context.autoPolicy.prepareOfflineDecisionSession();

  assert.equal(presentation.items.length, 12, 'presentation must never render more than twelve event rows');
  assert.equal(presentation.items.every((item) => item.eventId.startsWith('incident:')), true);
  assert.equal(presentation.session?.pendingEventIds.length, 13, 'ID-only session retains actionable ordering');
  assert.deepEqual(presentation.overflowSummary, {
    total: 1,
    byPriority: {},
    s1: {
      total: 1,
      pendingEventIds: ['offline:incident:s1-12'],
      nextPendingEventId: 'offline:incident:s1-12',
    },
  });
  assert.equal(context.player.pendingEvents.length, 13, 'S1 overflow remains canonical and unresolved');
}

const tests = [
  testHighRiskOfflineWorkUsesCanonicalPendingEvents,
  testS1GetsMinimumMitigationWithoutBeingAutoResolved,
  testStableOrderingAndTwelveItemPresentationCap,
  testEveryS1PreemptsLowerRiskItemsInsidePresentationCap,
  testLaterS1JoinsExistingCappedSessionAndDisplacesP0,
  testS1OverflowUsesOneDeterministicSummaryBeyondTwelveRows,
];

for (const test of tests) {
  test();
  console.log(`ok - ${test.name}`);
}

console.log('offline pending decision tests passed');
