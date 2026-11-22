/**
 * TalentTreeService — 五路线天赋成长系统（V12-R2，任务书§第六部分）。
 *
 * 派生式状态设计（与 RealmService 同模式，零存档 schema 变更）：
 *  - 节点等级持久化走 player.lifetimeStats 开放键：`talentNode:<id>` = 当前等级（0..maxRank）
 *  - 已花天赋点：`talentSpent`（数值）
 *  - 天赋点总量派生：careerLevel（1 点/级）+ 已通过渡劫门 ×2（realmHighestReached 换算）
 *  - 效果载体：BuffService（WORK_SALARY_BOOST 等既有通路 + R2 新增 NPC_FAVOR_BOOST /
 *    CRAFT_SUCCESS_BOOST / CRAFT_COST_REDUCTION）。buff 不持久化 → applyAllActiveBuffs()
 *    在 GameContext 构造时按节点等级重施（等价永久，派生式）。
 *  - 重置：整路线退点 50%，移除该路线全部 buff
 *  - 前置依赖：每路线节点按 tier 链式 requires（上一节点 rank ≥ 1）
 *
 * 每节点效果 = addBuff(buffType, 1 + multPerRank×rank − (multPerRank<1 ? 0 : 0), 长时效)。
 * 折扣类载体（CRAFT_COST_REDUCTION）multPerRank 为负向系数（0.96~0.97，乘法叠加）。
 */

import type { GameContext } from '../core/game-context';
import type { Clock } from '../core/clock';
import { DEFAULT_CLOCK } from '../core/clock';
import type { RandomProvider } from '../core/random-provider';
import { DEFAULT_RANDOM_PROVIDER } from '../core/random-provider';
import type { BuffType } from './buff-service';

// ── Config types ─────────────────────────────────────────────────────────────

export interface TalentNodeConfig {
  readonly id: string;
  readonly route: string;
  readonly routeName: string;
  readonly tier: number;
  readonly name: string;
  readonly description: string;
  readonly buffType: BuffType | null;
  /** 每级乘子增量：>1 为增益乘子（1+x/级），<1 为折扣系数（直接作为乘子系数）。 */
  readonly multPerRank: number;
  readonly maxRank: number;
  readonly costPerRank: number;
  readonly requires: string | null;
}

export interface TalentTreeConfig {
  readonly schemaVersion: number;
  readonly status: string;
  readonly routes: readonly { readonly id: string; readonly name: string; readonly description: string }[];
  readonly nodes: readonly TalentNodeConfig[];
}

// ── View / Result ────────────────────────────────────────────────────────────

export interface TalentNodeView {
  readonly id: string;
  readonly route: string;
  readonly name: string;
  readonly description: string;
  readonly tier: number;
  readonly rank: number;
  readonly maxRank: number;
  readonly costPerRank: number;
  readonly requires: string | null;
  readonly requiresMet: boolean;
  readonly canUpgrade: boolean;
  readonly reason?: string;
}

export interface TalentRouteView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly nodes: readonly TalentNodeView[];
  readonly spent: number;
}

export interface TalentTreeState {
  readonly totalPoints: number;
  readonly spent: number;
  readonly available: number;
  readonly routes: readonly TalentRouteView[];
}

export interface TalentUnlockResult {
  readonly success: boolean;
  readonly nodeId: string;
  readonly newRank?: number;
  readonly reason?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const NODE_KEY_PREFIX = 'talentNode:';
const SPENT_KEY = 'talentSpent';
const BUFF_KEY_PREFIX = 'talentBuff:';
const TALENT_BUFF_DURATION_SECONDS = 100_000_000;
const RESET_REFUND_RATIO = 0.5;
/** 渡劫门点数（每通过一个大境界 gate +2）。 */
const POINTS_PER_GATE = 2;

// ── Service ──────────────────────────────────────────────────────────────────

export class TalentTreeService {
  private readonly nodes: readonly TalentNodeConfig[];
  private readonly random: RandomProvider;
  private readonly clock: Clock;

