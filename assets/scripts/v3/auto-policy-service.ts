import type { GameContext } from '../core/game-context';
import type {
  AssignedTaskPriority,
  AssignedTaskState,
  AutoPolicy,
  IncidentSeverity,
  IncidentState,
  OfflineDecisionSession,
  PendingEventState,
} from '../model/save-data';
import type { IdleOfflineProjection } from '../services/idle-service';

export interface OfflineSimulationResult {
  readonly elapsedSeconds: number;
  readonly effectiveSeconds: number;
  readonly capped: boolean;
  readonly salary: number;
  readonly cultivation: number;
  readonly spiritStones: number;
  /** Compatibility alias for existing idle reward consumers. */
  readonly cultivationExp: number;
  readonly duplicate: boolean;
  readonly performance: number;
  readonly mindDelta: number;
  readonly workSeconds: number;
  readonly fishingSeconds: number;
  readonly cultivatingSeconds: number;
  readonly overtimeSeconds: number;
  readonly freeOvertimeSeconds: number;
  readonly paidOvertimeSeconds: number;
  readonly eventsAutoResolved: number;
  readonly pendingDecisionCount: number;
  readonly incidentsRaised: number;
  readonly tasksCompleted: number;
  readonly technicalDebtDelta: number;
  readonly evidenceGained: number;
  readonly lootGained: number;
  readonly careerProgress: number;
  readonly policyUsed: AutoPolicy;
}

export type WelcomeItemKind = 'ASSIGNED_TASK' | 'INCIDENT';
export type WelcomeAction = 'COMPLETE' | 'ACKNOWLEDGE';

export interface WelcomeBreakdownItem {
  readonly id: string;
  readonly entityId: string;
  readonly kind: WelcomeItemKind;
  readonly title: string;
  readonly priority: AssignedTaskPriority | IncidentSeverity;
  readonly action: WelcomeAction;
  readonly routedByPolicy: boolean;
}

export interface WelcomeBackResult {
  readonly policy: AutoPolicy;
  readonly settlementId: string;
  readonly items: readonly WelcomeBreakdownItem[];
  readonly autoCompletedTaskIds: readonly string[];
}

export type WelcomeActionResult = { readonly success: true } | { readonly success: false; readonly reason: 'STALE' | 'INVALID_ACTION' };

export interface OfflineDecisionItem {
  readonly id: string;
  readonly eventId: string;
  readonly occurredAt: number;
  readonly priority: PendingEventState['priority'];
}

export interface OfflineDecisionOverflowSummary {
  readonly total: number;
  readonly byPriority: Readonly<Partial<Record<PendingEventState['priority'], number>>>;
  readonly s1?: {
    readonly total: number;
    readonly pendingEventIds: readonly string[];
    readonly nextPendingEventId: string;
  };
}

export interface OfflineDecisionPresentation {
  readonly session: OfflineDecisionSession | null;
  readonly current: OfflineDecisionItem | null;
  readonly items: readonly OfflineDecisionItem[];
  readonly overflowSummary: OfflineDecisionOverflowSummary | null;
}

export type OfflineDecisionActionResult =
  | { readonly success: true; readonly duplicate: boolean }
  | { readonly success: false; readonly reason: 'STALE' };

const TASK_ORDER: Record<AssignedTaskPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const INCIDENT_ORDER: Record<IncidentSeverity, number> = { S1: 0, S2: 1, S3: 2, S4: 3 };
const MAX_WELCOME_ITEMS = 3;
const MAX_HANDLED_IDS = 100;
const MAX_OFFLINE_DECISION_ITEMS = 12;
const OFFLINE_DECISION_HANDLED_FLAG_PREFIX = 'offlineDecisionHandled:';
const PENDING_PRIORITY_ORDER: Record<PendingEventState['priority'], number> = {
  CRITICAL: 0,
  IMPORTANT: 1,
  NORMAL: 2,
  FLAVOR: 3,
};

/** Deterministic return-to-game automation and the welcome incident queue. */
export class AutoPolicyService {
  private readonly settlementId: string;
  private prepared = false;
  private autoCompletedTaskIds: string[] = [];

