/**
 * V2 晋升系统（Gameplay V2 §75~§83）+ 日/周结算（§92~§97）+ 今日称号（§94）。
 *
 * PromotionV2Service：
 *  - 条件（§77）：KPI 全达标（WORK_SECONDS/CULTIVATION/TASK_DONE）+ 工作天数 + 道心门槛。
 *    MERGE_COUNT 已从 KPI 配置移除（§75）。
 *  - 满足条件 → 开启答辩（§78）：3 题随机（§79），选项 tag + Build/NPC 影响得分（§81）。
 *  - 得分 ≥ 通过线 → 晋升成功（§83 反馈事件）；否则失败：不降级/不清资源（§82），
 *    心魔 +8，promotionCooldown（次日再试，§82）。
 *
 * DaySettlementService（§92/§93）：18:00 后首次触发日结算（exactly once by dayIndex），
 * 生成称号/评级/汇总，写入 dailyHistory（保留 90 天，§271）。
 * WeeklySettlementService：周五 18:00 日结算后追加周结算（§96），写 weeklyHistory。
 */
import type { GameContext } from '../core/game-context';
import type { GameClockV2 } from './v2-clock';
import type { GameDayService } from './game-day-service';
import type { InnerDemonService } from './inner-demon-service';
import type { NpcService } from './npc-weekend-service';
import type { DaySummaryState, WeeklySummaryState } from '../model/save-data';
import promoTitlesConfig from '../../configs/v2/promotion-titles.json';

interface QuestionOption {
  readonly id: string;
  readonly text: string;
  readonly tags: Readonly<Record<string, boolean>>;
}
interface PromotionQuestion {
  readonly id: string;
  readonly type: 'BLAME' | 'VALUE' | 'CRISIS' | 'DIPLO';
  readonly question: string;
  readonly options: readonly QuestionOption[];
}
interface TitleDef {
  readonly id: string;
  readonly name: string;
  readonly condition: string;
  readonly threshold: number;
  readonly desc: string;
}

const PROMO_TITLES = promoTitlesConfig as unknown as { promotionQuestions: PromotionQuestion[]; dailyTitles: TitleDef[] };

export interface PromotionCheckV2 {
  /** KPI 全达标。 */
  readonly kpiCompleted: boolean;
  /** 修为满足当前职业突破门槛。 */
  readonly cultivationOk: boolean;
  /** 工作天数达标。 */
  readonly workdaysOk: boolean;
  /** 道心 >= 30（§81 道心影响）。 */
  readonly mindOk: boolean;
  /** 是否处于冷却。 */
  readonly cooldownActive: boolean;
  readonly allowed: boolean;
  readonly reason: string;
  /** 工作天数要求/当前。 */
  readonly workdaysRequired: number;
  readonly workdaysCurrent: number;
}

export interface DefenseQuestion {
  readonly id: string;
  readonly question: string;
  readonly options: readonly { id: string; text: string }[];
}

export interface DefenseScore {
  readonly base: number;
  readonly bonuses: { source: string; value: number }[];
  readonly total: number;
  readonly passed: boolean;
  readonly passLine: number;
}

/** 每级晋升需要的工作天数（§149：L1→L2 约 1~2 工作日起步）。 */
const WORKDAYS_REQUIRED: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 21, 6: 45, 7: 65, 8: 90, 9: 120 };

export class PromotionV2Service {
  private currentQuestions: PromotionQuestion[] | null = null;

  public constructor(
    private readonly context: GameContext,
    private readonly clock: GameClockV2,
    private readonly demons: InnerDemonService,
    private readonly npc: NpcService,
  ) {}

  public check(): PromotionCheckV2 {
    const p = this.context.player;
    const kpiCompleted = this.context.kpi.isCurrentKpiCompleted();
    const level = p.careerLevel;
    const workdaysRequired = WORKDAYS_REQUIRED[level] ?? 30;
    // 累计工作天数：用 gameDay.dayIndex（每个牛马修仙日 1 计）。
    // 兼容旧档：无 gameDay 时以 workSeconds/7200 近似。
    const workdaysCurrent = Math.max(this.gameDayCount(), Math.floor(p.workSeconds / 7200));
    const cultivationOk = p.cultivationExp >= this.context.career.current().requiredExp;
    const mindOk = p.mind >= 30;
    const cooldownActive = this.cooldownRemainingDays() > 0;
    let allowed = true;
    let reason = 'READY';
    if (level >= 10) { allowed = false; reason = 'MAX_LEVEL'; }
    else if (cooldownActive) { allowed = false; reason = 'COOLDOWN'; }
    else if (!kpiCompleted) { allowed = false; reason = 'KPI_INCOMPLETE'; }
    else if (!cultivationOk) { allowed = false; reason = 'CULTIVATION_INSUFFICIENT'; }
    else if (workdaysCurrent < workdaysRequired) { allowed = false; reason = 'WORKDAYS_SHORT'; }
    else if (!mindOk) { allowed = false; reason = 'MIND_LOW'; }
    return { kpiCompleted, cultivationOk, workdaysOk: workdaysCurrent >= workdaysRequired, mindOk, cooldownActive, allowed, reason, workdaysRequired, workdaysCurrent };
  }