  public constructor(
    private readonly context: GameContext,
    config?: TalentTreeConfig,
    options: { clock?: Clock; randomProvider?: RandomProvider } = {},
  ) {
    this.nodes = Object.freeze([...(config?.nodes ?? [])]);
    this.random = options.randomProvider ?? DEFAULT_RANDOM_PROVIDER;
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.validate();
  }

  public get allNodes(): readonly TalentNodeConfig[] {
    return this.nodes;
  }

  // ── Points ledger ─────────────────────────────────────────────────────────

  /** 天赋点总量：职级 1 点/级 + 已通过渡劫门 ×2（派生，不落盘）。 */
  public totalPoints(): number {
    const careerLevel = this.context.player.careerLevel;
    const highest = this.context.player.lifetimeStats.realmHighestReached ?? 0;
    let gatesPassed = 0;
    for (let i = 1; i <= highest; i++) {
      if (this.context.player.lifetimeStats[`realmGatePassed:${i}`] === 1) gatesPassed += 1;
    }
    return careerLevel + gatesPassed * POINTS_PER_GATE;
  }

  public spentPoints(): number {
    return this.context.player.lifetimeStats[SPENT_KEY] ?? 0;
  }

  public availablePoints(): number {
    return Math.max(0, this.totalPoints() - this.spentPoints());
  }

  // ── Node state ────────────────────────────────────────────────────────────

  public nodeRank(nodeId: string): number {
    return this.context.player.lifetimeStats[NODE_KEY_PREFIX + nodeId] ?? 0;
  }

  private setNodeRank(nodeId: string, stats: Record<string, number>, rank: number): Record<string, number> {
    return { ...stats, [NODE_KEY_PREFIX + nodeId]: rank };
  }

  private routeSpent(route: string): number {
    return this.nodes
      .filter((n) => n.route === route)
      .reduce((sum, n) => sum + n.costPerRank * this.nodeRank(n.id), 0);
  }

  // ── Views ─────────────────────────────────────────────────────────────────

  public getState(): TalentTreeState {
    const routes = (this.nodes.length > 0)
      ? this.nodesByRoute()
      : [];
    return {
      totalPoints: this.totalPoints(),
      spent: this.spentPoints(),
      available: this.availablePoints(),
      routes,
    };
  }

  private nodesByRoute(): TalentRouteView[] {
    const routeIds: string[] = [];
    for (const n of this.nodes) {
      if (!routeIds.includes(n.route)) routeIds.push(n.route);
    }
    return routeIds.map((route) => {
      const first = this.nodes.find((n) => n.route === route)!;
      const nodes = this.nodes
        .filter((n) => n.route === route)
        .map((n) => this.buildNodeView(n));
      return {
        id: route,
        name: first.routeName,
        description: '',
        nodes,
        spent: this.routeSpent(route),
      };
    });
  }

  private buildNodeView(node: TalentNodeConfig): TalentNodeView {
    const rank = this.nodeRank(node.id);
    const requiresMet = node.requires === null || this.nodeRank(node.requires) >= 1;
    const maxed = rank >= node.maxRank;
    const pointsOk = this.availablePoints() >= node.costPerRank;
    const canUpgrade = requiresMet && !maxed && pointsOk;
    return {
      id: node.id,
      route: node.route,
      name: node.name,
      description: node.description,
      tier: node.tier,
      rank,
      maxRank: node.maxRank,
      costPerRank: node.costPerRank,
      requires: node.requires,
      requiresMet,
      canUpgrade,
      reason: maxed ? '已满级' : (!requiresMet ? '需先解锁前置' : (!pointsOk ? '天赋点不足' : undefined)),
    };
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /** 升级/解锁节点：花点 → rank+1 → 重施该节点 buff（事务：save 失败回滚）。 */
  public upgradeNode(nodeId: string): TalentUnlockResult {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) return { success: false, nodeId, reason: '天赋不存在' };
    const view = this.buildNodeView(node);
    if (!view.canUpgrade) return { success: false, nodeId, reason: view.reason ?? '不可升级' };
    const player = this.context.player;
    const statsBefore = player.lifetimeStats;
    const newRank = this.nodeRank(nodeId) + 1;
    const spentBefore = this.spentPoints();

    player.lifetimeStats = this.setNodeRank(nodeId, { ...statsBefore, [SPENT_KEY]: spentBefore + node.costPerRank }, newRank);
    let buffId: string | null = null;
    try {
      if (node.buffType) {
        buffId = this.applyNodeBuff(node, newRank);
      }
      this.context.saveService.save(player);
    } catch (error) {
      player.lifetimeStats = statsBefore;
      if (buffId) this.context.buffs.removeBuff(buffId);
      throw error;
    }
    return { success: true, nodeId, newRank };
  }

