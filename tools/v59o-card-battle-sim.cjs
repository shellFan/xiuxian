/**
 * V5.9-O.2 卡牌战斗模拟器（§43）。
 *
 * - 100 场标准 Build 战斗（含普通/精英/Boss 五波全程）。
 * - 四职业各 30 场。
 * - 两种诚实 AI（不造必胜脚本）：
 *   naive  —— 优先攻击，血量 <40% 才防御；
 *   intent —— 读懂敌人意图：预计受到伤害 ≥ 攻击卡收益时优先格挡/削弱。
 * - 统计：胜率、平均回合、平均受伤、死亡波次分布、卡牌使用分布、平均能量利用。
 *
 * 运行：node tools/v59o-card-battle-sim.cjs [--runs=100] [--profRuns=30]
 * 输出：ai/reports/V59O2-CARD-BATTLE-SIM.md + stdout 摘要
 */
'use strict';
process.env.TZ = 'Asia/Shanghai';
const fs = require('node:fs');
const path = require('node:path');
const { FakeClock } = require('../tests/.compiled/assets/scripts/core/clock');
const { GameContext } = require('../tests/.compiled/assets/scripts/core/game-context');
const { PlayerData } = require('../tests/.compiled/assets/scripts/model/player-data');
const { MemoryStorageAdapter } = require('../tests/.compiled/assets/scripts/services/storage-adapter');
const db = require('../tests/.compiled/assets/scripts/v59o/card-battle/card-database');

const START = Date.parse('2026-09-21T09:00:00+08:00');

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeContext(seed) {
  const clock = new FakeClock(START);
  const context = new GameContext({
    storage: new MemoryStorageAdapter(),
    player: new PlayerData({ lastSaveTime: clock.now() }),
    clock, board: null, battleRng: seededRng(seed),
  });
  context.gameDay.ensureStarted();
  return context;
}

function affordable(view) {
  return view.hand.filter((c) => {
    const def = db.cardDefById(c.defId);
    if (!def || def.unplayable) return false;
    const cost = Math.max(0, def.cost - (view.player.statuses.COST_DOWN ?? 0) + (c.turnCostDelta || 0));
    return cost <= view.player.energy && (def.target !== 'ENEMY' || view.enemies.some((e) => e.hp > 0));
  });
}

function play(view, context, card, enemies, tag) {
  const def = db.cardDefById(card.defId);
  const target = def.target === 'ENEMY' ? enemies[0].uid : null;
  context.battle.playBattleCard(card.uid, target, tag + '_' + card.uid);
}

/** 期望受到的伤害（读取意图）。 */
function incomingDamage(view) {
  return view.enemies.filter((e) => e.hp > 0).reduce((sum, e) => {
    const it = e.intent;
    if (!it) return sum;
    if (it.kind === 'ATTACK') return sum + it.damage * (it.hits || 1);
    if (it.kind === 'ATTACK_DEBUFF') return sum + it.damage;
    return sum;
  }, 0);
}

function aiPick(view, mode) {
  const options = affordable(view);
  if (options.length === 0) return null;
  const enemies = view.enemies.filter((e) => e.hp > 0).sort((a, b) => a.hp - b.hp);
  const byType = (t) => options.filter((c) => (db.cardDefById(c.defId) || {}).type === t);
  const hpPct = view.player.hp / Math.max(1, view.player.maxHp);
  if (mode === 'intent') {
    const incoming = incomingDamage(view);
    const blocks = byType('DEFENSE');
    if (incoming > 0 && blocks.length > 0 && (incoming >= view.player.block + view.player.hp * 0.25 || hpPct < 0.5)) {
      return blocks[0];
    }
    const debuffs = options.filter((c) => {
      const def = db.cardDefById(c.defId);
      return def.effects.some((e) => e.kind === 'APPLY_STATUS' && e.target !== 'SELF' && (e.status === 'WEAK' || e.status === 'VULNERABLE'));
    });
    if (enemies.length > 0 && debuffs.length > 0 && enemies.some((e) => (e.hp / e.maxHp) > 0.4) && Math.random() < 0.999) {
      // 弱化/易伤在高血量敌人身上价值更高
      return debuffs[0];
    }
  }
  // naive 主体
  if (hpPct < 0.4) {
    const blocks = byType('DEFENSE');
    if (blocks.length > 0) return blocks[0];
  }
  const attacks = byType('ATTACK');
  if (attacks.length > 0 && enemies.length > 0) return attacks[0];
  const others = options.filter((c) => (db.cardDefById(c.defId) || {}).type !== 'DEFENSE');
  if (others.length > 0) return others[0];
  return options[0];
}