  public constructor(private readonly context: GameContext) {
    this.settlementId = `offline-${Math.max(0, context.player.lastSaveTime).toString(36)}`;
  }

  public getPolicy(): AutoPolicy {
    return this.context.player.autoPolicy;
  }

  public setPolicy(policy: AutoPolicy): boolean {
    if (policy !== 'NORMAL' && policy !== 'SAFE' && policy !== 'GRINDER' && policy !== 'SLACKER') throw new Error('Invalid auto policy');
    if (this.context.player.autoPolicy === policy) return false;
    this.context.player.autoPolicy = policy;
    this.prepared = false;
    this.autoCompletedTaskIds = [];
    this.context.saveService.save(this.context.player);
    return true;
  }

  /**
   * Pure deterministic offline simulation. It deliberately projects non-resource effects only:
   * settlement owns the sole durable salary/cultivation/spirit-stone transaction.
   */
  public projectOffline(input: IdleOfflineProjection): OfflineSimulationResult {
    const policy = this.getPolicy();
    if (input.duplicate) {
      return {
        elapsedSeconds: 0,
        effectiveSeconds: 0,
        capped: false,
        salary: 0,
        cultivation: 0,
        spiritStones: 0,
        cultivationExp: 0,
        duplicate: true,
        performance: 0,
        mindDelta: 0,
        workSeconds: 0,
        fishingSeconds: 0,
        cultivatingSeconds: 0,
        overtimeSeconds: 0,
        freeOvertimeSeconds: 0,
        paidOvertimeSeconds: 0,
        eventsAutoResolved: 0,
        pendingDecisionCount: 0,
        incidentsRaised: 0,
        tasksCompleted: 0,
        technicalDebtDelta: 0,
        evidenceGained: 0,
        lootGained: 0,
        careerProgress: 0,
        policyUsed: policy,
      };
    }
    const categories = input.time.secondsByCategory;
    const standardWork = categories.WORK;
    const lunch = categories.LUNCH;
    const afterHours = categories.AFTER_HOURS;
    const recovery = categories.RECOVERY + categories.WEEKEND;
    const overtimeIsFree = this.context.player.activeOvertimeSession?.free
      ?? this.context.player.gameDay?.overtimeFree
      ?? false;
    const exhausted = this.context.player.overtimeFatigue === 'EXHAUSTED';

    let workSeconds = 0;
    let fishingSeconds = 0;
    let cultivatingSeconds = 0;
    let overtimeSeconds = 0;

    switch (policy) {
      case 'NORMAL':
        workSeconds = standardWork;
        fishingSeconds = lunch;
        if (!overtimeIsFree && !exhausted) overtimeSeconds = afterHours;
        workSeconds += overtimeSeconds;
        cultivatingSeconds = recovery + afterHours - overtimeSeconds;
        break;
      case 'SAFE':
        workSeconds = standardWork;
        if (!overtimeIsFree && !exhausted) overtimeSeconds = afterHours;
        workSeconds += overtimeSeconds;
        cultivatingSeconds = recovery + lunch + afterHours - overtimeSeconds;
        break;
      case 'GRINDER':
        if (!exhausted) {
          overtimeSeconds = overtimeIsFree ? Math.min(afterHours, 2 * 3600) : afterHours;
        }
        workSeconds = standardWork + lunch + overtimeSeconds;
        cultivatingSeconds = recovery + afterHours - overtimeSeconds;
        break;
      case 'SLACKER':
        fishingSeconds = standardWork + lunch + afterHours;
        cultivatingSeconds = recovery;
        break;
    }

    const freeOvertimeSeconds = overtimeIsFree ? overtimeSeconds : 0;
    const paidOvertimeSeconds = overtimeIsFree ? 0 : overtimeSeconds;
    const performance = Math.max(0, Math.floor((workSeconds - freeOvertimeSeconds / 2) / 3600));
    const rawMindDelta = Math.trunc((-2 * workSeconds - 2 * overtimeSeconds + 3 * fishingSeconds + 2 * cultivatingSeconds) / 3600);
    const mindAfter = Math.max(0, Math.min(this.context.player.maxMind, this.context.player.mind + rawMindDelta));
    const mindDelta = mindAfter - this.context.player.mind;
    const pending = this.context.player.pendingEvents;
    const autoResolvable = pending.filter((event) => event.priority === 'FLAVOR' || event.priority === 'NORMAL').length;
    const eventsAutoResolved = policy === 'GRINDER' || policy === 'SAFE'
      ? autoResolvable
      : pending.filter((event) => event.priority === 'FLAVOR').length;
    const tasksCompleted = this.projectedTaskCount(policy);
    const technicalDebtDelta = policy === 'SAFE'
      ? -Math.ceil(input.effectiveSeconds / (2 * 3600))
      : policy === 'GRINDER'
        ? Math.ceil(workSeconds / (2 * 3600)) + Math.floor(freeOvertimeSeconds / 3600)
        : 0;
    const evidenceGained = policy === 'SAFE' ? Math.ceil(input.effectiveSeconds / (2 * 3600)) : 0;
    const lootGained = Math.floor(cultivatingSeconds / 3600);
    const incidentsRaised = Math.floor((freeOvertimeSeconds + Math.max(0, technicalDebtDelta) * 1800) / (4 * 3600));

    return {
      elapsedSeconds: input.elapsedSeconds,
      effectiveSeconds: input.effectiveSeconds,
      capped: input.capped,
      salary: input.salary,
      cultivation: input.cultivation,
      spiritStones: input.spiritStones,
      cultivationExp: input.cultivation,
      duplicate: input.duplicate,
      performance,
      mindDelta,
      workSeconds,
      fishingSeconds,
      cultivatingSeconds,
      overtimeSeconds,
      freeOvertimeSeconds,
      paidOvertimeSeconds,
      eventsAutoResolved,
      pendingDecisionCount: Math.max(0, pending.length - eventsAutoResolved),
      incidentsRaised,
      tasksCompleted,
      technicalDebtDelta,
      evidenceGained,
      lootGained,
      careerProgress: performance + Math.floor(input.cultivation / 10),
      policyUsed: policy,
    };
  }

