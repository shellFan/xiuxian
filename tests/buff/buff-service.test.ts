import assert from 'node:assert/strict';
import { BuffService } from '../../assets/scripts/services/buff-service';

// ── Test: Add and query buff ──────────────────────────────────────────────

function testAddBuff(): void {
  const service = new BuffService();
  const id = service.addBuff('WORK_SALARY_BOOST', 2.0, 60);
  assert.ok(id.startsWith('buff_'), 'buff id should have prefix');
  assert.equal(service.getActiveBuffs().length, 1, 'should have 1 active buff');
  assert.equal(service.getMultiplier('WORK_SALARY_BOOST'), 2.0, 'salary multiplier should be 2.0');
  assert.equal(service.getMultiplier('FISHING_MIND_BOOST'), 1.0, 'unrelated multiplier should be 1.0');
  assert.ok(service.hasBuff('WORK_SALARY_BOOST'), 'should have salary buff');
  assert.ok(!service.hasBuff('FISHING_MIND_BOOST'), 'should not have mind buff');
}

// ── Test: Buff expires after duration ─────────────────────────────────────

function testBuffExpires(): void {
  const service = new BuffService();
  service.addBuff('WORK_SALARY_BOOST', 2.0, 30);
  assert.equal(service.getMultiplier('WORK_SALARY_BOOST'), 2.0, 'buff should be active');
  service.tick(29);
  assert.equal(service.getMultiplier('WORK_SALARY_BOOST'), 2.0, 'buff should still be active at 29s');
  service.tick(2);
  assert.equal(service.getMultiplier('WORK_SALARY_BOOST'), 1.0, 'buff should expire after 31s total');
  assert.equal(service.getActiveBuffs().length, 0, 'no active buffs after expiry');
}

// ── Test: Multiple buffs of same type multiply ────────────────────────────

function testMultipleBuffsMultiply(): void {
  const service = new BuffService();
  service.addBuff('WORK_SALARY_BOOST', 2.0, 60);
  service.addBuff('WORK_SALARY_BOOST', 1.5, 60);
  assert.equal(service.getMultiplier('WORK_SALARY_BOOST'), 3.0, '2.0 * 1.5 = 3.0');
}

// ── Test: Remove buff by id ───────────────────────────────────────────────

function testRemoveBuff(): void {
  const service = new BuffService();
  const id = service.addBuff('WORK_SALARY_BOOST', 2.0, 60);
  assert.ok(service.removeBuff(id), 'should find and remove buff');
  assert.equal(service.getMultiplier('WORK_SALARY_BOOST'), 1.0, 'multiplier should return to 1.0');
  assert.ok(!service.removeBuff(id), 'should not find already-removed buff');
}

// ── Test: Clear all buffs ─────────────────────────────────────────────────

function testClearAll(): void {
  const service = new BuffService();
  service.addBuff('WORK_SALARY_BOOST', 2.0, 60);
  service.addBuff('FISHING_MIND_BOOST', 3.0, 60);
  service.clearAll();
  assert.equal(service.getActiveBuffs().length, 0, 'all buffs should be cleared');
  assert.equal(service.getMultiplier('WORK_SALARY_BOOST'), 1.0);
  assert.equal(service.getMultiplier('FISHING_MIND_BOOST'), 1.0);
}

// ── Test: Reset service ───────────────────────────────────────────────────

function testReset(): void {
  const service = new BuffService();
  service.addBuff('WORK_SALARY_BOOST', 2.0, 60);
  service.tick(10);
  service.reset();
  assert.equal(service.getGameSeconds(), 0, 'game seconds should reset');
  assert.equal(service.getActiveBuffs().length, 0, 'buffs should be cleared');
}

// ── Test: Frame-rate independence ─────────────────────────────────────────

function testFrameRateIndependent(): void {
  const service1 = new BuffService();
  const service2 = new BuffService();
  service1.addBuff('WORK_SALARY_BOOST', 2.0, 60);
  service2.addBuff('WORK_SALARY_BOOST', 2.0, 60);
  // 60 FPS — 3600 frames of 1/60s ≈ 60s (floating-point may be slightly under)
  for (let i = 0; i < 3600; i += 1) service1.tick(1 / 60);
  // 10 FPS — 600 frames of 0.1s = 60s exactly
  for (let i = 0; i < 600; i += 1) service2.tick(0.1);
  // Both should have expired — add a small epsilon tick to cover fp drift
  service1.tick(0.001);
  service2.tick(0.001);
  assert.equal(service1.getMultiplier('WORK_SALARY_BOOST'), 1.0, '60fps: buff should expire after ~60s');
  assert.equal(service2.getMultiplier('WORK_SALARY_BOOST'), 1.0, '10fps: buff should expire after ~60s');
}

// ── Test: Invalid inputs ──────────────────────────────────────────────────

function testInvalidInputs(): void {
  const service = new BuffService();
  assert.throws(() => service.addBuff('WORK_SALARY_BOOST', 0, 60), /Invalid buff multiplier/);
  assert.throws(() => service.addBuff('WORK_SALARY_BOOST', -1, 60), /Invalid buff multiplier/);
  assert.throws(() => service.addBuff('WORK_SALARY_BOOST', 2.0, 0), /Invalid buff duration/);
  assert.throws(() => service.addBuff('WORK_SALARY_BOOST', 2.0, -1), /Invalid buff duration/);
  // Invalid tick should be no-op
  service.tick(0);
  service.tick(-1);
  service.tick(NaN);
  assert.equal(service.getGameSeconds(), 0, 'invalid ticks should not advance time');
}

// ── Test: Buff expiry at exact boundary ───────────────────────────────────

function testBuffExpiryAtExactBoundary(): void {
  const service = new BuffService();
  service.addBuff('WORK_SALARY_BOOST', 2.0, 60);
  service.tick(60);
  assert.equal(service.getMultiplier('WORK_SALARY_BOOST'), 1.0, 'buff should expire at exact boundary');
}

// ── Test: Different buff types are independent ────────────────────────────

function testDifferentBuffTypesIndependent(): void {
  const service = new BuffService();
  service.addBuff('WORK_SALARY_BOOST', 2.0, 30);
  service.addBuff('FISHING_MIND_BOOST', 3.0, 60);
  service.tick(31);
  assert.equal(service.getMultiplier('WORK_SALARY_BOOST'), 1.0, 'salary buff should expire');
  assert.equal(service.getMultiplier('FISHING_MIND_BOOST'), 3.0, 'mind buff should still be active');
}

// ── Run all tests ─────────────────────────────────────────────────────────

testAddBuff();
testBuffExpires();
testMultipleBuffsMultiply();
testRemoveBuff();
testClearAll();
testReset();
testFrameRateIndependent();
testInvalidInputs();
testBuffExpiryAtExactBoundary();
testDifferentBuffTypesIndependent();

console.log('buff service tests passed');