import { EconomyService } from '../services/economy-service';
import { CultivationService } from '../services/cultivation-service';
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
  readonly cultivationRewards?: readonly number[];
  readonly configService?: ConfigService;
}

export class GameContext {
  public readonly board: MergeBoard;
  public readonly player: PlayerData;
  public readonly saveService: SaveService;
  public readonly events = new EventBus<GameEvents>();
  public readonly economy: EconomyService;
  public readonly cultivation: CultivationService;
  public readonly configService: ConfigService;
  public readonly config = GameConfig;

  public constructor(options: GameContextOptions = {}) {
    this.saveService = options.saveService ?? new SaveService(options.storage ?? new LocalStorageAdapter());
    let saved = options.player || options.board ? undefined : this.saveService.load();
    if (saved && !options.board) {
      try {
        this.board = MergeBoard.fromSaveData(saved.workers, {
          rows: options.boardRows ?? GameConfig.boardRows,
          columns: options.boardColumns ?? GameConfig.boardColumns,
        });
      } catch {
        saved = PlayerData.createDefault().toSaveData();
        this.board = new MergeBoard({
          rows: options.boardRows ?? GameConfig.boardRows,
          columns: options.boardColumns ?? GameConfig.boardColumns,
        });
      }
    } else {
      this.board = options.board ?? new MergeBoard({
        rows: options.boardRows ?? GameConfig.boardRows,
        columns: options.boardColumns ?? GameConfig.boardColumns,
      });
    }
    this.player = options.player ?? new PlayerData(saved);
    this.configService = options.configService ?? ConfigService.loadFromJson(workerConfig, economyConfig, gameConfig);
    this.economy = new EconomyService(this, {
      mergeRewards: options.economyRewards ?? this.configService.economy.mergeRewards,
    });
    this.cultivation = new CultivationService(this, {
      mergeRewards: options.cultivationRewards ?? this.configService.economy.cultivationRewards ?? [5, 10, 20, 40, 80],
    });
  }

  public syncPlayerWorkers(): void {
    this.player.workers = this.board.toSaveData();
  }
}
