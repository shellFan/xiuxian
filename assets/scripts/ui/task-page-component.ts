/**
 * TaskPageComponent — WEB V1 task management page.
 *
 * Displays available task configs and active tasks with progress.
 * Players can start tasks (up to maxConcurrent), monitor progress,
 * and claim completed task rewards.
 *
 * Layout (750×1334 design):
 *   ┌─────────────────────────────────────┐
 *   │ 任务 (Tasks)                        │
 *   │ ┌─ Available Tasks ───────────────┐ │
 *   │ │ [每日签到 10s] [修炼日常 15s]   │ │
 *   │ │ [日报周报 20s] [部门会议 15s]   │ │
 *   │ └─────────────────────────────────┘ │
 *   │ ┌─ Active Tasks ─────────────────┐ │
 *   │ │ 每日签到  ████████░░ 80% 10s   │ │
 *   │ │ 修炼日常  ████░░░░░░ 40% 15s   │ │
 *   │ └─────────────────────────────────┘ │
 *   │ 任务栏: 2/3                        │
 *   └─────────────────────────────────────┘
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import { SceneBindingComponent } from './scene-binding-component';
import type { GameFacade } from '../facade/game-facade';
import type { TaskViewModel, TaskItemViewModel, TaskConfigViewModel } from './view-models';
import { buildTaskViewModel } from './view-models';
import type { UiEventCategory } from '../facade/ui-event-types';
import { formatNumber, formatDuration } from './number-formatter';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

// ── Cocos Node Interfaces ────────────────────────────────────────────────────

interface TextLike { string: string; active?: boolean; }
interface ButtonLike {
  on?: (event: string, callback: () => void, target?: unknown) => void;
  off?: (event: string, callback: () => void, target?: unknown) => void;
  interactable?: boolean;
}
interface ProgressLike {
  progress?: number;
  fillRange?: number;
}
interface NodeLike {
  active?: boolean;
  name?: string;
  children?: readonly NodeLike[];
  getChildByName?: (name: string) => NodeLike | null;
  getComponent?: (type: unknown) => unknown;
}

// ── Task type labels ─────────────────────────────────────────────────────────

const TASK_TYPE_LABELS: Record<string, string> = {
  DAILY: '日常',
  WORK: '工作',
  CULTIVATION: '修炼',
  EVENT: '事件',
};

const TASK_TYPE_ICONS: Record<string, string> = {
  DAILY: '📋',
  WORK: '💼',
  CULTIVATION: '🧘',
  EVENT: '⚡',
};

// ── Refresh categories ───────────────────────────────────────────────────────

const TASK_REFRESH_CATEGORIES: readonly UiEventCategory[] = [
  'STATE_CHANGED',
  'RESOURCE_CHANGED',
  'DAILY_CHANGED',
  'BUFF_CHANGED',
];

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('TaskPage')
export class TaskPageComponent extends Component {
  // ── Scene-bound properties (set in Cocos Editor) ──────────────────────────

  /** Title label (e.g., "任务") */
  @property(resolveCocosType('Label'))
  public titleLabel?: TextLike;

  /** Slot count label (e.g., "任务栏: 2/3") */
  @property(resolveCocosType('Label'))
  public slotCountLabel?: TextLike;

  /** Container node for available task config items */
  @property(resolveCocosType('Node'))
  public availableContainer?: NodeLike;

  /** Container node for active task items */
  @property(resolveCocosType('Node'))
  public activeContainer?: NodeLike;

  /** Empty state label when no tasks available */
  @property(resolveCocosType('Label'))
  public emptyLabel?: TextLike;

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private viewModel: TaskViewModel | null = null;
  private unsubs: Array<() => void> = [];
  private disposed = false;
  private updateTimer: number = 0;
  private static readonly UPDATE_INTERVAL = 1.0; // seconds

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('TaskPageComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;

    // Subscribe to facade UI events for re-render
    this.subscribeEvents();

    // Initial render
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    this.facade = null;
  }

  protected update(dt: number): void {
    if (!this.facade || this.disposed) return;

    // Update active task progress every second
    this.updateTimer += dt;
    if (this.updateTimer >= TaskPageComponent.UPDATE_INTERVAL) {
      this.updateTimer -= TaskPageComponent.UPDATE_INTERVAL;
      this.refreshActiveTasks();
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Force refresh from facade state. */
  public refresh(): void {
    if (!this.facade || this.disposed) return;
    this.viewModel = buildTaskViewModel(this.facade);
    this.render(this.viewModel);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private render(vm: TaskViewModel): void {
    // Title
    if (this.titleLabel) {
      this.titleLabel.string = '任务';
    }

    // Slot count
    if (this.slotCountLabel) {
      this.slotCountLabel.string = `任务栏: ${vm.activeCount}/${vm.maxConcurrent}`;
    }

    // Empty state
    if (this.emptyLabel) {
      this.emptyLabel.active = vm.activeTasks.length === 0 && vm.availableConfigs.length === 0;
      if (this.emptyLabel.active) {
        this.emptyLabel.string = '暂无可用任务';
      }
    }

    // Render available configs
    this.renderAvailableConfigs(vm);

    // Render active tasks
    this.renderActiveTasks(vm);
  }

  private renderAvailableConfigs(vm: TaskViewModel): void {
    if (!this.availableContainer) return;

    // Show/hide available section
    const hasAvailable = vm.canStartMore && vm.availableConfigs.length > 0;

    // Render each available config as a text summary
    // In a real Cocos scene, these would be prefab instances with buttons
    // For now, we update child nodes by name convention
    for (let i = 0; i < vm.availableConfigs.length && i < 12; i++) {
      const config = vm.availableConfigs[i];
      const nodeName = `AvailableTask_${i}`;
      const node = this.availableContainer.getChildByName?.(nodeName);
      if (node) {
        node.active = true;
        this.renderConfigNode(node, config, vm.canStartMore);
      }
    }

    // Hide unused slots
    for (let i = vm.availableConfigs.length; i < 12; i++) {
      const nodeName = `AvailableTask_${i}`;
      const node = this.availableContainer.getChildByName?.(nodeName);
      if (node) {
        node.active = false;
      }
    }
  }

  private renderConfigNode(node: NodeLike, config: TaskConfigViewModel, canStart: boolean): void {
    // Update config node labels
    const nameLabel = this.findLabel(node, 'NameLabel');
    if (nameLabel) {
      nameLabel.string = `${TASK_TYPE_ICONS[config.type] || ''} ${config.name}`;
    }

    const descLabel = this.findLabel(node, 'DescLabel');
    if (descLabel) {
      const rewardText = config.rewards
        .map(r => `${r.type === 'salary' ? '💰' : r.type === 'cultivation' ? '⚡' : '💎'}${r.amount}`)
        .join(' ');
      descLabel.string = `${config.description} (${formatDuration(config.durationSeconds)}) ${rewardText}`;
    }

    const startButton = this.findButton(node, 'StartButton');
    if (startButton) {
      startButton.interactable = canStart;
    }
  }

  private renderActiveTasks(vm: TaskViewModel): void {
    if (!this.activeContainer) return;

    // Render each active task
    for (let i = 0; i < vm.activeTasks.length && i < 3; i++) {
      const task = vm.activeTasks[i];
      const nodeName = `ActiveTask_${i}`;
      const node = this.activeContainer.getChildByName?.(nodeName);
      if (node) {
        node.active = true;
        this.renderTaskNode(node, task);
      }
    }

    // Hide unused slots
    for (let i = vm.activeTasks.length; i < 3; i++) {
      const nodeName = `ActiveTask_${i}`;
      const node = this.activeContainer.getChildByName?.(nodeName);
      if (node) {
        node.active = false;
      }
    }
  }

  private renderTaskNode(node: NodeLike, task: TaskItemViewModel): void {
    // Task name
    const nameLabel = this.findLabel(node, 'NameLabel');
    if (nameLabel) {
      const icon = TASK_TYPE_ICONS[task.type] || '';
      nameLabel.string = `${icon} ${task.name}`;
    }

    // Progress bar
    const progressBar = this.findProgress(node, 'ProgressBar');
    if (progressBar) {
      progressBar.fillRange = task.progress;
    }

    // Progress text
    const progressLabel = this.findLabel(node, 'ProgressLabel');
    if (progressLabel) {
      if (task.completed) {
        progressLabel.string = '✅ 已完成';
      } else if (task.claimed) {
        progressLabel.string = '已领取';
      } else {
        progressLabel.string = `${Math.floor(task.progress * 100)}% ${formatDuration(task.remainingSeconds)}`;
      }
    }

    // Rewards text
    const rewardLabel = this.findLabel(node, 'RewardLabel');
    if (rewardLabel) {
      rewardLabel.string = task.rewards
        .map(r => `${r.type === 'salary' ? '💰' : r.type === 'cultivation' ? '⚡' : '💎'}${r.amount}`)
        .join(' ');
    }

    // Claim button
    const claimButton = this.findButton(node, 'ClaimButton');
    if (claimButton) {
      claimButton.interactable = task.completed && !task.claimed;
    }

    // Claim button label
    const claimLabel = this.findLabel(node, 'ClaimButtonLabel');
    if (claimLabel) {
      claimLabel.string = task.completed && !task.claimed ? '领取' : '';
    }
  }

  /** Refresh only active task progress (lighter than full refresh). */
  private refreshActiveTasks(): void {
    if (!this.facade || this.disposed) return;
    this.viewModel = buildTaskViewModel(this.facade);
    this.renderActiveTasks(this.viewModel);
  }

  // ── User Actions ──────────────────────────────────────────────────────────

  /** Start a task by config ID. Called from scene button bindings. */
  public startTask(configId: string): void {
    if (!this.facade || this.disposed) return;

    const result = this.facade.startTask(configId);
    if (!result.success) {
      SceneBindingComponent.instance?.showToast(
        result.reason ?? '无法开始任务', 'WARNING',
      );
      return;
    }

    SceneBindingComponent.instance?.showToast('任务已开始', 'SUCCESS');
    this.refresh();
  }

  /** Claim a completed task. Called from scene button bindings. */
  public claimTask(taskId: string): void {
    if (!this.facade || this.disposed) return;

    const result = this.facade.claimTask(taskId);
    if (!result.success) {
      SceneBindingComponent.instance?.showToast(
        result.reason ?? '无法领取任务', 'WARNING',
      );
      return;
    }

    SceneBindingComponent.instance?.showToast('任务奖励已领取', 'SUCCESS');
    this.refresh();
  }

  // ── Event Subscription ────────────────────────────────────────────────────

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const category of TASK_REFRESH_CATEGORIES) {
      const unsub = this.facade.onUiEvent(category, () => {
        if (!this.disposed && this.facade) {
          this.refresh();
        }
      });
      this.unsubs.push(unsub);
    }
  }

  private unsubscribeEvents(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }

  // ── Node Helpers ──────────────────────────────────────────────────────────

  private findLabel(parent: NodeLike, childName: string): TextLike | null {
    const child = parent.getChildByName?.(childName);
    if (!child) return null;
    const comp = child.getComponent?.(resolveCocosType('Label'));
    return (comp as unknown as TextLike) ?? null;
  }

  private findButton(parent: NodeLike, childName: string): ButtonLike | null {
    const child = parent.getChildByName?.(childName);
    if (!child) return null;
    const comp = child.getComponent?.(resolveCocosType('Button'));
    return (comp as unknown as ButtonLike) ?? null;
  }

  private findProgress(parent: NodeLike, childName: string): ProgressLike | null {
    const child = parent.getChildByName?.(childName);
    if (!child) return null;
    const comp = child.getComponent?.(resolveCocosType('ProgressBar'));
    return (comp as unknown as ProgressLike) ?? null;
  }
}