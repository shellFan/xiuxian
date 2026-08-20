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
export class DragController {
  private _state = DragState.IDLE;
  private session: { workerId: string; from: BoardPosition; level: number } | undefined;
  public constructor(private readonly options: DragControllerOptions) {}
  public get state(): DragState { return this._state; }
  public begin(workerId: string, from: BoardPosition): boolean {
    if (this._state !== DragState.IDLE) return false;
    try {
      const worker = this.options.getWorker(from);
      if (!worker || worker.id !== workerId) return false;
      this.session = { workerId, from: { ...from }, level: worker.level };
      this._state = DragState.DRAGGING; return true;
    } catch { return false; }
  }
  public update(target: BoardPosition | undefined): BoardPosition | undefined {
    return this._state === DragState.DRAGGING ? target : undefined;
  }
  public drop(target: BoardPosition | undefined): DragResult {
    const session = this.session;
    if (this._state !== DragState.DRAGGING || !session) return 'ignored';
    let source: DragWorker | undefined; let targetWorker: DragWorker | undefined;
    try {
      source = this.options.getWorker(session.from);
      targetWorker = target ? this.options.getWorker(target) : undefined;
    } catch { return this.restore(session); }
    if (!source || source.id !== session.workerId || source.level !== session.level || !target ||
      (target.row === session.from.row && target.column === session.from.column)) return this.restore(session);
    if (!targetWorker) {
      if (!this.options.onMove) return this.restore(session);
      try { this.options.onMove(session.from, target); } catch { return this.restore(session); }
      this.clear(); return 'move';
    }
    if (targetWorker.id === session.workerId || targetWorker.level !== session.level ||
      targetWorker.level >= (this.options.maxWorkerLevel ?? Number.MAX_SAFE_INTEGER) || !this.options.onMerge) return this.restore(session);
    this._state = DragState.MERGING;
    try { this.options.onMerge(session.from, target); } catch { this.clear(); return 'restore'; }
    return 'merge';
  }
  public completeMerge(): void { if (this._state === DragState.MERGING) this.clear(); }
  public cancel(): DragResult { return this.session ? this.restore(this.session) : 'ignored'; }
  private restore(session: { from: BoardPosition }): DragResult {
    try { this.options.onRestore?.(session.from); } finally { this.clear(); }
    return 'restore';
  }
  private clear(): void { this.session = undefined; this._state = DragState.IDLE; }
}