  private gameDayCount(): number {
    // dailyHistory 覆盖最近 90 天，dayIndex 为终身计数
    return this.context.player.gameDay?.dayIndex ?? 0;
  }

  private cooldownRemainingDays(): number {
    const p = this.context.player;
    for (const key of Object.keys(p.eventFlags)) {
      if (key.startsWith('promoCooldownUntil:')) {
        const until = Number(key.split(':')[1]);
        if (Number.isFinite(until) && this.clock.now() < until) {
          return Math.ceil((until - this.clock.now()) / 86_400_000);
        }
        delete p.eventFlags[key]; // 过期清理
      }
    }
    return 0;
  }

  /** 开始答辩：随机 3 题（§79）。 */
  public startDefense(): DefenseQuestion[] {
    const check = this.check();
    if (!check.allowed) throw new Error(`不可晋升：${check.reason}`);
    const pool = [...PROMO_TITLES.promotionQuestions];
    // Fisher-Yates 部分洗牌取 3
    const picked: PromotionQuestion[] = [];
    for (let i = 0; i < 3 && pool.length > 0; i += 1) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    this.currentQuestions = picked;
    return picked.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
    }));
  }

  /**
   * 提交答案并结算（§81/§82）。
   * 基础分 = 正确处理危机题意识；选项 tag 与 Build/NPC 产生加减成。
   * 通过线 60 分。
   */
  public submitDefense(answers: string[]): DefenseScore {
    if (!this.currentQuestions) throw new Error('尚未开始答辩');
    if (answers.length !== this.currentQuestions.length) throw new Error('答辩必须回答全部三题');
    for (let i = 0; i < this.currentQuestions.length; i += 1) {
      if (!this.currentQuestions[i].options.some((option) => option.id === answers[i])) {
        throw new Error('答辩答案无效');
      }
    }
    const p = this.context.player;
    const bonuses: { source: string; value: number }[] = [];
    let base = 50;
    // KPI 全优 / 高绩效基础加分
    if (p.performance >= 100) { base += 5; bonuses.push({ source: '绩效100+', value: 5 }); }
    if (p.mind >= 80) { base += 5; bonuses.push({ source: '道心高', value: 5 }); }

    const bossRel = this.npc.value('BOSS');
    const hrRel = this.npc.value('HR');
    if (bossRel >= 60) { bonuses.push({ source: 'BOSS信任', value: 10 }); }
    else if (bossRel >= 20) { bonuses.push({ source: 'BOSS友好', value: 5 }); }
    else if (bossRel < -20) { bonuses.push({ source: 'BOSS冷淡', value: -8 }); }
    if (hrRel >= 60) { bonuses.push({ source: 'HR信任', value: 5 }); }
    else if (hrRel >= 20) { bonuses.push({ source: 'HR友好', value: 2 }); }

    // 功法/装备加成（§81）
    const hasEquipped = (id: string) => p.equippedTechniques.includes(id);
    if (hasEquipped('tech_blame')) bonuses.push({ source: '甩锅神功', value: 5 });
    if (hasEquipped('tech_poker_face')) bonuses.push({ source: '扑克脸功', value: 5 });
    if (p.ownedEquipment.includes('eq_red_badge')) bonuses.push({ source: '红色工牌', value: 5 });

    // 逐题打分：每题 5 分池
    this.currentQuestions.forEach((q, i) => {
      const answer = answers[i];
      const opt = q.options.find((o) => o.id === answer);
      if (!opt) return;
      const tags = opt.tags;
      let score = 2; // 回答即可得
      if (q.type === 'CRISIS' && tags.ownIt) score += 3;
      if (q.type === 'VALUE' && (tags.dataDriven || tags.ownIt)) score += 2;
      if (tags.flatterBoss && bossRel >= 20) score += 1;
      if (tags.flatterBoss && bossRel < -20) score -= 1;
      if (tags.socialFlow && this.npc.value('VETERAN') >= 20) score += 1;
      base += score;
    });

    const total = Math.max(0, Math.min(100, base + bonuses.reduce((s, b) => s + b.value, 0)));
    const passLine = 60;
    const passed = total >= passLine;
    this.currentQuestions = null;
    const before = p.toSaveData();

    try {
      if (passed) {
        const result = this.context.promotion.promoteGuaranteed(this.firstPromotionOptionId(), () => this.demons.reduce(10));
        this.context.events.emit('v2PromotionResult', { passed, score: total, newLevel: result.newCareerLevel });
      } else {
        this.demons.add(8); // 失败加心魔（§82）
        const until = this.clock.now() + 86_400_000; // 次日再试
        p.eventFlags[`promoCooldownUntil:${until}`] = true;
        this.context.saveService.save(p);
        this.context.events.emit('v2PromotionResult', { passed, score: total });
      }
    } catch (error) {
      Object.assign(p, new (p.constructor as typeof import('../model/player-data').PlayerData)(before));
      throw error;
    }
    return { base, bonuses, total, passed, passLine };
  }

  private firstPromotionOptionId(): string {
    return this.context.configService.promotion.options[0]?.id ?? 'PPT';
  }
}

