/**
 * RealmService — 独立修仙境界系统（V12-R1，任务书§第五部分）。
 *
 * 设计（派生式状态，零存档 schema 变更）：
 *  - 30 层（10 大境界 × 初期/中期/圆满），推进进度 = player.cultivationExp 对 realm.json 阈值
 *  - 每个大境界入口（gate）是「渡劫突破」：修为达标 + 消耗灵石 + 成功率掷骰
 *  - 突破状态持久化走 player.lifetimeStats 开放键值（sanitizeLifetime 白名单）：
 *      realmGatePassed:<index> = 1   突破成功标记
 *      realmGateFails:<index>  = n   失败次数（越挫越勇：+5%/次 补偿成功率）
 *      realmHighestReached      = n  已抵达最高层 index（成就条件 LIFETIME_STAT 源）
 *  - 突破成功 → EffectService 发奖励 + BuffService addBuff('WORK_CULTIVATION_BOOST',
 *    1+cultivationBonus, 极长时效) —— 境界加成走既有 buff 聚合通路真实生效（非空壳）
 *  - 失败不损失修为（避免完全负反馈）：损失灵石材料 + 计失败次数 + 可重试
 *
 * 架构遵循 COCOS_CREATOR_STANDARDS：Clock/RandomProvider 注入、构造期配置校验、
 * 事务化（save 失败回滚）、事件经 GameEvents 类型表。
 */

import type { GameContext } from '../core/game-context';
import type { Clock } from '../core/clock';
import { DEFAULT_CLOCK } from '../core/clock';
import type { RandomProvider } from '../core/random-provider';
import { DEFAULT_RANDOM_PROVIDER } from '../core/random-provider';

// ── Config types ─────────────────────────────────────────────────────────────

export interface RealmLayerConfig {
  readonly index: number;
  readonly realmId: string;
  readonly realmName: string;
  readonly tier: string;
  readonly name: string;
  readonly threshold: number;
  /** 大境界入口渡劫门（index>0 的每境首层）。 */
  readonly gate: boolean;
  readonly stonesCost: number;
  readonly successRate: number;
  readonly rewardSalary: number;
  /** 突破成功后的工作修为收益加成（如 0.04 = +4%），经 WORK_CULTIVATION_BOOST buff 生效。 */
  readonly cultivationBonus: number;
}

export interface RealmConfig {
  readonly schemaVersion: number;
  readonly status: string;
  readonly realms: readonly RealmLayerConfig[];
}

// ── State / Result ───────────────────────────────────────────────────────────

export type RealmStatus = 'STABLE' | 'TRIBULATION_PENDING';

export interface RealmState {
  /** 当前已稳固的层 index（最后一个 gate 已通过 或 无 gate 阻挡的最高层）。 */
  readonly layerIndex: number;
  readonly name: string;
  readonly realmName: string;
  readonly tier: string;
  readonly status: RealmStatus;
  /** 修为已达但 gate 未突破的层 index（status=TRIBULATION_PENDING 时存在）。 */
  readonly pendingGateIndex: number | null;
  readonly nextLayerIndex: number | null;
  readonly nextThreshold: number | null;
  /** 当前层到下一层的修为进度 0..1（顶层为 1）。 */
  readonly progress: number;
  /** 渡劫门信息（status=TRIBULATION_PENDING 时填充）。 */
  readonly gate: GateInfo | null;
}

export interface GateInfo {
  readonly gateIndex: number;
  readonly name: string;
  readonly stonesCost: number;
  /** 基础成功率 + 失败补偿（每失败 +5%），已钳 [0.05, 0.95]。 */
  readonly effectiveSuccessRate: number;
  readonly priorFails: number;
}

export interface BreakthroughResult {
  readonly success: boolean;
  readonly gateIndex: number;
  readonly name: string;
  readonly reason?: string;
  /** 成功后的层 index（失败时不变）。 */
  readonly layerIndex?: number;
  readonly rewardSalary?: number;
  readonly cultivationBonus?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const FAIL_COMPENSATION_PER_FAIL = 0.05;
const MIN_EFFECTIVE_RATE = 0.05;
const MAX_EFFECTIVE_RATE = 0.95;
/** 境界加成 buff 时长（秒）——远超一次会话，等效永久； buffs 按 gameSeconds 结算。 */
const REALM_BONUS_DURATION_SECONDS = 100_000_000;

const GATE_PASSED_PREFIX = 'realmGatePassed:';
const GATE_FAILS_PREFIX = 'realmGateFails:';
const HIGHEST_REACHED_KEY = 'realmHighestReached';

// ── Service ──────────────────────────────────────────────────────────────────

export class RealmService {
  private readonly layers: readonly RealmLayerConfig[];
  private readonly random: RandomProvider;
  private readonly clock: Clock;

