/**
 * V5.8 Balance Simulation — 6 Personas × 5 Horizons / 30 Scenarios（§7 Balance Gate 2.0）。
 * 人格：COMPLIANT / ASSERTIVE / BALANCED / FISHING_MASTER / TECH_PERFECTIONIST。
 * 检查：不卡死 / 道心不长期为 0 / 疲劳不长期 100 / 工资与职业经验单调成长 / 技术债不永久满。
 * 注意：changeWorkMode 的 5 秒冷却基于真实时间，FakeClock 加速下永远命中——
 * 模拟器直接用 work.setMode（与 WorkService 模式机同源），并主动领任务/清战斗。
 * 运行：node tools/v58-balance-sim.cjs
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
  ASSERTIVE: { workShare: 0.95, overtime: 'DECLINE_FREE', replyTag: 'PROFESSIONAL', battle: true },
  BALANCED: { workShare: 0.7, overtime: 'ACCEPT_PAID', replyTag: null, battle: true },
  FISHING_MASTER: { workShare: 0.25, overtime: 'DECLINE_ALL', replyTag: null, battle: false },
  TECH_PERFECTIONIST: { workShare: 0.9, overtime: 'ACCEPT_PAID', replyTag: 'PROFESSIONAL', battle: true },
  CAREER_CLIMBER: { workShare: 0.95, overtime: 'ACCEPT_ALL', replyTag: 'CAREER', battle: true },
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
    totalActiveTicks: 0, mindZeroTicks2: 0, mindCriticalTicks: 0, fatigueCriticalTicks: 0, debtCriticalTicks: 0, mindSum: 0, fatigueSum: 0,
    forcedRestDays: 0, offerAccepted: 0, burnoutRecovered: 0, governanceDone: 0, managerChoices: 0,
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
        const inWorkWindow = (hod >= 9 && hod < 12) || (hod >= 13 && hod < 18); // 18:00 后下班（模拟器真实作息）
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
          } else if (name === 'CAREER_CLIMBER') {
            const career = opts.find((o) => /晋升|绩效|领导|老板|汇报/.test(o.text));
            if (career) pick = career;
          }
          // 道心贴底时选恢复语义的尾部选项（玩家不会无脑头铁：心魔缠身会自救）
          if (p.mind < 50 && opts.length > 1) pick = opts[opts.length - 1];
          // 道心危急时避免继续选负面回复：优先非伤害选项
          if (p.mind < 30 && opts.length > 1) {
            const safe = opts.find((o) => !/道心| Mind |崩溃/.test(o.text)) || opts[opts.length - 1];
            pick = safe;
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
        // 心魔/道心自救：mind < 45 时喝咖啡/回春丹（真实玩家会用消耗品）
        if (p.mind < 45) {
          try { facade.v2UseConsumable('cons_coffee'); } catch { /* 没有库存 */ }
          if (p.mind < 30) { try { facade.v2UseConsumable('cons_heal'); } catch { /* 没有库存 */ } }
        }
        // 心魔/道心自救：mind < 45 时买咖啡/回春丹喝（真实玩家会用工资买消耗品）
        if (p.mind < 45) {
          const has = (id) => (p.materials?.[id] ?? 0) > 0;
          const tryUse = (id) => { try { return facade.v2UseConsumable(id).success; } catch { return false; } };
          if (!tryUse('cons_coffee')) {
            if (has('cons_coffee') || (p.salary >= 30)) { try { facade.v2Buy('cons_coffee', 30); } catch { /* 售罄 */ } tryUse('cons_coffee'); }
          }
          if (p.mind < 25) {
            if (!tryUse('cons_heal') && p.salary >= 60) { try { facade.v2Buy('cons_heal', 60); } catch { /* 售罄 */ } tryUse('cons_heal'); }
            if (!tryUse('cons_clear') && p.salary >= 80) { try { facade.v2Buy('cons_clear', 80); } catch { /* 售罄 */ } tryUse('cons_clear'); }
          }
        }
        // V5.8 §8：Burnout 恢复闭环——BURNOUT_RISK/BURNOUT 时请半天假（游戏提供的正式恢复路径）
        try {
          const bo = facade.queryBurnout();
          if (bo && (bo.state === 'BURNOUT_RISK' || bo.state === 'BURNOUT') && p.salary > 60) {
            facade.takeHalfDayOff();
            metrics.burnoutRecovered = (facade.context.player.lifetimeStats ?? {}).burnoutRecovered ?? metrics.burnoutRecovered;
          }
        } catch { /* burnout recovery must not crash sim */ }
        // BalanceHealthReport 采样（§7.1 Balance Gate 2.0）
        if (m <= 1080) {
          metrics.totalActiveTicks += 1;
          if (p.mind <= 0) metrics.mindZeroTicks2 += 1;
          if (p.mind < 20) metrics.mindCriticalTicks += 1;
          if ((p.fatigue ?? 0) >= 90) metrics.fatigueCriticalTicks += 1;
          try {
            const dv = Object.values(facade.context.techDebt.all());
            if (dv.length > 0 && dv.every((v) => v >= 90)) metrics.debtCriticalTicks += 1;
          } catch { /* ignore */ }
          metrics.mindSum += p.mind;
          metrics.fatigueSum += p.fatigue ?? 0;
        }
        // 健康采样
        if (m <= 1080 && p.mind <= 0) metrics.mindZeroTicks += 1; // 仅工作时段采样（下班离线不计）
        if (m <= 1080) metrics.mindMin = Math.min(metrics.mindMin, p.mind);
        if ((p.fatigue ?? 0) >= 100) metrics.fatigue100Ticks += 1;
        try {
          const debt = facade.context.techDebt.all();
          const vals = Object.values(debt);
          metrics.debtMax = Math.max(metrics.debtMax, ...vals);
          if (vals.length > 0 && vals.every((v) => v >= 95)) metrics.debtPinnedTicks += 1;
        } catch { /* ignore */ }
      }
      if (facade.context.player.fatigueForcedRest) metrics.forcedRestDays += 1;
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
    metrics.careerRank = facade.context.player.careerLevel ?? 1;
    metrics.mindAvg = Math.round(metrics.mindSum / Math.max(1, metrics.totalActiveTicks));
    metrics.fatigueAvg = Math.round(metrics.fatigueSum / Math.max(1, metrics.totalActiveTicks));
    metrics.mindZeroRatio = metrics.totalActiveTicks > 0 ? metrics.mindZeroTicks2 / metrics.totalActiveTicks : 0;
    metrics.mindCriticalRatio = metrics.totalActiveTicks > 0 ? metrics.mindCriticalTicks / metrics.totalActiveTicks : 0;
    metrics.fatigueCriticalRatio = metrics.totalActiveTicks > 0 ? metrics.fatigueCriticalTicks / metrics.totalActiveTicks : 0;
    metrics.debtCriticalRatio = metrics.totalActiveTicks > 0 ? metrics.debtCriticalTicks / metrics.totalActiveTicks : 0;
    metrics.offerAccepted = (facade.context.player.lifetimeStats ?? {}).offerAccepted ?? 0;
    metrics.burnoutRecovered = (facade.context.player.lifetimeStats ?? {}).burnoutRecovered ?? 0;
    metrics.governanceDone = (facade.context.player.lifetimeStats ?? {}).governanceDone ?? 0;
  } finally {
    facade.destroy();
  }
  return metrics;
}

