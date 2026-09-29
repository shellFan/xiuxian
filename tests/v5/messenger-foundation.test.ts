import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';
import { messengerContentCounts, validateMessengerContent } from '../../assets/scripts/v5/messenger-content';

process.env.TZ = 'Asia/Shanghai';

const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');

function makeFacade(): { facade: GameFacade; clock: FakeClock } {
  const clock = new FakeClock(MONDAY_0900);
  const facade = new GameFacade({
    clock,
    careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new MemoryStorageAdapter(),
    board: null,
    randomV2: new RandomService(mulberry32(5101)),
    randomProvider: { next: mulberry32(5101) },
    battleRng: mulberry32(5101),
    autoSaveIntervalSeconds: 0,
  });
  return { facade, clock };
}

function testContentIntegrity(): void {
  const counts = messengerContentCounts();
  assert.ok(counts.events >= 120, `V5 messenger events must reach 120+ (actual ${counts.events})`);
  assert.ok(counts.actors >= 8, `eight core workplace actors required (actual ${counts.actors})`);
  assert.ok(counts.conversations >= 10, `group and private conversations required (actual ${counts.conversations})`);
  console.log('messenger content integrity passed:', JSON.stringify(counts));
}

function testContentValidationCatchesBrokenChains(): void {
  const { validateMessengerContent } = require('../../assets/scripts/v5/messenger-content') as typeof import('../../assets/scripts/v5/messenger-content');
  const issues = validateMessengerContent({
    actors: [{ id: 'BOSS', name: 'x', title: 'x', typingSeconds: 1, avatar: 'a' }],
    conversations: [{ id: 'c1', type: 'BOSS', title: 't', avatar: 'a', participants: ['BOSS'], priority: 'HIGH' }],
    events: [
      { id: 'e1', conversation: 'c1', actor: 'BOSS', priority: 'NORMAL', weight: 1, steps: [{ sender: '老板', text: '在吗' }] },
      { id: 'e1', conversation: 'c1', actor: 'BOSS', priority: 'NORMAL', weight: 1, steps: [{ sender: '老板', text: '重复' }] },
      { id: 'e2', conversation: 'c1', actor: 'BOSS', priority: 'NORMAL', weight: 1, steps: [{ sender: '老板', text: '链' }], replies: [{ id: 'a', text: 'r', effects: { nextEvent: { eventId: 'ghost', delayMinutes: 1 } } }] },
    ],
  });
  assert.deepEqual(issues.duplicateEventIds, ['e1'], 'duplicate event ids must be reported');
  assert.deepEqual(issues.unknownNextEvents, ['e2->ghost'], 'broken chain targets must be reported');
  console.log('messenger content validator passed');
}

function testDeliveryReplyAndEffects(): void {
  const { facade, clock } = makeFacade();
  try {
    facade.gameLoop.start();
    facade.context.messenger.ensureInitialized();
    const content = require('../../assets/scripts/v5/messenger-content') as typeof import('../../assets/scripts/v5/messenger-content');
    const bossEvent = content.messengerEventById('ms_boss_001');
    assert.ok(bossEvent, 'boss_001 event exists');
    const delivered = facade.context.messenger.deliverEvent(bossEvent, clock.now(), 'test:ms_boss_001:1');
    assert.equal(delivered, true, 'event must deliver');
    const badge = facade.queryMessengerBadge();
    assert.equal(badge.totalUnread, 1, 'unread increments after delivery');
    assert.equal(badge.hasCritical, true, 'boss DM is a critical conversation');

    // 幂等：同 key 重复投递被拒绝（§52）
    const duplicated = facade.context.messenger.deliverEvent(bossEvent, clock.now(), 'test:ms_boss_001:1');
    assert.equal(duplicated, false, 'idempotency key prevents duplicate delivery');

    // 回复已读不回：道心+2、老板-2、触发后续
    facade.context.player.mind = 50;
    const mindBefore = facade.snapshot().mind;
    const messages = facade.queryMessages('conv_boss');
    const pending = messages.find((m) => m.options.length > 0);
    assert.ok(pending, 'pending reply options available');
    const reply = facade.replyToMessage(pending.id, 'ignore');
    assert.equal(reply.ok, true, 'ignore reply accepted');
    assert.equal(facade.snapshot().mind, mindBefore + 2, '已读不回 grants mind +2');
    assert.equal(facade.context.npc.value('BOSS'), -2, '已读不回 drops boss relation by 2');

    // 多步消息排程存在
    const chains = facade.context.player.storyDirector.activeChains;
    assert.ok(chains.length >= 1, 'ignore followup chain scheduled');
    console.log('messenger delivery/reply/effects passed');
  } finally {
    facade.destroy();
  }
}

function testSaveMigrationV9KeepsOldSaves(): void {
  const clock = new FakeClock(MONDAY_0900);
  // 模拟 V4.1 存档（saveVersion 8，无任何 V5 字段）
  const legacySave = {
    saveVersion: 8,
    salary: 288,
    lastSaveTime: MONDAY_0900 - 86_400_000 * 3,
    cultivationExp: 500,
    careerLevel: 2,
    mind: 90,
    maxMind: 100,
    performance: 35,
    workSeconds: 3_600,
    fishingSeconds: 600,
  };
  const storage = new MemoryStorageAdapter();
  storage.setItem('game-save', JSON.stringify(legacySave));
  const facade = new GameFacade({
    clock,
    careerEventClock: clock,
    storage,
    board: null,
    randomV2: new RandomService(mulberry32(5101)),
  });
  try {
    facade.context.messenger.ensureInitialized();
    facade.save();
    const snapshot = JSON.parse(storage.getItem('game-save') ?? '{}') as { saveVersion: number; conversations: { id: string }[]; messages: unknown[]; firstWeekStory: { completed: boolean } };
    assert.ok(snapshot.saveVersion >= 9, 'legacy save migrates to v9');
    assert.ok(Array.isArray(snapshot.conversations) && snapshot.conversations.length >= 10, 'default conversations initialized on first V5 boot');
    assert.deepEqual(snapshot.messages, [], 'v4.1 save opens V5 with empty messages');
    assert.equal(snapshot.firstWeekStory.completed, true, 'old player (career 2) skips first-week story');
    // 新玩家不跳过
    const fresh = new PlayerData({ lastSaveTime: clock.now() });
    assert.equal(fresh.firstWeekStory.completed, false, 'new player enters first-week story');
    console.log('save v9 migration passed');
  } finally {
    facade.destroy();
  }
}

function testNoScrollWithMessengerWidget(): void {
  const fs = require('node:fs') as typeof import('node:fs');
  const overlay = fs.readFileSync('desktop/ui-overlay.js', 'utf8');
  const css = fs.readFileSync('desktop/ui-overlay.css', 'utf8');
  assert.match(overlay, /messengerWidgetHtml/, 'home must render the messenger widget');
  assert.match(overlay, /data-action="openMessenger"/, 'topbar must expose the messenger entry');
  assert.match(css, /\.ux-messenger\s*\{[^}]*grid-template-columns:\s*minmax\(220px,\s*30%\)/s, 'messenger page uses 30/70 layout');
  assert.match(css, /\.ux-chat-scroll\s*\{[^}]*overflow-y:\s*auto/s, 'chat content scrolls internally');
}

testContentIntegrity();
testContentValidationCatchesBrokenChains();
testDeliveryReplyAndEffects();
testSaveMigrationV9KeepsOldSaves();
testNoScrollWithMessengerWidget();
console.log('v5 messenger foundation tests passed');
