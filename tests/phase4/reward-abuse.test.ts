/**
 * Reward Abuse Test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RewardService } from '../../assets/scripts/services/reward/reward-service';
import { type RewardProvider, type RewardType, type RewardResult, MockRewardProvider } from '../../assets/scripts/services/reward-provider';

class DoubleCallbackProvider implements RewardProvider {
  public callCount = 0;
  constructor(private readonly times: number) {}
  public requestReward(type: RewardType, onComplete: (result: RewardResult) => void): void {
    this.callCount++;
    for (let i = 0; i < this.times; i++) {
      onComplete({ status: 'granted' });
    }
  }
  public claimMindRecovery(): number { return 50; }
}

class DelayedProvider implements RewardProvider {
  public requestReward(type: RewardType, onComplete: (result: RewardResult) => void): void {
    setTimeout(() => onComplete({ status: 'granted' }), 10);
  }
  public claimMindRecovery(): number { return 50; }
}

class ThrowingProvider implements RewardProvider {
  public requestReward(type: RewardType, onComplete: (result: RewardResult) => void): void {
    throw new Error('Provider crashed');
  }
  public claimMindRecovery(): number { return 50; }
}

class LateCallbackProvider implements RewardProvider {
  private storedCallback: ((result: RewardResult) => void) | null = null;
  public requestReward(type: RewardType, onComplete: (result: RewardResult) => void): void {
    this.storedCallback = onComplete;
  }
  public fireLate(): void {
    if (this.storedCallback) {
      this.storedCallback({ status: 'granted' });
      this.storedCallback = null;
    }
  }
  public claimMindRecovery(): number { return 50; }
}

test('Reward abuse: double callback grants only once', () => {
  const provider = new DoubleCallbackProvider(2);
  const service = new RewardService(provider);
  let grantCount = 0;
  service.request('MIND_RECOVERY', (result) => {
    if (result.status === 'granted') grantCount++;
  });
  assert.strictEqual(grantCount, 1);
  assert.strictEqual(provider.callCount, 1);
});

test('Reward abuse: triple callback grants only once', () => {
  const provider = new DoubleCallbackProvider(3);
  const service = new RewardService(provider);
  let grantCount = 0;
  service.request('MIND_RECOVERY', (result) => {
    if (result.status === 'granted') grantCount++;
  });
  assert.strictEqual(grantCount, 1);
});

test('Reward abuse: concurrent request throws', () => {
  const provider = new DelayedProvider();
  const service = new RewardService(provider);
  service.request('MIND_RECOVERY', () => {});
  assert.throws(() => {
    service.request('MIND_RECOVERY', () => {});
  }, /cannot request while in state/);
});

test('Reward abuse: can request again after cancel', () => {
  let callCount = 0;
  const service = new RewardService({
    requestReward(type, cb) {
      callCount++;
      cb({ status: 'cancelled', reason: 'test' });
    },
    claimMindRecovery() { return 50; },
  });
  service.request('MIND_RECOVERY', () => {});
  assert.strictEqual(service.getState(), 'CANCELLED');
  setTimeout(() => {
    assert.strictEqual(service.getState(), 'IDLE');
    service.request('MIND_RECOVERY', () => {});
    assert.strictEqual(callCount, 2);
  }, 0);
});

test('Reward abuse: can request again after failure', () => {
  let callCount = 0;
  const service = new RewardService({
    requestReward(type, cb) {
      callCount++;
      cb({ status: 'failed', reason: 'test' });
    },
    claimMindRecovery() { return 50; },
  });
  service.request('MIND_RECOVERY', () => {});
  setTimeout(() => {
    assert.strictEqual(service.getState(), 'IDLE');
    service.request('MIND_RECOVERY', () => {});
    assert.strictEqual(callCount, 2);
  }, 0);
});

test('Reward abuse: provider throw does not crash service', () => {
  const service = new RewardService(new ThrowingProvider());
  assert.throws(() => {
    service.request('MIND_RECOVERY', () => {});
  }, /Provider crashed/);
  service.reset();
  assert.strictEqual(service.getState(), 'IDLE');
});

test('Reward abuse: callback after dispose is ignored', () => {
  const provider = new LateCallbackProvider();
  const service = new RewardService(provider);
  let granted = false;
  service.request('MIND_RECOVERY', (result) => {
    if (result.status === 'granted') granted = true;
  });
  service.dispose();
  provider.fireLate();
  assert.strictEqual(granted, false);
});

test('Reward abuse: stale callback from previous request is ignored', () => {
  const captured: ((result: RewardResult) => void)[] = [];
  let requestCount = 0;

  class StaleCallbackProvider implements RewardProvider {
    public requestReward(type: RewardType, onComplete: (result: RewardResult) => void): void {
      requestCount++;
      if (requestCount === 1) {
        captured.push(onComplete);
      } else {
        onComplete({ status: 'granted' });
      }
    }
    public claimMindRecovery(): number { return 50; }
  }

  const service = new RewardService(new StaleCallbackProvider());

  let firstResult: string | null = null;
  let secondResult: string | null = null;

  service.request('MIND_RECOVERY', (r) => { firstResult = r.status; });
  service.reset();
  service.request('MIND_RECOVERY', (r) => { secondResult = r.status; });
  assert.strictEqual(secondResult, 'granted');

  // Fire the stale first-request callback — should be ignored by generation guard
  if (captured.length > 0) {
    captured[0]({ status: 'granted' });
  }
  assert.strictEqual(firstResult, null);
});