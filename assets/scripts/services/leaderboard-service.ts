/**
 * LeaderboardService — Local mock leaderboard for WEB V1 (V11-S1 深化).
 *
 * V11 变更（任务书§17，技能 rpg/game-ui-ux，见 docs/V11_V15/DEVELOPMENT_LOG.md）：
 *  - 单榜（职级+修为）→ 四榜：career / cultivation / wealth / achievement
 *  - Math.random / Date.now() → 注入 RandomProvider / Clock（项目确定性约定，测试可复现）
 *  - NPC 生成抽到 LeaderboardProvider 接口（LocalMockProvider 默认实现，后端可替换）
 *  - entry 增加 score 字段（各榜独立分值），UI 侧需显式标注「本地模拟」（未接后端不得冒充在线榜）
 * 旧 API（无参调用）保持兼容：默认 career 榜。
 */

import type { GameContext } from '../core/game-context';
import type { Clock } from '../core/clock';
import { DEFAULT_CLOCK } from '../core/clock';
import type { RandomProvider } from '../core/random-provider';
import { DEFAULT_RANDOM_PROVIDER } from '../core/random-provider';

// ── Metric ───────────────────────────────────────────────────────────────────

export type LeaderboardMetric = 'career' | 'cultivation' | 'wealth' | 'achievement';

export interface LeaderboardMetricMeta {
  readonly metric: LeaderboardMetric;
  readonly label: string;
}

export const LEADERBOARD_METRICS: readonly LeaderboardMetricMeta[] = Object.freeze([
  { metric: 'career', label: '职级榜' },
  { metric: 'cultivation', label: '修为榜' },
  { metric: 'wealth', label: '财富榜' },
  { metric: 'achievement', label: '成就榜' },
]);

// ── Entry / View ─────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  readonly rank: number;
  readonly name: string;
  readonly sectName: string;
  readonly careerLevel: number;
  readonly careerName: string;
  readonly cultivationExp: number;
  /** 该榜的分值（career=职级，cultivation=修为，wealth=灵石，achievement=成就数）。 */
  readonly score: number;
  readonly isPlayer: boolean;
}

export interface LeaderboardView {
  readonly metric: LeaderboardMetric;
  readonly metricLabel: string;
  readonly entries: readonly LeaderboardEntry[];
  readonly playerRank: number;
  readonly totalEntries: number;
  readonly lastUpdated: number;
}

// ── Provider（后端可替换：LocalMockProvider 为唯一内置实现）────────────────────

export interface LeaderboardProvider {
  /**
   * 生成指定榜单的 NPC 条目（不含玩家；不含 rank，rank 由 service 统一排序后分配）。
   * playerScore 传入玩家在该榜的分值，实现应据此缩放 NPC 分数带（避免玩家恒第一/垫底）。
   */
  getNpcEntries(metric: LeaderboardMetric, playerScore: number): readonly LeaderboardEntry[];
}

/** Pre-generated NPC names for the mock leaderboard. */
const NPC_NAMES = [
  '张三丰', '李逍遥', '赵灵儿', '王重阳', '黄药师',
  '周伯通', '郭靖', '杨过', '令狐冲', '段誉',
  '虚竹', '乔峰', '韦小宝', '陈家洛', '胡斐',
  '苗人凤', '程灵素', '袁承志', '狄云', '石破天',
  '阿紫', '王语嫣', '木婉清', '钟灵', '阿朱',
  '小龙女', '任盈盈', '岳灵珊', '仪琳', '程英',
  '公孙绿萼', '陆无双', '程瑶迦', '韩小莹', '梅超风',
  '李莫愁', '裘千仞', '欧阳锋', '洪七公', '一灯大师',
];

const NPC_SECTS = ['私企宗', '外企宗', '国企宗', '大厂宗'];

export interface LocalMockProviderOptions {
  readonly npcCount?: number;
}

/**
 * 本地模拟 NPC 生成。分数区间按玩家当前对应指标缩放（玩家水平 ±3 级带内），
 * 全部经由注入的 RandomProvider —— 固定种子下整榜可复现（QA 可锁定）。
 */
