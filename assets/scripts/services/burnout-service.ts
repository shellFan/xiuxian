import type { GameContext } from '../core/game-context';

/**
 * V5.8 P0 — Burnout / 心魔恢复闭环（§8）。
 * 不是新货币：由 Mind / InnerDemon / Fatigue / 连续加班 / 事故综合判定的游戏状态机。
 * NORMAL → STRESSED → BURNOUT_RISK → BURNOUT → RECOVERING。
 * BURNOUT 时触发「牛马也得喘口气」事件（4 选项，硬扛不能长期最优）；
 * demon ≥ 95 兜底阀门：结算期强制心魔消退，杜绝死亡螺旋。
 */

export type BurnoutState = 'NORMAL' | 'STRESSED' | 'BURNOUT_RISK' | 'BURNOUT' | 'RECOVERING';

export const BURNOUT_STATE_CN: Record<BurnoutState, string> = {
  NORMAL: '状态正常',
  STRESSED: '压力累积',
  BURNOUT_RISK: 'burnout 预警',
  BURNOUT: '元神拒绝编译',
  RECOVERING: '回血中',
};

export interface BurnoutView {
  readonly state: BurnoutState;
  readonly stateName: string;
  readonly score: number;
  readonly advice: string;
  /** 本状态连续天数（BURNOUT 判定用）。 */
  readonly daysInState: number;
}

/** 主观负荷分 0~100：Mind 越低/心魔疲劳越高 → 越大。 */
export function burnoutScore(mind: number, demon: number, fatigue: number, maxMind: number): number {
  const mindRatio = 1 - Math.max(0, Math.min(1, mind / Math.max(1, maxMind)));
  return Math.round(Math.min(100, mindRatio * 45 + (demon / 100) * 35 + (fatigue / 100) * 20));
}

const TRANSITIONS: readonly { state: BurnoutState; minDays: number }[] = [
  { state: 'BURNOUT', minDays: 2 },
  { state: 'BURNOUT_RISK', minDays: 1 },
  { state: 'STRESSED', minDays: 0 },
];

export class BurnoutService {
  public constructor(private readonly context: GameContext) {}

  private raw(): { state: BurnoutState; daysInState: number } {
    const b = this.context.player.burnoutState;
    const allowed: readonly string[] = ['NORMAL', 'STRESSED', 'BURNOUT_RISK', 'BURNOUT', 'RECOVERING'];
    const state = b && allowed.includes(b.state) ? (b.state as BurnoutState) : 'NORMAL';
    return { state, daysInState: b?.daysInState ?? 0 };
  }

  /** 由当前 Mind/心魔/疲劳计算的目标状态（§8 判定）。 */
  public targetState(): BurnoutState {
    const p = this.context.player;
    const mind = p.mind;
    const demon = p.innerDemon;
    const fatigue = p.fatigue ?? 0;
    if ((mind < 20 && demon >= 80) || (mind < 20 && fatigue >= 85) || demon >= 95) return 'BURNOUT_RISK';
    if (mind < 40 || demon >= 60 || fatigue >= 70) return 'STRESSED';
    return 'NORMAL';
  }

