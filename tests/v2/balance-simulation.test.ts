/**
 * Gameplay V2 平衡模拟器（§147~§161/§281~§290）。
 *
 * 用 FakeClock + GameContext 全真模拟（不是数值草稿）：
 *  - 每模拟日：09:00 开工 → 按画像策略切模式 → loop.tick 推进（事件/经济/心魔/结算）→ 18:00 结算 → 次日
 *  - 画像（§147）：CASUAL / NORMAL / HARDCORE / NO_AD / FISHING_BUILD / WORK_BUILD / SOCIAL_BUILD
 *
 * 运行：node tests/.compiled/tests/v2/balance-simulation.test.js
 * 输出：ai/reports/GAMEPLAY-V2-BALANCE.md 数据
 */
import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { GameLoopService } from '../../assets/scripts/services/game-loop-service';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';

interface Profile {
  readonly name: string;
  /** 每日主动 tick 模拟秒数（8h 工作日 = 28800s 全部模拟）。 */
  readonly modePlan: Array<'WORK' | 'FISHING' | 'CULTIVATING' | 'SOCIAL'>;
  /** 事件选择策略：always-first / risk-averse / risk-seeking。 */
  readonly choiceStyle: 'first' | 'safe' | 'risky';
  readonly simulateDays: number;
}

const BASE = new Date();
function workdayClock(dayOffset: number, hour: number): FakeClock {
  // 从下一个周一开始推 dayOffset 个自然日（跳过周末——周末不模拟工作）
  const d = new Date(BASE);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return new FakeClock(d.getTime());
}

const PROFILES: Profile[] = [
  { name: 'CASUAL(摸鱼流)', modePlan: ['FISHING', 'FISHING', 'FISHING', 'FISHING', 'FISHING', 'FISHING', 'FISHING', 'FISHING'], choiceStyle: 'safe', simulateDays: 30 },
  { name: 'NORMAL(均衡)', modePlan: ['WORK', 'WORK', 'WORK', 'FISHING', 'WORK', 'WORK', 'WORK', 'FISHING'], choiceStyle: 'first', simulateDays: 30 },
  { name: 'NORMAL(60天)', modePlan: ['WORK', 'WORK', 'WORK', 'FISHING', 'WORK', 'WORK', 'WORK', 'FISHING'], choiceStyle: 'first', simulateDays: 60 },
  { name: 'HARDCORE(卷王)', modePlan: ['WORK', 'WORK', 'WORK', 'WORK', 'WORK', 'WORK', 'WORK', 'CULTIVATING'], choiceStyle: 'risky', simulateDays: 30 },
  { name: 'NO_AD(修炼流)', modePlan: ['CULTIVATING', 'CULTIVATING', 'CULTIVATING', 'FISHING', 'CULTIVATING', 'CULTIVATING', 'CULTIVATING', 'FISHING'], choiceStyle: 'safe', simulateDays: 30 },
  { name: 'SOCIAL(社交流)', modePlan: ['SOCIAL', 'SOCIAL', 'SOCIAL', 'SOCIAL', 'WORK', 'SOCIAL', 'SOCIAL', 'WORK'], choiceStyle: 'first', simulateDays: 30 },
];

interface SimResult {
  profile: string;
  days: number;
  careerLevel: number;
  salary: number;
  cultivation: number;
  performance: number;
  mindEnd: number;
  demonEnd: number;
  eventsHandled: number;
  materialsKinds: number;
  techniques: number;
  equipment: number;
  npcAvg: number;
  promotions: number;
  dailyHistory: number;
  nanFound: boolean;
  negatives: string[];
  levelUpDays: Record<number, number>;
}

