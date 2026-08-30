import type { GameContext } from '../core/game-context';
import type { OfficeConfig } from '../model/config-types';

/**
 * Derives the player's office from their career level. The office is a pure
 * function of `careerLevel`; `PlayerData.officeLevel` is only a persisted mirror
 * kept in sync through `syncToCareer` (the single update entry) so there is no
 * second source of truth.
 */
export class OfficeService {
  public constructor(private readonly context: GameContext) {}

  public officeLevelForCareer(careerLevel: number): number {
    const office = this.context.configService.office.offices.find((candidate) => careerLevel >= candidate.minCareerLevel && careerLevel <= candidate.maxCareerLevel);
    if (!office) throw new Error(`No office configured for career level ${careerLevel}`);
    return office.level;
  }

  public getOfficeLevel(): number {
    return this.officeLevelForCareer(this.context.player.careerLevel);
  }

  public getCurrentOffice(): OfficeConfig {
    return this.officeForLevel(this.getOfficeLevel());
  }

  public getOfficeName(): string {
    return this.getCurrentOffice().name;
  }

  public getNextOffice(): OfficeConfig | undefined {
    const offices = this.context.configService.office.offices;
    return offices.find((candidate) => candidate.level === this.getOfficeLevel() + 1);
  }

  /**
   * Single update entry for the deprecated persisted mirror. This service is a
   * derivation/sync helper, NOT a transaction owner: it must never persist on its
   * own. The caller (e.g. PromotionService.promote) is responsible for the single
   * atomic save that writes the whole player snapshot including `officeLevel`.
   */
  public syncToCareer(): void {
    this.context.player.officeLevel = this.getOfficeLevel();
  }

  private officeForLevel(level: number): OfficeConfig {
    const office = this.context.configService.office.offices.find((candidate) => candidate.level === level);
    if (!office) throw new Error(`Unknown office level ${level}`);
    return office;
  }
}
