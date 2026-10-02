import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * V5.5 §200/§227 验收断言（静态契约 + 配置量核查）：
 *  - display-name：材料/装备/技能/怪物 UI 走中文名（§26/§183）
 *  - task-duration：QUICK→EPIC 游戏分钟刻度（§39~§45）
 *  - profession content：怪池/Build/任务池对齐真实 ID（§2~§11）
 *  - promotion 单屏紧凑（§66~§71）
 *  - journey guide 挂在首页（§86~§94）
 *  - release 无演示泄漏（§38/§181~§182）
 */

const overlay = fs.readFileSync(path.resolve(process.cwd(), 'desktop/ui-overlay.js'), 'utf8');
const overlayV2 = fs.readFileSync(path.resolve(process.cwd(), 'desktop/ui-overlay-v2.js'), 'utf8');
const css = fs.readFileSync(path.resolve(process.cwd(), 'desktop/ui-overlay.css'), 'utf8');
const items = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'assets/configs/v2/items.json'), 'utf8'));
const professions = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'assets/configs/professions.json'), 'utf8'));
const battle = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'assets/configs/v3/battle-content.json'), 'utf8'));
/* V5.7：职业内容分家后，professions.json 引用 v57 扩展池——合并后再校验 */
const v57Battle = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'assets/configs/v57/battle-extension.json'), 'utf8'));
const v57Equip = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'assets/configs/v57/equipment-content.json'), 'utf8'));
const taskService = fs.readFileSync(path.resolve(process.cwd(), 'assets/scripts/services/task-service.ts'), 'utf8');

/* ── display-name（§26/§110） ── */
function testDisplayNames(): void {
  const names = new Set(items.materials.map((m: { name: string }) => m.name));
  for (const m of items.materials) assert.ok(m.name && !/^mat_/.test(m.name), `material ${m.id} must have a CN name`);
  for (const e of items.equipment) assert.ok(e.name && !/^eq_/.test(e.name), `equipment ${e.id} must have a CN name`);
  assert.match(overlay, /queryMaterialName/, 'battle loot must map ids to CN names');
  assert.match(overlay, /materialCn\(/, 'loot renderer uses the CN name mapper');
  assert.ok(names.has('功法残页'), '功法残页 present');
  console.log('display-name passed');
}

/* ── task-duration（§39~§45） ── */
function testTaskDurations(): void {
  const durations: number[] = [];
  const re = /durationSeconds:\s*([\d.]+)\s*\*\s*(60|3600)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(taskService))) {
    durations.push(Number(m[1]) * (m[2] === '60' ? 60 : 3600));
  }
  assert.ok(durations.length >= 14, `realistic durations present (found ${durations.length})`);
  const minutes = durations.map((d) => d / 60);
  assert.ok(minutes.some((v) => v >= 5 && v <= 15), 'QUICK band exists (5-15min)');
  assert.ok(minutes.some((v) => v >= 15 && v <= 45), 'SHORT band exists (15-45min)');
  assert.ok(minutes.some((v) => v >= 45 && v <= 120), 'MEDIUM band exists (45-120min)');
  assert.ok(minutes.some((v) => v >= 120 && v <= 240), 'LONG band exists (2-4h)');
  assert.ok(minutes.some((v) => v >= 240 && v <= 480), 'EPIC band exists (4-8h)');
  assert.doesNotMatch(taskService, /durationSeconds:\s*10,/, 'no 10-second task durations remain');
  console.log('task-duration passed');
}

