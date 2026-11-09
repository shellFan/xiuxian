/**
 * V6.3 AiCommentatorService 测试：
 * 事件触发点评/冷却机制/卡关检测/不同事件类型文案池。
 */
import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { AiCommentatorService } from '../../assets/scripts/v63/ai-commentator';

function at(day: number, hour: number): number {
  return new Date(2026, 8, day, hour, 0, 0, 0).getTime();
}

function make(hour = 10): { clock: FakeClock; context: GameContext } {
  const clock = new FakeClock(at(21, hour));
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: () => 0.5 });
  context.gameDay.ensureStarted();
  return { clock, context };
}

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// ── 1. 事件触发点评 ─────────────────────────────────────────────────────────

ok('v63Victory事件→发射v63AiComment（praise/cheer/sarcasm之一）', () => {
  const { context } = make();
  const comments: { text: string; mood: string; emoji: string }[] = [];
  context.events.on('v63AiComment', (c) => comments.push({ ...c }));
  context.aiCommentator.attach();
  context.events.emit('v63Victory', { stage: 1, rewards: { salary: 10, cultivation: 5 } });
  assert.equal(comments.length, 1, '应发射1条点评');
  assert.ok(['praise', 'cheer', 'sarcasm'].includes(comments[0].mood), 'mood应为praise/cheer/sarcasm');
  assert.ok(comments[0].text.length > 0, '文案非空');
  assert.ok(comments[0].emoji.length > 0, 'emoji非空');
});

ok('v63BossPending→warn mood提醒打卡牌', () => {
  const { context } = make();
  const comments: { mood: string }[] = [];
  context.events.on('v63AiComment', (c) => comments.push({ mood: c.mood }));
  context.aiCommentator.attach();
  context.events.emit('v63BossPending', { stage: 12, bossName: '产品VP' });
  // stage 12 % 4 = 0 → ON_BOSS_PENDING[0] = warn
  assert.equal(comments.length, 1);
  assert.equal(comments[0].mood, 'warn');
});

ok('v63TowerAdvanced→通天塔文案', () => {
  const { context } = make();
  const comments: { text: string }[] = [];
  context.events.on('v63AiComment', (c) => comments.push({ text: c.text }));
  context.aiCommentator.attach();
  context.events.emit('v63TowerAdvanced', { floor: 2 });
  assert.equal(comments.length, 1);
  assert.ok(comments[0].text.length > 0);
});

ok('v63MemberHired→招人文案', () => {
  const { context } = make();
  const comments: { text: string }[] = [];
  context.events.on('v63AiComment', (c) => comments.push({ text: c.text }));
  context.aiCommentator.attach();
  context.events.emit('v63MemberHired', { name: '实习生小陈', profession: 'JAVA_BACKEND' });
  assert.equal(comments.length, 1);
  assert.ok(comments[0].text.length > 0);
});

// ── 2. 冷却机制 ─────────────────────────────────────────────────────────────

ok('冷却：同mood 15s内不重复发射', () => {
  const { clock, context } = make();
  const svc = new AiCommentatorService(context, () => clock.now());
  const comments: { mood: string }[] = [];
  context.events.on('v63AiComment', (c) => comments.push({ mood: c.mood }));
  svc.attach();
  // stage 1 → ON_VICTORY[1] = sarcasm; stage 5 → ON_VICTORY[5] = cheer（不同mood不受限）
  context.events.emit('v63Victory', { stage: 1, rewards: { salary: 10, cultivation: 5 } });
  assert.equal(comments.length, 1, '第1条通过');
  // stage 5 → ON_VICTORY[5] = cheer，不同mood，应通过
  context.events.emit('v63Victory', { stage: 5, rewards: { salary: 10, cultivation: 5 } });
  assert.equal(comments.length, 2, '不同mood不受冷却');
  // stage 9 → ON_VICTORY[9%6=3] = cheer，与上一条同mood，应被冷却
  context.events.emit('v63Victory', { stage: 9, rewards: { salary: 10, cultivation: 5 } });
  assert.equal(comments.length, 2, '同mood 15s内被冷却');
  // 推进16s后同mood应通过
  clock.advance(16_000);
  context.events.emit('v63Victory', { stage: 9, rewards: { salary: 10, cultivation: 5 } });
  assert.equal(comments.length, 3, '冷却结束后通过');
});

// ── 3. 卡关检测 ─────────────────────────────────────────────────────────────

ok('卡关：同stage停留60s→发射ON_STUCK建议', () => {
  const { clock, context } = make();
  const svc = new AiCommentatorService(context, () => clock.now());
  const comments: { text: string }[] = [];
  context.events.on('v63AiComment', (c) => comments.push({ text: c.text }));
  svc.attach();
  context.autoBattle.ensureStarted();
  // 初始stage=1，svc.lastStageSeen=0 → 第一次tick会同步stage并重置计时
  svc.tick();
  assert.equal(comments.length, 0, '首次tick只同步，不发点评');
  // 推进61s → 卡关检测触发
  clock.advance(61_000);
  svc.tick();
  assert.equal(comments.length, 1, '卡关60s后应发建议');
  assert.ok(comments[0].text.includes('升级') || comments[0].text.includes('DPS') || comments[0].text.includes('灵石') || comments[0].text.includes('磨刀'), '应是升级建议文案');
});

ok('未卡关：同stage停留<60s不发建议', () => {
  const { clock, context } = make();
  const svc = new AiCommentatorService(context, () => clock.now());
  const comments: { text: string }[] = [];
  context.events.on('v63AiComment', (c) => comments.push({ text: c.text }));
  svc.attach();
  context.autoBattle.ensureStarted();
  svc.tick();
  clock.advance(30_000);
  svc.tick();
  assert.equal(comments.length, 0, '30s不应触发卡关建议');
});

console.log(`ai-commentator tests passed (${passed})`);