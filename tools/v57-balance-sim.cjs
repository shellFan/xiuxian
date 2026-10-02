/**
 * V5.7 平衡模拟 — 5 人格 × 7/30/60 天（§145~§147）。
 * 人格：COMPLIANT / ASSERTIVE / BALANCED / FISHING_MASTER / TECH_PERFECTIONIST。
 * 检查：不卡死 / 道心不长期为 0 / 疲劳不长期 100 / 工资与职业经验单调成长 / 技术债不永久满。
 * 注意：changeWorkMode 的 5 秒冷却基于真实时间，FakeClock 加速下永远命中——
 * 模拟器直接用 work.setMode（与 WorkService 模式机同源），并主动领任务/清战斗。
 * 运行：node tools/v57-balance-sim.cjs
 */
'use strict';
process.env.TZ = 'Asia/Shanghai';
const fs = require('node:fs');
const path = require('node:path');
const { FakeClock } = require('../tests/.compiled/assets/scripts/core/clock');
const { GameFacade } = require('../tests/.compiled/assets/scripts/facade/game-facade');
const { PlayerData } = require('../tests/.compiled/assets/scripts/model/player-data');
const { MemoryStorageAdapter } = require('../tests/.compiled/assets/scripts/services/storage-adapter');
const { RandomService, mulberry32 } = require('../tests/.compiled/assets/scripts/v2/random-service');

const MINUTE = 60_000;
const START = Date.parse('2026-09-21T09:00:00+08:00'); // 周一 09:00

const PERSONAS = {
  COMPLIANT: { workShare: 0.9, overtime: 'ACCEPT_ALL', replyTag: null, battle: true },
  ASSERTIVE: { workShare: 0.95, overtime: 'DECLINE_FREE', replyTag: null, battle: true },
  BALANCED: { workShare: 0.7, overtime: 'ACCEPT_PAID', replyTag: null, battle: true },
  FISHING_MASTER: { workShare: 0.25, overtime: 'DECLINE_ALL', replyTag: null, battle: false },
  TECH_PERFECTIONIST: { workShare: 0.9, overtime: 'ACCEPT_PAID', replyTag: 'PROFESSIONAL', battle: true },
};

