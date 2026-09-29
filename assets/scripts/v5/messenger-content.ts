import messengerActorsConfig from '../../configs/v5/messenger-actors.json';
import messengerEventsCoreConfig from '../../configs/v5/messenger-events-core.json';
import messengerEventsTeamConfig from '../../configs/v5/messenger-events-team.json';
import messengerEventsPeopleConfig from '../../configs/v5/messenger-events-people.json';
import messengerEventsWindowsConfig from '../../configs/v5/messenger-events-windows.json';

/**
 * V5 飞剑传书 — 内容模型与装载校验。
 * 内容全部配置驱动（§89），本模块负责类型、合并与启动期校验（重复 ID / 未知会话 / 断链）。
 */

export type MessengerActorId =
  | 'BOSS' | 'PRODUCT' | 'TESTER' | 'JUNIOR' | 'VETERAN' | 'HR' | 'OPS' | 'CLIENT' | 'SYSTEM';

export interface MessengerActorDef {
  readonly id: MessengerActorId;
  readonly name: string;
  readonly title: string;
  /** 打字速度档位（秒/条，用于“正在输入”时长基准）。 */
  readonly typingSeconds: number;
  /** 头像键（ui-slice 资源或 emoji 兜底）。 */
  readonly avatar: string;
}

export interface MessengerConversationDef {
  readonly id: string;
  readonly type: 'PRIVATE' | 'GROUP' | 'SYSTEM' | 'PROJECT' | 'INCIDENT' | 'BOSS' | 'CLIENT';
  readonly title: string;
  readonly avatar: string;
  readonly participants: readonly MessengerActorId[];
  readonly priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
}

export interface MessengerEffectDef {
  /** NPC 关系变化 [npcId, delta]。 */
  readonly npc?: readonly (readonly [string, number])[];
  /** NPC 记忆旗标。 */
  readonly memory?: readonly (readonly [string, string])[];
  /** 证据获取 [type, label]。 */
  readonly evidence?: readonly (readonly [string, string])[];
  /** 生成指派任务（进入 AssignedTask 体系）。 */
  readonly task?: { readonly title: string; readonly priority: 'P0' | 'P1' | 'P2' | 'P3'; readonly source: string; readonly fakeP0?: boolean };
  /** 道心 / 心魔 / 绩效变化。 */
  readonly mind?: number;
  readonly innerDemon?: number;
  readonly performance?: number;
  /** 技术债 [领域, 数值]。 */
  readonly techDebt?: readonly (readonly [string, number])[];
  /** 生产事故（走 IncidentService，可挂事故副本）。 */
  readonly incident?: { readonly type: string; readonly severity: 'S1' | 'S2' | 'S3' | 'S4'; readonly source: string };
  /** 加班询问/会话。 */
  readonly overtime?: { readonly source: 'VOLUNTARY' | 'REQUESTED' | 'FORCED' | 'EMERGENCY' | 'WEEKEND' | 'COMPENSATED'; readonly free: boolean; readonly seconds: number };
  /** 开启事故副本战斗（existing battle service）。 */
  readonly incidentDungeon?: { readonly incidentType: string; readonly buildHint?: string };
  /** 对话风格旗标。 */
  readonly dialogFlag?: string;
  /** 链式后继事件（延迟分钟）。 */
  readonly nextEvent?: { readonly eventId: string; readonly delayMinutes: number };
  /** 追加“今日实际”条目。 */
  readonly reality?: { readonly text: string; readonly kind: 'WORK' | 'FAVOR' | 'MEETING' | 'INCIDENT' | 'OVERTIME' | 'CHANGE' | 'BLAME' | 'REST' };
  /** 消息成就计数键（+1）。 */
  readonly achievementKey?: string;
}

export interface MessengerReplyDef {
  readonly id: string;
  readonly text: string;
  /** 对话风格门槛（ASSERTIVE/PROFESSIONAL/EVIDENCE_MASTER/…）。 */
  readonly tag?: string;
  readonly minCareerLevel?: number;
  readonly requiresEvidence?: string;
  readonly effects?: MessengerEffectDef;
}

export interface MessengerEventDef {
  readonly id: string;
  readonly conversation: string;
  readonly actor: MessengerActorId;
  readonly priority: 'CRITICAL' | 'HIGH' | 'NORMAL';
  readonly weight: number;
  /** 游戏日内分钟窗（540=09:00）。 */
  readonly minMinute?: number;
  readonly maxMinute?: number;
  /** workday/preOff/afterHours/lateNight/weekend/any。 */
  readonly window?: 'workday' | 'preOff' | 'afterHours' | 'lateNight' | 'weekend' | 'any';
  readonly cooldownDays?: number;
  /** 今日局势加成（company/boss/project/personal 局势 id 包含匹配）。 */
  readonly situationBoost?: string;
  readonly minRelation?: number;
  readonly maxRelation?: number;
  /** 多步消息：后续步骤按延迟分钟续发（ replies 挂在最后一步）。 */
  readonly steps: readonly { readonly id?: string; readonly sender: string; readonly text: string; readonly delayMinutes?: number; readonly recallOf?: string }[];
  readonly replies?: readonly MessengerReplyDef[];
  /** 无回复超时自动转为已读不回的后续事件（可选）。 */
  readonly onIgnoreEventId?: string;
  readonly note?: string;
}

