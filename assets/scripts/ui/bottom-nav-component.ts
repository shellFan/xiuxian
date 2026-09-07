/**
 * BottomNavComponent — WEB V1 bottom navigation bar with 7 tabs.
 *
 * Provides tab switching between the 7 main pages:
 *   1. 首页 (Home)     — Main gameplay page
 *   2. 修炼 (Cultivate) — Cultivation page
 *   3. 任务 (Tasks)    — Task management page
 *   4. 合成 (Merge)    — Merge board page
 *   5. 排行 (Rank)     — Leaderboard page
 *   6. 好友 (Friends)  — Friends page
 *   7. 更多 (More)     — Settings/achievements page
 *
 * Emits tab change events that parent components can listen to
 * for page switching. Supports badge indicators for notifications.
 *
 * Layout (750×1334 design):
 *   ┌─────────────────────────────────────┐
 *   │ [首页] [修炼] [任务] [合成] [排行] [好友] [更多] │
 *   └─────────────────────────────────────┘
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { UiEventCategory } from '../facade/ui-event-types';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

// ── Tab Definition ───────────────────────────────────────────────────────────

export type NavTab = 'HOME' | 'CULTIVATE' | 'TASKS' | 'MERGE' | 'RANK' | 'FRIENDS' | 'MORE';

const NAV_TABS: readonly NavTab[] = [
  'HOME', 'CULTIVATE', 'TASKS', 'MERGE', 'RANK', 'FRIENDS', 'MORE',
];

const TAB_LABELS: Record<NavTab, string> = {
  HOME: '首页',
  CULTIVATE: '修炼',
  TASKS: '任务',
  MERGE: '合成',
  RANK: '排行',
  FRIENDS: '好友',
  MORE: '更多',
};

const TAB_ICONS: Record<NavTab, string> = {
  HOME: '🏠',
  CULTIVATE: '⚡',
  TASKS: '📋',
  MERGE: '🔮',
  RANK: '🏆',
  FRIENDS: '👥',
  MORE: '⚙️',
};

// ── Cocos Node Interfaces ────────────────────────────────────────────────────

interface TextLike { string: string; }
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
interface SpriteLike {
  spriteFrame?: unknown;
}

// ── Refresh categories ───────────────────────────────────────────────────────

const NAV_REFRESH_CATEGORIES: readonly UiEventCategory[] = [
  'STATE_CHANGED',
  'RESOURCE_CHANGED',
];

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('BottomNav')
export class BottomNavComponent extends Component {
  // ── Scene-bound properties (set in Cocos Editor) ──────────────────────────

  /** Tab button nodes (7 buttons in order: HOME, CULTIVATE, TASKS, MERGE, RANK, FRIENDS, MORE) */
  @property([resolveCocosType('Button')])
  public tabButtons: ButtonLike[] = [];

  /** Tab label nodes (7 labels in same order) */
  @property([resolveCocosType('Label')])
  public tabLabels: TextLike[] = [];

  /** Badge node for tasks tab (shows unclaimed count) */
  @property(resolveCocosType('Node'))
  public tasksBadge?: NodeLike;

  /** Badge label for tasks tab */
  @property(resolveCocosType('Label'))
  public tasksBadgeLabel?: TextLike;

  /** Badge node for friends tab (shows unclaimed gifts) */
  @property(resolveCocosType('Node'))
  public friendsBadge?: NodeLike;

  /** Badge label for friends tab */
  @property(resolveCocosType('Label'))
  public friendsBadgeLabel?: TextLike;

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private currentTab: NavTab = 'HOME';
  private unsubs: Array<() => void> = [];
  private disposed = false;
  private tabChangeListeners: Array<(tab: NavTab) => void> = [];

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('BottomNavComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;

    // Bind tab buttons
    this.bindTabButtons();

    // Subscribe to UI events for badge updates
    this.subscribeEvents();

    // Initial render
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    this.unbindTabButtons();
    this.facade = null;
    this.tabChangeListeners.length = 0;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Get the currently active tab. */
  public getCurrentTab(): NavTab {
    return this.currentTab;
  }

  /** Switch to a specific tab programmatically. */
  public switchTab(tab: NavTab): void {
    if (this.currentTab === tab) return;
    this.currentTab = tab;
    this.renderTabHighlight();
    this.notifyTabChange(tab);
  }

  /** Listen for tab changes. Returns unsubscribe function. */
  public onTabChange(listener: (tab: NavTab) => void): () => void {
    this.tabChangeListeners.push(listener);
    return () => {
      const idx = this.tabChangeListeners.indexOf(listener);
      if (idx >= 0) this.tabChangeListeners.splice(idx, 1);
    };
  }

  /** Force refresh badges from facade state. */
  public refresh(): void {
    if (!this.facade || this.disposed) return;
    this.renderTabLabels();
    this.renderBadges();
    this.renderTabHighlight();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private renderTabLabels(): void {
    for (let i = 0; i < NAV_TABS.length && i < this.tabLabels.length; i++) {
      const tab = NAV_TABS[i];
      this.tabLabels[i].string = TAB_LABELS[tab];
    }
  }

  private renderTabHighlight(): void {
    for (let i = 0; i < NAV_TABS.length && i < this.tabButtons.length; i++) {
      const isActive = NAV_TABS[i] === this.currentTab;
      // Visual highlight is handled by Cocos Editor toggle/transition
      // Here we just manage interactability
      this.tabButtons[i].interactable = !isActive;
    }
  }

  private renderBadges(): void {
    if (!this.facade) return;

    // Tasks badge: show count of completed but unclaimed tasks
    const snap = this.facade.snapshot();
    const unclaimedTasks = snap.activeTasks.filter(t => t.completed && !t.claimed).length;
    if (this.tasksBadge) {
      this.tasksBadge.active = unclaimedTasks > 0;
    }
    if (this.tasksBadgeLabel && unclaimedTasks > 0) {
      this.tasksBadgeLabel.string = unclaimedTasks > 99 ? '99+' : String(unclaimedTasks);
    }

    // Friends badge: show count of unclaimed gifts
    const friendsView = this.facade.queryFriends();
    const unclaimedGifts = friendsView.giftsToClaim;
    if (this.friendsBadge) {
      this.friendsBadge.active = unclaimedGifts > 0;
    }
    if (this.friendsBadgeLabel && unclaimedGifts > 0) {
      this.friendsBadgeLabel.string = unclaimedGifts > 99 ? '99+' : String(unclaimedGifts);
    }
  }

  // ── Event Subscription ────────────────────────────────────────────────────

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const category of NAV_REFRESH_CATEGORIES) {
      const unsub = this.facade.onUiEvent(category, () => {
        if (!this.disposed) this.renderBadges();
      });
      this.unsubs.push(unsub);
    }
  }

  private unsubscribeEvents(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }

  // ── Button Binding ────────────────────────────────────────────────────────

  private bindTabButtons(): void {
    for (let i = 0; i < NAV_TABS.length && i < this.tabButtons.length; i++) {
      const tab = NAV_TABS[i];
      this.tabButtons[i].on?.('click', () => this.switchTab(tab), this);
    }
  }

  private unbindTabButtons(): void {
    for (let i = 0; i < this.tabButtons.length; i++) {
      this.tabButtons[i].off?.('click', () => {}, this);
    }
  }

  // ── Notification ──────────────────────────────────────────────────────────

  private notifyTabChange(tab: NavTab): void {
    for (const listener of this.tabChangeListeners) {
      try { listener(tab); } catch { /* listener errors must not propagate */ }
    }
  }
}