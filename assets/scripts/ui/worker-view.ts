import { _decorator, Component } from 'cc';
import { DragController } from '../game/drag-controller';
import type { MergeBoardView, PointLike } from './merge-board-view';
const { ccclass } = _decorator;
export interface TouchLike { getID?: () => number; getUILocation?: () => PointLike; getLocation?: () => PointLike; }
interface DragNodeLike { readonly isValid?: boolean; on?: (event: string, listener: (event: TouchLike) => void, target?: unknown) => void; off?: (event: string, listener: (event: TouchLike) => void, target?: unknown) => void; setPosition?: (position: PointLike & { readonly z: number }) => void; }
@ccclass('WorkerView')
export class WorkerView extends Component {
  public workerId = ''; public level = 1; private boardView?: MergeBoardView; private controller?: DragController; private activeTouchId: number | undefined;
  private get dragNode(): DragNodeLike | undefined { return (this as unknown as { node?: DragNodeLike }).node; }
  private readonly onTouchStart = (event: TouchLike): void => { const point = this.point(event); const id = this.touchId(event); if (!this.isNodeValid() || !this.boardView?.isNodeValid() || !point || id === undefined || this.activeTouchId !== undefined) return; const position = this.boardView.targetPosition(point); if (position && this.controller?.begin(this.workerId, position)) this.activeTouchId = id; };
  private readonly onTouchMove = (event: TouchLike): void => { if (!this.isTouchIdActive(event)) return; const point = this.point(event); if (!this.isNodeValid() || !this.boardView?.isNodeValid() || !point) { this.cancelActiveDrag(); return; } this.controller?.update(this.boardView.targetPosition(point)); const local = this.boardView.screenToWorkerParentPoint(point); if (local) this.setNodePoint(local); };
  private readonly onTouchEnd = (event: TouchLike): void => { if (!this.isTouchIdActive(event)) return; const point = this.point(event); if (!this.isNodeValid() || !this.boardView?.isNodeValid() || !point) this.cancelActiveDrag(); else { this.controller?.drop(this.boardView.targetPosition(point)); this.activeTouchId = undefined; } };
  private readonly onTouchCancel = (event: TouchLike): void => { if (this.isTouchIdActive(event)) this.cancelActiveDrag(); };
  public bind(boardView: MergeBoardView, controller: DragController): void { this.unbind(); this.boardView = boardView; this.controller = controller; this.dragNode?.on?.('touch-start', this.onTouchStart, this); this.dragNode?.on?.('touch-move', this.onTouchMove, this); this.dragNode?.on?.('touch-end', this.onTouchEnd, this); this.dragNode?.on?.('touch-cancel', this.onTouchCancel, this); }
  public unbind(): void { if (this.activeTouchId !== undefined) this.controller?.cancel(); this.dragNode?.off?.('touch-start', this.onTouchStart, this); this.dragNode?.off?.('touch-move', this.onTouchMove, this); this.dragNode?.off?.('touch-end', this.onTouchEnd, this); this.dragNode?.off?.('touch-cancel', this.onTouchCancel, this); this.activeTouchId = undefined; this.boardView = undefined; this.controller = undefined; }
  public onDestroy(): void { this.unbind(); }
  public isNodeValid(): boolean { return this.dragNode?.isValid !== false; }
  public setBoardPosition(position: { readonly row: number; readonly column: number }): void { if (!this.boardView?.isNodeValid() || !this.isNodeValid()) return; const point = this.boardView.boardPositionToScreenPoint(position); const local = this.boardView.screenToWorkerParentPoint(point); if (local) this.setNodePoint(local); }
  private setNodePoint(point: PointLike): void { if (this.isNodeValid()) this.dragNode?.setPosition?.({ x: point.x, y: point.y, z: 0 }); }
  private cancelActiveDrag(): void { this.controller?.cancel(); this.activeTouchId = undefined; }
  private point(event: TouchLike): PointLike | undefined { return event.getUILocation?.() ?? event.getLocation?.(); }
  private touchId(event: TouchLike): number | undefined { const id = event.getID?.(); return typeof id === 'number' && Number.isFinite(id) ? id : undefined; }
  private isTouchIdActive(event: TouchLike): boolean { return this.activeTouchId !== undefined && this.touchId(event) === this.activeTouchId; }
}