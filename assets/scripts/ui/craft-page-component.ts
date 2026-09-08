/**
 * CraftPageComponent — PC V1 craft (炼制) page.
 *
 * Displays all craft recipes with their costs, effects, and unlock status.
 * Players can craft items if they meet the requirements (career level,
 * cultivation, spirit stones, and craft count limits).
 *
 * Layout (750×1334 design):
 *   ┌─────────────────────────────────────┐
 *   │ 炼制                                │
 *   │ 修为: 1500  灵石: 30  总炼制: 3     │
 *   │ ┌─ Recipe List ──────────────────┐ │
 *   │ │ 🧪 灵参丹  ⚡100 💰0 → 修为+50  │ │
 *   │ │   [炼制] 已炼:2/∞              │ │
 *   │ │ 🔮 聚灵丹  ⚡500 💰10 → 修为+200│ │
 *   │ │   [职级不足] 需Lv.2            │ │
 *   │ │ ...                            │ │
 *   │ └─────────────────────────────────┘ │
 *   └─────────────────────────────────────┘
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import { SceneBindingComponent } from './scene-binding-component';
import type { GameFacade } from '../facade/game-facade';
import type { CraftViewModel, CraftRecipeViewModel } from './view-models';
import { buildCraftViewModel } from './view-models';
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

// ── Recipe type icons ────────────────────────────────────────────────────────

const RECIPE_TYPE_ICONS: Record<string, string> = {
  pill: '🧪',
  talisman: '📜',
  artifact: '🔮',
};

function getRecipeIcon(id: string): string {
  if (id.startsWith('pill_')) return RECIPE_TYPE_ICONS.pill;
  if (id.startsWith('talisman_')) return RECIPE_TYPE_ICONS.talisman;
  if (id.startsWith('artifact_')) return RECIPE_TYPE_ICONS.artifact;
  return '⚗️';
}

// ── Effect description helper ────────────────────────────────────────────────

const EFFECT_LABELS: Record<string, string> = {
  cultivationExp: '修为',
  spiritStones: '灵石',
  salary: '工资',
  mindValue: '道心',
  kpi: '绩效',
};

function describeEffect(effect: Readonly<Record<string, number>>): string {
  return Object.entries(effect)
    .map(([key, value]) => {
      const label = EFFECT_LABELS[key] ?? key;
      const sign = value >= 0 ? '+' : '';
      return `${label}${sign}${value}`;
    })
    .join(' ');
}

// ── Refresh categories ───────────────────────────────────────────────────────

const CRAFT_REFRESH_CATEGORIES: readonly UiEventCategory[] = [
  'STATE_CHANGED',
  'RESOURCE_CHANGED',
  'CAREER_CHANGED',
  'BUFF_CHANGED',
];

// ── Max recipe slots ─────────────────────────────────────────────────────────

const MAX_RECIPE_SLOTS = 8;

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('CraftPage')
export class CraftPageComponent extends Component {
  // ── Scene-bound properties (set in Cocos Editor) ──────────────────────────

  /** Title label (e.g., "炼制") */
  @property(resolveCocosType('Label'))
  public titleLabel?: TextLike;

  /** Player cultivation display label */
  @property(resolveCocosType('Label'))
  public cultivationLabel?: TextLike;

  /** Player spirit stones display label */
  @property(resolveCocosType('Label'))
  public spiritStonesLabel?: TextLike;

  /** Total crafted count label */
  @property(resolveCocosType('Label'))
  public totalCraftedLabel?: TextLike;

  /** Container node for recipe items */
  @property(resolveCocosType('Node'))
  public recipesContainer?: NodeLike;

  /** Empty state label when no recipes available */
  @property(resolveCocosType('Label'))
  public emptyLabel?: TextLike;

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private viewModel: CraftViewModel | null = null;
  private unsubs: Array<() => void> = [];
  private disposed = false;

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('CraftPageComponent requires CocosBootstrapComponent with facade');
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

  // ── Public API ────────────────────────────────────────────────────────────

  /** Force refresh from facade state. */
  public refresh(): void {
    if (!this.facade || this.disposed) return;
    this.viewModel = buildCraftViewModel(this.facade);
    this.render(this.viewModel);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private render(vm: CraftViewModel): void {
    // Title
    if (this.titleLabel) {
      this.titleLabel.string = '炼制';
    }

    // Player resources
    if (this.cultivationLabel) {
      this.cultivationLabel.string = `修为: ${formatNumber(vm.playerCultivation)}`;
    }
    if (this.spiritStonesLabel) {
      this.spiritStonesLabel.string = `灵石: ${formatNumber(vm.playerSpiritStones)}`;
    }
    if (this.totalCraftedLabel) {
      this.totalCraftedLabel.string = `总炼制: ${vm.totalCrafted}`;
    }

    // Empty state
    if (this.emptyLabel) {
      this.emptyLabel.active = vm.recipes.length === 0;
      if (this.emptyLabel.active) {
        this.emptyLabel.string = '暂无可用配方';
      }
    }

    // Render recipe list
    this.renderRecipes(vm);
  }

  private renderRecipes(vm: CraftViewModel): void {
    if (!this.recipesContainer) return;

    // Render each recipe slot
    for (let i = 0; i < vm.recipes.length && i < MAX_RECIPE_SLOTS; i++) {
      const recipe = vm.recipes[i];
      const nodeName = `CraftRecipe_${i}`;
      const node = this.recipesContainer.getChildByName?.(nodeName);
      if (node) {
        node.active = true;
        this.renderRecipeNode(node, recipe);
      }
    }

    // Hide unused slots
    for (let i = vm.recipes.length; i < MAX_RECIPE_SLOTS; i++) {
      const nodeName = `CraftRecipe_${i}`;
      const node = this.recipesContainer.getChildByName?.(nodeName);
      if (node) {
        node.active = false;
      }
    }
  }

  private renderRecipeNode(node: NodeLike, recipe: CraftRecipeViewModel): void {
    // Recipe name with icon
    const nameLabel = this.findLabel(node, 'NameLabel');
    if (nameLabel) {
      const icon = getRecipeIcon(recipe.id);
      nameLabel.string = `${icon} ${recipe.name}`;
    }

    // Cost line: ⚡100 💰10
    const costLabel = this.findLabel(node, 'CostLabel');
    if (costLabel) {
      const parts: string[] = [];
      if (recipe.costCultivation > 0) parts.push(`⚡${formatNumber(recipe.costCultivation)}`);
      if (recipe.costSpiritStones > 0) parts.push(`💰${formatNumber(recipe.costSpiritStones)}`);
      costLabel.string = parts.length > 0 ? parts.join(' ') : '免费';
    }

    // Effect line: → 修为+50
    const effectLabel = this.findLabel(node, 'EffectLabel');
    if (effectLabel) {
      effectLabel.string = `→ ${describeEffect(recipe.effect)}`;
    }

    // Craft count: 已炼: 2/∞ or 已炼: 1/1
    const countLabel = this.findLabel(node, 'CountLabel');
    if (countLabel) {
      const maxStr = recipe.maxCraftCount === 0 ? '∞' : String(recipe.maxCraftCount);
      countLabel.string = `已炼: ${recipe.craftedCount}/${maxStr}`;
    }

    // Status/reason label (shown when canCraft is false)
    const statusLabel = this.findLabel(node, 'StatusLabel');
    if (statusLabel) {
      statusLabel.active = !recipe.canCraft;
      if (!recipe.canCraft && recipe.reason) {
        statusLabel.string = recipe.reason;
      }
    }

    // Craft button
    const craftButton = this.findButton(node, 'CraftButton');
    if (craftButton) {
      craftButton.interactable = recipe.canCraft;
      // Bind click handler — use closure to capture recipeId
      craftButton.on?.('click', () => this.craftItem(recipe.id), this);
    }

    // Craft button label
    const craftButtonLabel = this.findLabel(node, 'CraftButtonLabel');
    if (craftButtonLabel) {
      craftButtonLabel.string = recipe.canCraft ? '炼制' : (recipe.reason || '不可用');
    }
  }

  // ── User Actions ──────────────────────────────────────────────────────────

  /** Craft an item by recipe ID. Called from scene button bindings. */
  public craftItem(recipeId: string): void {
    if (!this.facade || this.disposed) return;

    const result = this.facade.craft(recipeId);
    if (!result.success) {
      SceneBindingComponent.instance?.showToast(
        result.reason ?? '无法炼制', 'WARNING',
      );
      return;
    }

    SceneBindingComponent.instance?.showToast(
      `成功炼制 ${result.recipe?.name ?? recipeId}！`, 'SUCCESS',
    );
    this.refresh();
  }

  /** Legacy handler — redirects to craftItem for backward compat. */
  public onCraftAction(): void {
    // No-op: the old placeholder handler. Real crafting is done via craftItem(recipeId).
    SceneBindingComponent.instance?.showToast('请选择具体配方进行炼制', 'INFO');
  }

  // ── Event Subscription ────────────────────────────────────────────────────

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const category of CRAFT_REFRESH_CATEGORIES) {
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
}