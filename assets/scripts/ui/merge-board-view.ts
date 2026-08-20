import { _decorator, Component } from 'cc';
import type { BoardPosition } from '../game/merge/merge-types';
const { ccclass } = _decorator;
export interface PointLike { readonly x: number; readonly y: number; }
export interface CoordinateTransform { readonly screenToBoardLocal?: (point: PointLike) => PointLike | undefined; readonly boardLocalToScreen?: (point: PointLike) => PointLike | undefined; readonly screenToWorkerParent?: (point: PointLike) => PointLike | undefined; }
export interface BoardGeometry extends CoordinateTransform { readonly originX: number; readonly originY: number; readonly cellWidth: number; readonly cellHeight: number; readonly rows: number; readonly columns: number; readonly scaleX?: number; readonly scaleY?: number; }
interface TransformLike { convertToNodeSpaceAR?: (point: { x: number; y: number; z: number }) => PointLike; convertToWorldSpaceAR?: (point: { x: number; y: number; z: number }) => PointLike; }
interface BoardNodeLike { readonly isValid?: boolean; readonly parent?: BoardNodeLike; getComponent?: (type: string) => TransformLike | null; }
@ccclass('MergeBoardView')
export class MergeBoardView extends Component {
  public originX = 0; public originY = 0; public cellWidth = 0; public cellHeight = 0; public rows = 4; public columns = 4; public scaleX = 1; public scaleY = 1;
  private transform: CoordinateTransform = {};
  public configure(geometry: BoardGeometry): void { this.originX = geometry.originX; this.originY = geometry.originY; this.cellWidth = geometry.cellWidth; this.cellHeight = geometry.cellHeight; this.rows = geometry.rows; this.columns = geometry.columns; this.scaleX = geometry.scaleX ?? 1; this.scaleY = geometry.scaleY ?? 1; this.transform = geometry; }
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
}