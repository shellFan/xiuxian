import test from 'node:test';
import assert from 'node:assert/strict';

import { RewardAdPolicy } from '../../assets/scripts/services/reward-ad-policy';

// ── Helper: controllable clock ──────────────────────────────────────────────

function createClock() {
  let now = 1000000;
  return {
    tick: (ms: number) => { now += ms; },
    now: () => now,
  };
}

// ── Basic Policy ────────────────────────────────────────────────────────────

test('RewardAdPolicy: initial state allows ad', () => {
  const policy = new RewardAdPolicy();
  const result = policy.check();
  assert.strictEqual(result.allowed, true);
});

test('RewardAdPolicy: isAllowed returns true initially', () => {
  const policy = new RewardAdPolicy();
  assert.strictEqual(policy.isAllowed(), true);
});

// ── Session Limit ───────────────────────────────────────────────────────────

test('RewardAdPolicy: enforces session limit', () => {
  const policy = new RewardAdPolicy(Date.now, { maxSessionCount: 2, minIntervalSeconds: 0 });
  policy.recordShown();
  assert.strictEqual(policy.isAllowed(), true);
  policy.recordShown();
  assert.strictEqual(policy.isAllowed(), false);
  const result = policy.check();
  if (!result.allowed) {
    assert.strictEqual(result.reason, 'SESSION_LIMIT');
  } else {
    assert.fail('Expected SESSION_LIMIT');
  }
});

test('RewardAdPolicy: resetSession clears session count', () => {
  const policy = new RewardAdPolicy(Date.now, { maxSessionCount: 1 });
  policy.recordShown();
  assert.strictEqual(policy.isAllowed(), false);
  policy.resetSession();
  assert.strictEqual(policy.isAllowed(), true);
});

// ── Daily Limit ─────────────────────────────────────────────────────────────

test('RewardAdPolicy: enforces daily limit', () => {
  const policy = new RewardAdPolicy(Date.now, { maxDailyCount: 2, minIntervalSeconds: 0 });
  policy.recordShown();
  policy.recordShown();
  assert.strictEqual(policy.isAllowed(), false);
  const result = policy.check();
  if (!result.allowed) {
    assert.strictEqual(result.reason, 'DAILY_LIMIT');
  } else {
    assert.fail('Expected DAILY_LIMIT');
  }
});

test('RewardAdPolicy: daily count resets on new day', () => {
  const clock = createClock();
  const policy = new RewardAdPolicy(clock.now, { maxDailyCount: 1 });
  policy.recordShown();
  assert.strictEqual(policy.isAllowed(), false);
  // Advance past midnight (simulate next day)
  clock.tick(24 * 60 * 60 * 1000);
  assert.strictEqual(policy.isAllowed(), true);
});

// ── Minimum Interval ────────────────────────────────────────────────────────

test('RewardAdPolicy: enforces minimum interval', () => {
  const clock = createClock();
  const policy = new RewardAdPolicy(clock.now, { minIntervalSeconds: 60 });
  policy.recordShown();
  // Immediately after — should be blocked
  const result = policy.check();
  if (!result.allowed) {
    assert.strictEqual(result.reason, 'MIN_INTERVAL');
  } else {
    assert.fail('Expected MIN_INTERVAL');
  }
  // After 61 seconds — should be allowed
  clock.tick(61 * 1000);
  assert.strictEqual(policy.isAllowed(), true);
});

// ── Cancel Cooldown ─────────────────────────────────────────────────────────

test('RewardAdPolicy: enforces cancel cooldown', () => {
  const clock = createClock();
  const policy = new RewardAdPolicy(clock.now, { cancelCooldownSeconds: 30 });
  policy.recordCancelled();
  const result = policy.check();
  if (!result.allowed) {
    assert.strictEqual(result.reason, 'CANCEL_COOLDOWN');
  } else {
    assert.fail('Expected CANCEL_COOLDOWN');
  }
  clock.tick(31 * 1000);
  assert.strictEqual(policy.isAllowed(), true);
});

// ── Failure Cooldown ────────────────────────────────────────────────────────

test('RewardAdPolicy: enforces failure cooldown', () => {
  const clock = createClock();
  const policy = new RewardAdPolicy(clock.now, { failureCooldownSeconds: 120 });
  policy.recordFailed();
  const result = policy.check();
  if (!result.allowed) {
    assert.strictEqual(result.reason, 'FAILURE_COOLDOWN');
  } else {
    assert.fail('Expected FAILURE_COOLDOWN');
  }
  clock.tick(121 * 1000);
  assert.strictEqual(policy.isAllowed(), true);
});

// ── State Query ─────────────────────────────────────────────────────────────

test('RewardAdPolicy: getState returns current state', () => {
  const policy = new RewardAdPolicy(Date.now, { maxSessionCount: 10, maxDailyCount: 20 });
  policy.recordShown();
  policy.recordShown();
  const state = policy.getState();
  assert.strictEqual(state.sessionCount, 2);
  assert.strictEqual(state.dailyCount, 2);
  assert.strictEqual(state.lastAdTime > 0, true);
});

test('RewardAdPolicy: getRemainingSessionAds returns correct count', () => {
  const policy = new RewardAdPolicy(Date.now, { maxSessionCount: 5 });
  policy.recordShown();
  policy.recordShown();
  assert.strictEqual(policy.getRemainingSessionAds(), 3);
});

test('RewardAdPolicy: getRemainingDailyAds returns correct count', () => {
  const policy = new RewardAdPolicy(Date.now, { maxDailyCount: 10 });
  policy.recordShown();
  policy.recordShown();
  policy.recordShown();
  assert.strictEqual(policy.getRemainingDailyAds(), 7);
});

// ── Combined Scenarios ──────────────────────────────────────────────────────

test('RewardAdPolicy: session limit takes priority over daily limit', () => {
  const policy = new RewardAdPolicy(Date.now, { maxSessionCount: 1, maxDailyCount: 100 });
  policy.recordShown();
  const result = policy.check();
  if (!result.allowed) {
    assert.strictEqual(result.reason, 'SESSION_LIMIT');
  } else {
    assert.fail('Expected SESSION_LIMIT');
  }
});

test('RewardAdPolicy: failure cooldown does not block after expiry', () => {
  const clock = createClock();
  const policy = new RewardAdPolicy(clock.now, { failureCooldownSeconds: 10 });
  policy.recordFailed();
  clock.tick(11 * 1000);
  assert.strictEqual(policy.isAllowed(), true);
});

test('RewardAdPolicy: recordShown increments both session and daily count', () => {
  const policy = new RewardAdPolicy(Date.now, { maxSessionCount: 10, maxDailyCount: 10 });
  policy.recordShown();
  const state = policy.getState();
  assert.strictEqual(state.sessionCount, 1);
  assert.strictEqual(state.dailyCount, 1);
});