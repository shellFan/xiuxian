/**
 * ModalManager tests — verify modal queue lifecycle.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModalManager, type ModalRequest, type ActiveModal } from '../../assets/scripts/ui/modal-manager';

function createRequest(overrides: Partial<ModalRequest> = {}): ModalRequest {
  return {
    entityId: `entity-${Math.random().toString(36).slice(2, 8)}`,
    type: 'OFFICE_EVENT',
    ...overrides,
  };
}

// ── Basic Queue ─────────────────────────────────────────────────────────────

test('ModalManager: enqueue opens modal immediately when no active', () => {
  const mgr = new ModalManager();
  mgr.enqueue(createRequest({ entityId: 'event-1' }));

  const active = mgr.getActive();
  assert.ok(active);
  assert.equal(active!.request.entityId, 'event-1');
  assert.equal(active!.state, 'OPEN');
  mgr.dispose();
});

test('ModalManager: second enqueue queues behind active', () => {
  const mgr = new ModalManager();
  mgr.enqueue(createRequest({ entityId: 'event-1' }));
  mgr.enqueue(createRequest({ entityId: 'event-2' }));

  assert.equal(mgr.getActive()!.request.entityId, 'event-1');
  assert.equal(mgr.getQueueSize(), 1);
  mgr.dispose();
});

test('ModalManager: close opens next queued modal', () => {
  const mgr = new ModalManager();
  mgr.enqueue(createRequest({ entityId: 'event-1' }));
  mgr.enqueue(createRequest({ entityId: 'event-2' }));

  mgr.close();
  assert.equal(mgr.getActive()!.request.entityId, 'event-2');
  assert.equal(mgr.getQueueSize(), 0);
  mgr.dispose();
});

// ── De-duplication ──────────────────────────────────────────────────────────

test('ModalManager: de-duplicates by entityId', () => {
  const mgr = new ModalManager();
  mgr.enqueue(createRequest({ entityId: 'event-1' }));
  mgr.enqueue(createRequest({ entityId: 'event-1' })); // duplicate

  assert.equal(mgr.getActive()!.request.entityId, 'event-1');
  assert.equal(mgr.getQueueSize(), 0);
  mgr.dispose();
});

test('ModalManager: after close, same entityId can re-enter', () => {
  const mgr = new ModalManager();
  mgr.enqueue(createRequest({ entityId: 'event-1' }));
  mgr.close();

  mgr.enqueue(createRequest({ entityId: 'event-1' }));
  assert.equal(mgr.getActive()!.request.entityId, 'event-1');
  mgr.dispose();
});

// ── Queue Size Limit ────────────────────────────────────────────────────────

test('ModalManager: max queue size is 3', () => {
  const mgr = new ModalManager();
  mgr.enqueue(createRequest({ entityId: 'a' }));
  // active = a, queue empty

  mgr.enqueue(createRequest({ entityId: 'b' }));
  mgr.enqueue(createRequest({ entityId: 'c' }));
  mgr.enqueue(createRequest({ entityId: 'd' }));
  // queue = [b, c, d], size = 3

  mgr.enqueue(createRequest({ entityId: 'e' })); // dropped
  assert.equal(mgr.getQueueSize(), 3);
  mgr.dispose();
});

// ── Submit / Complete ───────────────────────────────────────────────────────

test('ModalManager: submit transitions to SUBMITTING', () => {
  const mgr = new ModalManager();
  mgr.enqueue(createRequest({ entityId: 'event-1' }));

  mgr.submit();
  assert.equal(mgr.getActive()!.state, 'SUBMITTING');
  mgr.dispose();
});

test('ModalManager: cannot close while SUBMITTING', () => {
  const mgr = new ModalManager();
  mgr.enqueue(createRequest({ entityId: 'event-1' }));
  mgr.enqueue(createRequest({ entityId: 'event-2' }));

  mgr.submit();
  mgr.close(); // should be no-op
  assert.equal(mgr.getActive()!.request.entityId, 'event-1');
  assert.equal(mgr.getActive()!.state, 'SUBMITTING');
  mgr.dispose();
});

test('ModalManager: complete transitions from SUBMITTING to next', () => {
  const mgr = new ModalManager();
  mgr.enqueue(createRequest({ entityId: 'event-1' }));
  mgr.enqueue(createRequest({ entityId: 'event-2' }));

  mgr.submit();
  mgr.complete();
  assert.equal(mgr.getActive()!.request.entityId, 'event-2');
  assert.equal(mgr.getActive()!.state, 'OPEN');
  mgr.dispose();
});

// ── Dismiss ─────────────────────────────────────────────────────────────────

test('ModalManager: dismiss closes dismissible modal', () => {
  const mgr = new ModalManager();
  mgr.enqueue(createRequest({ entityId: 'event-1', dismissible: true }));
  mgr.enqueue(createRequest({ entityId: 'event-2' }));

  mgr.dismiss();
  assert.equal(mgr.getActive()!.request.entityId, 'event-2');
  mgr.dispose();
});

test('ModalManager: dismiss does nothing for non-dismissible modal', () => {
  const mgr = new ModalManager();
  mgr.enqueue(createRequest({ entityId: 'event-1', dismissible: false }));

  mgr.dismiss();
  assert.equal(mgr.getActive()!.request.entityId, 'event-1');
  mgr.dispose();
});

// ── Priority ────────────────────────────────────────────────────────────────

test('ModalManager: higher priority jumps queue', () => {
  const mgr = new ModalManager();
  mgr.enqueue(createRequest({ entityId: 'a', priority: 0 }));
  mgr.enqueue(createRequest({ entityId: 'b', priority: 0 }));
  mgr.enqueue(createRequest({ entityId: 'urgent', priority: 100 }));

  // Queue should be [urgent, b] (a is active)
  mgr.close(); // close a
  assert.equal(mgr.getActive()!.request.entityId, 'urgent');
  mgr.dispose();
});

// ── Listener ────────────────────────────────────────────────────────────────

test('ModalManager: onStateChange fires on enqueue and close', () => {
  const mgr = new ModalManager();
  const states: Array<ActiveModal | null> = [];

  mgr.onStateChange((active) => {
    states.push(active);
  });

  mgr.enqueue(createRequest({ entityId: 'event-1' }));
  mgr.close();

  assert.equal(states.length, 2);
  assert.ok(states[0]); // active after enqueue
  assert.equal(states[1], null); // null after close
  mgr.dispose();
});

// ── Dispose ─────────────────────────────────────────────────────────────────

test('ModalManager: dispose clears everything', () => {
  const mgr = new ModalManager();
  mgr.enqueue(createRequest({ entityId: 'event-1' }));
  mgr.enqueue(createRequest({ entityId: 'event-2' }));

  mgr.dispose();
  assert.equal(mgr.getActive(), null);
  assert.equal(mgr.getQueueSize(), 0);
});

test('ModalManager: enqueue after dispose is no-op', () => {
  const mgr = new ModalManager();
  mgr.dispose();

  mgr.enqueue(createRequest({ entityId: 'event-1' }));
  assert.equal(mgr.getActive(), null);
});