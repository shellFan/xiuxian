'use strict';
const fs = require('fs');
let s = fs.readFileSync('ai/qa-final/session-v59o-card-battle.mjs', 'utf8');

// 1) 创建流程：每步 select 后 advance()（向导是 select+advance 模型）
const createFn = /async function createCharacter\(cdp, professionId\) \{[\s\S]*?\n\}\n/;
const newCreate = [
  'async function createCharacter(cdp, professionId) {',
  '  return domEval(cdp, `(function(){ try {',
  '    var f = window.__GAME_FACADE__;',
  '    var trace = [];',
  '    function st() { var v = f.queryCharacterCreation(); return v && v.draft ? v.draft.step : v.status; }',
  "    if (f.queryCharacterCreation().status === 'COMPLETE') return { ok: true, skip: true };",
  "    f.characterCreationSelectIndustry('INTERNET'); f.characterCreationAdvance(); trace.push(st());",
  "    f.characterCreationSelectDirection('TECH'); f.characterCreationAdvance(); trace.push(st());",
  "    f.characterCreationSelectProfession('" + '${professionId}' + "'); f.characterCreationAdvance(); trace.push(st());",
  "    f.characterCreationSetIdentity('测试侠', 'AVATAR_A'); f.characterCreationAdvance(); trace.push(st());",
  "    f.characterCreationSetBackground('BG_FRESH'); f.characterCreationAdvance(); trace.push(st());",
  '    var view = f.queryCharacterCreation();',
  '    var cands = view.draft && view.draft.candidates ? view.draft.candidates : null;',
  '    var first = null;',
  '    for (var k in cands) { first = cands[k]; break; }',
  "    if (first && first.id) { f.characterCreationSelectCandidate(first.id); } else trace.push('NO_CANDIDATE');",
  '    f.characterCreationAdvance(); trace.push(st());',
  "    for (var p = 0; p < 5; p++) f.characterCreationAllocate('insight', 1);",
  '    f.characterCreationAdvance(); trace.push(st());',
  '    var fin = f.characterCreationFinalize();',
  "    var done = f.queryCharacterCreation().status === 'COMPLETE';",
  "    return { ok: true, done: done, trace: trace, fin: JSON.stringify(fin).slice(0, 80) };",
  '  } catch (e) { return { ok: false, error: String(e && e.message || e) }; } })()`);',
  '}',
  '',
].join('\n');
if (!createFn.test(s)) { console.error('create pattern missing'); process.exit(1); }
s = s.replace(createFn, newCreate);

// 2) 主流程逐步日志（定位 BINDINGS 报错的具体 eval）
s = s.replace("    // 开工（开局自动进入工作日的合法入口）。",
  "    log('step: before gameDay');\n    // 开工（开局自动进入工作日的合法入口）。");
s = s.replace("    // 开始战斗（facade 命令；后续全部 DOM）。",
  "    log('step: gameDay done');\n    // 开始战斗（facade 命令；后续全部 DOM）。");
s = s.replace("    log('battle started:', JSON.stringify(started));",
  "    log('step: battle command returned');\n    log('battle started:', JSON.stringify(started));");

fs.writeFileSync('ai/qa-final/session-v59o-card-battle.mjs', s);
console.log('e2e script v4 ready');
