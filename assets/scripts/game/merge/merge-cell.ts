import type { BoardPosition } from './merge-types';
import type { WorkerEntity } from '../../model/worker-entity';

export class MergeCell {
  public readonly row: number;
  public readonly column: number;
  private readonly getWorker: () => WorkerEntity | undefined;

  public constructor(position: BoardPosition, getWorker: () => WorkerEntity | undefined = () => undefined) {
    this.row = position.row;
    this.column = position.column;
    this.getWorker = getWorker;
  }

  public get occupant(): WorkerEntity | undefined {
    return this.getWorker();
  }
}
