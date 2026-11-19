/**
 * V10.2 职级扩展 20 级 — 边界与配置完整性测试。
 *
 * 覆盖：
 *  1. career.json 20 级连续、requiredExp/乘子单调
 *  2. office 覆盖 1..20 无缝隙（officeLevelForCareer 不抛错）
 *  3. KPI 配置覆盖 1..19（20 为上限无晋升目标）
 *  4. 晋升边界：19→20 可晋升，20 级 MAX_LEVEL
 *  5. 校验器：kpi careerLevel 21 拒绝
 */
import assert from 'node:assert/strict';
import careerConfig from '../../assets/configs/career.json';
import officeConfig from '../../assets/configs/office.json';
import kpiConfig from '../../assets/configs/kpi.json';
import workerConfig from '../../assets/configs/worker.json';
import economyConfig from '../../assets/configs/economy.json';
import gameConfig from '../../assets/configs/game.json';
import sectConfig from '../../assets/configs/sect.json';
import talentConfig from '../../assets/configs/talent.json';
import careerEventsConfig from '../../assets/configs/career-events.json';
import { ConfigService } from '../../assets/scripts/services/config-service';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function make(): GameContext {
  const clock = new FakeClock(new Date(2026, 10, 20, 10, 0, 0, 0).getTime());
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: () => 0.5 });
  context.gameDay.ensureStarted();
  return context;
}

ok('career.json：20 级连续且数值单调递增', () => {
  const levels = careerConfig.levels;
  assert.equal(levels.length, 20);
  for (let i = 0; i < 20; i += 1) {
    assert.equal(levels[i]!.level, i + 1, `第 ${i + 1} 项 level 应连续`);
  }
  for (let i = 1; i < 20; i += 1) {
    assert.ok(levels[i]!.requiredExp > levels[i - 1]!.requiredExp, `L${i + 1} requiredExp 应严格递增`);
    assert.ok(levels[i]!.salaryMultiplier > levels[i - 1]!.salaryMultiplier, `L${i + 1} salaryMultiplier 应严格递增`);
    assert.ok(levels[i]!.cultivationMultiplier > levels[i - 1]!.cultivationMultiplier, `L${i + 1} cultivationMultiplier 应严格递增`);
  }
  // 修仙境界世界观连续：炼气 → 筑基 → 金丹 → 元婴 → 化神 → 渡劫
  assert.match(levels[0]!.realm, /炼气/);
  assert.match(levels[19]!.realm, /渡劫/);
});

ok('office：1..20 每级恰好映射一个工位（无缝覆盖）', () => {
  const offices = officeConfig.offices;
  assert.equal(offices.length, 10);
  const seen = new Map<number, number>();
  for (const office of offices) {
    for (let lv = office.minCareerLevel; lv <= office.maxCareerLevel; lv += 1) {
      assert.ok(!seen.has(lv), `职级 ${lv} 被多个工位覆盖`);
      seen.set(lv, office.level);
    }
  }
  for (let lv = 1; lv <= 20; lv += 1) {
    assert.ok(seen.has(lv), `职级 ${lv} 无工位覆盖（officeLevelForCareer 将抛错）`);
  }
});

ok('kpi.json：1..19 全覆盖（20 为上限无晋升目标）', () => {
  const levels = kpiConfig.levels.map((l) => l.careerLevel).sort((a, b) => a - b);
  assert.deepEqual(levels, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  for (const l of kpiConfig.levels) {
    assert.ok(l.requirements.length > 0, `L${l.careerLevel} KPI 需求非空`);
  }
});

ok('晋升边界：19→20 可晋升；20 级返回 MAX_LEVEL', () => {
  const context = make();
  const player = context.player;
  player.careerLevel = 19;
  // 满足 L19 的 KPI（出勤活跃时长=工作+摸鱼+修炼+社交 / 修为 / 任务计数）与修为要求
  const kpiL19 = context.kpi.getCurrentRequirements();
  player.cultivatingSeconds = 1150 * 86400; // WORK_SECONDS 口径=出勤活跃时长
  player.cultivationExp = careerConfig.levels[18]!.requiredExp;
  for (const req of kpiL19) {
    if (req.type !== 'WORK_SECONDS' && req.type !== 'CULTIVATION') player.kpiProgress[req.type] = req.target;
  }
  const promoCheck = context.promotion.canPromote();
  assert.equal(promoCheck.allowed, true, `L19→20 应可晋升: ${promoCheck.reason}`);
  player.performance = careerConfig.levels[19]!.requiredExp; // 职级阶梯口径：绩效≥下一级 requiredExp
  assert.ok(context.career.canPromote(), '职级阶梯 19→20 应可晋升（绩效≥下一级 requiredExp）');
  assert.ok(context.career.promote(), '晋升应成功');
  assert.equal(player.careerLevel, 20);
  // 20 级 = MAX_LEVEL
  const maxCheck = context.promotion.canPromote();
  assert.equal(maxCheck.allowed, false);
  assert.equal(maxCheck.reason, 'MAX_LEVEL');
  assert.equal(context.career.next(), undefined, '20 级无下一级');
  // office 派生：20 级 → 天庭在编工位（officeLevel 字段为持久镜像，由 promotion-service 路径同步）
  assert.equal(context.office.officeLevelForCareer(20), 10);
});

ok('校验器：kpi careerLevel 21 仍拒绝', () => {
  assert.throws(() => {
    ConfigService.loadFromJson(workerConfig, economyConfig, gameConfig, careerConfig, sectConfig, talentConfig, careerEventsConfig, {
      levels: [{ careerLevel: 21, requirements: [{ type: 'MERGE_COUNT', target: 1 }] }],
    });
  }, /must be between 1 and 20/);
});

console.log(`\n${passed} career-20 tests passed`);
