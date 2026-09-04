/**
 * ToastManager tests — verify toast queue, merge, and lifecycle.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToastManager, type ToastEntry } from '../../assets/scripts/ui/toast-manager';

// ── Basic Show ──────────────────────────────────────────────────────────────

test('ToastManager: show makes toast active immediately', () => {
  const mgr = new ToastManager();
  mgr.show('Hello', 'INFO');

  const active = mgr.getActive();
  assert.ok(active);
  assert.equal(active!.message, 'Hello');
  assert.equal(active!.level, 'INFO');
  mgr.dispose();
});

test('ToastManager: second show queues behind active', () => {
  const mgr = new ToastManager({ defaultDurationMs: 60000 }); // long duration
  mgr.show('First', 'INFO');
  mgr.show('Second', 'INFO');

  assert.equal(mgr.getActive()!.message, 'First');
  assert.equal(mgr.getQueueSize(), 1);
  mgr.dispose();
});

// ── Merge / De-duplication ──────────────────────────────────────────────────

test('ToastManager: identical messages within cooldown are merged', () => {
  const mgr = new ToastManager({ mergeCooldownMs: 5000 });
  mgr.show('Same message', 'INFO');
  mgr.show('Same message', 'INFO'); // merged

  assert.equal(mgr.getQueueSize(), 0);
  assert.equal(mgr.getActive()!.message, 'Same message');
  mgr.dispose();
});

test('ToastManager: different messages are not merged', () => {
  const mgr = new ToastManager({ defaultDurationMs: 60000 });
  mgr.show('Message A', 'INFO');
  mgr.show('Message B', 'INFO');

  assert.equal(mgr.getQueueSize(), 1);
  mgr.dispose();
});

// ── Queue Size Limit ────────────────────────────────────────────────────────

test('ToastManager: max queue size is 3', () => {
  const mgr = new ToastManager({ defaultDurationMs: 60000, maxQueueSize: 3 });
  mgr.show('A', 'INFO');
  mgr.show('B', 'INFO');
  mgr.show('C', 'INFO');
  mgr.show('D', 'INFO');
  mgr.show('E', 'INFO'); // dropped

  assert.equal(mgr.getQueueSize(), 3); // max 3 in queue
  mgr.dispose();
});

// ── Dismiss ─────────────────────────────────────────────────────────────────

test('ToastManager: dismiss clears active and shows next', () => {
  const mgr = new ToastManager({ defaultDurationMs: 60000 });
  mgr.show('First', 'INFO');
  mgr.show('Second', 'INFO');

  mgr.dismiss();
  assert.equal(mgr.getActive()!.message, 'Second');
  mgr.dispose();
});

test('ToastManager: dismiss with empty queue leaves no active', () => {
  const mgr = new ToastManager();
  mgr.show('Only', 'INFO');

  mgr.dismiss();
  assert.equal(mgr.getActive(), null);
  mgr.dispose();
});

// ── Auto-dismiss ────────────────────────────────────────────────────────────

test('ToastManager: auto-dismisses after duration', (t, done) => {
  const mgr = new ToastManager({ defaultDurationMs: 50 });
  const states: Array<ToastEntry | null> = [];

  mgr.onStateChange((active) => {
    states.push(active);
  });

  mgr.show('Quick', 'INFO');

  setTimeout(() => {
    assert.equal(mgr.getActive(), null);
    mgr.dispose();
    done();
  }, 150);
});

// ── Levels ──────────────────────────────────────────────────────────────────

test('ToastManager: supports all levels', () => {
  const mgr = new ToastManager({ defaultDurationMs: 60000 });
  mgr.show('Info', 'INFO');
  assert.equal(mgr.getActive()!.level, 'INFO');

  mgr.dismiss();
  mgr.show('Success', 'SUCCESS');
  assert.equal(mgr.getActive()!.level, 'SUCCESS');

  mgr.dismiss();
  mgr.show('Warning', 'WARNING');
  assert.equal(mgr.getActive()!.level, 'WARNING');

  mgr.dismiss();
  mgr.show('Error', 'ERROR');
  assert.equal(mgr.getActive()!.level, 'ERROR');
  mgr.dispose();
});

// ── Dispose ─────────────────────────────────────────────────────────────────

test('ToastManager: dispose clears everything', () => {
  const mgr = new ToastManager({ defaultDurationMs: 60000 });
  mgr.show('A', 'INFO');
  mgr.show('B', 'INFO');

  mgr.dispose();
  assert.equal(mgr.getActive(), null);
  assert.equal(mgr.getQueueSize(), 0);
});

test('ToastManager: show after dispose is no-op', () => {
  const mgr = new ToastManager();
  mgr.dispose();

  mgr.show('After dispose', 'INFO');
  assert.equal(mgr.getActive(), null);
});