/**
 * V10 ULTIMATE §8 — 五个新增 Boss 的机制单元测试。
 * 纯函数直测 boss-mechanics-ultimate + 配置完整性（10 具名 Boss 全部有 mechanics/phase2）。
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { applyUltimateBossMechanic, type UltimateMechanicDef } from '../../assets/scripts/v59o/card-battle/boss-mechanics-ultimate';
import type { CardBattleState, CardEnemy } from '../../assets/scripts/v59o/card-battle/card-types';

const battleExtension = require(path.resolve(__dirname, '../../../..', 'assets', 'configs', 'v57', 'battle-extension.json')) as {
  monsters: Array<{ id: string; name: string; tier: string; hp: number; attack: number }>;
  bossMechanics: Record<string, { mechanics: Array<{ kind: string }>; phase2?: { atHpPct: number; attackMul?: number } }>;
};

function makeEnemy(hp = 100, attack = 10): CardEnemy {
  return {
    uid: 'e1', defId: 'boss_test', name: '测试Boss', tier: 'BOSS',
    hp, maxHp: hp, attack, block: 0, statuses: {}, intent: null, timers: {}, telegraphed: {},
  };
}

function makeState(overrides: Partial<CardBattleState['player']> = {}): CardBattleState {
  return {
    player: {
      hp: 200, maxHp: 200, attack: 10, block: 0, energy: 3,
      statuses: {}, ...overrides,
    },
    enemies: [],
    log: [],
  } as unknown as CardBattleState;
}

function run(kind: UltimateMechanicDef['kind'], enemy: CardEnemy, state: CardBattleState, mech?: Omit<UltimateMechanicDef, 'kind'>) {
  const strikes: Array<{ raw: number; label?: string }> = [];
  const lines: string[] = [];
  applyUltimateBossMechanic(kind, { kind, ...mech } as UltimateMechanicDef, enemy, state, (l) => lines.push(l), {
    strikePlayer: (raw, label) => strikes.push({ raw, label }),
  });
  return { strikes, lines };
}

// 1. ENERGY_LEECH：记录到 pendingEnergyLeech（下回合结算）+ 立即化盾
{
  const enemy = makeEnemy(100, 10);
  const state = makeState({ energy: 3 });
  const { strikes, lines } = run('ENERGY_LEECH', enemy, state, { energyDrain: 1, shieldPct: 0.05 });
  assert.equal(state.pendingEnergyLeech, 1, 'drain must be recorded for next player turn');
  assert.equal(state.player.energy, 3, 'current-turn energy untouched (startPlayerTurn resets it anyway)');
  assert.equal(enemy.block, 5, 'shield = 5% of maxHp');
  assert.equal(strikes.length, 0, 'no direct damage');
  assert.ok(lines[0].includes('吞噬'));
  // 累计：连续两次吞噬叠加，由 startPlayerTurn 一次性结算
  run('ENERGY_LEECH', enemy, state, { energyDrain: 1, shieldPct: 0.05 });
  assert.equal(state.pendingEnergyLeech, 2, 'repeated leech stacks');
}
console.log('ok - ENERGY_LEECH 吞噬记入下回合结算并化盾');

// 2. MIRROR：复制玩家最近出牌反噬
{
  const enemy = makeEnemy(100, 10);
  const state = makeState({ energy: 3 });
  state.lastPlayedCardName = 'JVM 调优';
  state.lastPlayedDamageMul = 1.2;
  const { strikes } = run('MIRROR', enemy, state, { mirrorScale: 1.0 });
  assert.equal(strikes.length, 1);
  assert.equal(strikes[0].raw, Math.floor(10 * 1.2), 'damage = boss attack × mirrored mul');
  assert.ok((strikes[0].label || '').includes('镜像'));
  const empty = makeState();
  const enemy2 = makeEnemy(100, 10);
  const r2 = run('MIRROR', enemy2, empty);
  assert.equal(r2.strikes.length, 0, '无可复制牌时不造成伤害');
}
console.log('ok - MIRROR 复制最近出牌');

// 3. COUNTER_STANCE：按攻防行为分支
{
  const enemy = makeEnemy(100, 10);
  enemy.hp = 80; // 受损后才能观察到自满回血
  const turtle = makeState({ block: 12 });
  run('COUNTER_STANCE', enemy, turtle, { blockGate: 10 });
  assert.ok((turtle.player.statuses.VULNERABLE ?? 0) >= 2, '龟缩分支：易伤');
  assert.ok(enemy.hp > 80, '龟缩分支：Boss 回血');
  const enemy2 = makeEnemy(100, 10);
  const aggro = makeState({ block: 0 });
  run('COUNTER_STANCE', enemy2, aggro, { blockGate: 10 });
  assert.ok((enemy2.statuses.STRENGTH ?? 0) >= 2, '强攻分支：Boss 力量');
}
console.log('ok - COUNTER_STANCE 行为反制分支');

// 4. TRIBULATION_COUNTDOWN：进入 SPECIAL 即引爆（节奏由 planIntent 的 everySec 驱动，
//    机制内部不再持有第二个计时器——否则实际间隔会被相乘放大）
{
  const enemy = makeEnemy(100, 16);
  const state = makeState();
  const r = run('TRIBULATION_COUNTDOWN', enemy, state, { strikeDamageMul: 2.5 });
  assert.equal(r.strikes.length, 1, '每次 SPECIAL 到点必然引爆一次天劫');
  assert.equal(r.strikes[0].raw, Math.floor(16 * 2.5), '引爆伤害 = 攻击 × 倍率');
  assert.equal(enemy.timers.tribulationTurns, undefined, '机制内部不维护第二套倒计时');
}
console.log('ok - TRIBULATION_COUNTDOWN 到点即引爆（无双重计时）');

// 5. 配置完整性：任务点名的十 Boss 全部存在且有 mechanics/phase2
{
  const required = [
    'boss_kpi_tyrant', 'boss_overtime_demon', 'boss_bug_behemoth', 'boss_req_phantom',
    'boss_version_calamity', 'boss_resource_devourer', 'boss_code_inner_demon',
    'boss_performance_judge', 'boss_tribulation_foreman', 'boss_final_boss',
  ];
  const monsters = new Map(battleExtension.monsters.map((m) => [m.id, m]));
  for (const id of required) {
    const monster = monsters.get(id);
    assert.ok(monster, `boss monster ${id} must exist`);
    assert.equal(monster.tier, 'BOSS');
    const mech = battleExtension.bossMechanics[id];
    assert.ok(mech, `boss ${id} must have bossMechanics`);
    assert.ok(mech.mechanics.length >= 2, `boss ${id} needs >=2 mechanics`);
    assert.ok(mech.phase2, `boss ${id} must have phase2`);
    const kinds = new Set(mech.mechanics.map((m) => m.kind));
    assert.ok(kinds.size === mech.mechanics.length, `boss ${id} mechanics must be distinct`);
  }
  const fin = battleExtension.bossMechanics['boss_final_boss'];
  assert.ok(fin.phase2 && fin.phase2.atHpPct === 0.5 && (fin.phase2.attackMul ?? 1) <= 2, '终极老板 Phase2 有界');
  for (const m of fin.mechanics) assert.ok(m.kind !== 'REVIVE', '终极老板不可复活（无无尽战斗）');
}
console.log('ok - 十具名 Boss 配置完整');

console.log('v10-ultimate boss mechanics tests passed');
