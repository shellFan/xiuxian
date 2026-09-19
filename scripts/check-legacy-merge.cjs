/**
 * Legacy Merge Gate（§213）：确认 V2 Runtime 主路径不再依赖旧合成牛马系统。
 * - GameFacade 默认 board: null（PC V1/V2 路径）
 * - KPI 配置不再使用 MERGE_COUNT
 * - 旧系统文件仍保留（tests/ 覆盖），但 Runtime 主链不引用
 */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let failed = false;

// 1. KPI 配置无 MERGE_COUNT
const kpi = JSON.parse(fs.readFileSync(path.join(root, 'assets/configs/kpi.json'), 'utf8'));
for (const level of kpi.levels) {
  for (const req of level.requirements) {
    if (req.type === 'MERGE_COUNT') {
      console.error(`FAIL: kpi.json L${level.careerLevel} 仍含 MERGE_COUNT`);
      failed = true;
    }
  }
}

// 2. GameFacade 构造 GameContext 时默认 board: null
const facadeSrc = fs.readFileSync(path.join(root, 'assets/scripts/facade/game-facade.ts'), 'utf8');
if (!facadeSrc.includes('board: options.board !== undefined ? options.board : null')) {
  console.error('FAIL: GameFacade 未默认 board:null');
  failed = true;
}

// 3. 渲染主链（desktop overlay / v2 services）不引用 MergeService
const v2Dir = path.join(root, 'assets/scripts/v2');
for (const f of fs.readdirSync(v2Dir)) {
  if (!f.endsWith('.ts')) continue;
  const src = fs.readFileSync(path.join(v2Dir, f), 'utf8');
  if (src.includes('MergeService') || src.includes('RecruitmentService')) {
    console.error(`FAIL: v2/${f} 引用了旧合成系统`);
    failed = true;
  }
}

if (failed) { console.error('LEGACY MERGE CHECK FAILED'); process.exit(1); }
console.log('✅ LEGACY MERGE CHECK PASSED — V2 runtime is merge-free');
