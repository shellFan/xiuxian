import { _decorator, Component, CCFloat, CCInteger } from 'cc';
import type { BoardPosition } from '../game/merge/merge-types';
import type { DragController } from '../game/drag-controller';
import type { MergeBoardViewModel } from './view-models';
import { WorkerView } from './worker-view';
const { ccclass } = _decorator;
const property = (value: unknown): any => { const decorator = _decorator as unknown as { property?: (type: unknown) => any }; return decorator.property ? decorator.property(value) : () => {}; };
export interface PointLike { readonly x: number; readonly y: number; }
export interface CoordinateTransform { readonly screenToBoardLocal?: (point: PointLike) => PointLike | undefined; readonly boardLocalToScreen?: (point: PointLike) => PointLike | undefined; readonly screenToWorkerParent?: (point: PointLike) => PointLike | undefined; }
export interface BoardGeometry extends CoordinateTransform { readonly originX: number; readonly originY: number; readonly cellWidth: number; readonly cellHeight: number; readonly rows: number; readonly columns: number; readonly scaleX?: number; readonly scaleY?: number; }
interface TransformLike { convertToNodeSpaceAR?: (point: { x: number; y: number; z: number }) => PointLike; convertToWorldSpaceAR?: (point: { x: number; y: number; z: number }) => PointLike; }
interface BoardNodeLike { readonly isValid?: boolean; readonly parent?: BoardNodeLike; readonly name?: string; readonly children?: readonly BoardNodeLike[]; readonly position?: PointLike; getComponent?: (type: unknown) => unknown; addComponent?: (type: unknown) => unknown; }
@ccclass('MergeBoardView')
export class MergeBoardView extends Component {
  @property(CCFloat) public originX = 0;
  @property(CCFloat) public originY = 0;
  @property(CCFloat) public cellWidth = 0;
  @property(CCFloat) public cellHeight = 0;
  @property(CCInteger) public rows = 4;
  @property(CCInteger) public columns = 4;
  @property(CCFloat) public scaleX = 1;
  @property(CCFloat) public scaleY = 1;
  private transform: CoordinateTransform = {};
  private cellNodes: Array<BoardNodeLike | null> = [];
  private workerViews: Array<WorkerView | null> = [];
  public configure(geometry: BoardGeometry): void { this.originX = geometry.originX; this.originY = geometry.originY; this.cellWidth = geometry.cellWidth; this.cellHeight = geometry.cellHeight; this.rows = geometry.rows; this.columns = geometry.columns; this.scaleX = geometry.scaleX ?? 1; this.scaleY = geometry.scaleY ?? 1; this.transform = geometry; }
  public bindCells(): void {
    this.cellNodes = [];
    this.workerViews = [];
    for (let index = 0; index < this.rows * this.columns; index += 1) {
      const node = this.getCellNode(index);
      this.workerViews[index] = node ? this.getOrAddWorkerView(node) : null;
    }
    this.configureFromCellLayout();
  }
  public bindDragController(controller: DragController): void {
    this.workerViews.forEach((worker) => worker?.bind(this, controller));
  }
  public render(viewModel: MergeBoardViewModel): void {
    for (const cell of viewModel.cells) {
      const index = cell.row * viewModel.columns + cell.column;
      const worker = this.workerViews[index];
      if (!worker) continue;
      if (cell.occupied && cell.workerId && cell.workerLevel !== null) {
        worker.refresh({ id: cell.workerId, level: cell.workerLevel });
        worker.setBoardPosition({ row: cell.row, column: cell.column });
      } else {
        worker.clear();
      }
    }
  }
  public animateMerge(from: BoardPosition, to: BoardPosition, onComplete: () => void): void {
    const worker = this.workerViews[from.row * this.columns + from.column];
    if (worker) worker.animateTo(to, onComplete);
    else onComplete();
  }
  public screenToBoardPosition(point: PointLike): BoardPosition | undefined { return this.targetPosition(point); }
  public targetPosition(point: PointLike): BoardPosition | undefined {
    if (!this.isNodeValid() || this.cellWidth <= 0 || this.cellHeight <= 0 || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
    const local = this.toBoardLocal(point); if (!local) return undefined;
    const column = Math.floor((local.x - this.originX) / this.cellWidth); const row = Math.floor((local.y - this.originY) / this.cellHeight);
    return row >= 0 && row < this.rows && column >= 0 && column < this.columns ? { row, column } : undefined;
  }
  public parseTargetCell(point: PointLike): BoardPosition | undefined { return this.targetPosition(point); }
  public boardPositionToScreenPoint(position: BoardPosition): PointLike {
    const local = { x: this.originX + (position.column + 0.5) * this.cellWidth, y: this.originY + (position.row + 0.5) * this.cellHeight };
    return this.transform.boardLocalToScreen?.(local) ?? this.nodeTransform()?.convertToWorldSpaceAR?.({ ...local, z: 0 }) ?? { x: local.x * this.scaleX, y: local.y * this.scaleY };
  }
  public screenToWorkerParentPoint(point: PointLike): PointLike | undefined { return this.transform.screenToWorkerParent?.(point) ?? this.parentTransform()?.convertToNodeSpaceAR?.({ ...point, z: 0 }) ?? undefined; }
  public isNodeValid(): boolean { return (this as unknown as { node?: BoardNodeLike }).node?.isValid !== false; }
  private toBoardLocal(point: PointLike): PointLike | undefined { return this.transform.screenToBoardLocal?.(point) ?? this.nodeTransform()?.convertToNodeSpaceAR?.({ ...point, z: 0 }) ?? { x: point.x / this.scaleX, y: point.y / this.scaleY }; }
  private nodeTransform(): TransformLike | undefined { return (this as unknown as { node?: BoardNodeLike }).node?.getComponent?.('UITransform') ?? undefined; }
  private parentTransform(): TransformLike | undefined { return (this as unknown as { node?: BoardNodeLike }).node?.parent?.getComponent?.('UITransform') ?? undefined; }
  private getCellNode(index: number): BoardNodeLike | null {
    if (index < 0 || index >= this.rows * this.columns) return null;
    if (this.cellNodes[index] !== undefined) return this.cellNodes[index];
    const root = (this as unknown as { node?: BoardNodeLike }).node;
    const name = `BoardCell${index.toString().padStart(2, '0')}`;
    const node = root?.children?.find((child) => child.name === name) ?? null;
    this.cellNodes[index] = node;
    return node;
  }
  private getOrAddWorkerView(node: BoardNodeLike): WorkerView | null {
    try {
      return (node.getComponent?.(WorkerView) as WorkerView | null) ?? (node.addComponent?.(WorkerView) as WorkerView | null) ?? null;
    } catch {
      return null;
    }
  }

  private configureFromCellLayout(): void {
    const first = this.cellNodes[0];
    const second = this.cellNodes[1];
    const nextRow = this.cellNodes[this.columns];
    const size = first?.getComponent?.('UITransform') as { contentSize?: { width: number; height: number } } | null;
    const width = size?.contentSize?.width ?? this.cellWidth;
    const height = size?.contentSize?.height ?? this.cellHeight;
    const firstPosition = first?.position;
    const secondPosition = second?.position;
    const rowPosition = nextRow?.position;
    if (!firstPosition || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;

    const columnStep = secondPosition ? Math.abs(secondPosition.x - firstPosition.x) : width;
    const rowStep = rowPosition ? Math.abs(rowPosition.y - firstPosition.y) : height;
    const root = (this as unknown as { node?: BoardNodeLike }).node;
    const rootTransform = root?.getComponent?.('UITransform') as TransformLike | null;
    const top = Math.max(...this.cellNodes.filter((node): node is BoardNodeLike => !!node).map((node) => node.position?.y ?? firstPosition.y)) + height / 2;
    this.configure({
      originX: firstPosition.x - width / 2,
      originY: 0,
      cellWidth: columnStep || width,
      cellHeight: rowStep || height,
      rows: this.rows,
      columns: this.columns,
      screenToBoardLocal: (point) => {
        const local = rootTransform?.convertToNodeSpaceAR?.({ ...point, z: 0 }) ?? point;
        return { x: local.x, y: top - local.y };
      },
      boardLocalToScreen: (point) => rootTransform?.convertToWorldSpaceAR?.({ ...point, y: top - point.y, z: 0 }) ?? { x: point.x, y: top - point.y },
    });
  }
}