  /** GameLoop 每日结算调用：推进状态机 + 触发事件 + 兜底阀门。 */
  public onDaySettled(): BurnoutView {
    const p = this.context.player;
    const raw = this.raw();
    const target = this.targetState();
    let state = raw.state;
    let days = raw.daysInState;

    // RECOVERING：burnout 后进入，直到回 NORMAL
    if (state === 'BURNOUT' && target === 'NORMAL') state = 'RECOVERING';
    if (state === 'RECOVERING' && target === 'NORMAL' && raw.state !== 'NORMAL') {
      const recovered = p.lifetimeStats;
      p.lifetimeStats = { ...recovered, burnoutRecovered: (recovered.burnoutRecovered ?? 0) + 1 };
    }
    if (state === 'RECOVERING' && target !== 'NORMAL') state = target;

    if (state === target || (state === 'BURNOUT' && target === 'BURNOUT_RISK') || (state === 'BURNOUT_RISK' && target === 'STRESSED')) {
      // 升格保持：BURNOUT 只能被 RECOVERING/NORMAL 解除
      days += 1;
      if (state !== target && TRANSITIONS.findIndex((t) => t.state === state) > TRANSITIONS.findIndex((t) => t.state === target)) {
        state = target; // 目标更严重 → 立即升格
        days = 1;
      }
    } else if (TRANSITIONS.findIndex((t) => t.state === state) > TRANSITIONS.findIndex((t) => t.state === target)) {
      state = target;
      days = 1;
    } else {
      days = 1;
      state = target;
    }

    // BURNOUT_RISK 持续 ≥1 天 → BURNOUT
    if (state === 'BURNOUT_RISK' && days >= 2) state = 'BURNOUT';
    // BURNOUT 持续 ≥2 天强制降级阀门（「元神已拒绝编译」强制喘口气）
    let forcedRelief = false;
    if (state === 'BURNOUT' && days >= 3) {
      p.innerDemon = Math.max(0, p.innerDemon - 15);
      p.mind = Math.min(p.maxMind, p.mind + 12);
      days = 1;
      state = 'RECOVERING';
      forcedRelief = true;
    }
    // 兜底阀门（§7.1）：demon ≥ 95 无论何状态，结算强制消退，杜绝死亡螺旋
    if (p.innerDemon >= 95) {
      p.innerDemon = Math.max(0, p.innerDemon - 10);
      forcedRelief = true;
    }

    p.burnoutState = { state, daysInState: days };
    const view = this.view();
    if (state === 'BURNOUT_RISK' && days === 1) {
      this.context.events.emit('burnoutRisk', { state, text: '连续的高压让你的元神开始报警。' });
    }
    if (state === 'BURNOUT' && days === 1) {
      this.context.events.emit('burnoutTriggered', { state, text: '牛马也得喘口气：你的元神已经拒绝编译，肉身仍坐在工位，灵魂已经下班。' });
    }
    if (forcedRelief) {
      this.context.events.emit('burnoutForcedRest', { state, text: '系统强制给你放了个假——IDE 看了你一眼，选择了未响应。' });
    }
    return view;
  }

  public view(): BurnoutView {
    const raw = this.raw();
    const p = this.context.player;
    const score = burnoutScore(p.mind, p.innerDemon, p.fatigue ?? 0, p.maxMind);
    const advice: Record<BurnoutState, string> = {
      NORMAL: '状态在线，牛马也要讲武德。',
      STRESSED: '压力在累积：早点下班、摸鱼、或喝杯咖啡。',
      BURNOUT_RISK: '元神开始报警。请半天假，或者找老油条喝一杯。',
      BURNOUT: '元神已经拒绝编译。再扛下去，系统会强制你休息。',
      RECOVERING: '回血中。稳住，别再连轴转。',
    };
    return { state: raw.state, stateName: BURNOUT_STATE_CN[raw.state], score, advice: advice[raw.state], daysInState: raw.daysInState };
  }

  /** 请假/调休（事件选项 A）：直接进入恢复，扣半天工资（§8 选项 A 工资影响）。 */
  public takeHalfDayOff(): { mind: number; fatigue: number; salaryCost: number } {
    const p = this.context.player;
    const salaryCost = Math.min(p.salary, 30);
    if (salaryCost > 0) p.salary -= salaryCost;
    p.mind = Math.min(p.maxMind, p.mind + 30);
    p.fatigue = Math.max(0, (p.fatigue ?? 0) - 25);
    p.innerDemon = Math.max(0, p.innerDemon - 12);
    p.burnoutState = { state: p.innerDemon >= 60 ? 'STRESSED' : 'RECOVERING', daysInState: 1 };
    this.context.events.emit('playerChanged', { reason: 'burnoutHalfDayOff' });
    return { mind: p.mind, fatigue: p.fatigue ?? 0, salaryCost };
  }
}
