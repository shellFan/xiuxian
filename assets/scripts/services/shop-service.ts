/**
 * ShopService — 统一商店（V31-T7，任务书§13/§5.13）。
 *
 * 派生式设计（零存档 schema 变更）：
 *  - 每日限购持久化走 player.lifetimeStats 键 `shopBought:<goodsId>:<dayKey>`（UTC 日，与
 *    DailyTaskService 日界一致）；key 存在即当日已购次数（值=次数）。
 *  - 交易统一走 EffectService（扣货币 + 发效果，事务化）——禁止 UI 自扣。
 *  - 扣费语义：货币字段（salary/spiritStones）直接扣减 + spiritStonesChanged 事件（与
 *    craft-service 同模式）；效果发放经 effects.apply（含账本/回滚）。
 *  - 事务一致性：扣费与发货在同一 apply 前后，save 失败全回滚（先扣后发、失败全还）。
 */

import type { GameContext } from '../core/game-context';
import type { Clock } from '../core/clock';
import { DEFAULT_CLOCK } from '../core/clock';
import type { GameEffect } from '../model/game-effect';

// ── Config ───────────────────────────────────────────────────────────────────

export type ShopCurrency = 'salary' | 'spiritStones';

/** 商店效果 = 统一效果通道四键 + 灵石（灵石直加不走 effects 通道，与 craft 扣减同语义）。 */
export type ShopEffect = GameEffect & { readonly spiritStones?: number };

export interface ShopGoodConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly currency: ShopCurrency;
  readonly price: number;
  /** 每日限购次数（UTC 日刷新，与 DailyTaskService 日界一致）。 */
  readonly stockPerDay: number;
  readonly careerLevel: number;
  readonly effect: ShopEffect;
}

export interface ShopConfig {
  readonly schemaVersion: number;
  readonly status: string;
  readonly goods: readonly ShopGoodConfig[];
}

// ── View / Result ────────────────────────────────────────────────────────────

export interface ShopGoodView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly currency: ShopCurrency;
  readonly price: number;
  readonly careerLevel: number;
  readonly unlocked: boolean;
  readonly boughtToday: number;
  readonly stockPerDay: number;
  readonly soldOut: boolean;
  readonly canBuy: boolean;
  readonly reason?: string;
}

export interface ShopBuyResult {
  readonly success: boolean;
  readonly goodsId?: string;
  readonly reason?: string;
}

// ── Service ──────────────────────────────────────────────────────────────────

const BOUGHT_PREFIX = 'shopBought:';

export class ShopService {
  private readonly goods: readonly ShopGoodConfig[];
  private readonly clock: Clock;

  public constructor(
    private readonly context: GameContext,
    config?: ShopConfig,
    options: { clock?: Clock } = {},
  ) {
    this.goods = Object.freeze([...(config?.goods ?? [])]);
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.validate();
  }

  public get allGoods(): readonly ShopGoodConfig[] {
    return this.goods;
  }

  /** UTC 日键（与 DailyTaskService 日界一致：北京时间 08:00 刷新）。 */
  private dayKey(): string {
    return new Date(this.clock.now()).toISOString().slice(0, 10);
  }

  private boughtToday(goodsId: string): number {
    const key = BOUGHT_PREFIX + goodsId + ':' + this.dayKey();
    return this.context.player.lifetimeStats[key] ?? 0;
  }

  private goodsById(id: string): ShopGoodConfig | undefined {
    return this.goods.find((g) => g.id === id);
  }

