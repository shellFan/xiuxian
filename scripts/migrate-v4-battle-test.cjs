'use strict';
// 一次性迁移脚本：tests/v4/v4-battle.test.ts → 卡牌语义。
const fs = require('fs');
const p = 'tests/v4/v4-battle.test.ts';
let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

s = s.replace(`function driveToFinish(context: GameContext, maxTicks = 1200): BattleRunState {
  for (let i = 0; i < maxTicks; i += 1) {
    const run = context.battle.current();
    if (!run) throw new Error('battle vanished');
    if (run.skillOffers) context.battle.chooseSkill(run.skillOffers[0]);
    context.battle.tick(1);
    const finished = context.battle.finished();
    if (finished) return finished;
  }
  throw new Error('battle did not finish within budget');
}`,
`/** V5.9-O.2：卡牌驱动打完整场战斗（处理三选一；奖励挂起即视为终局）。 */
function driveToFinish(context: GameContext, maxActions = 800): BattleRunState {
  for (let i = 0; i < maxActions; i += 1) {
    const finished = context.battle.finished();
    if (finished) return finished;
    const run = context.battle.current();
    if (run?.skillOffers) {
      context.battle.chooseSkill(run.skillOffers[0]);
      continue;
    }
    const card = context.battle.battleCardView();
    if (!card) throw new Error('battle vanished');
    if (card.phase === 'REWARD_SELECTION') {
      const done = context.battle.finished();
      if (done) return done;
      throw new Error('reward pending but no finished run');
    }
    if (card.phase !== 'PLAYER_TURN') throw new Error('unexpected phase ' + card.phase);
    const enemies = card.enemies.filter((e) => e.hp > 0).sort((a, b) => a.hp - b.hp);
    const db = require('../../assets/scripts/v59o/card-battle/card-database') as typeof import('../../assets/scripts/v59o/card-battle/card-database');
    const playable = card.hand.find((c) => {
      const def = db.cardDefById(c.defId);
      if (!def || def.unplayable) return false;
      const cost = Math.max(0, def.cost - (card.player.statuses.COST_DOWN ?? 0) + c.turnCostDelta);
      if (cost > card.player.energy) return false;
      if (def.target === 'ENEMY' && enemies.length === 0) return false;
      return true;
    });
    if (playable) {
      const def = db.cardDefById(playable.defId)!;
      context.battle.playBattleCard(playable.uid, def.target === 'ENEMY' ? enemies[0]!.uid : null, 'auto_' + i + '_' + playable.uid);
    } else {
      context.battle.endBattleTurn('auto_end_' + i);
    }
  }
  throw new Error('battle did not finish within budget');
}`);

s = s.replace(`function testCombatProgressesAndKillsEnemies(): void {
  const { context } = make();
  context.battle.start('PROJECT', 'build_db');
  context.battle.tick(3);
  const run = context.battle.current()!;
  const damaged = run.enemies.some((e) => e.hp < e.maxHp) || run.kills > 0;
  assert.ok(damaged, 'auto attack must damage enemies');
  assert.ok(run.log.length > 0, 'battle log records damage');
}`,
`function testCombatProgressesAndKillsEnemies(): void {
  const { context } = make();
  context.battle.start('PROJECT', 'build_db');
  const view = context.battle.battleCardView()!;
  const strike = view.hand.find((c) => c.defId === 'card_strike');
  assert.ok(strike, 'opening hand contains a strike card');
  context.battle.playBattleCard(strike!.uid, view.enemies[0]!.uid, 'atk1');
  const run = context.battle.current()!;
  const damaged = run.enemies.some((e) => e.hp < e.maxHp) || run.kills > 0;
  assert.ok(damaged, 'playing a card must damage enemies');
  assert.ok(run.log.length > 0, 'battle log records damage');
}`);

