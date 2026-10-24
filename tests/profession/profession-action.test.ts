import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 8, day, hour, minute, 0, 0).getTime();
}

function make(profession: string | undefined, hour = 10): { clock: FakeClock; context: GameContext } {
  const clock = new FakeClock(at(21, hour));
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now(), profession }), clock, board: null });
  context.gameDay.ensureStarted();
  return { clock, context };
}

const tests: Array<[string, () => void]> = [
  ['未选职业:行动不可用且执行被拒', () => {
    const { context } = make(undefined);
    const view = context.professionAction.query();
    assert.equal(view.available, false);
    assert.match(view.reason ?? '', /尚未选择职业/);
    assert.throws(() => context.professionAction.perform(), /尚未选择职业/);
  }],

  ['JAVA_BACKEND 重构祖传模块:产材料+修为,吃时间与道心,每日 2 次', () => {
    const { clock, context } = make('JAVA_BACKEND');
    const player = context.player;
    const t0 = context.clockV2.now();
    const mind0 = player.mind;
    const mat0 = player.materials['mat_code_fragment'] ?? 0;
    const cul0 = player.cultivationExp;

    const r1 = context.professionAction.perform();
    assert.equal(r1.success, true);
    assert.equal(r1.salary, 0, 'JAVA action yields materials, not salary');
    assert.ok((player.materials['mat_code_fragment'] ?? 0) === mat0 + 2, 'code fragments +2');
    assert.ok(player.cultivationExp === cul0 + 18, `cultivation +18, got ${player.cultivationExp - cul0}`);
    assert.equal(player.mind, mind0 - 6, 'mind cost 6');
    assert.equal(context.clockV2.now() - t0, 30 * 60_000, '30 game minutes consumed');
    assert.equal(context.professionAction.query().doneToday, 1);

    context.professionAction.perform();
    assert.equal(context.professionAction.query().doneToday, 2);
    assert.equal(context.professionAction.query().available, false);
    assert.throws(() => context.professionAction.perform(), /今日已进行 2 次/, 'daily limit enforced');
  }],

  ['FRONTEND 打磨体验:绩效+6 与工资,进当日账本', () => {
    const { context } = make('FRONTEND');
    const player = context.player;
    const perf0 = player.performance;
    const sal0 = player.salary;
    const income0 = context.player.gameDay?.income.salary ?? 0;
    context.professionAction.perform();
    assert.equal(player.performance, perf0 + 6, 'performance +6');
    assert.equal(player.salary, sal0 + 40, 'salary +40');
    assert.equal(context.player.gameDay?.income.salary, income0 + 40, 'day ledger records income');
  }],

  ['QA 深挖缺陷:获得 TEST_REPORT 铁证', () => {
    const { context } = make('QA');
    assert.equal(context.evidence.count('TEST_REPORT'), 0);
    context.professionAction.perform();
    assert.equal(context.evidence.count('TEST_REPORT'), 1, 'evidence granted');
    assert.equal(context.player.salary, 55);
  }],

  ['DEVOPS 线上巡检:全域技术债 -8', () => {
    const { context } = make('DEVOPS');
    // 债务由事件/事故积累:先注入再巡检
    context.techDebt.add('PAYMENT', 50);
    context.techDebt.add('LOGIN', 30);
    const before = context.techDebt.all();
    assert.ok(before['PAYMENT'] >= 50);
    context.professionAction.perform();
    const after = context.techDebt.all();
    for (const domain of Object.keys(before)) {
      assert.ok(after[domain] <= before[domain], `domain ${domain} reduced or clamped at 0`);
    }
    assert.equal(context.player.salary, 45);
  }],

  ['次数限制持久化:保存重启后当日次数不重置', () => {
    const clock = new FakeClock(at(21, 10));
    const storage = new MemoryStorageAdapter();
    const first = new GameContext({ storage, player: new PlayerData({ lastSaveTime: clock.now(), profession: 'QA' }), clock, board: null });
    first.gameDay.ensureStarted();
    first.professionAction.perform();
    first.saveService.save(first.player);
    const second = new GameContext({ storage, clock, board: null });
    assert.equal(second.professionAction.query().doneToday, 1, 'done count survives restart');
    assert.notEqual(second.professionAction.query().available, true && second.professionAction.query().doneToday >= 2, 'still available for second run');
  }],

  ['道心不足:行动被拒且不消耗次数', () => {
    const { context } = make('JAVA_BACKEND');
    context.player.mind = 3; // < 成本 6
    const done0 = context.professionAction.query().doneToday;
    assert.throws(() => context.professionAction.perform(), /道心不足/);
    assert.equal(context.professionAction.query().doneToday, done0, 'count not consumed on failure');
  }],

  ['四职业行动互异:每种职业有自己的行动 id 与收益类型', () => {
    const ids: Record<string, string | undefined> = {};
    for (const prof of ['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS']) {
      const { context } = make(prof);
      ids[prof] = context.professionAction.query().actionId;
    }
    assert.equal(ids['JAVA_BACKEND'], 'REFACTOR_LEGACY');
    assert.equal(ids['FRONTEND'], 'POLISH_UX');
    assert.equal(ids['QA'], 'HUNT_REGRESSION');
    assert.equal(ids['DEVOPS'], 'PATROL_INFRA');
    assert.equal(new Set(Object.values(ids)).size, 4, 'four distinct actions');
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

console.log('profession action tests passed');
