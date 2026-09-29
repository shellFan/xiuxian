import type {
  GameContext,
} from '../core/game-context';
import type {
  MessengerConversationState,
  MessengerMessageState,
  MessengerReplyOptionState,
  DailyRealityEntryState,
} from '../model/save-data';
import {
  MESSENGER_CONTENT,
  messengerActorById,
  messengerConversationById,
  messengerEventById,
  type MessengerEffectDef,
  type MessengerEventDef,
} from './messenger-content';

/** 每会话消息滚动窗口（§50）。 */
const MESSAGES_PER_CONVERSATION = 120;
/** 关键剧情/证据摘要的独立硬上限。 */
const ARCHIVED_SUMMARIES_PER_CONVERSATION = 20;
/** 幂等键窗口大小（防时间跳转重复触发）。 */
const FIRED_KEYS_LIMIT = 240;
/** 待回复消息超时（游戏毫秒）：超时自动按「已读不回」的后续事件处理。 */
const REPLY_EXPIRE_MS = 45 * 60 * 1000;

export interface MessengerBadgeView {
  readonly totalUnread: number;
  readonly criticalUnread: number;
  readonly hasCritical: boolean;
  readonly lastPreview: { readonly conversationTitle: string; readonly text: string; readonly at: number } | null;
}

export interface MessengerConversationView {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly avatar: string;
  readonly unreadCount: number;
  readonly lastMessageAt: number;
  readonly lastPreview: string;
  readonly priority: string;
  readonly pinned: boolean;
}

export interface MessengerMessageView extends MessengerMessageState {
  readonly options: readonly MessengerReplyOptionState[];
  readonly expired: boolean;
}

/**
 * V5 飞剑传书 — WorkplaceMessenger。
 * 只负责消息的投递/状态/回复路由；效果落地统一走 applyEffects 桥接现有系统。
 * 所有状态落 player（save v9），不建第二套存档（§49）。
 */
export class MessengerService {
  public constructor(private readonly context: GameContext) {}

  // ── 初始化（V4.1 旧档迁移到 V9 时调用一次） ──

  public ensureInitialized(): void {
    const player = this.context.player;
    if (!player.conversations || player.conversations.length === 0) {
      player.conversations = MESSENGER_CONTENT.conversations.map((def) => ({
        id: def.id,
        type: def.type,
        title: def.title,
        avatar: def.avatar,
        participants: [...def.participants],
        unreadCount: 0,
        lastMessageAt: 0,
        pinned: def.priority === 'CRITICAL',
        muted: false,
        priority: def.priority,
      }));
    }
    if (!player.messages) player.messages = [];
    if (!player.storyDirector) {
      player.storyDirector = {
        storyBudget: 0,
        interruptBudget: 0,
        tension: 0,
        lastMessageAt: 0,
        lastMajorEventAt: 0,
        recentActors: {},
        activeChains: [],
        unresolvedCases: [],
        firedKeys: [],
      };
    }
    if (!player.firstWeekStory) {
      // 老玩家（职业等级 > 1 或已过 7 天）不重跑首周（§96）。
      const day = player.gameDay?.dayIndex ?? 1;
      const firstWeekCompleted = player.careerLevel > 1 || day > 7;
      player.firstWeekStory = { completed: firstWeekCompleted, doneSteps: [] };
      // 老玩家上线礼（§97）：不弹长教程，一条系统通知 + 软提示。
      if (firstWeekCompleted) {
        player.messages = [
          ...(player.messages ?? []),
          {
            id: `msg_v5_welcome_d${player.gameDay?.dayIndex ?? 1}_l${player.careerLevel}`,
            conversationId: 'conv_system',
            senderId: 'SYSTEM',
            senderName: '飞剑传书',
            timestamp: this.context.clockV2.now(),
            content: '「飞剑传书已接入公司灵网。」以后老板、产品、测试的破事都会先飞到这里。重要消息会强提醒，普通消息……你懂的，可以已读不回。',
            messageType: 'NOTICE',
            read: false,
          } as MessengerMessageState,
        ];
        player.conversations = (player.conversations ?? []).map((c) =>
          c.id === 'conv_system' ? { ...c, unreadCount: c.unreadCount + 1, lastMessageAt: this.context.clockV2.now() } : c,
        );
      }
    }
    if (!player.dialogFlags) player.dialogFlags = {};
    if (!player.dailyPlan) player.dailyPlan = [];
    if (!player.dailyReality) player.dailyReality = [];
  }

