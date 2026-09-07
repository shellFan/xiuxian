/**
 * MorePageComponent — WEB V1 "more" page with sub-sections.
 *
 * Contains: Achievements, Daily Tasks, Settings, Leaderboard, Friends.
 * Uses tab-like sub-navigation within the page.
 *
 * Layout (750×1334 design):
 *   ┌─────────────────────────────────────┐
 *   │ 更多                                 │
 *   │ [成就] [每日] [设置] [排行] [好友]  │
 *   │ ┌─ Sub-page content ──────────────┐ │
 *   │ │ (varies by selected tab)        │ │
 *   │ └─────────────────────────────────┘ │
 *   └─────────────────────────────────────┘
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import { SceneBindingComponent } from './scene-binding-component';
import type { GameFacade } from '../facade/game-facade';
import type {
  AchievementViewModel, AchievementItemViewModel,
  DailyTaskViewModel, DailyTaskItemViewModel,
  SettingsViewModel,
} from './view-models';
import {
  buildAchievementViewModel, buildDailyTaskViewModel,
} from './view-models';
import type { UiEventCategory } from '../facade/ui-event-types';
import { formatNumber } from './number-formatter';

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
  interactable?: boolean;
}
interface NodeLike {
  active?: boolean;
  name?: string;
  children?: readonly NodeLike[];
  getChildByName?: (name: string) => NodeLike | null;
  getComponent?: (type: unknown) => unknown;
}

// ── Sub-tab types ────────────────────────────────────────────────────────────

type MoreSubTab = 'ACHIEVEMENT' | 'DAILY' | 'SETTINGS' | 'LEADERBOARD' | 'FRIENDS';

const SUB_TAB_LABELS: Record<MoreSubTab, string> = {
  ACHIEVEMENT: '成就',
  DAILY: '每日',
  SETTINGS: '设置',
  LEADERBOARD: '排行',
  FRIENDS: '好友',
};

// ── Refresh categories ───────────────────────────────────────────────────────

const MORE_REFRESH_CATEGORIES: readonly UiEventCategory[] = [
  'STATE_CHANGED',
  'RESOURCE_CHANGED',
  'ACHIEVEMENT_CHANGED',
  'DAILY_CHANGED',
  'SETTINGS_CHANGED',
];

// ── Achievement status labels ────────────────────────────────────────────────

const ACHIEVEMENT_STATUS_LABELS: Record<string, string> = {
  LOCKED: '🔒',
  UNLOCKED: '🔓',
  COMPLETED: '✅',
  CLAIMED: '🎉',
};

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('MorePage')
export class MorePageComponent extends Component {
  // ── Scene-bound properties ────────────────────────────────────────────────

  @property(resolveCocosType('Label'))
  public titleLabel?: TextLike;

  /** Container for achievement sub-page */
  @property(resolveCocosType('Node'))
  public achievementContainer?: NodeLike;

  /** Container for daily task sub-page */
  @property(resolveCocosType('Node'))
  public dailyContainer?: NodeLike;

  /** Container for settings sub-page */
  @property(resolveCocosType('Node'))
  public settingsContainer?: NodeLike;

  /** Container for leaderboard sub-page */
  @property(resolveCocosType('Node'))
  public leaderboardContainer?: NodeLike;

  /** Container for friends sub-page */
  @property(resolveCocosType('Node'))
  public friendsContainer?: NodeLike;

  /** Achievement count label */
  @property(resolveCocosType('Label'))
  public achievementCountLabel?: TextLike;

  /** Daily task count label */
  @property(resolveCocosType('Label'))
  public dailyCountLabel?: TextLike;

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private currentTab: MoreSubTab = 'ACHIEVEMENT';
  private unsubs: Array<() => void> = [];
  private disposed = false;

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('MorePageComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;
    this.subscribeEvents();
    this.switchTab('ACHIEVEMENT');
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    this.facade = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  public switchTab(tab: MoreSubTab): void {
    this.currentTab = tab;
    this.updateContainerVisibility();
    this.refresh();
  }

  public refresh(): void {
    if (!this.facade || this.disposed) return;

    if (this.titleLabel) this.titleLabel.string = '更多';

    switch (this.currentTab) {
      case 'ACHIEVEMENT': this.renderAchievements(); break;
      case 'DAILY': this.renderDailyTasks(); break;
      case 'SETTINGS': this.renderSettings(); break;
      case 'LEADERBOARD': this.renderLeaderboard(); break;
      case 'FRIENDS': this.renderFriends(); break;
    }
  }

  // ── Container Visibility ──────────────────────────────────────────────────

  private updateContainerVisibility(): void {
    const containers: Record<MoreSubTab, NodeLike | undefined> = {
      ACHIEVEMENT: this.achievementContainer,
      DAILY: this.dailyContainer,
      SETTINGS: this.settingsContainer,
      LEADERBOARD: this.leaderboardContainer,
      FRIENDS: this.friendsContainer,
    };
    for (const [tab, container] of Object.entries(containers)) {
      if (container) container.active = tab === this.currentTab;
    }
  }

  // ── Achievement Render ────────────────────────────────────────────────────

  private renderAchievements(): void {
    if (!this.facade) return;
    const vm = buildAchievementViewModel(this.facade);

    if (this.achievementCountLabel) {
      this.achievementCountLabel.string = `${vm.claimedCount}/${vm.totalCount}`;
    }

    // Render achievement items by name convention
    if (this.achievementContainer) {
      for (let i = 0; i < vm.items.length && i < 20; i++) {
        const item = vm.items[i];
        const node = this.achievementContainer.getChildByName?.(`Achievement_${i}`);
        if (node) {
          node.active = !item.isHidden || item.status !== 'LOCKED';
          if (node.active) this.renderAchievementNode(node, item);
        }
      }
      // Hide unused
      for (let i = vm.items.length; i < 20; i++) {
        const node = this.achievementContainer.getChildByName?.(`Achievement_${i}`);
        if (node) node.active = false;
      }
    }
  }

  private renderAchievementNode(node: NodeLike, item: AchievementItemViewModel): void {
    const nameLabel = this.findLabel(node, 'NameLabel');
    if (nameLabel) {
      nameLabel.string = `${ACHIEVEMENT_STATUS_LABELS[item.status] ?? ''} ${item.name}`;
    }

    const descLabel = this.findLabel(node, 'DescLabel');
    if (descLabel) descLabel.string = item.description;

    const claimButton = this.findButton(node, 'ClaimButton');
    if (claimButton) {
      claimButton.interactable = item.status === 'COMPLETED';
      claimButton.on?.('click', () => this.claimAchievement(item.id), this);
    }
  }

  /** Claim an achievement reward. */
  public claimAchievement(id: string): void {
    if (!this.facade || this.disposed) return;
    this.facade.claimAchievement(id);
    SceneBindingComponent.instance?.showToast('成就奖励已领取', 'SUCCESS');
    this.refresh();
  }

  // ── Daily Task Render ─────────────────────────────────────────────────────

  private renderDailyTasks(): void {
    if (!this.facade) return;
    const vm = buildDailyTaskViewModel(this.facade);

    if (this.dailyCountLabel) {
      this.dailyCountLabel.string = `${vm.claimedCount}/${vm.totalCount}`;
    }

    if (this.dailyContainer) {
      for (let i = 0; i < vm.tasks.length && i < 10; i++) {
        const task = vm.tasks[i];
        const node = this.dailyContainer.getChildByName?.(`DailyTask_${i}`);
        if (node) {
          node.active = true;
          this.renderDailyTaskNode(node, task);
        }
      }
      for (let i = vm.tasks.length; i < 10; i++) {
        const node = this.dailyContainer.getChildByName?.(`DailyTask_${i}`);
        if (node) node.active = false;
      }
    }
  }

  private renderDailyTaskNode(node: NodeLike, task: DailyTaskItemViewModel): void {
    const nameLabel = this.findLabel(node, 'NameLabel');
    if (nameLabel) nameLabel.string = task.name;

    const progressLabel = this.findLabel(node, 'ProgressLabel');
    if (progressLabel) {
      progressLabel.string = task.completed
        ? '✅ 已完成'
        : `${task.progress}/${task.target}`;
    }

    const claimButton = this.findButton(node, 'ClaimButton');
    if (claimButton) {
      claimButton.interactable = task.completed && !task.claimed;
      claimButton.on?.('click', () => this.claimDailyTask(task.taskId), this);
    }
  }

  /** Claim a daily task reward. */
  public claimDailyTask(taskId: string): void {
    if (!this.facade || this.disposed) return;
    this.facade.claimDailyTask(taskId);
    SceneBindingComponent.instance?.showToast('每日任务奖励已领取', 'SUCCESS');
    this.refresh();
  }

  // ── Settings Render ───────────────────────────────────────────────────────

  private renderSettings(): void {
    // Settings page shows basic info and reset option
    if (!this.settingsContainer) return;

    const resetLabel = this.findLabel(this.settingsContainer, 'ResetLabel');
    if (resetLabel) {
      resetLabel.string = '重置存档将清除所有游戏进度';
    }

    const saveLabel = this.findLabel(this.settingsContainer, 'SaveLabel');
    if (saveLabel && this.facade) {
      const snap = this.facade.snapshot();
      saveLabel.string = `存档版本: ${snap.lastSaveTime ?? 0}`;
    }
  }

  /** Save game manually. */
  public saveGame(): void {
    if (!this.facade || this.disposed) return;
    this.facade.save();
    SceneBindingComponent.instance?.showToast('存档已保存', 'SUCCESS');
  }

  /** Clear save data (with confirmation). */
  public clearSave(): void {
    if (!this.facade || this.disposed) return;
    SceneBindingComponent.instance?.showModal({
      entityId: 'clear-save-confirm',
      type: 'CONFIRM',
      payload: { message: '确定要清除所有存档数据吗？此操作不可撤销！' },
      dismissible: true,
    });
  }

  // ── Leaderboard Render ────────────────────────────────────────────────────

  private renderLeaderboard(): void {
    if (!this.leaderboardContainer) return;
    // WEB V1: leaderboard is placeholder
    const placeholderLabel = this.findLabel(this.leaderboardContainer, 'PlaceholderLabel');
    if (placeholderLabel) {
      placeholderLabel.string = '🏆 排行榜后续版本开放';
    }
  }

  /** Show "coming soon" toast for leaderboard actions. */
  public onLeaderboardAction(): void {
    SceneBindingComponent.instance?.showToast('排行榜后续版本开放', 'INFO');
  }

  // ── Friends Render ────────────────────────────────────────────────────────

  private renderFriends(): void {
    if (!this.friendsContainer) return;
    // WEB V1: friends is placeholder
    const placeholderLabel = this.findLabel(this.friendsContainer, 'PlaceholderLabel');
    if (placeholderLabel) {
      placeholderLabel.string = '👥 好友系统后续版本开放';
    }
  }

  /** Show "coming soon" toast for friends actions. */
  public onFriendsAction(): void {
    SceneBindingComponent.instance?.showToast('好友系统后续版本开放', 'INFO');
  }

  // ── Event Subscription ────────────────────────────────────────────────────

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const category of MORE_REFRESH_CATEGORIES) {
      const unsub = this.facade.onUiEvent(category, () => {
        if (!this.disposed && this.facade) this.refresh();
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
}