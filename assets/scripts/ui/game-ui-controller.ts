/**
 * GameUIController — PC V1 runtime wiring component.
 *
 * Mounts on SafeAreaRoot and wires all UI nodes to GameFacade at runtime.
 * This avoids modifying Main.scene to add component references (risky, requires Cocos rebuild).
 *
 * Responsibilities:
 *   1. Find UI nodes via getChildByName traversal
 *   2. Get Label/Button components from found nodes
 *   3. Bind click handlers to facade commands (cultivate, work mode, tab switch)
 *   4. Subscribe to facade UI events for data-driven label refresh
 *   5. Manage page visibility based on active tab
 *
 * Scene node tree (1280×720 PC Desktop):
 *   SafeAreaRoot
 *   ├── TopHeader (MainHudComponent already mounted)
 *   ├── ResourceBar
 *   ├── CharacterArea
 *   ├── IdleIncomePanel (IdleStatusPanelComponent already mounted)
 *   ├── PrimaryActions
 *   │   ├── CultivateButton (Label="修炼", Button)
 *   │   ├── WorkButton (Label="打工", Button)
 *   │   └── FishButton (Label="摸鱼", Button)
 *   ├── BottomNavigation
 *   │   ├── TabHome (Label="首页", Button)
 *   │   ├── TabTasks (Label="任务", Button)
 *   │   ├── TabCraft (Label="合成", Button)
 *   │   ├── TabPromotion (Label="晋升", Button)
 *   │   └── TabMore (Label="更多", Button)
 *   ├── PageContainer
 *   │   ├── HomePageContent
 *   │   ├── TasksPageContent
 *   │   ├── CraftPageContent
 *   │   ├── PromotionPageContent
 *   │   └── MorePageContent
 *   ├── ModalLayer
 *   ├── ToastLayer
 *   └── TutorialLayer
 */

import { _decorator, Component } from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import { DragController } from '../game/drag-controller';
import type { BoardPosition } from '../game/merge/merge-types';
import type { GameFacade } from '../facade/game-facade';
import type { UiEventCategory } from '../facade/ui-event-types';
import type { MainHUDViewModel, CultivationViewModel, IdleViewModel } from './view-models';
import { buildMainHUDViewModel, buildCultivationViewModel, buildIdleViewModel, buildMergeBoardViewModel } from './view-models';
import { formatNumber, formatDuration } from './number-formatter';
import { MergeBoardView } from './merge-board-view';

const { ccclass } = _decorator;

// ── Cocos Node Interfaces (type-safe without importing Cocos runtime) ───────

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
  addComponent?: (type: unknown) => unknown;
}

// ── Tab types (matches BottomNavComponent.NavTab subset for 5-tab PC layout) ─

type PcTab = 'HOME' | 'TASKS' | 'CRAFT' | 'PROMOTION' | 'MORE';

const PC_TABS: readonly PcTab[] = ['HOME', 'TASKS', 'CRAFT', 'PROMOTION', 'MORE'];

const TAB_NODE_NAMES: Record<PcTab, string> = {
  HOME: 'HomePageContent',
  TASKS: 'TasksPageContent',
  CRAFT: 'CraftPageContent',
  PROMOTION: 'PromotionPageContent',
  MORE: 'MorePageContent',
};

const TAB_BUTTON_NAMES: Record<PcTab, string> = {
  HOME: 'TabHome',
  TASKS: 'TabTasks',
  CRAFT: 'TabCraft',
  PROMOTION: 'TabPromotion',
  MORE: 'TabMore',
};

// ── Refresh categories ───────────────────────────────────────────────────────

const REFRESH_CATEGORIES: readonly UiEventCategory[] = [
  'STATE_CHANGED',
  'RESOURCE_CHANGED',
  'WORK_MODE_CHANGED',
  'CAREER_CHANGED',
  'BUFF_CHANGED',
];

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('GameUIController')
export class GameUIController extends Component {
  // ── Resolved node references ──────────────────────────────────────────────

  private safeAreaRoot: NodeLike | null = null;
  private topHeader: NodeLike | null = null;
  private idleIncomePanel: NodeLike | null = null;
  private primaryActions: NodeLike | null = null;
  private bottomNavigation: NodeLike | null = null;
  private pageContainer: NodeLike | null = null;
  private craftPageContent: NodeLike | null = null;
  private mergeBoardRoot: NodeLike | null = null;
  private mergeBoardView: MergeBoardView | null = null;
  private dragController: DragController | null = null;