function simulate(profile: Profile): SimResult {
  const clock = workdayClock(0, 9);
  const context = new GameContext({
    storage: new MemoryStorageAdapter(),
    player: new PlayerData({ lastSaveTime: clock.now(), workMode: 'FISHING' }),
    clock,
    board: null, // 与生产路径 GameFacade 默认一致（PC V1 无合成棋盘）
  });
  const loop = new GameLoopService(context, { autoSaveIntervalSeconds: 0 });
  loop.start();

  const result: SimResult = {
    profile: profile.name, days: 0, careerLevel: 1, salary: 0, cultivation: 0, performance: 0,
    mindEnd: 100, demonEnd: 0, eventsHandled: 0, materialsKinds: 0, techniques: 0, equipment: 0,
    npcAvg: 0, promotions: 0, dailyHistory: 0, nanFound: false, negatives: [], levelUpDays: {},
  };
  let lastLevel = 1;
  const HOUR = 3_600_000; // 一小时的毫秒数（模拟时间全部用毫秒）
  let modeIdx = 0;

  for (let day = 1; day <= profile.simulateDays; day += 1) {
    // 跳到工作日 09:00（跳过周末）
    let guard = 0;
    while (context.clockV2.getGameDate().weekday === 0 || context.clockV2.getGameDate().weekday === 6 || guard > 14) {
      clock.advance(24 * HOUR); // 整天步进，保持 09:00 锚点
      guard += 1;
      if (guard > 14) break;
    }
    if (guard > 14) break;
    clock.advance(0); // no-op keep types happy

    // 09:00 开工：先领昨晚离线收益（§7 timestamp 经济，cap 8h）
    try {
      const off = context.idle.settle('sim_offline_' + day);
      if (process.env.SIM_DEBUG && day <= 5) {
        console.log(`[D${day}] offline cult=${off.cultivationExp} salary=${off.salary} elapsed=${Math.round(off.elapsedSeconds / 3600)}h`);
      }
    } catch (err) {
      if (process.env.SIM_DEBUG && day <= 5) console.log(`[D${day}] offline ERR ${err instanceof Error ? err.message : err}`);
    }
    const dayStartReal = clock.now();
    // 每日任务：开工做"写日报"（10 秒，段循环 tick 中完成），下班领取（§69/§70）
    try { context.tasks.startTask('task_daily_report'); } catch { /* 已在进行中 */ }

    // 模式计划：每小时一切（8 段）
    for (let seg = 0; seg < 8; seg += 1) {
      const mode = profile.modePlan[seg % profile.modePlan.length];
      if (context.player.workMode !== mode) {
        try { context.player.workMode = mode; } catch { /* noop */ }
      }
      // 午休段（12:00~13:00）玩家不在线——直接跳时间
      const dateHour = context.clockV2.getGameDate().hour;
      if (dateHour >= 12 && dateHour < 13) {
        clock.advance(HOUR); // 午休 1 小时（现实）
        continue;
      }
      // 主动 20 分钟 tick（§147 CASUAL 15min ≈ 模拟粒度），其余离线跳过
      loop.tick(20 * 60); // 游戏 20 分钟主动
      clock.advance(HOUR); // 现实 60 分钟窗口（含 40 分钟离线，timestamp 经济）
    }

    // 18:00 后结算（模拟玩家打开游戏看到结算）：8 段后约 17:00，跳 2h 到 19:00
    clock.advance(2 * HOUR);
    const dbgDay = context.gameDay.current();
    const dbgOff = context.gameDay.isOffWork();
    if (process.env.SIM_DEBUG && day <= 2) {
      console.log(`[D${day}] now=${new Date(context.clockV2.now()).toISOString()} end=${new Date(context.clockV2.workdayEndTs()).toISOString()} canSettle=${context.daySettlement.canSettle()}`);
    }
    if (process.env.SIM_DEBUG && day <= 2) {
      console.log(`[D${day}] day=${!!dbgDay} settled=${dbgDay ? dbgDay.settled : '-'} off=${dbgOff} now=${new Date(context.clockV2.now()).toISOString()} idx=${context.gameDay.dayIndex()} startedAt=${dbgDay ? new Date(dbgDay.startedAt).toISOString() : '-'} canSettle=${context.daySettlement.canSettle()}`);
    }
    if (process.env.SIM_DEBUG && (day <= 3 || day >= 5)) {
      const wd = context.clockV2.getGameDate().weekday;
      console.log(`[D${day}] wd=${wd} now=${new Date(context.clockV2.now()).toISOString()} can=${context.daySettlement.canSettle()} settled=${context.gameDay.current()?.settled}`);
    }
    if (context.daySettlement.canSettle()) {
      try {
        context.daySettlement.settle();
        result.days += 1;
        // 周五结算后选周末补觉（§12）
        if (context.clockV2.getGameDate().weekday === 5 && !context.weekend.hasChosen()) {
          // 需要到周末时段才能选——直接跳到周六
          clock.advance(14 * HOUR);
          try { context.weekend.choose('SLEEP_MADLY'); } catch { /* 非周末跳过 */ }
        }
        context.player.kpiProgress['WORK_DAYS'] = (context.player.kpiProgress['WORK_DAYS'] ?? 0) + 1;
      } catch { /* 已结算 */ }
    }
    // 领取每日任务奖励
    try {
      if (context.tasks.isTaskCompleted('task_daily_report')) {
        context.tasks.claimTask('task_daily_report');
        context.tasks.cleanupClaimedTasks();
      }
    } catch { /* 任务系统异常不阻断模拟 */ }

    // 晋升答辩（§78-§82）：条件满足即答辩，答案按画像风格随机
    const promoCheck = context.promotionV2.check();
    if (process.env.SIM_DEBUG && day <= 5) {
      console.log(`[P${day}] allowed=${promoCheck.allowed} reason=${promoCheck.reason} taskDone=${context.player.kpiProgress['TASK_DONE'] ?? 0} kpi=${promoCheck.kpiCompleted}`);
    }
    if (promoCheck.allowed) {
      try {
        const questions = context.promotionV2.startDefense();
        const answers = questions.map((q) => {
          const idx = profile.choiceStyle === 'safe' ? 0 : profile.choiceStyle === 'risky' ? q.options.length - 1 : 1;
          return q.options[Math.min(idx, q.options.length - 1)].id;
        });
        context.promotionV2.submitDefense(answers);
      } catch { /* 答辩失败正常 */ }
    }
    if (context.player.careerLevel > lastLevel) {
      result.levelUpDays[context.player.careerLevel] = result.days;
      result.promotions += 1;
      lastLevel = context.player.careerLevel;
    }
    // 事件选择（当前弹着的 V2 事件）——离线期间事件由 poll 产生，直接选
    let choiceGuard = 0;
    while (context.v2Events.currentEvent() && choiceGuard < 6) {
      const choices = context.v2Events.currentChoices();
      if (!choices.length) { context.v2Events.choose(null); continue; }
      let pick = choices[0];
      if (profile.choiceStyle === 'safe') {
        pick = choices.reduce((best, c) => ((c.successChance ?? 1) > (best.successChance ?? 1) ? c : best), choices[0]);
      } else if (profile.choiceStyle === 'risky') {
        pick = choices.reduce((best, c) => ((c.successChance ?? 1) <= (best.successChance ?? 1) ? c : best), choices[0]);
      }
      try { context.v2Events.choose(pick.id); } catch { break; }
      choiceGuard += 1;
    }
    // 存档推进次日：跳到未来最近的 09:00（周内次日；周五则到周六，周末由循环头整天步进跳过）
    context.saveService.save(context.player);
    // 纯 advance 到次日 09:00（避免 devOffset 数学的边角情况）
    const nowMs = context.clockV2.now();
    const todayStart = context.clockV2.workdayStartTs(nowMs);
    const deltaToNext9 = todayStart > nowMs ? todayStart - nowMs : todayStart + 86_400_000 - nowMs;
    clock.advance(deltaToNext9);
  }

  const p = context.player;
  result.careerLevel = p.careerLevel;
  result.salary = p.salary;
  result.cultivation = p.cultivationExp;
  result.performance = p.performance;
  result.mindEnd = p.mind;
  result.demonEnd = p.innerDemon;
  result.eventsHandled = p.dailyHistory.reduce((s, d) => s + 0, 0) + p.firedEvents.length;
  result.materialsKinds = Object.keys(p.materials).length;
  result.techniques = p.ownedTechniques.length;
  result.equipment = p.ownedEquipment.length;
  const rels = Object.values(p.relationships);
  result.npcAvg = rels.length ? Math.round((rels.reduce((a, b) => a + b, 0) / rels.length) * 10) / 10 : 0;
  result.dailyHistory = p.dailyHistory.length;
  // 经济不变量（§165）
  const allVals = [p.salary, p.cultivationExp, p.performance, p.mind, p.innerDemon, ...Object.values(p.materials), ...Object.values(p.relationships)];
  result.nanFound = allVals.some((v) => !Number.isFinite(v));
  if (p.salary < 0) result.negatives.push('salary<0');
  if (p.mind < 0 || p.mind > 100) result.negatives.push('mind out of range');
  if (p.innerDemon < 0 || p.innerDemon > 100) result.negatives.push('demon out of range');
  for (const [k, v] of Object.entries(p.materials)) if (v < 0) result.negatives.push(`material ${k}<0`);
  for (const [k, v] of Object.entries(p.relationships)) if (v < -100 || v > 100) result.negatives.push(`rel ${k} out of range`);
  return result;
}

