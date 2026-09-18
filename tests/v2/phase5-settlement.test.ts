/**
 * Gameplay V2 Phase 5 — promotion V2 (defense), daily/weekly settlement, titles.
 */
import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';
import { FixedRandomProvider } from '../../assets/scripts/core/random-provider';
import { PROMO_TITLES_IMPORTED } from './promo-config';

function workdayClockAt(hour: number, weekdayTarget = 3): FakeClock {
  const d = new Date();
  const delta = (weekdayTarget - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  d.setHours(hour, 0, 0, 0);
  return new FakeClock(d.getTime());
}

function makeCtx(clock: FakeClock, randomProvider = new FixedRandomProvider(0.5)): GameContext {
  return new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock, randomProvider });
}

// ── 晋升条件（§75/§77） ─────────────────────────────────────────────────────

function testPromotionCheckNeedsWorkdays(): void {
  const clock = workdayClockAt(10);
  const ctx = makeCtx(clock);
  ctx.gameDay.ensureStarted();
  const check = ctx.promotionV2.check();
  assert.equal(check.kpiCompleted, false, 'fresh player KPI incomplete');
  assert.equal(check.allowed, false);
  assert.equal(check.reason, 'KPI_INCOMPLETE');
}

function testPromotionDefenseFlow(): void {
  const clock = workdayClockAt(10);
  // A passing V2 defense must not be vetoed by the retired probabilistic interview roll.
  const ctx = makeCtx(clock, new FixedRandomProvider(0.99));
  // 灌满晋升条件
  const p = ctx.player;
  p.workSeconds = 7200; // L1 需要 1 天
  p.cultivationExp = 100;
  p.performance = 120;
  p.kpiProgress['TASK_DONE'] = 3;
  ctx.gameDay.ensureStarted();
  // 跳到下班后（答辩不限定时段，但用 check 控制门）
  const check = ctx.promotionV2.check();
  assert.equal(check.kpiCompleted, true);
  assert.equal(check.workdaysOk, true);
  assert.equal(check.mindOk, true);
  assert.equal(check.allowed, true);

  const questions = ctx.promotionV2.startDefense();
  assert.equal(questions.length, 3);
  for (const q of questions) assert.equal(q.options.length, 3);
  assert.throws(() => ctx.promotionV2.submitDefense([]), /必须回答全部三题/);
  // 提交答案（每题选第一项）
  const score = ctx.promotionV2.submitDefense(questions.map((q) => q.options[0].id));
  assert.ok(score.total >= 0 && score.total <= 100);
  if (score.passed) {
    assert.equal(p.careerLevel, 2, 'promoted on pass');
  } else {
    assert.equal(p.careerLevel, 1, 'no level change on fail (§82)');
    assert.ok(p.innerDemon > 0, 'fail adds inner demon');
  }
}

function testPromotionFailCooldown(): void {
  const clock = workdayClockAt(10);
  const ctx = makeCtx(clock);
  const p = ctx.player;
  p.workSeconds = 7200;
  p.cultivationExp = 100;
  p.kpiProgress['TASK_DONE'] = 3;
  // 强制失败：道心低（mindOk false 不能 start；改为清空 performance 并让分低）
  // 直接走 check 的 COOLDOWN 分支：手动设置冷却旗标
  p.eventFlags[`promoCooldownUntil:${clock.now() + 86_400_000}`] = true;
  const check = ctx.promotionV2.check();
  assert.equal(check.cooldownActive, true);
  assert.equal(check.reason, 'COOLDOWN');
}

function testPromotionMindGate(): void {
  const clock = workdayClockAt(10);
  const ctx = makeCtx(clock);
  const p = ctx.player;
  p.workSeconds = 7200;
  p.cultivationExp = 100;
  p.kpiProgress['TASK_DONE'] = 3;
  p.mind = 10; // 道心过低
  const check = ctx.promotionV2.check();
  assert.equal(check.mindOk, false);
  assert.equal(check.reason, 'MIND_LOW');
}

