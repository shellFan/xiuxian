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
    try { this.context.week.recordProgress('TECH_DEBT_DOWN', reduction); } catch { /* weekly goal hook */ }
    return reduction;
  }

  /**
   * V5.8 §7.2：技术债治理循环。
   * 平均债 ≥90 或任一域 ≥95 时，开工生成一条「技术债专项治理」指派任务，
   * 完成 → repay 该域 25 点（自然下降路径，不再只能靠事件偶然降低）。
   */
  public offerGovernanceTask(): void {
    const p = this.context.player;
    const day = p.gameDay?.dayIndex ?? 1;
    const flag = `v58_governance_${day}`;
    if (p.eventFlags?.[flag]) return;
    const all = this.all();
    const values = Object.values(all);
    const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    const worstDomain = Object.entries(all).sort((a, b) => b[1] - a[1])[0];
    const trigger = avg >= 90 || (worstDomain && worstDomain[1] >= 95);
    if (!trigger || !worstDomain || worstDomain[1] < 60) return;
    p.eventFlags = { ...(p.eventFlags ?? {}), [flag]: true };
    try {
      this.context.assignedTasks.assign({
        title: `技术债专项治理：${TECH_DEBT_LABELS[worstDomain[0] as TechDebtDomain]}（${worstDomain[1]}→目标 65）`,
        priority: 'P1',
        source: 'SYSTEM',
        isFakeP0: false,
      });
      p.eventFlags = { ...(p.eventFlags ?? {}), [`v58_governance_domain_${day}`]: worstDomain[0] } as never;
      this.context.events.emit('governanceTaskOffered', { domain: worstDomain[0], level: worstDomain[1] });
    } catch { /* 指派失败不阻塞开工 */ }
  }
}
