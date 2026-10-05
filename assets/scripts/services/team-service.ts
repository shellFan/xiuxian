import type { GameContext } from '../core/game-context';
import type { NpcId } from '../v2/npc-weekend-service';
import type { TeamMemberState, TeamState } from '../model/save-data';

/**
 * V5.8 P0 — Team / Mentorship（§9.3/§10）。
 * L4+：Mentorship 事件池解锁（带新人/Code Review/技术方案）。
 * L7+：Team Panel（3~6 名 NPC 团队），分配 1~3 个任务，管理层道德镜像
 * （managerExploitationScore / managerProtectionScore → NPC 态度 + 隐藏成就）。
 */

const MEMBER_POOL: readonly { npcId: NpcId; name: string; profession: string; specialty: string }[] = [
  { npcId: 'JUNIOR', name: '实习生小陈', profession: 'JAVA_BACKEND', specialty: '边界与热情' },
  { npcId: 'TESTER', name: '测试仙子', profession: 'QA', specialty: '偶现Bug追猎' },
  { npcId: 'OPS', name: '运维老哥', profession: 'DEVOPS', specialty: '凌晨救火' },
  { npcId: 'VETERAN', name: '老油条', profession: 'FRONTEND', specialty: '像素级糊弄' },
  { npcId: 'JUNIOR', name: '新人小王', profession: 'FRONTEND', specialty: '800行if-else' },
  { npcId: 'PRODUCT', name: '产品真君', profession: 'QA', specialty: '需求口径' },
];

const MANAGER_RANK = 7;

export class TeamService {
  public constructor(private readonly context: GameContext) {}

  /** 职业层级：careerLevel 1~10（§9）。 */
  public careerRank(): number {
    return this.context.player.careerLevel ?? 1;
  }

  public isManager(): boolean {
    return this.careerRank() >= MANAGER_RANK;
  }

  public mentorshipUnlocked(): boolean {
    return this.careerRank() >= 4;
  }

  /** L7 晋升时初始化团队（从 NPC 关系池拉 3~6 人）。 */
  public ensureTeam(): TeamState {
    const p = this.context.player;
    if (p.teamState) return p.teamState;
    const rng = this.context.randomV2.forDay(p.gameDay?.dayIndex ?? 1, 5901);
    const count = 3 + Math.floor(rng.next() * 3);
    const members: TeamMemberState[] = [];
    const used = new Set<string>();
    for (const slot of MEMBER_POOL) {
      if (members.length >= count) break;
      if (used.has(slot.name)) continue;
      used.add(slot.name);
      members.push({
        npcId: slot.npcId, name: slot.name, profession: slot.profession,
        level: 1 + Math.floor(rng.next() * 3),
        mood: 50 + Math.floor(rng.next() * 30),
        workload: Math.floor(rng.next() * 40),
        fatigue: Math.floor(rng.next() * 30),
        trustPlayer: Math.floor(rng.next() * 30),
        growth: 0,
        mentoredByPlayer: false,
        specialty: slot.specialty,
      });
    }
    p.teamState = { members, exploitationScore: 0, protectionScore: 0 };
    this.context.events.emit('teamFormed', { members: members.length });
    return p.teamState;
  }

  public views(): readonly TeamMemberState[] {
    return this.context.player.teamState?.members ?? [];
  }

