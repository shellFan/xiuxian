/**
 * EventEngine V2（Gameplay V2 §31~§42）— 配置驱动事件系统。
 *
 * 架构：
 *  - EventDefinition：纯配置（assets/configs/v2/events.json），含权重/条件/冷却/链。
 *  - EventChoice：选择项，支持 requirements（Build/NPC 门控隐藏选项）、成功率分支、后续链事件。
 *  - 条件/effects 由本引擎内的 evaluators 解释执行；未知类型在 content:check 中报错。
 *  - 调度：scheduler 按 nextEventTimestamp 出事件（§186），同 id 冷却 + 负面连击保护（§189）。
 *  - 离线：CRITICAL/IMPORTANT 进 pendingEvents（上限 5，§41），FLAVOR 自动结算。
 *
 * 引擎不直接改资源——所有 effects 走 EffectApplier（由 GameContext 装配时注入），
 * 便于模拟器/测试复用同一套结算逻辑。
 */
import type { PendingEventState } from '../model/save-data';
import type { Rng } from './random-service';

// ── 配置类型（§31/§32） ─────────────────────────────────────────────────────

export type EventCategory = 'WORK' | 'BOSS' | 'BUG' | 'PRODUCT' | 'NPC' | 'SECRET' | 'MEETING' | 'CHAIN';
export type EventRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type EventPriority = 'CRITICAL' | 'IMPORTANT' | 'NORMAL' | 'FLAVOR';

/** V4：事件可以随手打开一个责任案件/指派任务/事故会话。 */
export interface AssignedTaskEffectSpec {
  readonly title: string;
  readonly detail?: string;
  readonly priority: 'P0' | 'P1' | 'P2' | 'P3';
  readonly source: 'BOSS' | 'COLLEAGUE' | 'PRODUCT' | 'TEST' | 'CLIENT' | 'INCIDENT' | 'SYSTEM';
  readonly rewardSalary?: number;
  readonly rewardPerformance?: number;
  readonly rewardCultivation?: number;
  readonly rewardMind?: number;
  readonly isFakeP0?: boolean;
}

export interface OpenCaseEffectSpec {
  readonly sourceNpc: string;
  readonly actualOwnerNpc: string;
  readonly blamedPlayer?: boolean;
  readonly cause: string;
  readonly severity: 'S1' | 'S2' | 'S3' | 'S4';
  readonly relatedIncidentId?: string;
}

export interface RaiseIncidentEffectSpec {
  readonly type: string;
  readonly severity: 'S1' | 'S2' | 'S3' | 'S4';
  readonly forcedRelease?: boolean;
  readonly riskConfirmed?: boolean;
}

export interface EventEffects {
  salary?: number;
  cultivation?: number;
  performance?: number;
  /** 道心增减（负=流失）。 */
  mind?: number;
  innerDemon?: number;
  /** NPC 关系变化：npcId → delta。 */
  relationship?: Record<string, number>;
  /** 材料变化：materialId → count。 */
  material?: Record<string, number>;
  /** 工资消耗（买东西/罚款）：正数=扣工资。 */
  salaryCost?: number;
  /** 获得功法/装备/消耗品。 */
  grantTechnique?: string;
  grantEquipment?: string;
  grantConsumable?: string;
  /** buff：buffId → 持续秒数。 */
  buff?: Record<string, number>;
  /** 设置/清除事件旗标。 */
  setFlags?: string[];
  removeFlags?: string[];
  /** 后续链事件 id（链引擎消费）。 */
  nextEvent?: string;
  /** 晋升成功率修正（临时，日结算清除）。 */
  promotionModifier?: number;
  /** 晋升冷却天数。 */
  promotionCooldownDays?: number;
  // ── V4 职场地狱扩展 ──
  /** 获得证据（§18~§21：解锁事件选项 + 复盘定责）。 */
  evidence?: { type: string; label: string };
  /** 指派临时任务（§33~§40）。 */
  assignTask?: AssignedTaskEffectSpec;
  /** 打开责任案件（§15~§17）。 */
  openCase?: OpenCaseEffectSpec;
  /** 触发生产事故（§25）。 */
  raiseIncident?: RaiseIncidentEffectSpec;
  /** 技术债变化：domain → delta（§48~§50）。 */
  techDebt?: Record<string, number>;
  /** 直接开始一段加班会话（强制加班类事件）。 */
  startOvertime?: { source: 'FORCED' | 'REQUESTED' | 'EMERGENCY' | 'COMPENSATED'; free: boolean; plannedMinutes: number };
}

