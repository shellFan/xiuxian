/**
 * GameDayService（Gameplay V2 §11/§12/§13）— 工作日生命周期 + 今日局势。
 *
 * 职责：
 *  - 维护 dayIndex/weekday/durations/income/eventsHandled 等当日状态（GameDayState，随存档持久化）。
 *  - 每天首次进入工作时段时"开工"：基于 dayIndex 种子随机生成 4 类今日局势。
 *  - tick 累计当日各行为时长；提供下班检测（供 UI 触发日结算流程）。
 *  - 日结算完成时 rolledUp：dayIndex+1、重置当日累计、生成新局势（次日开局）。
 *
 * 时间全部来自 GameClockV2，本服务不触碰 Date.now()。
 */
import type { GameContext } from '../core/game-context';
import type { ActivityDurationsState, GameDayState, WorkMode } from '../model/save-data';
import { emptyActivityDurations } from '../model/player-data';
import type { GameClockV2 } from './v2-clock';
import type { RandomService } from './random-service';
import companySituationsConfig from '../../configs/v2/daily-situations.json';

export interface SituationModifierDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly effects: DailySituationEffects;
}

export interface DailySituationEffects {
  /** 工资倍率增减（1.15 = +15%）。缺省 1。 */
  readonly workSalaryMul?: number;
  readonly workPerformanceMul?: number;
  readonly cultivationMul?: number;
  /** 每小时道心增减（负=流失）。 */
  readonly mindPerHourDelta?: number;
  /** 摸鱼每小时额外道心。 */
  readonly fishingMindDelta?: number;
  /** 每小时心魔增量。 */
  readonly innerDemonPerHour?: number;
  /** 发薪日一次性工资。 */
  readonly salaryBonusFlat?: number;
  readonly socialRelationshipMul?: number;
  /** 事件类别权重乘积表：BOSS/WORK/BUG/PRODUCT/NPC。 */
  readonly eventWeights?: Readonly<Record<string, number>>;
}

export interface DailySituationView {
  readonly dayIndex: number;
  readonly weekday: number;
  readonly company: SituationModifierDef | null;
  readonly boss: SituationModifierDef | null;
  readonly project: SituationModifierDef | null;
  readonly personal: SituationModifierDef | null;
}

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

interface SituationBundle {
  readonly companySituations: readonly SituationModifierDef[];
  readonly bossMoods: readonly SituationModifierDef[];
  readonly projectSituations: readonly SituationModifierDef[];
  readonly personalConditions: readonly SituationModifierDef[];
}

const BUNDLE = companySituationsConfig as unknown as SituationBundle;

/** 每类局势的选择盐值——跨天稳定、跨模块一致。 */
const SALT = { company: 11, boss: 23, project: 37, personal: 53 } as const;

export class GameDayService {
  private readonly clock: GameClockV2;
  private readonly random: RandomService;
  private situationCache: DailySituationView | null = null;

  public constructor(private readonly context: GameContext, clock: GameClockV2, random: RandomService) {
    this.clock = clock;
    this.random = random;
  }

  // ── 当日状态 ──────────────────────────────────────────────────────────────

  /** 当前（或新建）游戏日状态。开工前返回 null。 */
  public current(): GameDayState | null {
    return this.context.player.gameDay;
  }

  public dayIndex(): number {
    return this.context.player.gameDay?.dayIndex ?? 0;
  }

  /** 是否已开工（存在未结算的游戏日）。 */
  public isInProgress(): boolean {
    const d = this.context.player.gameDay;
    return !!d && !d.settled;
  }

  /**
   * 开工：确保存在今天的 GameDay。幂等。
   * 玩家 09:00 后第一次打开游戏/跨天首次 tick 时调用。
   */
  public ensureStarted(): GameDayState {
    const today = this.todayKey();
    let day = this.context.player.gameDay;
    if (day && day.startedAt >= today.startTs && day.startedAt < today.endTs) {
      return day; // 今天已开工
    }
    const prevIndex = day?.dayIndex ?? 0;
    day = {
      dayIndex: prevIndex + 1,
      weekday: this.clock.getGameDate().weekday,
      // Keep the date key within today's work window even when the player first
      // opens after 18:00; otherwise the next tick would create another day.
      startedAt: today.startTs,
      settled: false,
      durations: emptyActivityDurations(),
      income: { salary: 0, cultivation: 0, performance: 0 },
      eventsHandled: 0,
      materialsGained: 0,
      situationIds: [],
    };
    this.context.player.gameDay = day;
    this.situationCache = null;
    this.rollSituation();
    this.context.events.emit('gameDayStarted', { dayIndex: day.dayIndex, weekday: day.weekday });
    return day;
  }

  /** 累计当日行为时长（秒）。 */
  public addDuration(mode: WorkMode, seconds: number): void {
    const day = this.context.player.gameDay;
    if (!day || seconds <= 0) return;
    const durations: ActivityDurationsState = { ...day.durations };
    if (mode === 'WORK') durations.work += seconds;
    else if (mode === 'FISHING') durations.fishing += seconds;
    else if (mode === 'CULTIVATING') durations.cultivating += seconds;
    else if (mode === 'SOCIAL') durations.social += seconds;
    this.context.player.gameDay = { ...day, durations };
  }

  public addIncome(kind: 'salary' | 'cultivation' | 'performance', amount: number): void {
    const day = this.context.player.gameDay;
    if (!day || amount === 0) return;
    const income = { ...day.income };
    if (kind === 'salary') income.salary += amount;
    else if (kind === 'cultivation') income.cultivation += amount;
    else income.performance += amount;
    this.context.player.gameDay = { ...day, income };
  }

