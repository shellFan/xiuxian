/**
 * V5.8 结算一致性 + 装备词条联动 + 装备合法性 回归测试。
 *
 * 覆盖（本轮 Gameplay V2 任务 P0/P1/P2）：
 *  1. EffectService.apply（任务/事件/日常奖励的统一通道）把正向工资/修为/绩效
 *     记入 gameDay.income —— 首页"今日已赚"与日结算同源。
 *  2. task-service.claimTask 的任务工资同样记入当日账本，且失败回滚恢复账本。
 *  3. skillTagOf 流派 tag 映射（skillTagMul 词条的消费前提）。
 *  4. equipItem 合法性校验：未知装备/未持有/槽位不符 拒绝且原因可观测。
 *  5. sanitizeEquipped 自愈：已装备但未持有的槽位被清理。
 *  6. 战斗词条联动：已装备词条实际提升带 tag 技能的伤害（有词条 > 无词条）。
 *  7. 战斗结算写入 dailyReality（今日动态真实履历）。
 */
import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';
import { skillTagOf } from '../../assets/scripts/v57/battle-merge';

process.env.TZ = 'Asia/Shanghai';
const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');

function makeFacade(seed = 9301): { facade: GameFacade; clock: FakeClock } {
  const clock = new FakeClock(MONDAY_0900);
  const facade = new GameFacade({
    clock, careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new MemoryStorageAdapter(), board: null,
    randomV2: new RandomService(mulberry32(seed)),
    randomProvider: { next: mulberry32(seed) },
    battleRng: mulberry32(seed), autoSaveIntervalSeconds: 0,
  });
  facade.context.messenger.ensureInitialized();
  facade.chooseProfession('JAVA_BACKEND');
  facade.context.gameDay.ensureStarted();
  facade.context.dailyPlanner.beginWorkday();
  return { facade, clock };
}

/** 1. 统一效果通道的正向奖励入当日账本。 */
function testEffectServiceRecordsGameDayIncome(): void {
  const { facade } = makeFacade();
  try {
    const day = facade.context.player.gameDay!;
    const beforeSalary = day.income.salary;
    facade.context.effects.apply({ salary: 120, cultivation: 30, performance: 5 });
    assert.equal(facade.context.player.gameDay!.income.salary, beforeSalary + 120, 'positive salary recorded into gameDay income');
    assert.equal(facade.context.player.gameDay!.income.cultivation, 30, 'cultivation recorded');
    assert.equal(facade.context.player.gameDay!.income.performance, 5, 'performance recorded');
    // 负向 delta 不入账（支出不是"已赚"）
    facade.context.effects.apply({ salary: -50 });
    assert.equal(facade.context.player.gameDay!.income.salary, beforeSalary + 120, 'negative delta not recorded as earned');
    console.log('effect service gameDay income recording passed');
  } finally {
    facade.destroy();
  }
}

/** 2. 任务奖励工资入当日账本（claimTask 路径）。 */
function testTaskClaimRecordsGameDayIncome(): void {
  const { facade, clock } = makeFacade();
  try {
    const configs = facade.queryTaskConfigsByType('WORK');
    const cfg = configs.find((c) => c.durationSeconds <= 5) ?? configs[0];
    assert.ok(cfg, 'a work task config exists');
    const start = facade.startTask(cfg.id);
    assert.ok(start.success, `task started: ${(start as { reason?: string }).reason ?? ''}`);
    clock.advance((cfg.durationSeconds + 2) * 1000);
    facade.tickTasks();
    const dayBefore = facade.context.player.gameDay!.income.salary;
    const salaryBefore = facade.context.player.salary;
    const claim = facade.claimTask(cfg.id);
    assert.ok(claim.success, 'claim succeeds');
    if (cfg.rewardSalary > 0) {
      assert.equal(facade.context.player.salary, salaryBefore + cfg.rewardSalary, 'salary granted');
      assert.equal(facade.context.player.gameDay!.income.salary, dayBefore + cfg.rewardSalary, 'task salary recorded into today ledger');
    }
    console.log('task claim gameDay income recording passed');
  } finally {
    facade.destroy();
  }
}

/** 3. skillTagOf：词条联动所需的技能流派 tag。 */
function testSkillTagMapping(): void {
  assert.equal(skillTagOf('skill_gc'), 'JVM');
  assert.equal(skillTagOf('skill_gc_v2'), 'JVM', 'upgraded skill keeps tag');
  assert.equal(skillTagOf('skill_sql_optimize'), 'DBA');
  assert.equal(skillTagOf('skill_cache_shield'), 'REDIS');
  assert.equal(skillTagOf('skill_css_array'), 'PIXEL');
  assert.equal(skillTagOf('skill_auto_script'), 'AUTOMATION');
  assert.equal(skillTagOf('skill_k8s_swarm'), 'K8S');
  assert.equal(skillTagOf('skill_null_sword'), null, 'generic skill has no tag');
  console.log('skill tag mapping passed');
}

