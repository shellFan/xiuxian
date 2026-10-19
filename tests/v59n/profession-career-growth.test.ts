import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

function create(profession: string, exp = 0) {
  const clock = new FakeClock(Date.parse('2026-10-19T10:00:00+08:00'));
  const facade = new GameFacade({
    clock, careerEventClock: clock, storage: new MemoryStorageAdapter(), board: null,
    player: new PlayerData({ lastSaveTime: clock.now(), profession, professionExp: exp, sectId: 'OUTSOURCING', performance: 50, salary: 100, mind: 80 }),
  });
  facade.context.gameDay.ensureStarted();
  return facade;
}

test('the four supported professions expose four bounded, persistent career-growth directions', () => {
  const expected: Record<string, readonly string[]> = {
    JAVA_BACKEND: ['数据库优化', '并发处理', '接口架构', '故障排查'],
    FRONTEND: ['组件设计', '页面性能', 'UI 实现', '兼容性处理'],
    QA: ['自动化测试', '缺陷定位', '性能测试', '质量保障'],
    DEVOPS: ['部署发布', '故障恢复', '监控告警', '容量规划'],
  };
  for (const [profession, names] of Object.entries(expected)) {
    const facade = create(profession, 11500);
    try {
      const skills = facade.context.profession.careerSkills();
      assert.deepEqual(skills.map((skill) => skill.name), names);
      assert.ok(skills.every((skill) => skill.level === 5 && skill.maxLevel === 5 && skill.effect.length > 0));
      facade.context.saveService.save(facade.context.player);
      const persisted = new PlayerData(facade.context.saveService.load());
      assert.equal(persisted.professionExp, 11500);
    } finally { facade.destroy(); }
  }
});

test('profession growth changes battle specialty, project time/performance and interview score with caps', () => {
    const facade = create('QA', 0);
    const grownFacade = create('QA', 11500);
  try {
    const monsterId = facade.context.profession.def().monsters[0];
    const baseBattle = facade.context.profession.specialtyMultiplier(monsterId);
    const baseTime = facade.context.profession.projectTimeMultiplier();
    const baseProjectBonus = facade.context.profession.projectPerformanceBonus();
    const application = facade.applySectJob('BIG_TECH');
    const baseInterview = facade.resolveSectInterview(application.id, 'RISK').interviewScore ?? 0;
      const grownMonsterId = grownFacade.context.profession.def().monsters[0];
      const grownBattle = grownFacade.context.profession.specialtyMultiplier(grownMonsterId);
      const grownProjectTime = grownFacade.context.profession.projectTimeMultiplier();
      const grownProjectBonus = grownFacade.context.profession.projectPerformanceBonus();
      const grownApplication = grownFacade.applySectJob('BIG_TECH');
      const grownInterview = grownFacade.resolveSectInterview(grownApplication.id, 'RISK').interviewScore ?? 0;

    assert.ok(grownBattle > baseBattle);
    assert.ok(grownProjectTime < baseTime && grownProjectTime >= 0.8);
    assert.ok(grownProjectBonus > baseProjectBonus && grownProjectBonus <= 4);
    assert.ok(grownInterview > baseInterview && grownInterview <= 100);
    } finally { facade.destroy(); grownFacade.destroy(); }
});
