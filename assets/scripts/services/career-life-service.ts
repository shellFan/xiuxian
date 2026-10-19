import type { GameContext } from '../core/game-context';
import type { NpcId } from '../v2/npc-weekend-service';
import type { NpcMemoryKind } from '../v57/npc-memory-service';
import type { PromotionCheckV2, DefenseQuestion, DefenseScore } from '../v2/v2-settlement-service';
import { PlayerData } from '../model/player-data';
import type { ProfessionCareerSkillView } from '../v5/profession-service';

export type CareerInteraction = 'SUPPORT' | 'SOCIALIZE' | 'CHALLENGE';
export type LayoffResponse = 'PROVE_VALUE' | 'NPC_SUPPORT' | 'JOB_SEARCH' | 'ACCEPT_PACKAGE';

export interface LayoffWarningResult {
  readonly success: boolean;
  readonly warningId?: string;
  readonly pressure?: number;
  readonly reason?: string;
}

export interface LayoffResolutionResult {
  readonly success: boolean;
  readonly outcome?: 'RETAINED' | 'LAID_OFF';
  readonly compensation?: number;
  readonly reason?: string;
}

export interface CareerRelationshipView {
  readonly npcId: NpcId;
  readonly affinity: number;
  readonly trust: number;
  readonly recognition: number;
  readonly conflict: number;
  readonly memories: readonly { readonly dayIndex: number; readonly kind: string; readonly text: string }[];
}

export interface CareerGoalView {
  readonly id: string;
  readonly title: string;
  readonly progress: number;
  readonly target: number;
  readonly complete: boolean;
  readonly reward: string;
}

export interface CareerLifeView {
  readonly employment: 'EMPLOYED' | 'UNEMPLOYED';
  readonly sectId: string | null;
  readonly careerLevel: number;
  readonly monthlySalary: number;
  readonly profession: string;
  readonly professionLevel: number;
  readonly skillExperience: number;
  readonly careerSkills: readonly ProfessionCareerSkillView[];
  readonly promotion: PromotionCheckV2 & { readonly sectRequirement: boolean; readonly sectReason: string };
  readonly relationships: readonly CareerRelationshipView[];
  readonly goals: readonly CareerGoalView[];
  readonly history: readonly { readonly dayIndex: number; readonly kind: string; readonly label: string }[];
  readonly layoff: { readonly pressure: number; readonly warningActive: boolean; readonly responseSelected: boolean };
}

const UNEMPLOYED_FLAG = 'career:unemployed';
const INTERACTION_KEYS: Readonly<Record<CareerInteraction, { readonly memory: NpcMemoryKind; readonly affinity: number; readonly text: string }>> = {
  SUPPORT: { memory: 'PLAYER_SUPPORTED_NPC', affinity: 5, text: '主动协助' },
  SOCIALIZE: { memory: 'PLAYER_SOCIALIZED_NPC', affinity: 3, text: '下班交流' },
  CHALLENGE: { memory: 'PLAYER_CHALLENGED_NPC', affinity: -2, text: '公开质疑' },
};

const NPC_IDS: readonly NpcId[] = ['BOSS', 'PRODUCT', 'TESTER', 'JUNIOR', 'VETERAN', 'HR', 'OPS', 'CLIENT'];

/** V5.9-N career facade over the canonical KPI, NPC, Fate/event, profession and hiring services. */
export class CareerLifeService {
  public constructor(private readonly context: GameContext) {}

  public isEmployed(): boolean {
    return this.context.player.eventFlags[UNEMPLOYED_FLAG] !== true;
  }

  public view(): CareerLifeView {
    const promotion = this.promotionCheck();
    return {
      employment: this.isEmployed() ? 'EMPLOYED' : 'UNEMPLOYED',
      sectId: this.context.player.sectId,
      careerLevel: this.context.player.careerLevel,
      monthlySalary: this.monthlySalary(),
      profession: this.context.profession.currentId(),
      professionLevel: this.context.profession.level(),
      skillExperience: this.context.profession.exp(),
      careerSkills: this.context.profession.careerSkills(),
      promotion,
      relationships: NPC_IDS.map((npcId) => this.relationship(npcId)),
      goals: this.goals(),
      history: this.context.player.careerChoices.slice(-24).map((entry) => ({ ...entry })),
      layoff: {
        pressure: this.layoffPressure(),
        warningActive: this.context.player.eventFlags['career:layoff:warning-active'] === true,
        responseSelected: this.context.player.eventFlags['career:layoff:response-selected'] === true,
      },
    };
  }