export class LocalMockProvider implements LeaderboardProvider {
  private readonly npcCount: number;

  public constructor(
    options: LocalMockProviderOptions = {},
    private readonly random: RandomProvider = DEFAULT_RANDOM_PROVIDER,
  ) {
    const count = options.npcCount ?? 30;
    if (!Number.isInteger(count) || count < 0 || count > NPC_NAMES.length) {
      throw new Error(`npcCount must be an integer in [0, ${NPC_NAMES.length}], got ${count}`);
    }
    this.npcCount = count;
  }

  public getNpcEntries(metric: LeaderboardMetric, playerScore: number): readonly LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = [];
    for (let i = 0; i < this.npcCount; i++) {
      const level = this.npcLevelNearPlayer(metric === 'career' ? playerScore : undefined);
      const exp = metric === 'cultivation'
        ? Math.max(0, Math.round(playerScore * (0.5 + this.random.next() * 1.1)))
        : Math.floor(this.random.next() * level * 200) + level * 50;
      const score = this.npcScoreFor(metric, level, exp, playerScore);
      entries.push({
        rank: 0, // 由 service 排序后统一分配
        name: NPC_NAMES[i % NPC_NAMES.length],
        sectName: NPC_SECTS[Math.floor(this.random.next() * NPC_SECTS.length)],
        careerLevel: level,
        careerName: `Lv${level}`,
        cultivationExp: exp,
        score,
        isPlayer: false,
      });
    }
    return entries;
  }

  /** 职级带：玩家 ±3 级（固定带当玩家高级时会让 NPC 恒被碾压）。 */
  private npcLevelNearPlayer(playerLevel: number | undefined): number {
    if (playerLevel === undefined) {
      return Math.max(1, Math.floor(this.random.next() * 6) + 1);
    }
    const raw = Math.round(playerLevel + (this.random.next() * 7 - 3.5));
    return Math.min(20, Math.max(1, raw));
  }

  private npcScoreFor(metric: LeaderboardMetric, level: number, exp: number, playerScore: number): number {
    switch (metric) {
      case 'career': return level;
      case 'cultivation': return exp;
      case 'wealth': return Math.max(0, Math.round(playerScore * (0.3 + this.random.next() * 1.2)));
      case 'achievement': return Math.max(0, Math.round(playerScore * (0.2 + this.random.next() * 1.6)));
      default: return exp;
    }
  }
}

// ── Service ──────────────────────────────────────────────────────────────────

/** 每次打开后的缓存有效期（Clock 注入，测试可控）。 */
const REFRESH_INTERVAL_MS = 60_000;

export interface LeaderboardServiceOptions {
  /** NPC 条目生成器。默认 LocalMockProvider（30 条）。 */
  readonly provider?: LeaderboardProvider;
  /** 时间源（缓存节流）。默认 SystemClock。 */
  readonly clock?: Clock;
  /** 随机源（LocalMockProvider 未显式传入时透传）。默认 MathRandomProvider。 */
  readonly random?: RandomProvider;
  /** NPC 条数。默认 30。 */
  readonly npcCount?: number;
}

interface MetricCache {
  readonly entries: readonly LeaderboardEntry[];
  readonly playerRank: number;
  readonly lastRefresh: number;
}

export class LeaderboardService {
  private readonly provider: LeaderboardProvider;
  private readonly clock: Clock;
  private readonly caches = new Map<LeaderboardMetric, MetricCache>();

  public constructor(
    private readonly context: GameContext,
    options: LeaderboardServiceOptions = {},
  ) {
    this.clock = options.clock ?? DEFAULT_CLOCK;
    const random = options.random ?? DEFAULT_RANDOM_PROVIDER;
    this.provider = options.provider ?? new LocalMockProvider({ npcCount: options.npcCount ?? 30 }, random);
  }

  /** 全部可用榜单元信息（UI 切换用）。 */
  public getMetrics(): readonly LeaderboardMetricMeta[] {
    return LEADERBOARD_METRICS;
  }

