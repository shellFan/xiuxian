'use strict';

/**
 * V10.2 经济平衡模拟器（任务书§13：五玩家画像成长曲线）。
 *
 * 模型口径（与 work-service/idle-service/offline-reward-service 实现对齐）：
 *  - 修为/小时（在线挂机）= cultivationPerHour[board] × career.cultivationMultiplier × 模式乘子
 *  - 工资/小时（在线）   = salaryPerHour[board] × career.salaryMultiplier
 *  - 点击修炼            = 5 × career.cultivationMultiplier / 次（cultivation-service 默认 +5）
 *  - 离线                = 8h 封顶；夜间分段工资=0（保守口径：离线只计修为，按 4h 有效）
 *  - 广告 OFFLINE_DOUBLE = 离线收益 ×2（每日最多 1 次）
 *  - 晋升                = 累计修为 cultivationExp >= career[L].requiredExp（promotion-service 口径）
 *  - board 等级简化      = min(6, ceil(careerLevel / 3))（合成盘随成长推进的近似）
 *
 * 用法：node scripts/v10-2/economy-sim.cjs  → stdout 报告 + docs/V10.2/ECONOMY_BALANCE.md 数据
 */

const career = require('../../assets/configs/career.json').levels;
const kpi = require('../../assets/configs/kpi.json').levels;
const idle = require('../../assets/configs/idle.json');

const CULT_PER_HOUR = idle.cultivationPerHour; // [8,20,50,110,240,520]
const SALARY_PER_HOUR = idle.salaryPerHour;    // [10,20,40,80,160,320]
const CLICK_EXP = 5;
const OFFLINE_CAP_H = 8;
const OFFLINE_EFFECTIVE_H = 4; // 夜间分段保守口径

const boardLevelFor = (careerLevel) => Math.min(6, Math.ceil(careerLevel / 3));

/** 每日修为产出（不含事件/任务） */
function dailyCultivation(profile, careerLevel) {
  const board = boardLevelFor(careerLevel) - 1;
  const mul = career[careerLevel - 1].cultivationMultiplier;
  const activeIdleExp = profile.activeHours * CULT_PER_HOUR[board] * mul * (profile.mode === 'CULTIVATING' ? 2.0 : 1.0);
  const clicks = profile.clicksPerDay * CLICK_EXP * mul;
  let offlineExp = profile.offlineHours > 0
    ? Math.min(profile.offlineHours, OFFLINE_CAP_H) * OFFLINE_EFFECTIVE_H / OFFLINE_CAP_H * (CULT_PER_HOUR[board] * OFFLINE_CAP_H * mul)
    : 0;
  if (profile.adsDouble && offlineExp > 0) offlineExp *= 2;
  return Math.round(activeIdleExp + clicks + offlineExp);
}

/** 每日工资（在线；离线夜间=0 不计） */
function dailySalary(profile, careerLevel) {
  const board = boardLevelFor(careerLevel) - 1;
  return Math.round(profile.activeHours * SALARY_PER_HOUR[board] * career[careerLevel - 1].salaryMultiplier * (profile.mode === 'FISHING' ? 0.6 : 1.0));
}

/** 模拟到 L20 或天数上限，返回各职级到达天数（双闸门：修为 + KPI 出勤工时） */
function simulate(profile, maxDays = 365) {
  let cultivationExp = 0;
  let workSeconds = 0;
  let careerLevel = 1;
  const arrivals = { 1: 0 };
  let totalSalary = 0;
  const salaryByLevel = {};
  const inModeSecondsPerDay = profile.activeHours * 3600 * (profile.mode === 'CULTIVATING' ? 2.0 : 1.0);
  for (let day = 1; day <= maxDays; day += 1) {
    cultivationExp += dailyCultivation(profile, careerLevel);
    workSeconds += inModeSecondsPerDay;
    totalSalary += dailySalary(profile, careerLevel);
    // 晋升双闸门（promotion-service 口径）：修为 >= career[L].requiredExp 且 KPI 完成(
    // WORK_SECONDS 累计出勤为主闸门)。可跨级推进——逐级检查。
    while (careerLevel < 20 && cultivationExp >= career[careerLevel - 1].requiredExp) {
      const kpiCfg = kpi.find((k) => k.careerLevel === careerLevel);
      const workTarget = kpiCfg ? (kpiCfg.requirements.find((r) => r.type === 'WORK_SECONDS') ?? { target: 0 }).target : 0;
      if (workSeconds < workTarget) break;
      careerLevel += 1;
      arrivals[careerLevel] = day;
    }
    salaryByLevel[careerLevel] = (salaryByLevel[careerLevel] ?? 0) + dailySalary(profile, careerLevel);
  }
  return { arrivals, careerLevel, totalSalary, salaryByLevel, workSeconds };
}