  /** 分配任务：成员 workload+/fatigue+，mood 视 workload 而定。每天最多 3 次分配。 */
  public assignTask(memberName: string): { ok: boolean; reason?: string; mood?: number; workload?: number } {
    if (!this.isManager()) return { ok: false, reason: '晋升主管后解锁团队管理' };
    const p = this.context.player;
    var team = p.teamState;
    if (!team) return { ok: false, reason: '团队尚未组建' };
    var today = p.gameDay?.dayIndex ?? 1;
    // F03: use formal numeric state (not eventFlags)
    var assignment = team.dailyAssignment;
    var count = (assignment && assignment.day === today) ? assignment.count : 0;
    if (count >= 3) return { ok: false, reason: '今天的活已经分完了（3/3）' };
    var member = team.members.find(function(m) { return m.name === memberName; });
    if (!member) return { ok: false, reason: 'MEMBER_NOT_FOUND' };
    var members = team.members.map(function(m) {
      if (m.name !== memberName) return m;
      var workload = Math.min(100, m.workload + 25);
      var mood = Math.max(0, m.mood - (m.workload >= 75 ? 8 : 3));
      return Object.assign({}, m, { workload: workload, mood: mood, fatigue: Math.min(100, m.fatigue + 6) });
    });
    // F03+F22: merge daily state — preserve dailyMentorship when updating dailyAssignment
    p.teamState = Object.assign({}, team, {
      members: members,
      dailyAssignment: { day: today, count: count + 1 },
    });
    this.context.events.emit('teamTaskAssigned', { member: memberName, assignedToday: count + 1 });
    return { ok: true, mood: member.mood, workload: member.workload };
  }

  /** 管理层决策记录：强制免费加班 / 保护团队。道德镜像（§9.4）。 */
  public recordManagerChoice(kind: 'EXPLOIT' | 'PROTECT', label: string): void {
    const p = this.context.player;
    const team = p.teamState;
    const day = p.gameDay?.dayIndex ?? 1;
    p.careerChoices = [...(p.careerChoices ?? []), { dayIndex: day, kind: 'MANAGER_' + kind, label }].slice(-24);
    if (kind === 'EXPLOIT') {
      const stats = p.lifetimeStats;
      p.lifetimeStats = { ...stats, managerExploitationScore: (stats.managerExploitationScore ?? 0) + 1 };
      if (team) {
        p.teamState = {
          ...team,
          exploitationScore: team.exploitationScore + 1,
          members: team.members.map((m) => ({ ...m, mood: Math.max(0, m.mood - 6), fatigue: Math.min(100, m.fatigue + 12), trustPlayer: m.trustPlayer - 4 })),
        };
      }
      if ((p.lifetimeStats.managerExploitationScore ?? 0) >= 5) {
        p.managerFlags = { ...(p.managerFlags ?? {}), ['dragonSlayer']: true };
        this.context.events.emit('managerVerdict', { kind, title: '《屠龙者终成恶龙》', text: '你成了当年你最讨厌的那种领导。' });
      }
    } else {
      const stats = p.lifetimeStats;
      p.lifetimeStats = { ...stats, managerProtectionScore: (stats.managerProtectionScore ?? 0) + 1 };
      if (team) {
        p.teamState = {
          ...team,
          protectionScore: team.protectionScore + 1,
          members: team.members.map((m) => ({ ...m, mood: Math.min(100, m.mood + 5), trustPlayer: m.trustPlayer + 4 })),
        };
      }
      if ((p.lifetimeStats.managerProtectionScore ?? 0) >= 5) {
        p.managerFlags = { ...(p.managerFlags ?? {}), ['guardian']: true };
        this.context.events.emit('managerVerdict', { kind, title: '《牛马保护神》', text: '团队背后有你，才敢安心下班。' });
      }
    }
  }

