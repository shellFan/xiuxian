/**
 * HomePageComponent — WEB V1 root page orchestrator for the home screen.
 *
 * Coordinates child components:
 *   - MainHudComponent (top HUD: identity, resources, KPI)
 *   - CultivationPanelComponent (cultivation button + cooldown)
 *   - IdleStatusPanelComponent (idle efficiency display)
 *   - BottomNavComponent (5-tab navigation)
 *
 * Listens to BottomNavComponent tab changes and shows/hides
 * page content nodes accordingly.
 *
 * Layout (1280×720 PC Desktop):
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │ [MainHudComponent]  修为:1500  灵石:30  工资:80  道心:55/100     │ ← top HUD
 *   │ ┌─ Left Panel ──────────┐ ┌─ Right Panel ─────────────────────┐   │
 *   │ │ [Cultivation Panel]   │ │ [Page Content Area]              │   │
 *   │ │ 修炼进度  [修炼按钮]   │ │  (HOME/TASKS/CRAFT/PROMOTION/)  │   │
 *   │ │ [Idle Status Panel]   │ │                                  │   │
 *   │ │ 模式/效率/道心状态    │ │                                  │   │
 *   │ │ [Quick Actions]       │ │                                  │   │
 *   │ └───────────────────────┘ └──────────────────────────────────┘   │
 *   │ ┌─ BottomNav ─────────────────────────────────────────────────┐   │
 *   │ │ [首页]  [任务]  [合成]  [晋升]  [更多]                       │   │
 *   │ └──────────────────────────────────────────────────────────────┘   │
 *   └─────────────────────────────────────────────────────────────────────┘
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { UiEventCategory } from '../facade/ui-event-types';
import type { NavTab } from './bottom-nav-component';
import { BottomNavComponent } from './bottom-nav-component';
import { CultivationPanelComponent } from './cultivation-panel-component';
import { IdleStatusPanelComponent } from './idle-status-panel-component';
import { TaskPageComponent } from './task-page-component';
import { PromotionPageComponent } from './promotion-page-component';
import { CraftPageComponent } from './craft-page-component';
import { SectPageComponent } from './sect-page-component';
import { LeaderboardPageComponent } from './leaderboard-page-component';
import { FriendsPageComponent } from './friends-page-component';
import { AchievementsPageComponent } from './achievements-page-component';
import { SettingsPageComponent } from './settings-page-component';
import { FloatingRewardComponent } from './floating-reward-component';
import { TutorialOverlayComponent } from './tutorial-overlay-component';
import { DebugPanelComponent } from './debug-panel-component';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

// ── Cocos Node Interfaces ────────────────────────────────────────────────────

interface NodeLike {
  active?: boolean;
  name?: string;
  children?: readonly NodeLike[];
  getChildByName?: (name: string) => NodeLike | null;
  getComponent?: (type: unknown) => unknown;
}

// ── Page-to-node mapping ─────────────────────────────────────────────────────

/** Maps NavTab values to child node names that should be shown/hidden. */
const PAGE_NODE_MAP: Record<NavTab, string> = {
  HOME: 'HomePageContent',
  TASKS: 'TasksPageContent',
  CRAFT: 'CraftPageContent',
  PROMOTION: 'PromotionPageContent',
  SECT: 'SectPageContent',
  LEADERBOARD: 'LeaderboardPageContent',
  FRIENDS: 'FriendsPageContent',
  ACHIEVEMENTS: 'AchievementsPageContent',
  SETTINGS: 'SettingsPageContent',
};

// ── Refresh categories ───────────────────────────────────────────────────────

const HOME_REFRESH_CATEGORIES: readonly UiEventCategory[] = [
  'STATE_CHANGED',
  'RESOURCE_CHANGED',
  'WORK_MODE_CHANGED',
  'BUFF_CHANGED',
];

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('HomePage')
export class HomePageComponent extends Component {
  // ── Scene-bound properties (set in Cocos Editor) ──────────────────────────

  /** Bottom navigation component */
  @property(BottomNavComponent)
  public bottomNav?: BottomNavComponent;

  /** Cultivation panel component */
  @property(CultivationPanelComponent)
  public cultivationPanel?: CultivationPanelComponent;

  /** Idle status panel component */
  @property(IdleStatusPanelComponent)
  public idleStatusPanel?: IdleStatusPanelComponent;

  /** Task page component */
  @property(TaskPageComponent)
  public taskPage?: TaskPageComponent;

  /** Promotion page component */
  @property(PromotionPageComponent)
  public promotionPage?: PromotionPageComponent;

  /** Craft page component */
  @property(CraftPageComponent)
  public craftPage?: CraftPageComponent;

  /** Sect page component */
  @property(SectPageComponent)
  public sectPage?: SectPageComponent;

  /** Leaderboard page component */
  @property(LeaderboardPageComponent)
  public leaderboardPage?: LeaderboardPageComponent;

