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
 *   │   │   ├── CraftRecipeList
 *   │   │   │   └── CraftRecipeRow00 ... CraftRecipeRow05
 *   │   ├── PromotionPageContent
 *   │   └── MorePageContent
 *   ├── ModalLayer
 *   ├── ToastLayer
 *   └── TutorialLayer
 */

import { _decorator, Component } from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { UiEventCategory } from '../facade/ui-event-types';
import type { MainHUDViewModel, CultivationViewModel, IdleViewModel } from './view-models';
import { buildMainHUDViewModel, buildCultivationViewModel, buildIdleViewModel, buildCraftViewModel } from './view-models';
import { formatNumber, formatDuration } from './number-formatter';

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

const MAX_CRAFT_RECIPE_ROWS = 6;

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('GameUIController')
export class GameUIController extends Component {
  // ── Resolved node references ──────────────────────────────────────────────

  private safeAreaRoot: NodeLike | null = null;
  private topHeader: NodeLike | null = null;
  private characterArea: NodeLike | null = null;
  private idleIncomePanel: NodeLike | null = null;
  private primaryActions: NodeLike | null = null;
  private bottomNavigation: NodeLike | null = null;
  private pageContainer: NodeLike | null = null;
  private craftPageContent: NodeLike | null = null;
  private craftRecipeList: NodeLike | null = null;
  private mergeBoardRoot: NodeLike | null = null;

  private careerSummaryLabel: TextLike | null = null;
  private resourceSummaryLabel: TextLike | null = null;
  private characterNameLabel: TextLike | null = null;
  private characterStatusLabel: TextLike | null = null;
  private workStatusLabel: TextLike | null = null;
  private cultivationResourceLabel: TextLike | null = null;
  private salaryResourceLabel: TextLike | null = null;
  private performanceResourceLabel: TextLike | null = null;
  private mindResourceLabel: TextLike | null = null;

  // Button references
  private cultivateButton: ButtonLike | null = null;
  private workButton: ButtonLike | null = null;
  private fishButton: ButtonLike | null = null;
  private craftButtons = new Map<ButtonLike, () => void>();

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
    this.mergeBoardRoot = null;
    this.craftPageContent = null;
    this.craftRecipeList = null;
    this.careerSummaryLabel = null;
    this.resourceSummaryLabel = null;
    this.characterNameLabel = null;
    this.characterStatusLabel = null;
    this.workStatusLabel = null;
    this.cultivationResourceLabel = null;
    this.salaryResourceLabel = null;
    this.performanceResourceLabel = null;
    this.mindResourceLabel = null;
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

