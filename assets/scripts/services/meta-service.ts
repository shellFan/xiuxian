import type { GameContext } from '../core/game-context';
import type { MonthlyStatsRecord } from '../model/save-data';
import { BUILD_MAP } from '../v57/battle-merge';

/**
 * V5.8 P0 — Meta Progression（§13/§20/§21）。
 * CareerJourney 牛马生涯档案 / Build Preset ×3 一键切换 / Milestone Director（Day1~30）/ 月度统计+月称号。
 * 不新增货币：追求全部由已有系统聚合。
 */

export interface CareerJourneyView {
  readonly profession: string;
  readonly company: string;
  readonly careerRank: number;
  readonly rankTitle: string;
  readonly professionLevel: number;
  readonly professionTitle: string;
  readonly mainBuild: string;
  readonly signatureEquipment: readonly string[];
  readonly bossesSlain: number;
  readonly projectsDone: number;
  readonly companiesServed: number;
  readonly promotions: number;
  readonly achievementCount: number;
  readonly epicLoot: number;
}

const RANK_TITLES = ['实习牛马', '正式牛马', '骨干牛马', '小组骨干', '项目骨干', '部门骨干', '部门主管', '部门经理', '高级经理', '区域副总监'];

export interface MonthlyReportView {
  readonly monthIndex: number;
  readonly workDays: number;
  readonly ontimeDays: number;
  readonly overtimeMinutes: number;
  readonly salaryEarned: number;
  readonly tasksDone: number;
  readonly projectsDone: number;
  readonly bossesKilled: number;
  readonly incidents: number;
  readonly blamesTaken: number;
  readonly blamesReturned: number;
  readonly helpsGiven: number;
  readonly title: string;
}

const MONTH_TITLES: readonly { title: string; test: (m: MonthlyStatsRecord) => boolean }[] = [
  { title: '《准点下班仙尊》', test: (m) => m.ontimeDays >= 18 },
  { title: '《线上救火队长》', test: (m) => m.incidents >= 6 },
  { title: '《摸鱼祖师》', test: (m) => m.fishingMinutes >= 1200 },
  { title: '《背锅大圣》', test: (m) => m.blamesTaken >= 6 },
  { title: '《需求粉碎机》', test: (m) => m.projectsDone >= 4 },
  { title: '《IDE常驻人口》', test: (m) => m.overtimeMinutes >= 2400 },
  { title: '《团队守护者》', test: (m) => m.helpsGiven >= 12 },
  { title: '《Boss收割机》', test: (m) => m.bossesKilled >= 30 },
];

const MILESTONES: readonly { id: string; day: number; kind: string; text: string }[] = [
  { id: 'ms_day3', day: 3, kind: 'CAREER', text: '第三天：工位已经认得你的屁股了。' },
  { id: 'ms_day5', day: 5, kind: 'PROJECT', text: '第五天：第一个完整项目周期走完了。' },
  { id: 'ms_day10', day: 10, kind: 'CRISIS', text: '第十天：第一次真正的职业危机来了——绩效面谈。' },
  { id: 'ms_day14', day: 14, kind: 'PROJECT', text: '第十四天：中型项目结算，你不再是打杂的。' },
  { id: 'ms_day21', day: 21, kind: 'OFFER', text: '第二十一天：外面的猎头开始闻到你的味道。' },
  { id: 'ms_day30', day: 30, kind: 'MONTHLY', text: '第三十天：月度总结——这个月你到底经历了什么？' },
];

export class MetaService {
  public constructor(private readonly context: GameContext) {}

  // ── CareerJourney（§13） ──

  public journey(): CareerJourneyView {
    const p = this.context.player;
    const stats = p.lifetimeStats ?? {};
    const company = this.context.company.profile();
    const prof = this.context.professionContent.depthView();
    const buildId = p.activeBattleRun && typeof p.activeBattleRun === 'object' ? (p.activeBattleRun as { buildId?: string }).buildId : null;
    const build = buildId ? BUILD_MAP.get(buildId) : undefined;
    const equipped = Object.values(p.equippedEquipment ?? {}).filter((v): v is string => !!v);
    return {
      profession: prof.name,
      company: company.name,
      careerRank: p.careerLevel ?? 1,
      rankTitle: RANK_TITLES[Math.min(9, Math.max(0, (p.careerLevel ?? 1) - 1))],
      professionLevel: prof.level,
      professionTitle: prof.currentTitle,
      mainBuild: build?.name ?? '未定',
      signatureEquipment: equipped.slice(0, 3),
      bossesSlain: stats.bossKills ?? 0,
      projectsDone: (p.projectHistory ?? []).length,
      companiesServed: new Set([...(p.companyHistory ?? []).map((c) => c.companyId), company.id]).size,
      promotions: Math.max(0, (p.careerLevel ?? 1) - 1),
      achievementCount: (p.unlockedAchievementIds ?? []).length,
      epicLoot: stats.epicLoot ?? 0,
    };
  }

  // ── Build Preset（§13.1） ──

