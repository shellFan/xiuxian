/**
 * LeaderboardService — Local mock leaderboard for WEB V1.
 *
 * Provides a mock leaderboard with pre-generated NPC entries.
 * The player's own entry is inserted based on their current career level
 * and cultivation exp. No backend or real multiplayer.
 */

import type { GameContext } from '../core/game-context';

export interface LeaderboardEntry {
  readonly rank: number;
  readonly name: string;
  readonly sectName: string;
  readonly careerLevel: number;
  readonly careerName: string;
  readonly cultivationExp: number;
  readonly isPlayer: boolean;
}

export interface LeaderboardView {
  readonly entries: readonly LeaderboardEntry[];
  readonly playerRank: number;
  readonly totalEntries: number;
  readonly lastUpdated: number;
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

/** Generate mock NPC entries sorted by score. */
function generateMockEntries(count: number, playerLevel: number, playerExp: number): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < count; i++) {
    const level = Math.max(1, Math.floor(Math.random() * (playerLevel + 3)) + 1);
    const exp = Math.floor(Math.random() * level * 200) + level * 50;
    const name = NPC_NAMES[i % NPC_NAMES.length];
    const sectName = NPC_SECTS[Math.floor(Math.random() * NPC_SECTS.length)];
    entries.push({
      rank: 0, // will be assigned after sorting
      name,
      sectName,
      careerLevel: level,
      careerName: `Lv${level}`,
      cultivationExp: exp,
      isPlayer: false,
    });
  }
  return entries;
}

export interface LeaderboardServiceOptions {
  /** Number of NPC entries. Default: 30. */
  readonly npcCount?: number;
  /** Whether to randomize NPC entries on each refresh. Default: true. */
  readonly randomizeOnRefresh?: boolean;
}

export class LeaderboardService {
  private readonly npcCount: number;
  private readonly randomizeOnRefresh: boolean;
  private cachedEntries: LeaderboardEntry[] = [];
  private lastRefreshTime = 0;

  public constructor(
    private readonly context: GameContext,
    options: LeaderboardServiceOptions = {},
  ) {
    this.npcCount = options.npcCount ?? 30;
    this.randomizeOnRefresh = options.randomizeOnRefresh ?? true;
  }

  /** Get the current leaderboard view, refreshing if stale. */
  public getLeaderboard(): LeaderboardView {
    const now = Date.now();
    // Refresh every 60 seconds or on first access
    if (this.cachedEntries.length === 0 || (this.randomizeOnRefresh && now - this.lastRefreshTime > 60_000)) {
      this.refresh();
    }
    const playerRank = this.cachedEntries.find((e) => e.isPlayer)?.rank ?? this.cachedEntries.length + 1;
    return Object.freeze({
      entries: Object.freeze([...this.cachedEntries]),
      playerRank,
      totalEntries: this.cachedEntries.length,
      lastUpdated: this.lastRefreshTime,
    });
  }

  /** Force refresh the leaderboard. */
  public refresh(): void {
    const player = this.context.player;
    const playerEntry: LeaderboardEntry = {
      rank: 0,
      name: '你',
      sectName: this.context.sect.current()?.name ?? '未选择宗门',
      careerLevel: player.careerLevel,
      careerName: this.context.career.current().name,
      cultivationExp: player.cultivationExp,
      isPlayer: true,
    };

    const npcEntries = generateMockEntries(this.npcCount, player.careerLevel, player.cultivationExp);
    const allEntries = [...npcEntries, playerEntry];

    // Sort by career level (desc), then by cultivation exp (desc)
    allEntries.sort((a, b) => {
      if (b.careerLevel !== a.careerLevel) return b.careerLevel - a.careerLevel;
      return b.cultivationExp - a.cultivationExp;
    });

    // Assign ranks
    for (let i = 0; i < allEntries.length; i++) {
      (allEntries[i] as { rank: number }).rank = i + 1;
    }

    this.cachedEntries = allEntries;
    this.lastRefreshTime = Date.now();
  }

  /** Get the player's current rank. */
  public getPlayerRank(): number {
    return this.getLeaderboard().playerRank;
  }

  /** Get top N entries. */
  public getTopN(n: number): readonly LeaderboardEntry[] {
    return this.getLeaderboard().entries.slice(0, n);
  }

  /** Get entries around the player (±5). */
  public getAroundPlayer(radius = 5): readonly LeaderboardEntry[] {
    const view = this.getLeaderboard();
    const playerIndex = view.entries.findIndex((e) => e.isPlayer);
    if (playerIndex < 0) return view.entries.slice(0, radius * 2 + 1);
    const start = Math.max(0, playerIndex - radius);
    const end = Math.min(view.entries.length, playerIndex + radius + 1);
    return view.entries.slice(start, end);
  }
}