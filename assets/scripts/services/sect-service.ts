import type { GameContext } from '../core/game-context';
import type { SectConfig, SectId } from '../model/config-types';

export class SectService {
  public readonly sects: readonly SectConfig[];

  public constructor(private readonly context: GameContext) {
    this.sects = context.configService.sect.sects;
  }

  /** Sect definitions remain available for migrated saves; only seven employers are open to new hires in V5.9-M. */
  public available(): readonly SectConfig[] { return this.sects.filter((sect) => sect.id !== 'STARTUP'); }

  public get(id: SectId): SectConfig {
    const sect = this.sects.find((item) => item.id === id);
    if (!sect) throw new Error(`Unknown sect ${id}`);
    return sect;
  }

  public current(): SectConfig | undefined {
    return this.context.player.sectId ? this.get(this.context.player.sectId as SectId) : undefined;
  }

  /** Sector and profession factors shared by regular wages and approved overtime. */
  public salaryMultiplierForProfession(professionId: string): number {
    const professionMultiplier: Readonly<Record<string, number>> = {
      JAVA_BACKEND: 1.10,
      FRONTEND: 1.00,
      QA: 0.95,
      DEVOPS: 1.08,
    };
    const current = this.current();
    if (!current) return 1;
    const sectMultiplier = current.modifiers.salaryMultiplier;
    return sectMultiplier * (professionMultiplier[professionId] ?? 1);
  }

  public choose(id: SectId): SectConfig {
    const sect = this.get(id);
    if (!this.available().some((candidate) => candidate.id === id)) throw new Error('Sect is not available for new characters');
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