  public prepareWelcome(): WelcomeBackResult {
    if (!this.prepared) {
      this.prepared = true;
      if (this.getPolicy() === 'GRINDER') {
        const eligible = this.context.assignedTasks.open()
          .filter(isLowRiskTask)
          .sort(compareTasks)
          .slice(0, MAX_WELCOME_ITEMS);
        for (const task of eligible) {
          this.context.assignedTasks.complete(task.id);
          this.autoCompletedTaskIds.push(task.id);
        }
        if (eligible.length > 0) this.context.saveService.save(this.context.player);
      }
    }
    return {
      policy: this.getPolicy(),
      settlementId: this.settlementId,
      items: this.buildItems(),
      autoCompletedTaskIds: [...this.autoCompletedTaskIds],
    };
  }

  /**
   * Creates or resumes a stable ID-only view over canonical pendingEvents.
   * High-risk V4 work is represented in pendingEvents before the snapshot is made;
   * the session never owns event payloads and presentation limits never truncate storage.
   */
  public prepareOfflineDecisionSession(): OfflineDecisionPresentation {
    const previousSession = this.context.player.offlineDecisionSession;
    const sameSettlement = previousSession?.settlementId === this.settlementId;
    let changed = this.routeHighRiskItems(sameSettlement ? previousSession.pendingEventIds : []);
    changed = this.ensureS1MinimumMitigation() || changed;

    let active = this.context.player.offlineDecisionSession;
    if (active?.status === 'PENDING') {
      const resolvedPrefix = active.pendingEventIds.slice(0, active.cursor);
      const resolvedIds = new Set([...resolvedPrefix, ...active.resolvedEventIds]);
      const pendingEventIds = uniquePendingEvents(this.context.player.pendingEvents)
        .filter((event) => !resolvedIds.has(event.uid) && !this.isOfflineDecisionHandled(event.uid))
        .sort(comparePendingEvents)
        .map((event) => event.uid);
      const refreshedIds = [...resolvedPrefix, ...pendingEventIds];
      if (!sameIds(active.pendingEventIds, refreshedIds)) {
        active = {
          ...active,
          pendingEventIds: refreshedIds,
          status: active.cursor >= refreshedIds.length ? 'COMPLETED' : 'PENDING',
        };
        this.context.player.offlineDecisionSession = active;
        changed = true;
      }
    }

    if (!active || (active.status === 'COMPLETED' && active.settlementId !== this.settlementId)) {
      const ids = uniquePendingEvents(this.context.player.pendingEvents)
        .filter((event) => !this.isOfflineDecisionHandled(event.uid))
        .sort(comparePendingEvents)
        .map((event) => event.uid);
      if (ids.length > 0) {
        this.context.player.offlineDecisionSession = {
          settlementId: this.settlementId,
          pendingEventIds: ids,
          cursor: 0,
          resolvedEventIds: [],
          status: 'PENDING',
        };
        changed = true;
      } else if (active) {
        this.context.player.offlineDecisionSession = null;
        changed = true;
      }
    }

    if (changed) this.context.saveService.save(this.context.player);
    return this.buildOfflineDecisionPresentation();
  }

