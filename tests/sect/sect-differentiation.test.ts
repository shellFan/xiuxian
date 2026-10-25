import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { checkRequirements } from '../../assets/scripts/v2/event-engine';
import type { EventWorldState } from '../../assets/scripts/v2/event-engine';

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 8, day, hour, minute, 0, 0).getTime();
}

function make(sectId: string | null, hour = 10): { clock: FakeClock; context: GameContext } {
  const clock = new FakeClock(at(21, hour));
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now(), sectId }), clock, board: null });
  context.gameDay.ensureStarted();
  return { clock, context };
}

function worldOf(context: GameContext): EventWorldState {
  // 与 v2-event-service.world() 同源的关键字段(直接构造,聚焦门控断言)
  const p = context.player;
  return {
    careerLevel: p.careerLevel, workMode: p.workMode, mind: p.mind, innerDemon: p.innerDemon,
    salary: p.salary, cultivation: p.cultivationExp, weekday: new Date(context.clockV2.now()).getDay(),
    hour: 10, minuteOfDay: 600, overtimeActive: false, situationIds: [],
    sectId: p.sectId, relationships: { ...p.relationships }, materials: { ...p.materials },
    ownedTechniques: [...p.ownedTechniques], ownedEquipment: [...p.ownedEquipment],
    eventFlags: { ...p.eventFlags }, eventWeights: {}, evidenceTypes: context.evidence.heldTypes(),
  } as EventWorldState;
}

