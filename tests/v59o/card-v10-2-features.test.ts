/**
 * V10.2 卡牌战斗遗留功能补全测试：
 * 1. 奖励替换（Transform）——每场一次、扣灵石、rng 回写、替换后可正常领取；
 * 2. 卡组预设（deck presets）——保存/启用/停用过滤战斗卡组与卡组视图；
 * 3. 预设存档字段清洗（PlayerData sanitize）。
 */
import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { CARD_DECK_PRESET_SLOTS, CARD_REWARD_TRANSFORM_COST } from '../../assets/scripts/v59o/card-battle/card-battle-service';
import { cardDefById } from '../../assets/scripts/v59o/card-battle/card-database';

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 8, day, hour, minute, 0, 0).getTime();
}

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function make(hour = 10, seed = 0x5eed): { clock: FakeClock; context: GameContext } {
  const clock = new FakeClock(at(21, hour));
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: seededRng(seed) });
  context.gameDay.ensureStarted();
  return { clock, context };
}

/** 逐动作自动战斗：处理升级三选一；可出牌则出，否则结束回合；到达奖励/终局即停。 */
function autoPlay(context: GameContext, maxActions = 500): void {
  for (let i = 0; i < maxActions; i += 1) {
    const run = context.battle.current();
    if (run?.skillOffers) {
      context.battle.chooseSkill(run.skillOffers[0]);
      continue;
    }
    const card = context.battle.battleCardView();
    if (!card) return;
    if (card.reward) return;
    if (card.phase !== 'PLAYER_TURN') return;
    const enemies = card.enemies.filter((e) => e.hp > 0).sort((a, b) => a.hp - b.hp);
    const playable = card.hand.find((c) => {
      const def = cardDefById(c.defId)!;
      if (def.unplayable) return false;
      const cost = Math.max(0, def.cost - (card.player.statuses.COST_DOWN ?? 0) + c.turnCostDelta);
      if (cost > card.player.energy) return false;
      if (def.target === 'ENEMY' && enemies.length === 0) return false;
      return true;
    });
    if (playable) {
      const def = cardDefById(playable.defId)!;
      const target = def.target === 'ENEMY' ? enemies[0]!.uid : null;
      context.battle.playBattleCard(playable.uid, target, `a${i}_${playable.uid}`);
    } else {
      context.battle.endBattleTurn(`a${i}_end`);
    }
  }
}

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

ok('Transform：胜利奖励候选重掷一次（扣灵石、标记 transformed、二次替换抛错、替换后可领取）', () => {
  const { context } = make();
  context.battle.start('PROJECT', 'build_java');
  autoPlay(context, 900);
  const card = context.battle.battleCardView();
  assert.ok(card && card.reward, 'autoPlay 应到达胜利奖励选择');
  const stonesBase = Math.max(context.player.spiritStones, CARD_REWARD_TRANSFORM_COST + 10);
  context.player.spiritStones = stonesBase;
  const beforeCount = card.reward!.candidates.length;
  assert.ok(beforeCount > 0);

  context.battle.transformBattleCardReward();

  const after = context.battle.battleCardView();
  assert.ok(after && after.reward);
  assert.equal(after.reward!.transformed, true, '本场应标记已替换');
  assert.equal(after.reward!.candidates.length, beforeCount, '重掷后仍是 3 张候选');
  assert.equal(context.player.spiritStones, stonesBase - CARD_REWARD_TRANSFORM_COST, '应扣除替换费用');
  assert.throws(() => context.battle.transformBattleCardReward(), /每场限一次/, '二次替换必须抛错');

  const pick = after.reward!.candidates[0];
  context.battle.claimBattleCardReward(pick);
  const finalView = context.battle.battleCardView();
  assert.ok(finalView && finalView.reward);
  assert.equal(finalView.reward!.claimed, true, '替换后的候选仍可正常领取');
  assert.ok((context.player.cardCollection[pick] ?? 0) >= 1, '替换后的候选领取入收藏');
});

ok('Transform：灵石不足时拒绝并保留原候选', () => {
  const { context } = make();
  context.battle.start('PROJECT', 'build_java');
  autoPlay(context, 900);
  const card = context.battle.battleCardView();
  assert.ok(card && card.reward);
  context.player.spiritStones = CARD_REWARD_TRANSFORM_COST - 1;
  const before = [...card.reward!.candidates];
  assert.throws(() => context.battle.transformBattleCardReward(), /灵石不足/);
  const afterView = context.battle.battleCardView();
  assert.deepEqual(afterView!.reward!.candidates, before, '失败替换不改变候选');
  assert.equal(afterView!.reward!.transformed, undefined, '失败替换不写标记');
});

ok('卡组预设：保存/启用/停用真实过滤战斗卡组与卡组视图', () => {
  const { context } = make();
  context.battle.start('PROJECT', 'build_java');
  const baseDeck = context.battle.cardDeckView();
  assert.ok(baseDeck.total > 0);
  const someId = Object.keys(baseDeck.manifest)[0];
  const someCount = baseDeck.manifest[someId];
  assert.ok(someCount > 0);

  context.battle.saveCardDeckPreset('1', [someId]);
  context.battle.activateCardDeckPreset('1');
  const filtered = context.battle.cardDeckView();
  assert.equal(filtered.manifest[someId] ?? 0, 0, '启用预设后该卡不编入');
  assert.equal(filtered.total, baseDeck.total - someCount, '卡组总数同步减少');

  context.battle.activateCardDeckPreset(null);
  const restored = context.battle.cardDeckView();
  assert.equal(restored.manifest[someId], someCount, '停用后恢复编入');
  assert.equal(restored.total, baseDeck.total);

  assert.throws(() => context.battle.saveCardDeckPreset('9', [someId]), /槽位无效/);
  assert.throws(() => context.battle.activateCardDeckPreset('9'), /槽位无效/);

  // 守卫：全部排除会把战斗卡组抽空（<5 张），必须拒绝
  const allIds = Object.keys(baseDeck.manifest);
  assert.throws(() => context.battle.saveCardDeckPreset('3', allIds), /低于 5 张/);
});

ok('卡组预设：保存时过滤未知卡 id，视图返回 3 槽', () => {
  const { context } = make();
  const baseDeck = context.battle.cardDeckView();
  const someId = Object.keys(baseDeck.manifest)[0];
  const view = context.battle.saveCardDeckPreset('2', [someId, 'card_not_exist', someId]);
  assert.deepEqual(view.presets['2'], [someId], '未知 id 与重复 id 被剔除');
  assert.deepEqual(view.slots, CARD_DECK_PRESET_SLOTS);
  assert.equal(view.active, null, '默认无启用预设');
});

ok('卡组预设存档字段经 PlayerData 清洗（非法槽位/超长 id/重复 id 剔除）', () => {
  const longId = 'x'.repeat(80);
  const p = new PlayerData({
    cardDeckPresetExcludes: { '1': ['card_block', longId, 'card_block'], '9': ['card_block'] },
    activeDeckPreset: '7',
  });
  assert.deepEqual(p.cardDeckPresetExcludes['1'], ['card_block']);
  assert.equal(p.cardDeckPresetExcludes['9'], undefined);
  assert.equal(p.activeDeckPreset, null);
  const saved = p.toSaveData();
  assert.deepEqual(saved.cardDeckPresetExcludes, { '1': ['card_block'] });
  assert.equal(saved.activeDeckPreset, null);
});

console.log(`v10.2 card feature tests passed (${passed})`);