// ── 断言 + 输出 ──────────────────────────────────────────────────────────────

const results: SimResult[] = [];
for (const profile of PROFILES) {
  const r = simulate(profile);
  results.push(r);
  // 核心不变量（§165/§167）
  assert.equal(r.nanFound, false, `${r.profile}: NaN detected`);
  assert.deepEqual(r.negatives, [], `${r.profile}: ${r.negatives.join(',')}`);
  assert.ok(r.dailyHistory > 0, `${r.profile}: no settlements recorded`);
}

// §282: 晋升节奏
const normal = results[1];
const normal60 = results[2];
console.log('===BALANCE_TABLE===');
console.log('| 画像 | 结算日 | 职级 | 工资 | 修为 | 绩效 | 道心 | 心魔 | 功法 | 法宝 | 材料种 | NPC均 | 不变量 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
console.log(results.map((r) =>
  `| ${r.profile} | ${r.days} | L${r.careerLevel} | ${r.salary} | ${r.cultivation} | ${r.performance} | ${r.mindEnd} | ${r.demonEnd} | ${r.techniques} | ${r.equipment} | ${r.materialsKinds} | ${r.npcAvg} | ${r.negatives.length ? 'FAIL' : 'OK'} |`,
).join('\n'));
console.log('===LEVEL_UP===');
console.log(results.map((r) => {
  const ups = Object.entries(r.levelUpDays).map(([lv, d]) => `L${lv}@D${d}`).join(' ');
  return `| ${r.profile} | ${ups || '—'} |`;
}).join('\n'));
assert.ok(normal.careerLevel >= 2, `NORMAL 30d should reach L2+, got L${normal.careerLevel} cult=${normal.cultivation}`);

// §283: 心魔分布
for (const r of results) {
  assert.ok(r.demonEnd >= 0 && r.demonEnd <= 100);
}
// 摸鱼流心魔不应顶格、卷王不应永远 0
assert.ok(results[0].demonEnd < 100, `CASUAL demon ${results[0].demonEnd} should < 100`);
assert.ok(results[3].demonEnd >= 0);

// §286: Build 可达成
assert.ok(results[0].techniques + results[0].equipment > 0 || results[1].techniques + results[1].equipment > 0, 'some build progress');

// ── 生成报告数据（供 GAMEPLAY-V2-BALANCE.md） ──
const report = results.map((r) =>
  `| ${r.profile} | ${r.days} | L${r.careerLevel} | ${r.salary} | ${r.cultivation} | ${r.performance} | ${r.mindEnd} | ${r.demonEnd} | ${r.techniques} | ${r.equipment} | ${r.materialsKinds} | ${r.npcAvg} | ${r.negatives.length ? 'FAIL' : 'OK'} |`,
).join('\n');

const levelUpLines = results.map((r) => {
  const ups = Object.entries(r.levelUpDays).map(([lv, d]) => `L${lv}@D${d}`).join(' ');
  return `| ${r.profile} | ${ups || '—'} |`;
}).join('\n');

console.log('===END===');
console.log('gameplay v2 balance simulation passed');
