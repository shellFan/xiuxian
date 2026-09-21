import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import type { OfflineDecisionSession, PendingEventState } from '../../assets/scripts/model/save-data';
import { SaveService, DEFAULT_SAVE_KEY } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

const PENDING_EVENTS: readonly PendingEventState[] = [
  { uid: 'pending-s1', eventId: 'incident-s1', occurredAt: 100, priority: 'CRITICAL' },
  { uid: 'pending-task', eventId: 'task-choice', occurredAt: 200, priority: 'IMPORTANT' },
];

function pendingSession(): OfflineDecisionSession {
  return {
    settlementId: 'offline-session-1',
    pendingEventIds: ['pending-s1', 'pending-task'],
    cursor: 1,
    resolvedEventIds: ['pending-s1'],
    status: 'PENDING',
  };
}

function testDecisionSessionRoundTripsAcrossRestart(): void {
  const storage = new MemoryStorageAdapter();
  const service = new SaveService(storage, DEFAULT_SAVE_KEY, () => 300);
  service.save(new PlayerData({
    pendingEvents: PENDING_EVENTS,
    offlineDecisionSession: pendingSession(),
  }));

  const loaded = new SaveService(storage).load();
  assert.deepEqual(loaded.offlineDecisionSession, pendingSession());
  const restarted = new PlayerData(loaded);
  assert.deepEqual(restarted.offlineDecisionSession, pendingSession());
  assert.deepEqual(restarted.pendingEvents, PENDING_EVENTS);

  restarted.offlineDecisionSession!.cursor = 2;
  restarted.offlineDecisionSession!.resolvedEventIds.push('pending-task');
  restarted.offlineDecisionSession!.status = 'COMPLETED';
  service.save(restarted);

  assert.deepEqual(new SaveService(storage).load().offlineDecisionSession, {
    settlementId: 'offline-session-1',
    pendingEventIds: ['pending-s1', 'pending-task'],
    cursor: 2,
    resolvedEventIds: ['pending-s1', 'pending-task'],
    status: 'COMPLETED',
  });
}

function testSessionSnapshotsAreDeeplyIsolated(): void {
  const source = pendingSession();
  const player = new PlayerData({ offlineDecisionSession: source });
  source.pendingEventIds.push('source-only');
  source.resolvedEventIds.push('source-only');
  assert.deepEqual(player.offlineDecisionSession, pendingSession());

  const snapshot = player.toSaveData();
  snapshot.offlineDecisionSession!.pendingEventIds.push('snapshot-only');
  snapshot.offlineDecisionSession!.resolvedEventIds.push('snapshot-only');
  assert.deepEqual(player.offlineDecisionSession, pendingSession());
}

function testMigrationRetainsOnlyStableIdsAndDropsEventCopies(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify({
    saveVersion: 8,
    pendingEvents: PENDING_EVENTS,
    offlineDecisionSession: {
      settlementId: 'offline-session-2',
      pendingEventIds: ['pending-s1', 'pending-s1', 42, 'pending-task'],
      cursor: 1,
      resolvedEventIds: ['pending-s1', null, 'pending-s1'],
      status: 'PENDING',
      pendingEvents: PENDING_EVENTS,
      rewards: { salary: 999999 },
    },
  }));

  const session = new SaveService(storage).load().offlineDecisionSession;
  assert.deepEqual(session, {
    settlementId: 'offline-session-2',
    pendingEventIds: ['pending-s1', 'pending-task'],
    cursor: 1,
    resolvedEventIds: ['pending-s1'],
    status: 'PENDING',
  });
  assert.deepEqual(Object.keys(session!).sort(), [
    'cursor', 'pendingEventIds', 'resolvedEventIds', 'settlementId', 'status',
  ]);
}

function testMissingOrInvalidSessionDefaultsToNull(): void {
  for (const offlineDecisionSession of [
    undefined,
    {},
    { settlementId: '', pendingEventIds: [], cursor: 0, resolvedEventIds: [], status: 'PENDING' },
    { settlementId: 'id', pendingEventIds: [], cursor: -1, resolvedEventIds: [], status: 'PENDING' },
    { settlementId: 'id', pendingEventIds: [], cursor: 0, resolvedEventIds: [], status: 'INVALID' },
  ]) {
    const storage = new MemoryStorageAdapter();
    storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify({ saveVersion: 8, offlineDecisionSession }));
    assert.equal(new SaveService(storage).load().offlineDecisionSession, null);
  }
  assert.equal(new PlayerData().offlineDecisionSession, null);
}

