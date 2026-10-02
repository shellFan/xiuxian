import weekContent from '../../configs/v57/week-content.json';
import type { GameContext } from '../core/game-context';

/**
 * V5.8 P0 — Company 差异化 runtime（§11）。
 * 民企/外企/国企/大厂宗不再是皮肤：公司属性真正进入 加班概率/工资/会议/事故/晋升 的计算路径。
 * 数据源：v57/week-content.json companyProfiles（扩展 runtime 字段）。
 */

export interface CompanyRuntimeProfile {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly salaryMultiplier: number;
  readonly overtimeCulture: number;
  readonly freeOvertimeChance: number;
  readonly promotionSpeed: number;
  readonly projectPressure: number;
  readonly incidentPressure: number;
  readonly weekendRecallChance: number;
  readonly learningBonus: number;
  readonly stability: number;
  readonly layoffRisk: number;
  readonly meetingDensity: number;
}

interface RawProfile {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly overtimeChanceMul?: number;
  readonly meetingMinutesMul?: number;
  readonly salaryMul?: number;
  readonly default?: boolean;
}

const BUNDLE = weekContent as unknown as { companyProfiles: RawProfile[]; weeklyHooks: readonly string[] };

/** id → runtime 属性（CONFIG 字段为基，缺省按 §11.1~§11.4 定档）。 */
const RUNTIME_TABLE: Readonly<Record<string, Omit<CompanyRuntimeProfile, 'id' | 'name' | 'desc'>>> = {
  COMP_MIN_PRIVATE: { salaryMultiplier: 1.0, overtimeCulture: 1.25, freeOvertimeChance: 0.35, promotionSpeed: 1.2, projectPressure: 1.1, incidentPressure: 1.3, weekendRecallChance: 0.3, learningBonus: 1.15, stability: 0.6, layoffRisk: 0.35, meetingDensity: 0.8 },
  COMP_FOREIGN: { salaryMultiplier: 1.18, overtimeCulture: 0.6, freeOvertimeChance: 0.1, promotionSpeed: 0.85, projectPressure: 0.9, incidentPressure: 0.8, weekendRecallChance: 0.05, learningBonus: 1.25, stability: 0.9, layoffRisk: 0.1, meetingDensity: 1.4 },
  COMP_STATE: { salaryMultiplier: 0.9, overtimeCulture: 0.55, freeOvertimeChance: 0.08, promotionSpeed: 0.7, projectPressure: 0.7, incidentPressure: 0.5, weekendRecallChance: 0.05, learningBonus: 0.85, stability: 1.0, layoffRisk: 0.03, meetingDensity: 1.25 },
  COMP_BIGTECH: { salaryMultiplier: 1.35, overtimeCulture: 1.35, freeOvertimeChance: 0.4, promotionSpeed: 1.15, projectPressure: 1.3, incidentPressure: 1.4, weekendRecallChance: 0.35, learningBonus: 1.3, stability: 0.7, layoffRisk: 0.3, meetingDensity: 1.0 },
};

export class CompanyService {
  public constructor(private readonly context: GameContext) {}

  public currentId(): string {
    return this.context.player.companyProfile ?? 'COMP_MIN_PRIVATE';
  }

  public profile(): CompanyRuntimeProfile {
    const id = this.currentId();
    const raw = BUNDLE.companyProfiles.find((c) => c.id === id) ?? BUNDLE.companyProfiles[0];
    const rt = RUNTIME_TABLE[id] ?? RUNTIME_TABLE.COMP_MIN_PRIVATE;
    return {
      id: raw.id,
      name: raw.name,
      desc: raw.desc,
      salaryMultiplier: raw.salaryMul ?? rt.salaryMultiplier,
      overtimeCulture: raw.overtimeChanceMul ?? rt.overtimeCulture,
      freeOvertimeChance: rt.freeOvertimeChance,
      promotionSpeed: rt.promotionSpeed,
      projectPressure: rt.projectPressure,
      incidentPressure: rt.incidentPressure,
      weekendRecallChance: rt.weekendRecallChance,
      learningBonus: rt.learningBonus,
      stability: rt.stability,
      layoffRisk: rt.layoffRisk,
      meetingDensity: raw.meetingMinutesMul ?? rt.meetingDensity,
    };
  }

  public profiles(): CompanyRuntimeProfile[] {
    return BUNDLE.companyProfiles.map((c) => {
      const rt = RUNTIME_TABLE[c.id] ?? RUNTIME_TABLE.COMP_MIN_PRIVATE;
      return {
        id: c.id, name: c.name, desc: c.desc,
        salaryMultiplier: c.salaryMul ?? rt.salaryMultiplier,
        overtimeCulture: c.overtimeChanceMul ?? rt.overtimeCulture,
        freeOvertimeChance: rt.freeOvertimeChance,
        promotionSpeed: rt.promotionSpeed,
        projectPressure: rt.projectPressure,
        incidentPressure: rt.incidentPressure,
        weekendRecallChance: rt.weekendRecallChance,
        learningBonus: rt.learningBonus,
        stability: rt.stability,
        layoffRisk: rt.layoffRisk,
        meetingDensity: c.meetingMinutesMul ?? rt.meetingDensity,
      };
    });
  }

  /** 换宗门（Offer 接受后调用）：保留职业/装备/技能/图鉴/项目历史，重置公司上下文。 */
  public switchCompany(companyId: string, reason: string): { ok: boolean; reason?: string } {
    const target = BUNDLE.companyProfiles.find((c) => c.id === companyId);
    if (!target) return { ok: false, reason: '未知公司' };
    const p = this.context.player;
    const day = p.gameDay?.dayIndex ?? 1;
    if (p.companyProfile === companyId) return { ok: false, reason: '已在该宗门' };
    p.companyHistory = [...(p.companyHistory ?? []), { companyId: p.companyProfile ?? 'COMP_MIN_PRIVATE', fromDayIndex: Math.max(1, day - 30), toDayIndex: day, reason }].slice(-16);
    p.companyProfile = companyId;
    p.careerChoices = [...(p.careerChoices ?? []), { dayIndex: day, kind: 'COMPANY_SWITCH', label: `换宗门 → ${target.name}` }].slice(-24);
    // 公司上下文重置：项目交接（当前项目作罢）、周目标重掷
    p.project = null;
    p.weeklyGoals = null;
    this.context.events.emit('companySwitched', { companyId, companyName: target.name, day });
    return { ok: true };
  }
}
