/**
 * V10.2 日报 AI 化下班总结测试：
 * 1. settle() 产出非空 aiSummary（基于当日事实）；
 * 2. 同一天同数据 → 同文案（确定性，无外部 AI 依赖）；
 * 3. DaySummaryState 持久化 aiSummary/weekday/durations（日报页可回看）；
 * 4. Event Reroll 合规：EVENT_REROLL 奖励位未在任何 UI/服务入口暴露（IAA-DESIGN "未实现则隐藏"）。
 */
import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 周一（2026-09-21）09:30 开工，18:30 下班结算。 */
function makeSettled(): { context: GameContext; clock: FakeClock; view: ReturnType<GameContext['daySettlement']['settle']> } {
  const clock = new FakeClock(new Date(2026, 8, 21, 9, 30, 0, 0).getTime());
  const context = new GameContext({ storage: new MemoryStorageAdapter(), clock, board: null, battleRng: seededRng(0x5eed) });
  context.gameDay.ensureStarted();
  clock.set(new Date(2026, 8, 21, 18, 30, 0, 0).getTime());
  assert.equal(context.daySettlement.canSettle(), true);
  const view = context.daySettlement.settle();
  return { context, clock, view };
}

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

ok('日报 AI 化总结：settle 产出非空、含事实句与收尾句', () => {
  const { view } = makeSettled();
  assert.ok(view.aiSummary && view.aiSummary.length >= 20, 'aiSummary 应为成段文案');
  assert.ok(view.aiSummary.includes('今天主修'), '应包含当日主修模式句');
  assert.ok(/。$/.test(view.aiSummary), '应以句号收尾');
  assert.ok(/心魔|评级|平凡|明天/.test(view.aiSummary), '应包含收尾变体');
});

ok('日报 AI 化总结：同一天同数据 → 同文案（确定性）', () => {
  const a = makeSettled();
  const b = makeSettled();
  assert.equal(a.view.aiSummary, b.view.aiSummary);
  assert.equal(a.view.weekday, b.view.weekday);
});

ok('日报持久化：dailyHistory 记录 aiSummary/weekday/durations（可回看）', () => {
  const { context, view } = makeSettled();
  assert.equal(context.player.dailyHistory.length, 1);
  const record = context.player.dailyHistory[0];
  assert.equal(record.aiSummary, view.aiSummary);
  assert.equal(record.weekday, view.weekday);
  assert.ok(record.durations, 'durations 应随日报持久化');
  assert.equal(typeof record.durations!.work, 'number');
  // 存档往返：toSaveData 携带新增字段
  const saved = context.player.toSaveData();
  assert.deepEqual(saved.dailyHistory?.[0]?.aiSummary, view.aiSummary);
});

ok('Event Reroll 合规：facade/GameContext 未暴露 EVENT_REROLL 奖励入口（未实现则隐藏）', () => {
  // IAA-DESIGN.md L10：EVENT_REROLL "未实现则隐藏"。当前仅存在于 RewardType/BuffId 类型层，
  // 不得出现可调用的运行时入口。（characterCreationReroll 是创建向导的天命推演，与本奖励位无关）
  const rerollRewardPattern = /eventReroll|rerollEvent|rerollReward|rewardReroll/;
  const facadeProto = Object.getOwnPropertyNames(GameFacade.prototype);
  assert.ok(facadeProto.every((k) => !rerollRewardPattern.test(k)), 'facade 不应存在 EVENT_REROLL 奖励命令');
  const contextRecord = makeSettled().context as unknown as Record<string, unknown>;
  for (const key of Object.keys(contextRecord)) {
    assert.ok(!rerollRewardPattern.test(key), `GameContext 不应装配 EVENT_REROLL 入口：${key}`);
  }
});

console.log(`v10.2 daily report tests passed (${passed})`);
