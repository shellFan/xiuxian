/**
 * V6.3 Balance Simulation — auto-battle progression curve verification
 *
 * Simulates: fresh player → 5min / 30min / 2h / 8h of auto-battle
 * Checks: stage progression rate, DPS vs enemy HP, reward accumulation,
 *         squad growth, chest drops, tower progress
 *
 * Run: node tools/v63-balance-sim.cjs
 * Output: ai/reports/V63-BALANCE-SIM.md
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { GameContext } = require('../tests/.compiled/assets/scripts/core/game-context');
const { PlayerData } = require('../tests/.compiled/assets/scripts/model/player-data');
const { FakeClock } = require('../tests/.compiled/assets/scripts/core/clock');
const { MemoryStorageAdapter } = require('../tests/.compiled/assets/scripts/services/storage-adapter');

const HORIZONS = [
  { label: '5min', seconds: 300 },
  { label: '30min', seconds: 1800 },
  { label: '2h', seconds: 7200 },
  { label: '8h', seconds: 28800 },
];

function simulate(label, totalSeconds) {
  const clock = new FakeClock(Date.parse('2026-11-09T09:00:00+08:00'));
  const player = new PlayerData({ lastSaveTime: clock.now() });
  player.spiritStones = 100; // starting stones
  const ctx = new GameContext({ clock, player, storage: new MemoryStorageAdapter(), board: null, battleRng: () => 0.5 });
  ctx.gameDay.ensureStarted();
  ctx.autoBattle.ensureStarted();

  // Hire first member immediately (cost 0 for slot 0)
  ctx.autoBattle.hireMember('JAVA_BACKEND');
  // Hire second member (cost 50)
  if (player.spiritStones >= 50) ctx.autoBattle.hireMember('FRONTEND');

  let lastStage = 1;
  let chestsOpened = 0;
  let totalChestRewards = 0;
  const stageTimeline = []; // {time, stage}
  const dpsSamples = []; // {time, dps, enemyHp}

  const TICK = 1; // 1 second per tick
  for (let t = 0; t < totalSeconds; t += TICK) {
    clock.advance(TICK * 1000);
    ctx.autoBattle.tick(TICK);

    const v = ctx.autoBattle.view();
    if (v.stage !== lastStage) {
      stageTimeline.push({ time: t + TICK, stage: v.stage });
      lastStage = v.stage;
    }

    // Open chests when available
    if (v.pendingChests > 0) {
      const r = ctx.autoBattle.openChest();
      if (r.ok && r.reward) {
        chestsOpened++;
        if (r.reward.label.includes('灵石')) totalChestRewards += r.reward.amount;
      }
    }

    // Auto-resolve Boss encounters (simulate player winning card battle)
    if (v.status === 'BOSS_PENDING') {
      ctx.autoBattle.bossDefeated();
    }

    // Sample DPS every 60s
    if (t % 60 === 0) {
      dpsSamples.push({ time: t, dps: v.dps, enemyHp: v.enemy?.maxHp || 0, stage: v.stage });
    }

    // Upgrade click damage when affordable (every 30s check)
    if (t % 30 === 0 && t > 0) {
      const up = ctx.autoBattle.upgradeClick();
    }

    // Hire more members when affordable
    if (t % 60 === 0 && t > 0) {
      const members = ctx.autoBattle.view().squad.filter(m => m.slot >= 0).length;
      if (members < 5) {
        const professions = ['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS'];
        ctx.autoBattle.hireMember(professions[members % professions.length]);
      }
    }
  }

  const v = ctx.autoBattle.view();
  const p = ctx.player;
  return {
    label,
    totalSeconds,
    finalStage: v.stage,
    maxStage: v.maxStage,
    totalKills: v.totalKills,
    status: v.status,
    dps: v.dps,
    clickDamage: v.clickDamage,
    squadSize: v.squad.filter(m => m.slot >= 0).length,
    squadLevels: v.squad.filter(m => m.slot >= 0).map(m => m.level),
    pendingChests: v.pendingChests,
    chestsOpened,
    totalChestRewards,
    salary: p.salary,
    cultivationExp: p.cultivationExp,
    spiritStones: p.spiritStones,
    stageTimeline: stageTimeline.slice(0, 20),
    dpsSamples: dpsSamples.filter((_, i) => i % 5 === 0), // sample every 5min
    avgSecPerStage: stageTimeline.length > 1
      ? Math.round(totalSeconds / stageTimeline.length * 10) / 10
      : null,
  };
}

// ── Run simulations ──
const results = HORIZONS.map(h => simulate(h.label, h.seconds));

// ── Analysis ──
const analysis = [];
for (const r of results) {
  const first10 = r.stageTimeline.filter(s => s.stage <= 10);
  const first10Time = first10.length > 0 ? first10[first10.length - 1].time : null;
  const stage50Time = r.stageTimeline.find(s => s.stage >= 50)?.time || null;

  analysis.push({
    label: r.label,
    stageReached: r.maxStage,
    kills: r.totalKills,
    dps: r.dps,
    squadLevels: r.squadLevels,
    avgSecPerStage: r.avgSecPerStage,
    first10StagesSec: first10Time,
    stage50Sec: stage50Time,
    salaryEarned: r.salary,
    cultivationEarned: r.cultivationExp,
    spiritStonesLeft: r.spiritStones,
    chestsOpened: r.chestsOpened,
    chestStonesEarned: r.totalChestRewards,
  });
}

// ── Balance gates ──
const gates = [];
const g5 = results[0]; // 5min
const g30 = results[1]; // 30min
const g2h = results[2]; // 2h
const g8h = results[3]; // 8h

gates.push({ name: '前期爽感：5分钟内通关≥8关', pass: g5.maxStage >= 8, detail: `stage=${g5.maxStage}` });
gates.push({ name: '前期节奏：前10关平均≤15秒/关', pass: g5.avgSecPerStage !== null && g5.avgSecPerStage <= 15, detail: `avg=${g5.avgSecPerStage}s` });
gates.push({ name: '中期推进：30分钟达≥20关', pass: g30.maxStage >= 20, detail: `stage=${g30.maxStage}` });
gates.push({ name: '中期成长：30分钟DPS≥50', pass: g30.dps >= 50, detail: `dps=${g30.dps}` });
gates.push({ name: '长期目标：2小时达≥40关', pass: g2h.maxStage >= 40, detail: `stage=${g2h.maxStage}` });
gates.push({ name: '小队成长：2小时至少1人Lv≥5', pass: g2h.squadLevels.some(l => l >= 5), detail: `levels=${g2h.squadLevels.join(',')}` });
gates.push({ name: '宝箱系统：8小时开箱≥3', pass: g8h.chestsOpened >= 3, detail: `chests=${g8h.chestsOpened}` });
gates.push({ name: '收益增长：8小时工资≥5000', pass: g8h.salary >= 5000, detail: `salary=${g8h.salary}` });
gates.push({ name: '不卡死：8小时仍在推进(kills>50)', pass: g8h.totalKills > 50, detail: `kills=${g8h.totalKills}` });

const allPass = gates.every(g => g.pass);

// ── Report ──
const report = [
  '# V6.3 Auto-Battle Balance Simulation',
  '',
  `Date: ${new Date().toISOString()}`,
  `Result: ${allPass ? 'ALL PASS' : 'SOME FAILED'} (${gates.filter(g => g.pass).length}/${gates.length})`,
  '',
  '## Gates',
  '',
  ...gates.map(g => `- ${g.pass ? '✅' : '❌'} ${g.name} — ${g.detail}`),
  '',
  '## Progression Summary',
  '',
  '| Horizon | MaxStage | Kills | DPS | Squad Levels | Avg sec/stage | Salary | Cultivation | Stones | Chests |',
  '|---------|----------|-------|-----|-------------|---------------|--------|-------------|--------|--------|',
  ...analysis.map(a => `| ${a.label} | ${a.stageReached} | ${a.kills} | ${a.dps} | ${a.squadLevels.join(',')} | ${a.avgSecPerStage}s | ${a.salaryEarned} | ${a.cultivationEarned} | ${a.spiritStonesLeft} | ${a.chestsOpened} |`),
  '',
  '## DPS vs Enemy HP Curve (sampled)',
  '',
  '| Time | Stage | DPS | Enemy MaxHP | HP/DPS ratio |',
  '|------|-------|-----|-------------|-------------|',
  ...results[3].dpsSamples.map(s => `| ${Math.round(s.time/60)}min | ${s.stage} | ${s.dps} | ${s.enemyHp} | ${s.enemyHp > 0 ? (s.enemyHp / Math.max(1, s.dps)).toFixed(1) + 's' : '-'} |`),
  '',
  '## Stage Timeline (8h run, first 20 stage advances)',
  '',
  ...results[3].stageTimeline.map(s => `- ${Math.round(s.time/60)}min${s.time < 60000 ? ` (${s.time}s)` : ''} → Stage ${s.stage}`),
  '',
].join('\n');

const outDir = path.join(__dirname, '..', 'ai', 'reports');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'V63-BALANCE-SIM.md'), report);
console.log(report);
console.log('\n' + (allPass ? 'BALANCE_SIM_PASS' : 'BALANCE_SIM_FAIL'));
process.exit(allPass ? 0 : 1);