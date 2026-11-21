import assert from 'node:assert/strict';

import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SettingsService } from '../../assets/scripts/services/settings-service';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function createService(storage = new MemoryStorageAdapter()): SettingsService {
  return new SettingsService(storage);
}

// ── Tests ───────────────────────────────────────────────────────────────────

function testDefaultsOnEmptyStorage(): void {
  const s = createService();
  assert.equal(s.musicEnabled, true);
  assert.equal(s.sfxEnabled, true);
  assert.equal(s.bgmVolume, 0.6);
  assert.equal(s.sfxVolume, 0.8);
  assert.equal(s.language, 'zh-CN');
  console.log('✔ Settings: defaults on empty storage');
}

function testRoundTripPersistence(): void {
  const storage = new MemoryStorageAdapter();
  const first = new SettingsService(storage);
  first.setMusicEnabled(false);
  first.setSfxEnabled(false);
  first.setBgmVolume(0.35);
  first.setSfxVolume(0.9);
  // 新实例从同一 storage 读回（应用重启语义）
  const second = new SettingsService(storage);
  assert.equal(second.musicEnabled, false);
  assert.equal(second.sfxEnabled, false);
  assert.equal(second.bgmVolume, 0.35);
  assert.equal(second.sfxVolume, 0.9);
  console.log('✔ Settings: round-trip persistence across service instances');
}

function testVolumeClamped(): void {
  const s = createService();
  s.setBgmVolume(2);
  assert.equal(s.bgmVolume, 1);
  s.setBgmVolume(-1);
  assert.equal(s.bgmVolume, 0);
  s.setSfxVolume(Number.NaN);
  assert.equal(s.sfxVolume, 0.6); // NaN → fallback 到 bgm 默认 0.6（clampVolume 兜底）
  console.log('✔ Settings: volumes clamped to [0,1], NaN falls back');
}

function testCorruptJsonFallsBackToDefaults(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem('game-settings', '{broken json!!!');
  const s = new SettingsService(storage);
  assert.equal(s.musicEnabled, true);
  assert.equal(s.sfxEnabled, true);
  console.log('✔ Settings: corrupt storage falls back to defaults (fail-soft)');
}

function testLegacySaveWithoutVolumeFieldsPreservesToggles(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem('game-settings', JSON.stringify({ musicEnabled: false, sfxEnabled: true }));
  const s = new SettingsService(storage);
  assert.equal(s.musicEnabled, false);
  assert.equal(s.sfxEnabled, true);
  assert.equal(s.bgmVolume, 0.6); // 新字段 → 默认值
  assert.equal(s.sfxVolume, 0.8);
  console.log('✔ Settings: legacy save (no volume fields) loads with volume defaults');
}

function testResetToDefaults(): void {
  const storage = new MemoryStorageAdapter();
  const s = new SettingsService(storage);
  s.setMusicEnabled(false);
  s.setBgmVolume(0.1);
  s.resetToDefaults();
  assert.equal(s.musicEnabled, true);
  assert.equal(s.bgmVolume, 0.6);
  // reset 也持久化：新实例读到默认值
  const second = new SettingsService(storage);
  assert.equal(second.musicEnabled, true);
  console.log('✔ Settings: resetToDefaults persists');
}

// ── Run ─────────────────────────────────────────────────────────────────────

const tests: Array<() => void> = [
  testDefaultsOnEmptyStorage,
  testRoundTripPersistence,
  testVolumeClamped,
  testCorruptJsonFallsBackToDefaults,
  testLegacySaveWithoutVolumeFieldsPreservesToggles,
  testResetToDefaults,
];

for (const test of tests) test();
console.log(`\nSettingsService: ${tests.length}/${tests.length} tests passed`);
