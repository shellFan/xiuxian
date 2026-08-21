import { GameConfig } from '../../core/game-config';
import type { WorkerSaveData } from '../../model/save-data';
import { WorkerEntity } from '../../model/worker-entity';
import { MergeCell } from './merge-cell';
import type { BoardPosition, MergeBoardSize } from './merge-types';

export interface MergeBoardOptions extends MergeBoardSize { readonly maxWorkerLevel?: number; }

export class MergeBoard {
  public readonly rows: number;
  public readonly columns: number;
  public readonly maxWorkerLevel: number;
  public readonly cells: readonly MergeCell[];
  private readonly workers: Map<string, WorkerEntity>;
  private readonly cellMap: Map<string, MergeCell>;

  public constructor(options: MergeBoardOptions = { rows: GameConfig.boardRows, columns: GameConfig.boardColumns }) {
    if (!Number.isInteger(options.rows) || options.rows < 1 || !Number.isInteger(options.columns) || options.columns < 1) {
      throw new Error('Board dimensions must be positive integers');
    }
    this.rows = options.rows;
    this.columns = options.columns;
    this.maxWorkerLevel = options.maxWorkerLevel ?? GameConfig.maxWorkerLevel;
    if (!Number.isInteger(this.maxWorkerLevel) || this.maxWorkerLevel < 1) {
      throw new Error('Maximum worker level must be positive');
    }

    this.workers = new Map();
    this.cellMap = new Map();
    const cells: MergeCell[] = [];
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const position = { row, column };
        const key = this.key(position);
        const cell = new MergeCell(position, () => this.workers.get(key));
        cells.push(cell);
        this.cellMap.set(key, cell);
      }
    }
    this.cells = cells;
  }

  public get capacity(): number { return this.cells.length; }
  public get occupiedCount(): number { return this.workers.size; }
  public get emptyCount(): number { return this.capacity - this.occupiedCount; }
  public get isFull(): boolean { return this.emptyCount === 0; }

  public getCell(position: BoardPosition): MergeCell { return this.requireCell(position); }
  public getWorker(position: BoardPosition): WorkerEntity | undefined {
    return this.workers.get(this.key(this.requireCell(position)));
  }
  public isOccupied(position: BoardPosition): boolean { return this.getWorker(position) !== undefined; }

  public place(worker: WorkerEntity, position: BoardPosition): void {
    this.validateWorker(worker);
    const key = this.key(this.requireCell(position));
    if (this.workers.has(key)) throw new Error(`Cell ${key} is occupied`);
    if ([...this.workers.values()].some((candidate) => candidate.id === worker.id)) {
      throw new Error(`Worker ${worker.id} is already on the board`);
    }
    this.workers.set(key, worker);
  }

  public remove(position: BoardPosition): WorkerEntity | undefined {
    const key = this.key(this.requireCell(position));
    const worker = this.workers.get(key);
    this.workers.delete(key);
    return worker;
  }

  public move(from: BoardPosition, to: BoardPosition): void {
    const sourceKey = this.key(this.requireCell(from));
    const targetKey = this.key(this.requireCell(to));
    const worker = this.workers.get(sourceKey);
    if (!worker) throw new Error('Source cell is empty');
    if (this.workers.has(targetKey)) throw new Error('Target cell is occupied');
    this.workers.delete(sourceKey);
    this.workers.set(targetKey, worker);
  }

  public findEmptyPosition(): BoardPosition | undefined {
    const cell = this.cells.find((candidate) => !candidate.occupant);
    return cell ? { row: cell.row, column: cell.column } : undefined;
  }

  public canMerge(first: BoardPosition, second: BoardPosition): boolean {
    const left = this.getWorker(first);
    const right = this.getWorker(second);
    return left !== undefined && right !== undefined && left.level === right.level &&
      left.level < this.maxWorkerLevel && (first.row !== second.row || first.column !== second.column);
  }

  public merge(first: BoardPosition, second: BoardPosition): WorkerEntity {
    if (!this.canMerge(first, second)) throw new Error('Workers cannot merge');
    const source = this.requireCell(first);
    const target = this.requireCell(second);
    const left = this.remove(source);
    this.remove(target);
    const merged = WorkerEntity.create(left!.level + 1);
    this.place(merged, target);
    return merged;
  }

  public toSaveData(): WorkerSaveData[] {
    return this.cells.flatMap((cell) => cell.occupant ? [cell.occupant.toSaveData(cell.row, cell.column)] : []);
  }

  public serialize(): WorkerSaveData[] { return this.toSaveData(); }

  public static fromSaveData(data: readonly WorkerSaveData[], options: MergeBoardOptions = { rows: GameConfig.boardRows, columns: GameConfig.boardColumns }): MergeBoard {
    const board = new MergeBoard(options);
    const ids = new Set<string>();
    for (const item of data) {
      if (ids.has(item.id)) throw new Error(`Duplicate worker id ${item.id}`);
      ids.add(item.id);
      board.place(WorkerEntity.fromSaveData(item), { row: item.row, column: item.column });
    }
    return board;
  }

  public static restore(data: readonly WorkerSaveData[], options: MergeBoardOptions = { rows: GameConfig.boardRows, columns: GameConfig.boardColumns }): MergeBoard {
    return MergeBoard.fromSaveData(data, options);
  }

  private validateWorker(worker: WorkerEntity): void {
    if (worker.level > this.maxWorkerLevel) {
      throw new Error(`Worker level ${worker.level} exceeds maximum ${this.maxWorkerLevel}`);
    }
  }

  private requireCell(position: BoardPosition): MergeCell {
    const cell = this.cellMap.get(this.key(position));
    if (!cell) throw new Error(`Invalid board position ${position.row},${position.column}`);
    return cell;
  }

  private key(position: BoardPosition): string { return `${position.row},${position.column}`; }
}