  public relationship(npcId: NpcId): CareerRelationshipView {
    const memories = this.context.npcMemory.memory(npcId).entries;
    const count = (...kinds: string[]) => memories.filter((entry) => kinds.includes(entry.kind)).length;
    const trust = clamp(50 + count('PLAYER_SUPPORTED_NPC', 'HELPED_ME', 'DEFENDED_ME', 'BACKED_ME_IN_MEETING') * 8
      - count('PLAYER_REFUSED_NPC', 'BLAMED_ME', 'THREW_ME_UNDER_BUS') * 10);
    const recognition = clamp(50 + count('PLAYER_DELIVERED_EVIDENCE', 'PLAYER_MENTORED_NPC') * 10
      + count('PLAYER_CHALLENGED_NPC') * 5 - count('I_STOLE_CREDIT') * 10);
    const conflict = clamp(count('PLAYER_CHALLENGED_NPC') * 12 + count('I_STOLE_CREDIT', 'STOLE_MY_CREDIT', 'THREW_ME_UNDER_BUS') * 15);
    return {
      npcId, affinity: this.context.npc.value(npcId), trust, recognition, conflict,
      memories: memories.slice(-5).map((entry) => ({ ...entry })),
    };
  }

  /** At most one deliberate relationship action per NPC and game day. */
  public interact(npcId: string, action: CareerInteraction): { success: boolean; reason?: string } {
    if (!NPC_IDS.includes(npcId as NpcId)) return { success: false, reason: '未知的职场关系人' };
    if (!Object.prototype.hasOwnProperty.call(INTERACTION_KEYS, action)) return { success: false, reason: '无效的人际行动' };
    const day = Math.max(1, this.context.gameDay.dayIndex());
    const key = `career:interaction:${day}:${npcId}`;
    if (this.context.player.eventFlags[key]) return { success: false, reason: '今天已经与这位同事深入交流过' };
    const definition = INTERACTION_KEYS[action];
    const before = this.context.player.toSaveData();
    try {
      this.context.npc.change(npcId as NpcId, definition.affinity);
      this.context.npcMemory.remember(npcId, definition.memory, `第 ${day} 日：你${definition.text}。`);
      this.context.player.eventFlags = { ...this.context.player.eventFlags, [key]: true };
      this.context.saveService.save(this.context.player);
    } catch (error) {
      Object.assign(this.context.player, new PlayerData(before));
      return { success: false, reason: error instanceof Error ? error.message : '保存关系变化失败' };
    }
    this.context.events.emit('playerChanged', { reason: 'careerNpcInteraction' });
    return { success: true };
  }

  public resign(reason: 'RESIGNED' | 'LAID_OFF' = 'RESIGNED'): { success: boolean; reason?: string } {
    if (!this.context.player.sectId) return { success: false, reason: '尚无宗门合同，当前已经待业' };
    if (!this.isEmployed()) return { success: false, reason: '你目前处于待业状态' };
    const dayIndex = Math.max(1, this.context.gameDay.dayIndex());
    const choiceId = `${reason.toLowerCase()}-${dayIndex}-${this.context.player.sectId}`;
    if (this.context.player.milestones.includes(choiceId)) return { success: false, reason: '该离职结果已经结算' };
    const before = this.context.player.toSaveData();
    try {
      const now = this.context.clockV2.now();
      const history = [...this.context.player.sectCareerHistory];
      const active = history[history.length - 1];
      if (active && !active.endedAt) history[history.length - 1] = { ...active, endedAt: now };
      else history.push({ sectId: this.context.player.sectId, startedAt: this.context.player.lastSectSwitchTime || 0, endedAt: now });
      this.context.player.sectCareerHistory = history.slice(-30);
      this.context.player.sectId = null;
      this.context.player.eventFlags = { ...this.context.player.eventFlags, [UNEMPLOYED_FLAG]: true };
      this.context.player.milestones = [...this.context.player.milestones, choiceId].slice(-64);
      this.recordChoice(reason, reason === 'RESIGNED' ? '主动离开宗门，进入待业求职期' : '宗门裁员，进入待业求职期');
      this.context.sectCareer.syncActiveSectFlags();
      this.context.saveService.save(this.context.player);
    } catch (error) {
      Object.assign(this.context.player, new PlayerData(before));
      return { success: false, reason: error instanceof Error ? error.message : '离职保存失败' };
    }
    this.context.events.emit('playerChanged', { reason: 'careerUnemployed' });
    return { success: true };
  }

