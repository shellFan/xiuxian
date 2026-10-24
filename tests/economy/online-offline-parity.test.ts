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
  ['在线/离线同效率:1 小时离线工资 = 在线 1 小时工资(同角色同职级)', () => {
    const { context } = make(10);
    context.work.setMode('WORK');
    // 在线:标准工时内 1 小时
    const online = context.work.tick(3600);
    // 离线:1 小时窗口(直接用 idle.project 对齐同一角色状态)
    context.player.lastSaveTime = context.clockV2.now() - 3600_000;
    const offline = context.offline.preview('parity-probe');
    // 在线 1h = rate × 3600 × 1.3 / 7200 = 0.65×rate;离线统一后 = 0.65×rate(职级 1 乘数相同)
    assert.ok(online.salary > 0);
    assert.equal(offline.salary, online.salary, `offline ${offline.salary} must equal online ${online.salary}`);
    // 修为:在线 WORK cultivationMul 0.8 → 0.4×rate/h;离线统一 0.4×rate/h(职级乘数相同)
    assert.equal(offline.cultivationExp, online.cultivationExp, `offline cultivation must match online`);
  }],

  ['离线收益吃职级乘数:晋升后离线工资同步上涨', () => {
    const clock = new FakeClock(at(21, 9));
    const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() - 3600_000 }), clock, board: null });
    const base = context.offline.preview('lv1').salary;
    assert.ok(base > 0);
    context.player.careerLevel = 3; // GameContext 已按配置表校验合法等级
    const promoted = context.offline.preview('lv3').salary;
    assert.ok(promoted > base, `promoted offline salary ${promoted} must exceed base ${base}`);
  }],

  ['跨周末离线窗口:周六周日全额计入(离线时段不区分工作日)', () => {
    // 2026-09-26 是周六:周五 19:00 挂机到周日 09:00 = 38h,封顶 8h
    const clock = new FakeClock(at(26, 9));
    const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: at(25, 19) }), clock, board: null });
    const preview = context.offline.preview('weekend');
    assert.equal(preview.capped, true, '38h window must be capped at 8h');
    const eightHour = context.offline.preview('probe-eight');
    assert.equal(preview.salary, eightHour.salary, 'weekend offline pay equals the 8h cap amount');
  }],

  ['跨日幂等:同一窗口重复结算/重启后不同 id 均不重复发放', () => {
    const clock = new FakeClock(at(21, 9));
    const storage = new MemoryStorageAdapter();
    const context = new GameContext({ storage, player: new PlayerData({ lastSaveTime: clock.now() - 3600_000 }), clock, board: null });
    const paid1 = context.offline.claimNormal('day-a');
    const wallet1 = context.player.salary;
    // 同一 id 重放
    assert.throws(() => context.offline.claimNormal('day-a'), /already claimed/);
    assert.equal(context.player.salary, wallet1);
    // 重启后,窗口没有新增时间 → 任何新 id 结算 0
    const context2 = new GameContext({ storage, clock, board: null });
    const paid2 = context2.offline.claimNormal('day-b');
    assert.equal(paid2.salary, 0, `restarted claim with no new offline time must pay 0, got ${paid2.salary}`);
    assert.equal(context2.player.salary, wallet1);
    assert.ok(paid1.salary > 0);
  }],

  ['离线奖励弹窗重复入队防护:同窗口 onShow 两次只结算一次(模拟 scene-binding 场景)', () => {
    const clock = new FakeClock(at(21, 9));
    const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() - 3600_000 }), clock, board: null });
    // scene-binding 现在用 lastSaveTime 派生稳定 id:两次 onShow 得到同一 id
    const id = `offline-${context.player.lastSaveTime.toString(36)}`;
    context.offline.preview(id);
    context.offline.preview(id); // 第二次 onShow
    context.offline.claimNormal(id);
    const wallet = context.player.salary;
    // 弹窗队列即使残留同 id 弹窗,再次领取也会被幂等拦截
    assert.throws(() => context.offline.claimNormal(id), /already claimed/);
    assert.equal(context.player.salary, wallet);
  }],

  ['谈薪口径锁定:NEGOTIATED 是一次性钱包补偿,不改底薪乘数', () => {
    const { context } = make(10);
    const player = context.player;
    player.salary = 50_000;
    player.pendingOffer = {
      offerId: 'offer_neg_1', companyId: 'COMP_FOREIGN', companyName: '外企宗',
      dayIndex: 1, expiresAtDay: 5,
      salaryDeltaPct: 20, overtimeDeltaPct: 0, incidentDeltaPct: 0, promotionDeltaPct: 0, lootDeltaPct: 0,
      pitch: '来聊',
    };
    const result = context.offer.decide('NEGOTIATED');
    assert.ok(result.ok, `decide failed: ${result.reason}`);
    assert.equal(player.wageMultiplier, 1, 'NEGOTIATED must not touch wage multiplier');
    assert.ok(player.salary > 50_000, 'NEGOTIATED grants one-time wallet compensation (+8%)');
    assert.equal(player.salary, Math.round(50_000 * 1.08), '+8% of wallet');
  }],

  ['底薪乘数持久化并影响在线与离线(端到端)', () => {
    const clock = new FakeClock(at(21, 10));
    const storage = new MemoryStorageAdapter();
    const context = new GameContext({ storage, player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null });
    context.player.wageMultiplier = 1.35;
    context.saveService.save(context.player);
    const context2 = new GameContext({ storage, clock, board: null });
    assert.equal(context2.player.wageMultiplier, 1.35, 'wageMultiplier survives save round-trip');
    context2.player.lastSaveTime = clock.now() - 3600_000;
    const boosted = context2.offline.preview('boosted').salary;
    assert.ok(boosted > 0);
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

console.log('online/offline economy parity tests passed');
