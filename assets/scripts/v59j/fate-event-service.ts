import type { GameContext } from '../core/game-context';
import type { FateEventOption, FateEventDefinition, FateEventOutcome } from './fate-event-schema';
import { normalizeFateRun } from './fate-state';
import { PlayerData } from '../model/player-data';
import content from '../../configs/v2/fate-events.json';
import npcContent from '../../configs/v2/fate-npcs.json';
import { SECT_CAREER_FATE_EVENTS } from './sect-career-fate-events';

export interface FateEventChoiceResult {
  readonly eventId: string;
  readonly optionId: string;
  readonly success: boolean;
  readonly outcomeText: string;
  readonly endingId: string | null;
  readonly challengeId: string | null;
}

export interface FateChallengeStartResult {
  readonly challengeId: string;
  readonly battleRunId: string;
  readonly source: 'INCIDENT';
  readonly buildId: string;
}

const FATE_EVENTS = [...(content as { events: FateEventDefinition[] }).events, ...SECT_CAREER_FATE_EVENTS];
const FATE_EVENT_MAP = new Map(FATE_EVENTS.map((event) => [event.id, event]));
const FATE_NPCS = (npcContent as { npcs: { id: string; name: string; role: string; description: string }[] }).npcs;
const QUEUE_LIMIT = 5;

/** Authoritative, fixed-seed event queue layered on the existing player and economy state. */
export class FateEventService {
  public constructor(private readonly context: GameContext, private readonly definitions: readonly FateEventDefinition[] = FATE_EVENTS) {}

  public beginRun(seed: number) {
    return this.transaction(() => this.initializeRun(seed));
  }

  /** Initializes under a caller-owned transaction, used by the battle milestone commit. */
  public initializeRun(seed: number) {
    if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('Invalid fate seed');
    const current = this.context.player.fateRun;
    if (current?.status === 'ACTIVE') throw new Error('A fate run is already active');
    const runNumber = (this.context.player.rebirthMeta.settledRunIds.length + 1).toString(36);
    const now = this.context.clockV2.now();
    const run = normalizeFateRun({
      runId: `fate-${now.toString(36)}-${runNumber}-${seed.toString(36)}`,
      startedAt: now,
      seed: seed >>> 0,
      rngCursor: 0,
      cardBattleWins: 0,
      status: 'ACTIVE',
      health: 100,
      maxHealth: 100,
      stage: 1,
      eventQueue: [],
      firedEventIds: [],
      eventHistory: [],
      flags: {},
      activeChallengeId: null,
      activeChallengeBattleRunId: null,
      activeChallengeStartedAt: null,
      terminalOutcomeId: null,
    });
    if (!run) throw new Error('Unable to initialize fate run');
    this.context.player.fateRun = run;
    return run;
  }

  /** Bridge normal card-battle victories into the persistent Fate story milestones. */
  public recordCardBattleVictory(seed: number): string[] {
    if (!this.context.player.fateRun) this.initializeRun(seed);
    const current = this.context.player.fateRun;
    if (!current || current.status !== 'ACTIVE') return [];
    const wins = (current.cardBattleWins ?? 0) + 1;
    this.transaction(() => {
      const run = this.context.player.fateRun;
      if (!run || run.status !== 'ACTIVE') throw new Error('Fate run is not active');
      this.context.player.fateRun = { ...run, cardBattleWins: wins };
    });
    const milestone = wins === 1 ? 'card-battle:first-win'
      : wins === 2 ? 'card-battle:second-win'
        : `card-battle:win:${wins}`;
    return this.triggerMilestone(milestone);
  }

  public state() {
    return this.context.player.fateRun ? structuredCloneSafe(this.context.player.fateRun) : null;
  }

  public npcRelationships() {
    return FATE_NPCS.map((npc) => ({ ...npc, relationship: this.context.player.relationships[npc.id] ?? 0 }));
  }

  public combatModifiers() {
    const run = this.context.player.fateRun;
    const now = this.context.clockV2.now();
    const active = (run?.combatModifiers ?? []).filter((modifier) => modifier.expiresAt > now);
    return {
      attackMultiplier: active.reduce((value, modifier) => value * modifier.attackMultiplier, 1) * (1 + this.context.rebirth.talentRank('born_cow') * 0.03),
      critChanceDelta: active.reduce((value, modifier) => value + modifier.critChanceDelta, 0),
      autoIntervalMultiplier: active.reduce((value, modifier) => value * modifier.autoIntervalMultiplier, 1) * (1 - this.context.rebirth.talentRank('fishing_master') * 0.02),
      skillCooldownMultiplier: active.reduce((value, modifier) => value * modifier.skillCooldownMultiplier, 1),
    };
  }

