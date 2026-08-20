import { _decorator, Component, UITransform } from 'cc';
import { DragController } from '../game/drag-controller';
import type { MergeBoardView, PointLike } from './merge-board-view';
import type { BoardPosition } from '../game/merge/merge-types';
const { ccclass } = _decorator;
export interface TouchLike { getID?: () => number; getUILocation?: () => PointLike; getLocation?: () => PointLike; }
interface TransformLike { convertToNodeSpaceAR?: (point: { x: number; y: number; z: number }) => PointLike; }
interface DragNodeLike { readonly isValid?: boolean; readonly position?: PointLike; readonly parent?: { getComponent?: (type: typeof UITransform) => TransformLike | null }; on?: (event: string, listener: (event: TouchLike) => void, target?: unknown) => void; off?: (event: string, listener: (event: TouchLike) => void, target?: unknown) => void; setPosition?: (position: PointLike & { readonly z: number }) => void; }
@ccclass('WorkerView')
export class WorkerView extends Component {
  public workerId = ''; public level = 1; private boardView?: MergeBoardView; private controller?: DragController; private activeTouchId: number | undefined; private ownsSession = false; private sourceLocalPosition?: PointLike;
  private get dragNode(): DragNodeLike | undefined { return (this as unknown as { node?: DragNodeLike }).node; }
  private readonly onTouchStart = (event: TouchLike): void => {
    const point = this.point(event);
    const id = this.touchId(event);
    if (!this.isNodeValid() || !this.boardView?.isNodeValid() || !point || id === undefined || this.activeTouchId !== undefined) return;
    let source: BoardPosition | undefined;
    let sourceLocal: PointLike | undefined;
    try {
      source = this.boardView.targetPosition(point);
      if (!source) return;
      sourceLocal = this.screenToWorkerParentPoint(this.boardView.boardPositionToScreenPoint(source)) ?? this.dragNode?.position;
    } catch {
      return;
    }
    if (!this.controller?.begin(this.workerId, source)) return;
    this.sourceLocalPosition = sourceLocal;
    this.activeTouchId = id;
    this.ownsSession = true;
  };
  private readonly onTouchMove = (event: TouchLike): void => { if (!this.isTouchIdActive(event)) return; try { const point = this.point(event); if (!this.isNodeValid() || !this.boardView?.isNodeValid() || !point) { this.cancelActiveDrag(); return; } this.controller?.update(this.boardView.targetPosition(point)); const local = this.screenToWorkerParentPoint(point); if (local) this.setNodePoint(local); } catch { this.cancelActiveDrag(); } };
  private readonly onTouchEnd = (event: TouchLike): void => { if (!this.isTouchIdActive(event)) return; try { const point = this.point(event); if (!this.isNodeValid() || !this.boardView?.isNodeValid() || !point) this.cancelActiveDrag(); else { const source = this.controller?.sourcePosition; const result = this.controller?.drop(this.boardView.targetPosition(point)); if (result === 'restore') this.restoreSourcePosition(source); } } catch { this.cancelActiveDrag(); } finally { this.activeTouchId = undefined; this.ownsSession = false; } };
  private readonly onTouchCancel = (event: TouchLike): void => { if (this.isTouchIdActive(event)) this.cancelActiveDrag(); };
  public bind(boardView: MergeBoardView, controller: DragController): void { this.unbind(); this.boardView = boardView; this.controller = controller; this.dragNode?.on?.('touch-start', this.onTouchStart, this); this.dragNode?.on?.('touch-move', this.onTouchMove, this); this.dragNode?.on?.('touch-end', this.onTouchEnd, this); this.dragNode?.on?.('touch-cancel', this.onTouchCancel, this); }
  public unbind(): void { try { if (this.ownsSession && this.controller?.state === 'DRAGGING') { const source = this.controller.sourcePosition; this.controller.cancel(); this.restoreSourcePosition(source); } } finally { this.activeTouchId = undefined; this.ownsSession = false; this.dragNode?.off?.('touch-start', this.onTouchStart, this); this.dragNode?.off?.('touch-move', this.onTouchMove, this); this.dragNode?.off?.('touch-end', this.onTouchEnd, this); this.dragNode?.off?.('touch-cancel', this.onTouchCancel, this); this.boardView = undefined; this.controller = undefined; this.sourceLocalPosition = undefined; } }
  public onDestroy(): void { this.unbind(); }
  public isNodeValid(): boolean { return this.dragNode?.isValid !== false; }
  public setBoardPosition(position: { readonly row: number; readonly column: number }): void { if (!this.boardView?.isNodeValid() || !this.isNodeValid()) return; const point = this.boardView.boardPositionToScreenPoint(position); const local = this.screenToWorkerParentPoint(point); if (local) this.setNodePoint(local); }
  private screenToWorkerParentPoint(point: PointLike): PointLike | undefined { const transform = this.dragNode?.parent?.getComponent?.(UITransform); return transform?.convertToNodeSpaceAR?.({ ...point, z: 0 }); }
  private restoreSourcePosition(source = this.controller?.sourcePosition, local = this.sourceLocalPosition): void { if (local) this.setNodePoint(local); else if (source) this.setBoardPosition(source); }
  private setNodePoint(point: PointLike): void { if (this.isNodeValid()) this.dragNode?.setPosition?.({ x: point.x, y: point.y, z: 0 }); }
  private cancelActiveDrag(): void { try { const source = this.controller?.sourcePosition; this.controller?.cancel(); this.restoreSourcePosition(source); } catch { /* invalid visual nodes cannot be restored */ } finally { this.activeTouchId = undefined; this.ownsSession = false; } }
  private point(event: TouchLike): PointLike | undefined { return event.getUILocation?.() ?? event.getLocation?.(); }
  private touchId(event: TouchLike): number | undefined { const id = event.getID?.(); return typeof id === 'number' && Number.isFinite(id) ? id : undefined; }
  private isTouchIdActive(event: TouchLike): boolean { return this.activeTouchId !== undefined && this.touchId(event) === this.activeTouchId; }
}