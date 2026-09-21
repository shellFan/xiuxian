import assert from 'node:assert/strict';

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

const tests = [
  testDecisionSessionRoundTripsAcrossRestart,
  testSessionSnapshotsAreDeeplyIsolated,
  testMigrationRetainsOnlyStableIdsAndDropsEventCopies,
  testMissingOrInvalidSessionDefaultsToNull,
];

for (const test of tests) {
  test();
  console.log(`ok - ${test.name}`);
}

console.log('offline resume contract tests passed');