  /** Evaluate employer pressure and persist one warning for the current workday. */
  public beginLayoffWarning(): LayoffWarningResult {
    const sectId = this.context.player.sectId;
    if (!sectId || !this.isEmployed()) return { success: false, reason: '待业期间没有可触发的裁员预警' };
    if (sectId === 'FREELANCE') return { success: false, reason: '自由宗门按客户合同中断处理，不适用员工裁员' };
    const day = Math.max(1, this.context.gameDay.dayIndex());
    const flags = this.context.player.eventFlags;
    if (flags['career:layoff:warning-active'] === true) return { success: false, reason: '当前已有待处理的裁员预警' };
    const lastResolvedDay = this.context.player.careerChoices
      .filter((entry) => entry.kind === 'LAYOFF_RESOLVED')
      .reduce((latest, entry) => Math.max(latest, entry.dayIndex), 0);
    if (lastResolvedDay > 0 && day - lastResolvedDay < 7) return { success: false, reason: '裁员事件冷却中' };

    const pressure = this.layoffPressure();
    if (pressure < 45) return { success: false, pressure, reason: '当前经营压力尚未达到岗位预警线' };
    const warningId = `${day}-${sectId}`;
    const before = this.context.player.toSaveData();
    try {
      this.context.player.eventFlags = {
        ...flags,
        'career:layoff:warning-active': true,
        'career:layoff:response-selected': false,
        [`career:layoff:warning:${warningId}`]: true,
      };
      this.recordChoice('LAYOFF_WARNING', `${sectId} 经营压力 ${pressure}/100，收到岗位预警`);
      this.context.saveService.save(this.context.player);
    } catch (error) {
      Object.assign(this.context.player, new PlayerData(before));
      return { success: false, reason: error instanceof Error ? error.message : '裁员预警保存失败' };
    }
    this.context.events.emit('playerChanged', { reason: 'careerLayoffWarning' });
    return { success: true, warningId, pressure };
  }

  /** Persist a single strategic response; choices change the later retention threshold. */
  public chooseLayoffResponse(response: LayoffResponse): { success: boolean; reason?: string } {
    if (!this.context.player.eventFlags['career:layoff:warning-active']) return { success: false, reason: '当前没有待处理的裁员预警' };
    if (!['PROVE_VALUE', 'NPC_SUPPORT', 'JOB_SEARCH', 'ACCEPT_PACKAGE'].includes(response)) return { success: false, reason: '无效的裁员应对选择' };
    if (this.context.player.eventFlags['career:layoff:response-selected']) return { success: false, reason: '本次预警已经选择应对方案' };
    const before = this.context.player.toSaveData();
    try {
      const effectFlags: Record<LayoffResponse, boolean> = {
        PROVE_VALUE: response === 'PROVE_VALUE', NPC_SUPPORT: response === 'NPC_SUPPORT',
        JOB_SEARCH: response === 'JOB_SEARCH', ACCEPT_PACKAGE: response === 'ACCEPT_PACKAGE',
      };
      this.context.player.eventFlags = {
        ...this.context.player.eventFlags,
        'career:layoff:response-selected': true,
        'career:layoff:response:PROVE_VALUE': effectFlags.PROVE_VALUE,
        'career:layoff:response:NPC_SUPPORT': effectFlags.NPC_SUPPORT,
        'career:layoff:response:JOB_SEARCH': effectFlags.JOB_SEARCH,
        'career:layoff:response:ACCEPT_PACKAGE': effectFlags.ACCEPT_PACKAGE,
        ...(response === 'PROVE_VALUE' ? { 'career:layoff:proof-prepared': true } : {}),
        ...(response === 'JOB_SEARCH' ? { 'career:layoff:search-started': true } : {}),
      };
      if (response === 'PROVE_VALUE') this.context.player.performance = Math.max(0, this.context.player.performance + 5);
      if (response === 'NPC_SUPPORT') this.context.npc.change('BOSS', 3);
      if (response === 'ACCEPT_PACKAGE') this.context.player.mind = Math.max(0, this.context.player.mind - 2);
      const labels: Record<LayoffResponse, string> = {
        PROVE_VALUE: '提交交付成果争取保岗', NPC_SUPPORT: '寻求领导支持',
        JOB_SEARCH: '提前启动外部求职', ACCEPT_PACKAGE: '接受离职补偿方案',
      };
      this.recordChoice('LAYOFF_RESPONSE', labels[response]);
      this.context.saveService.save(this.context.player);
    } catch (error) {
      Object.assign(this.context.player, new PlayerData(before));
      return { success: false, reason: error instanceof Error ? error.message : '裁员应对保存失败' };
    }
    this.context.events.emit('playerChanged', { reason: 'careerLayoffResponse' });
    return { success: true };
  }

