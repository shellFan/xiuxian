#!/usr/bin/env node
'use strict';

/**
 * V10 ULTIMATE §8 — add the 5 remaining named bosses (10 total with the
 * existing KPI 暴君 / 加班魔王 / Bug 巨兽 / 需求幻魔 / 版本灾厄).
 * New mechanic kinds implemented in card-battle-service.runBossSpecial:
 * ENERGY_LEECH / MIRROR / COUNTER_STANCE / TRIBULATION_COUNTDOWN; the final
 * boss composes SUMMON + COST_CURSE + JUDGE with a hard phase 2.
 */

const fs = require('node:fs');
const path = require('node:path');

const EXT_FILE = path.resolve(__dirname, '..', '..', 'assets', 'configs', 'v57', 'battle-extension.json');
const PROF_FILE = path.resolve(__dirname, '..', '..', 'assets', 'configs', 'v57', 'profession-content.json');
const ext = JSON.parse(fs.readFileSync(EXT_FILE, 'utf8'));
const prof = JSON.parse(fs.readFileSync(PROF_FILE, 'utf8'));

const BOSSES = [
  {
    monster: { id: 'boss_resource_devourer', name: '资源吞噬者', tier: 'BOSS', hp: 820, attack: 14, intervalSec: 2.6, exp: 88 },
    mechanic: {
      telegraph: '资源吞噬者张开了预算的黑洞！',
      mechanics: [
        { kind: 'ENERGY_LEECH', everySec: 7, energyDrain: 1, shieldPct: 0.04 },
        { kind: 'RAGE', everySec: 12 },
      ],
      exclusiveDrop: { equipmentId: 'eq_budget_seal', dropChance: 0.18, pityAt: 9 },
      phase2: { atHpPct: 0.4, name: '预算表崩盘', attackMul: 1.3, intervalMul: 1, telegraph: '⚠️ 预算表崩盘——吞噬的灵石化作狂怒！' },
    },
    behavior: 'AGGRESSIVE',
  },
  {
    monster: { id: 'boss_code_inner_demon', name: '代码心魔', tier: 'BOSS', hp: 760, attack: 13, intervalSec: 2.4, exp: 90 },
    mechanic: {
      telegraph: '代码心魔低语：你的牌，我来打。',
      mechanics: [
        { kind: 'MIRROR', everySec: 5, mirrorScale: 1.2 },
        { kind: 'BLIND', everySec: 11 },
      ],
      exclusiveDrop: { equipmentId: 'eq_inner_peace', dropChance: 0.18, pityAt: 9 },
      phase2: { atHpPct: 0.45, name: '心魔具现', attackMul: 1.35, intervalMul: 1, telegraph: '⚠️ 心魔具现——你的一切操作都会被回放！' },
    },
    behavior: 'TRICKSTER',
  },
  {
    monster: { id: 'boss_performance_judge', name: '绩效判官', tier: 'BOSS', hp: 900, attack: 15, intervalSec: 2.6, exp: 92 },
    mechanic: {
      telegraph: '绩效判官翻开了你的攻防记录！',
      mechanics: [
        { kind: 'COUNTER_STANCE', everySec: 6, blockGate: 10 },
        { kind: 'JUDGE', everySec: 12, interruptHpPct: 0.1, judgeDamageMul: 2.2 },
      ],
      exclusiveDrop: { equipmentId: 'eq_judge_seal', dropChance: 0.18, pityAt: 9 },
      phase2: { atHpPct: 0.4, name: '终审判定', attackMul: 1.3, intervalMul: 1, telegraph: '⚠️ 终审判定——攻防两端都逃不过打分！' },
    },
    behavior: 'TRICKSTER',
  },
  {
    monster: { id: 'boss_tribulation_foreman', name: '天劫监工', tier: 'BOSS', hp: 950, attack: 16, intervalSec: 2.8, exp: 95 },
    mechanic: {
      telegraph: '天劫监工挂上了 KPI 倒计时！',
      mechanics: [
        { kind: 'TRIBULATION_COUNTDOWN', everySec: 8, everyTurns: 4, strikeDamageMul: 2.5 },
        { kind: 'ATTACK_SPEED_DEBUFF', everySec: 12 },
      ],
      exclusiveDrop: { equipmentId: 'eq_tribulation_gavel', dropChance: 0.18, pityAt: 9 },
      phase2: { atHpPct: 0.35, name: '天劫加速', attackMul: 1.4, intervalMul: 0.9, telegraph: '⚠️ 天劫加速——倒计时变短了！' },
    },
    behavior: 'AGGRESSIVE',
  },
  {
    monster: { id: 'boss_final_boss', name: '终极老板', tier: 'BOSS', hp: 1250, attack: 18, intervalSec: 2.8, exp: 150 },
    mechanic: {
      telegraph: '终极老板走进会议室，全员起立！',
      mechanics: [
        { kind: 'SUMMON', everySec: 9, minion: 'mon_req_change', cap: 2 },
        { kind: 'COST_CURSE', everySec: 10, costDelta: 1 },
        { kind: 'JUDGE', everySec: 14, interruptHpPct: 0.08, judgeDamageMul: 2.4 },
      ],
      exclusiveDrop: { equipmentId: 'eq_boss_trophy', dropChance: 0.25, pityAt: 6 },
      phase2: { atHpPct: 0.5, name: '全员加班令', attackMul: 1.5, intervalMul: 0.95, telegraph: '⚠️ 全员加班令——没有一个人准点下班！' },
    },
    behavior: 'AGGRESSIVE',
  },
];

const addedMonsters = [];
for (const b of BOSSES) {
  const exists = ext.monsters.some((m) => m.id === b.monster.id);
  if (!exists) { ext.monsters.push(b.monster); addedMonsters.push(b.monster.id); }
  ext.bossMechanics[b.monster.id] = b.mechanic;
}
// 卡牌战斗怪池：怪物池 + 行为表（mon_* 语义复用为 Boss 行为倾向）。
if (!ext.enemyBehaviors) ext.enemyBehaviors = {};
for (const b of BOSSES) ext.enemyBehaviors[b.monster.id] = b.behavior;

// 职业主题池：每职业追加一个主题 Boss；终极老板留在非职业池（20% 直面概率 + 复盘入口）。
const distribute = {
  JAVA_BACKEND: ['boss_resource_devourer'],
  FRONTEND: ['boss_code_inner_demon'],
  QA: ['boss_performance_judge'],
  DEVOPS: ['boss_tribulation_foreman'],
};
for (const [pid, ids] of Object.entries(distribute)) {
  const pool = prof.professions[pid] && prof.professions[pid].bosses;
  if (!Array.isArray(pool)) continue;
  for (const id of ids) if (!pool.includes(id)) pool.push(id);
}

fs.writeFileSync(EXT_FILE, JSON.stringify(ext, null, 1) + '\n');
fs.writeFileSync(PROF_FILE, JSON.stringify(prof, null, 1) + '\n');
console.log('added monsters:', JSON.stringify(addedMonsters));
console.log('bossMechanics total:', Object.keys(ext.bossMechanics).length);
console.log('boss-tier monsters:', ext.monsters.filter((m) => m.tier === 'BOSS').length);