  public currentEvent(): FateEventDefinition | null {
    const run = this.context.player.fateRun;
    if (!run || run.status !== 'ACTIVE') return null;
    const id = run.eventQueue[0];
    return id ? FATE_EVENT_MAP.get(id) ?? null : null;
  }

  public visibleOptions(): readonly FateEventOption[] {
    const event = this.currentEvent();
    if (!event) return [];
    return event.options.filter((option) => this.meetsRequirements(option, event));
  }

  /** Queue one eligible event for a named gameplay milestone, preserving stable weighted order. */
  public triggerMilestone(milestone: string): string[] {
    if (typeof milestone !== 'string' || !milestone.trim()) throw new Error('Invalid fate milestone');
    const run = this.context.player.fateRun;
    if (!run || run.status !== 'ACTIVE') return [];
    const candidates = this.definitions
      .filter((event) => event.trigger.milestone === milestone && this.eventEligible(event, run))
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
    if (candidates.length === 0 || run.eventQueue.length >= QUEUE_LIMIT) return [];
    return this.transaction(() => {
      const selected = candidates.length === 1 ? candidates[0] : this.weightedEvent(candidates);
      this.enqueue(selected.id);
      return [selected.id];
    });
  }

  /** Resolve only the queue head; the effect, branch history, chain and queue commit together. */
  public choose(eventId: string, optionId: string): FateEventChoiceResult {
    const event = this.currentEvent();
    if (!event || event.id !== eventId) throw new Error('Fate event is not current');
    const option = this.visibleOptions().find((candidate) => candidate.id === optionId);
    if (!option) throw new Error('Fate event option is unavailable');
    const result = this.transaction(() => {
      const officeVeteranRank = this.context.rebirth.talentRank('office_veteran');
      const successChance = option.successChance === undefined ? undefined : Math.min(0.9, option.successChance + officeVeteranRank * 0.03);
      const success = successChance === undefined ? true : this.roll() < successChance;
      const originalOutcome = success ? option.success : option.failure;
      const run = this.context.player.fateRun;
      if (!run) throw new Error('Fate run is missing');
      const nineLivesSaved = !!originalOutcome.deathEnding
        && this.context.rebirth.talentRank('nine_lives') > 0
        && run.flags.nine_lives_used !== true;
      const outcome = nineLivesSaved ? { ...originalOutcome, endingId: undefined, deathEnding: false } : originalOutcome;
      if (outcome.lifePurchase) {
        const purchase = this.context.home.consumeLife(outcome.lifePurchase, { persist: false });
        if (!purchase.ok) throw new Error(purchase.reason ?? '生活消费失败');
      }
      this.applyOutcome(outcome);
      let flags = { ...this.context.player.fateRun!.flags };
      for (const flag of outcome.setFlags ?? []) flags[flag] = true;
      for (const flag of outcome.clearFlags ?? []) delete flags[flag];
      if (nineLivesSaved) flags.nine_lives_used = true;

      const history = [...this.context.player.fateRun!.eventHistory, {
        eventId: event.id,
        choiceId: option.id,
        resultId: success ? 'SUCCESS' : 'FAILURE',
        resolvedAt: this.context.clockV2.now(),
      }].slice(-200);
      const queue = this.context.player.fateRun!.eventQueue.slice(1);
      const fired = new Set(this.context.player.fateRun!.firedEventIds);
      if (outcome.nextEventId && this.eventEligible(FATE_EVENT_MAP.get(outcome.nextEventId)!, this.context.player.fateRun!)) {
        queue.push(outcome.nextEventId);
        fired.add(outcome.nextEventId);
      }
      const explicitEnding = outcome.endingId ?? null;
      const now = this.context.clockV2.now();
      const combatModifiers = this.context.player.fateRun!.combatModifiers.filter((modifier) => modifier.expiresAt > now && modifier.id !== outcome.combatModifier?.id);
      if (outcome.combatModifier) {
        combatModifiers.push({
          id: outcome.combatModifier.id,
          expiresAt: now + outcome.combatModifier.durationSeconds * 1000,
          attackMultiplier: outcome.combatModifier.attackMultiplier ?? 1,
          critChanceDelta: outcome.combatModifier.critChanceDelta ?? 0,
          autoIntervalMultiplier: outcome.combatModifier.autoIntervalMultiplier ?? 1,
          skillCooldownMultiplier: outcome.combatModifier.skillCooldownMultiplier ?? 1,
        });
      }
      const health = nineLivesSaved
        ? Math.max(1, Math.min(run.maxHealth, run.health + (outcome.health ?? 0)))
        : Math.max(0, Math.min(run.maxHealth, run.health + (outcome.health ?? 0)));
      const terminalOutcomeId = explicitEnding ?? (health <= 0 ? 'health_exhaustion' : null);
      const status = terminalOutcomeId ? 'ENDED' : 'ACTIVE';
      this.context.player.fateRun = {
        ...this.context.player.fateRun!,
        status,
        health: outcome.deathEnding ? 0 : health,
        stage: Math.max(run.stage, event.chainStage ?? run.stage),
        eventQueue: queue.slice(0, QUEUE_LIMIT),
        // Cocos 3.8 transpiles `[...new Set()]` into `[Set]`; use Array.from so
        // the persisted IDs stay strings in packaged Electron/Web builds.
        firedEventIds: Array.from(fired).slice(-256),
        eventHistory: history,
        flags,
        combatModifiers: combatModifiers.slice(-8),
        activeChallengeId: outcome.challengeId ?? null,
        terminalOutcomeId,
      };
      return { eventId, optionId, success, outcomeText: outcome.text, endingId: terminalOutcomeId, challengeId: outcome.challengeId ?? null };
    });
    this.context.events.emit('fateEventResolved', { eventId, optionId, success: result.success, outcomeText: result.outcomeText });
    return result;
  }