export interface EventChoiceRequirements {
  /** 最低/最高职级。 */
  minCareer?: number;
  maxCareer?: number;
  /** 关系门控：npcId → 最低关系值。 */
  relationship?: Record<string, number>;
  /** 需要拥有功法/装备。 */
  technique?: string;
  equipment?: string;
  /** 需要材料：materialId → count。 */
  material?: Record<string, number>;
  /** 需要事件旗标/道心区间。 */
  eventFlag?: string;
  minMind?: number;
  maxMind?: number;
  /** V4：需要持有某类证据（§20 证据解锁选项）。 */
  evidence?: string;
}

export interface EventChoice {
  readonly id: string;
  readonly text: string;
  /** 选择后显示的结果文案模板。 */
  readonly resultText?: string;
  /** 门控条件；不满足时选项隐藏（Build 隐藏选项 §125）。 */
  readonly requirements?: EventChoiceRequirements;
  /** 成功率（0~1）；缺省 1。 */
  readonly successChance?: number;
  readonly effects?: EventEffects;
  readonly successEffects?: EventEffects;
  readonly failureEffects?: EventEffects;
  /** 选择后跳转的链事件。 */
  readonly nextEvent?: string;
  readonly setFlags?: string[];
}

export interface EventDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: EventCategory;
  readonly rarity: EventRarity;
  readonly priority: EventPriority;
  /** 基础权重（调度时与局势 eventWeights 相乘）。 */
  readonly baseWeight: number;
  readonly minCareer?: number;
  readonly maxCareer?: number;
  /** 允许触发的工作模式；缺省全部。 */
  readonly allowedModes?: readonly string[];
  /** 当天分钟窗口（0=00:00）；端点包含，start > end 表示跨午夜窗口。 */
  readonly minMinuteOfDay?: number;
  readonly maxMinuteOfDay?: number;
  /** 仅在显式加班会话进行时可触发。 */
  readonly requiresOvertime?: boolean;
  /** 默认工作日事件不在周末触发；此字段允许周末内容。 */
  readonly allowWeekend?: boolean;
  /** 内容分类：夜班 Boss，供内容校验和后续 dungeon 投影使用。 */
  readonly isNightBoss?: boolean;
  readonly conditions?: EventChoiceRequirements;
  /** 同事件再次触发冷却（秒）。 */
  readonly cooldown?: number;
  readonly oncePerDay?: boolean;
  readonly onceEver?: boolean;
  /** 所属事件链 id。 */
  readonly chainId?: string;
  /** 链内阶段（0 起始）。 */
  readonly chainStage?: number;
  readonly choices?: readonly EventChoice[];
  /** 无选项事件（FLAVOR 自动结算）的直接效果。 */
  readonly effects?: EventEffects;
}

export interface EventsConfig {
  readonly events: readonly EventDefinition[];
}

// ── 条件评估 ─────────────────────────────────────────────────────────────────

/** 引擎对游戏状态的最小读取接口（由 facade/context 适配）。 */
export interface EventWorldState {
  careerLevel: number;
  workMode: string;
  mind: number;
  innerDemon: number;
  salary: number;
  cultivation: number;
  weekday: number;
  /** 当前小时（0-23）。 */
  hour: number;
  /** 当前当天分钟（0-1439）；旧调用方缺省时由 hour 推导。 */
  minuteOfDay?: number;
  /** 是否存在 ACTIVE 加班会话。 */
  overtimeActive?: boolean;
  /** 今日局势 modifier ids。 */
  situationIds: string[];
  sectId: string | null;
  relationships: Record<string, number>;
  materials: Record<string, number>;
  ownedTechniques: readonly string[];
  ownedEquipment: readonly string[];
  eventFlags: Record<string, boolean>;
  /** 今日局势聚合出的事件类别权重（category → multiplier）。 */
  eventWeights?: Record<string, number>;
  /** V4：玩家持有的证据类型（evidence 门控）。 */
  evidenceTypes?: readonly string[];
}