  /** Settle retention or severance exactly once through the existing salary wallet and employment record. */
  public resolveLayoffWarning(): LayoffResolutionResult {
    const flags = this.context.player.eventFlags;
    if (!flags['career:layoff:warning-active'] || !flags['career:layoff:response-selected']) {
      return { success: false, reason: '裁员预警或应对选择尚未完成' };
    }
    const warning = Object.keys(flags).find((key) => key.startsWith('career:layoff:warning:') && flags[key]);
    if (!warning) return { success: false, reason: '找不到当前预警凭据' };
    const warningId = warning.slice('career:layoff:warning:'.length);
    const receipt = `career:layoff:resolved:${warningId}`;
    if (this.context.player.milestones.includes(receipt)) return { success: false, reason: '本次裁员结果已经结算' };

    const response: LayoffResponse = flags['career:layoff:response:PROVE_VALUE'] ? 'PROVE_VALUE'
      : flags['career:layoff:response:NPC_SUPPORT'] ? 'NPC_SUPPORT'
        : flags['career:layoff:response:JOB_SEARCH'] ? 'JOB_SEARCH' : 'ACCEPT_PACKAGE';
    const adjustedPressure = this.layoffPressure()
      - (response === 'PROVE_VALUE' ? 20 : response === 'NPC_SUPPORT' ? 15 : response === 'JOB_SEARCH' ? 5 : 0);
    const retained = response !== 'ACCEPT_PACKAGE' && adjustedPressure < 65;
    const compensation = retained ? 0 : Math.max(50, Math.round(this.monthlySalary() * 0.25));
    const before = this.context.player.toSaveData();
    try {
      if (!retained) {
        const now = this.context.clockV2.now();
        const formerSectId = this.context.player.sectId;
        const history = [...this.context.player.sectCareerHistory];
        const active = history[history.length - 1];
        if (active && !active.endedAt) history[history.length - 1] = { ...active, endedAt: now };
        else if (this.context.player.sectId) history.push({ sectId: this.context.player.sectId, startedAt: this.context.player.lastSectSwitchTime || 0, endedAt: now });
        this.context.player.sectCareerHistory = history.slice(-30);
        const project = this.context.player.sectProjectContract;
        if (project && project.sectId === formerSectId && (project.status === 'ACCEPTED' || project.status === 'ACTIVE')) {
          this.context.player.sectProjectContract = { ...project, status: 'FAILED' };
        }
        if (this.context.player.pendingSectContract?.sourceSectId === formerSectId) this.context.player.pendingSectContract = null;
        this.context.player.sectApplications = this.context.player.sectApplications.map((application) =>
          application.sourceSectId === formerSectId && (application.status === 'INTERVIEW' || application.status === 'OFFERED')
            ? { ...application, status: 'REJECTED' }
            : application);
        this.context.player.sectId = null;
        this.context.player.eventFlags = { ...this.context.player.eventFlags, [UNEMPLOYED_FLAG]: true };
        this.context.sectCareer.syncActiveSectFlags();
        this.context.economy.applyIdleSalary(compensation);
      }
      this.context.player.eventFlags = {
        ...this.context.player.eventFlags,
        [warning]: false,
        'career:layoff:warning-active': false,
        'career:layoff:response-selected': false,
      };
      this.context.player.milestones = [...this.context.player.milestones, receipt].slice(-128);
      this.recordChoice('LAYOFF_RESOLVED', retained ? '通过应对保住岗位' : `裁员离职并结算游戏内补偿 ${compensation}`);
      this.context.saveService.save(this.context.player);
    } catch (error) {
      Object.assign(this.context.player, new PlayerData(before));
      return { success: false, reason: error instanceof Error ? error.message : '裁员结果保存失败' };
    }
    this.context.events.emit('playerChanged', { reason: retained ? 'careerLayoffRetained' : 'careerLayoffResolved' });
    return { success: true, outcome: retained ? 'RETAINED' : 'LAID_OFF', compensation };
  }