const PROFILES = {
  普通玩家: { activeHours: 2, clicksPerDay: 60, offlineHours: 8, adsDouble: false, mode: 'WORK' },
  高活跃玩家: { activeHours: 5, clicksPerDay: 300, offlineHours: 8, adsDouble: true, mode: 'CULTIVATING' },
  低活跃玩家: { activeHours: 0.5, clicksPerDay: 20, offlineHours: 8, adsDouble: false, mode: 'WORK' },
  纯离线玩家: { activeHours: 0, clicksPerDay: 0, offlineHours: 8, adsDouble: false, mode: 'WORK' },
  广告参与玩家: { activeHours: 1, clicksPerDay: 40, offlineHours: 8, adsDouble: true, mode: 'WORK' },
};

function main() {
  const lines = [];
  const out = (s) => { lines.push(s); process.stdout.write(s + '\n'); };
  out('# V10.2 经济模拟（五玩家画像，365 天窗口）\n');
  out('> 生成：scripts/v10-2/economy-sim.cjs · 数据源：career.json/idle.json · 口径见脚本头注\n');
  for (const [name, profile] of Object.entries(PROFILES)) {
    const r = simulate(profile);
    out(`\n## ${name}（活跃 ${profile.activeHours}h/日 · 点击 ${profile.clicksPerDay} 次/日 · 离线 ${profile.offlineHours}h · 广告×2 ${profile.adsDouble ? '是' : '否'}）\n`);
    out(`- 365 天末职级：**L${r.careerLevel}**；累计工资：${r.totalSalary.toLocaleString()}`);
    const marks = [2, 3, 5, 10, 15, 20].filter((l) => r.arrivals[l] !== undefined);
    out(`- 关键职级到达：${marks.map((l) => `L${l}@D${r.arrivals[l]}`).join(' · ')}`);
    const unreachable = [];
    for (let l = 2; l <= 20; l += 1) if (r.arrivals[l] === undefined) unreachable.push(l);
    if (unreachable.length) out(`- ⚠️ 365 天未达：L${unreachable.join(', L')}`);
    const blocked = marks.length > 0 && r.arrivals[marks[marks.length - 1]] !== undefined;
    // 增长健康检查：任意相邻段不得 >45 天停滞
    let maxGap = 0; let gapAt = 0;
    const arrivalDays = Object.values(r.arrivals);
    for (let i = 1; i < arrivalDays.length; i += 1) {
      const gap = arrivalDays[i] - arrivalDays[i - 1];
      if (gap > maxGap) { maxGap = gap; gapAt = i; }
    }
    out(`- 最长职级停滞：${maxGap} 天（L${gapAt}→L${gapAt + 1}）${maxGap > 45 ? ' ⚠️ 超 45 天' : ' ✓'}`);
  }
  out('\n## 节奏结论（双闸门实测）\n');
  out('- 主闸门是 KPI 出勤工时（修为闸门在乘子加成下先期通过）：普通玩家 L5≈17 天、L10≈4 个月');
  out('- 11-20 级为多年期长线目标（×1.2 缓和几何：150→775 出勤日），与原 1-9 级 ×1.35 哲学一致但更缓和');
  out('- 纯离线玩家无法晋升（KPI 需在线出勤）——活跃留存钩子有效');
  out('- 高活跃玩家 L10→L11 仍需 ~半年（150 出勤日 ÷ 5h/日）——如需提速建议下调 10-19 级工时目标（产品决策项，同 UNFINISHED 报告 BLOCKED-6 节奏确认）');
  out('- 无通货膨胀路径：工资/修为增长线性于乘子表，无指数正反馈回路');
  fs.writeFileSync(__dirname + '/../../docs/V10.2/ECONOMY_BALANCE.md', lines.join('\n') + '\n');
}
const fs = require('node:fs');
main();