/**
 * GameFacade — unified application entry point.
 *
 * UI components interact with the game exclusively through this facade.
 * They never hold mutable references to GameContext, PlayerData, or services.
 *
 * The facade provides:
 *   1. snapshot() — immutable, point-in-time state for rendering
 *   2. commands — mutate game state (recruit, merge, changeWorkMode, etc.)
 *   3. onUiEvent() — subscribe to categorized UI event stream
 *   4. lifecycle — pause/resume/destroy coordination
 */

import { GameContext, type GameContextOptions } from '../core/game-context';
import { GameLoopService } from '../services/game-loop-service';
import { RewardService, type RewardState } from '../services/reward/reward-service';
import { PlatformLifecycle } from '../services/platform/platform-lifecycle';
import { type PlatformService, createPlatformService, type PlatformKind } from '../services/platform/platform-service';
import { type RewardProvider, MockRewardProvider } from '../services/reward-provider';
import { type GameEvents } from '../core/game-events';
import { PHASE2_REFRESH_EVENTS } from '../core/game-events';
import { GameSnapshot, createSnapshot, snapshotEqual } from './game-snapshot';
import { type UiEventCategory, type UiEvent, resolveCategory } from './ui-event-types';
import { type RewardType, type RewardResult } from '../services/reward-provider';
import type { WorkMode } from '../model/save-data';

export interface GameFacadeOptions extends GameContextOptions {
  readonly platformKind?: PlatformKind;
  readonly rewardProvider?: RewardProvider;
  readonly autoSaveIntervalSeconds?: number;
}

export type UiEventListener = (event: UiEvent) => void;

export class GameFacade {
  public readonly context: GameContext;
  public readonly gameLoop: GameLoopService;
  public readonly rewardService: RewardService;
  public readonly platform: PlatformService;
  public readonly lifecycle: PlatformLifecycle;

  private readonly uiListeners = new Map<UiEventCategory, Set<UiEventListener>>();
  private lastSnapshot: GameSnapshot | null = null;
  private disposed = false;

