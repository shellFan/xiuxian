/**
 * Platform Lifecycle Test — verify show/hide dispatch through real platform chain
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlatformLifecycle } from '../../assets/scripts/services/platform/platform-lifecycle';
import { MockPlatformService } from '../../assets/scripts/services/platform/platform-service';

function createLifecycle() {
  const platform = new MockPlatformService();
  const lifecycle = new PlatformLifecycle(platform);
  return { platform, lifecycle };
}

test('Platform hide: onHide and onSaveState each fire once', () => {
  const { platform, lifecycle } = createLifecycle();
  let hideCount = 0;
  let saveCount = 0;
  lifecycle.onHide(() => { hideCount++; });
  lifecycle.onSaveState(() => { saveCount++; });

  platform.emitHide();

  assert.strictEqual(hideCount, 1);
  assert.strictEqual(saveCount, 1);
});

test('Platform show: onShow and onRestoreState each fire once', () => {
  const { platform, lifecycle } = createLifecycle();
  let showCount = 0;
  let restoreCount = 0;
  lifecycle.onShow(() => { showCount++; });
  lifecycle.onRestoreState(() => { restoreCount++; });

  // Must hide first so show has meaning
  platform.emitHide();
  platform.emitShow();

  assert.strictEqual(showCount, 1);
  assert.strictEqual(restoreCount, 1);
});

test('Unsubscribe onShow: callback does not fire after unsubscribe', () => {
  const { platform, lifecycle } = createLifecycle();
  let showCount = 0;
  const unsub = lifecycle.onShow(() => { showCount++; });

  platform.emitHide();
  platform.emitShow();
  assert.strictEqual(showCount, 1);

  unsub();

  platform.emitHide();
  platform.emitShow();
  assert.strictEqual(showCount, 1, 'onShow callback must not fire after unsubscribe');
});

test('Unsubscribe onHide: callback does not fire after unsubscribe', () => {
  const { platform, lifecycle } = createLifecycle();
  let hideCount = 0;
  const unsub = lifecycle.onHide(() => { hideCount++; });

  platform.emitHide();
  assert.strictEqual(hideCount, 1);

  unsub();

  platform.emitShow();
  platform.emitHide();
  assert.strictEqual(hideCount, 1, 'onHide callback must not fire after unsubscribe');
});

test('100 hide/show cycles: exactly 100 onHide and 100 onShow callbacks', () => {
  const { platform, lifecycle } = createLifecycle();
  let hideCount = 0;
  let showCount = 0;
  lifecycle.onHide(() => { hideCount++; });
  lifecycle.onShow(() => { showCount++; });

  for (let i = 0; i < 100; i++) {
    platform.emitHide();
    platform.emitShow();
  }

  assert.strictEqual(hideCount, 100);
  assert.strictEqual(showCount, 100);
});

test('Dispose: business listeners do not fire after dispose', () => {
  const { platform, lifecycle } = createLifecycle();
  let hideCount = 0;
  let showCount = 0;
  lifecycle.onHide(() => { hideCount++; });
  lifecycle.onShow(() => { showCount++; });

  platform.emitHide();
  platform.emitShow();
  assert.strictEqual(hideCount, 1);
  assert.strictEqual(showCount, 1);

  lifecycle.dispose();

  platform.emitHide();
  platform.emitShow();
  assert.strictEqual(hideCount, 1, 'onHide must not fire after dispose');
  assert.strictEqual(showCount, 1, 'onShow must not fire after dispose');
});