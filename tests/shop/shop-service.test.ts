import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';
import { ShopService, type ShopConfig } from '../../assets/scripts/services/shop-service';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function createContext(playerOverrides: Record<string, unknown> = {}): GameContext {
  return new GameContext({
    player: new PlayerData(playerOverrides),
    saveService: new SaveService(new MemoryStorageAdapter()),
  });
}

const TEST_GOODS: ShopConfig['goods'] = [
  { id: 'g_stone', name: '灵石袋', description: '灵石 ×20', currency: 'salary', price: 150, stockPerDay: 2, careerLevel: 1, effect: { spiritStones: 20 } },
  { id: 'g_pill', name: '聚气丹', description: '修为 +50', currency: 'spiritStones', price: 8, stockPerDay: 5, careerLevel: 1, effect: { cultivation: 50 } },
  { id: 'g_locked', name: '高阶商品', description: 'Lv.5 解锁', currency: 'spiritStones', price: 100, stockPerDay: 1, careerLevel: 5, effect: { cultivation: 500 } },
];

const TEST_CONFIG: ShopConfig = { schemaVersion: 1, status: 'TEST', goods: TEST_GOODS };

// ── Tests ────────────────────────────────────────────────────────────────────

function testBuyDeductsCurrencyAndAppliesEffect(): void {
  const ctx = createContext({ careerLevel: 1, salary: 200, spiritStones: 50 });
  const shop = new ShopService(ctx, TEST_CONFIG);
  const r = shop.buy('g_stone');
  assert.equal(r.success, true);
  assert.equal(ctx.player.salary, 50); // 200-150
  assert.equal(ctx.player.spiritStones, 70); // 50+20
  console.log('✔ Shop: buy deducts currency and applies effect');
}

function testDailyPurchaseLimitAndDayRollover(): void {
  const clock = new FakeClock(Date.UTC(2026, 10, 20, 12)); // day1 UTC
  const storage = new MemoryStorageAdapter();
  const ctx = createContext({ careerLevel: 1, salary: 5000, spiritStones: 100, clock: undefined as never });
  const shop = new ShopService(ctx, TEST_CONFIG, { clock });
  // 买满 2 次限购（每次 salary 150）
  assert.equal(shop.buy('g_stone').success, true);
  assert.equal(shop.buy('g_stone').success, true);
  const third = shop.buy('g_stone');
  assert.equal(third.success, false);
  assert.equal(third.reason, '今日已售罄');
  // 跨 UTC 日 → 限购刷新
  clock.advance(24 * 3600 * 1000);
  const nextDay = shop.buy('g_stone');
  assert.equal(nextDay.success, true);
  console.log('✔ Shop: daily limit enforced, refreshes on UTC day rollover');
}

function testLockedByCareerLevel(): void {
  const ctx = createContext({ careerLevel: 1, spiritStones: 1000 });
  const shop = new ShopService(ctx, TEST_CONFIG);
  const r = shop.buy('g_locked');
  assert.equal(r.success, false);
  assert.equal(r.reason, '职级 Lv.5 解锁');
  const view = shop.getView().find((g) => g.id === 'g_locked')!;
  assert.equal(view.unlocked, false);
  console.log('✔ Shop: career-level locked goods rejected with reason');
}

function testInsufficientCurrencyRejected(): void {
  const ctx = createContext({ careerLevel: 1, spiritStones: 5 });
  const shop = new ShopService(ctx, TEST_CONFIG);
  const r = shop.buy('g_pill'); // 8 灵石
  assert.equal(r.success, false);
  assert.equal(r.reason, '灵石不足');
  assert.equal(ctx.player.spiritStones, 5);
  console.log('✔ Shop: insufficient currency rejected without deduction');
}

function testPerGoodsLimitIndependent(): void {
  const ctx = createContext({ careerLevel: 1, salary: 500, spiritStones: 100 });
  const shop = new ShopService(ctx, TEST_CONFIG);
  assert.equal(shop.buy('g_stone').success, true);
  // g_stone 限购 2，但 g_pill（灵石货币）互不影响
  const pill = shop.buy('g_pill');
  assert.equal(pill.success, true);
  assert.equal(ctx.player.cultivationExp, 50);
  console.log('✔ Shop: per-goods limits are independent across currencies');
}

function testInvalidConfigThrows(): void {
  assert.throws(() => new ShopService(createContext(), { schemaVersion: 1, status: 'x', goods: [TEST_GOODS[0], TEST_GOODS[0]] }), /Duplicate shop goods id/);
  assert.throws(() => new ShopService(createContext(), { schemaVersion: 1, status: 'x', goods: [{ ...TEST_GOODS[0], price: 0 }] }), /price/);
  assert.throws(() => new ShopService(createContext(), { schemaVersion: 1, status: 'x', goods: [{ ...TEST_GOODS[0], stockPerDay: 0 }] }), /stockPerDay/);
  assert.throws(() => new ShopService(createContext(), { schemaVersion: 1, status: 'x', goods: [{ ...TEST_GOODS[0], currency: 'gold' as never }] }), /currency/);
  console.log('✔ Shop: invalid config rejected at construction');
}

function testProductionConfigLoads(): void {
  const shopConfig = require('../../assets/configs/shop.json') as ShopConfig;
  const shop = new ShopService(createContext(), shopConfig);
  assert.equal(shop.allGoods.length, 7);
  console.log('✔ Shop: production config loads 7 goods');
}

// ── Run ──────────────────────────────────────────────────────────────────────

const tests: Array<() => void> = [
  testBuyDeductsCurrencyAndAppliesEffect,
  testDailyPurchaseLimitAndDayRollover,
  testLockedByCareerLevel,
  testInsufficientCurrencyRejected,
  testPerGoodsLimitIndependent,
  testInvalidConfigThrows,
  testProductionConfigLoads,
];

for (const test of tests) test();
console.log(`\nShopService: ${tests.length}/${tests.length} tests passed`);
