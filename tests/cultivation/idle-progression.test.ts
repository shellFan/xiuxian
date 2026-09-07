/**
 * Idle Progression Test — Core Gameplay Fix
 *
 * Tests the idle/AFK progression with spirit stones:
 *   - IdleService computes spirit stones per hour (6/hour = 0.1/min)
 *   - Offline reward settlement includes spirit stones
 *   - Spirit stones are tracked in player data
 *   - EconomyService addSpiritStones/spendSpiritStones
 *   - IdleSettled event includes spiritStones field
 */
import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { IdleService } from '../../assets/scripts/services/idle-service';
import { OfflineRewardService } from '../../assets/scripts/services/offline-reward-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(clock?: FakeClock, playerOverrides?: Partial<ConstructorParameters<typeof PlayerData>[0]>) {
  const c = clock ?? new FakeClock(10_000);
  const player = new PlayerData({ mind: 100, maxMind: 100, ...playerOverrides });
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ player, storage, clock: c });
  const idle = new IdleService(context, { clock: c, spiritStonesPerHour: 6 });
  const offline = new OfflineRewardService(context, idle);
  return { context, clock: c, player, idle, offline };
}

// ── Test 1: Idle preview includes spirit stones ──────────────────────────────

function testIdlePreviewIncludesSpiritStones(): void {
  const clock = new FakeClock(0);
  const { idle, player } = makeContext(clock);

  // Simulate 1 hour offline
  clock.set(3_600_000);
  const preview = idle.preview('settle-1');
  assert.ok(preview.spiritStones >= 0, 'preview should include spiritStones');
  // 6 spirit stones per hour → after 1 hour = 6
  assert.equal(preview.spiritStones, 6, 'should earn 6 spirit stones per hour');

  console.log('  ✓ idle preview includes spirit stones');
}

// ── Test 2: Idle settlement grants spirit stones ─────────────────────────────

function testIdleSettlementGrantsSpiritStones(): void {
  const clock = new FakeClock(0);
  const { context, idle, player } = makeContext(clock);

  // Simulate 30 minutes offline
  clock.set(1_800_000);
  const result = idle.settle('settle-2');
  assert.ok(result.spiritStones > 0, 'settlement should grant spirit stones');
  // 6/hour × 0.5 hour = 3
  assert.equal(result.spiritStones, 3, 'should grant 3 spirit stones for 30 min');
  assert.equal(player.spiritStones, 3, 'player should have 3 spirit stones');

  console.log('  ✓ idle settlement grants spirit stones');
}

// ── Test 3: Spirit stones accumulate over time ───────────────────────────────

function testSpiritStonesAccumulate(): void {
  const clock = new FakeClock(0);
  const { context, idle, player } = makeContext(clock);

  // First settlement: 10 min = 1 spirit stone
  clock.set(600_000);
  idle.settle('settle-3a');
  assert.equal(player.spiritStones, 1, '1 spirit stone after 10 min');

  // Second settlement: another 10 min = 1 more spirit stone
  clock.set(1_200_000);
  idle.settle('settle-3b');
  assert.equal(player.spiritStones, 2, '2 spirit stones after 20 min total');

  console.log('  ✓ spirit stones accumulate over time');
}

// ── Test 4: IdleSettled event includes spiritStones ──────────────────────────

function testIdleSettledEventIncludesSpiritStones(): void {
  const clock = new FakeClock(0);
  const { context, idle } = makeContext(clock);

  let settledSpiritStones = 0;
  context.events.on('idleSettled', (e: any) => {
    settledSpiritStones = e.spiritStones;
  });

  clock.set(3_600_000);
  idle.settle('settle-4');
  assert.equal(settledSpiritStones, 6, 'idleSettled event should include spiritStones=6');

  console.log('  ✓ idleSettled event includes spiritStones');
}

// ── Test 5: EconomyService addSpiritStones/spendSpiritStones ─────────────────

function testEconomyServiceSpiritStones(): void {
  const { context, player } = makeContext();

  assert.equal(player.spiritStones, 0, 'initial spirit stones should be 0');

  context.economy.addSpiritStones(10);
  assert.equal(player.spiritStones, 10, 'should have 10 after adding');

  context.economy.addSpiritStones(5);
  assert.equal(player.spiritStones, 15, 'should have 15 after adding 5 more');

  context.economy.spendSpiritStones(3);
  assert.equal(player.spiritStones, 12, 'should have 12 after spending 3');

  console.log('  ✓ EconomyService addSpiritStones/spendSpiritStones work');
}

// ── Test 6: spendSpiritStones throws when insufficient ───────────────────────

function testSpendSpiritStonesThrowsWhenInsufficient(): void {
  const { context } = makeContext();

  assert.throws(() => context.economy.spendSpiritStones(5), /Insufficient/i);

  console.log('  ✓ spendSpiritStones throws when insufficient');
}

// ── Test 7: Offline reward normal claim includes spirit stones ───────────────

function testOfflineRewardNormalClaimIncludesSpiritStones(): void {
  const clock = new FakeClock(0);
  const { offline, player } = makeContext(clock);

  clock.set(3_600_000);
  const result = offline.claimNormal('settle-7');
  assert.ok(result.spiritStones > 0, 'offline normal claim should include spirit stones');
  assert.equal(player.spiritStones, result.spiritStones, 'player spirit stones should match');

  console.log('  ✓ offline reward normal claim includes spirit stones');
}

// ── Test 8: Zero idle time yields zero spirit stones ─────────────────────────

function testZeroIdleTimeYieldsZeroSpiritStones(): void {
  const clock = new FakeClock(10_000);
  const { idle } = makeContext(clock);

  // No time elapsed
  const preview = idle.preview('settle-8');
  assert.equal(preview.spiritStones, 0, 'zero idle time should yield zero spirit stones');

  console.log('  ✓ zero idle time yields zero spirit stones');
}

// ── Test 9: Spirit stones are integer (no fractional) ────────────────────────

function testSpiritStonesAreInteger(): void {
  const clock = new FakeClock(0);
  const { idle, player } = makeContext(clock);

  // 1 minute = 0.1 spirit stones → should floor to 0
  clock.set(60_000);
  const result = idle.settle('settle-9a');
  assert.equal(result.spiritStones, 0, '1 min should yield 0 spirit stones (floor)');

  // After first settle, lastSaveTime is updated. Advance another 10 minutes for 1 spirit stone.
  clock.set(660_000); // 11 min total, but 10 min since last settle
  idle.settle('settle-9b');
  assert.equal(player.spiritStones, 1, '10 min since last settle should yield 1 spirit stone');

  console.log('  ✓ spirit stones are integer (no fractional)');
}

// ── Run all tests ────────────────────────────────────────────────────────────

testIdlePreviewIncludesSpiritStones();
testIdleSettlementGrantsSpiritStones();
testSpiritStonesAccumulate();
testIdleSettledEventIncludesSpiritStones();
testEconomyServiceSpiritStones();
testSpendSpiritStonesThrowsWhenInsufficient();
testOfflineRewardNormalClaimIncludesSpiritStones();
testZeroIdleTimeYieldsZeroSpiritStones();
testSpiritStonesAreInteger();
console.log('idle progression tests passed');