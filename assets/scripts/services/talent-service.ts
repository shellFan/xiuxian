import type { RandomProvider } from '../core/random-provider';
import { DEFAULT_RANDOM_PROVIDER } from '../core/random-provider';
import type { TalentConfig } from '../model/config-types';
import type { PlayerData } from '../model/player-data';
import type { ConfigService } from './config-service';
import type { SaveService } from './save-service';

export interface TalentServiceContext {
  readonly configService: ConfigService;
  readonly player: PlayerData;
  readonly saveService: SaveService;
}

export class TalentService {
  private choices: readonly TalentConfig[] | null = null;
  public constructor(private readonly context: TalentServiceContext, private readonly random: RandomProvider = DEFAULT_RANDOM_PROVIDER) {}

  public firstChoices(): readonly TalentConfig[] {
    if (this.choices) return this.choices;
    const remaining = [...this.context.configService.talent.talents];
    const selected: TalentConfig[] = [];
    for (let count = 0; count < 3; count += 1) {
      const index = Math.floor(this.random.next() * remaining.length);
      selected.push(remaining.splice(index, 1)[0]);
    }
    this.choices = Object.freeze(selected);
    return this.choices;
  }

  public available(): readonly TalentConfig[] { return this.context.configService.talent.talents; }

  public choose(id: string): TalentConfig {
    if (this.context.player.talentId !== null) throw new Error('Talent already chosen');
    const talent = this.firstChoices().find((item) => item.id === id);
    if (!talent) throw new Error(`Talent ${id} is not among first choices`);
    this.context.player.talentId = talent.id;
    try {
      this.context.saveService.save(this.context.player);
    } catch (error) {
      this.context.player.talentId = null;
      throw error;
    }
    return talent;
  }
}
