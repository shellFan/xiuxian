import type { GameContext } from '../core/game-context';
import type { SectId } from '../model/config-types';
import type { PendingSectContractState, SectJobApplicationState } from '../model/save-data';
import { PlayerData } from '../model/player-data';

const SWITCH_COOLDOWN_MS = 48 * 60 * 60 * 1000;
const PROFESSION_WAGE: Readonly<Record<string, number>> = { JAVA_BACKEND: 1.1, FRONTEND: 1, QA: 0.95, DEVOPS: 1.08 };
export type InterviewAnswer = 'DELIVERY' | 'TEAMWORK' | 'RISK';

/** Persistent recruitment, interview and next-workday contract lifecycle. */
export class SectCareerService {
  public constructor(private readonly context: GameContext) {
    this.syncActiveSectFlags();
    context.events.on('gameDayStarted', this.onGameDayStarted);
  }

  /** Feed the shared event scheduler with the current employer, including migrated saves. */
  public syncActiveSectFlags(): void {
    const flags = { ...this.context.player.eventFlags };
    for (const sect of this.context.sect.available()) flags[`sect:${sect.id}`] = sect.id === this.context.player.sectId;
    this.context.player.eventFlags = flags;
  }

  public jobs() {
    const profession = this.context.profession?.currentId?.() ?? 'JAVA_BACKEND';
    return this.context.sect.available().map((sect) => ({
      id: sect.id,
      name: sect.name,
      current: this.context.player.eventFlags['career:unemployed'] !== true && sect.id === this.context.player.sectId,
      salaryEstimate: Math.round(120 * sect.modifiers.salaryMultiplier * (PROFESSION_WAGE[profession] ?? 1)),
      salaryMultiplier: sect.modifiers.salaryMultiplier,
      overtimeRule: sect.employment?.overtimeRule ?? 'REQUEST',
      pressure: sect.employment?.pressure ?? 50,
      advantages: [...(sect.employment?.advantages ?? [])],
      requirements: { minimumPerformance: 0, profession },
    }));
  }

  public applications(): readonly SectJobApplicationState[] {
    return this.context.player.sectApplications.map((application) => ({ ...application }));
  }

  public apply(sectId: string): SectJobApplicationState {
    const target = this.context.sect.get(sectId as SectId);
    const unemployed = this.context.player.eventFlags['career:unemployed'] === true;
    const current = this.context.player.sectId
      ?? this.context.player.sectCareerHistory[this.context.player.sectCareerHistory.length - 1]?.sectId
      ?? null;
    if (!current) throw new Error('尚未选择当前宗门');
    if (target.id === current && !unemployed) throw new Error('已经在该宗门任职');
    if (this.context.player.pendingSectContract) throw new Error('已有待生效的新合同');
    const now = this.context.clockV2.now();
    if (!unemployed && this.context.player.lastSectSwitchTime > 0 && now - this.context.player.lastSectSwitchTime < SWITCH_COOLDOWN_MS) {
      throw new Error('跳槽冷却中，请先稳定履职');
    }
    const dayIndex = Math.max(1, this.context.gameDay.dayIndex());
    const previous = this.context.player.sectApplications.find((application) => application.appliedAt >= this.context.clockV2.workdayStartTs());
    if (previous) throw new Error('今日已完成一次招聘申请');
    const id = `sect-job-${dayIndex}-${target.id}-${this.context.profession.currentId()}`;
    const application: SectJobApplicationState = { id, sourceSectId: current, targetSectId: target.id, appliedAt: now, status: 'INTERVIEW' };
    this.context.player.sectApplications = [...this.context.player.sectApplications.filter((entry) => entry.id !== id), application].slice(-30);
    this.context.saveService.save(this.context.player);
    return { ...application };
  }

  public resolveInterview(applicationId: string, answer: InterviewAnswer): SectJobApplicationState {
    const application = this.context.player.sectApplications.find((entry) => entry.id === applicationId);
    if (!application || application.status !== 'INTERVIEW') throw new Error('没有待完成的面试');
    const answerBonus: Readonly<Record<InterviewAnswer, number>> = { DELIVERY: 15, TEAMWORK: 12, RISK: 8 };
    const threshold = 50 + (stableHash(application.targetSectId) % 31);
    const score = Math.min(100, Math.max(0, Math.floor(this.context.player.performance))
      + Math.min(10, this.context.player.careerLevel * 2) + answerBonus[answer]
      + this.context.profession.interviewBonus(answer));
    const updated = { ...application, interviewScore: score, interviewThreshold: threshold, status: score >= threshold ? 'OFFERED' as const : 'REJECTED' as const };
    this.replaceApplication(updated);
    this.context.saveService.save(this.context.player);
    this.context.events.emit('playerChanged', { reason: 'sectInterviewResolved' });
    return { ...updated };
  }

  public acceptOffer(applicationId: string): PendingSectContractState {
    const application = this.context.player.sectApplications.find((entry) => entry.id === applicationId);
    if (!application || application.status !== 'OFFERED') throw new Error('没有可接受的宗门录用通知');
    const pending: PendingSectContractState = {
      applicationId, sourceSectId: application.sourceSectId, sectId: application.targetSectId,
      effectiveDayIndex: Math.max(1, this.context.gameDay.dayIndex()) + 1,
      acceptedAt: this.context.clockV2.now(),
    };
    const before = this.context.player.toSaveData();
    try {
      this.context.player.pendingSectContract = pending;
      this.replaceApplication({ ...application, status: 'ACCEPTED' });
      this.context.saveService.save(this.context.player);
    } catch (error) {
      Object.assign(this.context.player, new PlayerData(before));
      throw error;
    }
    return { ...pending };
  }

  private replaceApplication(application: SectJobApplicationState): void {
    this.context.player.sectApplications = this.context.player.sectApplications.map((entry) => entry.id === application.id ? application : entry);
  }

  private readonly onGameDayStarted = (payload: unknown): void => {
    if (!payload || typeof payload !== 'object' || !('dayIndex' in payload) || typeof payload.dayIndex !== 'number') return;
    const event = payload as { dayIndex: number };
    const pending = this.context.player.pendingSectContract;
    if (!pending || event.dayIndex < pending.effectiveDayIndex) return;
    const now = this.context.clockV2.now();
    const history = [...this.context.player.sectCareerHistory];
    const current = history[history.length - 1];
    if (current && !current.endedAt) history[history.length - 1] = { ...current, endedAt: now };
    const source = this.context.player.sectId ?? pending.sourceSectId;
    if (!history.length || history[history.length - 1]?.sectId !== source) history.push({ sectId: source, startedAt: this.context.player.lastSectSwitchTime || 0, endedAt: now });
    history.push({ sectId: pending.sectId, startedAt: now });
    this.context.player.sectCareerHistory = history.slice(-30);
    this.context.player.sectId = pending.sectId;
    const eventFlags = { ...this.context.player.eventFlags };
    delete eventFlags['career:unemployed'];
    this.context.player.eventFlags = eventFlags;
    this.syncActiveSectFlags();
    this.context.player.lastSectSwitchTime = now;
    this.context.player.pendingSectContract = null;
    this.context.saveService.save(this.context.player);
    this.context.events.emit('sectChanged', { sectId: pending.sectId });
    this.context.events.emit('playerChanged', { reason: 'sectContractEffective' });
  };
}

function stableHash(text: string): number {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) value = (value * 31 + text.charCodeAt(index)) >>> 0;
  return value;
}