  public constructor(
    private readonly context: GameContext,
    config?: RealmConfig,
    options: { clock?: Clock; randomProvider?: RandomProvider } = {},
  ) {
    this.layers = Object.freeze([...(config?.realms ?? [])]);
    this.random = options.randomProvider ?? DEFAULT_RANDOM_PROVIDER;
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.validate();
  }

  public get allLayers(): readonly RealmLayerConfig[] {
    return this.layers;
  }

  // ── State derivation ──────────────────────────────────────────────────────

  private gatePassed(index: number): boolean {
    if (index <= 0) return true; // 凡人及以下无需 gate
    const layer = this.layers[index];
    if (!layer?.gate) return true; // 非 gate 层随修为自动推进
    const value = this.context.player.lifetimeStats[GATE_PASSED_PREFIX + index];
    return value === 1;
  }

  private gateFails(index: number): number {
    return this.context.player.lifetimeStats[GATE_FAILS_PREFIX + index] ?? 0;
  }

  /**
   * 派生当前境界状态：修为决定候选层，未通过的 gate 阻挡推进（TRIBULATION_PENDING）。
   */
  public getState(): RealmState {
    const exp = this.context.player.cultivationExp;
    let layerIndex = 0;
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (exp < layer.threshold) break;
      if (layer.gate && !this.gatePassed(i)) {
        // 停在上一层，渡劫待突破
        return this.buildState(layerIndex, i);
      }
      layerIndex = i;
    }
    return this.buildState(layerIndex, null);
  }

  private buildState(layerIndex: number, pendingGateIndex: number | null): RealmState {
    const layer = this.layers[layerIndex] ?? this.layers[0];
    const pending = pendingGateIndex !== null ? this.layers[pendingGateIndex] : null;
    const nextIndex = pendingGateIndex !== null
      ? pendingGateIndex
      : (layerIndex + 1 < this.layers.length ? layerIndex + 1 : null);
    const nextLayer = nextIndex !== null ? this.layers[nextIndex] : null;
    const currentThreshold = layer.threshold;
    const nextThreshold = nextLayer ? nextLayer.threshold : null;
    const progress = nextThreshold !== null && nextThreshold > currentThreshold
      ? Math.max(0, Math.min(1, (this.context.player.cultivationExp - currentThreshold) / (nextThreshold - currentThreshold)))
      : 1;

    const status: RealmStatus = pending ? 'TRIBULATION_PENDING' : 'STABLE';
    return {
      layerIndex,
      name: layer.name,
      realmName: layer.realmName,
      tier: layer.tier,
      status,
      pendingGateIndex,
      nextLayerIndex: nextIndex,
      nextThreshold,
      progress,
      gate: pending
        ? {
            gateIndex: pending.index,
            name: pending.name,
            stonesCost: pending.stonesCost,
            effectiveSuccessRate: this.effectiveRate(pending),
            priorFails: this.gateFails(pending.index),
          }
        : null,
    };
  }

  private effectiveRate(layer: RealmLayerConfig): number {
    const fails = this.gateFails(layer.index);
    const rate = (layer.successRate || 1) + fails * FAIL_COMPENSATION_PER_FAIL;
    return Math.max(MIN_EFFECTIVE_RATE, Math.min(MAX_EFFECTIVE_RATE, rate));
  }

  // ── Breakthrough ──────────────────────────────────────────────────────────

  public canBreakthrough(): { can: boolean; reason?: string; gate?: RealmLayerConfig } {
    const state = this.getState();
    if (state.status !== 'TRIBULATION_PENDING' || state.pendingGateIndex === null) {
      return { can: false, reason: '未到渡劫时机' };
    }
    const gate = this.layers[state.pendingGateIndex];
    const stones = this.context.player.spiritStones;
    if (stones < gate.stonesCost) {
      return { can: false, reason: '灵石不足', gate };
    }
    return { can: true, gate };
  }

