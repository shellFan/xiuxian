import type { GameContext } from '../core/game-context';

/**
 * V5.7 Phase M — Fatigue（0~100）真正接线。
 * 来源：连续工作 / 加班 / 通宵 / 周末工作 / 事故 / 连续战斗。
 * 效果：任务效率 / Mind恢复 / 战斗输出 分档下降；100 强制休息事件。
 * 恢复：下班 / 睡眠 / 周末 / 调休 / 摸鱼少量。
 * 设计原则（§82）：免费加班短期可换绩效，长期 Fatigue/Mind/事故成本上升。
 */

export type FatigueSource =
  | 'WORK' | 'OVERTIME' | 'ALLNIGHTER' | 'WEEKEND_WORK' | 'INCIDENT' | 'BOSS_FIGHT'
  | 'OFF_WORK' | 'SLEEP' | 'WEEKEND' | 'LEAVE' | 'FISHING' | 'CULTIVATE';

export interface FatigueView {
  readonly value: number;
  readonly band: 'FRESH' | 'LIGHT' | 'HEAVY' | 'CRITICAL' | 'COLLAPSE';
  readonly bandName: string;
  readonly efficiencyMul: number;
  readonly mindRecoveryMul: number;
  readonly battleAttackMul: number;
  readonly forcedRest: boolean;
  readonly advice: string;
}

const RATES: Record<FatigueSource, number> = {
  WORK: 1,            // per 30 work minutes
  OVERTIME: 6,        // per overtime hour
  ALLNIGHTER: 20,
  WEEKEND_WORK: 10,
  INCIDENT: 8,
  BOSS_FIGHT: 4,
  OFF_WORK: -30,
  SLEEP: -40,
  WEEKEND: -25,
  LEAVE: -50,
  FISHING: -2,        // per 20 fishing minutes
  CULTIVATE: -2,      // per 20 cultivation minutes
};

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export class FatigueService {
  public constructor(private readonly context: GameContext) {}

  public value(): number {
    return clamp(this.context.player.fatigue ?? 0);
  }

  /** 装备（996套 fatigueGainMul）与每日情境叠加后的净增益。 */
  private gainMul(): number {
    let mul = 1;
    try {
      const eq = this.context.loot.workStats();
      mul *= eq.fatigueGainMul;
    } catch { /* loot 未就绪时按 1 计 */ }
    try {
      const sit = this.context.week?.situationEffects();
      if (sit?.fatigueGainMul) mul *= sit.fatigueGainMul;
    } catch { /* ignore */ }
    return mul;
  }

  /** 记一次来源（正=累积，负=恢复）。minutes 用于按分钟换算的来源。 */
  public add(source: FatigueSource, minutes = 0): void {
    const p = this.context.player;
    const base = RATES[source];
    let delta = 0;
    switch (source) {
      case 'WORK': delta = (minutes / 30) * base; break;
      case 'OVERTIME': delta = (minutes / 60) * base; break;
      case 'FISHING':
      case 'CULTIVATE': delta = (minutes / 20) * base; break;
      default: delta = base;
    }
    if (delta > 0) delta *= this.gainMul();
    p.fatigue = clamp((p.fatigue ?? 0) + delta);
    if (p.fatigue >= 100 && !p.fatigueForcedRest) {
      p.fatigueForcedRest = true;
      this.context.events.emit('fatigueCritical', { value: p.fatigue, text: '身体发出警告：连轴转的代价到了。今天必须休息。' });
    }
  }

  /** 效率分档（§81）。 */
  public view(): FatigueView {
    const v = this.value();
    const forcedRest = !!this.context.player.fatigueForcedRest;
    if (v <= 30) {
      return { value: v, band: 'FRESH', bandName: '精力充沛', efficiencyMul: 1, mindRecoveryMul: 1, battleAttackMul: 1, forcedRest, advice: '状态在线，牛马也要讲武德。' };
    }
    if (v <= 60) {
      return { value: v, band: 'LIGHT', bandName: '轻微疲惫', efficiencyMul: 0.95, mindRecoveryMul: 0.9, battleAttackMul: 1, forcedRest, advice: '咖啡的作用越来越短了。' };
    }
    if (v <= 80) {
      return { value: v, band: 'HEAVY', bandName: '明显疲劳', efficiencyMul: 0.9, mindRecoveryMul: 0.7, battleAttackMul: 0.95, forcedRest, advice: '注意力开始飘，事故概率在上升。' };
    }
    if (v < 100) {
      return { value: v, band: 'CRITICAL', bandName: '濒临透支', efficiencyMul: 0.82, mindRecoveryMul: 0.5, battleAttackMul: 0.85, forcedRest, advice: '再熬下去，就要用命换进度了。' };
    }
    return { value: v, band: 'COLLAPSE', bandName: '强制休息', efficiencyMul: forcedRest ? 0.5 : 0.82, mindRecoveryMul: 0.4, battleAttackMul: 0.8, forcedRest: true, advice: '身体发出警告：请立即休息/请假/调休。' };
  }

  /** 任务效率乘数（daily planner / task runtime 消费）。 */
  public efficiencyMul(): number {
    return this.view().efficiencyMul;
  }

  /** 战斗攻击乘数（battle-service 消费）。 */
  public battleAttackMul(): number {
    return this.view().battleAttackMul;
  }

  /** 恢复动作（下班/睡眠/周末/调休）。 */
  public recover(source: FatigueSource, minutes = 0): void {
    this.add(source, minutes);
  }

  /** 休息事件（请假/调休）解除强制休息。 */
  public takeRest(hours: number): void {
    this.add('LEAVE', hours * 60);
    if (this.value() < 80) this.context.player.fatigueForcedRest = false;
    this.context.events.emit('playerChanged', { reason: 'fatigueRest' });
  }

  /** 新的一天：睡眠恢复（非通宵）。 */
  public onDayStart({ slept }: { slept: boolean }): void {
    if (slept) {
      this.add('SLEEP');
      if (this.value() < 80) this.context.player.fatigueForcedRest = false;
    }
  }

  /** 周末恢复。 */
  public onWeekend(): void {
    this.add('WEEKEND');
    if (this.value() < 80) this.context.player.fatigueForcedRest = false;
  }
}