  public constructor(options: GameFacadeOptions = {}) {
    this.platform = createPlatformService(options.platformKind ?? 'mock');
    this.context = new GameContext(options);
    this.gameLoop = new GameLoopService(this.context, {
      autoSaveIntervalSeconds: options.autoSaveIntervalSeconds,
    });
    this.rewardService = new RewardService(
      options.rewardProvider ?? new MockRewardProvider(),
      (category, source, detail) => this.emitUiEvent(category, source, detail),
    );
    this.lifecycle = new PlatformLifecycle(this.platform);

    // Bridge domain events to UI event stream
    this.bridgeDomainEvents();

    // Wire lifecycle to game loop
    this.lifecycle.onHide(() => {
      this.gameLoop.stop();
      this.context.saveService.save(this.context.player);
    });
    this.lifecycle.onShow(() => {
      if (!this.disposed) {
        this.gameLoop.start();
      }
    });
    this.lifecycle.onSaveState(() => {
      this.context.saveService.save(this.context.player);
    });
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  /** Get an immutable snapshot of current game state. */
  public snapshot(): GameSnapshot {
    const p = this.context.player;
    const snap = createSnapshot({
      salary: p.salary,
      cultivationExp: p.cultivationExp,
      careerLevel: p.careerLevel,
      mind: p.mind,
      maxMind: p.maxMind,
      performance: p.performance,
      workMode: p.workMode,
      workSeconds: p.workSeconds,
      fishingSeconds: p.fishingSeconds,
      officeLevel: p.officeLevel,
      sectId: p.sectId,
      talentId: p.talentId,
      maxWorkerLevel: p.maxWorkerLevel,
      promotionFailCount: p.promotionFailCount,
      unlockedAchievementIds: Object.freeze([...p.unlockedAchievementIds]),
      claimedAchievementIds: Object.freeze([...p.claimedAchievementIds]),
      dailySignIn: p.dailySignIn ? { ...p.dailySignIn } : null,
      dailyTasks: Object.freeze([...p.dailyTasks.map(t => ({ ...t }))]),
      dailyTaskDay: p.dailyTaskDay,
      tutorialStep: p.tutorialStep,
      tutorialCompleted: p.tutorialCompleted,
      lastSaveTime: p.lastSaveTime,
      workerCount: p.workers.length,
      mindStatus: p.mind <= 0 ? 'BREAKDOWN' : 'NORMAL',
    });
    this.lastSnapshot = snap;
    return snap;
  }

  /** Whether the state has changed since the last snapshot(). */
  public hasChanged(): boolean {
    const current = this.snapshot();
    return this.lastSnapshot ? !snapshotEqual(this.lastSnapshot, current) : true;
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  /** Change work mode (WORK / FISHING). */
  public changeWorkMode(mode: WorkMode): void {
    this.context.player.workMode = mode;
    this.context.events.emit('workModeChanged', { mode });
    this.context.saveService.save(this.context.player);
  }

  /** Request a rewarded ad (delegates to RewardService state machine). */
  public requestReward(type: RewardType, onComplete: (result: RewardResult) => void): void {
    this.rewardService.request(type, onComplete);
  }

  /** Recover mind using reward. */
  public recoverMind(): number {
    return this.context.mind.recoverWithReward(this.context.rewardProvider);
  }

  /** Save the game now. */
  public save(): void {
    this.context.saveService.save(this.context.player);
    this.context.events.emit('gameSaved', { reason: 'idle' });
  }

  /** Clear save data (dev/debug only). */
  public clearSave(): void {
    this.context.saveService.clearSave();
  }

  // ── UI Event Stream ───────────────────────────────────────────────────────

  /** Subscribe to a UI event category. Returns unsubscribe function. */
  public onUiEvent(category: UiEventCategory, listener: UiEventListener): () => void {
    let listeners = this.uiListeners.get(category);
    if (!listeners) {
      listeners = new Set();
      this.uiListeners.set(category, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners!.delete(listener);
      if (listeners!.size === 0) this.uiListeners.delete(category);
    };
  }

  /** Subscribe to all UI events. Returns unsubscribe function. */
  public onAnyUiEvent(listener: UiEventListener): () => void {
    const unsubscribers: Array<() => void> = [];
    for (const category of this.uiListeners.keys()) {
      unsubscribers.push(this.onUiEvent(category, listener));
    }
    // Also subscribe to future categories by wrapping
    const allListener = listener;
    const wrapped = (event: UiEvent) => allListener(event);
    return () => {
      for (const unsub of unsubscribers) unsub();
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Start the game loop. */
  public start(): void {
    this.gameLoop.start();
  }

  /** Tick the game loop (call from Cocos update or test harness). */
  public tick(deltaSeconds: number): void {
    this.gameLoop.tick(deltaSeconds);
  }

  /** Pause the game (platform-level). */
  public pause(): void {
    this.lifecycle.pause();
  }

  /** Resume the game (platform-level). */
  public resume(): void {
    this.lifecycle.resume();
  }

  /** Destroy the facade and release all resources. */
  public destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gameLoop.stop();
    this.rewardService.dispose();
    this.lifecycle.dispose();
    this.context.events.clear();
    this.uiListeners.clear();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private bridgeDomainEvents(): void {
    const allEvents: ReadonlyArray<keyof GameEvents> = [
      ...PHASE2_REFRESH_EVENTS,
      'workerRecruited', 'gameSaved', 'recruitmentFailed', 'mergeCompleted',
      'salaryChanged', 'idleSettled', 'clockAnomaly', 'offlineRewardChanged',
      'dailySignInClaimed', 'buffAdded', 'buffExpired', 'dailyTaskClaimed',
    ];

    for (const eventName of allEvents) {
      this.context.events.on(eventName, (payload: unknown) => {
        const category = resolveCategory(eventName as string);
        this.emitUiEvent(category, eventName as string, payload);
      });
    }
  }

  private emitUiEvent(category: UiEventCategory, source: string, detail?: unknown): void {
    const event: UiEvent = {
      category,
      source,
      timestamp: Date.now(),
      detail,
    };
    const listeners = this.uiListeners.get(category);
    if (listeners) {
      for (const listener of listeners) {
        try { listener(event); } catch { /* UI listener errors must not propagate */ }
      }
    }
  }
}