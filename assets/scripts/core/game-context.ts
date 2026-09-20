import { EconomyService } from '../services/economy-service';
import { CultivationService } from '../services/cultivation-service';
import { EventBus } from './event-bus';
import { GameConfig } from './game-config';
import type { GameEvents } from './game-events';
import type { MergeBoard } from '../game/merge/merge-board';
import { MergeBoard as MergeBoardClass } from '../game/merge/merge-board';
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
import { BuffService } from '../services/buff-service';
import { DailyTaskService } from '../services/daily-task-service';
import { TutorialService } from '../services/tutorial-service';
import { DebugService } from '../services/debug-service';
import { TaskService } from '../services/task-service';
import { RewardedAdService } from '../services/rewarded-ad-service';
import { IdleEfficiencyService } from '../services/idle-efficiency-service';
import { LeaderboardService } from '../services/leaderboard-service';
import { FriendsService } from '../services/friends-service';
import { CraftService } from '../services/craft-service';
import { GameClockV2 } from '../v2/v2-clock';
import { RandomService } from '../v2/random-service';
import { GameDayService } from '../v2/game-day-service';
import { InnerDemonService } from '../v2/inner-demon-service';
import { V2EconomyService } from '../v2/v2-economy-service';
import { V2EventService } from '../v2/v2-event-service';
import { V2ItemService } from '../v2/v2-item-service';
import { NpcService, WeekendService } from '../v2/npc-weekend-service';
import { PromotionV2Service, DaySettlementService } from '../v2/v2-settlement-service';
import { OvertimeService } from '../v3/overtime-service';
import craftConfig from '../../configs/craft.json';
import achievementsConfig from '../../configs/achievements.json';
import dailyConfig from '../../configs/daily.json';
import dailyTasksConfig from '../../configs/daily-tasks.json';

export interface GameContextOptions {
  /** @deprecated PC V1 should pass `null` to disable merge board. Defaults to 4×4 for backward compatibility. */
  readonly board?: MergeBoard | null;
  readonly player?: PlayerData;
  readonly saveService?: SaveService;
  readonly storage?: StorageAdapter;
  /** @deprecated Board dimensions are no longer used in PC V1. */
  readonly boardRows?: number;
  /** @deprecated Board dimensions are no longer used in PC V1. */
  readonly boardColumns?: number;
  readonly economyRewards?: readonly number[];
  readonly cultivationRewards?: readonly number[];
  readonly configService?: ConfigService;
  readonly randomProvider?: import('./random-provider').RandomProvider;
  readonly rewardProvider?: RewardProvider;
  readonly clock?: Clock;
  readonly careerEventClock?: Clock;
  readonly randomV2?: RandomService;
}

export class GameContext {
  /** @deprecated PC V1 should pass `board: null` instead. */
  public readonly board: MergeBoard | null;
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
  public readonly buffs: BuffService;
  public readonly dailyTasks: DailyTaskService;
  public readonly tutorial: TutorialService;
  public readonly debug: DebugService;
  public readonly tasks: TaskService;
  public readonly rewardedAd: RewardedAdService;
  public readonly idleEfficiency: IdleEfficiencyService;
  public readonly leaderboard: LeaderboardService;
  public readonly friends: FriendsService;
  public readonly craft: CraftService;
  /** V2 统一时钟（含 DEV 时间偏移）。 */
  public readonly clockV2: GameClockV2;
  /** V2 统一随机服务。 */
  public readonly randomV2: RandomService;
  /** V2 工作日生命周期 + 今日局势。 */
  public readonly gameDay: GameDayService;
  /** V2 心魔系统。 */
  public readonly innerDemon: InnerDemonService;
  /** V2 四模式经济修正。 */
  public readonly v2Economy: V2EconomyService;
  /** V2 配置驱动事件引擎。 */
  public readonly v2Events: V2EventService;
  /** V2 物品系统（材料/功法/装备/合成/消耗品/商店）。 */
  public readonly v2Items: V2ItemService;
  /** V2 NPC 关系系统。 */
  public readonly npc: NpcService;
  /** V2 周末活动系统。 */
  public readonly weekend: WeekendService;
  /** V2 晋升答辩系统。 */
  public readonly promotionV2: PromotionV2Service;
  /** V2 日/周结算系统。 */
  public readonly daySettlement: DaySettlementService;
  /** V3 显式加班会话；它是下班结算的唯一阻塞条件。 */
  public readonly overtime: OvertimeService;
  public readonly rewardProvider: RewardProvider;
  public readonly configService: ConfigService;
  public readonly config = GameConfig;

