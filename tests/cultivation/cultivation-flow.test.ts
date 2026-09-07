/**
 * Cultivation Flow Test — Core Gameplay Fix
 *
 * Tests the new cultivation click mechanic:
 *   - Click grants +5 exp (base) with mind efficiency modifier
 *   - 3-second cooldown between clicks
 *   - Mind efficiency: 100% at mind>=80%, scales down to 20% at mind=0
 *   - Save/rollback on failure
 *   - Event emission on successful cultivation
 */
import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { CultivationService } from '../../assets/scripts/services/cultivation-service';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(clock?: FakeClock, playerOverrides?: Partial<ConstructorParameters<typeof PlayerData>[0]>) {
  const c = clock ?? new FakeClock(10_000);
  const player = new PlayerData({ mind: 100, maxMind: 100, ...playerOverrides });
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ player, storage, clock: c });
  return { context, clock: c, player };
}

// ── Test 1: Cultivate click grants base +5 exp with full mind ────────────────

function testCultivateClickGrantsBaseExp(): void {
  const { context, clock } = makeContext();
  const cultivation = new CultivationService(context, { clock });

  const result = cultivation.cultivate();
  assert.equal(result.cultivationExp, 5, 'should grant 5 base exp with full mind');
  assert.equal(result.mindEfficiency, 1.0, 'mind efficiency should be 1.0 at mind=100');
  assert.equal(result.cooldownRemaining, 0, 'no cooldown on first click');
  assert.equal(context.player.cultivationExp, 5, 'player exp should be 5');
  console.log('  ✓ cultivate click grants base +5 exp with full mind');
}

// ── Test 2: Cultivate click respects cooldown ────────────────────────────────

function testCultivateCooldownBlocksRapidClicks(): void {
  const { context, clock } = makeContext();
  const cultivation = new CultivationService(context, { clock, cultivationCooldownSeconds: 3 });

  // First click succeeds
  const r1 = cultivation.cultivate();
  assert.equal(r1.cultivationExp, 5, 'first click grants exp');

  // Immediate second click is on cooldown
  const r2 = cultivation.cultivate();
  assert.equal(r2.cultivationExp, 0, 'second click should grant 0 exp (cooldown)');
  assert.ok(r2.cooldownRemaining > 0, 'should report remaining cooldown');
  assert.equal(context.player.cultivationExp, 5, 'exp should not change during cooldown');

  // Advance 3 seconds → cooldown expires
  clock.advance(3_000);
  const r3 = cultivation.cultivate();
  assert.equal(r3.cultivationExp, 5, 'click after cooldown grants exp');
  assert.equal(context.player.cultivationExp, 10, 'total exp should be 10');

  console.log('  ✓ cultivate click respects 3-second cooldown');
}

// ── Test 3: Mind efficiency scales from 20% to 100% ──────────────────────────

function testMindEfficiencyScales(): void {
  // mind=100, maxMind=100 → ratio=1.0 → efficiency=1.0
  const { context: c1 } = makeContext(undefined, { mind: 100, maxMind: 100 });
  const cs1 = new CultivationService(c1, { clock: new FakeClock(10_000) });
  assert.equal(cs1.getMindEfficiency(), 1.0, 'mind=100 → efficiency=1.0');

  // mind=80, maxMind=100 → ratio=0.8 → efficiency=1.0 (threshold)
  const { context: c2 } = makeContext(undefined, { mind: 80, maxMind: 100 });
  const cs2 = new CultivationService(c2, { clock: new FakeClock(10_000) });
  assert.equal(cs2.getMindEfficiency(), 1.0, 'mind=80 → efficiency=1.0 (threshold)');

  // mind=40, maxMind=100 → ratio=0.4 → efficiency=0.2+0.8*(0.4/0.8)=0.6
  const { context: c3 } = makeContext(undefined, { mind: 40, maxMind: 100 });
  const cs3 = new CultivationService(c3, { clock: new FakeClock(10_000) });
  assert.ok(Math.abs(cs3.getMindEfficiency() - 0.6) < 0.001, 'mind=40 → efficiency≈0.6');

  // mind=0, maxMind=100 → ratio=0 → efficiency=0.2
  const { context: c4 } = makeContext(undefined, { mind: 0, maxMind: 100 });
  const cs4 = new CultivationService(c4, { clock: new FakeClock(10_000) });
  assert.equal(cs4.getMindEfficiency(), 0.2, 'mind=0 → efficiency=0.2');

  console.log('  ✓ mind efficiency scales from 20% to 100%');
}

