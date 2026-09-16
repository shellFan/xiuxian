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
  buildLeaderboardViewModel, buildFriendsViewModel,
  buildSectViewModel,
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
  off?: (event: string, callback: () => void, target?: unknown) => void;
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

type MoreSubTab = 'SECT' | 'ACHIEVEMENT' | 'DAILY' | 'SETTINGS' | 'LEADERBOARD' | 'FRIENDS';

const SUB_TAB_LABELS: Record<MoreSubTab, string> = {
  SECT: '宗门',
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

  /** Sect/company sub-page. */
  @property(resolveCocosType('Node'))
  public sectContainer?: NodeLike;

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
  private boundButtons = new Set<ButtonLike>();
  private subTabHandlers = new Map<ButtonLike, () => void>();
  private disposed = false;

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('MorePageComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;
    this.resolveSceneBindings();
    this.bindSubTabs();
    this.subscribeEvents();
    this.switchTab('ACHIEVEMENT');
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    for (const [button, handler] of this.subTabHandlers) {
      button.off?.('click', handler, this);
    }
    this.subTabHandlers.clear();
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
      case 'SECT': this.renderSect(); break;
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
      SECT: this.sectContainer,
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
      this.bindButtonOnce(claimButton, () => this.claimAchievement(item.id));
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
      this.bindButtonOnce(claimButton, () => this.claimDailyTask(task.taskId));
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
    if (!this.facade) return;
    const vm = buildLeaderboardViewModel(this.facade);
    const rankLabel = this.findLabel(this.leaderboardContainer, 'PlayerRankLabel');
    if (rankLabel) rankLabel.string = `我的排名：第 ${vm.playerRank} 名 · 共 ${vm.totalEntries} 位道友`;
    const rows = vm.aroundPlayer.length > 0 ? vm.aroundPlayer : vm.top3;
    for (let i = 0; i < rows.length; i++) {
      const row = this.leaderboardContainer.getChildByName?.(`EntryRow_${i}`);
      const entry = rows[i];
      if (!row || !entry) continue;
      row.active = true;
      const rank = this.findLabel(row, 'RankLabel');
      const name = this.findLabel(row, 'NameLabel');
      const score = this.findLabel(row, 'ScoreLabel');
      if (rank) rank.string = `#${entry.rank}`;
      if (name) name.string = entry.isPlayer ? `你 · ${entry.careerName}` : entry.name;
      if (score) score.string = `修为 ${formatNumber(entry.cultivationExp)}`;
    }
  }

  /** Resolve the generated scene contract at runtime so the component works
   * both in the desktop scene and in Cocos without serialized references. */
  private resolveSceneBindings(): void {
    const root = this.node as unknown as NodeLike;
    if (!this.titleLabel) this.titleLabel = this.findLabel(root, 'MorePageContentTitleLabel') ?? undefined;
    this.sectContainer ??= root.getChildByName?.('SectContainer') ?? undefined;
    this.achievementContainer ??= root.getChildByName?.('AchievementsContainer') ?? undefined;
    this.dailyContainer ??= root.getChildByName?.('DailyContainer') ?? undefined;
    this.settingsContainer ??= root.getChildByName?.('SettingsContainer') ?? undefined;
    this.leaderboardContainer ??= root.getChildByName?.('LeaderboardContainer') ?? undefined;
    this.friendsContainer ??= root.getChildByName?.('FriendsContainer') ?? undefined;
  }

  private bindSubTabs(): void {
    const root = this.node as unknown as NodeLike;
    const nav = root.getChildByName?.('MoreSectionTabs');
    if (!nav) return;
    const tabNodes: Array<[string, MoreSubTab]> = [
      ['MoreTabSect', 'SECT'],
      ['MoreTabLeaderboard', 'LEADERBOARD'],
      ['MoreTabFriends', 'FRIENDS'],
      ['MoreTabAchievements', 'ACHIEVEMENT'],
      ['MoreTabDaily', 'DAILY'],
      ['MoreTabSettings', 'SETTINGS'],
    ];
    for (const [name, tab] of tabNodes) {
      const button = this.findButton(nav, name);
      if (!button || this.subTabHandlers.has(button)) continue;
      const handler = () => this.switchTab(tab);
      button.on?.('click', handler, this);
      this.subTabHandlers.set(button, handler);
    }
  }

  private renderSect(): void {
    if (!this.facade || !this.sectContainer) return;
    const vm = buildSectViewModel(this.facade);
    const current = this.findLabel(this.sectContainer, 'CurrentSectLabel');
    if (current) current.string = `当前宗门：${vm.currentSectName}`;
    vm.sects.forEach((sect, index) => {
      const card = this.sectContainer?.getChildByName?.(`SectCard_${index}`);
      if (!card) return;
      const name = this.findLabel(card, 'NameLabel');
      const bonus = this.findLabel(card, 'BonusLabel');
      if (name) name.string = `${sect.name}${sect.selected ? ' ✓' : ''}`;
      if (bonus) bonus.string = sect.selected ? '当前宗门 · 已生效' : '点击选择此宗门';
      const button = this.getSelfButton(card);
      if (button && !this.boundButtons.has(button)) {
        this.boundButtons.add(button);
        button.on?.('click', () => {
          const result = this.facade?.changeSect(sect.id);
          SceneBindingComponent.instance?.showToast(result?.success ? `已加入${sect.name}` : (result?.reason ?? '暂时无法加入'), result?.success ? 'SUCCESS' : 'WARNING');
          this.refresh();
        }, this);
      }
    });
  }

  /** Show "coming soon" toast for leaderboard actions. */
  public onLeaderboardAction(): void {
    this.switchTab('LEADERBOARD');
  }

  // ── Friends Render ────────────────────────────────────────────────────────

  private renderFriends(): void {
    if (!this.friendsContainer) return;
    if (!this.facade) return;
    const vm = buildFriendsViewModel(this.facade);
    const pending = this.findLabel(this.friendsContainer, 'PendingGiftsLabel');
    if (pending) pending.string = `${vm.totalFriends} 位好友 · ${vm.giftsToClaim} 个待领取礼物`;
    for (let i = 0; i < vm.friends.length; i++) {
      const friend = vm.friends[i];
      const row = this.friendsContainer.getChildByName?.(`FriendRow_${i}`);
      if (!row || !friend) continue;
      row.active = true;
      const name = this.findLabel(row, 'NameLabel');
      const level = this.findLabel(row, 'LevelLabel');
      const status = this.findLabel(row, 'GiftStatusLabel');
      if (name) name.string = friend.name;
      if (level) level.string = `Lv.${friend.careerLevel}`;
      if (status) status.string = friend.giftReceived ? '🎁 待领取' : friend.giftSent ? '已送礼' : '可送礼';
      const send = this.findButton(row, 'SendGiftButton');
      const claim = this.findButton(row, 'ClaimGiftButton');
      if (send) {
        send.interactable = !friend.giftSent;
        this.bindButtonOnce(send, () => this.sendFriendGift(friend.id));
      }
      if (claim) {
        claim.interactable = friend.giftReceived;
        this.bindButtonOnce(claim, () => this.claimFriendGift(friend.id));
      }
    }
  }

  /** Show "coming soon" toast for friends actions. */
  public onFriendsAction(): void {
    this.switchTab('FRIENDS');
  }

  private bindButtonOnce(button: ButtonLike, handler: () => void): void {
    if (this.boundButtons.has(button)) return;
    this.boundButtons.add(button);
    button.on?.('click', handler, this);
  }

  private sendFriendGift(friendId: string): void {
    if (!this.facade) return;
    this.facade.sendFriendGift(friendId);
    SceneBindingComponent.instance?.showToast('礼物已送达', 'SUCCESS');
    this.refresh();
  }

  private claimFriendGift(friendId: string): void {
    if (!this.facade) return;
    this.facade.claimFriendGift(friendId);
    SceneBindingComponent.instance?.showToast('好友礼物已领取', 'SUCCESS');
    this.refresh();
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

  private getSelfButton(node: NodeLike): ButtonLike | null {
    return (node.getComponent?.(resolveCocosType('Button')) as unknown as ButtonLike) ?? null;
  }
}
