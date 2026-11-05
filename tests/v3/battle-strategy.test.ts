/**
 * V5.9-O.2 迁移：v3 战斗策略测试从 tick 主动技语义迁到卡牌语义。
 * 防御取舍/控制削弱/精确伤害/闪避反馈/Boss 机制预警 全部走回合制卡牌路径。
 */
import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { CardRng } from '../../assets/scripts/v59o/card-battle/card-rng';
import type { CardEngineEnv } from '../../assets/scripts/v59o/card-battle/card-types';
import type { BattleRunState } from '../../assets/scripts/v3/battle-service';

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 8, day, hour, minute, 0, 0).getTime();
}

function make(rng?: () => number): { clock: FakeClock; context: GameContext } {
  const clock = new FakeClock(at(21, 10));
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: rng });
  context.gameDay.ensureStarted();
  return { clock, context };
}

/** 注入一张测试手牌（直改手牌区；引擎校验照常生效）。 */
function giveCard(context: GameContext, defId: string): string {
  const card = context.battle.battleCardView()!;
  const instance = { uid: `test_${defId}_${Math.floor(Math.random() * 1e9).toString(36)}`, defId, upgraded: 0, turnCostDelta: 0 };
  card.hand.push(instance);
  return instance.uid;
}

function envOf(context: GameContext): CardEngineEnv {
  const cards = (context.battle as unknown as { cards: { envFor: (r: BattleRunState) => CardEngineEnv } }).cards;
  return cards.envFor(context.battle.current()!);
}

const tests: Array<[string, () => void]> = [
  ['防御卡打出:获得格挡且不造成伤害(攻击/防御取舍)', () => {
    const { context } = make();
    context.battle.start('PROJECT', 'build_db');
    const view = context.battle.battleCardView()!;
    const uid = giveCard(context, 'card_iron_wall');
    const enemyHpBefore = view.enemies[0]!.hp;
    context.battle.playBattleCard(uid, null, 'def1');
    const live = context.battle.battleCardView()!;
    assert.ok(live.player.block >= 15, `block granted (got ${live.player.block})`);
    assert.equal(live.enemies[0]!.hp, enemyHpBefore, 'defensive card does not attack');
    assert.ok(live.log.some((l) => l.includes('格挡')), 'feedback logged');
    context.battle.abandon();
  }],

  ['控制卡打出:敌人陷入虚弱(下一回合伤害降低)', () => {
    const { context } = make();
    context.battle.start('PROJECT', 'build_db');
    const uid = giveCard(context, 'card_weaken');
    context.battle.playBattleCard(uid, context.battle.battleCardView()!.enemies[0]!.uid, 'ctl1');
    const live = context.battle.battleCardView()!;
    assert.ok((live.enemies[0]!.statuses.WEAK ?? 0) >= 2, 'enemy weakened by control card');
    assert.ok(live.log.some((l) => l.includes('虚弱')), 'control feedback logged');
    context.battle.abandon();
  }],

  ['攻击卡打出:精确伤害 = 攻击 × 倍率(暴击关闭)', () => {
    const { context } = make(() => 0.99); // 无暴击
    context.battle.start('PROJECT', 'build_db');
    const view = context.battle.battleCardView()!;
    const uid = giveCard(context, 'card_strike');
    const enemyHpBefore = view.enemies[0]!.hp;
    const attack = view.player.attack;
    context.battle.playBattleCard(uid, view.enemies[0]!.uid, 'atk1');
    const live = context.battle.battleCardView()!;
    const dealt = enemyHpBefore - live.enemies[0]!.hp;
    // 专克乘数（旧语义移植）：本职业怪物 +20%。
    const spec = context.profession ? context.profession.specialtyMultiplier(view.enemies[0]!.defId) : 1;
    assert.equal(dealt, Math.floor(attack * 1.0 * (spec ?? 1)), `expected ${Math.floor(attack * 1.0 * (spec ?? 1))}, got ${dealt}`);
    assert.ok(live.log.some((l) => l.includes('打出【打磨提交】')), 'play feedback logged');
    context.battle.abandon();
  }],

  ['玩家闪避:DODGE 状态吸收攻击并有反馈日志(死属性接通)', () => {
    const { context } = make();
    context.battle.start('PROJECT', 'build_db');
    const card = context.battle.battleCardView()!;
    // 单敌人 + 固定攻击意图（真实波次有 3 敌，DODGE 1 只吸收一次攻击）。
    card.enemies = [{
      ...card.enemies[0]!,
      intent: { kind: 'ATTACK', damage: card.enemies[0]!.attack, hits: 1 } as never,
    }];
    card.player.statuses.DODGE = 1;
    const hpBefore = card.player.hp;
    context.battle.endBattleTurn('dodge1'); // 敌人攻击被 DODGE 吸收
    const live = context.battle.battleCardView()!;
    assert.ok(live.log.some((l) => l.includes('闪开了')), 'dodge feedback logged');
    assert.equal(live.player.hp, hpBefore, 'no damage taken on dodge');
    context.battle.abandon();
  }],

  ['Boss 机制预警:回合计时接近时写入战斗日志(供 UI 渲染)', () => {
    const { context } = make();
    context.battle.start('PROJECT', 'build_db');
    const run = context.battle.current()!;
    const view = context.battle.battleCardView()!;
    const env = envOf(context);
    // 换成真实 Boss（带 SUMMON 机制），连续规划意图直到逼近触发窗口。
    const boss = { ...view.enemies[0]!, defId: 'boss_oom_lord', name: 'OOM 领主', tier: 'BOSS' as const };
    view.enemies[0] = boss;
    const rng = new CardRng(11);
    let telegraphed = false;
    for (let i = 0; i < 8; i += 1) {
      env.planIntent(boss, view, rng);
      if (view.log.some((l) => l.includes('⚠️'))) { telegraphed = true; break; }
    }
    assert.ok(telegraphed, 'SUMMON telegraph logged before firing');
    void run;
    context.battle.abandon();
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

console.log('v3 battle strategy tests passed');