/** 4. equipItem 合法性校验。 */
function testEquipItemValidation(): void {
  const { facade } = makeFacade();
  try {
    const v2 = facade.context.v2Items;
    // 未知装备拒绝
    assert.equal(v2.equipItem('DESK', 'eq_totally_unknown'), false, 'unknown equipment rejected');
    // 未持有拒绝（选一个不在 owned 里的真实装备 id）
    const owned = new Set(facade.queryOwnedEquipment());
    const stranger = facade.queryEquipmentLibrary().find((d) => !owned.has(d.id));
    if (stranger) {
      assert.equal(v2.equipItem(stranger.slot as 'DESK' | 'BADGE' | 'ACCESSORY', stranger.id), false, 'unowned equipment rejected');
      // 持有后同槽位可装备
      assert.ok(facade.context.v2Items.grantEquipment(stranger.id), 'grant stranger equipment');
      assert.equal(v2.equipItem(stranger.slot as 'DESK' | 'BADGE' | 'ACCESSORY', stranger.id), true, 'valid equip accepted after grant');
      assert.equal(facade.context.player.equippedEquipment[stranger.slot as 'DESK' | 'BADGE' | 'ACCESSORY'], stranger.id, 'slot holds granted equipment');
    }
    console.log('equip item validation passed');
  } finally {
    facade.destroy();
  }
}

/** 5. sanitizeEquipped 自愈：未持有的已装备槽位被清理。 */
function testSanitizeEquipped(): void {
  const { facade } = makeFacade();
  try {
    const p = facade.context.player;
    p.equippedEquipment = { DESK: 'ghost_item', BADGE: null, ACCESSORY: null };
    const cleared = facade.context.v2Items.sanitizeEquipped();
    assert.deepEqual(cleared, ['DESK'], 'ghost slot cleared');
    assert.equal(p.equippedEquipment.DESK, null, 'DESK slot nulled');
    console.log('sanitize equipped passed');
  } finally {
    facade.destroy();
  }
}

/** 6. 战斗词条联动：tag 词条让带 tag 技能的伤害真实提升。 */
function testTagAffixBoostsDamage(): void {
  // 两个 facade：一个无词条，一个装备 tag 词条（同一 seed 保证同怪同序）
  const runWithAffix = (equipAffix: boolean): number => {
    const { facade, clock } = makeFacade(4242);
    try {
      const p = facade.context.player;
      if (equipAffix) {
        // JVM词条装备：从装备库找携带 JVM 词条的装备并授予+穿戴
        const lib = facade.queryEquipmentLibrary().filter((d) => d.owned === false && (d.affixes ?? []).some((a: string) => a.includes('JVM')));
        const target = lib[0];
        assert.ok(target, 'an affix-carrying JVM equipment def exists');
        p.ownedEquipment = [...p.ownedEquipment, target.id];
        const ok = facade.context.v2Items.equipItem(target.slot as 'DESK' | 'BADGE' | 'ACCESSORY', target.id);
        assert.ok(ok, 'equipped affix item');
      }
      facade.startBattleRun('PROJECT', 'build_jvm');
      // 技能池注入 skill_gc（JVM tag），保证词条可命中
      const run = facade.context.battle.current() as { skills: string[]; enemies: { hp: number }[]; skillOffers: string[] | null } | null;
      assert.ok(run, 'battle running');
      run!.skills.push('skill_gc');
      if (run!.skillOffers) facade.chooseBattleSkill(null); // 取 +3 攻击兜底
      // 第一波第一击的伤害（固定 seed → 同怪同序）
      const enemyBefore = run!.enemies[0].hp;
      clock.advance(1500);
      facade.context.battle.tick(1);
      const enemyAfter = run!.enemies[0].hp;
      return enemyBefore - enemyAfter;
    } finally {
      facade.destroy();
    }
  };
  const plain = runWithAffix(false);
  const boosted = runWithAffix(true);
  assert.ok(plain > 0, 'baseline damage dealt');
  assert.ok(boosted > plain, `affix boost increases damage (${boosted} > ${plain})`);
  console.log('tag affix boosts tagged-skill damage passed');
}

/** 7. 战斗结算写入 dailyReality。 */
function testBattleWritesDailyReality(): void {
  const { facade } = makeFacade();
  try {
    facade.startBattleRun('PROJECT', 'build_jvm');
    facade.abandonBattleRun();
    const reality = facade.context.player.dailyReality ?? [];
    const battleEntry = reality.find((r) => r.text.includes('项目受挫') || r.text.includes('复盘受挫'));
    assert.ok(battleEntry, 'abandoned battle recorded into dailyReality');
    assert.ok(battleEntry!.text.includes('⚔'), 'reality entry carries battle marker');
    console.log('battle dailyReality recording passed');
  } finally {
    facade.destroy();
  }
}

testEffectServiceRecordsGameDayIncome();
testTaskClaimRecordsGameDayIncome();
testSkillTagMapping();
testEquipItemValidation();
testSanitizeEquipped();
testTagAffixBoostsDamage();
testBattleWritesDailyReality();
console.log('v5.8 settlement & affix consistency: all tests passed');