  /** Start the selected challenge using the existing authoritative V3 battle service. */
  public startActiveChallenge(buildId: string): FateChallengeStartResult {
    const run = this.context.player.fateRun;
    const challengeId = run?.activeChallengeId;
    if (!run || run.status !== 'ACTIVE' || !challengeId) throw new Error('No active fate challenge');
    if (!['online_incident', 'scapegoat_boss', 'secret_trial'].includes(challengeId)) throw new Error('Unknown fate challenge');
    if (run.activeChallengeBattleRunId) throw new Error('Fate challenge has already started');
    return this.transaction(() => {
      const specialBoss = challengeBossIds[challengeId];
      const battle = this.context.battle.start('INCIDENT', buildId, null, challengeId, { replayBossId: specialBoss });
      const current = this.context.player.fateRun;
      if (!current || current.activeChallengeId !== challengeId) throw new Error('Fate challenge changed while starting');
      this.context.player.fateRun = {
        ...current,
        activeChallengeBattleRunId: battle.runId,
        activeChallengeStartedAt: this.context.clockV2.now(),
      };
      return { challengeId, battleRunId: battle.runId, source: 'INCIDENT', buildId: battle.buildId };
    });
  }

  /** Settle only the matching completed V3 battle; repeated polls become a no-op. */
  public settleActiveChallenge(): 'VICTORY' | 'DEFEAT' | null {
    const run = this.context.player.fateRun;
    const challengeId = run?.activeChallengeId;
    if (!run || run.status !== 'ACTIVE' || !challengeId) return null;
    const expectedRunId = run.activeChallengeBattleRunId;
    const battle = this.context.battle.finished();
    if (typeof expectedRunId !== 'string' || !battle || battle.runId !== expectedRunId || battle.status === 'FIGHTING') return null;
    return this.transaction(() => {
      const current = this.context.player.fateRun;
      if (!current || current.activeChallengeId !== challengeId || current.activeChallengeBattleRunId !== expectedRunId) return null;
      const elapsed = Math.max(0, this.context.clockV2.now() - (current.activeChallengeStartedAt ?? this.context.clockV2.now()));
      const victoryConditionsMet = battle.status === 'VICTORY'
        && elapsed <= 180_000
        && (challengeId !== 'online_incident' || current.health >= 60)
        && (challengeId !== 'scapegoat_boss' || this.context.player.mind >= 20);
      const result: 'VICTORY' | 'DEFEAT' = victoryConditionsMet ? 'VICTORY' : 'DEFEAT';
      const fatal = result === 'DEFEAT' && current.health <= 15;
      const nineLivesSaved = fatal && this.context.rebirth.talentRank('nine_lives') > 0 && current.flags.nine_lives_used !== true;
      const health = nineLivesSaved ? 1 : result === 'DEFEAT' ? Math.max(0, current.health - 15) : current.health;
      const ended = health <= 0;
      this.context.player.fateRun = {
        ...current,
        status: ended ? 'ENDED' : current.status,
        health,
        terminalOutcomeId: ended ? 'challenge_failure' : current.terminalOutcomeId,
        activeChallengeId: null,
        activeChallengeBattleRunId: null,
        activeChallengeStartedAt: null,
        flags: { ...current.flags, [`challenge:${challengeId}:${result}`]: true, ...(nineLivesSaved ? { nine_lives_used: true } : {}) },
      };
      return result;
    });
  }

  public tickActiveChallenge(): void {
    const run = this.context.player.fateRun;
    if (!run?.activeChallengeId || !run.activeChallengeStartedAt || !this.context.battle.current()) return;
    if (this.context.clockV2.now() - run.activeChallengeStartedAt >= 180_000) {
      this.context.battle.abandon();
      this.settleActiveChallenge();
    }
  }