  // ── 查询 ──

  public badge(): MessengerBadgeView {
    const messages = this.context.player.messages ?? [];
    const conversations = this.context.player.conversations ?? [];
    // 强打断（§8）：仅限事故群 / 老板私聊等关键会话；其余只进列表不弹窗。
    const criticalTypes = new Set(
      conversations.filter((c) => c.type === 'INCIDENT' || c.type === 'BOSS').map((c) => c.id),
    );
    const unread = messages.filter((m) => !m.read && !m.recalled);
    const criticalUnread = unread.filter((m) => criticalTypes.has(m.conversationId)).length;
    let lastPreview: MessengerBadgeView['lastPreview'] = null;
    for (let i = unread.length - 1; i >= 0; i -= 1) {
      const m = unread[i];
      const conv = conversations.find((c) => c.id === m.conversationId);
      if (conv && conv.priority !== 'LOW') {
        lastPreview = { conversationTitle: conv.title, text: m.recalled ? '撤回了一条消息' : m.content, at: m.timestamp };
        break;
      }
    }
    return { totalUnread: unread.length, criticalUnread, hasCritical: criticalUnread > 0, lastPreview };
  }

  public conversationsView(): MessengerConversationView[] {
    const conversations = [...(this.context.player.conversations ?? [])];
    const messages = this.context.player.messages ?? [];
    return conversations
      .map((c) => {
        const last = [...messages].filter((m) => m.conversationId === c.id).sort((a, b) => b.timestamp - a.timestamp)[0];
        return {
          id: c.id,
          type: c.type,
          title: c.title,
          avatar: c.avatar,
          unreadCount: c.unreadCount,
          lastMessageAt: c.lastMessageAt,
          lastPreview: last ? (last.recalled ? '撤回了一条消息' : last.content) : '',
          priority: c.priority,
          pinned: c.pinned,
        };
      })
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.lastMessageAt - a.lastMessageAt);
  }

  public messagesView(conversationId: string): MessengerMessageView[] {
    const actor = this.context.player;
    const messages = (actor.messages ?? []).filter((m) => m.conversationId === conversationId);
    return messages.map((m) => ({
      ...m,
      options: (m.read || m.recalled || !m.replyOptions) ? [] : m.replyOptions,
      expired: !!(m.replyOptions && !m.read && m.timestamp + REPLY_EXPIRE_MS < this.context.clockV2.now()),
    }));
  }

  /** 打开会话：标记已读。 */
  public markConversationRead(conversationId: string): void {
    const player = this.context.player;
    const conv = (player.conversations ?? []).find((c) => c.id === conversationId);
    if (!conv) return;
    const messages = player.messages ?? [];
    for (const m of messages) {
      if (m.conversationId === conversationId && !m.seen) {
        player.messages = (player.messages ?? []).map((x) => (x.id === m.id ? { ...x, seen: true } : x));
      }
    }
    player.conversations = (player.conversations ?? []).map((c) =>
      c.id === conversationId ? { ...c, unreadCount: 0 } : c,
    );
    void messages;
  }

  public pendingReplies(): MessengerMessageState[] {
    return (this.context.player.messages ?? []).filter((m) => m.replyOptions && !m.read && !m.recalled);
  }

  // ── 投递（由 StoryDirector / 事件桥调用） ──

  public deliverEvent(event: MessengerEventDef, nowMs: number, idempotencyKey?: string): boolean {
    if (idempotencyKey && this.hasFiredKey(idempotencyKey)) return false;
    const player = this.context.player;
    const actor = messengerActorById(event.actor);
    const senderName = event.steps[0]?.sender ?? actor?.name ?? event.actor;
    const conversationId = event.conversation;
    const lastStep = event.steps[event.steps.length - 1];
    const options: MessengerReplyOptionState[] | undefined = event.replies
      ? event.replies
        .filter((reply) => this.replyAvailable(reply))
        .map((reply) => ({ id: reply.id, text: reply.text, tag: reply.tag }))
      : undefined;

    const message: MessengerMessageState = {
      id: this.messageId(event.id, 'root', nowMs),
      conversationId,
      senderId: event.actor,
      senderName,
      timestamp: nowMs,
      content: lastStep.text,
      messageType: event.priority === 'CRITICAL' ? 'INCIDENT' : event.actor === 'SYSTEM' ? 'SYSTEM' : 'TEXT',
      read: false,
      replyOptions: options,
      replyEventId: options ? event.id : undefined,
      replyStepId: options ? 'final' : undefined,
      idempotencyKey,
    };
    player.messages = [...(player.messages ?? []), message];
    this.archiveIfNeeded();
    player.conversations = (player.conversations ?? []).map((c) =>
      c.id === conversationId
        ? { ...c, unreadCount: c.unreadCount + 1, lastMessageAt: nowMs }
        : c,
    );
    const director = player.storyDirector!;
    player.storyDirector = { ...director, lastMessageAt: nowMs, recentActors: { ...director.recentActors, [event.actor]: nowMs } };
    if (idempotencyKey) this.recordFiredKey(idempotencyKey);
    // 多步消息的后续步骤
    if (event.steps.length > 1) {
      let offset = 0;
      for (let i = 1; i < event.steps.length; i += 1) {
        offset += (event.steps[i].delayMinutes ?? 1) * 60_000;
        const step = event.steps[i];
        const stepKey = step.id ?? `step${i + 1}`;
        const chain = { chainId: event.id, stepId: stepKey, gameDayId: player.gameDay?.dayIndex ?? 1, nextStepAt: nowMs + offset };
        player.storyDirector = { ...player.storyDirector!, activeChains: [...(player.storyDirector?.activeChains ?? []), chain] };
      }
    }
    this.context.events.emit('messengerChanged', { conversationId, critical: event.priority === 'CRITICAL' });
    if (event.priority === 'CRITICAL') {
      this.context.events.emit('criticalMessage', { eventId: event.id });
    }
    return true;
  }

  /** 续发多步消息（game loop 每秒检查 activeChains）。 */
  public tickScheduledSteps(nowMs: number): void {
    const player = this.context.player;
    const director = player.storyDirector;
    if (!director || director.activeChains.length === 0) return;
    const due = director.activeChains.filter((c) => c.nextStepAt <= nowMs);
    if (due.length === 0) return;
    player.storyDirector = { ...director, activeChains: director.activeChains.filter((c) => !due.includes(c)) };
    for (const chain of due) {
      const event = messengerEventById(chain.chainId);
      if (!event || !event.steps) continue;
      const step = event.steps.find((s) => (s.id ?? `step${event.steps.indexOf(s) + 1}`) === chain.stepId);
      if (!step) continue;
      const actor = messengerActorById(event.actor);
      const message: MessengerMessageState = {
        id: this.messageId(event.id, chain.stepId, nowMs),
        conversationId: event.conversation,
        senderId: event.actor,
        senderName: step.sender ?? actor?.name ?? event.actor,
        timestamp: nowMs,
        content: step.text,
        messageType: 'TEXT',
        read: false,
      };
      player.messages = [...(player.messages ?? []), message];
      this.archiveIfNeeded();
      player.conversations = (player.conversations ?? []).map((c) =>
        c.id === event.conversation ? { ...c, unreadCount: c.unreadCount + 1, lastMessageAt: nowMs } : c,
      );
    }
    this.context.events.emit('messengerChanged', {});
  }

  // ── 回复（玩家选择 → 效果落地 → 链式推进） ──

  public reply(messageId: string, replyId: string): { ok: boolean; reason?: string; effects?: MessengerEffectDef } {
    const player = this.context.player;
    const message = (player.messages ?? []).find((m) => m.id === messageId);
    if (!message) return { ok: false, reason: '消息不存在' };
    if (message.read) return { ok: false, reason: '消息已处理' };
    const event = message.replyEventId ? messengerEventById(message.replyEventId) : undefined;
    if (!event) return { ok: false, reason: '消息已过期' };
    const reply = (event.replies ?? []).find((r) => r.id === replyId);
    if (!reply) return { ok: false, reason: '回复选项不存在' };
    if (!this.replyAvailable(reply)) return { ok: false, reason: '该回复尚未解锁' };

    player.messages = (player.messages ?? []).map((m) =>
      m.id === messageId ? { ...m, read: true, seen: true, content: `${m.content}\n【我】${reply.text}` } : m,
    );
    player.conversations = (player.conversations ?? []).map((c) =>
      c.id === message.conversationId ? { ...c, unreadCount: 0 } : c,
    );
    // 成就计数
    if (reply.effects?.achievementKey) {
      const key = `msg_ach:${reply.effects.achievementKey}`;
      const player2 = player as unknown as { lifetimeStats?: Record<string, number> };
      player2.lifetimeStats = { ...(player2.lifetimeStats ?? {}), [key]: (player2.lifetimeStats?.[key] ?? 0) + 1 };
    }
    this.context.events.emit('messengerReplied', { eventId: event.id, replyId, effects: reply.effects ?? {} });
    return { ok: true, effects: reply.effects ?? {} };
  }

  /** 消息超时未回：按「已读不回」落地并触发 onIgnoreEventId。 */
  public expireStaleReplies(nowMs: number): MessengerEffectDef[] {
    const player = this.context.player;
    const stale = (player.messages ?? []).filter(
      (m) => m.replyOptions && !m.read && !m.recalled && m.timestamp + REPLY_EXPIRE_MS < nowMs,
    );
    const effectsList: MessengerEffectDef[] = [];
    for (const m of stale) {
      player.messages = (player.messages ?? []).map((x) => (x.id === m.id ? { ...x, read: true, seen: true } : x));
      const event = m.replyEventId ? messengerEventById(m.replyEventId) : undefined;
      const ignoreReply = (event?.replies ?? []).find((r) => r.id === 'ignore');
      if (ignoreReply?.effects) effectsList.push(ignoreReply.effects);
      if (event?.onIgnoreEventId) {
        const followup = messengerEventById(event.onIgnoreEventId);
        if (followup) this.deliverEvent(followup, nowMs, `${event.onIgnoreEventId}:${player.gameDay?.dayIndex ?? 1}`);
      }
      // 已读不回成就
      const key = 'msg_ach:read_no_reply';
      const p2 = player as unknown as { lifetimeStats?: Record<string, number> };
      p2.lifetimeStats = { ...(p2.lifetimeStats ?? {}), [key]: (p2.lifetimeStats?.[key] ?? 0) + 1 };
    }
    if (stale.length > 0) this.context.events.emit('messengerChanged', {});
    return effectsList;
  }

  // ── typing 状态机（§67） ──

  public setTyping(conversationId: string, durationMs: number): void {
    this.typingUntil = this.context.clockV2.now() + durationMs;
    this.typingConversation = conversationId;
  }

  public typing(): { conversationId: string | null; remaining: number } {
    const now = this.context.clockV2.now();
    if (this.typingConversation && this.typingUntil > now) {
      return { conversationId: this.typingConversation, remaining: this.typingUntil - now };
    }
    return { conversationId: null, remaining: 0 };
  }

  public setDailyPlan(entries: readonly string[]): void {
    this.context.player.dailyPlan = [...entries];
  }

  public appendReality(entry: DailyRealityEntryState): void {
    this.context.player.dailyReality = [...(this.context.player.dailyReality ?? []), entry];
  }

  // ── 内部 ──

  private typingUntil = 0;
  private typingConversation: string | null = null;

  private replyAvailable(reply: { tag?: string; minCareerLevel?: number; requiresEvidence?: string }): boolean {
    const player = this.context.player;
    if (reply.minCareerLevel && player.careerLevel < reply.minCareerLevel) return false;
    if (reply.requiresEvidence && !this.context.evidence.has(reply.requiresEvidence as never)) return false;
    if (reply.tag && !this.tagUnlocked(reply.tag)) return false;
    return true;
  }

  /** 对话风格解锁：旗标或职级门槛（§46）。 */
  private tagUnlocked(tag: string): boolean {
    if (this.context.player.dialogFlags?.[tag]) return true;
    const thresholds: Record<string, number> = { ASSERTIVE: 3, PROFESSIONAL: 2, EVIDENCE_MASTER: 3, MANAGER: 6, TECH_EXPERT: 4, OLD_TIMER: 5 };
    const need = thresholds[tag];
    return need === undefined ? true : this.context.player.careerLevel >= need;
  }

  private hasFiredKey(key: string): boolean {
    return (this.context.player.storyDirector?.firedKeys ?? []).includes(key);
  }

  private recordFiredKey(key: string): void {
    const director = this.context.player.storyDirector!;
    const firedKeys = [...director.firedKeys, key].slice(-FIRED_KEYS_LIMIT);
    this.context.player.storyDirector = { ...director, firedKeys };
  }

  /** 容量控制：每会话保留最近 MESSAGES_PER_CONVERSATION 条；已获证据的消息保留摘要（§50/§74）。 */
  private archiveIfNeeded(): void {
    const player = this.context.player;
    const byConversation = new Map<string, MessengerMessageState[]>();
    for (const m of player.messages ?? []) {
      const list = byConversation.get(m.conversationId) ?? [];
      list.push(m);
      byConversation.set(m.conversationId, list);
    }
    let changed = false;
    const kept: MessengerMessageState[] = [];
    byConversation.forEach((list) => {
      const sorted = [...list].sort((a, b) => a.timestamp - b.timestamp);
      const existingSummaries = sorted.filter((m) => m.archived);
      const live = sorted.filter((m) => !m.archived);
      const overflow = live.slice(0, Math.max(0, live.length - MESSAGES_PER_CONVERSATION));
      if (overflow.length > 0 || existingSummaries.length > ARCHIVED_SUMMARIES_PER_CONVERSATION) changed = true;
      const newSummaries = overflow
        .filter((m) => m.evidenceType || m.replyEventId)
        .map((m) => ({
          ...m,
          content: m.recalled ? '撤回了一条消息' : `${m.content.slice(0, 40)}……（已归档）`,
          archived: true,
          replyOptions: undefined,
          replyEventId: undefined,
          replyStepId: undefined,
        }));
      kept.push(
        ...[...existingSummaries, ...newSummaries].slice(-ARCHIVED_SUMMARIES_PER_CONVERSATION),
        ...live.slice(-MESSAGES_PER_CONVERSATION),
      );
    });
    if (changed) player.messages = kept.sort((a, b) => a.timestamp - b.timestamp);
  }

  /** 同一游戏状态必得相同 ID；相同时间的多条同源消息用稳定序号去重。 */
  private messageId(eventId: string, stepId: string, nowMs: number): string {
    const prefix = `msg_${eventId}_${stepId}_${nowMs}`;
    let sequence = 0;
    const ids = new Set((this.context.player.messages ?? []).map((message) => message.id));
    while (ids.has(`${prefix}_${sequence}`)) sequence += 1;
    return `${prefix}_${sequence}`;
  }
}
