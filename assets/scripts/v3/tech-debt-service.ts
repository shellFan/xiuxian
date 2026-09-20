import type { GameContext } from '../core/game-context';
import type { TechDebtDomain } from '../model/save-data';

export const TECH_DEBT_DOMAINS: readonly TechDebtDomain[] = ['PAYMENT', 'LOGIN', 'ORDER', 'REPORT', 'MESSAGE', 'DEPLOY', 'INFRA'];

export const TECH_DEBT_LABELS: Record<TechDebtDomain, string> = {
  PAYMENT: '支付',
  LOGIN: '登录',
  ORDER: '订单',
  REPORT: '报表',
  MESSAGE: '消息',
  DEPLOY: '发布',
  INFRA: '基础设施',
};

/**
 * V4 技术债系统（§47~§53）：按领域 0~100，不是全局一个数字。
 *
 * 赶工/跳测试/强行上线加债（事件 effects.techDebt）；
 * 还债消耗工作时段（repayTechDebt），今日轻松、未来事故。
 */
export class TechDebtService {
  public constructor(private readonly context: GameContext) {}

  public all(): Record<string, number> {
    return { ...this.context.player.technicalDebt };
  }

  public level(domain: string): number {
    return this.context.player.technicalDebt[domain] ?? 0;
  }

  public average(): number {
    const values = TECH_DEBT_DOMAINS.map((d) => this.level(d));
    return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  }

  public add(domain: string, amount: number): void {
    if (!Number.isFinite(amount) || amount === 0) return;
    const next = { ...this.context.player.technicalDebt };
    next[domain] = Math.min(100, Math.max(0, Math.floor((next[domain] ?? 0) + amount)));
    this.context.player.technicalDebt = next;
  }

  /**
   * 还债：消耗一段工作专注（分钟）。要求工作日进行中。
   * 返回实际削减值（受当前债务上限约束）。
   */
  public repay(domain: string, minutes: number): number {
    if (!Number.isFinite(minutes) || minutes <= 0) return 0;
    const current = this.level(domain);
    if (current <= 0) return 0;
    const reduction = Math.min(current, Math.floor(minutes * 0.8));
    this.add(domain, -reduction);
    const stats = this.context.player.lifetimeStats;
    this.context.player.lifetimeStats = { ...stats, techDebtRepaid: (stats.techDebtRepaid ?? 0) + reduction };
    return reduction;
  }
}