  public saveBuildPreset(slot: 0 | 1 | 2, name: string): { ok: boolean; reason?: string } {
    const p = this.context.player;
    const run = p.activeBattleRun as { buildId?: string } | null | undefined;
    const buildId = run?.buildId;
    if (!buildId || !BUILD_MAP.has(buildId)) return { ok: false, reason: '没有可保存的 Build（先进入一次项目）' };
    const preset = {
      name: name.slice(0, 16) || `配置${slot + 1}`,
      buildId,
      equippedEquipment: { ...(p.equippedEquipment ?? {}) },
      equippedTechniques: [...(p.equippedTechniques ?? [null, null, null])],
      savedAtDayIndex: p.gameDay?.dayIndex ?? 1,
    };
    const presets = [...(p.buildPresets ?? [null, null, null])];
    while (presets.length < 3) presets.push(null);
    presets[slot] = preset;
    p.buildPresets = presets;
    this.context.events.emit('buildPresetSaved', { slot, name: preset.name });
    return { ok: true };
  }

  /** 一键切换（非战斗中）：应用装备/功法/Build 偏好。 */
  public applyBuildPreset(slot: 0 | 1 | 2): { ok: boolean; reason?: string } {
    const p = this.context.player;
    if (p.activeBattleRun && (p.activeBattleRun as { status?: string }).status === 'FIGHTING') return { ok: false, reason: '战斗中不能换 Build' };
    const preset = (p.buildPresets ?? [])[slot];
    if (!preset) return { ok: false, reason: '该配置槽为空' };
    p.equippedEquipment = { ...preset.equippedEquipment };
    p.equippedTechniques = [...preset.equippedTechniques];
    this.context.events.emit('buildPresetApplied', { slot, name: preset.name });
    return { ok: true };
  }

  public buildPresets(): readonly { slot: number; preset: { name: string; buildId: string; buildName: string; savedAtDayIndex: number } | null }[] {
    return [0, 1, 2].map((slot) => {
      const preset = (this.context.player.buildPresets ?? [])[slot];
      return preset ? { slot, preset: { name: preset.name, buildId: preset.buildId, buildName: BUILD_MAP.get(preset.buildId)?.name ?? preset.buildId, savedAtDayIndex: preset.savedAtDayIndex } } : { slot, preset: null };
    });
  }

  // ── Milestone Director（§20） ──

  /** 每日开工检查：到达节点且未触发 → 发事件。 */
  public checkMilestones(): void {
    const p = this.context.player;
    const day = p.gameDay?.dayIndex ?? 1;
    for (const ms of MILESTONES) {
      if (day < ms.day) break;
      if ((p.milestones ?? []).includes(ms.id)) continue;
      p.milestones = [...(p.milestones ?? []), ms.id];
      this.context.events.emit('milestoneReached', { id: ms.id, day: ms.day, kind: ms.kind, text: ms.text });
      return; // 每天至多一个里程碑
    }
  }

  public milestoneList(): readonly { id: string; day: number; kind: string; text: string; reached: boolean }[] {
    const p = this.context.player;
    return MILESTONES.map((m) => ({ ...m, reached: (p.milestones ?? []).includes(m.id) }));
  }

  // ── Monthly（§21/§20 月报） ──

  /** 周结算时累计月度统计；满 30 天窗口滚动生成月报。 */
  public accumulateMonth(fields: Partial<MonthlyStatsRecord>): void {
    const p = this.context.player;
    const monthIndex = Math.floor(((p.gameDay?.dayIndex ?? 1) - 1) / 30) + 1;
    const stats = p.monthlyStats ?? [];
    const current = stats.find((m) => m.monthIndex === monthIndex);
    const base: MonthlyStatsRecord = current ?? {
      monthIndex, workDays: 0, ontimeDays: 0, overtimeMinutes: 0, salaryEarned: 0, fishingMinutes: 0,
      tasksDone: 0, projectsDone: 0, bossesKilled: 0, incidents: 0, blamesTaken: 0, blamesReturned: 0, helpsGiven: 0, title: '',
    };
    const merged: MonthlyStatsRecord = {
      monthIndex,
      workDays: base.workDays + (fields.workDays ?? 0),
      ontimeDays: base.ontimeDays + (fields.ontimeDays ?? 0),
      overtimeMinutes: base.overtimeMinutes + (fields.overtimeMinutes ?? 0),
      salaryEarned: base.salaryEarned + (fields.salaryEarned ?? 0),
      fishingMinutes: base.fishingMinutes + (fields.fishingMinutes ?? 0),
      tasksDone: base.tasksDone + (fields.tasksDone ?? 0),
      projectsDone: base.projectsDone + (fields.projectsDone ?? 0),
      bossesKilled: base.bossesKilled + (fields.bossesKilled ?? 0),
      incidents: base.incidents + (fields.incidents ?? 0),
      blamesTaken: base.blamesTaken + (fields.blamesTaken ?? 0),
      blamesReturned: base.blamesReturned + (fields.blamesReturned ?? 0),
      helpsGiven: base.helpsGiven + (fields.helpsGiven ?? 0),
      title: base.title || '',
    };
    const titled: MonthlyStatsRecord = { ...merged, title: this.pickMonthTitle(merged) };
    p.monthlyStats = [...stats.filter((m) => m.monthIndex !== monthIndex), titled].slice(-3);
  }

  private pickMonthTitle(m: MonthlyStatsRecord): string {
    for (const t of MONTH_TITLES) if (t.test(m)) return t.title;
    if (m.workDays >= 20) return '《全勤牛马》';
    return '《平凡而正确的一个月》';
  }

  public latestMonthlyReport(): MonthlyReportView | null {
    const stats = this.context.player.monthlyStats ?? [];
    return stats.length > 0 ? stats[stats.length - 1] : null;
  }
}
