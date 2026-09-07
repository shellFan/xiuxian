/**
 * FriendsService — Local mock friends system for WEB V1.
 *
 * Provides a mock friends list with pre-generated NPC friends.
 * Supports sending/receiving gifts, visiting friends' offices,
 * and friend-based bonuses. No backend or real multiplayer.
 */

import type { GameContext } from '../core/game-context';

export interface FriendEntry {
  readonly id: string;
  readonly name: string;
  readonly sectName: string;
  readonly careerLevel: number;
  readonly careerName: string;
  readonly cultivationExp: number;
  readonly lastOnline: number; // timestamp
  readonly isOnline: boolean;
  readonly giftSent: boolean; // whether player sent gift today
  readonly giftReceived: boolean; // whether friend sent gift today
}

export interface FriendsView {
  readonly friends: readonly FriendEntry[];
  readonly totalFriends: number;
  readonly onlineCount: number;
  readonly giftsToSend: number; // friends who haven't received gift today
  readonly giftsToClaim: number; // gifts from friends not yet claimed
}

/** Pre-generated NPC friend names. */
const FRIEND_NAMES = [
  '小明', '小红', '老王', '阿花', '大刘',
  '小张', '阿杰', '老陈', '小美', '大壮',
];

const FRIEND_SECTS = ['私企宗', '外企宗', '国企宗', '大厂宗'];

/** Generate mock friend entries. */
function generateMockFriends(count: number): FriendEntry[] {
  const now = Date.now();
  const friends: FriendEntry[] = [];
  for (let i = 0; i < count; i++) {
    const level = Math.floor(Math.random() * 8) + 1;
    const exp = Math.floor(Math.random() * level * 150) + level * 30;
    const isOnline = Math.random() > 0.6;
    const lastOnline = isOnline ? now : now - Math.floor(Math.random() * 86400_000);
    friends.push({
      id: `friend_${i + 1}`,
      name: FRIEND_NAMES[i % FRIEND_NAMES.length],
      sectName: FRIEND_SECTS[Math.floor(Math.random() * FRIEND_SECTS.length)],
      careerLevel: level,
      careerName: `Lv${level}`,
      cultivationExp: exp,
      lastOnline,
      isOnline,
      giftSent: Math.random() > 0.7,
      giftReceived: Math.random() > 0.7,
    });
  }
  return friends;
}

export interface FriendsServiceOptions {
  /** Number of mock friends. Default: 10. */
  readonly friendCount?: number;
}

export class FriendsService {
  private readonly friendCount: number;
  private cachedFriends: FriendEntry[] = [];
  private lastRefreshTime = 0;

  public constructor(
    private readonly context: GameContext,
    options: FriendsServiceOptions = {},
  ) {
    this.friendCount = options.friendCount ?? 10;
  }

  /** Get the current friends view, refreshing if stale. */
  public getFriends(): FriendsView {
    const now = Date.now();
    // Refresh every 120 seconds or on first access
    if (this.cachedFriends.length === 0 || now - this.lastRefreshTime > 120_000) {
      this.refresh();
    }
    const giftsToSend = this.cachedFriends.filter((f) => !f.giftSent).length;
    const giftsToClaim = this.cachedFriends.filter((f) => f.giftReceived).length;
    const onlineCount = this.cachedFriends.filter((f) => f.isOnline).length;
    return Object.freeze({
      friends: Object.freeze([...this.cachedFriends]),
      totalFriends: this.cachedFriends.length,
      onlineCount,
      giftsToSend,
      giftsToClaim,
    });
  }

  /** Force refresh the friends list. */
  public refresh(): void {
    this.cachedFriends = generateMockFriends(this.friendCount);
    this.lastRefreshTime = Date.now();
  }

  /** Send a gift to a friend. Returns true if successful. */
  public sendGift(friendId: string): boolean {
    const friend = this.cachedFriends.find((f) => f.id === friendId);
    if (!friend || friend.giftSent) return false;
    // Mark gift as sent
    const index = this.cachedFriends.indexOf(friend);
    this.cachedFriends[index] = { ...friend, giftSent: true };
    // Grant small spirit stones reward for sending gift
    this.context.player.spiritStones += 2;
    return true;
  }

  /** Claim a gift from a friend. Returns the reward amount. */
  public claimGift(friendId: string): number {
    const friend = this.cachedFriends.find((f) => f.id === friendId);
    if (!friend || !friend.giftReceived) return 0;
    // Mark gift as claimed (giftReceived = false)
    const index = this.cachedFriends.indexOf(friend);
    this.cachedFriends[index] = { ...friend, giftReceived: false };
    // Grant reward: 5 spirit stones
    const reward = 5;
    this.context.player.spiritStones += reward;
    return reward;
  }

  /** Claim all pending gifts. Returns total reward. */
  public claimAllGifts(): number {
    let total = 0;
    for (let i = 0; i < this.cachedFriends.length; i++) {
      if (this.cachedFriends[i].giftReceived) {
        this.cachedFriends[i] = { ...this.cachedFriends[i], giftReceived: false };
        total += 5;
      }
    }
    if (total > 0) {
      this.context.player.spiritStones += total;
    }
    return total;
  }

  /** Get a specific friend by ID. */
  public getFriend(friendId: string): FriendEntry | undefined {
    return this.cachedFriends.find((f) => f.id === friendId);
  }

  /** Get online friends. */
  public getOnlineFriends(): readonly FriendEntry[] {
    return this.getFriends().friends.filter((f) => f.isOnline);
  }
}