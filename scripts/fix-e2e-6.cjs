'use strict';
const fs = require('fs');
let s = fs.readFileSync('ai/qa-final/session-v59o-card-battle.mjs', 'utf8');

// 修正创建流程：IDENTITY 一步内完成昵称+形象+出身再 advance；DESTINY 选天命；ALLOCATION 分配。
const createFn = /async function createCharacter\(cdp, professionId\) \{[\s\S]*?\n\}\n/;
const newCreate = [
  'async function createCharacter(cdp, professionId) {',
  '  return domEval(cdp, `(function(){ try {',
  '    var f = window.__GAME_FACADE__;',
  '    var trace = [];',
  '    function st() { var v = f.queryCharacterCreation(); return v && v.draft ? v.draft.step : v.status; }',
  "    if (f.queryCharacterCreation().status === 'COMPLETE') return { ok: true, skip: true };",
  "    f.characterCreationSelectIndustry('INTERNET'); f.characterCreationAdvance(); trace.push(st());",
  "    f.characterCreationSelectDirection('TECH_RND'); f.characterCreationAdvance(); trace.push(st());",
  "    f.characterCreationSelectProfession('" + '${professionId}' + "'); f.characterCreationAdvance(); trace.push(st());",
  "    f.characterCreationSetIdentity('测试侠', 'avatar-1');",
  "    f.characterCreationSetBackground('ORDINARY_WORKER');",
  '    f.characterCreationAdvance(); trace.push(st());',
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

// 战斗前先导航到 PROJECT 页（真实 DOM 导航），并等待手牌渲染。
s = s.replace("    await waitFor(cdp, `document.querySelectorAll('.ux-bc-card').length >= 5`, 15000, 'hand rendered');",
  "    await domEval(cdp, `(function(){ try { var nav = document.querySelector('[data-goto-page=\"PROJECT\"]'); if (nav) nav.click(); return !!nav; } catch(e){ return String(e); } })()`);\n" +
  "    await sleep(1500);\n" +
  "    await waitFor(cdp, `document.querySelectorAll('.ux-bc-card').length >= 5`, 20000, 'hand rendered');");

// creation 断言加严
s = s.replace("ok('character creation finalized', created && created.ok);",
  "ok('character creation finalized', created && created.ok && created.done);");

fs.writeFileSync('ai/qa-final/session-v59o-card-battle.mjs', s);
console.log('e2e v7 ready');