  private weightedEvent(candidates: readonly FateEventDefinition[]): FateEventDefinition {
    const luckyRank = this.context.rebirth.talentRank('lucky_worker');
    const weightOf = (event: FateEventDefinition) => event.weight * (event.hidden ? 1 + luckyRank * 0.05 : 1);
    const total = candidates.reduce((sum, event) => sum + weightOf(event), 0);
    const roll = this.roll() * total;
    let offset = 0;
    for (const event of candidates) {
      offset += weightOf(event);
      if (roll < offset) return event;
    }
    return candidates[candidates.length - 1];
  }

  private roll(): number {
    const run = this.context.player.fateRun;
    if (!run) throw new Error('Fate run is missing');
    const cursor = run.rngCursor;
    const value = mulberryAt(run.seed, cursor);
    this.context.player.fateRun = { ...run, rngCursor: cursor + 1 };
    return value;
  }

  private eventEligible(event: FateEventDefinition, run: NonNullable<typeof this.context.player.fateRun>): boolean {
    return run.status === 'ACTIVE'
      && !run.firedEventIds.includes(event.id)
      && !run.eventQueue.includes(event.id)
      && (event.requiredFlags ?? []).every((flag) => run.flags[flag] === true);
  }

  private meetsRequirements(option: FateEventOption, event: FateEventDefinition): boolean {
    const run = this.context.player.fateRun;
    if (!run) return false;
    if (!(event.requiredFlags ?? []).every((flag) => run.flags[flag] === true)) return false;
    const req = option.requirements;
    if (!req) return true;
    if (req.profession && this.context.player.profession !== req.profession) return false;
    if (req.equipment && !this.context.player.ownedEquipment.includes(req.equipment)) return false;
    if (req.technique && !this.context.player.ownedTechniques.includes(req.technique)) return false;
    if (req.minCareer !== undefined && this.context.player.careerLevel < req.minCareer) return false;
    if (req.minMind !== undefined && this.context.player.mind < req.minMind) return false;
    if (!(req.requiredFlags ?? []).every((flag) => run.flags[flag] === true)) return false;
    return Object.entries(req.relationship ?? {}).every(([npc, minimum]) => (this.context.player.relationships[npc] ?? 0) >= minimum);
  }

  private enqueue(id: string): void {
    const run = this.context.player.fateRun;
    if (!run || run.eventQueue.length >= QUEUE_LIMIT || !this.eventEligible(FATE_EVENT_MAP.get(id)!, run)) return;
    this.context.player.fateRun = { ...run, eventQueue: [...run.eventQueue, id], firedEventIds: [...run.firedEventIds, id].slice(-256) };
  }

  private applyOutcome(outcome: FateEventOutcome): void {
    const player = this.context.player;
    if (outcome.salary && outcome.salary > 0) this.context.economy.applyIdleSalary(outcome.salary);
    else if (outcome.salary && outcome.salary < 0) player.salary = Math.max(0, player.salary + outcome.salary);
    if (outcome.cultivation && outcome.cultivation > 0) this.context.cultivation.applyIdleExperience(outcome.cultivation);
    if (outcome.mind) {
      const steadyRank = this.context.rebirth.talentRank('steady_mind');
      const adjustedMind = outcome.mind < 0 ? Math.ceil(outcome.mind * (1 - steadyRank * 0.1)) : outcome.mind;
      this.context.mind.applyDelta(adjustedMind);
    }
    if (outcome.performance) player.performance = Math.max(0, player.performance + outcome.performance);
    for (const [npc, delta] of Object.entries(outcome.relationship ?? {})) {
      player.relationships[npc] = Math.max(-100, Math.min(100, (player.relationships[npc] ?? 0) + delta));
    }
    for (const [material, count] of Object.entries(outcome.materials ?? {})) this.context.v2Items.addMaterial(material, count);
  }

  private transaction<T>(action: () => T): T {
    const snapshot = this.context.player.toSaveData();
    try {
      const result = action();
      this.context.saveService.save(this.context.player);
      return result;
    } catch (error) {
      Object.assign(this.context.player, new PlayerData(snapshot));
      throw error;
    }
  }
}

function mulberryAt(seed: number, cursor: number): number {
  let state = seed >>> 0;
  for (let index = 0; index <= cursor; index += 1) state = (state + 0x6d2b79f5) >>> 0;
  let value = state;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const challengeBossIds: Readonly<Record<string, string>> = {
  online_incident: 'boss_fate_online_incident',
  scapegoat_boss: 'boss_fate_scapegoat',
  secret_trial: 'boss_fate_secret_trial',
};