  /** Resolves exactly the decision at the durable cursor and persists its advancement. */
  public performOfflineDecision(pendingEventId: string): OfflineDecisionActionResult {
    const session = this.context.player.offlineDecisionSession;
    if (!session) return { success: false, reason: 'STALE' };
    if (session.resolvedEventIds.includes(pendingEventId)) return { success: true, duplicate: true };
    if (session.status !== 'PENDING' || session.pendingEventIds[session.cursor] !== pendingEventId) {
      return { success: false, reason: 'STALE' };
    }

    const eventIndex = this.context.player.pendingEvents.findIndex((event) => event.uid === pendingEventId);
    if (eventIndex < 0) return { success: false, reason: 'STALE' };

    this.context.player.pendingEvents = this.context.player.pendingEvents.filter((_, index) => index !== eventIndex);
    const cursor = session.cursor + 1;
    this.context.player.offlineDecisionSession = {
      settlementId: session.settlementId,
      pendingEventIds: [...session.pendingEventIds],
      cursor,
      resolvedEventIds: [...session.resolvedEventIds, pendingEventId],
      status: cursor >= session.pendingEventIds.length ? 'COMPLETED' : 'PENDING',
    };
    this.markHandled(pendingEventId);
    this.markOfflineDecisionHandled(pendingEventId);
    this.context.saveService.save(this.context.player);
    return { success: true, duplicate: false };
  }

  public performWelcomeAction(itemId: string, action: WelcomeAction): WelcomeActionResult {
    const item = this.buildItems().find((candidate) => candidate.id === itemId);
    if (!item) return { success: false, reason: 'STALE' };
    if (item.action !== action) return { success: false, reason: 'INVALID_ACTION' };

    if (item.kind === 'ASSIGNED_TASK') {
      const task = this.context.player.assignedTasks.find((candidate) => candidate.id === item.entityId);
      if (!task || task.status !== 'OPEN') return { success: false, reason: 'STALE' };
      this.context.assignedTasks.complete(task.id);
    } else {
      const incident = this.context.player.incidents.find((candidate) => candidate.id === item.entityId);
      if (!incident || !isActiveIncident(incident)) return { success: false, reason: 'STALE' };
    }

    this.markHandled(item.id);
    this.context.saveService.save(this.context.player);
    return { success: true };
  }