  public promotionCheck(): CareerLifeView['promotion'] {
    const check = this.context.promotionV2.check();
    let sectRequirement = true;
    let sectReason = '';
    const sectId = this.context.player.sectId;
    if (!this.isEmployed()) { sectRequirement = false; sectReason = '待业期间不能申请在职晋升'; }
    else if (sectId === 'FREELANCE') { sectRequirement = false; sectReason = '自由宗门采用合同信誉成长，不走员工职级晋升'; }
    else if (sectId === 'OUTSOURCING') {
      const delivered = this.context.player.projectHistory.some((record) => record.status === 'COMPLETED' && record.npcIds.includes('CLIENT'));
      if (!delivered) { sectRequirement = false; sectReason = '外包宗门晋升需要客户项目交付履历'; }
      else if ((this.context.player.relationships.CLIENT ?? 0) < 20) { sectRequirement = false; sectReason = '外包宗门晋升需要客户认可达到 20'; }
    } else if (sectId === 'STATE_OWNED' && this.context.player.careerLevel < 4 && check.workdaysCurrent < Math.max(14, check.workdaysRequired)) {
      sectRequirement = false; sectReason = `国企晋升周期未到（至少 ${Math.max(14, check.workdaysRequired)} 个工作日）`;
    } else if (sectId === 'BIG_TECH' && this.context.player.performance < 60) {
      sectRequirement = false; sectReason = '大厂晋升需要绩效达到 60';
    } else if (sectId === 'IN_HOUSE' && (this.context.player.relationships.BOSS ?? 0) < 10) {
      sectRequirement = false; sectReason = '内包宗门晋升需要直属领导协作评价达到 10';
    }
    return { ...check, allowed: check.allowed && sectRequirement, reason: !sectRequirement ? sectReason : check.reason, sectRequirement, sectReason };
  }

  public startPromotionInterview(): readonly DefenseQuestion[] {
    const check = this.promotionCheck();
    if (!check.allowed) throw new Error(`不可申请晋升：${check.reason}`);
    return this.context.promotionV2.startDefense();
  }

  public submitPromotionInterview(answers: readonly string[]): DefenseScore {
    const beforeLevel = this.context.player.careerLevel;
    const result = this.context.promotionV2.submitDefense([...answers]);
    if (result.passed && this.context.player.careerLevel > beforeLevel) {
      const level = this.context.player.careerLevel;
      const receipt = `career-promotion-${level}`;
      if (!this.context.player.milestones.includes(receipt)) {
        this.context.player.milestones = [...this.context.player.milestones, receipt].slice(-64);
        this.recordChoice('PROMOTED', `通过职级答辩，晋升至 ${level} 级`);
        this.context.profession.grantExp(25);
        this.context.npc.change('BOSS', 3);
        this.context.saveService.save(this.context.player);
      }
    }
    return result;
  }