s = s.replace(`function testLevelUpThreeChoiceAppliesSkillOnce(): void {
  const { context } = make();
  context.battle.start('PROJECT', 'build_java');
  // 快速击杀至升级：直接打满若干秒
  let sawOffers = false;
  for (let i = 0; i < 200; i += 1) {
    const run = context.battle.current()!;
    if (run.skillOffers) {
      sawOffers = true;
      assert.equal(run.skillOffers.length, 3);
      const before = run.shield;
      const pickCache = run.skillOffers.includes('skill_cache_shield') ? 'skill_cache_shield' : run.skillOffers[0];
      context.battle.chooseSkill(pickCache);
      const after = context.battle.current()!;
      assert.equal(after.skillOffers, null);
      if (pickCache === 'skill_cache_shield') {
        // 再 tick 数秒，护盾不得重复叠加
        context.battle.tick(5);
        assert.equal(context.battle.current()!.shield, before + 30);
      }
      break;
    }
    context.battle.tick(1);
  }
  assert.ok(sawOffers, 'level-up offers should appear within budget');
}`,
`function testLevelUpThreeChoiceAppliesSkillOnce(): void {
  const { context } = make();
  context.battle.start('PROJECT', 'build_java');
  const view = context.battle.battleCardView()!;
  // 弱敌一击即杀触发升级三选一。
  const run = context.battle.current()!;
  run.expNext = 5;
  view.player.attack = 9999;
  const weak = { ...view.enemies[0]!, hp: 5, maxHp: 5 };
  view.enemies = [weak];
  const strike = { uid: 't_strike_lv', defId: 'card_strike', upgraded: 0, turnCostDelta: 0 };
  view.hand.push(strike);
  context.battle.playBattleCard(strike.uid, weak.uid, 'lv1');
  const live = context.battle.current()!;
  assert.ok(live.skillOffers, 'level-up offers should appear after kill');
  assert.equal(live.skillOffers!.length, 3);
  const before = live.shield;
  const pickCache = live.skillOffers!.includes('skill_cache_shield') ? 'skill_cache_shield' : live.skillOffers![0]!;
  context.battle.chooseSkill(pickCache);
  const after = context.battle.current()!;
  assert.equal(after.skillOffers, null);
  if (pickCache === 'skill_cache_shield') {
    // tick 对卡牌战斗完全隔离，护盾不得被重复叠加
    context.battle.tick(5);
    assert.equal(context.battle.current()!.shield, before + 30);
  }
}`);

s = s.replace(`function testDefeatGrantsReducedLootOnce(): void {
  const { context } = make();
  context.battle.start('PROJECT', 'build_fish');
  // 直接把玩家打到 1 滴血，等敌人攻击落下来
  const run = context.battle.current()!;
  run.playerHp = 1;
  let finished: BattleRunState | null = null;
  for (let i = 0; i < 20 && !finished; i += 1) {
    context.battle.tick(1);
    finished = context.battle.finished();
  }
  assert.ok(finished, 'battle should be over');
  assert.equal(finished!.status, 'DEFEAT');
  const stones = context.player.spiritStones;
  context.battle.tick(5);
  assert.equal(context.player.spiritStones, stones, 'defeat rewards also exactly-once');
}`,
`function testDefeatGrantsReducedLootOnce(): void {
  const { context } = make();
  context.battle.start('PROJECT', 'build_fish');
  // 卡牌血量置 1，结束回合让敌人攻击落下来
  const view = context.battle.battleCardView()!;
  view.player.hp = 1;
  context.battle.endBattleTurn('die1');
  const finished = context.battle.finished();
  assert.ok(finished, 'battle should be over');
  assert.equal(finished!.status, 'DEFEAT');
  const stones = context.player.spiritStones;
  context.battle.tick(5);
  assert.equal(context.player.spiritStones, stones, 'defeat rewards also exactly-once');
}`);

s = s.replace(`  context.battle.start('PROJECT', 'build_java');
  context.battle.tick(4);
  context.saveService.save(context.player);`,
`  context.battle.start('PROJECT', 'build_java');
  const persistView = context.battle.battleCardView()!;
  const persistStrike = persistView.hand.find((c) => c.defId === 'card_strike')!;
  context.battle.playBattleCard(persistStrike.uid, persistView.enemies[0]!.uid, 'persist1');
  context.battle.endBattleTurn('persist_end');
  context.saveService.save(context.player);`);

fs.writeFileSync(p, s);
console.log('v4-battle migrated');
