import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 8, day, hour, minute, 0, 0).getTime();
}

function make(hour = 10): { clock: FakeClock; context: GameContext } {
  const clock = new FakeClock(at(21, hour));
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null });
  context.gameDay.ensureStarted();
  return { clock, context };
}

const tests: Array<[string, () => void]> = [
  ['同一离线窗口不能被第二个 settlementId 重复领取（P0 回归）', () => {
    const clock = new FakeClock(at(21, 9));
    // 玩家 1 小时前最后一次存档 → 离线 1 小时
    const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() - 3600_000 }), clock, board: null });
    const wallet0 = context.player.salary;
    const previewA = context.offline.preview('offline-a');
    assert.ok(previewA.salary > 0, 'offline window has salary');
    // 领取前第二个 onShow 又生成了新 id（旧实现用 Date.now()）→ 同一窗口被再次入队缓存
    context.offline.preview('offline-b');
    // 领取 A：支付整个离线窗口
    context.offline.claimNormal('offline-a');
    const paidA = context.player.salary - wallet0;
    assert.equal(paidA, previewA.salary);
    // 领取 B：过期缓存必须失效重算 → 时间已耗尽 → 0
    const settledB = context.offline.claimNormal('offline-b');
    assert.equal(settledB.salary, 0, `second claim over the same window must pay 0, got ${settledB.salary}`);
    assert.equal(context.player.salary - wallet0, paidA, 'wallet only advanced once');
  }],

  ['已领取的 settlementId 重复领取返回 duplicate（既有幂等保障）', () => {
    const clock = new FakeClock(at(21, 9));
    const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() - 3600_000 }), clock, board: null });
    context.offline.claimNormal('offline-a');
    assert.throws(() => context.offline.claimNormal('offline-a'), /already claimed/);
  }],

  ['底薪乘数作用于在线工资（P1 回归）', () => {
    const { context } = make(10);
    context.work.setMode('WORK');
    const base = context.player.salary;
    // 第一小时：默认 wageMultiplier = 1
    const r1 = context.work.tick(3600);
    assert.ok(r1.salary > 0);
    // 第二小时：×1.5（低等级时基薪很小，floor 误差用绝对值容差）
    context.player.wageMultiplier = 1.5;
    const r2 = context.work.tick(3600);
    assert.ok(
      Math.abs(r2.salary - 1.5 * r1.salary) <= 2,
      `expected ~1.5x salary (${Math.round(1.5 * r1.salary)}), got ${r2.salary}`,
    );
    assert.ok(context.player.salary > base);
  }],

  ['底薪乘数作用于离线结算（P1 回归）', () => {
    const clock = new FakeClock(at(21, 9));
    const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() - 3600_000 }), clock, board: null });
    const base = context.offline.preview('offline-a').salary;
    assert.ok(base > 0);
    context.player.wageMultiplier = 2;
    const doubled = context.offline.preview('offline-b').salary;
    // floor 舍入在低基数下有 ±1 误差，用绝对容差（与在线 wageMultiplier 测试一致）
    assert.ok(
      Math.abs(doubled - base * 2) <= 2,
      `offline salary scales with wage multiplier: expected ~${base * 2}, got ${doubled}`,
    );
  }],

  ['Offer 接受后改写底薪乘数而不再误乘金币钱包（P1 回归）', () => {
    const { context } = make(10);
    const player = context.player;
    player.salary = 100_000; // 钱包
    player.pendingOffer = {
      offerId: 'offer_test_1', companyId: 'COMP_BIGTECH', companyName: '大厂宗',
      dayIndex: 1, expiresAtDay: 5,
      salaryDeltaPct: 35, overtimeDeltaPct: 10, incidentDeltaPct: 5, promotionDeltaPct: 10, lootDeltaPct: 0,
      pitch: '来吧',
    };
    const result = context.offer.decide('ACCEPTED');
    assert.ok(result.ok, `decide failed: ${result.reason}`);
    assert.equal(player.salary, 100_000, 'wallet must not be multiplied');
    assert.equal(player.wageMultiplier, 1.35, 'wage multiplier applied');
  }],

  ['Offer 降薪接受同样改写底薪乘数（负向 delta 不再被忽略）', () => {
    const { context } = make(10);
    const player = context.player;
    player.pendingOffer = {
      offerId: 'offer_test_2', companyId: 'COMP_STATE', companyName: '国企宗',
      dayIndex: 1, expiresAtDay: 5,
      salaryDeltaPct: -10, overtimeDeltaPct: -20, incidentDeltaPct: -10, promotionDeltaPct: 0, lootDeltaPct: 0,
      pitch: '稳定',
    };
    const result = context.offer.decide('ACCEPTED');
    assert.ok(result.ok, `decide failed: ${result.reason}`);
    assert.equal(player.wageMultiplier, 0.9, 'negative delta applies to wage');
  }],

  ['发薪日奖金已发标记持久化——重启后同日不再重发（P1 回归）', () => {
    const clock = new FakeClock(at(21, 10));
    const storage = new MemoryStorageAdapter();
    const context = new GameContext({ storage, player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null });
    // 扫描最多 90 个游戏日找一个发薪日（局势确定性 per dayIndex）
    let paydayFound = false;
    for (let i = 0; i < 90 && !paydayFound; i += 1) {
      context.gameDay.ensureStarted();
      if (context.gameDay.aggregateEffects().salaryBonusFlat > 0) paydayFound = true;
      else {
        if (context.player.gameDay) context.player.gameDay.settled = true;
        clock.advance(24 * 3600_000);
      }
    }
    assert.ok(paydayFound, 'no payday situation found within 90 days — config regression?');
    context.gameDay.ensureStarted();
    const bonus = context.gameDay.aggregateEffects().salaryBonusFlat;
    const dayIndex = context.player.gameDay!.dayIndex;
    const wallet0 = context.player.salary;
    context.v2Economy.tick(1);
    assert.equal(context.player.salary - wallet0, Math.floor(bonus), 'payday bonus granted');
    assert.equal(context.player.eventFlags[`paydayBonusDay_${dayIndex}`], true, 'paid flag persisted in eventFlags');
    context.saveService.save(context.player);
    // 模拟重启：从同一 storage 重新加载
    const context2 = new GameContext({ storage, clock, board: null });
    const wallet1 = context2.player.salary;
    context2.v2Economy.tick(1);
    assert.equal(context2.player.salary, wallet1, 'payday bonus must NOT be re-granted after restart');
    assert.equal(context2.player.eventFlags[`paydayBonusDay_${dayIndex}`], true);
  }],
];

for (const [name, run] of tests) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

console.log('economy offline/wage regression tests passed');
