import { EconomyService } from '../services/economy-service';
import { EventBus } from './event-bus';
import { GameConfig } from './game-config';
import type { GameEvents } from './game-events';
import { MergeBoard } from '../game/merge/merge-board';
import { PlayerData } from '../model/player-data';
import { SaveService } from '../services/save-service';
import { ConfigService } from '../services/config-service';
import workerConfig from '../../configs/worker.json';
import economyConfig from '../../configs/economy.json';
import gameConfig from '../../configs/game.json';
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
    this.configService = options.configService ?? ConfigService.loadFromJson(workerConfig, economyConfig, gameConfig);
    this.economy = new EconomyService(this, {
      mergeRewards: options.economyRewards ?? this.configService.economy.mergeRewards,
    });
  }

  public syncPlayerWorkers(): void {
    this.player.workers = this.board.toSaveData();
  }
}