  public goals(): CareerGoalView[] {
    const level = this.context.player.careerLevel;
    const monthlySalary = this.monthlySalary();
    const professionLevel = this.context.profession.level();
    const projectCount = this.context.player.projectHistory.filter((record) => record.status === 'COMPLETED').length;
    const careerDay = this.context.gameDay.dayIndex();
    const hadOutsourcing = this.context.player.sectCareerHistory.some((record) => record.sectId === 'OUTSOURCING' && Boolean(record.endedAt));
    const currentSect = this.context.player.sectId;
    let healthyStreak = 0;
    for (let index = this.context.player.dailyHistory.length - 1; index >= 0; index -= 1) {
      const day = this.context.player.dailyHistory[index];
      if (day.mindEnd < 70 || day.dayIndex !== Math.max(1, careerDay) - healthyStreak - 1) break;
      healthyStreak += 1;
    }
    if (this.context.gameDay.current()?.settled && this.context.player.mind >= 70 && this.context.player.fatigue <= 40) healthyStreak += 1;
    const candidates: CareerGoalView[] = [
      goal('senior-engineer', '成为高级工程师', level, 5, '职业经验 +25'),
      goal('career-level-2', '晋升正式职级', level, 2, '职业经验 +25'),
      goal('technical-expert', '成长为技术专家', professionLevel, 8, '职业经验 +30'),
      goal('engineering-manager', '成长为技术管理者', level, 8, '职业经验 +30'),
      goal('client-transfer', '从外包转入甲方', hadOutsourcing && currentSect && currentSect !== 'OUTSOURCING' ? 1 : 0, 1, 'HR 关系 +2、职业经验 +20'),
      goal('salary-5000', '稳定月薪达到 ¥5,000', monthlySalary, 5_000, '职业经验 +30、HR 关系 +2'),
      goal('projects-5', '完成五个项目', projectCount, 5, '解锁项目履历称号'),
      goal('high-risk-project', '完成一次高难度项目', this.context.player.eventFlags['career:goal:high-risk-project'] === true ? 1 : 0, 1, '职业经验 +25'),
      goal('healthy-workdays', '连续完成三个高道心工作日', healthyStreak, 3, '职业经验 +20'),
      goal('wealth-10000', '积累 ¥10,000 财富', this.context.player.salary, 10_000, '职业经验 +35'),
      goal('career-day-30', '完成三十个工作日', careerDay, 30, '职业经验 +40'),
      goal('mind-80', '保持道心在 80 以上', this.context.player.mind, 80, '职业经验 +20'),
    ];
    return candidates;
  }

  public claimGoal(id: string): { success: boolean; reason?: string } {
    const current = this.goals().find((candidate) => candidate.id === id);
    if (!current) return { success: false, reason: '职业目标不存在' };
    if (!current.complete) return { success: false, reason: '职业目标尚未完成' };
    const receipt = `career-goal:${id}`;
    if (this.context.player.milestones.includes(receipt)) return { success: false, reason: '目标奖励已经领取' };
    const before = this.context.player.toSaveData();
    try {
      this.context.player.milestones = [...this.context.player.milestones, receipt].slice(-64);
      const exp = id === 'career-day-30' || id === 'wealth-10000' ? 40
        : id === 'salary-5000' || id === 'technical-expert' || id === 'engineering-manager' ? 30 : 20;
      this.context.profession.grantExp(exp);
      if (id === 'salary-5000' || id === 'client-transfer') this.context.npc.change('HR', 2);
      this.context.saveService.save(this.context.player);
    } catch (error) {
      Object.assign(this.context.player, new PlayerData(before));
      return { success: false, reason: error instanceof Error ? error.message : '目标奖励保存失败' };
    }
    this.context.events.emit('playerChanged', { reason: 'careerGoalClaimed' });
    return { success: true };
  }

  private recordChoice(kind: string, label: string): void {
    this.context.player.careerChoices = [...this.context.player.careerChoices, {
      dayIndex: Math.max(1, this.context.gameDay.dayIndex()), kind, label,
    }].slice(-64);
  }

  private monthlySalary(): number {
    if (!this.isEmployed() || !this.context.player.sectId || this.context.player.sectId === 'FREELANCE') return 0;
    const job = this.context.sectCareer.jobs().find((candidate) => candidate.id === this.context.player.sectId);
    return Math.max(0, Math.round((job?.salaryEstimate ?? 0) * this.context.career.current().salaryMultiplier * 22));
  }

  private layoffPressure(): number {
    const sectId = this.context.player.sectId;
    const sectPressure = this.context.sectCareer.jobs().find((job) => job.id === sectId)?.pressure ?? 50;
    const performanceRelief = Math.min(20, Math.floor(Math.max(0, this.context.player.performance) / 10));
    const bossSupport = Math.min(10, Math.floor(Math.max(0, this.context.player.relationships.BOSS ?? 0) / 5));
    const projectRelief = this.context.player.projectHistory.some((project) => project.status === 'COMPLETED') ? 5 : 0;
    return Math.max(0, Math.min(100, sectPressure - performanceRelief - bossSupport - projectRelief));
  }
}

function goal(id: string, title: string, progress: number, target: number, reward: string): CareerGoalView {
  const normalizedProgress = Math.max(0, Math.floor(progress));
  return { id, title, progress: normalizedProgress, target, complete: normalizedProgress >= target, reward };
}

function clamp(value: number): number { return Math.max(0, Math.min(100, Math.floor(value))); }
