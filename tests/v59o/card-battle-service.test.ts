/**
 * V5.9-O.2 服务桥接层测试：
 * 完整战斗流程/tick 隔离/旧 tick 存档迁移/存档恢复/Boss 机制回合化/四职业差异/奖励入收藏。
 */
import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { isCardBattleState } from '../../assets/scripts/v59o/card-battle/card-engine';
import { secondsToTurns } from '../../assets/scripts/v59o/card-battle/card-battle-service';
import { cardDefById } from '../../assets/scripts/v59o/card-battle/card-database';
import { CardRng } from '../../assets/scripts/v59o/card-battle/card-rng';
import type { BattleRunState } from '../../assets/scripts/v3/battle-service';

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

/** 逐动作自动战斗：处理升级三选一；可出牌则出，否则结束回合。 */
function autoPlay(context: GameContext, maxActions = 500): void {
  for (let i = 0; i < maxActions; i += 1) {
    const run = context.battle.current();
    if (run?.skillOffers) {
      context.battle.chooseSkill(run.skillOffers[0]);
      continue;
    }
    const card = context.battle.battleCardView();
    if (!card) return;
    if (card.reward) return; // 等待奖励选择
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

ok('开局：五手牌三能量，tick 不造成任何伤害（旧自动攻击隔离）', () => {
  const { context } = make();
  context.battle.start('PROJECT', 'build_java');
  const card = context.battle.battleCardView();
  assert.ok(card && isCardBattleState(card));
  assert.equal(card.hand.length, 5);
  assert.equal(card.player.energy, 3);
  assert.equal(card.phase, 'PLAYER_TURN');
  const run = context.battle.current()!;
  assert.equal(run.mode, 'CARD');
  const hpBefore = card.player.hp;
  const enemiesBefore = card.enemies.map((e) => e.hp);
  context.battle.tick(5);
  context.battle.tick(60);
  const after = context.battle.battleCardView()!;
  assert.equal(after.player.hp, hpBefore, 'tick 不得造成伤害');
  assert.deepEqual(after.enemies.map((e) => e.hp), enemiesBefore, 'tick 不得驱动敌人行动');
});

ok('完整战斗：出牌→结束回合→敌人行动→波次推进→胜利→奖励入收藏', () => {
  const { context } = make(10, 0xbeef);
  context.battle.start('PROJECT', 'build_java');
  autoPlay(context);
  const finished = context.battle.finished();
  assert.ok(finished, '战斗应已结束');
  assert.equal(finished.status, 'VICTORY');
  assert.equal(finished.rewardsClaimed, true, '胜利掉落应已结算（exactly once）');
  assert.ok(finished.loot.spiritStones >= 0);
  // 卡牌奖励选择。
  const card = context.battle.battleCardView()!;
  assert.ok(card.reward && card.reward.candidates.length > 0);
  const pick = card.reward.candidates[0]!;
  context.battle.claimBattleCardReward(pick);
  assert.equal(context.battle.battleCardView()!.phase, 'FINISHED');
  assert.ok((context.player.cardCollection[pick] ?? 0) >= 1, '所选卡牌应真正加入收藏');
  assert.throws(() => context.battle.claimBattleCardReward(pick), /已领取|没有/);
  // 收拾战场。
  context.battle.dismissFinished();
  assert.equal(context.battle.finished(), null);
});

ok('存档恢复：出牌后保存 → 重载上下文 → 手牌/能量/回合/牌堆一致', () => {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(at(21, 10));
  const context = new GameContext({ storage, player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: seededRng(0x77) });
  context.gameDay.ensureStarted();
  context.battle.start('PROJECT', 'build_java');
  const before = context.battle.battleCardView()!;
  // 打一张牌 + 结束回合。
  const strike = before.hand.find((c) => c.defId === 'card_strike')!;
  context.battle.playBattleCard(strike.uid, before.enemies[0]!.uid, 'p1');
  const afterPlay = context.battle.battleCardView()!;
  context.battle.endBattleTurn('e1');
  context.battle.playBattleCard(context.battle.battleCardView()!.hand[0]!.uid, null, 'p2');
  const snapshot = context.battle.battleCardView()!;
  context.saveService.save(context.player);
  // 新上下文读档（存档为扁平 player 结构）。
  const raw = storage.getItem('game-save');
  assert.ok(raw && raw.length > 0, '存档应已写入');
  const savedData = JSON.parse(raw);
  assert.equal(savedData.activeBattleRun?.mode, 'CARD');
  assert.ok(savedData.activeBattleRun?.card, '存档必须携带卡牌状态');
  const player2 = new PlayerData(savedData);
  const context2 = new GameContext({ storage, player: player2, clock: new FakeClock(clock.now() + 5000), board: null, battleRng: seededRng(0x99) });
  const restored = context2.battle.battleCardView();
  assert.ok(restored && isCardBattleState(restored), '重启后卡牌战斗必须恢复');
  assert.equal(restored.turn, snapshot.turn);
  assert.equal(restored.player.energy, snapshot.player.energy);
  assert.equal(restored.player.hp, snapshot.player.hp);
  assert.equal(restored.hand.length, snapshot.hand.length);
  assert.deepEqual(restored.hand.map((c) => c.defId), snapshot.hand.map((c) => c.defId));
  assert.equal(restored.drawPile.length, snapshot.drawPile.length);
  assert.equal(restored.discardPile.length, snapshot.discardPile.length);
  assert.deepEqual(restored.enemies.map((e) => [e.uid, e.hp]), snapshot.enemies.map((e) => [e.uid, e.hp]));
  assert.equal(restored.rng.counter, snapshot.rng.counter, '随机数状态必须一致（可回放）');
  // 恢复后可继续出牌。
  const target = restored.enemies.find((e) => e.hp > 0);
  const playable = restored.hand.find((c) => { const d = cardDefById(c.defId)!; return !d.unplayable && d.target === 'ENEMY'; });
  if (playable && target) {
    context2.battle.playBattleCard(playable.uid, target.uid, 'r1');
    assert.notEqual(context2.battle.battleCardView()!.lastActionId, null);
  }
});

ok('旧 tick 存档迁移：FIGHTING 且无 card → 放弃结算（30% 掉落）且不伪造战斗', () => {
  const { context } = make(10, 0x1234);
  // 手造旧 tick 战斗。
  const legacy = {
    runId: 'run_legacy',
    source: 'PROJECT',
    linkedTaskId: null,
    linkedIncidentId: null,
    buildId: 'build_java',
    night: false,
    dayIndex: context.player.gameDay!.dayIndex,
    status: 'FIGHTING',
    wave: 1,
    waveTotal: 5,
    playerHp: 100,
    playerMaxHp: 140,
    shield: 0,
    attack: 12,
    intervalSec: 0.9,
    critChance: 0.05,
    level: 2,
    exp: 5,
    expNext: 45,
    skills: ['skill_null_sword'],
    skillLevels: { skill_null_sword: 1 },
    evolvedSkills: [],
    synergies: [],
    skillOffers: null,
    skillOfferKind: null,
    enemies: [],
    kills: 3,
    loot: { materials: { mat_code_fragment: 4 }, equipment: [], spiritStones: 30, expGained: 25 },
    bossDrops: [],
    rewardsClaimed: false,
    replayOf: null,
    replayBossId: null,
    log: ['旧战斗'],
  } as unknown as BattleRunState;
  context.player.activeBattleRun = legacy;
  // 首次访问触发迁移。
  assert.equal(context.battle.current(), null, '旧战斗不得复活为进行中');
  const finished = context.battle.finished()!;
  assert.ok(finished);
  assert.equal(finished.status, 'DEFEAT');
  assert.equal(finished.rewardsClaimed, true);
  assert.equal(context.v2Items.materialCount('mat_code_fragment'), 1, '30% 折算：4 → 1（floor）');
  assert.equal(finished.loot.spiritStones, 9, '30% 折算：30 → 9');
  assert.ok(finished.log.some((l) => l.includes('回合制卡牌')), '必须记录迁移原因');
  // 结算后可开新战斗。
  const run = context.battle.start('PROJECT', 'build_java');
  assert.equal(run.mode, 'CARD');
});

ok('Boss 机制回合化：封技/致盲/召唤/Phase2', () => {
  const { context } = make(10, 0x4242);
  context.battle.start('PROJECT', 'build_java');
  const run = context.battle.current()!;
  const card = run.card!;
  const cards = (context.battle as unknown as { cards: { envFor: (r: BattleRunState) => import('../../assets/scripts/v59o/card-battle/card-types').CardEngineEnv } }).cards;
  const e = cards.envFor(run);
  const boss = card.enemies[0]!;
  const rng = new CardRng(7);
  const lines: string[] = [];
  e.runBossSpecial(boss, { kind: 'SPECIAL', mechanic: 'LOCK_SKILL' }, card, rng, (l) => lines.push(l));
  assert.ok(card.hand.some((c) => c.defId === 'card_deadlock') || card.discardPile.some((c) => c.defId === 'card_deadlock'), '封技应塞入死锁诅咒');
  assert.ok(lines.some((l) => l.includes('死锁')));
  e.runBossSpecial(boss, { kind: 'SPECIAL', mechanic: 'BLIND' }, card, rng, (l) => lines.push(l));
  assert.ok((card.player.statuses.BLIND ?? 0) >= 2, '致盲应给玩家 BLIND');
  e.runBossSpecial(boss, { kind: 'SPECIAL', mechanic: 'SUMMON' }, card, rng, (l) => lines.push(l));
  assert.ok(card.enemies.length > 1, '召唤应增加敌人');
  // Phase2（使用真实带 phase2 的 Boss：boss_oom_lord，阈值 50%）。
  const p2boss = {
    uid: 'boss_oom_lord_x', defId: 'boss_oom_lord', name: 'OOM 之主', tier: 'BOSS' as const,
    hp: 200, maxHp: 1000, attack: 10, block: 0, statuses: {}, intent: null,
    timers: {}, telegraphed: {}, phase2Active: false, revived: 0,
  };
  card.enemies[0] = p2boss;
  const atkBefore = p2boss.attack;
  e.runBossSpecial(p2boss, { kind: 'SPECIAL', mechanic: 'ATTACK' }, card, rng, (l) => lines.push(l));
  assert.equal(p2boss.phase2Active, true, 'Phase2 应触发');
  assert.ok(p2boss.attack > atkBefore || atkBefore === 0, 'Phase2 应提升攻击');
  // 换算表。
  assert.equal(secondsToTurns(2), 1);
  assert.equal(secondsToTurns(10), 5);
  assert.equal(secondsToTurns(1), 1);
});

ok('四职业卡组差异：基础职业卡各不相同', () => {
  const profCard: Record<string, string> = {
    JAVA_BACKEND: 'card_java_basic',
    FRONTEND: 'card_fe_basic',
    QA: 'card_qa_basic',
    DEVOPS: 'card_devops_basic',
  };
  for (const professionId of Object.keys(profCard)) {
    const { context } = make(10, 0x1111);
    context.profession.choose(professionId as never);
    context.battle.start('PROJECT', 'build_java');
    const card = context.battle.battleCardView()!;
    const deckIds = Object.keys(card.deckManifest);
    assert.ok(deckIds.includes(profCard[professionId]!), `${professionId} 卡组应含其职业卡`);
    // 其他职业的专属奖励卡不在基础卡组。
    for (const [other, otherCard] of Object.entries(profCard)) {
      if (other !== professionId) {
        assert.ok(!deckIds.includes(otherCard), `${professionId} 卡组不应含 ${other} 的职业卡`);
      }
    }
    context.battle.abandon();
  }
});

ok('宗门加成注入战斗修饰（外企宗每回合格挡）', () => {
  const { context } = make(10, 0x5555);
  context.player.sectId = 'FOREIGN';
  context.battle.start('PROJECT', 'build_java');
  const card = context.battle.battleCardView()!;
  assert.equal(card.modifiers.sectId, 'FOREIGN');
  assert.equal(card.modifiers.startBlockPerTurn, 2);
  context.battle.abandon();
});

ok('升级卡牌消耗灵石且真实生效（下次开局用升级版）', () => {
  const { context } = make(10, 0x6666);
  context.player.spiritStones = 100;
  const level = context.battle.upgradeCollectionCard('card_strike');
  assert.equal(level, 1);
  assert.equal(context.player.spiritStones, 80);
  assert.equal(context.player.cardUpgrades['card_strike'], 1);
  const level2 = context.battle.upgradeCollectionCard('card_strike');
  assert.equal(level2, 2);
  assert.equal(context.player.spiritStones, 60, 'BASIC 升级两次各 20 灵石');
  assert.throws(() => context.battle.upgradeCollectionCard('card_unknown'), /未知卡牌/);
  context.battle.start('PROJECT', 'build_java');
  const card = context.battle.battleCardView()!;
  const allInstances = [...card.hand, ...card.drawPile, ...card.discardPile];
  assert.ok(allInstances.some((c) => c.defId === 'card_strike' && c.upgraded === 2), '升级版应进入牌组');
  context.battle.abandon();
});

ok('卡组视图与收藏视图真实可用', () => {
  const { context } = make(10, 0x7777);
  context.battle.start('PROJECT', 'build_java');
  context.battle.abandon();
  context.battle.dismissFinished();
  const deck = context.battle.cardDeckView();
  assert.equal(deck.manifest['card_strike'], 5);
  assert.equal(deck.manifest['card_block'], 4);
  assert.equal(deck.total, 10); // 基础 9 + 职业 1
  const catalog = context.battle.cardCatalog();
  assert.ok(catalog.length >= 40, `卡牌图鉴应完整（实际 ${catalog.length}）`);
});

console.log(`card-battle-service tests passed (${passed})`);