  // Button references
  private cultivateButton: ButtonLike | null = null;
  private workButton: ButtonLike | null = null;
  private fishButton: ButtonLike | null = null;
  private recruitButton: ButtonLike | null = null;

  // Tab button references
  private tabButtons: Map<PcTab, ButtonLike> = new Map();

  // Page node references
  private pageNodes: Map<PcTab, NodeLike> = new Map();

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private currentTab: PcTab = 'HOME';
  private unsubs: Array<() => void> = [];
  private disposed = false;

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    console.log('[GameUIController] onLoad — starting runtime wiring');

    // Resolve facade from bootstrap singleton
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      console.error('[GameUIController] CocosBootstrapComponent.instance or facade is null — cannot wire UI');
      return;
    }
    this.facade = bootstrap.facade;

    // Resolve scene nodes
    this.resolveNodes();

    // Resolve and wire the craft page before binding its button.
    this.bindCraftPage();

    // Wire button click handlers
    this.wireButtons();

    // Wire tab navigation
    this.wireTabs();

    // Subscribe to facade UI events for data-driven refresh
    this.subscribeEvents();

    // Initial render
    this.refreshAll();

    // Set initial page visibility
    this.updatePageVisibility();

    console.log('[GameUIController] Runtime wiring complete');
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    this.unbindButtons();
    this.unbindTabs();
    this.dragController = null;
    this.mergeBoardView = null;
    this.mergeBoardRoot = null;
    this.craftPageContent = null;
    this.facade = null;
  }

  // ── Node Resolution ───────────────────────────────────────────────────────

  private resolveNodes(): void {
    // SafeAreaRoot is the component's own node
    this.safeAreaRoot = this.node as unknown as NodeLike;

    // Top-level children of SafeAreaRoot
    this.topHeader = this.findChild(this.safeAreaRoot, 'TopHeader');
    this.idleIncomePanel = this.findChild(this.safeAreaRoot, 'IdleIncomePanel');
    this.primaryActions = this.findChild(this.safeAreaRoot, 'PrimaryActions');
    this.bottomNavigation = this.findChild(this.safeAreaRoot, 'BottomNavigation');
    this.pageContainer = this.findChild(this.safeAreaRoot, 'PageContainer');

    this.craftPageContent = this.findChild(this.pageContainer, 'CraftPageContent');

    // PrimaryActions children: CultivateButton, WorkButton, FishButton
    if (this.primaryActions) {
      const cultivateNode = this.findChild(this.primaryActions, 'CultivateButton');
      const workNode = this.findChild(this.primaryActions, 'WorkButton');
      const fishNode = this.findChild(this.primaryActions, 'FishButton');

      this.cultivateButton = this.getButtonComponent(cultivateNode);
      this.workButton = this.getButtonComponent(workNode);
      this.fishButton = this.getButtonComponent(fishNode);
    }

    // BottomNavigation children: TabHome, TabTasks, TabCraft, TabPromotion, TabMore
    if (this.bottomNavigation) {
      for (const tab of PC_TABS) {
        const tabNodeName = TAB_BUTTON_NAMES[tab];
        const tabNode = this.findChild(this.bottomNavigation, tabNodeName);
        const btn = this.getButtonComponent(tabNode);
        if (btn) {
          this.tabButtons.set(tab, btn);
        }
      }
    }

    // PageContainer children: HomePageContent, TasksPageContent, etc.
    if (this.pageContainer) {
      for (const tab of PC_TABS) {
        const pageNodeName = TAB_NODE_NAMES[tab];
        const pageNode = this.findChild(this.pageContainer, pageNodeName);
        if (pageNode) {
          this.pageNodes.set(tab, pageNode);
        }
      }
    }

    // Log resolution results
    console.log('[GameUIController] Node resolution:', {
      topHeader: !!this.topHeader,
      idleIncomePanel: !!this.idleIncomePanel,
      primaryActions: !!this.primaryActions,
      bottomNavigation: !!this.bottomNavigation,
      pageContainer: !!this.pageContainer,
      cultivateButton: !!this.cultivateButton,
      workButton: !!this.workButton,
      fishButton: !!this.fishButton,
      tabButtons: this.tabButtons.size,
      pageNodes: this.pageNodes.size,
      craftPageContent: !!this.craftPageContent,
    });
  }

  // ── Button Wiring ─────────────────────────────────────────────────────────

  private wireButtons(): void {
    this.cultivateButton?.on?.('click', this.onCultivateClick, this);
    this.workButton?.on?.('click', this.onWorkClick, this);
    this.fishButton?.on?.('click', this.onFishClick, this);
    this.recruitButton?.on?.('click', this.onRecruitClick, this);
  }

  private unbindButtons(): void {
    this.cultivateButton?.off?.('click', this.onCultivateClick, this);
    this.workButton?.off?.('click', this.onWorkClick, this);
    this.fishButton?.off?.('click', this.onFishClick, this);
    this.recruitButton?.off?.('click', this.onRecruitClick, this);
  }

  // ── Tab Wiring ────────────────────────────────────────────────────────────

  private wireTabs(): void {
    for (const [tab, btn] of this.tabButtons) {
      btn.on?.('click', () => this.onTabClick(tab), this);
    }
  }

  private unbindTabs(): void {
    for (const [, btn] of this.tabButtons) {
      btn.off?.('click', () => {}, this);
    }
    this.tabButtons.clear();
  }

  // ── Event Subscription ────────────────────────────────────────────────────

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const category of REFRESH_CATEGORIES) {
      const unsub = this.facade.onUiEvent(category, () => {
        if (!this.disposed) this.refreshAll();
      });
      this.unsubs.push(unsub);
    }
  }

  private unsubscribeEvents(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }

  // ── Refresh ───────────────────────────────────────────────────────────────

  /** Bind the real Craft page board and connect drag/drop to the facade. */
  public bindCraftPage(): void {
    if (!this.facade) return;
    this.craftPageContent ??= this.findChild(this.pageContainer, 'CraftPageContent');
    this.recruitButton = this.getButtonComponent(this.findChild(this.craftPageContent, 'RecruitButton'));
    this.mergeBoardRoot = this.findChild(this.craftPageContent, 'MergeBoardRoot');
    if (!this.mergeBoardRoot) return;

    this.mergeBoardView = this.getOrAddComponent(this.mergeBoardRoot, MergeBoardView);
    if (!this.mergeBoardView) return;

    this.mergeBoardView.bindCells();
    this.dragController = new DragController({
      getWorker: (position) => this.workerAt(position),
      maxWorkerLevel: this.facade.queryBoard()?.maxWorkerLevel,
      onMove: (from, to) => {
        const result = this.facade?.move(from, to);
        if (!result?.success) throw new Error(result?.message ?? '移动失败');
        this.refreshBoard();
      },
      onMerge: (from, to) => {
        const result = this.facade?.merge(from, to);
        if (!result?.success) throw new Error(result?.message ?? '合成失败');
        const view = this.mergeBoardView;
        if (!view) return;
        view.animateMerge(from, to, () => {
          this.refreshBoard();
          this.dragController?.completeMerge();
        });
      },
    });
    this.mergeBoardView.bindDragController(this.dragController);
    this.refreshBoard();
  }

  /** Render all sixteen board cells from the current facade snapshot. */
  public refreshBoard(): void {
    if (!this.facade || !this.mergeBoardView) return;
    this.mergeBoardView.render(buildMergeBoardViewModel(this.facade));
  }

  private refreshAll(): void {
    if (!this.facade) return;

    // Build view models
    const hudVm = buildMainHUDViewModel(this.facade);
    const cultVm = buildCultivationViewModel(this.facade);
    const idleVm = buildIdleViewModel(this.facade);

    // Refresh MainHudComponent (already mounted on TopHeader)
    // It self-refreshes via its own event subscription, but we can force-refresh
    this.refreshMountedComponent(this.topHeader, 'MainHud');

    // Refresh IdleStatusPanelComponent (already mounted on IdleIncomePanel)
    this.refreshMountedComponent(this.idleIncomePanel, 'IdleStatusPanel');

    // Update button labels based on state
    this.updateButtonLabels(hudVm, cultVm, idleVm);

    // Update tab highlight
    this.updateTabHighlight();

  }

  /** Force-refresh a component that is already mounted on a node. */
  private refreshMountedComponent(node: NodeLike | null, ccclassName: string): void {
    if (!node?.getComponent) return;
    try {
      const comp = node.getComponent(ccclassName) as { refresh?: () => void } | null;
      if (comp?.refresh) {
        comp.refresh();
      }
    } catch {
      // Component not found or refresh not available — safe to ignore
    }
  }

  // ── Button Label Updates ──────────────────────────────────────────────────

  private updateButtonLabels(hudVm: MainHUDViewModel, cultVm: CultivationViewModel, idleVm: IdleViewModel): void {
    // Update CultivateButton label with cooldown info
    if (this.primaryActions) {
      const cultivateNode = this.findChild(this.primaryActions, 'CultivateButton');
      if (cultivateNode) {
        const label = this.getLabelComponent(cultivateNode);
        if (label) {
          if (cultVm.cooldownRemaining > 0) {
            label.string = `修炼 (${formatDuration(cultVm.cooldownRemaining)})`;
          } else if (cultVm.canCultivate) {
            label.string = '修炼';
          } else {
            label.string = '修炼 (道心不足)';
          }
        }
        // Update interactability
        if (this.cultivateButton) {
          this.cultivateButton.interactable = cultVm.canCultivate;
        }
      }

      // Update WorkButton/FishButton labels based on mode
      const workNode = this.findChild(this.primaryActions, 'WorkButton');
      const fishNode = this.findChild(this.primaryActions, 'FishButton');
      const workLabel = workNode ? this.getLabelComponent(workNode) : null;
      const fishLabel = fishNode ? this.getLabelComponent(fishNode) : null;

      if (workLabel) {
        workLabel.string = idleVm.isFishingMode ? '打工' : '打工 ✓';
      }
      if (fishLabel) {
        fishLabel.string = idleVm.isFishingMode ? '摸鱼 ✓' : '摸鱼';
      }

      // Update interactability — current mode button is less prominent
      if (this.workButton) {
        this.workButton.interactable = idleVm.isFishingMode;
      }
      if (this.fishButton) {
        this.fishButton.interactable = !idleVm.isFishingMode;
      }
    }
  }

  // ── Tab Highlight ─────────────────────────────────────────────────────────

  private updateTabHighlight(): void {
    for (const [tab, btn] of this.tabButtons) {
      const isActive = tab === this.currentTab;
      btn.interactable = !isActive;
    }
  }

  // ── Page Visibility ───────────────────────────────────────────────────────

  private updatePageVisibility(): void {
    for (const [tab, node] of this.pageNodes) {
      node.active = tab === this.currentTab;
    }
  }

  // ── Click Handlers ────────────────────────────────────────────────────────

  public readonly onRecruitClick = (): void => {
    if (!this.facade) return;
    const result = this.facade.recruit();
    if (result.success) this.refreshBoard();
  };

  private readonly onCultivateClick = (): void => {
    if (!this.facade) return;
    const result = this.facade.cultivate();
    if (result) {
      console.log('[GameUIController] Cultivate result:', result);
      // Immediate refresh to show cooldown
      this.refreshAll();
    }
  };

  private readonly onWorkClick = (): void => {
    if (!this.facade) return;
    const result = this.facade.changeWorkMode('WORK');
    console.log('[GameUIController] Switch to WORK:', result);
    this.refreshAll();
  };

  private readonly onFishClick = (): void => {
    if (!this.facade) return;
    const result = this.facade.changeWorkMode('FISHING');
    console.log('[GameUIController] Switch to FISHING:', result);
    this.refreshAll();
  };

  private onTabClick(tab: PcTab): void {
    if (this.currentTab === tab) return;
    console.log('[GameUIController] Tab switch:', this.currentTab, '→', tab);
    this.currentTab = tab;
    this.updatePageVisibility();
    this.updateTabHighlight();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private findChild(parent: NodeLike | null, name: string): NodeLike | null {
    if (!parent?.getChildByName) return null;
    return parent.getChildByName(name);
  }

  private getLabelComponent(node: NodeLike | null): TextLike | null {
    if (!node?.getComponent) return null;
    try {
      return node.getComponent('cc.Label') as TextLike | null;
    } catch {
      return null;
    }
  }

  private getButtonComponent(node: NodeLike | null): ButtonLike | null {
    if (!node?.getComponent) return null;
    try {
      return node.getComponent('cc.Button') as ButtonLike | null;
    } catch {
      return null;
    }
  }

  private getOrAddComponent<T>(node: NodeLike, type: new (...args: never[]) => T): T | null {
    try {
      const existing = node.getComponent?.(type) as T | null | undefined;
      if (existing) return existing;
      return node.addComponent?.(type) as T | null ?? null;
    } catch {
      return null;
    }
  }

  private workerAt(position: BoardPosition): { id: string; level: number } | undefined {
    const cell = this.facade?.queryBoard()?.cells.find((candidate) =>
      candidate.row === position.row && candidate.column === position.column);
    const worker = cell?.occupant;
    return worker ? { id: worker.id, level: worker.level } : undefined;
  }
}