function testPromotionCultivationGate(): void {
  const clock = workdayClockAt(10);
  const ctx = makeCtx(clock);
  const p = ctx.player;
  p.careerLevel = 3;
  // L3 KPI cultivation is 1500, while the career breakthrough requires 1800.
  p.workSeconds = 64800;
  p.cultivationExp = 1500;
  p.kpiProgress['TASK_DONE'] = 15;
  const check = ctx.promotionV2.check();
  assert.equal(check.kpiCompleted, true);
  assert.equal(check.workdaysOk, true);
  assert.equal(check.allowed, false);
  assert.equal(check.reason, 'CULTIVATION_INSUFFICIENT');
  assert.throws(() => ctx.promotionV2.startDefense(), /CULTIVATION_INSUFFICIENT/);
}

// ── 日结算（§92~§95） ───────────────────────────────────────────────────────

function testDailySettlementOnce(): void {
  const clock = workdayClockAt(18, 3); // 周三 18:00
  const ctx = makeCtx(clock);
  ctx.gameDay.ensureStarted();
  assert.equal(ctx.daySettlement.canSettle(), true);
  const view = ctx.daySettlement.settle();
  assert.equal(view.dayIndex, 1);
  assert.ok(view.title);
  assert.ok(['S', 'A', 'B', 'C', 'D'].includes(view.rank));
  assert.equal(view.isWeekly, false);
  assert.deepEqual(ctx.player.dailyHistory.length, 1);
  assert.equal(ctx.saveService.load().dailyHistory?.length, 1, 'settlement must persist immediately');
  // exactly once
  assert.equal(ctx.daySettlement.canSettle(), false);
  assert.throws(() => ctx.daySettlement.settle(), /已结算/);
}

function testDailySettlementNotBeforeOffWork(): void {
  const clock = workdayClockAt(14, 3);
  const ctx = makeCtx(clock);
  ctx.gameDay.ensureStarted();
  assert.equal(ctx.daySettlement.canSettle(), false);
  assert.throws(() => ctx.daySettlement.settle(), /未到下班时间/);
}

function testDailyTitlePools(): void {
  assert.ok(PROMO_TITLES_IMPORTED.dailyTitles.length >= 30, `titles >= 30`);
  assert.ok(PROMO_TITLES_IMPORTED.promotionQuestions.length >= 30, `questions >= 30`);
  const ids = new Set(PROMO_TITLES_IMPORTED.dailyTitles.map((t) => t.id));
  assert.equal(ids.size, PROMO_TITLES_IMPORTED.dailyTitles.length);

  const clock = workdayClockAt(18, 2); // Tuesday
  const ctx = makeCtx(clock);
  ctx.player.mind = 50;
  ctx.gameDay.ensureStarted();
  const view = ctx.daySettlement.settle();
  assert.notEqual(view.title, '周五夜行侠', 'weekday title must not match on Tuesday');
  assert.notEqual(view.title, '道心破碎者', 'mind 50 is not below the low-mind threshold');
}

function testWeeklySettlementOnFriday(): void {
  const clock = workdayClockAt(18, 5); // 周五 18:00
  const ctx = makeCtx(clock);
  ctx.gameDay.ensureStarted();
  const view = ctx.daySettlement.settle();
  assert.equal(view.isWeekly, true);
  assert.equal(ctx.player.weeklyHistory.length, 1);
  assert.equal(ctx.player.weeklyHistory[0].weekIndex, 0);
}

// ── run ──────────────────────────────────────────────────────────────────────

testPromotionCheckNeedsWorkdays();
testPromotionDefenseFlow();
testPromotionFailCooldown();
testPromotionMindGate();
testPromotionCultivationGate();
testDailySettlementOnce();
testDailySettlementNotBeforeOffWork();
testDailyTitlePools();
testWeeklySettlementOnFriday();
console.log('gameplay v2 phase5 settlement tests passed');