function verdict(name, days, m) {
  const problems = [];
  const zeroRatioGate = days <= 7 ? 0.05 : days <= 30 ? 0.08 : 0.10;
  if (m.mindZeroRatio > zeroRatioGate) problems.push(`mindZeroRatio ${(m.mindZeroRatio * 100).toFixed(1)}% > ${zeroRatioGate * 100}%`);
  if (m.fatigueCriticalRatio > 0.15) problems.push(`fatigueCritical ${(m.fatigueCriticalRatio * 100).toFixed(1)}%`);
  if (days >= 30 && m.debtCriticalRatio > 0.3) problems.push(`debtCriticalRatio ${(m.debtCriticalRatio * 100).toFixed(1)}%`);
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
  for (const days of [7, 14, 30, 60, 120]) {
    seed += 13;
    const m = runPersona(name, policy, days, seed);
    const v = verdict(name, days, m);
    results.push(v);
    console.log(`${v.ok ? 'PASS' : 'FAIL'} ${name} ${days}d | salary ${m.salaryStart}→${m.salaryEnd} | profExp ${m.profExpEnd} | profLv ${m.profLevel} | tasks ${m.tasksDone} | battles ${m.battles} | bosses ${m.bosses} | loot ${m.loot} | syn ${m.synergies} | ontime ${m.ontimeDays} | OT ${m.overtimeDays} | mind0 ${m.mindZeroTicks} | mindMin ${Math.round(m.mindMin)} | fat100 ${m.fatigue100Ticks} | debtMax ${m.debtMax} | pendMax ${m.pendingUnresolvedMax} | exc ${m.exceptions}${v.problems.length ? ' | ' + v.problems.join('; ') : ''}`);
  }
}

const failed = results.filter((r) => !r.ok);
const report = [];
report.push('# V5.8 Balance Simulation — 6 Personas × 5 Horizons / 30 Scenarios');
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
fs.writeFileSync(path.join('ai', 'reports', 'V58-BALANCE-SIM.md'), report.join('\n') + '\n');
console.log(failed.length === 0 ? 'BALANCE SIM ALL PASS' : `BALANCE SIM FAILED: ${failed.length}`);
process.exit(failed.length === 0 ? 0 : 1);
