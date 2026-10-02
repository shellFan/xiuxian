import type { GameContext } from '../core/game-context';

/**
 * V5.8 HIGH — Offer / 换宗门轻系统（§12）。
 * 职业等级 Lv4+ 或工作 ≥10 天后，每逢周一有概率收到 Offer（30 游戏日冷却）。
 * 玩家选择：接受 / 拒绝 / 谈薪 / 以后再说。公司切换保留成长、重置公司上下文。
 */

export interface OfferTerms {
  readonly companyId: string;
  readonly companyName: string;
  readonly salaryDeltaPct: number;
  readonly overtimeDeltaPct: number;
  readonly incidentDeltaPct: number;
  readonly promotionDeltaPct: number;
  readonly lootDeltaPct: number;
  readonly pitch: string;
}

const PITCHES: Readonly<Record<string, string>> = {
  COMP_BIGTECH: '「这个项目非常有战略价值。」翻译：今晚别走。但钱是真的多。',
  COMP_FOREIGN: '流程规范、加班少、会议多到怀疑人生。适合把日子过成日子。',
  COMP_STATE: '稳是真的稳，就是修为涨得慢。周末召回？不存在的。',
  COMP_MIN_PRIVATE: '流程？老板在群里说了算。成长快，头发少。',
};

export interface OfferView extends OfferTerms {
  readonly offerId: string;
  readonly dayIndex: number;
  readonly expiresAtDay: number;
}

export class OfferService {
  public constructor(private readonly context: GameContext) {}

  private cooldownReady(day: number): boolean {
    return day >= (this.context.player.offerReadyDay ?? 0);
  }

  /** 周一开工时调用：判定是否产生 Offer。 */
  public maybeGenerateOffer(): OfferView | null {
    const p = this.context.player;
    const day = p.gameDay?.dayIndex ?? 1;
    if (!this.cooldownReady(day)) return null;
    const dow = ((day - 1) % 7) + 1;
    if (dow !== 1) return null;
    const profLevel = this.context.professionContent?.level() ?? 1;
    const unlock = profLevel >= 4 || day >= 10;
    if (!unlock) return null;
    const rng = this.context.randomV2.forDay(day, 5801);
    if (rng.next() > 0.45) return null;

    // 目标公司 ≠ 当前公司
    const companies = this.context.company.profiles().filter((c) => c.id !== this.context.company.currentId());
    if (companies.length === 0) return null;
    const target = companies[Math.floor(rng.next() * companies.length)];
    const current = this.context.company.profile();
    const salaryDeltaPct = Math.round((target.salaryMultiplier / current.salaryMultiplier - 1) * 100);
    const overtimeDeltaPct = Math.round((target.overtimeCulture / current.overtimeCulture - 1) * 100);
    const incidentDeltaPct = Math.round((target.incidentPressure / current.incidentPressure - 1) * 100);
    const promotionDeltaPct = Math.round((target.promotionSpeed / current.promotionSpeed - 1) * 100);
    const lootDeltaPct = Math.round((target.learningBonus / current.learningBonus - 1) * 100);
    const terms = { salaryDeltaPct, overtimeDeltaPct, incidentDeltaPct, promotionDeltaPct, lootDeltaPct };
    const offer: OfferView = {
      offerId: `offer_${day}_${target.id}`,
      dayIndex: day,
      expiresAtDay: day + 3,
      companyId: target.id,
      companyName: target.name,
      salaryDeltaPct, overtimeDeltaPct, incidentDeltaPct, promotionDeltaPct, lootDeltaPct,
      pitch: PITCHES[target.id] ?? target.desc,
    };
    // 30 日冷却从收到 Offer 起算
    p.offerReadyDay = day + 30;
    p.eventFlags = { ...(p.eventFlags ?? {}), ['v58_pending_offer']: true };
    (p as unknown as { pendingOffer?: OfferView }).pendingOffer = offer;
    this.context.events.emit('offerReceived', { offerId: offer.offerId, companyName: offer.companyName, salaryDeltaPct });
    return offer;
  }

  public pending(): OfferView | null {
    return (this.context.player as unknown as { pendingOffer?: OfferView }).pendingOffer ?? null;
  }

  public decide(decision: 'ACCEPTED' | 'DECLINED' | 'NEGOTIATED' | 'LATER'): { ok: boolean; reason?: string; companyName?: string } {
    const p = this.context.player;
    const offer = (p as unknown as { pendingOffer?: OfferView }).pendingOffer;
    if (!offer) return { ok: false, reason: '没有待处理的 Offer' };
    const day = p.gameDay?.dayIndex ?? 1;
    p.offerHistory = [...(p.offerHistory ?? []), {
      dayIndex: day, companyId: offer.companyId, companyName: offer.companyName,
      terms: { salaryDeltaPct: offer.salaryDeltaPct, overtimeDeltaPct: offer.overtimeDeltaPct, incidentDeltaPct: offer.incidentDeltaPct, promotionDeltaPct: offer.promotionDeltaPct },
      decision,
    }].slice(-16);
    delete (p as unknown as { pendingOffer?: OfferView }).pendingOffer;
    p.eventFlags = { ...(p.eventFlags ?? {}), ['v58_pending_offer']: false };
    p.careerChoices = [...(p.careerChoices ?? []), { dayIndex: day, kind: 'OFFER_' + decision, label: `${decision === 'ACCEPTED' ? '接受' : decision === 'DECLINED' ? '拒绝' : '洽谈'} ${offer.companyName} Offer` }].slice(-24);
    let companyName = offer.companyName;
    if (decision === 'ACCEPTED') {
      const switched = this.context.company.switchCompany(offer.companyId, '接受 Offer');
      if (!switched.ok) return { ok: false, reason: switched.reason };
      // 谈成的涨薪直接进底薪
      if (offer.salaryDeltaPct > 0) p.salary = Math.round(p.salary * (1 + offer.salaryDeltaPct / 100));
    } else if (decision === 'NEGOTIATED') {
      // 谈薪：+8% 一次性补偿，留在原公司
      p.salary = Math.round(p.salary * 1.08);
      this.context.events.emit('playerChanged', { reason: 'offerNegotiated' });
    }
    this.context.events.emit('offerDecided', { decision, companyName });
    return { ok: true, companyName };
  }

  public history(): readonly { dayIndex: number; companyName: string; decision: string }[] {
    return (this.context.player.offerHistory ?? []).map((o) => ({ dayIndex: o.dayIndex, companyName: o.companyName, decision: o.decision }));
  }
}
