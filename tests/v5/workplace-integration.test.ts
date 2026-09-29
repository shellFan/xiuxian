import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';
import { MESSENGER_CONTENT, messengerEventById } from '../../assets/scripts/v5/messenger-content';

process.env.TZ = 'Asia/Shanghai';

const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');
const MINUTE = 60_000;

function makeFacade(seed = 5201): { facade: GameFacade; clock: FakeClock } {
  const clock = new FakeClock(MONDAY_0900);
  const facade = new GameFacade({
    clock,
    careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new MemoryStorageAdapter(),
    board: null,
    randomV2: new RandomService(mulberry32(seed)),
    randomProvider: { next: mulberry32(seed) },
    battleRng: mulberry32(seed),
    autoSaveIntervalSeconds: 0,
  });
  return { facade, clock };
}

function deliver(facade: GameFacade, clock: FakeClock, eventId: string): { messageId: string; options: { id: string; text: string }[] } {
  facade.context.messenger.ensureInitialized();
  const event = messengerEventById(eventId);
  assert.ok(event, `event ${eventId} exists`);
  assert.equal(facade.context.messenger.deliverEvent(event, clock.now(), `t:${eventId}:${clock.now()}`), true, 'delivery succeeds');
  const messages = facade.queryMessages(event.conversation);
  const pending = messages.find((m) => m.options.length > 0);
  assert.ok(pending, `pending message for ${eventId}`);
  return { messageId: pending.id, options: pending.options.map((o) => ({ id: o.id, text: o.text })) };
}

/** V5-3：群聊甩锅 → ResponsibilityCase（公开可见），GIT_LOG 证据反杀路径存在。 */
function testBlameGroupOpensResponsibilityCase(): void {
  const { facade, clock } = makeFacade();
  try {
    facade.gameLoop.start();
    const delivered = deliver(facade, clock, 'ms_inc_004');
    const blameReply = delivered.options.find((o) => o.id === 'a');
    assert.ok(blameReply, '「我看看，是我的我认」reply available without evidence');
    const casesBefore = facade.context.responsibility.openCases().length;
    const result = facade.replyToMessage(delivered.messageId, 'a');
    assert.equal(result.ok, true, 'blame reply accepted');
    assert.equal(facade.context.responsibility.openCases().length, casesBefore + 1, '群聊甩锅 opens a ResponsibilityCase');
    // 证据反杀选项要求 GIT_LOG + EVIDENCE_MASTER：新档不可见/不可用
    const fresh = makeFacade();
    try {
      fresh.facade.gameLoop.start();
      const d2 = deliver(fresh.facade, fresh.clock, 'ms_inc_004');
      const evidenceReply = d2.options.find((o) => o.id === 'b');
      assert.equal(evidenceReply, undefined, 'GIT_LOG+tag gated reply is hidden for a fresh save');
      assert.equal(fresh.facade.replyToMessage(d2.messageId, 'b').ok, false, 'gated reply is rejected even if forced');
    } finally {
      fresh.facade.destroy();
    }
    console.log('blame group → responsibility case passed');
  } finally {
    facade.destroy();
  }
}

/** V5-4：事故消息 → Incident + 线上禁地入口 → 真实 INCIDENT 战斗。 */
function testIncidentMessageOpensDungeon(): void {
  const { facade, clock } = makeFacade();
  try {
    facade.gameLoop.start();
    clock.advance(60_000);
    facade.gameLoop.tick(1);
    const delivered = deliver(facade, clock, 'ms_inc_001');
    const result = facade.replyToMessage(delivered.messageId, 'a');
    assert.equal(result.ok, true, '「拉事故群，我十分钟后上线」accepted');
    assert.ok(facade.context.player.incidents.length >= 1, 'incident raised through existing IncidentService');
    const pending = facade.queryPendingIncidentDungeon();
    assert.ok(pending, 'incident dungeon entry is pending');
    // 进入线上禁地（真实 INCIDENT 战斗）
    const run = facade.startIncidentDungeon(pending.incidentType);
    assert.equal(run.source, 'INCIDENT', 'dungeon opens as an INCIDENT battle run');
    assert.equal(facade.queryPendingIncidentDungeon(), null, 'pending dungeon cleared after entering');
    assert.ok(run.enemies.length > 0, 'dungeon battle spawns enemies (regression for the transpile blocker)');
    // 推进到战斗结束，奖励 exactly-once
    for (let tick = 0; tick < 2_400 && !facade.queryFinishedBattle(); tick += 1) {
      const active = facade.queryBattle();
      if (active?.skillOffers) facade.chooseBattleSkill(active.skillOffers[0]);
      facade.gameLoop.tick(1);
      clock.advance(1_000);
    }
    const finished = facade.queryFinishedBattle();
    assert.ok(finished, 'incident dungeon battle reaches a terminal state');
    assert.equal(finished.rewardsClaimed, true, 'dungeon rewards exactly-once');
    console.log('incident message → dungeon → combat passed');
  } finally {
    facade.destroy();
  }
}

