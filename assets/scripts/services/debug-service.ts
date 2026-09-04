import type { GameContext } from '../core/game-context';
import type { RandomProvider } from '../core/random-provider';
import { DEFAULT_RANDOM_PROVIDER } from '../core/random-provider';

/**
 * DebugService provides convenience cheat/debug methods for testing.
 * It wraps existing GameContext services to manipulate game state directly.
 * **Must NOT be used in production UI** — only in dev builds and tests.
 */
export class DebugService {
  private readonly context: GameContext;
  private readonly random: RandomProvider;
  public constructor(context: GameContext, random?: RandomProvider) {
    this.context = context;
    this.random = random ?? DEFAULT_RANDOM_PROVIDER;
  }

  // ── Economy ────────────────────────────────────────────────────────────────

  /** Add salary directly. */
  public addSalary(amount: number): void {
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
      throw new Error('Invalid salary amount');
    }
    this.context.economy.changeSalary(amount);
  }

  // ── Cultivation ────────────────────────────────────────────────────────────

  /** Add cultivation experience directly. */
  public addCultivation(amount: number): void {
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
      throw new Error('Invalid cultivation amount');
    }
    this.context.player.cultivationExp += amount;
    this.context.saveService.save(this.context.player);
  }

  // ── Mind ───────────────────────────────────────────────────────────────────

  /** Restore mind to max. */
  public restoreMind(): void {
    this.context.mind.rest();
  }

  /** Set mind to 0 (breakdown state). */
  public zeroMind(): void {
    this.context.mind.change(-this.context.player.mind);
  }

  // ── KPI ────────────────────────────────────────────────────────────────────

  /** Force-complete the current KPI by setting all progress to targets. */
  public completeKpi(): void {
    const requirements = this.context.kpi.getCurrentRequirements();
    for (const req of requirements) {
      switch (req.type) {
        case 'MERGE_COUNT':
        case 'SALARY_EARNED':
        case 'EVENT_RESOLVED':
          if ((this.context.player.kpiProgress[req.type] ?? 0) < req.target) {
            this.context.player.kpiProgress[req.type] = req.target;
          }
          break;
        case 'WORK_SECONDS':
          if (this.context.player.workSeconds < req.target) {
            this.context.player.workSeconds = req.target;
          }
          break;
        case 'CULTIVATION':
          if (this.context.player.cultivationExp < req.target) {
            this.context.player.cultivationExp = req.target;
          }
          break;
      }
    }
    this.context.saveService.save(this.context.player);
  }

  // ── Career Events ──────────────────────────────────────────────────────────

  /** Force-trigger a career event (picks a random one from config). */
  public triggerEvent(): void {
    const events = this.context.configService.careerEvents.events;
    if (events.length === 0) return;
    const event = events[Math.min(events.length - 1, Math.floor(this.random.next() * events.length))];
    this.context.events.emit('eventChanged', { eventId: event.id, pending: true });
  }

  // ── Promotion ──────────────────────────────────────────────────────────────

  /** Force-promote: complete KPI + promote with guaranteed success. */
  public promote(): void {
    this.completeKpi();
    // Force career level up directly
    this.context.player.careerLevel += 1;
    this.context.office.syncToCareer();
    // Reset KPI for new level
    this.context.kpi.switchLevel(this.context.player.careerLevel);
    this.context.player.promotionFailCount = 0;
    this.context.saveService.save(this.context.player);
  }

  // ── Offline Simulation ─────────────────────────────────────────────────────

  /** Simulate offline time by advancing lastSaveTime backward. */
  public simulateOffline(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error('Invalid offline seconds');
    }
    // Move lastSaveTime backward to simulate elapsed offline time.
    // Do NOT call save() here — it would overwrite lastSaveTime with clock.now().
    this.context.player.lastSaveTime -= seconds * 1000;
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  /** Clear save data and reset player to default. */
  public clearSave(): void {
    this.context.saveService.clearSave();
  }

  // ── Tutorial ───────────────────────────────────────────────────────────────

  /** Skip the tutorial entirely. */
  public skipTutorial(): void {
    this.context.tutorial.complete();
    this.context.saveService.save(this.context.player);
  }

  // ── Board / Workers ────────────────────────────────────────────────────────

  /** Set max worker level directly. */
  public setMaxWorkerLevel(level: number): void {
    if (!Number.isFinite(level) || !Number.isInteger(level) || level < 1) {
      throw new Error('Invalid worker level');
    }
    this.context.player.maxWorkerLevel = level;
    this.context.saveService.save(this.context.player);
  }

  /** Set career level directly. */
  public setCareerLevel(level: number): void {
    if (!Number.isFinite(level) || !Number.isInteger(level) || level < 1) {
      throw new Error('Invalid career level');
    }
    this.context.player.careerLevel = level;
    this.context.office.syncToCareer();
    this.context.kpi.switchLevel(level);
    this.context.saveService.save(this.context.player);
  }

  /** Set work mode and work seconds. */
  public setWorkMode(mode: 'WORK' | 'FISHING', seconds?: number): void {
    this.context.player.workMode = mode;
    if (seconds !== undefined) {
      this.context.player.workSeconds = seconds;
    }
    this.context.saveService.save(this.context.player);
  }
}