function testAcceptedActionPersistsAndResumesAtNextCursor(): void {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(400);
  const saveService = new SaveService(storage, DEFAULT_SAVE_KEY, clock);
  const first = new GameContext({
    player: new PlayerData({ pendingEvents: PENDING_EVENTS, lastSaveTime: 300 }),
    saveService,
    clock,
    board: null,
  });
  first.autoPolicy.prepareOfflineDecisionSession();

  assert.deepEqual(first.autoPolicy.performOfflineDecision('pending-s1'), { success: true, duplicate: false });
  assert.deepEqual(first.player.pendingEvents.map((event) => event.uid), ['pending-task']);
  assert.deepEqual(first.player.offlineDecisionSession, {
    settlementId: 'offline-8c',
    pendingEventIds: ['pending-s1', 'pending-task'],
    cursor: 1,
    resolvedEventIds: ['pending-s1'],
    status: 'PENDING',
  });

  const restarted = new GameContext({ storage, clock, board: null });
  const resumed = restarted.autoPolicy.prepareOfflineDecisionSession();
  assert.equal(resumed.current?.id, 'pending-task');
  assert.equal(resumed.session?.cursor, 1);
  assert.deepEqual(restarted.autoPolicy.performOfflineDecision('pending-s1'), { success: true, duplicate: true });
}

function testStaleIdIsRejectedAndFinalDecisionCompletes(): void {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(500);
  const context = new GameContext({
    player: new PlayerData({ pendingEvents: PENDING_EVENTS, lastSaveTime: 300 }),
    saveService: new SaveService(storage, DEFAULT_SAVE_KEY, clock),
    clock,
    board: null,
  });
  context.autoPolicy.prepareOfflineDecisionSession();
  const before = context.player.toSaveData();

  assert.deepEqual(context.autoPolicy.performOfflineDecision('pending-task'), { success: false, reason: 'STALE' });
  assert.deepEqual(context.player.toSaveData(), before);
  assert.deepEqual(context.autoPolicy.performOfflineDecision('pending-s1'), { success: true, duplicate: false });
  assert.deepEqual(context.autoPolicy.performOfflineDecision('pending-task'), { success: true, duplicate: false });
  assert.equal(context.player.offlineDecisionSession?.status, 'COMPLETED');
  assert.equal(context.player.offlineDecisionSession?.cursor, 2);
  assert.deepEqual(context.player.pendingEvents, []);
  assert.equal(context.autoPolicy.prepareOfflineDecisionSession().current, null);
}

function testHandledS1DoesNotRequeueAfterWelcomeHistoryChurnAndRestart(): void {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(600);
  const saveService = new SaveService(storage, DEFAULT_SAVE_KEY, clock);
  const first = new GameContext({
    player: new PlayerData({
      lastSaveTime: 500,
      incidents: [{
        id: 'durable-s1',
        type: 'PAYMENT_FAILURE',
        severity: 'S1',
        dayIndex: 1,
        createdAt: 550,
        status: 'DETECTED',
        forcedRelease: false,
        riskConfirmed: false,
        mitigationSeconds: 0,
      }],
    }),
    saveService,
    clock,
    board: null,
  });
  first.autoPolicy.prepareOfflineDecisionSession();
  assert.deepEqual(first.autoPolicy.performOfflineDecision('offline:incident:durable-s1'), { success: true, duplicate: false });
  assert.equal(first.player.incidents[0].status, 'MITIGATING');

  first.player.handledWelcomeItemIds = Array.from({ length: 101 }, (_, index) => `unrelated-welcome-${index}`);
  saveService.save(first.player);
  assert.equal(first.player.handledWelcomeItemIds.includes('offline:incident:durable-s1'), false);

  const restarted = new GameContext({ storage, clock, board: null });
  const resumed = restarted.autoPolicy.prepareOfflineDecisionSession();

  assert.equal(resumed.session, null, 'zero elapsed restart must not expose a new or stale decision session');
  assert.equal(resumed.current, null);
  assert.deepEqual(restarted.player.pendingEvents, []);
  assert.equal(restarted.player.handledWelcomeItemIds.includes('offline:incident:durable-s1'), false);
  assert.equal(
    restarted.player.eventFlags['offlineDecisionHandled:offline:incident:durable-s1'],
    true,
    'accepted identity remains durable independently of settlement/session history',
  );
}

const tests = [
  testDecisionSessionRoundTripsAcrossRestart,
  testSessionSnapshotsAreDeeplyIsolated,
  testMigrationRetainsOnlyStableIdsAndDropsEventCopies,
  testMissingOrInvalidSessionDefaultsToNull,
  testAcceptedActionPersistsAndResumesAtNextCursor,
  testStaleIdIsRejectedAndFinalDecisionCompletes,
  testHandledS1DoesNotRequeueAfterWelcomeHistoryChurnAndRestart,
];

for (const test of tests) {
  test();
  console.log(`ok - ${test.name}`);
}

console.log('offline resume contract tests passed');
