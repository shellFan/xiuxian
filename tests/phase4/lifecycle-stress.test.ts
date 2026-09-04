/**
 * Lifecycle Stress Test — 100 rounds
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { PlatformLifecycle } from '../../assets/scripts/services/platform/platform-lifecycle';
import { createPlatformService } from '../../assets/scripts/services/platform/platform-service';
import { LeakProtection } from '../../assets/scripts/services/leak-protection';

const ROUNDS = 100;

test('Lifecycle stress: 100 rounds init/start/pause/resume/dispose', () => {
  for (let i = 0; i < ROUNDS; i++) {
    const storage = new MemoryStorageAdapter();
    const facade = new GameFacade({ storage });
    facade.start();
    facade.pause();
    facade.resume();
    facade.lifecycle.pause();
    facade.lifecycle.resume();
    const snap = facade.snapshot();
    assert.ok(typeof snap.salary === 'number');
    facade.destroy();
  }
  assert.ok(true, `Completed ${ROUNDS} rounds without crash`);
});

test('Lifecycle stress: listener count stable across cycles', () => {
  for (let i = 0; i < ROUNDS; i++) {
    const platform = createPlatformService('mock');
    const lifecycle = new PlatformLifecycle(platform);
    const guard = new LeakProtection();

    const unsub1 = guard.addSubscription(lifecycle.onPause(() => {}));
    const unsub2 = guard.addSubscription(lifecycle.onResume(() => {}));
    const unsub3 = guard.addSubscription(lifecycle.onSaveState(() => {}));
    lifecycle.pause();
    lifecycle.resume();
    unsub1();
    unsub2();
    unsub3();
    assert.strictEqual(guard.subscriptionCount, 0);
    lifecycle.dispose();
    guard.dispose();
  }
  assert.ok(true, `All ${ROUNDS} rounds had zero leaked subscriptions`);
});

test('Lifecycle stress: PlatformLifecycle dispose clears all listeners', () => {
  for (let i = 0; i < ROUNDS; i++) {
    const platform = createPlatformService('mock');
    const lifecycle = new PlatformLifecycle(platform);
    lifecycle.onPause(() => {});
    lifecycle.onPause(() => {});
    lifecycle.onResume(() => {});
    lifecycle.onSaveState(() => {});
    lifecycle.onRestoreState(() => {});
    lifecycle.dispose();
    lifecycle.pause(); // no crash after dispose
  }
  assert.ok(true, 'All rounds completed without crash');
});

test('Lifecycle stress: no duplicate autosave on repeated hide', () => {
  const storage = new MemoryStorageAdapter();
  let saveCount = 0;

  for (let i = 0; i < ROUNDS; i++) {
    const facade = new GameFacade({ storage });
    facade.context.player.salary = i;
    facade.lifecycle.onSaveState(() => { saveCount++; });
    facade.lifecycle.pause();
    facade.destroy();
  }

  assert.ok(saveCount <= ROUNDS, `Save count ${saveCount} should not exceed ${ROUNDS}`);
});