    this.careerSummaryLabel = this.findLabel(this.findChild(this.topHeader, 'CareerSummaryLabel'));
    const resourceBar = this.findChild(this.safeAreaRoot, 'ResourceBar');
    this.resourceSummaryLabel = this.findLabel(resourceBar?.getChildByName?.('ResourceSummaryLabel') ?? null);
    this.cultivationResourceLabel = this.findLabel(this.findChild(resourceBar, 'ResourceCultivationChip'));
    this.salaryResourceLabel = this.findLabel(this.findChild(resourceBar, 'ResourceSalaryChip'));
    this.performanceResourceLabel = this.findLabel(this.findChild(resourceBar, 'ResourcePerformanceChip'));
    this.mindResourceLabel = this.findLabel(this.findChild(resourceBar, 'ResourceMindChip'));
    const characterArea = this.findChild(this.safeAreaRoot, 'CharacterArea');
    this.characterNameLabel = this.findLabel(characterArea?.getChildByName?.('CharacterNameLabel') ?? null);
    this.characterStatusLabel = this.findLabel(characterArea?.getChildByName?.('CharacterStatusLabel') ?? null);
    const idlePanel = this.findChild(this.safeAreaRoot, 'IdleIncomePanel');
    this.characterArea = this.findChild(this.safeAreaRoot, 'CharacterArea');
    this.workStatusLabel = this.findLabel(idlePanel?.getChildByName?.('WorkStatusLabel') ?? null);

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
      craftRecipeList: !!this.craftRecipeList,
    });
  }

  // ── Button Wiring ─────────────────────────────────────────────────────────

  private wireButtons(): void {
    this.cultivateButton?.on?.('click', this.onCultivateClick, this);
    this.workButton?.on?.('click', this.onWorkClick, this);
    this.fishButton?.on?.('click', this.onFishClick, this);
  }

  private unbindButtons(): void {
    this.cultivateButton?.off?.('click', this.onCultivateClick, this);
    this.workButton?.off?.('click', this.onWorkClick, this);
    this.fishButton?.off?.('click', this.onFishClick, this);
    for (const [button, handler] of this.craftButtons) {
      button.off?.('click', handler, this);
    }
    this.craftButtons.clear();
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

  /** Bind the craft presentation to the existing visual slot layout. */
  public bindCraftPage(): void {
    this.craftPageContent ??= this.findChild(this.pageContainer, 'CraftPageContent');
    this.craftRecipeList = this.findChild(this.craftPageContent, 'CraftRecipeList');
    this.mergeBoardRoot = this.findChild(this.craftPageContent, 'MergeBoardRoot');
    const legacyRecruitButton = this.findChild(this.craftPageContent, 'RecruitButton');
    // The scene node is retained for the scene contract, but is not a craft action.
    if (legacyRecruitButton) legacyRecruitButton.active = false;
    // The board remains available to later phases but is not part of PC V1 craft presentation.
    if (this.mergeBoardRoot) this.mergeBoardRoot.active = false;
    this.refreshCraftPage();
  }

  /** Render recipe materials, products, status and action affordances. */
  public refreshCraftPage(): void {
    if (!this.facade || !this.craftRecipeList) return;

    const viewModel = buildCraftViewModel(this.facade);
    this.clearCraftButtons();
    for (let index = 0; index < MAX_CRAFT_RECIPE_ROWS; index += 1) {
      const node = this.findChild(this.craftRecipeList, `CraftRecipeRow${index.toString().padStart(2, '0')}`);
      if (!node) continue;

      const recipe = viewModel.recipes[index];
      const label = this.findLabel(node);
      const button = this.getButtonComponent(node);
      if (!recipe) {
        node.active = false;
        if (button) button.interactable = false;
        continue;
      }

      node.active = true;
      if (label) {
        const materials = [
          recipe.costCultivation > 0 ? `修为 ${formatNumber(recipe.costCultivation)}` : '',
          recipe.costSpiritStones > 0 ? `灵石 ${formatNumber(recipe.costSpiritStones)}` : '',
        ].filter(Boolean).join(' / ') || '免费';
        const action = recipe.canCraft ? '合成' : (recipe.reason || '不可用');
        label.string = `${recipe.name}  |  材料: ${materials}  |  产物: ${describeCraftEffect(recipe.effect)}  |  [${action}]`;
      }

      if (button) {
        button.interactable = recipe.canCraft;
        this.bindCraftButton(button, recipe.id);
      }
    }
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
    this.refreshHomePresentation(hudVm, idleVm);

    // Update tab highlight
    this.updateTabHighlight();
    this.refreshCraftPage();
  }

  private refreshHomePresentation(hudVm: MainHUDViewModel, idleVm: IdleViewModel): void {
    if (!this.facade) return;
    const snapshot = this.facade.snapshot();
    this.setText(this.careerSummaryLabel, `${hudVm.realm} · ${hudVm.careerName}`);
    this.setText(
      this.cultivationResourceLabel,
      `修为\n${formatNumber(hudVm.cultivationExp)}/${formatNumber(hudVm.cultivationRequired)}`,
    );
    this.setText(this.salaryResourceLabel, `工资\n${formatNumber(hudVm.salary)}`);
    this.setText(this.performanceResourceLabel, `绩效\n${formatNumber(hudVm.performance)}`);
    this.setText(this.mindResourceLabel, `道心\n${formatNumber(hudVm.mind)}/${formatNumber(hudVm.maxMind)}`);
    this.setText(
      this.resourceSummaryLabel,
      `工资 ${formatNumber(hudVm.salary)}  ·  灵石 ${formatNumber(snapshot.spiritStones)}  ·  修为 ${formatNumber(hudVm.cultivationExp)}/${formatNumber(hudVm.cultivationRequired)}  ·  道心 ${formatNumber(hudVm.mind)}/${formatNumber(hudVm.maxMind)}`,
    );
    this.setText(this.characterNameLabel, `${hudVm.careerName} · ${hudVm.realm}`);
    this.setText(this.characterStatusLabel, `${hudVm.sectName} · ${hudVm.officeName} · ${hudVm.talentName}`);
    this.setText(
      this.workStatusLabel,
      `${idleVm.isFishingMode ? '带薪摸鱼' : '认真上班'}  ·  工资 ×${idleVm.salaryEfficiency.toFixed(1)}  ·  绩效 ×${idleVm.performanceEfficiency.toFixed(1)}  ·  道心恢复 ×${idleVm.mindRecoveryEfficiency.toFixed(1)}`,
    );
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
        const label = this.findLabel(cultivateNode);
        if (label) {
          if (cultVm.cooldownRemaining > 0) {
            label.string = `修炼一次 (${formatDuration(cultVm.cooldownRemaining)})`;
          } else if (cultVm.canCultivate) {
            label.string = '修炼一次';
          } else {
            label.string = '修炼一次 (道心不足)';
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
      const workLabel = this.findLabel(workNode);
      const fishLabel = this.findLabel(fishNode);

      if (workLabel) {
        workLabel.string = idleVm.isFishingMode ? '努力工作' : '努力工作 ✓';
      }
      if (fishLabel) {
        fishLabel.string = idleVm.isFishingMode ? '摸鱼恢复 ✓' : '摸鱼恢复';
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
    const home = this.currentTab === 'HOME';
    if (this.characterArea) this.characterArea.active = home;
    if (this.idleIncomePanel) this.idleIncomePanel.active = home;
    if (this.primaryActions) this.primaryActions.active = home;
  }

  // ── Click Handlers ────────────────────────────────────────────────────────

  public readonly onCraftClick = (recipeId: string): void => {
    if (!this.facade) return;
    const result = this.facade.craft(recipeId);
    if (result.success) this.refreshAll();
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

  private findLabel(node: NodeLike | null): TextLike | null {
    for (const child of node?.children ?? []) {
      const label = this.findLabel(child);
      if (label) return label;
    }
    return this.getLabelComponent(node);
  }

  private bindCraftButton(button: ButtonLike, recipeId: string): void {
    const previous = this.craftButtons.get(button);
    if (previous) button.off?.('click', previous, this);
    const handler = () => this.onCraftClick(recipeId);
    button.on?.('click', handler, this);
    this.craftButtons.set(button, handler);
  }

  private clearCraftButtons(): void {
    for (const [button, handler] of this.craftButtons) {
      button.off?.('click', handler, this);
    }
    this.craftButtons.clear();
  }

  private setText(label: TextLike | null, value: string): void {
    if (label) label.string = value;
  }
}

function describeCraftEffect(effect: Readonly<Record<string, number>>): string {
  const labels: Record<string, string> = {
    cultivation: '修为',
    cultivationExp: '修为',
    spiritStones: '灵石',
    salary: '工资',
    mind: '道心',
    mindValue: '道心',
    performance: '绩效',
    kpi: '绩效',
  };
  return Object.entries(effect)
    .map(([key, value]) => `${labels[key] ?? key}${value >= 0 ? '+' : ''}${formatNumber(value)}`)
    .join(' ') || '无';
}
