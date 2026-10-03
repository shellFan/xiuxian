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
    const team = p.teamState;
    if (!team) return { ok: false, reason: '团队尚未组建' };
    const today = p.gameDay?.dayIndex ?? 1;
    const assignedToday = p.eventFlags?.[`team_assign_${today}`] ?? 0;
    const flagCount = typeof assignedToday === 'number' ? assignedToday : 0;
    if (flagCount >= 3) return { ok: false, reason: '今天的活已经分完了（3/3）' };
    const member = team.members.find((m) => m.name === memberName);
    if (!member) return { ok: false, reason: '团队成员不存在' };
    const members = team.members.map((m) => {
      if (m.name !== memberName) return m;
      const workload = Math.min(100, m.workload + 25);
      const mood = Math.max(0, m.mood - (m.workload >= 75 ? 8 : 3));
      return { ...m, workload, mood, fatigue: Math.min(100, m.fatigue + 6) };
    });
    p.teamState = { ...team, members };
    p.eventFlags = { ...(p.eventFlags ?? {}), [`team_assign_${today}`]: flagCount + 1 } as never;
    this.context.events.emit('teamTaskAssigned', { member: memberName, assignedToday: flagCount + 1 });
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

  /** 指导新人（Mentorship 事件调用）：growth+，日积月累可以替你扛简单 Bug。 */
  public mentor(memberName: string): { ok: boolean; growth?: number; reason?: string } {
    if (!this.mentorshipUnlocked()) return { ok: false, reason: 'L4 后解锁带人玩法' };
    const p = this.context.player;
    const team = p.teamState;
    if (!team) return { ok: false, reason: '团队尚未组建' };
    const members = team.members.map((m) => {
      if (m.name !== memberName) return m;
      return { ...m, growth: m.growth + 8, level: m.growth + 8 >= 30 ? m.level + 1 : m.level, mentoredByPlayer: true, trustPlayer: Math.min(100, m.trustPlayer + 3) };
    });
    p.teamState = { ...team, members };
    const stats = p.lifetimeStats;
    p.lifetimeStats = { ...stats, mentoredCount: (stats.mentoredCount ?? 0) + 1 };
    this.context.events.emit('mentored', { member: memberName });
    return { ok: true };
  }
}