  /** 指导新人：F06 成员校验 + F07 growth 消耗 + daily cap + F26 时间/工时成本。 */
  public mentor(memberName: string): { ok: boolean; growth?: number; level?: number; reason?: string } {
    if (!this.mentorshipUnlocked()) return { ok: false, reason: 'L4 后解锁带人玩法' };
    var p = this.context.player;
    // F26: must be during work hours
    if (!this.context.clockV2.isWorkingHours()) return { ok: false, reason: '下班了不能指导，明天再来' };
    var team = p.teamState;
    if (!team) return { ok: false, reason: '团队尚未组建' };
    // F06: check member existence BEFORE any side effects
    var member = team.members.find(function(m) { return m.name === memberName; });
    if (!member) return { ok: false, reason: 'MEMBER_NOT_FOUND' };
    var today = p.gameDay?.dayIndex ?? 1;
    // F06（OVERNIGHT）：真实时间成本 —— 30 游戏分钟，工时不足明确拒绝
    var MENTOR_MINUTES = 30;
    var MENTOR_FATIGUE_COST = 5;
    if (this.context.clockV2.remainingWorkMinutes() < MENTOR_MINUTES) {
      return { ok: false, reason: '离下班不到半小时了，带不动一轮完整的指导' };
    }
    if ((p.fatigue ?? 0) + MENTOR_FATIGUE_COST >= 100) return { ok: false, reason: '疲劳太高，无法指导' };
    // F07: daily cap — separate from assignment cap. Team total max 2/day.
    var mentorship = team.dailyMentorship;
    var mentorSameDay = mentorship != null && mentorship.day === today;
    var mentorCount = mentorSameDay ? mentorship!.count : 0;
    if (mentorCount >= 2) return { ok: false, reason: '今天指导次数已用完（2/2）' };
    // F07: per-member daily cap
    var mentorFlagKey = 'mentor_' + memberName + '_' + today;
    if (p.managerFlags && p.managerFlags[mentorFlagKey]) return { ok: false, reason: '该成员今天已被指导过' };
    // F07: time cost — mentorship consumes 30 game-minutes
    var REQUIRED_GROWTH = [0, 15, 35, 60]; // Lv1→2: 15, Lv2→3: 35, Lv3→4: 60
    var MAX_LEVEL = 4;
    var MAX_GROWTH = 80;
    // Apply growth
    var newGrowth = member.growth + 8;
    var newLevel = member.level;
    // F07: growth consumption — each level-up consumes required growth
    while (newLevel < MAX_LEVEL && newGrowth >= (REQUIRED_GROWTH[newLevel] ?? MAX_GROWTH)) {
      newGrowth -= (REQUIRED_GROWTH[newLevel] ?? MAX_GROWTH);
      newLevel += 1;
    }
    if (newLevel >= MAX_LEVEL) newGrowth = Math.min(newGrowth, MAX_GROWTH);
    var members = team.members.map(function(m) {
      if (m.name !== memberName) return m;
      return Object.assign({}, m, {
        growth: newGrowth,
        level: newLevel,
        mentoredByPlayer: true,
        trustPlayer: Math.min(100, m.trustPlayer + 3),
      });
    });
    // F22: merge daily state — preserve dailyAssignment when updating dailyMentorship
    p.teamState = Object.assign({}, team, {
      members: members,
      dailyMentorship: { day: today, count: mentorCount + 1 },
    });
    // F07: per-member daily flag — prune stale mentor_<name>_<day> keys so the
    // flag map stays bounded (only today's mentor flags survive a mentor action)
    var flags: Record<string, boolean> = {};
    var prevFlags = p.managerFlags || {};
    var todaySuffix = '_' + today;
    for (var k in prevFlags) {
      if (Object.prototype.hasOwnProperty.call(prevFlags, k)) {
        if (k.indexOf('mentor_') !== 0 || (k.length >= todaySuffix.length && k.slice(-todaySuffix.length) === todaySuffix)) {
          flags[k] = (prevFlags as Record<string, boolean>)[k];
        }
      }
    }
    flags[mentorFlagKey] = true;
    p.managerFlags = flags;
    // F06（OVERNIGHT）：真正消耗 30 游戏分钟 + 5 点疲劳（此前只有检查没有落地）
    this.context.clockV2.consumeGameMinutes(MENTOR_MINUTES);
    p.fatigue = Math.min(100, (p.fatigue ?? 0) + MENTOR_FATIGUE_COST);
    var stats = p.lifetimeStats;
    p.lifetimeStats = Object.assign({}, stats, { mentoredCount: (stats.mentoredCount || 0) + 1 });
    this.context.events.emit('mentored', { member: memberName });
    return { ok: true, growth: newGrowth, level: newLevel };
  }
}