// ── Test 4: Low mind reduces cultivation reward ──────────────────────────────

function testLowMindReducesCultivationReward(): void {
  const clock = new FakeClock(10_000);
  const { context } = makeContext(clock, { mind: 0, maxMind: 100 });
  const cultivation = new CultivationService(context, { clock });

  const result = cultivation.cultivate();
  // mind=0 → efficiency=0.2 → reward = max(1, floor(5 * 0.2)) = max(1, 1) = 1
  assert.equal(result.cultivationExp, 1, 'low mind should reduce reward to minimum 1');
  assert.equal(result.mindEfficiency, 0.2, 'efficiency should be 0.2');

  console.log('  ✓ low mind reduces cultivation reward');
}

// ── Test 5: Cultivate updates lastCultivateTime ──────────────────────────────

function testCultivateUpdatesTimestamp(): void {
  const clock = new FakeClock(10_000);
  const { context } = makeContext(clock);
  const cultivation = new CultivationService(context, { clock });

  assert.equal(context.player.lastCultivateTime, 0, 'initial lastCultivateTime should be 0');
  cultivation.cultivate();
  assert.equal(context.player.lastCultivateTime, 10_000, 'lastCultivateTime should be updated to clock.now()');

  console.log('  ✓ cultivate updates lastCultivateTime');
}

// ── Test 6: Cultivate emits cultivationClicked event ─────────────────────────

function testCultivateEmitsEvent(): void {
  const clock = new FakeClock(10_000);
  const { context } = makeContext(clock);
  const cultivation = new CultivationService(context, { clock });

  let eventFired = false;
  context.events.on('cultivationClicked', () => { eventFired = true; });

  cultivation.cultivate();
  assert.equal(eventFired, true, 'cultivationClicked event should fire');

  console.log('  ✓ cultivate emits cultivationClicked event');
}

// ── Test 7: Cultivate rollback on save failure ───────────────────────────────

function testCultivateRollbackOnSaveFailure(): void {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(10_000);
  const player = new PlayerData({ mind: 100, maxMind: 100, cultivationExp: 50 });
  const context = new GameContext({
    player,
    storage,
    clock,
    saveService: new SaveService({
      getItem: (key) => storage.getItem(key),
      setItem: () => { throw new Error('disk full'); },
      removeItem: (key) => storage.removeItem(key),
    }),
  });
  const cultivation = new CultivationService(context, { clock });

  assert.throws(() => cultivation.cultivate(), /disk full/);
  assert.equal(context.player.cultivationExp, 50, 'exp should rollback on save failure');
  assert.equal(context.player.lastCultivateTime, 0, 'lastCultivateTime should rollback on save failure');

  console.log('  ✓ cultivate rollback on save failure');
}

// ── Test 8: getCooldownRemaining reports correct seconds ─────────────────────

function testCooldownRemainingReportsCorrectly(): void {
  const clock = new FakeClock(10_000);
  const { context } = makeContext(clock);
  const cultivation = new CultivationService(context, { clock, cultivationCooldownSeconds: 5 });

  cultivation.cultivate();
  assert.equal(cultivation.getCooldownRemaining(), 5, 'immediately after click, 5s remaining');

  clock.advance(2_000);
  assert.ok(Math.abs(cultivation.getCooldownRemaining() - 3) < 0.01, 'after 2s, 3s remaining');

  clock.advance(3_000);
  assert.equal(cultivation.getCooldownRemaining(), 0, 'after 5s total, cooldown expired');

  console.log('  ✓ getCooldownRemaining reports correct seconds');
}

// ── Run all tests ────────────────────────────────────────────────────────────

testCultivateClickGrantsBaseExp();
testCultivateCooldownBlocksRapidClicks();
testMindEfficiencyScales();
testLowMindReducesCultivationReward();
testCultivateUpdatesTimestamp();
testCultivateEmitsEvent();
testCultivateRollbackOnSaveFailure();
testCooldownRemainingReportsCorrectly();
console.log('cultivation flow tests passed');