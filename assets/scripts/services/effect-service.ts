import type { GameContext } from '../core/game-context';
import type { GameEffect } from '../model/game-effect';
import type { GameSaveData } from '../model/save-data';

export class EffectService {
  public constructor(private readonly context: GameContext) {}

  /** Applies one resource transaction and persists it before publishing feedback. */
  public apply(effect: GameEffect): void {
    validateEffect(effect);
    const previous = this.context.player.toSaveData();
    const next = calculateNext(previous, effect, this.context.player.maxMind);
    applySaveData(this.context.player, next);
    try {
      this.context.saveService.save(this.context.player);
    } catch (error) {
      applySaveData(this.context.player, previous);
      throw error;
    }
    try {
      const salary = effect.salary ?? 0;
      if (salary !== 0) this.context.events.emit('salaryChanged', { amount: salary, total: next.salary });
      this.context.events.emit('gameSaved', { reason: 'economy' });
    } catch {
      // Feedback listeners cannot undo a committed transaction.
    }
  }
}

function validateEffect(effect: GameEffect): void {
  if (effect === null || typeof effect !== 'object') throw new Error('Invalid effect');
  validateDelta(effect.salary, 'salary');
  validateDelta(effect.performance, 'performance');
  validateDelta(effect.cultivation, 'cultivation');
  validateDelta(effect.mind, 'mind');
}

function validateDelta(value: number | undefined, name: string): void {
  if (value !== undefined && !Number.isSafeInteger(value)) throw new Error(`Invalid ${name} effect`);
}

function calculateNext(previous: GameSaveData, effect: GameEffect, maxMind: number): GameSaveData {
  const salary = addNonNegative(previous.salary, effect.salary ?? 0, 'salary');
  const performance = addNonNegative(previous.performance, effect.performance ?? 0, 'performance');
  const cultivationExp = addNonNegative(previous.cultivationExp, effect.cultivation ?? 0, 'cultivation');
  const mind = Math.min(maxMind, Math.max(0, previous.mind + (effect.mind ?? 0)));
  if (!Number.isSafeInteger(mind)) throw new Error('Invalid mind effect');
  return { ...previous, salary, performance, cultivationExp, mind };
}

function addNonNegative(current: number, delta: number, name: string): number {
  const next = current + delta;
  if (!Number.isSafeInteger(next)) throw new Error(`Invalid ${name} effect`);
  // Resources cannot drop below zero; floor instead of failing so that subtractive
  // career-event effects (TASK-029) never crash event resolution when a resource is low.
  return next < 0 ? 0 : next;
}

function applySaveData(player: GameContext['player'], data: GameSaveData): void {
  player.salary = data.salary;
  player.performance = data.performance;
  player.cultivationExp = data.cultivationExp;
  player.mind = data.mind;
  player.lastSaveTime = data.lastSaveTime;
}