/* ── profession content 对齐（§2~§11） ── */
function testProfessionContent(): void {
  const monsterIds = new Set([...battle.monsters, ...v57Battle.monsters].map((m: { id: string }) => m.id));
  const skillIds = new Set([...battle.skills, ...v57Battle.skills].map((s: { id: string }) => s.id));
  const equipmentIds = new Set([...items.equipment, ...v57Equip.equipment].map((e: { id: string }) => e.id));
  const unlocked = professions.professions.filter((p: { locked?: boolean }) => !p.locked);
  assert.ok(unlocked.length >= 4, `four professions playable (found ${unlocked.length})`);
  for (const p of unlocked) {
    assert.ok(skillIds.has(p.initialSkill), `${p.id} initialSkill ${p.initialSkill} exists in battle content`);
    assert.ok(equipmentIds.has(p.initialEquipment), `${p.id} initialEquipment ${p.initialEquipment} exists`);
    for (const mid of p.monsters) assert.ok(monsterIds.has(mid), `${p.id} monster ${mid} exists`);
    assert.ok(p.monsters.length >= 6, `${p.id} monster pool sized`);
    assert.ok(p.builds.length >= 3, `${p.id} has >=3 builds`);
    assert.ok(typeof p.specialtyBonus === 'number' && p.specialtyBonus > 0, `${p.id} specialty bonus set`);
  }
  console.log('profession content passed');
}

/* ── 战斗 UI 契约（§15~§25） ── */
function testBattleUi(): void {
  assert.match(overlay, /ux-battle2-grid/, 'three-column battle layout present');
  assert.match(overlay, /ux-bt-float|spawnBattleFloats/, 'floating damage numbers wired');
  assert.match(overlay, /ux-bt-log/, 'battle log region present');
  assert.match(overlay, /data-action="battleSkill"/, 'active skill buttons present');
  assert.match(overlay, /castBattleSkill/, 'skill cast calls facade');
  assert.match(overlay, /【项目阶段结算】/, 'stage settlement title (§27)');
  assert.match(overlay, /data-project-decision/, 'project outcome decisions wired');
  assert.match(css, /@keyframes ux-float-up/, 'float-up animation defined');
  assert.match(css, /prefers-reduced-motion/, 'reduced motion still respected');
  console.log('battle ui contract passed');
}

/* ── journey guide + promotion（§66~§94） ── */
function testGuideAndPromotion(): void {
  assert.match(overlay, /journeyGuideHtml/, 'journey guide renderer present');
  assert.match(overlay, /今日修仙目标|主线：|进入第一个项目/, 'journey copy present');
  assert.match(overlayV2, /ux-promo-next/, 'promotion next-action CTA present');
  assert.match(overlayV2, /【我现在应该干什么】/, 'promotion answers what to do now');
  assert.match(overlay, /今日工作·日常/, 'task tabs reclassified (§75)');
  console.log('guide + promotion contract passed');
}

/* ── release 清理（§38/§181~§182） ── */
function testReleaseCleanup(): void {
  assert.doesNotMatch(overlay, /演示模式：/, 'no demo toast reaches players');
  assert.doesNotMatch(overlayV2, /演示模式：/, 'no demo toast in v2 overlay');
  assert.match(overlayV2, /var DEV_VISIBLE = \(function \(\)/, 'DEV gate environment-derived');
  assert.match(overlay, /console\.warn\('\[overlay\] command unavailable/, 'missing commands degrade quietly');
  console.log('release cleanup passed');
}

/* ── save 迁移契约（§208） ── */
function testMigrationContract(): void {
  const saveService = fs.readFileSync(path.resolve(process.cwd(), 'assets/scripts/services/save-service.ts'), 'utf8');
  const saveData = fs.readFileSync(path.resolve(process.cwd(), 'assets/scripts/model/save-data.ts'), 'utf8');
  // V5.7：v10 前旧档默认 JAVA_BACKEND；新档保持未选（职业选择首屏）
  assert.match(saveService, /raw\.saveVersion < 10\) \? 'JAVA_BACKEND' : undefined/, 'legacy saves default JAVA_BACKEND, new saves unselected');
  assert.match(saveData, /CURRENT_SAVE_VERSION = 13/, 'save v13');
  assert.match(saveData, /readonly profession\?: string/, 'save model carries profession');
  console.log('save migration contract passed');
}

testDisplayNames();
testTaskDurations();
testProfessionContent();
testBattleUi();
testGuideAndPromotion();
testReleaseCleanup();
testMigrationContract();
console.log('v5.5 core-loop rework contracts passed');