export function checkRequirements(req: EventChoiceRequirements | undefined, world: EventWorldState): boolean {
  if (!req) return true;
  if (req.minCareer !== undefined && world.careerLevel < req.minCareer) return false;
  if (req.maxCareer !== undefined && world.careerLevel > req.maxCareer) return false;
  if (req.relationship) {
    for (const [npc, min] of Object.entries(req.relationship)) {
      if ((world.relationships[npc] ?? 0) < min) return false;
    }
  }
  if (req.technique && !world.ownedTechniques.includes(req.technique)) return false;
  if (req.equipment && !world.ownedEquipment.includes(req.equipment)) return false;
  if (req.material) {
    for (const [mat, count] of Object.entries(req.material)) {
      if ((world.materials[mat] ?? 0) < count) return false;
    }
  }
  if (req.eventFlag && !world.eventFlags[req.eventFlag]) return false;
  if (req.evidence && !(world.evidenceTypes ?? []).includes(req.evidence)) return false;
  if (req.minMind !== undefined && world.mind < req.minMind) return false;
  if (req.maxMind !== undefined && world.mind > req.maxMind) return false;
  return true;
}

export function checkEventConditions(def: EventDefinition, world: EventWorldState): boolean {
  if (def.minCareer !== undefined && world.careerLevel < def.minCareer) return false;
  if (def.maxCareer !== undefined && world.careerLevel > def.maxCareer) return false;
  if (def.allowedModes && !def.allowedModes.includes(world.workMode)) return false;
  if (!checkRequirements(def.conditions, world)) return false;
  const isWeekend = world.weekday === 0 || world.weekday === 6;
  // 工作日内容不会挤入周末；周末夜班内容必须显式声明。
  if (isWeekend && !def.allowWeekend) return false;
  if (def.requiresOvertime && !world.overtimeActive) return false;
  if (def.minMinuteOfDay !== undefined || def.maxMinuteOfDay !== undefined) {
    const start = def.minMinuteOfDay ?? 0;
    const end = def.maxMinuteOfDay ?? 1439;
    const minute = world.minuteOfDay ?? world.hour * 60;
    const inWindow = start <= end ? minute >= start && minute <= end : minute >= start || minute <= end;
    if (!inWindow) return false;
  }
  return true;
}

/** 事件对玩家可见的选择（requirements 通过 + 非隐藏）。 */
export function visibleChoices(def: EventDefinition, world: EventWorldState): EventChoice[] {
  return (def.choices ?? []).filter((c) => checkRequirements(c.requirements, world));
}

// ── 调度器 ───────────────────────────────────────────────────────────────────

export interface SchedulerState {
  /** 下次事件可触发的时间戳（ms）。 */
  nextEventAt: number;
  /** 同 id → 上次触发时间戳。 */
  lastFiredAt: Record<string, number>;
  /** 今日已触发事件 id 集合（oncePerDay）。 */
  firedToday: string[];
  /** 连续负面事件计数（负面连击保护 §189）。 */
  negativeStreak: number;
  /** 今日窗口标识（dayIndex，用于 firedToday 清空）。 */
  firedTodayDay: number;
}

export interface SchedulerConfig {
  /** 活跃在线平均 10~25 分钟一个重要事件（§239）。 */
  readonly minGapMs: number;
  readonly maxGapMs: number;
  /** 连续负面事件阈值。 */
  readonly negativeStreakThreshold: number;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  minGapMs: 10 * 60_000,
  maxGapMs: 25 * 60_000,
  negativeStreakThreshold: 3,
};

export interface ScheduledPick {
  readonly def: EventDefinition;
  readonly priority: EventPriority;
}

export class EventScheduler {
  public state: SchedulerState;
  public readonly config: SchedulerConfig;