function runOne(buildId, seed, aiMode, professionId) {
  const context = makeContext(seed);
  if (professionId) context.profession.choose(professionId);
  context.battle.start('PROJECT', buildId);
  const usage = {};
  let energySpent = 0;
  let energyBudget = 0;
  let damageTaken = 0;
  let turns = 0;
  let deathWave = -1;
  for (let step = 0; step < 3000; step += 1) {
    const finished = context.battle.finished();
    if (finished) {
      if (finished.status === 'DEFEAT' && deathWave < 0) deathWave = finished.wave;
      break;
    }
    const run = context.battle.current();
    if (run && run.skillOffers) {
      // 类人技能选择：优先攻击/进化成长项，其次通用；不选纯减益。
      const SK = require('../tests/.compiled/assets/scripts/v57/battle-merge');
      const pick = run.skillOffers.find((id) => {
        if (id === 'skill_plus_attack' || String(id).startsWith('up:')) return false; // 弱于直接拿新攻击技
        const def = SK.SKILL_MAP.get(id);
        return !!def && (def.damageMul ?? 0) > 0;
      }) ?? run.skillOffers[0];
      context.battle.chooseSkill(pick);
      continue;
    }
    const view = context.battle.battleCardView();
    if (!view) break;
    if (view.reward) { context.battle.claimBattleCardReward(view.reward.candidates[0] ?? null); continue; }
    if (view.phase !== 'PLAYER_TURN') continue;
    const beforeHp = view.player.hp;
    const beforeEnergy = view.player.energy;
    if (turns === 0 || view.turn !== turns) { turns = view.turn; energyBudget += view.baseEnergy; }
    const card = aiPick(view, aiMode);
    if (card) {
      const def = db.cardDefById(card.defId);
      usage[def.name] = (usage[def.name] ?? 0) + 1;
      play(view, context, card, view.enemies.filter((e) => e.hp > 0).sort((a, b) => a.hp - b.hp), 's' + step);
      energySpent += Math.max(0, beforeEnergy - (context.battle.battleCardView()?.player.energy ?? 0));
    } else {
      context.battle.endBattleTurn('end' + step);
    }
    const after = context.battle.battleCardView();
    if (after) damageTaken += Math.max(0, beforeHp - after.player.hp);
  }
  const finished = context.battle.finished();
  return {
    status: finished ? finished.status : 'TIMEOUT',
    turns, damageTaken, energySpent, energyBudget, usage, deathWave,
    kills: finished ? finished.kills : 0,
    stones: finished ? finished.loot.spiritStones : 0,
  };
}

