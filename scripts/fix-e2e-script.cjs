'use strict';
const fs = require('fs');
let s = fs.readFileSync('ai/qa-final/session-v59o-card-battle.mjs', 'utf8');

// 1) 修正角色创建流程（candidates 查询 + ALLOCATION 5 点 + advance + finalize）
const createFn = /async function createCharacter\(cdp, professionId\) \{[\s\S]*?\n\}\n/;
const newCreate = [
  'async function createCharacter(cdp, professionId) {',
  '  return domEval(cdp, `(function(){ try {',
  '    var f = window.__GAME_FACADE__;',
  "    var view = f.queryCharacterCreation();",
  "    if (view.status === 'COMPLETE') return { ok: true, skip: true };",
  "    f.characterCreationSelectIndustry('INTERNET');",
  "    f.characterCreationSelectDirection('TECH');",
  "    f.characterCreationSelectProfession('" + '${professionId}' + "');",
  "    f.characterCreationSetIdentity('测试侠', 'AVATAR_A');",
  "    f.characterCreationSetBackground('BG_FRESH');",
  '    view = f.queryCharacterCreation();',
  "    var cands = view.draft && view.draft.candidates ? view.draft.candidates : null;",
  '    var first = null;',
  '    for (var k in cands) { first = cands[k]; break; }',
  '    if (first && first.id) f.characterCreationSelectCandidate(first.id);',
  '    for (var p = 0; p < 5; p++) f.characterCreationAllocate("insight", 1);',
  '    f.characterCreationAdvance();',
  '    var r = f.characterCreationFinalize();',
  "    var done = f.queryCharacterCreation().status === 'COMPLETE';",
  "    return { ok: true, finalized: done, result: r && r.success === false ? String(r.reason) : 'finalized' };",
  '  } catch (e) { return { ok: false, error: String(e && e.message || e) }; } })()`);',
  '}',
  '',
].join('\n');
if (!createFn.test(s)) { console.error('createCharacter pattern missing'); process.exit(1); }
s = s.replace(createFn, newCreate);

// 2) 开工（合法开局入口）后再开战斗
if (!s.includes('gameDay.ensureStarted')) {
  s = s.replace("    // 开始战斗（facade 命令；后续全部 DOM）。",
    "    // 开工（开局自动进入工作日的合法入口）。\n" +
    "    await domEval(cdp, `(function(){ try { window.__GAME_FACADE__.context.gameDay.ensureStarted(); return true; } catch(e){ return String(e); } })()`);\n" +
    "    // 开始战斗（facade 命令；后续全部 DOM）。");
}

// 3) restart 校验空引用防护
s = s.replace("ok('collection restored after restart', JSON.stringify(restored.collection) === JSON.stringify(evidence.preRestart.collection));",
  "ok('collection restored after restart', !!evidence.preRestart && JSON.stringify(restored.collection) === JSON.stringify(evidence.preRestart.collection));");
s = s.replace("ok('career level restored', restored.careerLevel === evidence.preRestart.careerLevel);",
  "ok('career level restored', !!evidence.preRestart && restored.careerLevel === evidence.preRestart.careerLevel);");

fs.writeFileSync('ai/qa-final/session-v59o-card-battle.mjs', s);
console.log('e2e script fixed');
