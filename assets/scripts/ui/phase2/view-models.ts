import type { GameContext } from '../../core/game-context';

export interface CareerViewModel {
  readonly careerLevel: number;
  readonly careerName: string;
  readonly realm: string;
  readonly salary: number;
  readonly performance: number;
  readonly cultivation: number;
  readonly cultivationRequired: number;
  readonly mind: number;
  readonly maxMind: number;
  readonly mindStatusText: string;
  readonly sectName: string;
  readonly talentName: string;
  readonly workMode: 'WORK' | 'FISHING';
  readonly officeName: string;
  readonly canPromote: boolean;
  readonly promotionReason: string;
}

export interface PromotionViewModel {
  readonly allowed: boolean;
  readonly reason: string;
  readonly probability: number;
  readonly options: ReadonlyArray<{ readonly id: string; readonly name: string; readonly description: string }>;
}

export interface EventViewModel {
  readonly pending: boolean;
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly type: string;
  readonly choices: ReadonlyArray<{ readonly id: string; readonly text: string }>;
}

/**
 * Five-tier mind status text. Uses a ratio against maxMind so it stays correct if
 * maxMind ever changes, while matching the absolute 0/29/49/79/100 thresholds when
 * maxMind is 100. The mind value itself always comes from MindService.
 */
export function mindStatusText(mind: number, maxMind: number): string {
  if (mind <= 0) return '彻底破防';
  const ratio = maxMind > 0 ? mind / maxMind : 0;
  if (ratio >= 0.8) return '精神饱满';
  if (ratio >= 0.5) return '正常牛马';
  if (ratio >= 0.3) return '心态不稳';
  return '濒临破防';
}

export function buildCareerViewModel(context: GameContext): CareerViewModel {
  const player = context.player;
  const career = context.career.current();
  const sect = context.sect.current();
  const talent = player.talentId ? context.configService.talent.talents.find((item) => item.id === player.talentId) : undefined;
  const check = context.promotion.canPromote();
  return {
    careerLevel: player.careerLevel,
    careerName: career.name,
    realm: career.realm,
    salary: player.salary,
    performance: player.performance,
    cultivation: player.cultivationExp,
    cultivationRequired: career.requiredExp,
    mind: context.mind.current,
    maxMind: context.mind.max,
    mindStatusText: mindStatusText(context.mind.current, context.mind.max),
    sectName: sect ? sect.name : '未选择宗门',
    talentName: talent ? talent.name : '未觉醒天赋',
    workMode: player.workMode,
    officeName: context.office.getOfficeName(),
    canPromote: check.allowed,
    promotionReason: check.reason,
  };
}

export function buildPromotionViewModel(context: GameContext): PromotionViewModel {
  const check = context.promotion.canPromote();
  return {
    allowed: check.allowed,
    reason: check.reason,
    probability: context.promotion.getProbability(),
    options: context.configService.promotion.options.map((option) => ({
      id: option.id,
      name: option.name,
      description: option.description,
    })),
  };
}

export function buildEventViewModel(context: GameContext): EventViewModel {
  const event = context.careerEvents.current();
  if (!event) {
    return { pending: false, id: '', title: '', description: '', type: '', choices: [] };
  }
  return {
    pending: true,
    id: event.id,
    title: event.title,
    description: event.description,
    type: event.type,
    choices: (event.choices ?? []).map((choice) => ({ id: choice.id, text: choice.text })),
  };
}