  public constructor(config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG, state?: Partial<SchedulerState>) {
    this.config = config;
    this.state = {
      nextEventAt: state?.nextEventAt ?? 0,
      lastFiredAt: { ...(state?.lastFiredAt ?? {}) },
      firedToday: [...(state?.firedToday ?? [])],
      negativeStreak: state?.negativeStreak ?? 0,
      firedTodayDay: state?.firedTodayDay ?? 0,
    };
  }

  /** 是否到点（§186：按 nextEventTimestamp，不逐帧 roll）。 */
  public isDue(nowMs: number, dayIndex: number): boolean {
    if (this.state.firedTodayDay !== dayIndex) {
      this.state.firedToday = [];
      this.state.firedTodayDay = dayIndex;
    }
    return nowMs >= this.state.nextEventAt;
  }

  /** 随机选一个当前可触发事件；无可触发返回 null。 */
  public pick(defs: readonly EventDefinition[], world: EventWorldState, rng: Rng, nowMs: number): EventDefinition | null {
    const eligible = defs.filter((def) => {
      if (def.onceEver && this.state.firedToday.includes('once:' + def.id)) return false;
      if (def.oncePerDay && this.state.firedToday.includes(def.id)) return false;
      const last = this.state.lastFiredAt[def.id];
      if (last !== undefined && def.cooldown !== undefined && nowMs - last < def.cooldown * 1000) return false;
      return checkEventConditions(def, world);
    });
    if (!eligible.length) return null;

    const weights = eligible.map((def) => {
      let weight = def.baseWeight;
      // 局势权重放大：GameDayService.aggregateEffects().eventWeights 按 category 聚合。
      const sitWeight = world.eventWeights?.[def.category];
      if (sitWeight !== undefined && sitWeight > 0) weight *= sitWeight;
      // 负面连击保护：稀有/正面事件加权由调用方通过 world 传入（此处按 rarity 简化：负面连击时 RARE 加权）
      if (this.state.negativeStreak >= this.config.negativeStreakThreshold && (def.rarity === 'RARE' || def.rarity === 'EPIC')) {
        weight *= 1.5;
      }
      return weight;
    });
    const idx = rng.weightedIndex(weights);
    if (idx < 0) return null;
    return eligible[idx];
  }

  /** 记录触发（冷却/一次性/负面计数由结算结果驱动）。 */
  public markFired(def: EventDefinition, nowMs: number): void {
    this.state.lastFiredAt[def.id] = nowMs;
    if (def.oncePerDay) this.state.firedToday.push(def.id);
    if (def.onceEver) this.state.firedToday.push('once:' + def.id);
    this.scheduleNext(nowMs);
  }

  /** 排下一次事件窗口。 */
  public scheduleNext(nowMs: number, rng?: Rng): void {
    const gap = rng
      ? rng.int(this.config.minGapMs, this.config.maxGapMs)
      : this.config.minGapMs + Math.floor(Math.random() * (this.config.maxGapMs - this.config.minGapMs));
    this.state.nextEventAt = nowMs + gap;
  }

  /** 结算结果回报：负面事件 → 连击+1；正面/中性 → 清零。 */
  public reportOutcome(impact: 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE'): void {
    if (impact === 'NEGATIVE') this.state.negativeStreak += 1;
    else this.state.negativeStreak = 0;
  }
}

// ── Pending Events（§41/§42） ────────────────────────────────────────────────

export const MAX_PENDING_EVENTS = 5;

/** 离线事件分流：重要事件入 pending，FLAVOR 返回待自动结算列表。 */
export function triageOfflineEvents(
  defs: readonly EventDefinition[],
  pending: PendingEventState[],
): { toPending: EventDefinition[]; autoResolve: EventDefinition[] } {
  const toPending: EventDefinition[] = [];
  const autoResolve: EventDefinition[] = [];
  const room = MAX_PENDING_EVENTS - pending.length;
  for (const def of defs) {
    if (def.priority === 'FLAVOR' || (!def.choices && !def.priority.startsWith('CRITICAL') && def.priority === 'NORMAL')) {
      autoResolve.push(def);
    } else if (toPending.length < Math.max(0, room)) {
      toPending.push(def);
    } else {
      autoResolve.push(def); // 队列满：降级自动结算，避免回来 20 个弹窗
    }
  }
  return { toPending, autoResolve };
}
