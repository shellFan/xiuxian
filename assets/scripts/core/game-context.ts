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
import careerConfig from '../../configs/career.json';
import { LocalStorageAdapter, type StorageAdapter } from '../services/storage-adapter';
import { CareerService } from '../services/career-service';
import { MindService } from '../services/mind-service';
import { MockRewardProvider, type RewardProvider } from '../services/reward-provider';
import { IdleService } from '../services/idle-service';
import { OfflineRewardService } from '../services/offline-reward-service';
import { DEFAULT_CLOCK, type Clock } from './clock';
import { WorkService } from '../services/work-service';
import { SectService } from '../services/sect-service';
import sectConfig from '../../configs/sect.json';
import talentConfig from '../../configs/talent.json';
import careerEventsConfig from '../../configs/career-events.json';
import { TalentService } from '../services/talent-service';
import { KpiService } from '../services/kpi-service';
import kpiConfig from '../../configs/kpi.json';
import officeConfig from '../../configs/office.json';
import { PromotionService } from '../services/promotion-service';
import promotionConfig from '../../configs/promotion.json';
import { OfficeService } from '../services/office-service';
import { EffectService } from '../services/effect-service';
import { CareerEventService } from '../services/career-event-service';
import { AchievementService } from '../services/achievement-service';
import { DailyService } from '../services/daily-service';
import achievementsConfig from '../../configs/achievements.json';
import dailyConfig from '../../configs/daily.json';

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
  readonly randomProvider?: import('./random-provider').RandomProvider;
  readonly rewardProvider?: RewardProvider;
  readonly clock?: Clock;
  readonly careerEventClock?: Clock;
}

export class GameContext {
  public readonly board: MergeBoard;
  public readonly player: PlayerData;
  public readonly saveService: SaveService;
  public readonly events = new EventBus<GameEvents>();
  public readonly economy: EconomyService;
  public readonly cultivation: CultivationService;
  public readonly career: CareerService;
  public readonly mind: MindService;
  public readonly idle: IdleService;
  public readonly offline: OfflineRewardService;
  public readonly work: WorkService;
  public readonly sect: SectService;
  public readonly talent: TalentService;
  public readonly effects: EffectService;
  public readonly careerEvents: CareerEventService;
  public readonly kpi: KpiService;
  public readonly promotion: PromotionService;
  public readonly office: OfficeService;
  public readonly achievements: AchievementService;
  public readonly daily: DailyService;
  public readonly rewardProvider: RewardProvider;
  public readonly configService: ConfigService;
  public readonly config = GameConfig;

  public constructor(options: GameContextOptions = {}) {
    this.saveService = options.saveService ?? new SaveService(options.storage ?? new LocalStorageAdapter(), undefined, options.clock ?? DEFAULT_CLOCK);
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
    this.configService = options.configService ?? ConfigService.loadFromJson(workerConfig, economyConfig, gameConfig, careerConfig, sectConfig, talentConfig, careerEventsConfig, kpiConfig, officeConfig, promotionConfig, achievementsConfig, dailyConfig);
    this.economy = new EconomyService(this, {
      mergeRewards: options.economyRewards ?? this.configService.economy.mergeRewards,
    });
    this.cultivation = new CultivationService(this, {
      mergeRewards: options.cultivationRewards ?? this.configService.economy.cultivationRewards ?? [5, 10, 20, 40, 80],
    });
    this.career = new CareerService(this);
    this.rewardProvider = options.rewardProvider ?? new MockRewardProvider();
    this.mind = new MindService(this, this.rewardProvider);
    this.idle = new IdleService(this, { clock: options.clock });
    this.offline = new OfflineRewardService(this, this.idle);
    this.work = new WorkService(this);
    this.sect = new SectService(this);
    this.talent = new TalentService(this, options.randomProvider ?? undefined);
    this.effects = new EffectService(this);
    this.careerEvents = new CareerEventService(this, { clock: options.careerEventClock ?? options.clock, randomProvider: options.randomProvider });
    this.kpi = new KpiService(this);
    this.promotion = new PromotionService(this, { randomProvider: options.randomProvider, rewardProvider: this.rewardProvider });
    this.office = new OfficeService(this);
    this.achievements = new AchievementService(this, this.configService.achievements);
    this.daily = new DailyService(this, this.configService.daily, { clock: options.clock });
  }

  public syncPlayerWorkers(): void {
    this.player.workers = this.board.toSaveData();
  }
}