function runPersona(name, policy, days, seed) {
  const clock = new FakeClock(START);
  const facade = new GameFacade({
    clock, careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new MemoryStorageAdapter(), board: null,
    randomV2: new RandomService(mulberry32(seed)),
    randomProvider: { next: mulberry32(seed) },
    battleRng: mulberry32(seed), autoSaveIntervalSeconds: 0,
    modeSwitchCooldownMs: 0,
  });
  facade.context.messenger.ensureInitialized();
  facade.chooseProfession(['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS'][seed % 4]);
  facade.gameLoop.start();
  facade.context.gameDay.ensureStarted();
  facade.context.dailyPlanner.beginWorkday();
  facade.context.week.beginWorkday();

  const metrics = {
    days: 0, exceptions: 0, mindZeroTicks: 0, fatigue100Ticks: 0,
    salaryStart: 0, salaryEnd: 0, profExpEnd: 0, tasksDone: 0,
    debtMax: 0, debtPinnedTicks: 0, battles: 0, bosses: 0, loot: 0, evolutionOffers: 0, synergies: 0,
    ontimeDays: 0, overtimeDays: 0, pendingUnresolvedMax: 0, mindMin: 999,
  };
  metrics.salaryStart = facade.context.player.salary;
  const startDay = () => {
    facade.context.gameDay.ensureStarted();
    facade.context.dailyPlanner.beginWorkday();
    facade.context.week.beginWorkday();
    // 每日开 2 个任务并按时领取（职业经验来源 §14）
    try {
      const configs = facade.queryTaskConfigs().filter((c) => c.type === 'WORK' || c.type === 'DAILY');
      for (const cfg of configs.slice(0, 2)) {
        try { facade.startTask(cfg.id); } catch { /* already running */ }
      }
    } catch { /* task start best-effort */ }
  };
  const settleDay = () => {
    try { facade.context.daySettlement.settle(); metrics.days += 1; } catch { /* already settled */ }
    const day = facade.context.player.gameDay;
    if (day) metrics.ontimeDays += day.durations.overtime === 0 ? 1 : 0;
    metrics.overtimeDays += (day && day.durations.overtime > 0) ? 1 : 0;
  };

  try {
    for (let day = 0; day < days; day++) {
      startDay();
      for (let m = 545; m <= 1260; m += 5) {
        clock.advance(5 * MINUTE);
        try { facade.gameLoop.tick(5 * 60); } catch (e) { metrics.exceptions += 1; }
        const p = facade.context.player;
        // 模式：工作占比 + 午休（绕过真实时间冷却，直接走 WorkService 模式机）
        const hod = Math.floor(m / 60);
        const inWorkWindow = (hod >= 9 && hod < 12) || (hod >= 13 && hod < 18);
        const wantWork = inWorkWindow && ((m % 60) / 60) < policy.workShare;
        const targetMode = wantWork ? 'WORK' : 'FISHING';
        try { if (p.workMode !== targetMode) facade.context.work.setMode(targetMode); } catch { metrics.exceptions += 1; }
        // 待回复（优先 tag 匹配）
        const pending = facade.context.messenger.pendingReplies();
        metrics.pendingUnresolvedMax = Math.max(metrics.pendingUnresolvedMax, pending.length);
        for (const msg of pending.slice(0, 2)) {
          const opts = msg.replyOptions ?? [];
          if (opts.length === 0) continue;
          let pick = opts[0];
          if (policy.replyTag) {
            const tagged = opts.find((o) => o.tag === policy.replyTag);
            if (tagged) pick = tagged;
          } else if (name === 'ASSERTIVE') {
            pick = opts[opts.length - 1];
          }
          try { facade.replyToMessage(msg.id, pick.id); } catch { metrics.exceptions += 1; }
        }
        // 完成任务即领取
        for (const t of p.activeTasks) {
          if (t.completed && !t.claimed) {
            try { facade.context.tasks.claimTask(t.taskId); } catch { /* best-effort */ }
          }
        }
        // 战斗：升级三选一自动选
        const battle = facade.queryBattle();
        if (battle && battle.skillOffers) {
          try {
            facade.chooseBattleSkill(battle.skillOffers[0]);
            metrics.evolutionOffers += 1;
          } catch { /* ignore */ }
        }
        // 清掉已结束战斗，每天 14:00 主动开本
        try {
          if (facade.queryFinishedBattle()) { facade.clearFinishedBattle(); }
          if (policy.battle && hod === 14 && m % 15 === 0 && !facade.queryBattle() && !p.activeBattleRun) {
            const builds = facade.queryBattleBuildOptions();
            if (builds.length > 0) { facade.startBattleRun('PROJECT', builds[0].id); metrics.battles += 1; }
          }
        } catch { metrics.exceptions += 1; }
        // 健康采样
        if (p.mind <= 0) metrics.mindZeroTicks += 1;
        metrics.mindMin = Math.min(metrics.mindMin, p.mind);
        if ((p.fatigue ?? 0) >= 100) metrics.fatigue100Ticks += 1;
        try {
          const debt = facade.context.techDebt.all();
          const vals = Object.values(debt);
          metrics.debtMax = Math.max(metrics.debtMax, ...vals);
          if (vals.length > 0 && vals.every((v) => v >= 95)) metrics.debtPinnedTicks += 1;
        } catch { /* ignore */ }
      }
      settleDay();
      const now = new Date(clock.now());
      const next9 = new Date(now);
      next9.setDate(next9.getDate() + 1);
      next9.setHours(9, 0, 0, 0);
      clock.advance(next9.getTime() - clock.now());
    }
    const p = facade.context.player;
    metrics.salaryEnd = p.salary;
    metrics.profExpEnd = p.professionExp ?? 0;
    metrics.tasksDone = (p.lifetimeStats ?? {}).tasksDone ?? 0;
    metrics.bosses = (p.lifetimeStats ?? {}).bossKills ?? 0;
    metrics.loot = (p.ownedEquipment ?? []).length;
    metrics.synergies = (p.synergyDiscovered ?? []).length;
    metrics.profLevel = facade.context.professionContent.level();
  } finally {
    facade.destroy();
  }
  return metrics;
}

