/** Phase5 测试用的配置直读（避免依赖 service 内部 cast）。 */
import promoConfig from '../../assets/configs/v2/promotion-titles.json';

interface Q { id: string; type: string; question: string; options: { id: string; text: string }[] }
interface T { id: string; name: string; condition: string; threshold: number; desc: string }

export const PROMO_TITLES_IMPORTED = promoConfig as unknown as { promotionQuestions: Q[]; dailyTitles: T[] };