  /** 全商品视图（含解锁/限购/可购判定）。 */
  public getView(): readonly ShopGoodView[] {
    return this.goods.map((g) => {
      const player = this.context.player;
      const unlocked = player.careerLevel >= g.careerLevel;
      const boughtToday = this.boughtToday(g.id);
      const soldOut = boughtToday >= g.stockPerDay;
      const currencyEnough = g.currency === 'salary' ? player.salary >= g.price : player.spiritStones >= g.price;
      const canBuy = unlocked && !soldOut && currencyEnough;
      return {
        id: g.id,
        name: g.name,
        description: g.description,
        currency: g.currency,
        price: g.price,
        careerLevel: g.careerLevel,
        unlocked,
        boughtToday,
        stockPerDay: g.stockPerDay,
        soldOut,
        canBuy,
        reason: !unlocked ? `职级 Lv.${g.careerLevel} 解锁`
          : soldOut ? '今日已售罄'
          : !currencyEnough ? (g.currency === 'salary' ? '工资不足' : '灵石不足')
          : undefined,
      };
    });
  }

  /**
   * 购买：扣货币 → effects.apply 发货（事务化：save 失败全回滚）→ 计入当日限购。
   * 防重复：限购键在发货成功后写入；同事务内原子。
   */
  public buy(goodsId: string): ShopBuyResult {
    const g = this.goodsById(goodsId);
    if (!g) return { success: false, reason: '商品不存在' };
    const player = this.context.player;
    if (player.careerLevel < g.careerLevel) return { success: false, reason: `职级 Lv.${g.careerLevel} 解锁` };
    const boughtToday = this.boughtToday(g.id);
    if (boughtToday >= g.stockPerDay) return { success: false, reason: '今日已售罄' };
    const currencyEnough = g.currency === 'salary' ? player.salary >= g.price : player.spiritStones >= g.price;
    if (!currencyEnough) return { success: false, reason: g.currency === 'salary' ? '工资不足' : '灵石不足' };

    const statsBefore = player.lifetimeStats;
    const salaryBefore = player.salary;
    const stonesBefore = player.spiritStones;
    const dayKey = this.dayKey();
    const boughtKey = BOUGHT_PREFIX + g.id + ':' + dayKey;

    // 1. 扣货币
    if (g.currency === 'salary') {
      player.salary -= g.price;
      this.context.events.emit('salaryChanged', { amount: -g.price, total: player.salary });
    } else {
      player.spiritStones -= g.price;
      this.context.events.emit('spiritStonesChanged', { amount: -g.price, total: player.spiritStones });
    }
    // 2. 计入当日限购
    player.lifetimeStats = { ...statsBefore, [boughtKey]: boughtToday + 1 };
    // 3. 发货（统一效果通道 + 灵石直加；失败全回滚）
    const effect = g.effect;
    const stoneGain = effect.spiritStones ?? 0;
    const coreEffect: GameEffect = {
      salary: effect.salary,
      performance: effect.performance,
      cultivation: effect.cultivation,
      mind: effect.mind,
    };
    try {
      if (stoneGain !== 0) {
        player.spiritStones += stoneGain;
        this.context.events.emit('spiritStonesChanged', { amount: stoneGain, total: player.spiritStones });
      }
      if (coreEffect.salary !== undefined || coreEffect.performance !== undefined || coreEffect.cultivation !== undefined || coreEffect.mind !== undefined) {
        this.context.effects.apply(coreEffect);
      }
      this.context.saveService.save(player);
    } catch (error) {
      player.lifetimeStats = statsBefore;
      player.salary = salaryBefore;
      player.spiritStones = stonesBefore;
      throw error;
    }
    return { success: true, goodsId: g.id };
  }

  private validate(): void {
    const ids = new Set<string>();
    for (const g of this.goods) {
      if (ids.has(g.id)) throw new Error(`Duplicate shop goods id: ${g.id}`);
      ids.add(g.id);
      if (g.price <= 0) throw new Error(`Shop goods ${g.id}: price must be > 0`);
      if (g.stockPerDay <= 0) throw new Error(`Shop goods ${g.id}: stockPerDay must be > 0`);
      if (g.currency !== 'salary' && g.currency !== 'spiritStones') {
        throw new Error(`Shop goods ${g.id}: currency must be salary or spiritStones`);
      }
    }
  }
}