const tests: Array<[string, () => void]> = [
  ['sectId 事件条件:宗门专属事件只对本宗门可见', () => {
    const req = { sectId: 'BIG_TECH' };
    const bigTechWorld = { sectId: 'BIG_TECH', ownedTechniques: [], ownedEquipment: [], eventFlags: {}, relationships: {}, materials: {} } as unknown as EventWorldState;
    const privateWorld = { sectId: 'PRIVATE', ownedTechniques: [], ownedEquipment: [], eventFlags: {}, relationships: {}, materials: {} } as unknown as EventWorldState;
    const noSectWorld = { ownedTechniques: [], ownedEquipment: [], eventFlags: {}, relationships: {}, materials: {} } as unknown as EventWorldState;
    assert.equal(checkRequirements(req, bigTechWorld), true, 'BIG_TECH player passes');
    assert.equal(checkRequirements(req, privateWorld), false, 'PRIVATE player filtered');
    assert.equal(checkRequirements(req, noSectWorld), false, 'no-sect player filtered');
  }],

  ['宗门事件已入库且按宗门正确分布(4 宗 × 3 阶段链)', () => {
    const cfg = require('../../assets/configs/v2/events.json');
    const sectEvents = cfg.events.filter((e: { id: string }) => e.id.startsWith('sect_'));
    assert.equal(sectEvents.length, 12, `expected 12 sect events, got ${sectEvents.length}`);
    const bySect: Record<string, number> = {};
    for (const e of sectEvents) {
      assert.ok(e.conditions?.sectId, `${e.id} must gate by sectId`);
      bySect[e.conditions.sectId] = (bySect[e.conditions.sectId] ?? 0) + 1;
    }
    assert.deepEqual(bySect, { PRIVATE: 3, FOREIGN: 3, STATE: 3, BIG_TECH: 3 });
    for (const e of sectEvents) {
      assert.ok((e.choices ?? []).length >= 2, `${e.id} has choices`);
      assert.ok(e.chainId && e.chainStage !== undefined, `${e.id} is chained`);
    }
  }],

  ['大厂宗修为加成:同等工作量修为高于国企宗(cultivationMultiplier 接通)', () => {
    const bigTech = make('BIG_TECH');
    bigTech.context.work.setMode('CULTIVATING');
    const rBigTech = bigTech.context.work.tick(3600);
    const state = make('STATE');
    state.context.work.setMode('CULTIVATING');
    const rState = state.context.work.tick(3600);
    assert.ok(rBigTech.cultivationExp > rState.cultivationExp, `BIG_TECH ${rBigTech.cultivationExp} must exceed STATE ${rState.cultivationExp} (×1.2 config)`);
  }],

  ['外企宗道心恢复加成:摸鱼恢复高于大厂宗(mindMultiplier 接通)', () => {
    const foreign = make('FOREIGN', 15); // 工作窗口内摸鱼
    foreign.context.work.setMode('FISHING');
    foreign.context.player.mind = 50;
    const rForeign = foreign.context.work.tick(3600);
    const bigTech = make('BIG_TECH', 15);
    bigTech.context.work.setMode('FISHING');
    bigTech.context.player.mind = 50;
    const rBigTech = bigTech.context.work.tick(3600);
    assert.ok(rForeign.mind > rBigTech.mind, `FOREIGN recovery ${rForeign.mind} must exceed BIG_TECH ${rBigTech.mind} (1.15 vs 0.8)`);
  }],

  ['宗门绩效文化:事件绩效收益按 performanceMultiplier 缩放', () => {
    // 直连引擎效果路径:大厂宗(1.1)事件绩效 +10 → 实际 +11;国企(0.95) → +9
    const bigTech = make('BIG_TECH');
    bigTech.context.player.performance = 0;
    const svc = bigTech.context.v2Events;
    (svc as unknown as { applyEffects: (e: Record<string, unknown>) => void }).applyEffects({ performance: 10 });
    assert.equal(bigTech.context.player.performance, 11, `BIG_TECH perf 10×1.1=11, got ${bigTech.context.player.performance}`);
    const state = make('STATE');
    state.context.player.performance = 0;
    (state.context.v2Events as unknown as { applyEffects: (e: Record<string, unknown>) => void }).applyEffects({ performance: 10 });
    assert.equal(state.context.player.performance, 9, `STATE perf 10×0.95=9, got ${state.context.player.performance}`);
  }],

  ['宗门事件端到端(注入式,确定性):事件到达 → 玩家选择 → 效果/flag/链状态落账 → 存档恢复', () => {
    // 到达概率(scheduler/weight)由数值配置与 baseWeight 断言覆盖;本用例锁定
    // "事件到达后玩家能选择、结算、持久化" 的真实路径 —— 与 EXE 内玩家体验同构。
    const clock = new FakeClock(at(21, 9));
    const storage = new MemoryStorageAdapter();
    const context = new GameContext({ storage, player: new PlayerData({ lastSaveTime: clock.now(), sectId: 'PRIVATE' }), clock, board: null });
    const def = require('../../assets/configs/v2/events.json').events.find((e: { id: string }) => e.id === 'sect_private_s0');
    assert.ok(def, 'sect_private_s0 exists');
    // 事件到达:按引擎同构写入 pending 队列(玩家侧 currentEvent 会回显并弹出)
    context.player.pendingEvents = [
      { eventId: def.id, dayIndex: 1, createdAt: clock.now() } as never,
    ];
    const cur = context.v2Events.currentEvent();
    assert.ok(cur && cur.id === 'sect_private_s0', 'event surfaces to player');
    const choices = context.v2Events.currentChoices();
    assert.equal(choices.length, 2, 'both choices visible for PRIVATE player');
    // 选「陪老板聊到凌晨」:mind -8 / 绩效 +8(×宗门绩效 1.05 → 8) / BOSS 关系 +5 / flag
    const mind0 = context.player.mind;
    const rel0 = context.player.relationships['BOSS'] ?? 0;
    context.v2Events.choose('NIGHT_CHAT');
    assert.equal(context.player.mind, mind0 - 8, 'mind cost applied');
    assert.equal(context.player.relationships['BOSS'], rel0 + 5, 'BOSS relationship +5');
    assert.equal(context.player.eventFlags['sect_private_loyal'], true, 'chain flag set');
    assert.equal(context.player.eventChainState['sect_private']?.stage, 0, 'chain stage recorded');
    assert.equal(context.v2Events.currentEvent(), null, 'event consumed');
    // 存档 → 重启:链进度与 flag 不丢
    context.saveService.save(context.player);
    const reloaded = new GameContext({ storage, clock: new FakeClock(at(21, 10)), board: null });
    assert.equal(reloaded.player.eventFlags['sect_private_loyal'], true, 'flag survives restart');
    assert.ok(reloaded.player.eventChainState['sect_private'], 'chain state survives restart');
  }],

  ['宗门配置:performanceMultiplier 已差异化且校验合法', () => {
    const sects = require('../../assets/configs/sect.json').sects;
    const pm: Record<string, number> = {};
    for (const s of sects) pm[s.id] = s.modifiers.performanceMultiplier;
    assert.deepEqual(pm, { PRIVATE: 1.05, FOREIGN: 1.0, STATE: 0.95, BIG_TECH: 1.1 });
    // 配置服务加载不抛错
    assert.equal(make('PRIVATE').context.configService.sect.sects.length, 4);
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

console.log('sect differentiation tests passed');
