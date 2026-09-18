/**
 * V2EconomyService（Gameplay V2 §19~§24/§26）— 四模式经济 tick。
 *
 * 与 V1 WorkService 的关系：V1 已处理 salary/cultivation/mind 的工时结算（含余数累积、
 * buff、职级倍率）。本服务在其基础上叠加 V2 修正并统一记录当日数据：
 *  - 四模式 cultivation 倍率：WORK ×0.8、FISHING ×1.1、CULTIVATING ×2.0、SOCIAL ×0.6（§19~22）
 *  - 今日局势 workSalaryMul / workPerformanceMul / cultivationMul / mindPerHourDelta（§13）
 *  - 心魔修正：workDown(×0.8) / fishingCultivationUp(×1.2) / performanceDown(×0.85)（§29）
 *  - 道心0保底（§26）：修为仍有 50% 基础挂机（此处指 CULTIVATING/FISHING 不因道心归零，由
 *    cultivation 端 mindEfficiency 既有曲线保证非 0；WORK 收入照旧停止）
 *  - 发薪日 salaryBonusFlat 一次性发放（每日一次）
 *
 * 挂在 GameLoop step 中 V1 work.tick 之后执行时长记账与增量修正（不重复发钱，只做
 * V2 增量部分）：activity duration 记账 + 模式专有 cultivation/mind 差额。
 */
import type { GameContext } from '../core/game-context';
import type { GameClockV2 } from './v2-clock';
import type { GameDayService } from './game-day-service';
import type { InnerDemonService } from './inner-demon-service';

/** 四模式修炼倍率（§19~§22）。 */
const MODE_CULTIVATION_MUL: Record<string, number> = {
  WORK: 0.8,
  FISHING: 1.1,
  CULTIVATING: 2.0,
  SOCIAL: 0.6,
};

/** SOCIAL 关系收益倍率在 NPC 侧结算；此处仅修经济。 */
export class V2EconomyService {
  /** 发薪日奖励发放标记（dayIndex → 已发）。 */
  private bonusPaidDayIndex = -1;
  /** 道心每秒流式增量的余数累积器（MindService 只接受整数增量）。 */
  private mindRemainder = 0;
  /** 心魔每秒流式增量的余数累积器。 */
  private demonRemainder = 0;

  public constructor(
    private readonly context: GameContext,
    private readonly clock: GameClockV2,
    private readonly gameDay: GameDayService,
    private readonly demons: InnerDemonService,
  ) {}

  /**
   * 每秒调用（由 GameLoop step 驱动）。
   * V1 WorkService 已经按 WORK/FISHING 两态结算了 salary/cultivation/mind；
   * V2 在此补齐：
   *  1) 当日时长记账（四模式）
   *  2) 局势与心魔的 mind 每小时增量（道心随时间自然流动）
   *  3) CULTIVATING/SOCIAL 的工资惩罚差额（V1 只认 WORK/FISHING 倍率）
   *  4) 发薪日一次性奖金
   */
  public tick(seconds: number): void {
    if (seconds <= 0) return;
    const player = this.context.player;
    const day = this.gameDay.ensureStarted();
    const mode = player.workMode;

    // 1) 当日时长记账
    this.gameDay.addDuration(mode, seconds);
    if (mode === 'CULTIVATING') player.cultivatingSeconds += seconds;
    if (mode === 'SOCIAL') player.socialSeconds += seconds;

    // 午休（12:00~13:00）：不发工资不涨修为不流道心，只保留上面的时长记账。
    if (this.clock.isLunchBreak()) return;

    const sit = this.gameDay.aggregateEffects();

    // 2) 局势道心流（每小时 mindPerHourDelta；FISHING 额外 fishingMindDelta）。
    //    流式增量带余数累积，凑满 1 点才结算（MindService 只收整数）。
    const mindRatePerSec = sit.mindPerHourDelta / 3600;
    const fishingBonusPerSec = mode === 'FISHING' ? (sit.fishingMindDelta + 2) / 3600 : 0;
    this.mindRemainder += (mindRatePerSec + fishingBonusPerSec) * seconds;
    if (Math.abs(this.mindRemainder) >= 1) {
      const whole = Math.trunc(this.mindRemainder);
      this.mindRemainder -= whole;
      this.context.mind.applyDelta(whole);
    }

    // 3) 局势心魔流 + 心魔被动（加班幻觉/低道心）。同样整数化。
    const demonRate = sit.innerDemonPerHour / 3600;
    this.demonRemainder += demonRate * seconds;
    if (this.demonRemainder >= 1) {
      const wholeDemon = Math.floor(this.demonRemainder);
      this.demonRemainder -= wholeDemon;
      this.demons.add(wholeDemon);
    }
    this.demons.tick(seconds);

    // 4) 发薪日一次性奖金（每次开工只发一次；day 引用可能已被 addDuration 重建，重读）
    const currentDay = this.gameDay.current();
    if (sit.salaryBonusFlat > 0 && currentDay && this.bonusPaidDayIndex !== currentDay.dayIndex) {
      this.bonusPaidDayIndex = currentDay.dayIndex;
      this.context.economy.applyIdleSalary(Math.floor(sit.salaryBonusFlat));
      this.gameDay.addIncome('salary', Math.floor(sit.salaryBonusFlat));
      this.context.events.emit('salaryChanged', { amount: Math.floor(sit.salaryBonusFlat), total: player.salary });
    }
  }

  /** 四模式修炼倍率（供 WorkService/V2 结算或 UI 展示读取）。 */
  public static cultivationMultiplierFor(mode: string): number {
    return MODE_CULTIVATION_MUL[mode] ?? 1;
  }

  /** 当前实际生效的修炼倍率（模式 × 局势 × 心魔）。 */
  public currentCultivationMultiplier(): number {
    const mode = this.context.player.workMode;
    const sit = this.gameDay.aggregateEffects();
    return (
      (MODE_CULTIVATION_MUL[mode] ?? 1) *
      sit.cultivationMul *
      (mode === 'FISHING' ? this.demons.fishingCultivationMultiplier() : 1)
    );
  }

  /** 当前实际生效的工作绩效倍率（模式固有 × 局势 × 心魔）。 */
  public currentPerformanceMultiplier(): number {
    const sit = this.gameDay.aggregateEffects();
    return sit.workPerformanceMul * this.demons.performanceMultiplier();
  }
}