  public addEventHandled(): void {
    const day = this.context.player.gameDay;
    if (day) this.context.player.gameDay = { ...day, eventsHandled: day.eventsHandled + 1 };
  }

  public addMaterialsGained(count = 1): void {
    const day = this.context.player.gameDay;
    if (day) this.context.player.gameDay = { ...day, materialsGained: day.materialsGained + count };
  }

  /** 距下班毫秒；未开工或已下班为 0。 */
  public timeUntilOffWorkMs(): number {
    if (!this.isInProgress()) return 0;
    return this.clock.getTimeUntilOffWorkMs();
  }

  /** 是否已过 18:00（当天日结算窗口）。 */
  public isOffWork(): boolean {
    return this.clock.now() >= this.clock.workdayEndTs();
  }

  /** 日结算已完成标记（exactly once 的检查由 DaySettlementService 负责）。 */
  public markSettled(): void {
    const day = this.context.player.gameDay;
    if (day) this.context.player.gameDay = { ...day, settled: true };
  }

  // ── 今日局势 ──────────────────────────────────────────────────────────────

  /** 当天时间戳窗口。 */
  private todayKey(): { startTs: number; endTs: number } {
    return { startTs: this.clock.workdayStartTs(), endTs: this.clock.workdayEndTs() };
  }

  /** 生成/读取今日局势（按 dayIndex 种子确定性选择，幂等）。 */
  public rollSituation(): DailySituationView {
    if (this.situationCache) return this.situationCache;
    const day = this.context.player.gameDay;
    const dayIndex = Math.max(1, day?.dayIndex ?? 1);

    const pick = (pool: readonly SituationModifierDef[], salt: number): SituationModifierDef | null => {
      if (!pool.length) return null;
      const idx = this.random.forDay(dayIndex, salt).int(0, pool.length - 1);
      return pool[Math.min(pool.length - 1, Math.max(0, idx))];
    };

    const view: DailySituationView = {
      dayIndex,
      weekday: this.clock.getGameDate().weekday,
      company: pick(BUNDLE.companySituations, SALT.company),
      boss: pick(BUNDLE.bossMoods, SALT.boss),
      project: pick(BUNDLE.projectSituations, SALT.project),
      personal: pick(BUNDLE.personalConditions, SALT.personal),
    };
    if (day) {
      this.context.player.gameDay = {
        ...day,
        situationIds: [view.company?.id, view.boss?.id, view.project?.id, view.personal?.id].filter(
          (id): id is string => !!id,
        ),
      };
    }
    this.situationCache = view;
    return view;
  }

  /** 今日局势视图（无缓存重建）。 */
  public getSituation(): DailySituationView {
    return this.situationCache ?? this.rollSituation();
  }

  /** 聚合今日全部局势效果（倍率按乘积、增量按求和）。 */
  public aggregateEffects(): Required<
    Pick<DailySituationEffects, 'workSalaryMul' | 'workPerformanceMul' | 'cultivationMul' | 'socialRelationshipMul'> & {
      mindPerHourDelta: number;
      fishingMindDelta: number;
      innerDemonPerHour: number;
      salaryBonusFlat: number;
    }
  > & { eventWeights: Record<string, number> } {
    const view = this.getSituation();
    const agg = {
      workSalaryMul: 1,
      workPerformanceMul: 1,
      cultivationMul: 1,
      socialRelationshipMul: 1,
      mindPerHourDelta: 0,
      fishingMindDelta: 0,
      innerDemonPerHour: 0,
      salaryBonusFlat: 0,
      eventWeights: {} as Record<string, number>,
    };
    for (const sit of [view.company, view.boss, view.project, view.personal]) {
      if (!sit) continue;
      const e = sit.effects;
      agg.workSalaryMul *= e.workSalaryMul ?? 1;
      agg.workPerformanceMul *= e.workPerformanceMul ?? 1;
      agg.cultivationMul *= e.cultivationMul ?? 1;
      agg.socialRelationshipMul *= e.socialRelationshipMul ?? 1;
      agg.mindPerHourDelta += e.mindPerHourDelta ?? 0;
      agg.fishingMindDelta += e.fishingMindDelta ?? 0;
      agg.innerDemonPerHour += e.innerDemonPerHour ?? 0;
      agg.salaryBonusFlat += e.salaryBonusFlat ?? 0;
      if (e.eventWeights) {
        for (const [k, v] of Object.entries(e.eventWeights)) {
          agg.eventWeights[k] = (agg.eventWeights[k] ?? 1) * v;
        }
      }
    }
    return agg;
  }

  /** 周末活动选择（§12）：返回文案提示（活动效果由日结算/周末服务消费）。 */
  public static weekendOptions(): readonly { id: string; name: string; description: string }[] {
    return [
      { id: 'SECLUDED_CULTIVATE', name: '闭关修炼', description: '闭关两日，修为大进，但道心乏味。' },
      { id: 'SLEEP_MADLY', name: '疯狂补觉', description: '睡到自然醒，心魔尽消。' },
      { id: 'FRIENDS_GATHER', name: '朋友聚会', description: '和旧友撸串，道心小补，偶遇机缘。' },
    ];
  }

  /** 星期显示名。 */
  public weekdayName(): string {
    return WEEKDAY_NAMES[this.clock.getGameDate().weekday] ?? '';
  }
}
