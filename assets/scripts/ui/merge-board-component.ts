/**
 * MergeBoardComponent — Phase 5 4×4 merge board with drag-and-drop.
 *
 * Reads MergeBoardViewModel from GameFacade via CocosBootstrapComponent.
 * Manages worker card positions, drag state, and merge/recruit actions.
 *
 * Layout: 4×4 grid within 750×1334 design space.
 * Each cell is ~170×170 design units with 10px gaps.
 */

import { _decorator, Component } from 'cc';
import * as Cocos from 'cc';
import { CocosBootstrapComponent } from '../core/cocos-bootstrap-component';
import type { GameFacade } from '../facade/game-facade';
import type { MergeBoardViewModel, MergeCellViewModel } from './view-models';
import { buildMergeBoardViewModel } from './view-models';
import type { UiEventCategory } from '../facade/ui-event-types';

const { ccclass } = _decorator;
const property = (value: unknown): any => {
  const decorator = _decorator as unknown as { property?: (type: unknown) => any };
  return decorator.property ? decorator.property(value) : () => {};
};
const resolveCocosType = (name: string): unknown =>
  (Cocos as unknown as Record<string, unknown>)[name] ?? `cc.${name}`;

// ── Cocos Node Interfaces ───────────────────────────────────────────────────

interface TextLike { string: string; }
interface SceneNodeLike {
  name?: string;
  children?: readonly SceneNodeLike[];
  parent?: SceneNodeLike;
  active?: boolean;
  getChildByName?: (name: string) => SceneNodeLike | null;
  getComponent?: (type: unknown) => unknown;
  setPosition?: (pos: { x: number; y: number; z?: number }) => void;
  position?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
}

// ── Grid constants ──────────────────────────────────────────────────────────

const GRID_ROWS = 4;
const GRID_COLS = 4;
const CELL_SIZE = 170;  // design units per cell
const CELL_GAP = 10;    // gap between cells
const GRID_ORIGIN_X = 50; // left margin
const GRID_ORIGIN_Y = 400; // top of grid area (from top of screen)

// ── Refresh categories ──────────────────────────────────────────────────────

const BOARD_REFRESH_CATEGORIES: readonly UiEventCategory[] = [
  'BOARD_CHANGED',
  'RESOURCE_CHANGED',
  'STATE_CHANGED',
];

// ── Component ────────────────────────────────────────────────────────────────

@ccclass('MergeBoard')
export class MergeBoardComponent extends Component {
  // ── Scene-bound properties ────────────────────────────────────────────────

  /** Container node for the 4×4 grid cells */
  @property(resolveCocosType('Node'))
  public gridContainer?: SceneNodeLike;

  /** Recruit button */
  @property(resolveCocosType('Button'))
  public recruitButton?: { on?: (event: string, callback: () => void, target?: unknown) => void; off?: (event: string, callback: () => void, target?: unknown) => void; };

  /** Board full indicator label */
  @property(resolveCocosType('Label'))
  public boardStatusLabel?: TextLike;

  // ── Internal state ────────────────────────────────────────────────────────

  private facade: GameFacade | null = null;
  private viewModel: MergeBoardViewModel | null = null;
  private cellNodes: (SceneNodeLike | null)[] = [];
  private unsubs: Array<() => void> = [];
  private disposed = false;

  // ── Cocos Lifecycle ───────────────────────────────────────────────────────

  protected onLoad(): void {
    const bootstrap = CocosBootstrapComponent.instance;
    if (!bootstrap?.facade) {
      throw new Error('MergeBoardComponent requires CocosBootstrapComponent with facade');
    }
    this.facade = bootstrap.facade;

    // Bind recruit button
    this.recruitButton?.on?.('click', this.onRecruit, this);

    // Subscribe to UI events
    this.subscribeEvents();

    // Initial render
    this.refresh();
  }

  protected onDestroy(): void {
    this.disposed = true;
    this.unsubscribeEvents();
    this.recruitButton?.off?.('click', this.onRecruit, this);
    this.facade = null;
    this.viewModel = null;
    this.cellNodes.length = 0;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Get current view model. */
  public getViewModel(): MergeBoardViewModel | null {
    return this.viewModel;
  }

  /** Force refresh from facade state. */
  public refresh(): void {
    if (!this.facade || this.disposed) return;
    this.viewModel = buildMergeBoardViewModel(this.facade);
    this.render(this.viewModel);
  }

  /**
   * Convert board position (row, col) to screen position in design units.
   * Used for drag-and-drop coordinate conversion.
   */
  public boardToScreen(row: number, col: number): { x: number; y: number } {
    const x = GRID_ORIGIN_X + col * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
    const y = GRID_ORIGIN_Y + row * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
    return { x, y };
  }

  /**
   * Convert screen position to board position.
   * Returns null if position is outside the grid.
   */
  public screenToBoard(x: number, y: number): { row: number; col: number } | null {
    const col = Math.floor((x - GRID_ORIGIN_X) / (CELL_SIZE + CELL_GAP));
    const row = Math.floor((y - GRID_ORIGIN_Y) / (CELL_SIZE + CELL_GAP));
    if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return null;
    return { row, col };
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private render(vm: MergeBoardViewModel): void {
    // Update board status
    if (this.boardStatusLabel) {
      this.boardStatusLabel.string = vm.isFull
        ? `满员 ${vm.workerCount}`
        : `${vm.workerCount} 工位`;
    }

    // Update each cell
    for (const cell of vm.cells) {
      this.renderCell(cell);
    }
  }

  private renderCell(cell: MergeCellViewModel): void {
    const index = cell.row * GRID_COLS + cell.column;
    const node = this.getCellNode(index);
    if (!node) return;

    if (cell.occupied && cell.workerLevel !== null) {
      node.active = true;
      // Update cell visual: worker level display
      const label = this.findChildLabel(node);
      if (label) {
        label.string = `🐮 Lv${cell.workerLevel}`;
      }
    } else {
      node.active = true;
      const label = this.findChildLabel(node);
      if (label) {
        label.string = '▫';
      }
    }
  }

  // ── Event Subscription ────────────────────────────────────────────────────

  private subscribeEvents(): void {
    if (!this.facade) return;
    for (const category of BOARD_REFRESH_CATEGORIES) {
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

  // ── Handlers ──────────────────────────────────────────────────────────────

  private readonly onRecruit = (): void => {
    if (!this.facade) return;
    this.facade.recruit();
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getCellNode(index: number): SceneNodeLike | null {
    if (index < 0 || index >= GRID_ROWS * GRID_COLS) return null;
    // Try to find cell node by name convention: "cell-0", "cell-1", etc.
    if (this.cellNodes[index] !== undefined) return this.cellNodes[index];
    const node = this.gridContainer?.getChildByName?.(`cell-${index}`) ?? null;
    this.cellNodes[index] = node;
    return node;
  }

  private findChildLabel(node: SceneNodeLike): TextLike | null {
    // Try to find a Label component on the node or its children
    const label = node.getComponent?.((Cocos as unknown as Record<string, unknown>).Label ?? 'Label');
    if (label && typeof (label as any).string === 'string') return label as TextLike;
    // Check children
    if (node.children) {
      for (const child of node.children) {
        const childLabel = this.findChildLabel(child);
        if (childLabel) return childLabel;
      }
    }
    return null;
  }
}