  /** 重置整条路线：移除该路线 buff、清节点键、返还 50% 已花点数。 */
  public resetRoute(route: string): TalentUnlockResult {
    const routeNodes = this.nodes.filter((n) => n.route === route);
    if (routeNodes.length === 0) return { success: false, nodeId: route, reason: '路线不存在' };
    const player = this.context.player;
    const statsBefore = player.lifetimeStats;
    const refund = Math.floor(this.routeSpent(route) * RESET_REFUND_RATIO);
    const spentBefore = this.spentPoints();

    const next: Record<string, number> = { ...statsBefore };
    for (const node of routeNodes) {
      delete next[NODE_KEY_PREFIX + node.id];
      const buffKey = BUFF_KEY_PREFIX + node.id;
      if (next[buffKey]) {
        this.context.buffs.removeBuff("buff_" + next[buffKey]);
        delete next[buffKey];
      }
    }
    next[SPENT_KEY] = spentBefore - refund;
    player.lifetimeStats = next;
    try {
      this.context.saveService.save(player);
    } catch (error) {
      player.lifetimeStats = statsBefore;
      throw error;
    }
    return { success: true, nodeId: route, reason: `已重置，返还 ${refund} 天赋点` };
  }

  /** GameContext 构造后调用：按节点等级重施全部天赋 buff（派生式永久生效）。 */
  public applyAllActiveBuffs(): void {
    for (const node of this.nodes) {
      const rank = this.nodeRank(node.id);
      if (rank <= 0 || !node.buffType) continue;
      this.applyNodeBuff(node, rank);
    }
  }

  private applyNodeBuff(node: TalentNodeConfig, rank: number): string {
    if (!node.buffType) throw new Error(`Node ${node.id} has no buff carrier`);
    // 语义：multPerRank > 1 = 增益基值（1+x/级 → 1+(x×rank)）；multPerRank < 1 = 折扣系数（乘法叠加 mult^rank）
    const multiplier = node.multPerRank > 1
      ? 1 + (node.multPerRank - 1) * rank
      : Math.pow(node.multPerRank, rank);
    const buffId = this.context.buffs.addBuff(node.buffType, Math.round(multiplier * 10000) / 10000, TALENT_BUFF_DURATION_SECONDS);
    const player = this.context.player;
    const stats: Record<string, number> = { ...player.lifetimeStats };
    // 记录 buff id 以便升级/重置时移除旧 buff
    const old = stats[BUFF_KEY_PREFIX + node.id];
    if (old) this.context.buffs.removeBuff("buff_" + old);
    stats[BUFF_KEY_PREFIX + node.id] = Number.parseInt(buffId.replace('buff_', ''), 10) || 0;
    player.lifetimeStats = stats;
    return buffId;
  }

  // ── Validation ────────────────────────────────────────────────────────────

  private validate(): void {
    const ids = new Set<string>();
    for (const node of this.nodes) {
      if (ids.has(node.id)) throw new Error(`Duplicate talent node id: ${node.id}`);
      ids.add(node.id);
      if (node.maxRank <= 0) throw new Error(`Talent node ${node.id}: maxRank must be > 0`);
      if (node.costPerRank <= 0) throw new Error(`Talent node ${node.id}: costPerRank must be > 0`);
      if (node.requires !== null && !ids.has(node.requires)) {
        throw new Error(`Talent node ${node.id}: requires unknown node ${node.requires}`);
      }
      if (node.buffType === null && node.multPerRank !== 0) {
        // 无载体节点（纯展示）暂不支持——全部节点必须有载体
        throw new Error(`Talent node ${node.id}: nodes without buffType must have multPerRank 0`);
      }
    }
  }
}
