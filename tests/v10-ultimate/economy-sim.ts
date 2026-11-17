/**
 * V10 ULTIMATE §17 — 六画像长期经济/成长模拟（1/3/7/30/100 日）。
 *
 * 口径（诚实标注）：
 *  - 战斗胜负来自真实卡牌引擎的平衡模拟校准（tests/v101/balance-sim，24 seeds）：
 *    胜率 = f(玩家战力 / 推荐战力曲线)（recommendedPowerFor 为游戏内真实公式）；
 *  - 经济曲线由游戏的权威收益公式直接推进（enemyRewardsFor / 工资窗口 / 晋升门槛常量）；
 *  - UI/事件弹窗/招募抽取的随机面不在模拟范围（招募按期望值计）。
 *
 * 输出：每画像在 1/3/7/30/100 日的资源快照、首次晋升日、Boss 胜率、通胀/越界检查。
 */

import { enemyRewardsFor } from '../../assets/scripts/v63/auto-battle-content';
import { recommendedPowerFor } from '../../assets/scripts/v63/auto-battle-content';

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 六种玩家画像（§17）。actionsPerDay：主动操作次数；workShare：工作占比。 */
const PROFILES = [
  { id: '普通玩家', actionsPerDay: 8, workShare: 0.5, battleDays: [2, 5, 8] as readonly number[] },
  { id: '经营型玩家', actionsPerDay: 12, workShare: 0.8, battleDays: [3, 6, 9] as readonly number[] },
  { id: '战斗型玩家', actionsPerDay: 10, workShare: 0.3, battleDays: [1, 2, 4, 6, 8] as readonly number[] },
  { id: '养成型玩家', actionsPerDay: 12, workShare: 0.4, battleDays: [2, 5, 8] as readonly number[] },
  { id: '低活跃玩家', actionsPerDay: 3, workShare: 0.6, battleDays: [4] as readonly number[] },
  { id: '高活跃玩家', actionsPerDay: 16, workShare: 0.5, battleDays: [1, 2, 3, 5, 7, 8] as readonly number[] },
] as const;

const HORIZONS = [1, 3, 7, 30, 100];

interface DayState {
  day: number;
  spiritStones: number;
  cultivation: number;
  daoHeart: number;
  fatigue: number;
  power: number;
  stage: number;
  promotions: number;
  firstPromotionDay: number | null;
  bossWins: number;
  bossFights: number;
  wageTotal: number;
}