  public constructor(options: GameContextOptions = {}) {
    this.saveService = options.saveService ?? new SaveService(options.storage ?? new LocalStorageAdapter(), undefined, options.clock ?? DEFAULT_CLOCK);
    let saved = options.player ? undefined : this.saveService.load();
    // Board defaults to a standard 4×4 grid for backward compatibility.
    // PC V1 production code should pass `board: null` to disable the merge board.
    if (options.board !== undefined) {
      this.board = options.board;
    } else if (options.boardRows && options.boardColumns) {
      this.board = new MergeBoardClass({ rows: options.boardRows, columns: options.boardColumns });
    } else {
      this.board = new MergeBoardClass();
    }
    this.player = options.player ?? new PlayerData(saved);
    // Restore workers onto the board if board exists and player has saved workers.
    // Invalid worker data (duplicates, out-of-bounds, etc.) causes the entire save to be
    // rejected — the player resets to defaults as a safety measure against corruption.
    if (this.board && this.player.workers.length > 0) {
      try {
        this.board = MergeBoardClass.fromSaveData(this.player.workers, { rows: this.board.rows, columns: this.board.columns });
      } catch {
        // Corrupted worker data — reset to new player defaults
        this.board = new MergeBoardClass({ rows: this.board.rows, columns: this.board.columns });
        this.player = new PlayerData();
      }
    }
    this.configService = options.configService ?? ConfigService.loadFromJson(workerConfig, economyConfig, gameConfig, careerConfig, sectConfig, talentConfig, careerEventsConfig, kpiConfig, officeConfig, promotionConfig, achievementsConfig, dailyConfig, dailyTasksConfig);
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
    this.buffs = new BuffService({ clock: options.clock });
    this.dailyTasks = new DailyTaskService(this, this.configService.dailyTasks, { clock: options.clock });
    this.tutorial = new TutorialService(this);
    this.debug = new DebugService(this, options.randomProvider);
    this.tasks = new TaskService(this, { clock: options.clock });
    this.rewardedAd = new RewardedAdService({ clock: options.clock });
    this.idleEfficiency = new IdleEfficiencyService(this);
    this.leaderboard = new LeaderboardService(this);
    this.friends = new FriendsService(this);
    this.craft = new CraftService(this, craftConfig as import('../services/craft-service').CraftConfig);
    // ── Gameplay V2 services ──
    this.clockV2 = new GameClockV2({ clock: options.clock });
    this.clockV2.setDevOffsetMs(this.player.devTimeOffsetMs ?? 0);
    this.randomV2 = options.randomV2 ?? new RandomService();
    this.gameDay = new GameDayService(this, this.clockV2, this.randomV2);
    this.overtime = new OvertimeService(this, this.clockV2, this.gameDay);
    this.innerDemon = new InnerDemonService(this);
    this.v2Economy = new V2EconomyService(this, this.clockV2, this.gameDay, this.innerDemon);
    this.v2Events = new V2EventService(this, this.clockV2, this.gameDay, this.innerDemon, this.randomV2);
    this.v2Items = new V2ItemService(this, this.clockV2, this.gameDay, this.randomV2);
    this.npc = new NpcService(this);
    this.weekend = new WeekendService(this, this.clockV2, this.gameDay, this.innerDemon);
    this.promotionV2 = new PromotionV2Service(this, this.clockV2, this.innerDemon, this.npc);
    this.daySettlement = new DaySettlementService(this, this.clockV2, this.gameDay, this.innerDemon);
  }

  /** @deprecated No longer used in PC V1 — board is null by default. */
  public syncPlayerWorkers(): void {
    if (this.board) {
      this.player.workers = this.board.toSaveData();
    }
  }
}