  /** 渡劫突破：消耗灵石 → 掷骰 → 成功/失败，全程事务化（save 失败回滚）。 */
  public breakthrough(): BreakthroughResult {
    const check = this.canBreakthrough();
    if (!check.can || !check.gate) {
      return { success: false, gateIndex: -1, name: '', reason: check.reason ?? '不可突破' };
    }
    const gate = check.gate;
    const player = this.context.player;

    // 1. 消耗灵石（材料）
    player.spiritStones -= gate.stonesCost;
    this.context.events.emit('spiritStonesChanged', { amount: -gate.stonesCost, total: player.spiritStones });

    // 2. 掷骰（含失败补偿）
    const rate = this.effectiveRate(gate);
    if (this.random.next() >= rate) {
      // 失败：材料已耗、不损失修为、计失败次数（越挫越勇）
      const stats = player.lifetimeStats;
      player.lifetimeStats = { ...stats, [GATE_FAILS_PREFIX + gate.index]: (stats[GATE_FAILS_PREFIX + gate.index] ?? 0) + 1 };
      try {
        this.context.saveService.save(player);
      } catch (error) {
        player.lifetimeStats = stats;
        player.spiritStones += gate.stonesCost;
        throw error;
      }
      this.context.events.emit('realmBreakthroughFailed', { gateIndex: gate.index, name: gate.name, priorFails: this.gateFails(gate.index) });
      return { success: false, gateIndex: gate.index, name: gate.name, reason: '渡劫失败，道心不减' };
    }

    // 3. 成功：登记 gate 通过 + 最高境界 + 发奖励（事务：save 失败全部回滚）
    const statsBefore = player.lifetimeStats;
    const stonesBefore = player.spiritStones;
    player.lifetimeStats = {
      ...statsBefore,
      [GATE_PASSED_PREFIX + gate.index]: 1,
      [HIGHEST_REACHED_KEY]: Math.max(statsBefore[HIGHEST_REACHED_KEY] ?? 0, gate.index),
    };
    let buffId: string | null = null;
    try {
      if (gate.rewardSalary > 0) {
        this.context.effects.apply({ salary: gate.rewardSalary });
      }
      if (gate.cultivationBonus > 0) {
        buffId = this.context.buffs.addBuff('WORK_CULTIVATION_BOOST', 1 + gate.cultivationBonus, REALM_BONUS_DURATION_SECONDS);
      }
      this.context.saveService.save(player);
    } catch (error) {
      // 回滚：lifetimeStats / 灵石 / 奖励 / buff
      player.lifetimeStats = statsBefore;
      player.spiritStones = stonesBefore;
      if (buffId) this.context.buffs.removeBuff(buffId);
      throw error;
    }

    this.context.events.emit('realmAdvanced', {
      gateIndex: gate.index,
      name: gate.name,
      realmName: gate.realmName,
      rewardSalary: gate.rewardSalary,
      cultivationBonus: gate.cultivationBonus,
    });
    return {
      success: true,
      gateIndex: gate.index,
      name: gate.name,
      layerIndex: gate.index,
      rewardSalary: gate.rewardSalary,
      cultivationBonus: gate.cultivationBonus,
    };
  }

  // ── Validation ────────────────────────────────────────────────────────────

  private validate(): void {
    if (this.layers.length === 0) throw new Error('Realm config must contain at least one layer');
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (layer.index !== i) throw new Error(`Realm layer index mismatch at ${i}: ${layer.index}`);
      if (!Number.isFinite(layer.threshold) || layer.threshold < 0) throw new Error(`Realm layer ${i}: invalid threshold`);
      if (i > 0 && layer.threshold <= this.layers[i - 1].threshold) {
        throw new Error(`Realm layer ${i}: thresholds must be strictly increasing`);
      }
      if (layer.gate && (layer.successRate <= 0 || layer.successRate > 1)) {
        throw new Error(`Realm gate ${i}: successRate must be in (0, 1]`);
      }
      if (layer.gate && (!Number.isInteger(layer.stonesCost) || layer.stonesCost < 0)) {
        throw new Error(`Realm gate ${i}: stonesCost must be a non-negative integer`);
      }
    }
  }
}
