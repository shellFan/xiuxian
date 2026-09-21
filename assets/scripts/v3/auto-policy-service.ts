import type { GameContext } from '../core/game-context';
import type { AssignedTaskPriority, AssignedTaskState, AutoPolicy, IncidentSeverity, IncidentState } from '../model/save-data';

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

const TASK_ORDER: Record<AssignedTaskPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const INCIDENT_ORDER: Record<IncidentSeverity, number> = { S1: 0, S2: 1, S3: 2, S4: 3 };
const MAX_WELCOME_ITEMS = 3;
const MAX_HANDLED_IDS = 100;

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
    const seen = new Set<string>();
    const items: WelcomeBreakdownItem[] = [];
    const incidents = this.context.player.incidents.filter(isActiveIncident).sort(compareIncidents);
    const tasks = this.context.assignedTasks.open().sort(compareTasks);

    for (const incident of incidents) {
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

  private markHandled(id: string): void {
    const ids = this.context.player.handledWelcomeItemIds.filter((item) => item !== id);
    ids.push(id);
    this.context.player.handledWelcomeItemIds = ids.slice(-MAX_HANDLED_IDS);
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
