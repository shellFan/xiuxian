/**
 * V5.9-O.2 卡牌战斗确定性随机数。
 *
 * mulberry32（与 v2/random-service.ts 同族算法）但状态可完整序列化：
 * { seed, counter } 进存档，恢复后随机序列可回放。战斗关键结算
 * （洗牌、抽牌、暴击、意图、掉落）必须全部经由本类，禁止 Math.random。
 */
import type { CardRngState } from './card-types';

export class CardRng {
  private state: CardRngState;

  public constructor(seed: number, counter = 0) {
    this.state = { seed: seed >>> 0, counter };
  }

  /** 恢复存档中的随机状态。 */
  public static fromState(state: CardRngState): CardRng {
    return new CardRng(state.seed, state.counter);
  }

  /** 当前可序列化状态（出参快照，避免共享引用）。 */
  public toState(): CardRngState {
    return { seed: this.state.seed, counter: this.state.counter };
  }

  /** 回写状态（存档恢复后同步引擎内 rng）。 */
  public loadState(state: CardRngState): void {
    this.state = { seed: state.seed >>> 0, counter: state.counter };
  }

  /**
   * [0,1) 浮点。splitmix32 计数器式哈希：输出只依赖 (seed, counter)，
   * 因此状态可无损序列化/回放（经典 mulberry32 的演化态无法反序列化续跑）。
   */
  public next(): number {
    let x = (this.state.seed + Math.imul(this.state.counter + 1, 0x9e3779b9)) | 0;
    this.state.counter = (this.state.counter + 1) >>> 0;
    let t = (x ^ (x >>> 16)) | 0;
    t = Math.imul(t, 0x21f0aaad);
    t = (t ^ (t >>> 15)) | 0;
    t = Math.imul(t, 0x735a2d97);
    t = (t ^ (t >>> 15)) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** [min,max] 闭区间整数。 */
  public int(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 概率判定。 */
  public chance(p: number): boolean {
    return this.next() < p;
  }

  /** 非空数组取一。 */
  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('CardRng.pick: empty list');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** 原地 Fisher-Yates 洗牌。 */
  public shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
    return items;
  }

  /** 加权抽取（weights 与 items 等长）。 */
  public weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
    if (total <= 0) return this.pick(items);
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i += 1) {
      roll -= Math.max(0, weights[i] ?? 0);
      if (roll <= 0) return items[i]!;
    }
    return items[items.length - 1]!;
  }
}
