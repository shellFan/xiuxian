import type { GameContext } from '../core/game-context';
import type { ProfessionId } from '../v5/profession-service';

/**
 * V5.9-N.11 职业专属每日行动。
 *
 * 给四个职业各一个独有的、写权威状态的日常行动,形成差异化的经济与成长策略:
 *  - JAVA_BACKEND 重构祖传模块:产卡牌材料(mat_code_fragment)—— 战斗/合成路线
 *  - FRONTEND   打磨用户体验:产绩效(performance)—— 晋升路线
 *  - QA         深挖隐藏缺陷:产证据(TEST_REPORT)—— 证据/翻盘路线
 *  - DEVOPS     线上巡检降债:清技术债(techDebt)—— 风险治理路线
 *
 * 约束:每日 2 次(持久化 flag,重启不重置)、消耗游戏时间(clockV2.consumeGameMinutes,
 * F06 合法时间入口)与道心;收益走各系统的权威写入路径。
 */

export type ProfessionActionId = 'REFACTOR_LEGACY' | 'POLISH_UX' | 'HUNT_REGRESSION' | 'PATROL_INFRA';

interface ProfessionActionDef {
  readonly id: ProfessionActionId;
  readonly professionId: ProfessionId;
  readonly name: string;
  readonly description: string;
  /** 游戏分钟时间成本(F06:玩法动作的唯一合法时间入口)。 */
  readonly minutes: number;
  /** 道心成本(通过 MindService 结算,受角色效果约束)。 */
  readonly mindCost: number;
  /** 每日次数上限。 */
  readonly dailyLimit: number;
}

export const PROFESSION_ACTION_DEFS: readonly ProfessionActionDef[] = [
  { id: 'REFACTOR_LEGACY', professionId: 'JAVA_BACKEND', name: '重构祖传模块', description: '啃一块三年没人敢动的屎山：产出代码残片（卡牌材料），修为精进。', minutes: 30, mindCost: 6, dailyLimit: 2 },
  { id: 'POLISH_UX', professionId: 'FRONTEND', name: '打磨用户体验', description: '像素级抠一个交互细节：绩效显著上升，顺带一点加班费。', minutes: 20, mindCost: 4, dailyLimit: 2 },
  { id: 'HUNT_REGRESSION', professionId: 'QA', name: '深挖隐藏缺陷', description: '翻遍角落里的用例：抓到一份测试报告铁证，绩效入账。', minutes: 30, mindCost: 8, dailyLimit: 2 },
  { id: 'PATROL_INFRA', professionId: 'DEVOPS', name: '线上巡检降债', description: '把告警 storm 扼杀在摇篮里：全域技术债下降，稳态工资入账。', minutes: 20, mindCost: 5, dailyLimit: 2 },
];

const ACTION_BY_PROFESSION = new Map(PROFESSION_ACTION_DEFS.map((d) => [d.professionId, d]));

export interface ProfessionActionView {
  readonly available: boolean;
  readonly reason?: string;
  readonly actionId?: ProfessionActionId;
  readonly name?: string;
  readonly description?: string;
  readonly minutes?: number;
  readonly mindCost?: number;
  readonly doneToday: number;
  readonly dailyLimit: number;
}

export interface ProfessionActionResult {
  readonly success: boolean;
  readonly reason?: string;
  readonly summary?: string;
  readonly salary?: number;
  readonly cultivationExp?: number;
  readonly mindDelta?: number;
}

function flagBase(dayIndex: number, professionId: string): string {
  return `profAction_${dayIndex}_${professionId}`;
}

export class ProfessionActionService {
  public constructor(private readonly context: GameContext) {}

  private currentAction(): ProfessionActionDef | undefined {
    const professionId = this.context.player.profession as ProfessionId | undefined;
    if (!professionId) return undefined;
    return ACTION_BY_PROFESSION.get(professionId);
  }

