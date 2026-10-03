/**
 * V5.8 Balance Simulation — 6 Personas × 5 Horizons / 30 Scenarios × 2 Modes
 * Mode A PERSONA_NATIVE: 严格按人格策略回复，不做任何智能自救。
 * Mode B PERSONA_SELF_PRESERVING: 危险时执行合理自救。
 * Gate: SELF_PRESERVING 30/30 PASS
 * 运行: node tools/v58-balance-sim.cjs
 * 输出: ai/reports/V58-BALANCE-SIM.md
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
const START = Date.parse('2026-09-21T09:00:00+08:00');
const TICK_MIN = 20;

const PERSONAS = {
  COMPLIANT:          { workShare: 0.85, replyTag: null,           battle: true },
  ASSERTIVE:          { workShare: 0.85, replyTag: 'PROFESSIONAL', battle: true },
  BALANCED:           { workShare: 0.7,  replyTag: null,           battle: true },
  FISHING_MASTER:     { workShare: 0.25, replyTag: null,           battle: false },
  TECH_PERFECTIONIST: { workShare: 0.9,  replyTag: 'PROFESSIONAL', battle: true },
  CAREER_CLIMBER:     { workShare: 0.95, replyTag: 'CAREER',       battle: true },
};
const HORIZONS = [7, 14, 30, 60, 120];

function runPersona(name, policy, days, seed, mode) {
  const clock = new FakeClock(START);
  const facade = new GameFacade({
    clock, careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new MemoryStorageAdapter(), board: null,
    randomV2: new RandomService(mulberry32(seed)),
    randomProvider: { next: mulberry32(seed) },
    battleRng: mulberry32(seed), autoSaveIntervalSeconds: 0,
    modeSwitchCooldownMs: 0,
    tickIntervalSeconds: 1800,
  });
  // Headless optimization: stub save to skip JSON serialization (MemoryStorage is in-memory anyway)
  facade.context.saveService.save = function() {};
  facade.context.saveService.autoSave = function() {};
  facade.context.messenger.ensureInitialized();
  facade.chooseProfession(['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS'][seed % 4]);
  facade.gameLoop.start();
  facade.context.gameDay.ensureStarted();
  facade.context.dailyPlanner.beginWorkday();
  facade.context.week.beginWorkday();

  const M = { days: 0, exceptions: 0, mindZeroTicks: 0, totalActiveTicks: 0, mindSum: 0, mindMin: 999,
    mindCriticalTicks: 0, fatigueCriticalTicks: 0, fatigueSum: 0, fatigue100Ticks: 0,
    debtCriticalTicks: 0, debtMax: 0, salaryStart: 0, salaryEnd: 0, profExpEnd: 0, tasksDone: 0,
    battles: 0, bosses: 0, loot: 0, synergies: 0, ontimeDays: 0, overtimeDays: 0, pendingMax: 0,
    forcedRestDays: 0, burnoutRecovered: 0, governanceDone: 0, offerAccepted: 0, careerRank: 1, profLevel: 1,
    consecutiveZeroMin: 0, maxConsecutiveZeroMin: 0 };
  M.salaryStart = facade.context.player.salary;
  const p = function() { return facade.context.player; };

  function startDay() {
    facade.context.gameDay.ensureStarted();
    facade.context.dailyPlanner.beginWorkday();
    facade.context.week.beginWorkday();
    try {
      const configs = facade.queryTaskConfigs().filter(function(c) { return c.type === 'WORK' || c.type === 'DAILY'; });
      for (const cfg of configs.slice(0, 2)) { try { facade.startTask(cfg.id); } catch(e) {} }
    } catch(e) {}
  }
  function settleDay() {
    try { facade.context.daySettlement.settle(); M.days += 1; } catch(e) {}
    var day = facade.context.player.gameDay;
    if (day) M.ontimeDays += day.durations.overtime === 0 ? 1 : 0;
    M.overtimeDays += (day && day.durations.overtime > 0) ? 1 : 0;
    if (facade.context.player.fatigueForcedRest) M.forcedRestDays += 1;
  }

  try {
    for (var day = 0; day < days; day++) {
      startDay();
      for (var m = 545; m <= 1260; m += TICK_MIN) {
        clock.advance(TICK_MIN * MINUTE);
        try { facade.gameLoop.tick(TICK_MIN * 60); } catch(e) { M.exceptions += 1; }
        var pl = p();
        var hod = Math.floor(m / 60);
        var inWorkWindow = (hod >= 9 && hod < 12) || (hod >= 13 && hod < 18);
        var wantWork = inWorkWindow && ((m % 60) / 60) < policy.workShare;
        var targetMode = wantWork ? 'WORK' : 'FISHING';
        try { if (pl.workMode !== targetMode) facade.context.work.setMode(targetMode); } catch(e) { M.exceptions += 1; }

        var pending = facade.context.messenger.pendingReplies();
        M.pendingMax = Math.max(M.pendingMax, pending.length);
        var pendingSlice = pending.slice(0, 2);
        for (var mi = 0; mi < pendingSlice.length; mi++) {
          var msg = pendingSlice[mi];
          var opts = msg.replyOptions || [];
          if (opts.length === 0) continue;
          var pick = opts[0];
          if (policy.replyTag) {
            for (var oi = 0; oi < opts.length; oi++) { if (opts[oi].tag === policy.replyTag) { pick = opts[oi]; break; } }
          } else if (name === 'ASSERTIVE') {
            pick = opts[opts.length - 1];
          } else if (name === 'CAREER_CLIMBER') {
            for (var ci = 0; ci < opts.length; ci++) { if (/晋升|绩效|领导|老板|汇报/.test(opts[ci].text)) { pick = opts[ci]; break; } }
          }
          if (mode === 'preserving' && pl.mind < 30 && opts.length > 1) pick = opts[opts.length - 1];
          try { facade.replyToMessage(msg.id, pick.id); } catch(e) { M.exceptions += 1; }
        }

        for (var ti = 0; ti < pl.activeTasks.length; ti++) {
          var t = pl.activeTasks[ti];
          if (t.completed && !t.claimed) { try { facade.context.tasks.claimTask(t.taskId); } catch(e) {} }
        }

        var battle = facade.queryBattle();
        if (battle && battle.skillOffers) { try { facade.chooseBattleSkill(battle.skillOffers[0]); } catch(e) {} }
        try {
          if (facade.queryFinishedBattle()) facade.clearFinishedBattle();
          if (policy.battle && hod === 14 && m % 15 === 0 && !facade.queryBattle() && !pl.activeBattleRun) {
            var builds = facade.queryBattleBuildOptions();
            if (builds.length > 0) { facade.startBattleRun('PROJECT', builds[0].id); M.battles += 1; }
          }
        } catch(e) { M.exceptions += 1; }

        if (mode === 'preserving') {
          if (pl.mind < 45) {
            var tryUse = function(id) { try { return facade.v2UseConsumable(id).success; } catch(e) { return false; } };
            if (!tryUse('cons_coffee') && pl.salary >= 30) { try { facade.v2Buy('cons_coffee', 30); } catch(e) {} tryUse('cons_coffee'); }
            if (pl.mind < 25) {
              if (!tryUse('cons_heal') && pl.salary >= 60) { try { facade.v2Buy('cons_heal', 60); } catch(e) {} tryUse('cons_heal'); }
              if (!tryUse('cons_clear') && pl.salary >= 80) { try { facade.v2Buy('cons_clear', 80); } catch(e) {} tryUse('cons_clear'); }
            }
          }
          try {
            var bo = facade.queryBurnout();
            if (bo && (bo.state === 'BURNOUT_RISK' || bo.state === 'BURNOUT') && pl.salary > 60) facade.takeHalfDayOff();
          } catch(e) {}
        }

        if (m <= 1080) {
          M.totalActiveTicks += 1;
          if (pl.mind <= 0) {
            M.mindZeroTicks += 1;
            M.consecutiveZeroMin += TICK_MIN;
            if (M.consecutiveZeroMin > M.maxConsecutiveZeroMin) M.maxConsecutiveZeroMin = M.consecutiveZeroMin;
          } else { M.consecutiveZeroMin = 0; }
          if (pl.mind < 20) M.mindCriticalTicks += 1;
          if ((pl.fatigue || 0) >= 90) M.fatigueCriticalTicks += 1;
          if ((pl.fatigue || 0) >= 100) M.fatigue100Ticks += 1;
          try {
            var dv = Object.values(facade.context.techDebt.all());
            var allHigh = true;
            for (var di = 0; di < dv.length; di++) { if (dv[di] < 90) { allHigh = false; break; } }
            if (dv.length > 0 && allHigh) M.debtCriticalTicks += 1;
            for (var di2 = 0; di2 < dv.length; di2++) { if (dv[di2] > M.debtMax) M.debtMax = dv[di2]; }
          } catch(e) {}
          M.mindSum += pl.mind;
          if (pl.mind < M.mindMin) M.mindMin = pl.mind;
          M.fatigueSum += pl.fatigue || 0;
        }
      }
      settleDay();
      var now = new Date(clock.now());
      var next9 = new Date(now);
      next9.setDate(next9.getDate() + 1); next9.setHours(9, 0, 0, 0);
      clock.advance(next9.getTime() - clock.now());
    }
    var pl2 = p();
    M.salaryEnd = pl2.salary;
    M.profExpEnd = pl2.professionExp || 0;
    M.tasksDone = (pl2.lifetimeStats || {}).tasksDone || 0;
    M.bosses = (pl2.lifetimeStats || {}).bossKills || 0;
    M.loot = (pl2.ownedEquipment || []).length;
    M.synergies = (pl2.synergyDiscovered || []).length;
    M.profLevel = facade.context.professionContent.level();
    M.careerRank = pl2.careerLevel || 1;
    M.burnoutRecovered = (pl2.lifetimeStats || {}).burnoutRecovered || 0;
    M.governanceDone = (pl2.lifetimeStats || {}).governanceDone || 0;
    M.offerAccepted = (pl2.lifetimeStats || {}).offerAccepted || 0;
    M.mindAvg = Math.round(M.mindSum / Math.max(1, M.totalActiveTicks));
    M.fatigueAvg = Math.round(M.fatigueSum / Math.max(1, M.totalActiveTicks));
    M.mindZeroRatio = M.totalActiveTicks > 0 ? M.mindZeroTicks / M.totalActiveTicks : 0;
    M.mindCriticalRatio = M.totalActiveTicks > 0 ? M.mindCriticalTicks / M.totalActiveTicks : 0;
    M.fatigueCriticalRatio = M.totalActiveTicks > 0 ? M.fatigueCriticalTicks / M.totalActiveTicks : 0;
    M.debtCriticalRatio = M.totalActiveTicks > 0 ? M.debtCriticalTicks / M.totalActiveTicks : 0;
  } finally { facade.destroy(); }
  return M;
}

function verdict(days, m) {
  var problems = [];
  var zeroGate = days <= 7 ? 0.05 : days <= 30 ? 0.08 : 0.10;
  if (m.mindZeroRatio > zeroGate) problems.push('mindZeroRatio ' + (m.mindZeroRatio * 100).toFixed(1) + '% > ' + zeroGate * 100 + '%');
  if (m.maxConsecutiveZeroMin > 90) problems.push('consecZero ' + m.maxConsecutiveZeroMin + 'min>90');
  if (m.fatigue100Ticks > 0.1 * m.totalActiveTicks) problems.push('fatigue100');
  if (m.exceptions > days * 3) problems.push('exceptions=' + m.exceptions);
  if (m.salaryEnd <= m.salaryStart) problems.push('salary no growth');
  if (days >= 30 && m.profExpEnd <= 0) problems.push('profExp never grew');
  if (days >= 30 && m.debtCriticalRatio > 0.3) problems.push('debtCritical');
  if (m.pendingMax > 12) problems.push('pending flood');
  return { ok: problems.length === 0, problems: problems };
}

var allResults = { preserving: [], native: [] };
function runAll(mode) {
  var seed = 9101;
  var names = Object.keys(PERSONAS);
  for (var ni = 0; ni < names.length; ni++) {
    var name = names[ni];
    var policy = PERSONAS[name];
    for (var hi = 0; hi < HORIZONS.length; hi++) {
      var days = HORIZONS[hi];
      seed += 13;
      var t0 = Date.now();
      var m = runPersona(name, policy, days, seed, mode);
      var v = verdict(days, m);
      var row = { name: name, days: days };
      for (var k in m) row[k] = m[k];
      row.ok = v.ok; row.problems = v.problems;
      allResults[mode].push(row);
      console.log('  ' + mode + ' ' + name + ' ' + days + 'd: ' + (v.ok ? 'PASS' : 'FAIL') + ' (' + ((Date.now()-t0)/1000).toFixed(1) + 's)');
    }
  }
}

// ── CLI single-scenario mode: node v58-balance-sim.cjs --single --persona=X --days=N --mode=M --seed=N ──
var args = process.argv.slice(2);
if (args.includes('--single')) {
  var personaIdx = args.indexOf('--persona');
  var daysIdx = args.indexOf('--days');
  var modeIdx = args.indexOf('--mode');
  var seedIdx = args.indexOf('--seed');
  var pname = personaIdx >= 0 ? args[personaIdx + 1] : 'COMPLIANT';
  var pdays = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) : 7;
  var pmode = modeIdx >= 0 ? args[modeIdx + 1] : 'preserving';
  var pseed = seedIdx >= 0 ? parseInt(args[seedIdx + 1]) : 9114;
  var pol = PERSONAS[pname];
  if (!pol) { console.error('Unknown persona: ' + pname); process.exit(2); }
  var result = runPersona(pname, pol, pdays, pseed, pmode);
  var v = verdict(pdays, result);
  var output = { name: pname, days: pdays, mode: pmode, ok: v.ok, problems: v.problems };
  for (var k in result) output[k] = result[k];
  console.log(JSON.stringify(output));
  process.exit(v.ok ? 0 : 1);
}

console.log('=== PERSONA_NATIVE ===');
runAll('native');
var natPass = allResults.native.filter(function(r){return r.ok;}).length;
console.log('NATIVE: ' + natPass + '/' + allResults.native.length + ' PASS');

console.log('=== PERSONA_SELF_PRESERVING ===');
runAll('preserving');
var presPass = allResults.preserving.filter(function(r){return r.ok;}).length;
console.log('PRESERVING: ' + presPass + '/' + allResults.preserving.length + ' PASS');

function fmtRow(r) {
  var status = r.ok ? 'PASS' : 'FAIL ' + r.problems.join(';');
  return '| ' + r.name + ' | ' + r.days + ' | ' + status + ' | ' + r.careerRank + ' | ' + r.profLevel + ' | ¥' + r.salaryStart + '→' + r.salaryEnd + ' | ' + r.mindAvg + ' | ' + (r.mindMin === 999 ? '—' : r.mindMin) + ' | ' + (r.mindZeroRatio * 100).toFixed(1) + '% | ' + r.fatigueAvg + ' | ' + (r.fatigueCriticalRatio * 100).toFixed(1) + '% | ' + r.debtMax + ' | ' + (r.debtCriticalRatio * 100).toFixed(1) + '% | ' + r.tasksDone + ' | ' + r.bosses + ' | ' + r.loot + ' | ' + r.burnoutRecovered + ' | ' + r.exceptions + ' |';
}
var header = '| Persona | Days | Result | Rank | ProfLv | Salary | MindAvg | MindMin | Mind0% | FatigueAvg | FatigueCrit% | DebtMax | DebtCrit% | Tasks | Boss | Loot | BurnoutRec | Exc |';
var sep = '|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|';

var report = [];
report.push('# V5.8 Balance Simulation — 6 Personas × 5 Horizons / 30 Scenarios × 2 Modes');
report.push('');
report.push('- Gate: **SELF_PRESERVING 30/30 PASS** required. NATIVE failures reported separately.');
report.push('- NATIVE: 严格按人格策略回复，不做智能自救（不买咖啡/不请假/不选安全回复/不用消耗品）。');
report.push('- SELF_PRESERVING: 危险时执行合理自救（买咖啡/请半天假/选安全回复/用消耗品）。');
report.push('');
report.push('## SELF_PRESERVING (Gate)');
report.push('');
report.push(header); report.push(sep);
for (var i = 0; i < allResults.preserving.length; i++) report.push(fmtRow(allResults.preserving[i]));
report.push('');
report.push('**SELF_PRESERVING: ' + presPass + '/' + allResults.preserving.length + ' PASS**');
var presFail = allResults.preserving.filter(function(r){return !r.ok;});
if (presFail.length > 0) { report.push(''); report.push('### FAIL details:'); for (var pf of presFail) report.push('- ' + pf.name + ' ' + pf.days + 'd: ' + pf.problems.join('; ')); }
report.push('');
report.push('## PERSONA_NATIVE (Reference)');
report.push('');
report.push(header); report.push(sep);
for (var j = 0; j < allResults.native.length; j++) report.push(fmtRow(allResults.native[j]));
report.push('');
report.push('**NATIVE: ' + natPass + '/' + allResults.native.length + ' PASS**');
var natFail = allResults.native.filter(function(r){return !r.ok;});
if (natFail.length > 0) {
  report.push(''); report.push('### NATIVE FAIL details (新手/不懂系统玩家):');
  for (var nf of natFail) report.push('- ' + nf.name + ' ' + nf.days + 'd: ' + nf.problems.join('; '));
  report.push(''); report.push('NATIVE 失败表明不懂系统的玩家可能进入不良状态。Game 提供了恢复路径（Burnout 请半天假/咖啡/摸鱼），但玩家需要自行发现。');
}
report.push('');
report.push('## 经济修正记录');
report.push('');
report.push('- WORK mindPerHour: -5 → -3（V5.8：局势流 -6/h + 模式流 合成 -9/h，配合结算 +35 → 85% 工作人格净收支 ≥0）');
report.push('- 结算道心恢复: +35（不变）');
report.push('- 心魔自增强: mind<10 时 +2/h → +1/h（V5.8 减半）');
report.push('- 结算心魔消退: -3/晚（V5.8 新增）');
report.push('- demon≥95 阀门: 强制 -10（V5.8 新增）');
report.push('');
report.push('## Verdict');
report.push('');
report.push('SELF_PRESERVING: ' + (presFail.length === 0 ? '**30/30 PASS**' : '**' + presPass + '/30 — NOT COMPLETE**'));
report.push('NATIVE: ' + natPass + '/30（参考值，非门禁）');

fs.mkdirSync(path.join('ai', 'reports'), { recursive: true });
fs.writeFileSync(path.join('ai', 'reports', 'V58-BALANCE-SIM.md'), report.join('\n') + '\n');
console.log('\nFINAL: PRESERVING ' + presPass + '/' + allResults.preserving.length + ' | NATIVE ' + natPass + '/' + allResults.native.length);
process.exit(presFail.length === 0 ? 0 : 1);
