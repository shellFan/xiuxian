const DEFAULT_CONFIG = {
  worker: { levels: [
    { level: 1, name: '实习牛马', salary: 10 }, { level: 2, name: '普通牛马', salary: 20 },
    { level: 3, name: '高级牛马', salary: 40 }, { level: 4, name: '资深牛马', salary: 80 },
    { level: 5, name: '牛马主管', salary: 160 }, { level: 6, name: '牛马总监', salary: 320 },
  ] },
  economy: { mergeRewards: [10, 20, 40, 80, 160] },
  game: { board: { columns: 4, rows: 4 } },
} as const;
import { EconomyService } from '../services/economy-service';
import { EventBus } from './event-bus';
import { GameConfig } from './game-config';
import type { GameEvents } from './game-events';
import { MergeBoard } from '../game/merge/merge-board';
import { PlayerData } from '../model/player-data';
import { SaveService } from '../services/save-service';
import { ConfigService } from '../services/config-service';
import { LocalStorageAdapter, type StorageAdapter } from '../services/storage-adapter';

export interface GameContextOptions {
  readonly board?: MergeBoard;
  readonly player?: PlayerData;
  readonly saveService?: SaveService;
  readonly storage?: StorageAdapter;
  readonly boardRows?: number;
  readonly boardColumns?: number;
  readonly economyRewards?: readonly number[];
  readonly configService?: ConfigService;
}

export class GameContext {
  public readonly board: MergeBoard;
  public readonly player: PlayerData;
  public readonly saveService: SaveService;
  public readonly events = new EventBus<GameEvents>();
  public readonly economy: EconomyService;
  public readonly configService: ConfigService;
  public readonly config = GameConfig;

  public constructor(options: GameContextOptions = {}) {
    this.board = options.board ?? new MergeBoard({
      rows: options.boardRows ?? GameConfig.boardRows,
      columns: options.boardColumns ?? GameConfig.boardColumns,
    });
    this.player = options.player ?? PlayerData.createDefault();
    this.saveService = options.saveService ?? new SaveService(options.storage ?? new LocalStorageAdapter());
    this.configService = options.configService ?? ConfigService.load(DEFAULT_CONFIG);
    this.economy = new EconomyService(this, {
      mergeRewards: options.economyRewards ?? this.configService.economy.mergeRewards,
    });
  }

  public syncPlayerWorkers(): void {
    this.player.workers = this.board.toSaveData();
  }
}
