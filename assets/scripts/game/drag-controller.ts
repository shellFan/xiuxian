import type { BoardPosition } from './merge/merge-types';

export interface DragWorker { readonly id: string; readonly level: number; }
export enum DragState { IDLE = 'IDLE', DRAGGING = 'DRAGGING', MERGING = 'MERGING' }
export type DragResult = 'move' | 'merge' | 'restore' | 'ignored';
export interface DragControllerOptions {
  readonly getWorker: (position: BoardPosition) => DragWorker | undefined;
  readonly onMove?: (from: BoardPosition, to: BoardPosition) => void;
  readonly onMerge?: (from: BoardPosition, to: BoardPosition) => void;
  readonly onRestore?: (from: BoardPosition) => void;
  readonly maxWorkerLevel?: number;
}
interface Session { workerId: string; from: BoardPosition; level: number; }
export class DragController {
  private _state = DragState.IDLE;
  private session: Session | undefined;
  public constructor(private readonly options: DragControllerOptions) {}
  public get state(): DragState { return this._state; }
  public get sourcePosition(): BoardPosition | undefined { return this.session ? { ...this.session.from } : undefined; }
  public begin(workerId: string, from: BoardPosition): boolean {
    if (this._state !== DragState.IDLE) return false;
    try { const worker = this.options.getWorker(from); if (!worker || worker.id !== workerId) return false; this.session = { workerId, from: { ...from }, level: worker.level }; this._state = DragState.DRAGGING; return true; } catch { return false; }
  }
  public update(target: BoardPosition | undefined): BoardPosition | undefined { return this._state === DragState.DRAGGING ? target : undefined; }
  public drop(target: BoardPosition | undefined): DragResult {
    const session = this.session;
    if (this._state !== DragState.DRAGGING || !session) return 'ignored';
    let source: DragWorker | undefined; let targetWorker: DragWorker | undefined;
    try { source = this.options.getWorker(session.from); targetWorker = target ? this.options.getWorker(target) : undefined; } catch { return this.restore(session); }
    if (!source || source.id !== session.workerId || source.level !== session.level || !target || this.samePosition(session.from, target)) return this.restore(session);
    if (!targetWorker) {
      if (!this.options.onMove) return this.restore(session);
      try { this.invokeSync(this.options.onMove, session.from, target); } catch { return this.restore(session); }
      this.clear(); return 'move';
    }
    if (targetWorker.id === session.workerId || targetWorker.level !== session.level || targetWorker.level >= (this.options.maxWorkerLevel ?? Number.MAX_SAFE_INTEGER) || !this.options.onMerge) return this.restore(session);
    this._state = DragState.MERGING;
    try { this.invokeSync(this.options.onMerge, session.from, target); } catch { return this.restore(session); }
    return 'merge';
  }
  public completeMerge(): void { if (this._state === DragState.MERGING) this.clear(); }
  public cancel(): DragResult { return this.session ? this.restore(this.session) : 'ignored'; }
  private restore(session: Session): DragResult { try { this.options.onRestore?.(session.from); } catch { /* visual cleanup is owned by the view */ } finally { this.clear(); } return 'restore'; }
  private invokeSync(callback: (from: BoardPosition, to: BoardPosition) => void, from: BoardPosition, to: BoardPosition): void {
    const result = callback(from, to) as unknown;
    if (result && typeof (result as { then?: unknown }).then === 'function') { void (result as PromiseLike<unknown>).then(undefined, () => undefined); throw new Error('Drag callbacks must be synchronous'); }
  }
  private samePosition(a: BoardPosition, b: BoardPosition): boolean { return a.row === b.row && a.column === b.column; }
  private clear(): void { this.session = undefined; this._state = DragState.IDLE; }
}
