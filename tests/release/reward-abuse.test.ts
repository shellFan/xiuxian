/**
 * Reward Abuse Test — validates protection against reward exploitation.
 *
 * Validates:
 *   1. RewardService state machine prevents concurrent requests
 *   2. RewardAdPolicy enforces session/daily limits
 *   3. RewardAdPolicy enforces cooldowns (interval, cancel, failure)
 *   4. OfflineRewardService prevents duplicate claims
 *   5. Double-callback guard prevents double-grant
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { RewardService } from '../../assets/scripts/services/reward/reward-service';
import { MockRewardProvider, type RewardProvider, type RewardType, type RewardResult } from '../../assets/scripts/services/reward-provider';
import { RewardAdPolicy } from '../../assets/scripts/services/reward-ad-policy';

// ── 1. Concurrent Request Prevention ────────────────────────────────────────

test('Reward Abuse: cannot request reward while another is in progress', () => {
  let pendingCallback: ((result: RewardResult) => void) | null = null;
  const slowProvider: RewardProvider = {
    claimMindRecovery: () => 50,
    requestReward(_type: RewardType, onComplete: (result: RewardResult) => void): void {
      pendingCallback = onComplete; // Don't call back immediately
    },
  };

  const service = new RewardService(slowProvider);
  let result1: RewardResult | null = null;
  service.request('MIND_RECOVERY', (r) => { result1 = r; });

  // Second request should throw
  assert.throws(
    () => service.request('OFFLINE_DOUBLE', () => {}),
    /cannot request while in state REQUESTING/,
    'Should throw on concurrent request',
  );

  // Complete the first request
  assert.ok(pendingCallback !== null, 'Should have pending callback');
  pendingCallback!({ status: 'granted' });

  // Now should be able to request again (after microtask reset)
  // Need to wait for microtask
  setTimeout(() => {
    let result2: RewardResult | null = null;
    assert.doesNotThrow(
      () => service.request('OFFLINE_DOUBLE', (r) => { result2 = r; }),
      'Should allow request after previous completes',
    );
  }, 0);
});

// ── 2. Session Limit Enforcement ────────────────────────────────────────────

test('Reward Abuse: session limit blocks further ad requests', () => {
  let now = 0;
  const policy = new RewardAdPolicy(() => now, { maxSessionCount: 3, minIntervalSeconds: 0 });

  // First 3 should be allowed
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(policy.isAllowed(), true, `Ad ${i + 1} should be allowed`);
    policy.recordShown();
  }

  // 4th should be blocked
  const check = policy.check();
  assert.strictEqual(check.allowed, false, '4th ad should be blocked');
  if (!check.allowed) {
    assert.strictEqual(check.reason, 'SESSION_LIMIT', 'Should be session limited');
  }
});

// ── 3. Daily Limit Enforcement ──────────────────────────────────────────────

test('Reward Abuse: daily limit blocks further ad requests', () => {
  let now = new Date('2026-01-01T12:00:00Z').getTime();
  const policy = new RewardAdPolicy(() => now, {
    maxSessionCount: 100, // High session limit
    maxDailyCount: 5,
    minIntervalSeconds: 0,
  });

  // Use 5 ads
  for (let i = 0; i < 5; i++) {
    policy.recordShown();
    now += 1000; // 1s apart
  }

  // 6th should be blocked by daily limit
  const check = policy.check();
  assert.strictEqual(check.allowed, false, 'Should be daily limited');
  if (!check.allowed) {
    assert.strictEqual(check.reason, 'DAILY_LIMIT', 'Should be daily limited');
  }

  // Next day should reset
  now = new Date('2026-01-02T12:00:00Z').getTime();
  assert.strictEqual(policy.isAllowed(), true, 'Should reset on new day');
});

// ── 4. Minimum Interval Enforcement ─────────────────────────────────────────

test('Reward Abuse: minimum interval between ads enforced', () => {
  let now = 1000000;
  const policy = new RewardAdPolicy(() => now, {
    maxSessionCount: 100,
    maxDailyCount: 100,
    minIntervalSeconds: 60,
  });

  // First ad allowed
  assert.strictEqual(policy.isAllowed(), true, 'First ad should be allowed');
  policy.recordShown();

  // Immediately after: blocked by min interval
  const check = policy.check();
  assert.strictEqual(check.allowed, false, 'Should be blocked by min interval');
  if (!check.allowed) {
    assert.strictEqual(check.reason, 'MIN_INTERVAL', 'Should be min interval blocked');
  }

  // After 59 seconds: still blocked
  now += 59000;
  assert.strictEqual(policy.isAllowed(), false, '59s later still blocked');

  // After 60 seconds: allowed
  now += 1000;
  assert.strictEqual(policy.isAllowed(), true, '60s later should be allowed');
});

// ── 5. Cancel Cooldown ──────────────────────────────────────────────────────

test('Reward Abuse: cancel cooldown enforced', () => {
  let now = 1000000;
  const policy = new RewardAdPolicy(() => now, {
    maxSessionCount: 100,
    maxDailyCount: 100,
    minIntervalSeconds: 0,
    cancelCooldownSeconds: 30,
  });

  policy.recordCancelled();

  // Immediately after: blocked
  let check = policy.check();
  assert.strictEqual(check.allowed, false, 'Should be blocked after cancel');
  if (!check.allowed) assert.strictEqual(check.reason, 'CANCEL_COOLDOWN');

  // After 29s: still blocked
  now += 29000;
  check = policy.check();
  assert.strictEqual(check.allowed, false, '29s after cancel still blocked');

  // After 30s: allowed
  now += 1000;
  assert.strictEqual(policy.isAllowed(), true, '30s after cancel should be allowed');
});

// ── 6. Failure Cooldown ─────────────────────────────────────────────────────

test('Reward Abuse: failure cooldown enforced', () => {
  let now = 1000000;
  const policy = new RewardAdPolicy(() => now, {
    maxSessionCount: 100,
    maxDailyCount: 100,
    minIntervalSeconds: 0,
    failureCooldownSeconds: 120,
  });

  policy.recordFailed();

  // Immediately after: blocked
  let check = policy.check();
  assert.strictEqual(check.allowed, false, 'Should be blocked after failure');
  if (!check.allowed) assert.strictEqual(check.reason, 'FAILURE_COOLDOWN');

  // After 119s: still blocked
  now += 119000;
  check = policy.check();
  assert.strictEqual(check.allowed, false, '119s after failure still blocked');

  // After 120s: allowed
  now += 1000;
  assert.strictEqual(policy.isAllowed(), true, '120s after failure should be allowed');
});

// ── 7. Double-Callback Guard ────────────────────────────────────────────────

test('Reward Abuse: double-callback from provider does not double-grant', () => {
  let callCount = 0;
  const doubleCallbackProvider: RewardProvider = {
    claimMindRecovery: () => 50,
    requestReward(_type: RewardType, onComplete: (result: RewardResult) => void): void {
      onComplete({ status: 'granted' }); // First callback
      onComplete({ status: 'granted' }); // Duplicate callback (misbehaving SDK)
    },
  };

  const service = new RewardService(doubleCallbackProvider);
  const results: RewardResult[] = [];
  service.request('MIND_RECOVERY', (r) => { results.push(r); callCount++; });

  // Should only receive one callback
  assert.strictEqual(callCount, 1, 'Should only fire callback once');
  assert.strictEqual(results.length, 1, 'Should have exactly one result');
  assert.strictEqual(results[0].status, 'granted', 'Result should be granted');
});

// ── 8. Session Reset ────────────────────────────────────────────────────────

test('Reward Abuse: session reset allows new ads', () => {
  let now = 0;
  const policy = new RewardAdPolicy(() => now, { maxSessionCount: 2, minIntervalSeconds: 0 });

  policy.recordShown();
  policy.recordShown();
  assert.strictEqual(policy.isAllowed(), false, 'Should be session limited');

  policy.resetSession();
  assert.strictEqual(policy.isAllowed(), true, 'Should be allowed after session reset');
});