  private buildItems(): WelcomeBreakdownItem[] {
    const handled = new Set(this.context.player.handledWelcomeItemIds);
    const canonicalDecisionIds = new Set([
      ...this.context.player.pendingEvents.map((event) => event.uid),
      ...(this.context.player.offlineDecisionSession?.pendingEventIds ?? []),
    ]);
    const seen = new Set<string>();
    const items: WelcomeBreakdownItem[] = [];
    const incidents = this.context.player.incidents.filter(isActiveIncident).sort(compareIncidents);
    const tasks = this.context.assignedTasks.open().sort(compareTasks);

    for (const incident of incidents) {
      if (this.isOfflineDecisionHandled(`offline:incident:${incident.id}`)) continue;
      if (canonicalDecisionIds.has(`offline:incident:${incident.id}`)) continue;
      const id = `incident:${incident.id}`;
      if (handled.has(id) || seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        entityId: incident.id,
        kind: 'INCIDENT',
        title: `生产事故：${incident.type}`,
        priority: incident.severity,
        action: 'ACKNOWLEDGE',
        routedByPolicy: false,
      });
    }
    for (const task of tasks) {
      if (this.isOfflineDecisionHandled(`offline:task:${task.id}`)) continue;
      if (canonicalDecisionIds.has(`offline:task:${task.id}`)) continue;
      const id = `task:${task.id}`;
      if (handled.has(id) || seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        entityId: task.id,
        kind: 'ASSIGNED_TASK',
        title: task.title,
        priority: task.priority,
        action: 'COMPLETE',
        routedByPolicy: this.getPolicy() === 'NORMAL' && isLowRiskTask(task),
      });
    }
    return items.slice(0, MAX_WELCOME_ITEMS);
  }

  private buildOfflineDecisionPresentation(): OfflineDecisionPresentation {
    const session = this.context.player.offlineDecisionSession;
    if (!session) return { session: null, current: null, items: [], overflowSummary: null };

    const eventById = new Map(this.context.player.pendingEvents.map((event) => [event.uid, event]));
    const remainingIds = session.pendingEventIds.slice(session.cursor);
    const itemEvents = remainingIds
      .slice(0, MAX_OFFLINE_DECISION_ITEMS)
      .map((id) => eventById.get(id))
      .filter((event): event is PendingEventState => event !== undefined);
    const items = itemEvents.map(toOfflineDecisionItem);
    const overflowEvents = remainingIds
      .slice(MAX_OFFLINE_DECISION_ITEMS)
      .map((id) => eventById.get(id))
      .filter((event): event is PendingEventState => event !== undefined);
    const s1OverflowEvents = overflowEvents.filter(isS1PendingEvent);
    const lowerPriorityOverflowEvents = overflowEvents.filter((event) => !isS1PendingEvent(event));
    const byPriority: Partial<Record<PendingEventState['priority'], number>> = {};
    for (const event of lowerPriorityOverflowEvents) byPriority[event.priority] = (byPriority[event.priority] ?? 0) + 1;
    const s1 = s1OverflowEvents.length > 0 ? {
      total: s1OverflowEvents.length,
      pendingEventIds: s1OverflowEvents.map((event) => event.uid),
      nextPendingEventId: s1OverflowEvents[0].uid,
    } : undefined;

    return {
      session: cloneDecisionSession(session),
      current: items[0] ?? null,
      items,
      overflowSummary: overflowEvents.length > 0 ? { total: overflowEvents.length, byPriority, ...(s1 ? { s1 } : {}) } : null,
    };
  }

  private routeHighRiskItems(alreadyProjectedIds: readonly string[]): boolean {
    const existing = new Set([
      ...this.context.player.pendingEvents.map((event) => event.uid),
      ...alreadyProjectedIds,
      ...this.context.player.handledWelcomeItemIds,
    ]);
    const routed: PendingEventState[] = [];
    for (const incident of this.context.player.incidents) {
      if (!isActiveIncident(incident) || (incident.severity !== 'S1' && incident.severity !== 'S2')) continue;
      const uid = `offline:incident:${incident.id}`;
      if (!existing.has(uid) && !this.isOfflineDecisionHandled(uid)) {
        existing.add(uid);
        routed.push({
          uid,
          eventId: `incident:${incident.id}`,
          occurredAt: incident.createdAt,
          priority: incident.severity === 'S1' ? 'CRITICAL' : 'IMPORTANT',
        });
      }
    }
    for (const task of this.context.player.assignedTasks) {
      if (task.status !== 'OPEN' || (task.priority !== 'P0' && task.priority !== 'P1')) continue;
      const uid = `offline:task:${task.id}`;
      if (!existing.has(uid) && !this.isOfflineDecisionHandled(uid)) {
        existing.add(uid);
        routed.push({
          uid,
          eventId: `task:${task.id}`,
          occurredAt: task.createdAt,
          priority: task.priority === 'P0' ? 'CRITICAL' : 'IMPORTANT',
        });
      }
    }
    if (routed.length === 0) return false;
    this.context.player.pendingEvents = [...this.context.player.pendingEvents, ...routed.sort(comparePendingEvents)];
    return true;
  }

  private ensureS1MinimumMitigation(): boolean {
    const routedS1Ids = new Set(
      this.context.player.pendingEvents
        .filter((event) => event.priority === 'CRITICAL' && event.eventId.startsWith('incident:'))
        .map((event) => event.eventId.slice('incident:'.length)),
    );
    let changed = false;
    this.context.player.incidents = this.context.player.incidents.map((incident) => {
      if (!routedS1Ids.has(incident.id) || incident.severity !== 'S1' || !isActiveIncident(incident)) return incident;
      if (incident.status === 'MITIGATING' && incident.mitigationSeconds >= 1) return incident;
      changed = true;
      return { ...incident, status: 'MITIGATING', mitigationSeconds: Math.max(1, incident.mitigationSeconds) };
    });
    return changed;
  }

  private markHandled(id: string): void {
    const ids = this.context.player.handledWelcomeItemIds.filter((item) => item !== id);
    ids.push(id);
    this.context.player.handledWelcomeItemIds = ids.slice(-MAX_HANDLED_IDS);
  }

  private isOfflineDecisionHandled(id: string): boolean {
    return this.context.player.eventFlags[`${OFFLINE_DECISION_HANDLED_FLAG_PREFIX}${id}`] === true;
  }

  private markOfflineDecisionHandled(id: string): void {
    this.context.player.eventFlags = {
      ...this.context.player.eventFlags,
      [`${OFFLINE_DECISION_HANDLED_FLAG_PREFIX}${id}`]: true,
    };
  }

  private projectedTaskCount(policy: AutoPolicy): number {
    if (policy === 'SLACKER' || policy === 'SAFE') return 0;
    const eligible = this.context.assignedTasks.open().filter(isLowRiskTask).length;
    return Math.min(policy === 'GRINDER' ? MAX_WELCOME_ITEMS : 1, eligible);
  }
}

