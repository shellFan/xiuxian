import type { GameContext } from '../core/game-context';
import type { SectProjectContractState, SectProjectRisk } from '../model/save-data';

export interface SectProjectOffer {
  readonly id: string;
  readonly sectId: string;
  readonly dayIndex: number;
  readonly title: string;
  readonly risk: SectProjectRisk;
  readonly workMinutes: number;
  readonly rewardSalary: number;
  readonly rewardPerformance: number;
  readonly encounterId: 'NORMAL' | 'BLAME_MANAGER' | 'MUTANT_BUG_KING';
}

const RISK_LEVELS: readonly SectProjectRisk[] = ['LOW', 'MEDIUM', 'HIGH'];
const RISK_MULTIPLIER: Readonly<Record<SectProjectRisk, number>> = { LOW: 1, MEDIUM: 1.8, HIGH: 3.1 };
const RISK_MINUTES: Readonly<Record<SectProjectRisk, number>> = { LOW: 25, MEDIUM: 45, HIGH: 75 };
const RISK_PERFORMANCE: Readonly<Record<SectProjectRisk, number>> = { LOW: 5, MEDIUM: 11, HIGH: 20 };
const RISK_ENCOUNTER: Readonly<Record<SectProjectRisk, SectProjectOffer['encounterId']>> = {
  LOW: 'NORMAL', MEDIUM: 'BLAME_MANAGER', HIGH: 'MUTANT_BUG_KING',
};
const PROFESSION_RATE: Readonly<Record<string, number>> = { JAVA_BACKEND: 1.1, FRONTEND: 1, QA: 0.95, DEVOPS: 1.08 };

/** Daily, employer-scoped project contracts backed by the authoritative clock, wallet and card-battle engine. */
export class SectProjectService {
  public constructor(private readonly context: GameContext) {}

  public offers(): readonly SectProjectOffer[] {
    const sect = this.context.sect.current();
    if (!sect) return [];
    const dayIndex = Math.max(1, this.context.gameDay.dayIndex());
    const taskPool = sect.employment?.taskPool ?? [];
    if (!taskPool.length) return [];
    const profession = this.context.profession.currentId();
    const wageRate = PROFESSION_RATE[profession] ?? 1;
    return RISK_LEVELS.map((risk, index) => {
      const title = taskPool[(dayIndex + index - 1) % taskPool.length];
      const id = `sect-project-${dayIndex}-${sect.id}-${risk}`;
      const sectorFactor = 0.85 + sect.modifiers.performanceMultiplier * 0.15;
      const rewardSalary = Math.max(1, Math.round(45 * RISK_MULTIPLIER[risk] * wageRate * sectorFactor));
      return Object.freeze({
        id, sectId: sect.id, dayIndex, title, risk,
        workMinutes: Math.max(1, Math.ceil(RISK_MINUTES[risk] * this.context.profession.projectTimeMultiplier())),
        rewardSalary,
        rewardPerformance: RISK_PERFORMANCE[risk] + this.context.profession.projectPerformanceBonus(), encounterId: RISK_ENCOUNTER[risk],
      });
    });
  }

  public current(): SectProjectContractState | null {
    const contract = this.context.player.sectProjectContract;
    if (!contract || contract.dayIndex !== Math.max(1, this.context.gameDay.dayIndex())) return null;
    return { ...contract };
  }

  public accept(offerId: string): SectProjectContractState {
    const existing = this.context.player.sectProjectContract;
    const dayIndex = Math.max(1, this.context.gameDay.dayIndex());
    if (existing?.dayIndex === dayIndex) return { ...existing };
    const offer = this.offers().find((candidate) => candidate.id === offerId);
    if (!offer) throw new Error('今日项目合同不存在或已过期');
    const contract: SectProjectContractState = {
      id: offer.id, sectId: offer.sectId, dayIndex: offer.dayIndex, title: offer.title,
      risk: offer.risk, workMinutes: offer.workMinutes, rewardSalary: offer.rewardSalary,
      rewardPerformance: offer.rewardPerformance, status: 'ACCEPTED',
    };
    this.context.player.sectProjectContract = contract;
    this.context.saveService.save(this.context.player);
    this.context.events.emit('playerChanged', { reason: 'sectProjectAccepted' });
    return { ...contract };
  }

  public start(contractId: string): SectProjectOffer['encounterId'] {
    const contract = this.context.player.sectProjectContract;
    if (!contract || contract.id !== contractId || contract.dayIndex !== Math.max(1, this.context.gameDay.dayIndex())) {
      throw new Error('没有可开始的今日项目合同');
    }
    if (contract.status !== 'ACCEPTED') throw new Error('项目合同已经开始或结算');
    contract.status = 'ACTIVE';
    this.context.saveService.save(this.context.player);
    return RISK_ENCOUNTER[contract.risk];
  }

  /** At-most-once terminal settlement; both success and failure consume the contract's game time. */
  public resolve(contractId: string, victory: boolean): { status: string; salary: number; timeMinutes: number } {
    const contract = this.context.player.sectProjectContract;
    if (!contract || contract.id !== contractId || contract.status !== 'ACTIVE') {
      return { status: contract?.status ?? 'MISSING', salary: 0, timeMinutes: 0 };
    }
    const nextStatus = victory ? 'COMPLETED' : 'FAILED';
    contract.status = nextStatus;
    this.context.saveService.save(this.context.player);

    this.context.clockV2.consumeGameMinutes(contract.workMinutes);
    this.context.gameDay.addDuration('WORK', contract.workMinutes * 60);
    let salary = 0;
    if (victory) {
      salary = contract.rewardSalary;
      this.context.economy.applyIdleSalary(salary);
      this.context.gameDay.addIncome('salary', salary);
      this.context.kpi.recordSalaryEarned(salary);
      this.context.player.performance = Math.max(0, this.context.player.performance + contract.rewardPerformance);
      this.context.gameDay.addIncome('performance', contract.rewardPerformance);
      if (contract.risk === 'HIGH') {
        this.context.player.eventFlags = { ...this.context.player.eventFlags, 'career:goal:high-risk-project': true };
      }
    } else {
      const penalty = contract.risk === 'HIGH' ? 8 : contract.risk === 'MEDIUM' ? 4 : 2;
      this.context.player.performance = Math.max(0, this.context.player.performance - penalty);
      this.context.gameDay.addIncome('performance', -penalty);
      this.context.mind.applyDelta(-penalty);
    }
    this.context.saveService.save(this.context.player);
    this.context.events.emit('playerChanged', { reason: 'sectProjectSettled' });
    return { status: nextStatus, salary, timeMinutes: contract.workMinutes };
  }
}
