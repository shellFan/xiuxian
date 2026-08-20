import type { BoardSize } from './game-types';

export const GameConfig = Object.freeze({
  designWidth: 720,
  designHeight: 1280,
  boardColumns: 4,
  boardRows: 4,
  maxWorkerLevel: 6,
  readonlyBoardSize: Object.freeze({ columns: 4, rows: 4 } satisfies BoardSize),
});