  /** Friends page component */
  @property(FriendsPageComponent)
  public friendsPage?: FriendsPageComponent;

  /** Achievements page component */
  @property(AchievementsPageComponent)
  public achievementsPage?: AchievementsPageComponent;

  /** Settings page component */
  @property(SettingsPageComponent)
  public settingsPage?: SettingsPageComponent;

  /** Floating reward feedback component */
  @property(FloatingRewardComponent)
  public floatingReward?: FloatingRewardComponent;

  /** Tutorial overlay component */
  @property(TutorialOverlayComponent)
  public tutorialOverlay?: TutorialOverlayComponent;

  /** Debug panel component */
  @property(DebugPanelComponent)
  public debugPanel?: DebugPanelComponent;

  /** Container node for page content areas */
  @property(resolveCocosType('Node'))
  public pageContainer?: NodeLike;

  /** Quick action buttons container */
  @property(resolveCocosType('Node'))
  public quickActions?: NodeLike;

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private currentTab: NavTab = 'HOME';
  private unsubs: Array<() => void> = [];
  private tabChangeUnsub: (() => void) | null = null;
  private disposed = false;

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('HomePageComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;

    // Subscribe to bottom nav tab changes
    if (this.bottomNav) {
      this.tabChangeUnsub = this.bottomNav.onTabChange((tab) => this.onTabChanged(tab));
    }

    // Subscribe to facade UI events for child refresh
    this.subscribeEvents();

    // Initial render
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    if (this.tabChangeUnsub) {
      this.tabChangeUnsub();
      this.tabChangeUnsub = null;
    }
    this.facade = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Get the currently active tab. */
  public getCurrentTab(): NavTab {
    return this.currentTab;
  }

  /** Force refresh all child components. */
  public refresh(): void {
    if (!this.facade || this.disposed) return;

    // Refresh child components
    this.cultivationPanel?.refresh();
    this.idleStatusPanel?.refresh();
    this.bottomNav?.refresh();

    // Refresh active page component
    this.refreshActivePage();

    // Floating reward is event-driven (no refresh needed)
    this.tutorialOverlay?.refresh();

    // Update page visibility
    this.updatePageVisibility();
  }

  // ── Active Page Refresh ────────────────────────────────────────────────────

  /** Refresh only the currently active page component. */
  private refreshActivePage(): void {
    switch (this.currentTab) {
      case 'HOME':
        this.cultivationPanel?.refresh();
        this.idleStatusPanel?.refresh();
        break;
      case 'TASKS':
        this.taskPage?.refresh();
        break;
      case 'CRAFT':
        this.craftPage?.refresh();
        break;
      case 'PROMOTION':
        this.promotionPage?.refresh();
        break;
      case 'SECT':
        this.sectPage?.refresh();
        break;
      case 'LEADERBOARD':
        this.leaderboardPage?.refresh();
        break;
      case 'FRIENDS':
        this.friendsPage?.refresh();
        break;
      case 'ACHIEVEMENTS':
        this.achievementsPage?.refresh();
        break;
      case 'SETTINGS':
        this.settingsPage?.refresh();
        break;
    }
  }

  // ── Tab Change Handling ───────────────────────────────────────────────────

  private onTabChanged(tab: NavTab): void {
    if (this.currentTab === tab) return;
    this.currentTab = tab;
    this.updatePageVisibility();

    // Refresh relevant child when switching to its tab
    switch (tab) {
      case 'HOME':
        this.cultivationPanel?.refresh();
        this.idleStatusPanel?.refresh();
        break;
      case 'TASKS':
        this.taskPage?.refresh();
        break;
      case 'CRAFT':
        this.craftPage?.refresh();
        break;
      case 'PROMOTION':
        this.promotionPage?.refresh();
        break;
      case 'SECT':
        this.sectPage?.refresh();
        break;
      case 'LEADERBOARD':
        this.leaderboardPage?.refresh();
        break;
      case 'FRIENDS':
        this.friendsPage?.refresh();
        break;
      case 'ACHIEVEMENTS':
        this.achievementsPage?.refresh();
        break;
      case 'SETTINGS':
        this.settingsPage?.refresh();
        break;
    }
  }

  private updatePageVisibility(): void {
    if (!this.pageContainer?.children) return;

    // Show only the active page content node
    const activeNodeName = PAGE_NODE_MAP[this.currentTab];
    for (const child of this.pageContainer.children) {
      if (child) {
        child.active = child.name === activeNodeName;
      }
    }

    // Show quick actions only on home page
    if (this.quickActions) {
      this.quickActions.active = this.currentTab === 'HOME';
    }
  }

  // ── Event Subscription ────────────────────────────────────────────────────

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const category of HOME_REFRESH_CATEGORIES) {
      const unsub = this.facade.onUiEvent(category, () => {
        if (!this.disposed) this.refresh();
      });
      this.unsubs.push(unsub);
    }
  }

  private unsubscribeEvents(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }
}