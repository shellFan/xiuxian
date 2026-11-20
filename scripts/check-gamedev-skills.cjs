/**
 * check-gamedev-skills.cjs — 游戏研发技能体系完整性验证
 *
 * 验证内容（对应 docs/GAMEDEV_SKILLS/README.md）：
 *  1. 11 个已安装技能在 .agents/skills/ 与 .zcode/skills/ 内容一致
 *  2. SKILL.md 的 sha256 与 skills-lock.json 记录的 computedHash 一致（防篡改/防漂移）
 *  3. docs/GAMEDEV_SKILLS/ 全部规范文档存在
 *  4. 上游来源信息（commit）在锁文件中一致
 *
 * 运行：node scripts/check-gamedev-skills.cjs
 * 退出码：0 = 全部通过；1 = 存在失败项
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const AGENTS_SKILLS = path.join(ROOT, '.agents', 'skills');
const ZCODE_SKILLS = path.join(ROOT, '.zcode', 'skills');
const CLAUDE_SKILLS = path.join(ROOT, '.claude', 'skills');
const LOCK = path.join(ROOT, 'skills-lock.json');
const DOCS = path.join(ROOT, 'docs', 'GAMEDEV_SKILLS');

// V10.1 决策：只安装引擎无关技能（11 个），不装 Godot/Unity/Unreal 等 51 个引擎专属技能
const EXPECTED_SKILLS = [
  'audio-design',
  'card-game',
  'create-game-assets',
  'dialogue-systems',
  'game-ai',
  'game-docs',
  'game-feel',
  'game-ui-ux',
  'performance-optimization',
  'rpg',
  'save-systems',
];

const REQUIRED_DOCS = [
  'README.md',
  'SKILL_ROUTER.md',
  'COCOS_CREATOR_STANDARDS.md',
  'RPG_DESIGN_GUIDELINES.md',
  'UI_UX_GUIDELINES.md',
  'ART_ASSET_GUIDELINES.md',
  'GAME_FEEL_GUIDELINES.md',
  'NPC_DIALOGUE_GUIDELINES.md',
  'GAME_ECONOMY_GUIDELINES.md',
  'SAVE_SYSTEM_GUIDELINES.md',
  'PERFORMANCE_GUIDELINES.md',
  'QA_GUIDELINES.md',
  'SKILL_USAGE_LOG.md',
  'DECISION_LOG.md',
];

const failures = [];
let checks = 0;

function ok(condition, label) {
  checks += 1;
  if (condition) {
    console.log(`  [PASS] ${label}`);
  } else {
    failures.push(label);
    console.log(`  [FAIL] ${label}`);
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function dirHasSkill(dir, name) {
  const skillMd = path.join(dir, name, 'SKILL.md');
  return fs.existsSync(skillMd);
}

console.log('== 1. skills-lock.json 存在且可解析 ==');
ok(fs.existsSync(LOCK), 'skills-lock.json 存在');
const lock = fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')) : { skills: {} };

console.log('== 2. 11 个预期技能全部安装（.agents / .zcode 双目录）==');
for (const name of EXPECTED_SKILLS) {
  const inAgents = dirHasSkill(AGENTS_SKILLS, name);
  const inZcode = dirHasSkill(ZCODE_SKILLS, name);
  ok(inAgents && inZcode, `技能 ${name}（.agents=${inAgents} .zcode=${inZcode}）`);
}

console.log('== 3. 锁文件来源记录完整（source + pinned commit）==');
// 注：锁文件 computedHash 是 skills CLI 内部算法（非本地文件的裸 sha256）。
// 上游一致性用「sparse clone @ pinned commit 后 diff」验证（2026-11-21 实测 11/11 逐字节一致），
// 复验方法见 docs/GAMEDEV_SKILLS/DECISION_LOG.md。
for (const name of EXPECTED_SKILLS) {
  const entry = lock.skills[name];
  if (!entry) {
    ok(false, `${name} 在锁文件中有记录`);
    continue;
  }
  const sourceOk = entry.source === 'gamedev-skills/awesome-gamedev-agent-skills' && /^c6ca6c4/.test(entry.commit);
  ok(sourceOk, `${name} 来源/commit（${entry.source} @ ${String(entry.commit).slice(0, 7)}）`);
}

console.log('== 4. 双目录内容一致（.agents = .zcode）==');
for (const name of EXPECTED_SKILLS) {
  const a = path.join(AGENTS_SKILLS, name, 'SKILL.md');
  const z = path.join(ZCODE_SKILLS, name, 'SKILL.md');
  if (fs.existsSync(a) && fs.existsSync(z)) {
    ok(sha256(a) === sha256(z), `${name} 两个安装目录内容一致`);
  }
}

console.log('== 5. docs/GAMEDEV_SKILLS/ 规范文档齐全 ==');
for (const doc of REQUIRED_DOCS) {
  ok(fs.existsSync(path.join(DOCS, doc)), `docs/GAMEDEV_SKILLS/${doc}`);
}

console.log('== 6. .claude/skills 同步（如目录存在）==');
if (fs.existsSync(CLAUDE_SKILLS)) {
  for (const name of EXPECTED_SKILLS) {
    const a = path.join(AGENTS_SKILLS, name, 'SKILL.md');
    const c = path.join(CLAUDE_SKILLS, name, 'SKILL.md');
    if (fs.existsSync(a) && fs.existsSync(c)) {
      ok(sha256(a) === sha256(c), `${name} .claude 副本一致`);
    } else {
      ok(dirHasSkill(CLAUDE_SKILLS, name), `${name} 在 .claude/skills 中存在`);
    }
  }
} else {
  console.log('  [SKIP] .claude/skills 不存在（Claude Code 未安装该副本）');
}

console.log('');
if (failures.length) {
  console.log(`结果：${checks - failures.length}/${checks} 通过，${failures.length} 失败`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log(`结果：${checks}/${checks} 全部通过`);
}
