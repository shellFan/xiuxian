'use strict';
// 扫描卡牌战斗（朴素 AI）下的胜利种子——测试意图非特定平衡（与套件既有种子扫描口径一致）。
const { FakeClock } = require('../tests/.compiled/assets/scripts/core/clock');
const { GameContext } = require('../tests/.compiled/assets/scripts/core/game-context');
const { PlayerData } = require('../tests/.compiled/assets/scripts/model/player-data');
const { MemoryStorageAdapter } = require('../tests/.compiled/assets/scripts/services/storage-adapter');
const db = require('../tests/.compiled/assets/scripts/v59o/card-battle/card-database');

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function drive(context, maxActions = 800) {
  for (let i = 0; i < maxActions; i += 1) {
    const finished = context.battle.finished();
    if (finished) return finished;
    const run = context.battle.current();
    if (run && run.skillOffers) { context.battle.chooseSkill(run.skillOffers[0]); continue; }
    const card = context.battle.battleCardView();
    if (!card) return null;
    if (card.phase === 'REWARD_SELECTION') return context.battle.finished();
    if (card.phase !== 'PLAYER_TURN') return null;
    const enemies = card.enemies.filter((e) => e.hp > 0).sort((a, b) => a.hp - b.hp);
    const affordable = card.hand.filter((c) => {
      const def = db.cardDefById(c.defId);
      if (!def || def.unplayable) return false;
      const cost = Math.max(0, def.cost - (card.player.statuses.COST_DOWN ?? 0) + c.turnCostDelta);
      return cost <= card.player.energy && (def.target !== 'ENEMY' || enemies.length > 0);
    });
    const lowHp = card.player.hp / Math.max(1, card.player.maxHp) < 0.4;
    const playable = lowHp
      ? (affordable.find((c) => db.cardDefById(c.defId).type === 'DEFENSE') ?? affordable.find((c) => db.cardDefById(c.defId).type !== 'DEFENSE'))
      : (affordable.find((c) => db.cardDefById(c.defId).type === 'ATTACK') ?? affordable.find((c) => db.cardDefById(c.defId).type !== 'DEFENSE'));
    if (playable) {
      const def = db.cardDefById(playable.defId);
      context.battle.playBattleCard(playable.uid, def.target === 'ENEMY' ? enemies[0].uid : null, 'auto_' + i + '_' + playable.uid);
    } else {
      context.battle.endBattleTurn('auto_end_' + i);
    }
  }
  return null;
}

function at(day, hour, minute = 0) { return new Date(2026, 8, day, hour, minute, 0, 0).getTime(); }

function trySeed(seed, buildId) {
  const clock = new FakeClock(at(21, 10));
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: seededRng(seed) });
  context.gameDay.ensureStarted();
  context.battle.start('PROJECT', buildId);
  const finished = drive(context);
  return finished && finished.status === 'VICTORY';
}

const [, , buildId, countArg, startArg] = process.argv;
const wanted = Number(countArg || 3);
const start = Number(startArg || 0x100);
const found = [];
for (let seed = start; found.length < wanted && seed < start + 4000; seed += 1) {
  if (trySeed(seed, buildId)) { found.push(seed); console.log('WIN SEED', buildId, seed); }
}
console.log('done', buildId, found.join(','));
