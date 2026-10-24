import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { CURRENT_SAVE_VERSION } from '../../assets/scripts/model/save-data';

const NOW = 1_800_000_000_000;

/** v13 老存档(无 wageMultiplier/eventFlags/新字段),含合法进度。 */
function v13Baseline(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    saveVersion: 13,
    salary: 4_321,
    cultivationExp: 500,
    careerLevel: 4,
    mind: 80,
    maxMind: 100,
    performance: 30,
    workSeconds: 40_000,
    fishingSeconds: 20_000,
    cultivatingSeconds: 0,
    socialSeconds: 0,
    professionExp: 120,
    ownedTechniques: [],
    ownedEquipment: [],
    activeTasks: [],
    incidents: [],
    relationships: {},
    unlockedAchievementIds: [],
    dailyHistory: [],
    ...overrides,
  };
}

const tests: Array<[string, () => void]> = [
  ['老存档升级:合法字段不丢失,新增字段取安全默认', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('game-save', JSON.stringify(v13Baseline()));
    const clock = new FakeClock(NOW);
    const context = new GameContext({ storage, clock, board: null });
    assert.equal(context.player.salary, 4_321, 'salary preserved');
    assert.equal(context.player.careerLevel, 4, 'careerLevel preserved');
    assert.equal(context.player.wageMultiplier, 1, 'wageMultiplier defaults to 1');
    assert.deepEqual(context.player.eventFlags, {}, 'eventFlags defaults to empty');
    assert.equal((context.player.toSaveData() as { saveVersion?: number }).saveVersion, CURRENT_SAVE_VERSION, 'save version bumped on next write');
  }],

  ['老存档 → 离线结算 → 保存 → 重启 → 二次结算幂等(端到端)', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('game-save', JSON.stringify(v13Baseline({ lastSaveTime: NOW - 8 * 3600_000 })));
    const clock = new FakeClock(NOW);
    const first = new GameContext({ storage, clock, board: null });
    assert.equal(first.player.careerLevel, 4, 'old save loads with progress');
    const settlement = first.offline.claimNormal('n10-e2e-a');
    assert.ok(settlement.salary > 0, 'offline grant on migrated save');
    const wallet = first.player.salary;
    assert.equal(wallet, 4_321 + settlement.salary, 'grant added exactly once');
    first.saveService.save(first.player);

    // 重启(同 storage)
    const second = new GameContext({ storage, clock, board: null });
    assert.equal(second.player.salary, wallet, 'wallet survives restart');
    assert.equal(second.offline.isSettled('n10-e2e-a'), true, 'settlement id persisted');
    assert.throws(() => second.offline.claimNormal('n10-e2e-a'), /already claimed/, 'same id blocked after restart');
    // 新窗口无新增时间 → 0
    const again = second.offline.claimNormal('n10-e2e-b');
    assert.equal(again.salary, 0, 'no new offline time pays nothing');
    assert.equal(second.player.salary, wallet, 'wallet unchanged by zero grant');
  }],

  ['字段类型错误与极端值不引发启动死循环', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('game-save', JSON.stringify(v13Baseline({
      salary: Number.NaN,            // NaN → JSON null → 非法
      careerLevel: 999,              // 越界 → 钳 1
      wageMultiplier: 'garbage',     // 非法 → 1
      mind: 1e9,                     // 极端 → clamp
      dailyHistory: [{ dayIndex: 'x' }, null, 'bad'],
      eventFlags: 'not-an-object',
    })));
    const clock = new FakeClock(NOW);
    const context = new GameContext({ storage, clock, board: null });
    // 不抛错、可结算、可保存
    context.player.lastSaveTime = NOW - 3600_000;
    const grant = context.offline.claimNormal('corrupt-e2e');
    assert.ok(grant.salary >= 0, 'settlement works on sanitized save');
    context.saveService.save(context.player);
    assert.ok(storage.getItem('game-save'), 'save round-trip succeeds');
    const reloaded = new GameContext({ storage, clock, board: null });
    assert.equal(typeof reloaded.player.salary, 'number', 'reloaded salary is a number');
  }],

  ['损坏 JSON:fail-closed 不覆盖原文件', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('game-save', '{"saveVersion": 14, "salary": 1');
    const clock = new FakeClock(NOW);
    assert.throws(() => new GameContext({ storage, clock, board: null }), /存档|save|Save/i);
    assert.equal(storage.getItem('game-save'), '{"saveVersion": 14, "salary": 1', 'raw corrupt save untouched');
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

console.log('save compatibility e2e tests passed');