export interface MessengerContentBundle {
  readonly actors: readonly MessengerActorDef[];
  readonly conversations: readonly MessengerConversationDef[];
  readonly events: readonly MessengerEventDef[];
}

interface MessengerContentPart {
  readonly actors?: readonly MessengerActorDef[];
  readonly conversations?: readonly MessengerConversationDef[];
  readonly events?: readonly MessengerEventDef[];
}

function mergePart(target: {
  actors: MessengerActorDef[];
  conversations: MessengerConversationDef[];
  events: MessengerEventDef[];
}, part: MessengerContentPart): void {
  if (part.actors) target.actors.push(...part.actors);
  if (part.conversations) target.conversations.push(...part.conversations);
  if (part.events) target.events.push(...part.events);
}

function loadBundle(): MessengerContentBundle {
  const target = { actors: [] as MessengerActorDef[], conversations: [] as MessengerConversationDef[], events: [] as MessengerEventDef[] };
  mergePart(target, messengerActorsConfig as MessengerContentPart);
  mergePart(target, messengerEventsCoreConfig as MessengerContentPart);
  mergePart(target, messengerEventsTeamConfig as MessengerContentPart);
  mergePart(target, messengerEventsPeopleConfig as MessengerContentPart);
  mergePart(target, messengerEventsWindowsConfig as MessengerContentPart);
  return { actors: target.actors, conversations: target.conversations, events: target.events };
}

export interface MessengerContentIssues {
  readonly duplicateEventIds: readonly string[];
  readonly unknownConversations: readonly string[];
  readonly unknownActors: readonly string[];
  readonly unknownNextEvents: readonly string[];
  readonly emptySteps: readonly string[];
}

/** 启动期/CI 内容校验（§90）：重复 ID、未知会话/角色/断链、空步骤。 */
export function validateMessengerContent(bundle: MessengerContentBundle): MessengerContentIssues {
  const seenEvents = new Set<string>();
  const duplicateEventIds: string[] = [];
  for (const event of bundle.events) {
    if (seenEvents.has(event.id)) duplicateEventIds.push(event.id);
    seenEvents.add(event.id);
  }
  const conversationIds = new Set(bundle.conversations.map((c) => c.id));
  const actorIds = new Set(bundle.actors.map((a) => a.id));
  const unknownConversations = bundle.events.filter((e) => !conversationIds.has(e.conversation)).map((e) => e.id);
  const unknownActors = bundle.events.filter((e) => !actorIds.has(e.actor)).map((e) => e.id);
  const unknownNextEvents: string[] = [];
  for (const event of bundle.events) {
    for (const reply of event.replies ?? []) {
      const next = reply.effects?.nextEvent?.eventId;
      if (next && !seenEvents.has(next)) unknownNextEvents.push(event.id + '->' + next);
    }
  }
  const emptySteps = bundle.events.filter((e) => !e.steps || e.steps.length === 0).map((e) => e.id);
  return { duplicateEventIds, unknownConversations, unknownActors, unknownNextEvents, emptySteps };
}

export const MESSENGER_CONTENT: MessengerContentBundle = loadBundle();

export function messengerEventById(id: string): MessengerEventDef | undefined {
  return MESSENGER_CONTENT.events.find((event) => event.id === id);
}

export function messengerConversationById(id: string): MessengerConversationDef | undefined {
  return MESSENGER_CONTENT.conversations.find((conversation) => conversation.id === id);
}

export function messengerActorById(id: string): MessengerActorDef | undefined {
  return MESSENGER_CONTENT.actors.find((actor) => actor.id === id);
}

export function messengerContentCounts(): { actors: number; conversations: number; events: number; replies: number; chained: number } {
  let replies = 0;
  let chained = 0;
  for (const event of MESSENGER_CONTENT.events) {
    replies += (event.replies ?? []).length;
    if ((event.replies ?? []).some((reply) => reply.effects?.nextEvent)) chained += 1;
  }
  return { actors: MESSENGER_CONTENT.actors.length, conversations: MESSENGER_CONTENT.conversations.length, events: MESSENGER_CONTENT.events.length, replies, chained };
}
