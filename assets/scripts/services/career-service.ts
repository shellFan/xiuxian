import type { CareerLevelConfig } from '../model/config-types';
import type { GameContext } from '../core/game-context';

export class CareerService {
  public readonly levels: readonly CareerLevelConfig[];

  public constructor(private readonly context: GameContext) {
    this.levels = context.configService.career.levels;
  }

  public current(): CareerLevelConfig {
    return this.get(this.context.player.careerLevel);
  }

  public get(level: number): CareerLevelConfig {
    const result = this.levels.find((item) => item.level === level);
    if (!result) throw new Error(`Unknown career level ${level}`);
    return result;
  }

  public next(): CareerLevelConfig | undefined {
    return this.levels.find((item) => item.level === this.context.player.careerLevel + 1);
  }

  public canPromote(): boolean {
    const next = this.next();
    return next !== undefined && this.context.player.performance >= next.requiredExp;
  }

  public promote(): boolean {
    if (!this.canPromote()) return false;
    const previousLevel = this.context.player.careerLevel;
    this.context.player.careerLevel += 1;
    try {
      this.context.saveService.save(this.context.player);
    } catch (error) {
      this.context.player.careerLevel = previousLevel;
      throw error;
    }
    this.context.events.emit('careerChanged', { careerLevel: this.context.player.careerLevel });
    return true;
  }
}