  /** 指标取玩家分值；非法/负值一律钳到 0（防御存档异常）。 */
  public getPlayerScore(metric: LeaderboardMetric): number {
    const player = this.context.player;
    switch (metric) {
      case 'career': return Math.max(0, Math.floor(player.careerLevel));
      case 'cultivation': return Math.max(0, Math.floor(player.cultivationExp));
      case 'wealth': return Math.max(0, Math.floor(player.spiritStones));
      case 'achievement': return Math.max(0, Math.floor(player.unlockedAchievementIds?.length ?? 0));
      default: return 0;
    }
  }

  /** 取榜单视图（缓存 60s；强制刷新用 refresh(metric)）。 */
  public getLeaderboard(metric: LeaderboardMetric = 'career'): LeaderboardView {
    const meta = LEADERBOARD_METRICS.find((m) => m.metric === metric);
    if (!meta) throw new Error(`Unknown leaderboard metric: ${metric}`);

    const cached = this.caches.get(metric);
    if (!cached || this.clock.now() - cached.lastRefresh > REFRESH_INTERVAL_MS) {
      this.refresh(metric);
    }
    const fresh = this.caches.get(metric)!;
    return Object.freeze({
      metric,
      metricLabel: meta.label,
      entries: Object.freeze([...fresh.entries]),
      playerRank: fresh.playerRank,
      totalEntries: fresh.entries.length,
      lastUpdated: fresh.lastRefresh,
    });
  }

  /** 强制刷新指定榜单。 */
  public refresh(metric: LeaderboardMetric = 'career'): void {
    const meta = LEADERBOARD_METRICS.find((m) => m.metric === metric);
    if (!meta) throw new Error(`Unknown leaderboard metric: ${metric}`);

    const player = this.context.player;
    const playerScore = this.getPlayerScore(metric);
    const playerEntry: LeaderboardEntry = {
      rank: 0,
      name: '你',
      sectName: this.context.sect.current()?.name ?? '未选择宗门',
      careerLevel: player.careerLevel,
      careerName: this.context.career.current().name,
      cultivationExp: player.cultivationExp,
      score: playerScore,
      isPlayer: true,
    };

    const npcEntries = this.provider.getNpcEntries(metric, playerScore);
    const allEntries: LeaderboardEntry[] = [...npcEntries, playerEntry];

    // 分值降序；同分按职级、修为稳定次序（确定性输出，不依赖 sort 实现细节）
    allEntries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.careerLevel !== a.careerLevel) return b.careerLevel - a.careerLevel;
      return b.cultivationExp - a.cultivationExp;
    });

    let playerRank = allEntries.length;
    const ranked: LeaderboardEntry[] = allEntries.map((entry, index) => {
      const rank = index + 1;
      if (entry.isPlayer) playerRank = rank;
      return entry.rank === rank ? entry : { ...entry, rank };
    });

    this.caches.set(metric, {
      entries: Object.freeze(ranked),
      playerRank,
      lastRefresh: this.clock.now(),
    });
  }

  /** 玩家当前排名（默认 career 榜；旧 API 兼容）。 */
  public getPlayerRank(metric: LeaderboardMetric = 'career'): number {
    return this.getLeaderboard(metric).playerRank;
  }

  /** 前 N 名。 */
  public getTopN(n: number, metric: LeaderboardMetric = 'career'): readonly LeaderboardEntry[] {
    if (!Number.isInteger(n) || n < 0) return [];
    return this.getLeaderboard(metric).entries.slice(0, n);
  }

  /** 玩家附近条目（±radius）。 */
  public getAroundPlayer(radius = 5, metric: LeaderboardMetric = 'career'): readonly LeaderboardEntry[] {
    if (!Number.isInteger(radius) || radius < 0) return [];
    const view = this.getLeaderboard(metric);
    const playerIndex = view.entries.findIndex((e) => e.isPlayer);
    if (playerIndex < 0) return view.entries.slice(0, radius * 2 + 1);
    const start = Math.max(0, playerIndex - radius);
    const end = Math.min(view.entries.length, playerIndex + radius + 1);
    return view.entries.slice(start, end);
  }
}
