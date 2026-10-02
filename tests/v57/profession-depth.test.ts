import assert from 'node:assert/strict';
import { ALL_BUILDS, ALL_MONSTERS, ALL_SKILLS, EVOLUTIONS, SYNERGIES } from '../../assets/scripts/v57/battle-merge';
import { V57_AFFIXES, V57_EQUIPMENT, V57_SETS } from '../../assets/scripts/v57/loot-service';
import professionContentJson from '../../assets/configs/v57/profession-content.json';
import professionsJson from '../../assets/configs/professions.json';

/** V5.7 Phase A 门禁：四职业彻底分家（§11/§137）。 */
const PROF_IDS = ['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS'] as const;
type ProfId = (typeof PROF_IDS)[number];
const content = professionContentJson as unknown as { professions: Record<ProfId, {
  tasks: { id: string }[]; monsters: string[]; bosses: string[]; builds: string[];
  activeSkills: string[]; passiveSkills: string[]; equipment: string[];
  perks: Record<string, unknown>;
}> };

function testProfessionDepthFloor(): void {
  for (const pid of PROF_IDS) {
    const def = content.professions[pid];
    assert.ok(def.tasks.length >= 25, `${pid} tasks ${def.tasks.length} >= 25`);
    assert.ok(def.monsters.length >= 20, `${pid} monsters ${def.monsters.length} >= 20`);
    assert.ok(def.bosses.length >= 4, `${pid} bosses >= 4`);
    assert.ok(def.builds.length >= 5, `${pid} builds >= 5`);
    assert.ok(def.activeSkills.length >= 10, `${pid} active skills >= 10`);
    assert.ok(def.passiveSkills.length >= 8, `${pid} passive skills >= 8`);
    assert.ok(def.equipment.length >= 12, `${pid} equipment >= 12`);
    assert.ok(Object.keys(def.perks).length >= 9, `${pid} level perks >= 9`);
  }
  console.log('profession depth floor passed');
}

function testProfessionSeparation(): void {
  for (let i = 0; i < PROF_IDS.length; i++) {
    for (let j = i + 1; j < PROF_IDS.length; j++) {
      const a = content.professions[PROF_IDS[i]];
      const b = content.professions[PROF_IDS[j]];
      const uniqA = a.monsters.filter((m) => !b.monsters.includes(m)).length / a.monsters.length;
      const uniqB = b.monsters.filter((m) => !a.monsters.includes(m)).length / b.monsters.length;
      assert.ok(uniqA >= 0.7 && uniqB >= 0.7, `monster unique ratio ${PROF_IDS[i]}/${PROF_IDS[j]}: ${uniqA}/${uniqB} >= 0.7`);
      const shared = a.builds.filter((x) => b.builds.includes(x));
      assert.equal(shared.length, 0, `no shared core build between ${PROF_IDS[i]} and ${PROF_IDS[j]}`);
    }
  }
  // 欠账 4.1 本体：professions.json 不再共用 Java builds
  const base = professionsJson as unknown as { professions: { id: string; builds: string[] }[] };
  const fe = base.professions.find((p) => p.id === 'FRONTEND')!;
  assert.ok(!fe.builds.includes('build_java'), 'professions.json FRONTEND no longer references build_java');
  const buildIds = new Set(ALL_BUILDS.map((b) => b.id));
  for (const pid of PROF_IDS) {
    for (const b of content.professions[pid].builds) assert.ok(buildIds.has(b), `${pid} build ${b} exists in merged battle content`);
  }
  console.log('profession separation passed');
}

function testContentVolume(): void {
  const bosses = ALL_MONSTERS.filter((m) => m.tier === 'BOSS');
  assert.ok(bosses.length >= 18, `bosses ${bosses.length} >= 18`);
  assert.ok(ALL_SKILLS.length >= 60, `skills ${ALL_SKILLS.length} >= 60`);
  const passives = ALL_SKILLS.filter((s) => s.kind === 'PASSIVE');
  assert.ok(passives.length >= 32, `passives ${passives.length} >= 32`);
  assert.ok(EVOLUTIONS.length >= 32, `evolutions ${EVOLUTIONS.length} >= 32`);
  for (const evo of EVOLUTIONS) {
    assert.equal(evo.options.length, 2, `evolution ${evo.id} has exactly 2 options`);
  }
  assert.ok(SYNERGIES.length >= 24, `synergies ${SYNERGIES.length} >= 24`);
  assert.ok(V57_EQUIPMENT.length >= 48, `new equipment ${V57_EQUIPMENT.length} >= 48`);
  assert.ok(V57_AFFIXES.length >= 40, `affixes ${V57_AFFIXES.length} >= 40`);
  assert.ok(V57_SETS.length >= 12, `sets ${V57_SETS.length} >= 12`);
  console.log('content volume passed');
}

function testBossMechanicsAndDrops(): void {
  // 每个新 Boss 至少 2 个机制 + 专属掉落（§25/§31）
  const bossMechanics = (require('../../assets/configs/v57/battle-extension.json') as { bossMechanics: Record<string, { mechanics: unknown[]; exclusiveDrop: { equipmentId: string } }> }).bossMechanics;
  assert.ok(Object.keys(bossMechanics).length >= 14, `boss mechanic defs ${Object.keys(bossMechanics).length} >= 14`);
  for (const [bossId, mech] of Object.entries(bossMechanics)) {
    assert.ok(mech.mechanics.length >= 2, `boss ${bossId} has >=2 mechanics`);
    const drop = V57_EQUIPMENT.find((e) => e.id === mech.exclusiveDrop.equipmentId);
    assert.ok(drop, `boss ${bossId} exclusive drop exists`);
  }
  console.log('boss mechanics and drops passed');
}

testProfessionDepthFloor();
testProfessionSeparation();
testContentVolume();
testBossMechanicsAndDrops();
console.log('PROFESSION DEPTH TEST PASSED');