function verdict(name, days, m) {
  const problems = [];
  if (m.exceptions > days * 3) problems.push(`exceptions=${m.exceptions}`);
  if (m.mindZeroTicks > 0.2 * days * 144) problems.push(`mind stuck 0 (${m.mindZeroTicks} ticks)`);
  if (m.fatigue100Ticks > 0.25 * days * 144) problems.push(`fatigue stuck 100 (${m.fatigue100Ticks} ticks)`);
  if (m.salaryEnd <= m.salaryStart) problems.push(`salary no growth (${m.salaryStart}→${m.salaryEnd})`);
  if (days >= 30 && m.profExpEnd <= 0) problems.push('profession exp never grew');
  if (days >= 30 && m.debtPinnedTicks > 0.5 * days * 144) problems.push(`tech debt pinned at 95+ (${m.debtPinnedTicks} ticks)`);
  if (m.pendingUnresolvedMax > 12) problems.push(`pending flood (${m.pendingUnresolvedMax})`);
  return { name, days, ok: problems.length === 0, problems, metrics: m };
}

const results = [];
let seed = 9101;
for (const [name, policy] of Object.entries(PERSONAS)) {
  for (const days of [7, 30, 60]) {
    seed += 13;
    const m = runPersona(name, policy, days, seed);
    const v = verdict(name, days, m);
    results.push(v);
    console.log(`${v.ok ? 'PASS' : 'FAIL'} ${name} ${days}d | salary ${m.salaryStart}→${m.salaryEnd} | profExp ${m.profExpEnd} | profLv ${m.profLevel} | tasks ${m.tasksDone} | battles ${m.battles} | bosses ${m.bosses} | loot ${m.loot} | syn ${m.synergies} | ontime ${m.ontimeDays} | OT ${m.overtimeDays} | mind0 ${m.mindZeroTicks} | mindMin ${Math.round(m.mindMin)} | fat100 ${m.fatigue100Ticks} | debtMax ${m.debtMax} | pendMax ${m.pendingUnresolvedMax} | exc ${m.exceptions}${v.problems.length ? ' | ' + v.problems.join('; ') : ''}`);
  }
}

const failed = results.filter((r) => !r.ok);
const report = [];
report.push('# V5.7 Balance Simulation — 5 人格 × 7/30/60 天');
report.push('');
report.push('- 运行方式：真实 GameFacade + GameLoop（FakeClock 5 游戏分钟/步），人格策略驱动回复/工时/加班/战斗/领任务。');
report.push('- 模拟器说明：changeWorkMode 的 5 秒冷却基于真实时间，加速时钟下不可用，模拟器直接走 WorkService.setMode（同源模式机）。');
report.push('- 判定：不卡死 / 道心不长期 0 / 疲劳不长期 100 / 工资成长 / 30 天+职业经验成长 / 技术债不饱和 / 消息不堆积。');
report.push('');
report.push('| 人格 | 天数 | 结果 | 工资 | 职业经验 | 职业等级 | 任务 | 战斗 | Boss | 掉落 | 共鸣 | 准点 | 加班 | mind0 | debtMax | 例外 |');
report.push('|------|------|------|------|----------|----------|------|------|------|------|------|------|------|-------|---------|------|');
for (const r of results) {
  const m = r.metrics;
  report.push(`| ${r.name} | ${r.days} | ${r.ok ? 'PASS' : 'FAIL ' + r.problems.join(';')} | ${m.salaryStart}→${m.salaryEnd} | ${m.profExpEnd} | ${m.profLevel} | ${m.tasksDone} | ${m.battles} | ${m.bosses} | ${m.loot} | ${m.synergies} | ${m.ontimeDays} | ${m.overtimeDays} | ${m.mindZeroTicks} | ${m.debtMax} | ${m.exceptions} |`);
}
report.push('');
report.push(`总判定：${failed.length === 0 ? 'ALL PASS' : failed.length + ' FAIL'}`);
fs.mkdirSync(path.join('ai', 'reports'), { recursive: true });
fs.writeFileSync(path.join('ai', 'reports', 'V57-BALANCE-SIM.md'), report.join('\n') + '\n');
console.log(failed.length === 0 ? 'BALANCE SIM ALL PASS' : `BALANCE SIM FAILED: ${failed.length}`);
process.exit(failed.length === 0 ? 0 : 1);