// ── 日结算（§92~§95） ───────────────────────────────────────────────────────

export interface DailySettlementView {
  readonly dayIndex: number;
  readonly weekday: number;
  readonly title: string;
  readonly titleDesc: string;
  readonly rank: string;
  readonly durations: { work: number; fishing: number; cultivating: number; social: number };
  readonly income: { salary: number; cultivation: number; performance: number };
  readonly mindDelta: number;
  readonly demonEnd: number;
  readonly eventsHandled: number;
  readonly materialsGained: number;
  readonly isWeekly: boolean;
}

export class DaySettlementService {
  public constructor(
    private readonly context: GameContext,
    private readonly clock: GameClockV2,
    private readonly gameDay: GameDayService,
    private readonly demons: InnerDemonService,
  ) {}

  /** 是否可结算：已开工、未结算、已过 18:00（DEV 跳时间也能触发）。 */
  public canSettle(): boolean {
    const day = this.gameDay.current();
    return !!day && !day.settled && this.gameDay.isOffWork();
  }

  /** 执行日结算（exactly once，§261：先标记 settled 再入账历史）。 */
  public settle(): DailySettlementView {
    const day = this.gameDay.current();
    if (!day) throw new Error('没有进行中的工作日');
    if (day.settled) throw new Error('今日已结算');
    if (!this.gameDay.isOffWork()) throw new Error('未到下班时间');
    const p = this.context.player;
    const before = p.toSaveData();

    const title = this.pickTitle(day.dayIndex);
    const rank = this.pickRank(day);
    const isWeekly = day.weekday === 5; // 周五

    // 标记结算（先写 settled 防重复，§261）
    this.gameDay.markSettled();

    const summary: DaySummaryState = {
      dayIndex: day.dayIndex,
      salary: day.income.salary,
      cultivation: day.income.cultivation,
      performance: day.income.performance,
      mindEnd: p.mind,
      innerDemonEnd: p.innerDemon,
      titleId: title.id,
      rank,
    };
    const history = [...p.dailyHistory, summary].slice(-90); // §271 保留 90 天
    p.dailyHistory = history;

    const view: DailySettlementView = {
      dayIndex: day.dayIndex,
      weekday: day.weekday,
      title: title.name,
      titleDesc: title.desc,
      rank,
      durations: {
        work: day.durations.work, fishing: day.durations.fishing,
        cultivating: day.durations.cultivating, social: day.durations.social,
      },
      income: { ...day.income },
      mindDelta: 0, // UI 可与昨日对比；此处存终值
      demonEnd: p.innerDemon,
      eventsHandled: day.eventsHandled,
      materialsGained: day.materialsGained,
      isWeekly,
    };

    try {
      if (isWeekly) {
        const weekly = this.settleWeekly(day.dayIndex);
        void weekly;
      }
      this.context.saveService.save(p);
    } catch (error) {
      Object.assign(p, new (p.constructor as typeof import('../model/player-data').PlayerData)(before));
      throw error;
    }
    this.context.events.emit('daySettled', { ...view });
    return view;
  }