function aggregate(label, results) {
  const n = results.length;
  const wins = results.filter((r) => r.status === 'VICTORY').length;
  const timeouts = results.filter((r) => r.status === 'TIMEOUT').length;
  const avg = (fn) => Math.round(results.reduce((s, r) => s + fn(r), 0) / Math.max(1, n) * 10) / 10;
  const deathWaves = {};
  const usage = {};
  for (const r of results) {
    if (r.deathWave >= 0) deathWaves['第' + (r.deathWave + 1) + '波'] = (deathWaves['第' + (r.deathWave + 1) + '波'] ?? 0) + 1;
    for (const [name, count] of Object.entries(r.usage)) usage[name] = (usage[name] ?? 0) + count;
  }
  const energyEff = Math.round(results.reduce((s, r) => s + (r.energyBudget > 0 ? r.energySpent / r.energyBudget : 0), 0) / Math.max(1, n) * 100) / 100;
  const topUsage = Object.entries(usage).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return {
    label, n, wins, winRate: Math.round(wins / Math.max(1, n) * 100), timeouts,
    avgTurns: avg((r) => r.turns), avgDamageTaken: avg((r) => r.damageTaken),
    avgKills: avg((r) => r.kills), avgStones: avg((r) => r.stones), energyEff,
    deathWaves, topUsage,
  };
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : Number(v)]; }));
  const runs = args.runs ?? 100;
  const profRuns = args.profRuns ?? 30;
  const report = [];
  const t0 = Date.now();
  // 1) 标准 Build：naive vs intent
  for (const mode of ['naive', 'intent']) {
    const results = [];
    for (let i = 0; i < runs; i += 1) results.push(runOne('build_java', 0x5eed + i * 7919, mode));
    report.push(aggregate(`标准（build_java ×${runs} · AI=${mode}）`, results));
  }
  // 2) 全 Build intent（平衡面）
  for (const buildId of ['build_db', 'build_redis', 'build_fish']) {
    const results = [];
    for (let i = 0; i < Math.min(50, runs); i += 1) results.push(runOne(buildId, 0xabcd + i * 104729, 'intent'));
    report.push(aggregate(`${buildId} ×${Math.min(50, runs)} · AI=intent`, results));
  }
  // 3) 四职业 × profRuns
  for (const prof of ['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS']) {
    const results = [];
    for (let i = 0; i < profRuns; i += 1) results.push(runOne('build_java', 0x7777 + i * 15485863, 'intent', prof));
    report.push(aggregate(`职业 ${prof} ×${profRuns} · AI=intent`, results));
  }
  const elapsed = Date.now() - t0;
  console.log('=== V5.9-O.2 卡牌战斗模拟 ===');
  for (const r of report) {
    console.log(`${r.label}: 胜率 ${r.winRate}%（${r.wins}/${r.n}） 超时 ${r.timeouts} 平均回合 ${r.avgTurns} 平均受伤 ${r.avgDamageTaken} 能量利用 ${r.energyEff}`);
    if (Object.keys(r.deathWaves).length) console.log('  死亡波次:', JSON.stringify(r.deathWaves));
    console.log('  卡牌使用TOP:', r.topUsage.map(([n, c]) => `${n}×${c}`).join(' '));
  }
  console.log(`总耗时 ${Math.round(elapsed / 1000)}s`);
  // 写报告
  const lines = [
    '# V5.9-O.2 卡牌战斗模拟报告',
    '',
    `生成时间：${new Date().toISOString()} ｜ 分支：gameplay-v2`,
    '',
    '| 场景 | 场数 | 胜率 | 超时 | 平均回合 | 平均受伤 | 击杀 | 灵石 | 能量利用 |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of report) {
    lines.push(`| ${r.label} | ${r.n} | ${r.winRate}% | ${r.timeouts} | ${r.avgTurns} | ${r.avgDamageTaken} | ${r.avgKills} | ${r.avgStones} | ${r.energyEff} |`);
  }
  lines.push('', '## 死亡波次分布', '');
  for (const r of report) {
    if (Object.keys(r.deathWaves).length) lines.push(`- ${r.label}: ${JSON.stringify(r.deathWaves)}`);
  }
  lines.push('', '## 卡牌使用分布（TOP8 每场景）', '');
  for (const r of report) {
    lines.push(`- ${r.label}: ${r.topUsage.map(([n, c]) => `${n}×${c}`).join('、')}`);
  }
  lines.push('', `总耗时 ${Math.round(elapsed / 1000)}s。AI 为诚实策略（非必胜脚本）：naive=血量<40% 才防御；intent=按敌方意图预估伤害决定防御/削弱。`);
  const outDir = path.join(__dirname, '..', 'ai', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'V59O2-CARD-BATTLE-SIM.md'), lines.join('\n') + '\n');
  console.log('report written: ai/reports/V59O2-CARD-BATTLE-SIM.md');
}

main();