  private doneToday(dayIndex: number, professionId: string): number {
    const flags = this.context.player.eventFlags ?? {};
    const base = flagBase(dayIndex, professionId);
    return (flags[`${base}_0`] ? 1 : 0) + (flags[`${base}_1`] ? 1 : 0);
  }

  /** 当前职业的专属行动视图(主页/职业页渲染)。 */
  public query(): ProfessionActionView {
    const action = this.currentAction();
    if (!action) {
      return { available: false, reason: '尚未选择职业', doneToday: 0, dailyLimit: 0 };
    }
    const dayIndex = Math.max(1, this.context.player.gameDay?.dayIndex ?? 1);
    const done = this.doneToday(dayIndex, action.professionId);
    const exhausted = done >= action.dailyLimit;
    return {
      available: !exhausted,
      reason: exhausted ? `今日已进行 ${done} 次，明日在战` : undefined,
      actionId: action.id,
      name: action.name,
      description: action.description,
      minutes: action.minutes,
      mindCost: action.mindCost,
      doneToday: done,
      dailyLimit: action.dailyLimit,
    };
  }

  /** 执行当前职业的专属行动。失败抛业务异常(UI toast 展示)。 */
  public perform(): ProfessionActionResult {
    const action = this.currentAction();
    if (!action) throw new Error('尚未选择职业，无法执行职业行动');
    const player = this.context.player;
    const dayIndex = Math.max(1, player.gameDay?.dayIndex ?? 1);
    const done = this.doneToday(dayIndex, action.professionId);
    if (done >= action.dailyLimit) throw new Error(`【${action.name}】今日已进行 ${done} 次，明日在战`);
    if (player.mind < action.mindCost) throw new Error('道心不足，无法凝神开工');

    // 记次数（持久化，防重启重置刷次数）
    const base = flagBase(dayIndex, action.professionId);
    const slot = player.eventFlags[`${base}_0`] ? '_1' : '_0';
    player.eventFlags = { ...player.eventFlags, [`${base}${slot}`]: true };
    // 时间成本（F06：全局一致的合法时间入口）
    this.context.clockV2.consumeGameMinutes(action.minutes);
    // 道心成本
    this.context.mind.applyDelta(-action.mindCost);

    let salary = 0;
    let cultivationExp = 0;
    let summary = '';
    switch (action.id) {
      case 'REFACTOR_LEGACY': {
        cultivationExp = 18;
        this.context.v2Items.addMaterial('mat_code_fragment', 2);
        this.context.profession.grantExp(4);
        summary = '重构完成，产出了 2 枚代码残片，修为精进。';
        break;
      }
      case 'POLISH_UX': {
        salary = 40;
        player.performance = Math.min(9999, player.performance + 6);
        this.context.gameDay.addIncome('performance', 6);
        summary = '交互打磨完毕，绩效 +6。';
        break;
      }
      case 'HUNT_REGRESSION': {
        salary = 55;
        this.context.evidence.grant('TEST_REPORT', '深挖出的回归缺陷报告');
        summary = '抓到一份测试报告铁证！';
        break;
      }
      case 'PATROL_INFRA': {
        salary = 45;
        const domains = this.context.techDebt.all();
        let lowest = Infinity;
        for (const domain of Object.keys(domains)) {
          if (domains[domain] < lowest) lowest = domains[domain];
          this.context.techDebt.add(domain, -8);
        }
        summary = lowest < Infinity ? '巡检完成，全域技术债 -8。' : '巡检完成，系统稳如老狗。';
        break;
      }
    }
    if (salary > 0) {
      this.context.economy.applyIdleSalary(salary);
      this.context.gameDay.addIncome('salary', salary);
    }
    if (cultivationExp > 0) {
      this.context.cultivation.applyIdleExperience(cultivationExp);
    }
    const stats = { ...player.lifetimeStats, professionActions: (player.lifetimeStats.professionActions ?? 0) + 1 };
    player.lifetimeStats = stats;
    this.context.events.emit('playerChanged', { reason: 'professionAction' });
    return { success: true, summary, salary, cultivationExp, mindDelta: -action.mindCost };
  }
}
