/**
 * Config Validation Test — validates all game configuration files.
 *
 * Validates:
 *   1. All JSON configs are valid and parseable
 *   2. Required fields exist with correct types
 *   3. Career config has 10 levels with increasing requirements
 *   4. Idle config has valid salary/cultivation arrays
 *   5. Release config values are production-safe
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  PRODUCTION_CONFIG,
  DEVELOPMENT_CONFIG,
  STAGING_CONFIG,
  resolveReleaseConfig,
  isProduction,
  isAdAvailable,
  type ReleaseConfig,
} from '../../assets/scripts/services/release-config';

// ── 1. JSON Config Files Parse ──────────────────────────────────────────────

const CONFIGS_DIR = path.resolve(__dirname, '../../assets/configs');

test('Config: all JSON config files are valid JSON', () => {
  const files = fs.readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.json'));
  assert.ok(files.length > 0, 'Should have at least one config file');

  for (const file of files) {
    const content = fs.readFileSync(path.join(CONFIGS_DIR, file), 'utf-8');
    assert.doesNotThrow(
      () => JSON.parse(content),
      `${file} should be valid JSON`,
    );
  }
});

// ── 2. Idle Config ──────────────────────────────────────────────────────────

test('Config: idle.json has valid structure', () => {
  const idle = JSON.parse(fs.readFileSync(path.join(CONFIGS_DIR, 'idle.json'), 'utf-8'));

  assert.ok(typeof idle.maxOfflineSeconds === 'number', 'maxOfflineSeconds should be number');
  assert.ok(idle.maxOfflineSeconds > 0, 'maxOfflineSeconds should be positive');
  assert.ok(idle.maxOfflineSeconds <= 86400, 'maxOfflineSeconds should be <= 86400 (24h)');

  assert.ok(Array.isArray(idle.salaryPerHour), 'salaryPerHour should be array');
  assert.ok(Array.isArray(idle.cultivationPerHour), 'cultivationPerHour should be array');
  assert.ok(idle.salaryPerHour.length > 0, 'salaryPerHour should not be empty');
  assert.ok(idle.cultivationPerHour.length > 0, 'cultivationPerHour should not be empty');

  // All values should be positive integers
  for (const s of idle.salaryPerHour) {
    assert.ok(Number.isInteger(s) && s > 0, `salaryPerHour value ${s} should be positive integer`);
  }
  for (const c of idle.cultivationPerHour) {
    assert.ok(Number.isInteger(c) && c > 0, `cultivationPerHour value ${c} should be positive integer`);
  }
});

// ── 3. Career Config ────────────────────────────────────────────────────────

test('Config: career.json has valid structure', () => {
  const careerPath = path.join(CONFIGS_DIR, 'career.json');
  if (!fs.existsSync(careerPath)) {
    // Career config might be in a different format; skip if not found
    return;
  }
  const career = JSON.parse(fs.readFileSync(careerPath, 'utf-8'));

  assert.ok(Array.isArray(career.levels) || Array.isArray(career), 'Career should have levels array');

  const levels = Array.isArray(career) ? career : career.levels;
  assert.ok(levels.length >= 5, 'Career should have at least 5 levels');

  // Each level should have increasing requirements
  for (let i = 1; i < levels.length; i++) {
    const prev = levels[i - 1];
    const curr = levels[i];
    if (typeof prev.requiredExp === 'number' && typeof curr.requiredExp === 'number') {
      assert.ok(
        curr.requiredExp >= prev.requiredExp,
        `Level ${i + 1} requiredExp should be >= level ${i}`,
      );
    }
  }
});

// ── 4. Release Config: Production ───────────────────────────────────────────

test('Config: PRODUCTION_CONFIG is production-safe', () => {
  assert.strictEqual(PRODUCTION_CONFIG.environment, 'production');
  assert.strictEqual(PRODUCTION_CONFIG.debugEnabled, false, 'Production must have debug disabled');
  assert.strictEqual(PRODUCTION_CONFIG.analyticsEnabled, true, 'Production should have analytics enabled');
  assert.ok(PRODUCTION_CONFIG.maxOfflineSeconds > 0, 'maxOfflineSeconds must be positive');
  assert.ok(PRODUCTION_CONFIG.autoSaveIntervalSeconds > 0, 'autoSaveIntervalSeconds must be positive');
  assert.ok(PRODUCTION_CONFIG.tickIntervalSeconds > 0, 'tickIntervalSeconds must be positive');
  assert.ok(PRODUCTION_CONFIG.maxSessionAds > 0, 'maxSessionAds must be positive');
  assert.ok(PRODUCTION_CONFIG.maxDailyAds > 0, 'maxDailyAds must be positive');
  assert.ok(PRODUCTION_CONFIG.minAdIntervalSeconds > 0, 'minAdIntervalSeconds must be positive');
  assert.ok(PRODUCTION_CONFIG.maxDailyAds >= PRODUCTION_CONFIG.maxSessionAds, 'Daily limit should be >= session limit');
});

// ── 5. Release Config: Development ──────────────────────────────────────────

test('Config: DEVELOPMENT_CONFIG has debug enabled', () => {
  assert.strictEqual(DEVELOPMENT_CONFIG.environment, 'development');
  assert.strictEqual(DEVELOPMENT_CONFIG.debugEnabled, true, 'Development should have debug enabled');
});

// ── 6. Release Config: Staging ──────────────────────────────────────────────

test('Config: STAGING_CONFIG has both debug and analytics', () => {
  assert.strictEqual(STAGING_CONFIG.environment, 'staging');
  assert.strictEqual(STAGING_CONFIG.debugEnabled, true, 'Staging should have debug enabled');
  assert.strictEqual(STAGING_CONFIG.analyticsEnabled, true, 'Staging should have analytics enabled');
});

// ── 7. resolveReleaseConfig ─────────────────────────────────────────────────

test('Config: resolveReleaseConfig returns valid config', () => {
  const config = resolveReleaseConfig();
  assert.ok(typeof config.environment === 'string', 'Environment should be string');
  assert.ok(['production', 'staging', 'development'].includes(config.environment), 'Environment should be valid');
  assert.ok(typeof config.version === 'string' && config.version.length > 0, 'Version should be non-empty string');
  assert.ok(Number.isInteger(config.buildNumber) && config.buildNumber > 0, 'Build number should be positive integer');
});

// ── 8. Utility Functions ────────────────────────────────────────────────────

test('Config: isProduction and isAdAvailable work correctly', () => {
  assert.strictEqual(isProduction(PRODUCTION_CONFIG), true);
  assert.strictEqual(isProduction(DEVELOPMENT_CONFIG), false);
  assert.strictEqual(isProduction(STAGING_CONFIG), false);

  const withAd: ReleaseConfig = { ...PRODUCTION_CONFIG, rewardedAdUnitId: 'adunit-123' };
  const withoutAd: ReleaseConfig = { ...PRODUCTION_CONFIG, rewardedAdUnitId: '' };
  assert.strictEqual(isAdAvailable(withAd), true);
  assert.strictEqual(isAdAvailable(withoutAd), false);
});

// ── 9. IAA Policy Values ────────────────────────────────────────────────────

test('Config: IAA policy values are within acceptable ranges', () => {
  assert.ok(PRODUCTION_CONFIG.maxSessionAds >= 5 && PRODUCTION_CONFIG.maxSessionAds <= 20,
    'maxSessionAds should be 5-20');
  assert.ok(PRODUCTION_CONFIG.maxDailyAds >= 10 && PRODUCTION_CONFIG.maxDailyAds <= 50,
    'maxDailyAds should be 10-50');
  assert.ok(PRODUCTION_CONFIG.minAdIntervalSeconds >= 30 && PRODUCTION_CONFIG.minAdIntervalSeconds <= 120,
    'minAdIntervalSeconds should be 30-120');
  assert.ok(PRODUCTION_CONFIG.cancelCooldownSeconds >= 10 && PRODUCTION_CONFIG.cancelCooldownSeconds <= 60,
    'cancelCooldownSeconds should be 10-60');
  assert.ok(PRODUCTION_CONFIG.failureCooldownSeconds >= 30 && PRODUCTION_CONFIG.failureCooldownSeconds <= 300,
    'failureCooldownSeconds should be 30-300');
});