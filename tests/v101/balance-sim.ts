/**
 * V10.1 战斗节奏与平衡模拟器。
 *
 * 引擎级模拟：新手开局卡组自动打完整场（5 波），统计回合数/时长体感/胜率/残血，
 * 用于「普通战斗短平快、Boss 战允许复杂」的平衡校准。
 *
 * 用法：node tests/.compiled/scripts/v101/balance-sim.js  （先 tsc 编译）
 *   或  npx tsc -p tsconfig.game.json --outDir tests/.compiled --noEmit false && node tests/.compiled/scripts/v101/balance-sim.js
 */
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { cardDefById } from '../../assets/scripts/v59o/card-battle/card-database';
import { MONSTER_MAP } from '../../assets/scripts/v57/battle-merge';

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function make(seed: number): GameContext {
  const clock = new FakeClock(new Date(2026, 8, 21, 10, 0, 0, 0).getTime());
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: seededRng(seed) });
  context.gameDay.ensureStarted();
  return context;
}

interface RunResult {
  seed: number;
  victory: boolean;
  turns: number;
  finalHp: number;
  maxHp: number;
  cardsPlayed: number;
  bossName: string;
  bossMaxHp: number;
}

function simulate(seed: number, buildId = 'build_java', collection: Record<string, number> = {}): RunResult {
  const context = make(seed);
  context.player.cardCollection = { ...collection };
  context.battle.start('PROJECT', buildId);
  let cardsPlayed = 0;
  let turns = 0;
  let lastTurn = 0;
  for (let i = 0; i < 900; i++) {
    const run = context.battle.current();
    if (run?.skillOffers) {
      context.battle.chooseSkill(run.skillOffers[0]);
      continue;
    }
    const card = context.battle.battleCardView();
    if (!card) break;
    if (card.phase === 'FINISHED') break;
    if (card.reward) break;
    if (card.phase === 'PLAYER_TURN') {
      if (card.turn !== lastTurn) { turns += 1; lastTurn = card.turn; }
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
        context.battle.playBattleCard(playable.uid, target, `s${i}_${playable.uid}`);
        cardsPlayed += 1;
      } else {
        context.battle.endBattleTurn(`s${i}_end`);
      }
    } else {
      context.battle.endBattleTurn(`s${i}_tick`);
    }
  }
  const run = context.battle.current();
  const card = context.battle.battleCardView();
  const boss = (card?.enemies ?? []).find((e) => e.tier === 'BOSS');
  return {
    seed,
    victory: (card?.reward ? true : run?.status === 'VICTORY'),
    turns: card?.turn ?? turns,
    finalHp: card?.player.hp ?? 0,
    maxHp: card?.player.maxHp ?? 1,
    cardsPlayed,
    bossName: boss?.name ?? (MONSTER_MAP.get(run?.replayBossId ?? '')?.name ?? '波次推进'),
    bossMaxHp: boss?.maxHp ?? 0,
  };
}

function percentile(list: number[], p: number): number {
  const sorted = [...list].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx]!;
}

const SEEDS = Array.from({ length: 24 }, (_, i) => 1000 + i * 7919);
const scenarios: { label: string; build: string; collection: Record<string, number> }[] = [
  { label: '新手开局（基础 11 张）', build: 'build_java', collection: {} },
  { label: '中期（+6 收藏卡）', build: 'build_java', collection: { card_heavy: 1, card_combo: 1, card_shield: 1, card_docs: 1, card_review: 1, card_poison_dart: 1 } },
  { label: '成型毒流（毒系+过牌引擎）', build: 'build_java', collection: { card_poison_dart: 2, card_poison_bloom: 1, card_plague: 1, card_docs: 1, card_thread_pool: 1, card_cache: 1, card_vdom: 1, card_p0slash: 1, card_iron_wall: 1, card_gc_tuning: 1 } },
];

let failures = 0;
for (const sc of scenarios) {
  const results = SEEDS.map((seed) => simulate(seed, sc.build, sc.collection));
  const victories = results.filter((r) => r.victory);
  const turns = results.map((r) => r.turns);
  const hpPct = results.map((r) => r.finalHp / r.maxHp);
  console.log(`\n== ${sc.label} ==`);
  console.log(`胜率: ${victories.length}/${results.length} (${Math.round((victories.length / results.length) * 100)}%)`);
  console.log(`回合数: P50=${percentile(turns, 50)} P90=${percentile(turns, 90)} min=${Math.min(...turns)} max=${Math.max(...turns)}`);
  console.log(`胜场残血: P50=${Math.round(percentile(hpPct, 50) * 100)}% P10=${Math.round(percentile(hpPct, 10) * 100)}%`);
  const defeatTurns = results.filter((r) => !r.victory).map((r) => r.turns);
  if (defeatTurns.length) console.log(`败场回合: P50=${percentile(defeatTurns, 50)}（败局是否快速可见）`);
  // 判定（V10.1 平衡目标，见 BALANCE.md）：
  // 基础/中期：中位回合 ≤ 22、胜率 65%~95%；
  // 成型流派：允许略慢（构筑回合换上限），P50 ≤ 25、胜率 80%~98%（必须显著强于开局）。
  const isArchetype = sc.label.includes('成型');
  const paceLimit = isArchetype ? 25 : 22;
  const winMin = isArchetype ? 0.8 : 0.65;
  const winMax = isArchetype ? 0.98 : 0.95;
  const paceOk = percentile(turns, 50) <= paceLimit;
  const winRate = victories.length / results.length;
  const winOk = winRate >= winMin && winRate <= winMax;
  console.log(`节奏判定(≤${paceLimit}回合@P50): ${paceOk ? 'PASS' : 'FAIL'} · 胜率判定(${Math.round(winMin * 100)}%~${Math.round(winMax * 100)}%): ${winOk ? 'PASS' : 'FAIL'} (${Math.round(winRate * 100)}%)`);
  if (!paceOk || !winOk) failures += 1;
}

console.log(failures === 0 ? '\nBALANCE SIM: ALL PASS' : `\nBALANCE SIM: ${failures} scenario(s) need tuning`);
process.exit(failures === 0 ? 0 : 1);