  /** 今日称号（§94，按行为计算，至少 30 个池）。 */
  private pickTitle(dayIndex: number): TitleDef {
    const p = this.context.player;
    const day = this.gameDay.current() ?? {
      dayIndex, weekday: 1, startedAt: 0, settled: true,
      durations: { work: 0, fishing: 0, cultivating: 0, social: 0, meeting: 0, lunch: 0 },
      income: { salary: 0, cultivation: 0, performance: 0 },
      eventsHandled: 0, materialsGained: 0, situationIds: [],
    };
    const total = Math.max(1, day.durations.work + day.durations.fishing + day.durations.cultivating + day.durations.social);
    const ctx = {
      fishing: day.durations.fishing / total,
      work: day.durations.work / total,
      cultivating: day.durations.cultivating / total,
      social: day.durations.social / total,
      toiletEvent: day.situationIds.length >= 0 && p.eventFlags['toilet_disciple'] ? 1 : 0,
      bugEvent: day.eventsHandled, meeting: 0, events: day.eventsHandled,
      cultivation: day.income.cultivation, salary: day.income.salary, performance: day.income.performance,
      craft: p.eventFlags[`craft_${dayIndex}`] ? 3 : 0,
      materials: day.materialsGained,
      mindLow: p.mind, mindHigh: p.mind,
      demonMid: p.innerDemon, demonHigh: p.innerDemon,
      relationshipUp: Object.values(p.relationships).reduce((a, b) => a + Math.max(0, b), 0),
      relationshipDown: Object.values(p.relationships).reduce((sum, value) => sum + Math.min(0, value), 0),
      chainProgress: Object.keys(p.eventChainState).length,
      coffee: (p.materials['cons_coffee'] ?? 0),
      shop: p.eventFlags[`shop_bought_${dayIndex}_any`] ? 1 : 0,
      promotionNear: this.context.kpi.isCurrentKpiCompleted() ? 1 : 0,
      dayOne: dayIndex === 1 ? 1 : 0,
      friday: day.weekday === 5 ? 1 : 0,
      monday: day.weekday === 1 ? 1 : 0,
      secret: p.firedEvents.length,
      overtime: p.eventFlags['incident_checked'] ? 1 : 0,
      negativeBoss: 0,
      default: 0,
    };
    // 优先级顺序：特殊称号 > 行为称号 > 默认
    const priority = ['toilet_immortal', 'broken_heart', 'demon_harbor', 'zen_master', 'exp_machine',
      'salary_rain', 'perf_star', 'craft_manic', 'material_hoarder', 'event_juggler', 'chain_breaker',
      'secret_finder', 'promotion_close', 'npc_favorite', 'coffee_life', 'shopaholic', 'grind_king',
      'fish_master', 'cultivator', 'social_master', 'meeting_buddha', 'bug_terminator', 'overtime_fighter',
      'lazy_dog', 'boss_eyesore', 'friday_night', 'monday_blues', 'first_day', 'npc_punchbag'];
    for (const key of priority) {
      const def = PROMO_TITLES.dailyTitles.find((t) => t.id === `title_${key}`);
      if (!def) continue;
      const value = ctx[def.condition as keyof typeof ctx] ?? 0;
      if (def.condition !== 'default' && this.matchesTitle(def.condition, value, def.threshold)) return def;
    }
    return PROMO_TITLES.dailyTitles.find((t) => t.condition === 'default')!;
  }

  private matchesTitle(condition: string, value: number, threshold: number): boolean {
    if (condition === 'mindLow' || condition === 'relationshipDown') return value <= threshold;
    if (condition === 'friday' || condition === 'monday' || condition === 'dayOne') return value > 0 && value >= threshold;
    return value >= threshold;
  }

  /** 仙评 S/A/B/C/D（§95）。 */
  private pickRank(day: { income: { salary: number; cultivation: number; performance: number }; eventsHandled: number }): string {
    let score = 0;
    score += Math.min(40, day.income.cultivation / 10);
    score += Math.min(30, day.income.performance / 2);
    score += Math.min(20, day.eventsHandled * 4);
    score += Math.min(10, day.income.salary / 50);
    if (score >= 80) return 'S';
    if (score >= 60) return 'A';
    if (score >= 40) return 'B';
    if (score >= 20) return 'C';
    return 'D';
  }

  /** 周结算（§96/§97，周五日结算时追加）。 */
  private settleWeekly(currentDayIndex: number): WeeklySummaryState {
    const p = this.context.player;
    const weekIndex = Math.floor(currentDayIndex / 7);
    const weekDays = p.dailyHistory.filter((d) => Math.floor(d.dayIndex / 7) === weekIndex);
    const summary: WeeklySummaryState = {
      weekIndex,
      salary: weekDays.reduce((s, d) => s + d.salary, 0),
      cultivation: weekDays.reduce((s, d) => s + d.cultivation, 0),
      performance: weekDays.reduce((s, d) => s + d.performance, 0),
      workSeconds: p.workSeconds, // 终身累计；周粒度由 dailyHistory 派生
      eventsHandled: weekDays.length,
      titleId: weekDays.length >= 5 ? '圆满一周' : '奋斗一旬',
    };
    p.weeklyHistory = [...p.weeklyHistory, summary].slice(-26); // §272
    this.context.events.emit('weekSettled', { ...summary });
    return summary;
  }
}
