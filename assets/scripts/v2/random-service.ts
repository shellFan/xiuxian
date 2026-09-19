/**
 * RandomService（Gameplay V2 §144/§145）— 统一随机服务。
 *
 *  - mulberry32：确定性种子 RNG，用于"今日局势""每日事件种子"等需要可复现的场景。
 *  - RandomService：封装运行时随机与种子随机两条路径，替代散落的 Math.random。
 */

/** mulberry32 — 快速、质量足够的 32 位种子 PRNG，返回 [0,1)。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** [0,1) */
  next(): number;
  /** [min,max] 整数。 */
  int(minInclusive: number, maxInclusive: number): number;
  /** 从数组中取一个元素；空数组返回 undefined。 */
  pick<T>(items: readonly T[]): T | undefined;
  /** true 的概率为 chance（0~1）。 */
  chance(chance: number): boolean;
  /** 按权重取下标；总权重<=0 时返回 -1。 */
  weightedIndex(weights: readonly number[]): number;
  /** 原地洗牌（返回同一数组）。 */
  shuffle<T>(items: T[]): T[];
}

export function createRng(rng: () => number): Rng {
  return {
    next: rng,
    int(minInclusive, maxInclusive) {
      if (maxInclusive < minInclusive) return minInclusive;
      return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
    },
    pick(items) {
      if (!items.length) return undefined;
      return items[Math.floor(rng() * items.length)];
    },
    chance(chance) {
      return rng() < chance;
    },
    weightedIndex(weights) {
      let total = 0;
      for (const w of weights) total += Math.max(0, w);
      if (total <= 0) return -1;
      let roll = rng() * total;
      for (let i = 0; i < weights.length; i += 1) {
        roll -= Math.max(0, weights[i]);
        if (roll < 0) return i;
      }
      return weights.length - 1;
    },
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    },
  };
}

/**
 * RandomService — 运行时随机（非确定性）+ 按种子派生（确定性）。
 * 每日系统统一用 `forDay(dayIndex)` 派生，保证同一天可复现。
 */
export class RandomService {
  public constructor(private readonly runtimeSource: () => number = Math.random) {}

  public next(): number { return this.runtimeSource(); }

  public rng(): Rng { return createRng(this.runtimeSource); }

  /** 按任意种子派生确定性 RNG。 */
  public seeded(seed: number): Rng { return createRng(mulberry32(seed)); }

  /** 今日局势/事件种子：dayIndex + 盐，跨模块稳定可复现。 */
  public forDay(dayIndex: number, salt = 0): Rng {
    return createRng(mulberry32((Math.floor(dayIndex) * 2654435761 + salt * 40503) >>> 0));
  }
}
