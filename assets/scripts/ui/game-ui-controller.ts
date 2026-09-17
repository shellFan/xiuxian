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
import * as Cocos from 'cc';
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
  on?: ButtonLike['on'];
  off?: ButtonLike['off'];
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

const PAGE_TITLE_NODE_NAMES: Partial<Record<PcTab, string>> = {
  CRAFT: 'CraftHeader',
  TASKS: 'TasksPageContentTitleLabel',
  PROMOTION: 'PromotionPageContentTitleLabel',
  MORE: 'MorePageContentTitleLabel',
};

const PAGE_TITLE_TEXT: Partial<Record<PcTab, string>> = {
  CRAFT: '合成工坊',
  TASKS: '任务',
  PROMOTION: '晋升',
  MORE: '更多',
};

const TASK_TYPE_LABELS: Record<string, string> = {
  DAILY: '日常',
  WORK: '工作',
  CULTIVATION: '修炼',
  EVENT: '事件',
};

const MAX_TASK_CARDS = 4;
const TASK_UPDATE_INTERVAL = 1;
const PROMOTION_OPTION_INDEX = 0;

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
  private resourceBar: NodeLike | null = null;
  private characterArea: NodeLike | null = null;
  private idleIncomePanel: NodeLike | null = null;
  private primaryActions: NodeLike | null = null;
  private bottomNavigation: NodeLike | null = null;
  private pageContainer: NodeLike | null = null;
  private craftPageContent: NodeLike | null = null;
  private craftRecipeList: NodeLike | null = null;
  private mergeBoardRoot: NodeLike | null = null;
  private tasksPageContent: NodeLike | null = null;
  private tasksAvailableContainer: NodeLike | null = null;
  private promotionPageContent: NodeLike | null = null;
  private promotionOption: NodeLike | null = null;

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
  private taskButtons = new Map<ButtonLike, () => void>();
  private promotionButtons = new Map<ButtonLike, () => void>();

  // Tab button references
  private tabButtons: Map<PcTab, ButtonLike> = new Map();
  private tabHandlers: Map<PcTab, () => void> = new Map();

  // Page node references
  private pageNodes: Map<PcTab, NodeLike> = new Map();
  private pageTitleLabels: Map<PcTab, TextLike> = new Map();

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private currentTab: PcTab = 'HOME';
  private unsubs: Array<() => void> = [];
  private disposed = false;
  private taskUpdateTimer = 0;
  private readonly runtimeButtons = new WeakMap<NodeLike, ButtonLike>();
  private settingsButton: ButtonLike | null = null;
  private readonly resizeHomeViewport = () => {
    if (typeof document === 'undefined') return;
    const frame = document.getElementById('GameDiv');
    const v = (Cocos as unknown as {view?: {setFrameSize(w:number,h:number):void;setDesignResolutionSize(w:number,h:number,p:number):void}}).view;
    if (frame && v) {
      const width = Math.min(window.innerWidth, window.innerHeight * 720 / 1280, 490);
      const height = width * 1280 / 720;
      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;
      v.setFrameSize(width, height);
      v.setDesignResolutionSize(720,1280,2);
    }
  };
  private readonly openHomeSettings = () => {
    this.onTabClick('MORE');
    const page = this.findChild(this.pageContainer, 'MorePageContent');
    (page?.getComponent?.('MorePage') as {switchTab?(tab: string): void} | undefined)?.switchTab?.('SETTINGS');
  };

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    (Cocos as unknown as {view?: {resizeWithBrowserSize(enable: boolean): void}}).view?.resizeWithBrowserSize(true);
    this.resizeHomeViewport();
    if (typeof window !== 'undefined') window.addEventListener('resize', this.resizeHomeViewport);
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

    // Resolve and wire the task and promotion pages against existing scene nodes.
    this.bindTaskPage();
    this.bindPromotionPage();

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
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.resizeHomeViewport);
    this.disposed = true;
    this.unsubscribeEvents();
    this.unbindButtons();
    this.unbindTabs();
    this.mergeBoardRoot = null;
    this.craftPageContent = null;
    this.craftRecipeList = null;
    this.tasksPageContent = null;
    this.tasksAvailableContainer = null;
    this.promotionPageContent = null;
    this.promotionOption = null;
    this.resourceBar = null;
    this.tabHandlers.clear();
    this.pageTitleLabels.clear();
    this.careerSummaryLabel = null;
    this.resourceSummaryLabel = null;
    this.characterNameLabel = null;
    this.characterStatusLabel = null;
    this.workStatusLabel = null;
    this.cultivationResourceLabel = null;
    this.salaryResourceLabel = null;
    this.performanceResourceLabel = null;
    this.mindResourceLabel = null;
    this.taskUpdateTimer = 0;
    this.facade = null;
  }

  protected update(dt: number): void {
    if (!this.facade || this.disposed) return;

    this.taskUpdateTimer += dt;
    if (this.taskUpdateTimer < TASK_UPDATE_INTERVAL) return;

    this.taskUpdateTimer = 0;
    this.facade.tickTasks();
    this.refreshTaskPage();
  }

  // ── Node Resolution ───────────────────────────────────────────────────────

  private resolveNodes(): void {
    // SafeAreaRoot is the component's own node
    this.safeAreaRoot = this.node as unknown as NodeLike;

    // Top-level children of SafeAreaRoot
    this.topHeader = this.findChild(this.safeAreaRoot, 'TopHeader');
    this.resourceBar = this.findChild(this.safeAreaRoot, 'ResourceBar');
    this.idleIncomePanel = this.findChild(this.safeAreaRoot, 'IdleIncomePanel');
    this.primaryActions = this.findChild(this.safeAreaRoot, 'PrimaryActions');
    this.bottomNavigation = this.findChild(this.safeAreaRoot, 'BottomNavigation');
    this.pageContainer = this.findChild(this.safeAreaRoot, 'PageContainer');

    this.careerSummaryLabel = this.findLabel(this.findChild(this.topHeader, 'CareerSummaryLabel'));
    this.resourceSummaryLabel = this.findLabel(this.resourceBar?.getChildByName?.('ResourceSummaryLabel') ?? null);
    const cultivationChip = this.findChild(this.resourceBar, 'ResourceCultivationChip');
    const salaryChip = this.findChild(this.resourceBar, 'ResourceSalaryChip');
    const performanceChip = this.findChild(this.resourceBar, 'ResourcePerformanceChip');
    const mindChip = this.findChild(this.resourceBar, 'ResourceMindChip');
    this.cultivationResourceLabel = this.findLabel(this.findChild(cultivationChip, 'CultivationResourceLabel') ?? cultivationChip);
    this.salaryResourceLabel = this.findLabel(this.findChild(salaryChip, 'SalaryResourceLabel') ?? salaryChip);
    this.performanceResourceLabel = this.findLabel(this.findChild(performanceChip, 'PerformanceResourceLabel') ?? performanceChip);
    this.mindResourceLabel = this.findLabel(this.findChild(mindChip, 'MindResourceLabel') ?? mindChip);
    const characterArea = this.findChild(this.safeAreaRoot, 'CharacterArea');
    this.characterNameLabel = this.findLabel(characterArea?.getChildByName?.('CharacterNameLabel') ?? null);
    this.characterStatusLabel = this.findLabel(characterArea?.getChildByName?.('CharacterStatusLabel') ?? null);
    const idlePanel = this.findChild(this.safeAreaRoot, 'IdleIncomePanel');
    this.characterArea = this.findChild(this.safeAreaRoot, 'CharacterArea');
    this.workStatusLabel = this.findLabel(idlePanel?.getChildByName?.('WorkStatusLabel') ?? null);

    this.craftPageContent = this.findChild(this.pageContainer, 'CraftPageContent');
    this.tasksPageContent = this.findChild(this.pageContainer, 'TasksPageContent');
    this.tasksAvailableContainer = this.findChild(this.tasksPageContent, 'TasksAvailableContainer');
    this.promotionPageContent = this.findChild(this.pageContainer, 'PromotionPageContent');
    this.promotionOption = this.findChild(
      this.promotionPageContent,
      'PromotionOption_' + PROMOTION_OPTION_INDEX,
    );

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
          const titleNodeName = PAGE_TITLE_NODE_NAMES[tab];
          const titleText = PAGE_TITLE_TEXT[tab];
          if (titleNodeName && titleText) {
            const titleLabel = this.findLabel(this.findChild(pageNode, titleNodeName));
            if (titleLabel) this.pageTitleLabels.set(tab, titleLabel);
          }
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
      resourceBar: !!this.resourceBar,
      cultivateButton: !!this.cultivateButton,
      workButton: !!this.workButton,
      fishButton: !!this.fishButton,
      tabButtons: this.tabButtons.size,
      pageNodes: this.pageNodes.size,
      craftPageContent: !!this.craftPageContent,
      craftRecipeList: !!this.craftRecipeList,
      pageTitleLabels: this.pageTitleLabels.size,
      tasksAvailableContainer: !!this.tasksAvailableContainer,
      promotionOption: !!this.promotionOption,
    });
  }

  // ── Button Wiring ─────────────────────────────────────────────────────────

  private wireButtons(): void {
    this.settingsButton = this.getButtonComponent(this.findChild(this.topHeader, 'HomeSettingsButton'));
    this.settingsButton?.on?.('click', this.openHomeSettings, this);
    this.cultivateButton?.on?.('click', this.onCultivateClick, this);
    this.workButton?.on?.('click', this.onWorkClick, this);
    this.fishButton?.on?.('click', this.onFishClick, this);
  }

  private unbindButtons(): void {
    this.settingsButton?.off?.('click', this.openHomeSettings, this);
    this.cultivateButton?.off?.('click', this.onCultivateClick, this);
    this.workButton?.off?.('click', this.onWorkClick, this);
    this.fishButton?.off?.('click', this.onFishClick, this);
    for (const [button, handler] of this.craftButtons) {
      button.off?.('click', handler, this);
    }
    this.craftButtons.clear();
    this.clearTaskButtons();
    this.clearPromotionButtons();
  }

  // ── Tab Wiring ────────────────────────────────────────────────────────────

  private wireTabs(): void {
    for (const [tab, btn] of this.tabButtons) {
      const handler = () => this.onTabClick(tab);
      btn.on?.('click', handler, this);
      this.tabHandlers.set(tab, handler);
    }
  }

  private unbindTabs(): void {
    for (const [tab, btn] of this.tabButtons) {
      const handler = this.tabHandlers.get(tab);
      if (handler) btn.off?.('click', handler, this);
    }
    this.tabHandlers.clear();
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

  /** Bind the existing task cards to the facade task API. */
  public bindTaskPage(): void {
    this.tasksPageContent ??= this.findChild(this.pageContainer, 'TasksPageContent');
    this.tasksAvailableContainer ??= this.findChild(this.tasksPageContent, 'TasksAvailableContainer');
    this.refreshTaskPage();
  }

  /** Refresh task card copy and the stateful StartButton affordance. */
  public refreshTaskPage(): void {
    if (!this.facade || !this.tasksAvailableContainer) return;

    const configs = this.facade.queryTaskConfigs();
    const activeTasks = this.facade.queryActiveTasks();
    const activeCount = activeTasks.filter((task) => !task.claimed).length;
    const canStartMore = activeCount < 3;
    this.clearTaskButtons();

    for (let index = 0; index < MAX_TASK_CARDS; index += 1) {
      const node = this.findChild(this.tasksAvailableContainer, 'AvailableTask_' + index);
      if (!node) continue;

      const config = configs[index];
      if (!config) {
        node.active = false;
        continue;
      }

      node.active = true;
      const task = activeTasks.find((candidate) => candidate.taskId === config.id && !candidate.claimed);
      const nameLabel = this.findLabel(this.findChild(node, 'NameLabel'));
      const descLabel = this.findLabel(this.findChild(node, 'DescLabel'));
      const startButton = this.getButtonComponent(this.findChild(node, 'StartButton'));
      const startButtonLabel = this.findLabel(this.findChild(node, 'StartButtonLabel'));

      this.setText(nameLabel, (TASK_TYPE_LABELS[config.type] ?? config.type) + ' · ' + config.name);

      if (task) {
        const remaining = this.facade.queryTaskRemaining(task.taskId);
        this.setText(
          descLabel,
          task.completed
            ? config.description + ' · 已完成，可领取'
            : config.description + ' · 进行中，剩余 ' + formatDuration(remaining),
        );
      } else {
        this.setText(
          descLabel,
          config.description + ' · ' + formatDuration(config.durationSeconds) + ' · ' + describeTaskRewards(config),
        );
      }

      if (!startButton) continue;

      if (task?.completed) {
        startButton.interactable = true;
        this.setText(startButtonLabel, '领取');
        this.bindTaskButton(startButton, () => this.onClaimTaskClick(task.taskId));
      } else if (task) {
        startButton.interactable = false;
        this.setText(startButtonLabel, '进行中');
      } else {
        startButton.interactable = canStartMore;
        this.setText(startButtonLabel, '开始');
        this.bindTaskButton(startButton, () => this.onStartTaskClick(config.id));
      }
    }
  }

  /** Bind the existing promotion option to the first real facade option. */
  public bindPromotionPage(): void {
    this.promotionPageContent ??= this.findChild(this.pageContainer, 'PromotionPageContent');
    this.promotionOption ??= this.findChild(
      this.promotionPageContent,
      'PromotionOption_' + PROMOTION_OPTION_INDEX,
    );
    this.refreshPromotionPage();
  }

  /** Refresh promotion status and the existing option/button presentation. */
  public refreshPromotionPage(): void {
    if (!this.facade || !this.promotionPageContent) return;

    const career = this.facade.queryCareer();
    const snapshot = this.facade.snapshot();
    const check = this.facade.queryPromotionCheck();
    const options = this.facade.queryPromotionOptions();
    const option = options[PROMOTION_OPTION_INDEX];
    const statusCard = this.findChild(this.promotionPageContent, 'PromotionStatusCard');
    const currentRankLabel = this.findLabel(this.findChild(statusCard, 'CurrentRankLabel'));
    const promotionProgressLabel = this.findLabel(this.findChild(statusCard, 'PromotionProgressLabel'));
    const promotionConditionLabel = this.findLabel(this.findChild(statusCard, 'PromotionConditionLabel'));

    this.setText(currentRankLabel, '当前职级\nLv.' + career.level + ' · ' + career.name);
    const progress = career.requiredExp > 0
      ? Math.min(1, snapshot.cultivationExp / career.requiredExp)
      : 1;
    this.setText(
      promotionProgressLabel,
      '晋升进度 ' + formatNumber(snapshot.cultivationExp) + '/' + formatNumber(career.requiredExp) + ' · ' + Math.floor(progress * 100) + '%',
    );
    this.setText(
      promotionConditionLabel,
      check.allowed ? '晋升条件已满足' : '暂不可晋升 · ' + check.reason,
    );

    this.clearPromotionButtons();
    if (!this.promotionOption || !option) {
      if (this.promotionOption) this.promotionOption.active = false;
      return;
    }

    this.promotionOption.active = true;
    this.setText(this.findLabel(this.findChild(this.promotionOption, 'NameLabel')), option.name);
    this.setText(this.findLabel(this.findChild(this.promotionOption, 'DescLabel')), option.description);

    const promoteButton = this.getButtonComponent(this.findChild(this.promotionOption, 'PromoteButton'));
    if (!promoteButton) return;
    promoteButton.interactable = check.allowed;
    this.setText(
      this.findLabel(this.findChild(this.promotionOption, 'PromoteButtonLabel')),
      check.allowed ? '晋升' : '条件不足',
    );
    this.bindPromotionButton(promoteButton, () => this.onPromoteClick(option.id));
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
    this.refreshPageTitles();

    // Update tab highlight
    this.updateTabHighlight();
    this.refreshCraftPage();
    this.refreshTaskPage();
    this.refreshPromotionPage();
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

  private refreshPageTitles(): void {
    for (const [tab, label] of this.pageTitleLabels) {
      const title = PAGE_TITLE_TEXT[tab];
      if (title) label.string = title;
    }
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
    if (this.topHeader) this.topHeader.active = home;
    if (this.resourceBar) this.resourceBar.active = home;
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

  private onStartTaskClick(configId: string): void {
    if (!this.facade || this.disposed) return;
    const result = this.facade.startTask(configId);
    if (!result.success) {
      console.warn('[GameUIController] Start task failed:', result.reason);
    }
    this.refreshTaskPage();
  }

  private onClaimTaskClick(taskId: string): void {
    if (!this.facade || this.disposed) return;
    const result = this.facade.claimTask(taskId);
    if (!result.success) {
      console.warn('[GameUIController] Claim task failed:', result.reason);
    }
    this.refreshTaskPage();
  }

  private onPromoteClick(optionId: string): void {
    if (!this.facade || this.disposed) return;
    try {
      const result = this.facade.promote(optionId);
      if (!result.success) {
        console.warn('[GameUIController] Promotion failed:', result.reason);
      }
    } catch (error: unknown) {
      console.warn(
        '[GameUIController] Promotion failed:',
        error instanceof Error ? error.message : '渡劫失败',
      );
    }
    this.refreshPromotionPage();
    this.refreshAll();
  }

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
      const button = node.getComponent('cc.Button') as ButtonLike | null;
      if (!button || button.on || !node.on) return button;
      // Cocos Button emits clicks on its Node, not on the component.
      let bridge = this.runtimeButtons.get(node);
      if (!bridge) {
        bridge = {
          on: (event, callback, target) => node.on?.(event, callback, target),
          off: (event, callback, target) => node.off?.(event, callback, target),
          get interactable() { return button.interactable; },
          set interactable(value) { button.interactable = value; },
        };
        this.runtimeButtons.set(node, bridge);
      }
      return bridge;
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

  private bindTaskButton(button: ButtonLike, handler: () => void): void {
    const previous = this.taskButtons.get(button);
    if (previous) button.off?.('click', previous, this);
    button.on?.('click', handler, this);
    this.taskButtons.set(button, handler);
  }

  private clearTaskButtons(): void {
    for (const [button, handler] of this.taskButtons) {
      button.off?.('click', handler, this);
    }
    this.taskButtons.clear();
  }

  private bindPromotionButton(button: ButtonLike, handler: () => void): void {
    const previous = this.promotionButtons.get(button);
    if (previous) button.off?.('click', previous, this);
    button.on?.('click', handler, this);
    this.promotionButtons.set(button, handler);
  }

  private clearPromotionButtons(): void {
    for (const [button, handler] of this.promotionButtons) {
      button.off?.('click', handler, this);
    }
    this.promotionButtons.clear();
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

function describeTaskRewards(config: {
  readonly rewardSalary: number;
  readonly rewardCultivation: number;
  readonly rewardSpiritStones: number;
}): string {
  return [
    config.rewardSalary > 0 ? '工资 +' + formatNumber(config.rewardSalary) : '',
    config.rewardCultivation > 0 ? '修为 +' + formatNumber(config.rewardCultivation) : '',
    config.rewardSpiritStones > 0 ? '灵石 +' + formatNumber(config.rewardSpiritStones) : '',
  ].filter(Boolean).join(' / ') || '无奖励';
}