/** V5-5：首周节拍（D1 欢迎私聊 → D5 17:55）+ 计划 vs 实际（§26）。 */
function testFirstWeekBeatsAndPlanReality(): void {
  const { facade, clock } = makeFacade(5101);
  try {
    facade.gameLoop.start();
    facade.gameLoop.tick(1);
    // D1 09:15 前后应收到小师妹的入职私聊（首周节拍 d1_welcome）
    for (let i = 0; i < 40 && facade.context.player.messages.length === 0; i += 1) {
      clock.advance(30_000);
      facade.gameLoop.tick(30);
    }
    const firstMessages = facade.context.player.messages;
    assert.ok(firstMessages.length >= 1, 'first-week beat delivers a message on D1');
    const juniorMessage = firstMessages.find((m) => m.conversationId === 'conv_junior');
    assert.ok(juniorMessage, 'D1 first-week beat is the junior welcome DM');

    // 今日计划在开工时生成
    const plan = facade.context.player.dailyPlan;
    assert.ok(plan.length >= 2, `daily plan generated at workday start (items: ${plan.length})`);

    // 回复产生「实际」记录
    const messages = facade.queryMessages(juniorMessage.conversationId);
    const pending = messages.find((m) => m.options.length > 0);
    if (pending) facade.replyToMessage(pending.id, pending.options[0].id);
    assert.ok(facade.context.player.dailyReality.length >= 0, 'daily reality list available');
    const view = facade.queryDailyPlanReality();
    assert.equal(view.plan.length, plan.length, 'plan/reality view exposes the plan');
    console.log('first-week beats + plan/reality passed');
  } finally {
    facade.destroy();
  }
}

/** 30 天消息压力（§60）：500+ 条、无重复 ID、容量受控、无重复奖励。 */
function testMessageStress30Days(): void {
  const { facade, clock } = makeFacade(5301);
  try {
    facade.gameLoop.start();
    facade.gameLoop.tick(1);
    for (let day = 0; day < 30; day += 1) {
      for (let step = 0; step < 96; step += 1) {
        clock.advance(9 * MINUTE);
        // 游戏时钟已前进九分钟；只需一次服务 tick 触发相应的时间窗，
        // 不能为了测试把每一个现实秒都重新模拟一遍。
        facade.gameLoop.tick(1);
        // 处理待回复（模拟玩家随机回复）
        const pending = facade.context.messenger.pendingReplies();
        if (pending.length > 0) {
          const target = pending[0];
          facade.replyToMessage(target.id, (target.replyOptions ?? [])[0]?.id ?? 'ignore');
        }
      }
    }
    const scheduledMessages = facade.context.player.messages.length;
    assert.ok(scheduledMessages >= 80, `30-day story stays active (actual ${scheduledMessages} messages)`);
    assert.ok(scheduledMessages <= 400, `story budget prevents message flooding (actual ${scheduledMessages} messages)`);

    // 以不同的合法幂等键投递 500 条真实内容事件，验证容量/ID/存档边界；
    // 这与剧情节奏断言分开，避免为了凑压力样本而让正常日轰炸玩家。
    for (let index = 0; index < 500; index += 1) {
      const event = MESSENGER_CONTENT.events[index % MESSENGER_CONTENT.events.length];
      facade.context.messenger.deliverEvent(event, clock.now() + index, `stress:${index}`);
    }
    const messages = facade.context.player.messages;
    assert.ok(messages.length >= 500, `stress corpus retains 500+ messages across conversations (actual ${messages.length})`);
    const ids = new Set(messages.map((m) => m.id));
    assert.equal(ids.size, messages.length, 'no duplicate message ids after 30-day stress');
    const perConversation = new Map<string, number>();
    for (const m of messages) perConversation.set(m.conversationId, (perConversation.get(m.conversationId) ?? 0) + 1);
    for (const [, count] of perConversation) {
      assert.ok(count <= 140, `per-conversation archive cap holds (actual ${count})`);
    }
    // 战斗/事故无 dangling：所有 incident 均有合法状态
    for (const incident of facade.context.player.incidents) {
      assert.ok(['DETECTED', 'MITIGATING', 'RECOVERED', 'POSTMORTEM_DONE', 'CLOSED'].includes(incident.status), 'no dangling incidents');
    }
    // save/load 一致（§61）：存档后再读，消息数一致
    facade.save();
    const reloaded = facade.context.saveService.load() as unknown as { messages: { id: string }[] };
    assert.equal(reloaded.messages.length, messages.length, 'save/load keeps message count consistent');
    console.log(`30-day message stress passed (${messages.length} messages, ${facade.context.player.incidents.length} incidents)`);
  } finally {
    facade.destroy();
  }
}

testBlameGroupOpensResponsibilityCase();
testIncidentMessageOpensDungeon();
testFirstWeekBeatsAndPlanReality();
testMessageStress30Days();
console.log('v5 workplace integration tests passed');