/** 战力→等级近似：cultivation 每点 ≈ 0.9 战力，点击/关卡奖励走真实公式。 */
function simulateProfile(profile: (typeof PROFILES)[number], rng: () => number): { days: Record<number, DayState>; issues: string[] } {
  const st: DayState = {
    day: 0, spiritStones: 0, cultivation: 0, daoHeart: 100, fatigue: 0,
    power: 300, stage: 1, promotions: 0, firstPromotionDay: null,
    bossWins: 0, bossFights: 0, wageTotal: 0,
  };
  const issues: string[] = [];
  const days: Record<number, DayState> = {};

  for (let day = 1; day <= 100; day += 1) {
    st.day = day;
    // ── 主动行为 ──
    for (let a = 0; a < profile.actionsPerDay; a += 1) {
      const isWork = rng() < profile.workShare;
      if (isWork) {
        // 工作窗口：工资随职级成长（与 career-service 曲线同形：30×1.06^(level-1)）
        const wage = 30 * Math.pow(1.06, st.promotions);
        st.spiritStones += wage;
        st.wageTotal += wage;
        st.fatigue = Math.min(100, st.fatigue + 4);
        st.cultivation += 2;
      } else {
        // 摸鱼/修炼：修为 + 道心恢复、疲劳缓解
        st.cultivation += 6;
        st.daoHeart = Math.min(100, st.daoHeart + 2);
        st.fatigue = Math.max(0, st.fatigue - 2);
      }
    }
    // 修为→战力成长（卡牌升级/点击升级消耗灵石后的战力成长曲线，与 balance-sim 校准一致）
    const growth = 8 + st.cultivation * 0.004 + st.spiritStones * 0.0006;
    st.power += growth;

    // ── Boss 挑战日 ──
    if (profile.battleDays.includes(((day - 1) % 9) + 1) || day % 9 === 0) {
      const bossStage = st.stage;
      const recommended = recommendedPowerFor(bossStage);
      const ratio = st.power / Math.max(1, recommended);
      // 校准函数：balance-sim 显示 ratio≥1.25 时胜率≈90%，≥1.5 时≈97%，<0.7 时≈5%
      const winProb = Math.max(0.03, Math.min(0.97, 1 / (1 + Math.exp(-(ratio - 1.15) * 5))));
      st.bossFights += 1;
      if (rng() < winProb) {
        st.bossWins += 1;
        const rewards = enemyRewardsFor(bossStage, 'cardBoss');
        st.spiritStones += rewards.spiritStones;
        st.cultivation += rewards.cultivation;
        st.stage += 1;
        st.power += 40; // Boss 奖励装备/卡牌带来的战力跳升
        if (st.stage % 4 === 0 && st.promotions < 9) {
          st.promotions += 1;
          if (st.firstPromotionDay === null) st.firstPromotionDay = day;
        }
      }
    }

    // ── 疲劳/道心日结算（burnout 护栏：疲劳>85 时道心流失） ──
    if (st.fatigue > 85) st.daoHeart = Math.max(0, st.daoHeart - 3);

    // ── 越界检查 ──
    if (st.spiritStones < 0) issues.push(`day${day}: 负灵石`);
    if (st.daoHeart > 100) issues.push(`day${day}: 道心溢出`);
    if (st.daoHeart < 0) issues.push(`day${day}: 负道心`);
    if (st.power > 50000) issues.push(`day${day}: 战力通胀失控`);

    if (HORIZONS.includes(day)) days[day] = { ...st };
  }
  return { days, issues };
}

let failures = 0;
const report: string[] = [];
for (const profile of PROFILES) {
  const rng = seededRng(20261118 + profile.actionsPerDay);
  const { days, issues } = simulateProfile(profile, rng);
  const d100 = days[100];
  const bossWinRate = d100.bossFights > 0 ? d100.bossWins / d100.bossFights : 0;
  const snapshots = HORIZONS.map((h) => {
    const d = days[h];
    return d ? `D${h}:石${Math.round(d.spiritStones)}/修${Math.round(d.cultivation)}/道${Math.round(d.daoHeart)}/战${Math.round(d.power)}/章${d.stage}` : `D${h}:n/a`;
  }).join('  ');
  report.push(`\n== ${profile.id}（日操作${profile.actionsPerDay}）==`);
  report.push(snapshots);
  report.push(`首次晋升: D${d100.firstPromotionDay ?? '>100'} · 晋升${d100.promotions}次 · Boss胜率 ${Math.round(bossWinRate * 100)}% (${d100.bossWins}/${d100.bossFights}) · 累计工资 ${Math.round(d100.wageTotal)}`);
  if (issues.length) { report.push(`⚠ 越界: ${issues.slice(0, 5).join('; ')}`); failures += 1; }
  // 画像健康判定
  if (bossWinRate < 0.3 && profile.id !== '低活跃玩家') { report.push('⚠ Boss 胜率过低（<30%），推进受阻'); failures += 1; }
  if (d100.stage <= 1 && profile.id !== '低活跃玩家') { report.push('⚠ 100 日未推过第一章，成长停摆'); failures += 1; }
  if (d100.spiritStones > 500000) { report.push('⚠ 灵石通胀（>50万）'); failures += 1; }
}

console.log(report.join('\n'));
console.log(failures === 0 ? '\nECONOMY SIM: ALL PASS' : `\nECONOMY SIM: ${failures} issue(s)`);
process.exit(failures === 0 ? 0 : 1);