function isLowRiskTask(task: AssignedTaskState): boolean {
  return (task.priority === 'P2' || task.priority === 'P3') && task.source !== 'INCIDENT' && !task.isFakeP0;
}

function isActiveIncident(incident: IncidentState): boolean {
  return incident.status === 'DETECTED' || incident.status === 'MITIGATING';
}

function compareTasks(a: AssignedTaskState, b: AssignedTaskState): number {
  return TASK_ORDER[a.priority] - TASK_ORDER[b.priority] || b.createdAt - a.createdAt || a.id.localeCompare(b.id);
}

function compareIncidents(a: IncidentState, b: IncidentState): number {
  return INCIDENT_ORDER[a.severity] - INCIDENT_ORDER[b.severity] || b.createdAt - a.createdAt || a.id.localeCompare(b.id);
}

function comparePendingEvents(a: PendingEventState, b: PendingEventState): number {
  return Number(isS1PendingEvent(b)) - Number(isS1PendingEvent(a))
    || PENDING_PRIORITY_ORDER[a.priority] - PENDING_PRIORITY_ORDER[b.priority]
    || a.occurredAt - b.occurredAt
    || compareStableId(a.uid, b.uid);
}

function isS1PendingEvent(event: PendingEventState): boolean {
  return event.priority === 'CRITICAL' && event.eventId.startsWith('incident:');
}

function compareStableId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function uniquePendingEvents(events: readonly PendingEventState[]): PendingEventState[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.uid)) return false;
    seen.add(event.uid);
    return true;
  });
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function toOfflineDecisionItem(event: PendingEventState): OfflineDecisionItem {
  return { id: event.uid, eventId: event.eventId, occurredAt: event.occurredAt, priority: event.priority };
}

function cloneDecisionSession(session: OfflineDecisionSession): OfflineDecisionSession {
  return {
    settlementId: session.settlementId,
    pendingEventIds: [...session.pendingEventIds],
    cursor: session.cursor,
    resolvedEventIds: [...session.resolvedEventIds],
    status: session.status,
  };
}
