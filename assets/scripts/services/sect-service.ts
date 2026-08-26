import type { GameContext } from '../core/game-context';
import type { SectConfig, SectId } from '../model/config-types';

export class SectService {
  public readonly sects: readonly SectConfig[];

  public constructor(private readonly context: GameContext) {
    this.sects = context.configService.sect.sects;
  }

  public available(): readonly SectConfig[] { return this.sects; }

  public get(id: SectId): SectConfig {
    const sect = this.sects.find((item) => item.id === id);
    if (!sect) throw new Error(`Unknown sect ${id}`);
    return sect;
  }

  public current(): SectConfig | undefined {
    return this.context.player.sectId ? this.get(this.context.player.sectId as SectId) : undefined;
  }

  public choose(id: SectId): SectConfig {
    const sect = this.get(id);
    if (this.context.player.sectId !== null) throw new Error('Sect already chosen');
    this.context.player.sectId = sect.id;
    try {
      this.context.saveService.save(this.context.player);
    } catch (error) {
      this.context.player.sectId = null;
      throw error;
    }
    return sect;
  }
}
