import assert from 'node:assert/strict';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';

const NOW = 1_800_000_000_000;

function loadRaw(raw: unknown): { data: ReturnType<SaveService['load']>; storage: MemoryStorageAdapter } {
  const storage = new MemoryStorageAdapter();
  storage.setItem('game-save', JSON.stringify(raw));
  const data = new SaveService(storage, 'game-save', () => NOW).load();
  return { data, storage };
}

function baseline(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    saveVersion: 14,
    salary: 0,
    cultivationExp: 0,
    careerLevel: 1,
    mind: 100,
    maxMind: 100,
    performance: 0,
    workSeconds: 0,
    fishingSeconds: 0,
    cultivatingSeconds: 0,
    socialSeconds: 0,
    professionExp: 0,
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
  ['conversation 缺失 participants 时加载被拦截，存档不再永久锁死（P1 回归）', () => {
    const raw = baseline({
      conversations: [
        { id: 'c1', title: '坏会话', unreadCount: 0, lastMessageAt: NOW, messages: [] },
        { id: 'c2', title: '好会话', unreadCount: 1, lastMessageAt: NOW, participants: ['player', 'npc_boss'], messages: [] },
      ],
    });
    const { data, storage } = loadRaw(raw);
    // 缺 participants 的会话被过滤，合法会话保留
    const ids = (data.conversations ?? []).map((c) => c.id);
    assert.deepEqual(ids, ['c2'], `bad conversation dropped, got: ${ids.join(',')}`);
    // 存档往返不再抛错（此前 toSaveData 展开崩溃 → 存档永久失败）
    const player = new PlayerData(data);
    const service = new SaveService(storage, 'game-save', () => NOW);
    service.save(player);
    assert.ok(storage.getItem('game-save'), 'save succeeds after load');
  }],

  ['四模式/绩效余数字段跨存档往返（P2 回归）', () => {
    const raw = baseline({
      performanceRemainder: 3,
      cultivatingMindRemainder: 7,
      socialMindRemainder: 9,
      salaryRemainder: 11,
    });
    const { data } = loadRaw(raw);
    assert.equal(data.performanceRemainder, 3, 'performanceRemainder preserved');
    assert.equal(data.cultivatingMindRemainder, 7, 'cultivatingMindRemainder preserved');
    assert.equal(data.socialMindRemainder, 9, 'socialMindRemainder preserved');
    assert.equal(data.salaryRemainder, 11, 'salaryRemainder preserved');
    const player = new PlayerData(data);
    assert.equal(player.cultivatingMindRemainder, 7);
    assert.equal(player.socialMindRemainder, 9);
    assert.equal(player.performanceRemainder, 3);
    const roundTrip = JSON.parse(JSON.stringify(player.toSaveData()));
    assert.equal(roundTrip.cultivatingMindRemainder, 7, 'survives save round-trip');
    assert.equal(roundTrip.socialMindRemainder, 9);
  }],

  ['wageMultiplier 随存档持久化，非法值回退 1（P1 回归）', () => {
    const good = loadRaw(baseline({ wageMultiplier: 1.35 }));
    assert.equal(good.data.wageMultiplier, 1.35);
    const player = new PlayerData(good.data);
    assert.equal(player.wageMultiplier, 1.35);
    const bad = loadRaw(baseline({ wageMultiplier: 'garbage' }));
    const badPlayer = new PlayerData(bad.data);
    assert.equal(badPlayer.wageMultiplier, 1, 'invalid wageMultiplier falls back to 1');
    const roundTrip = JSON.parse(JSON.stringify(player.toSaveData()));
    assert.equal(roundTrip.wageMultiplier, 1.35);
  }],

  ['存档 careerLevel 越界被钳回 1，不再启动即崩溃（P2 回归）', () => {
    const clock = new FakeClock(NOW);
    // 直接构造越界 careerLevel 的 GameContext（migrate 不校验配置表，GameContext 兜底钳制）
    const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ careerLevel: 999 }), clock, board: null });
    assert.equal(context.player.careerLevel, 1, 'out-of-range careerLevel clamped to 1');
    // 不再抛 Unknown career level
    const career = context.career.current();
    assert.ok(career, 'career.current() works after clamp');
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

console.log('save regression lock tests passed');
