'use strict';
const fs = require('fs');
let s = fs.readFileSync('ai/qa-final/session-v59o-card-battle.mjs', 'utf8');

// 1) createCharacter：返回每一步 trace，定位卡住的步骤
const createFn = /async function createCharacter\(cdp, professionId\) \{[\s\S]*?\n\}\n/;
const newCreate = [
  'async function createCharacter(cdp, professionId) {',
  '  return domEval(cdp, `(function(){ try {',
  '    var f = window.__GAME_FACADE__;',
  '    var trace = [];',
  '    function step() { var v = f.queryCharacterCreation(); return v && v.draft ? v.draft.step : v.status; }',
  "    if (f.queryCharacterCreation().status === 'COMPLETE') return { ok: true, skip: true };",
  "    f.characterCreationSelectIndustry('INTERNET'); trace.push(step());",
  "    f.characterCreationSelectDirection('TECH'); trace.push(step());",
  "    f.characterCreationSelectProfession('" + '${professionId}' + "'); trace.push(step());",
  "    f.characterCreationSetIdentity('测试侠', 'AVATAR_A'); trace.push(step());",
  "    f.characterCreationSetBackground('BG_FRESH'); trace.push(step());",
  '    var view = f.queryCharacterCreation();',
  '    var cands = view.draft && view.draft.candidates ? view.draft.candidates : null;',
  '    var first = null;',
  '    for (var k in cands) { first = cands[k]; break; }',
  "    if (first && first.id) { f.characterCreationSelectCandidate(first.id); trace.push(step()); } else trace.push('NO_CANDIDATE');",
  "    for (var p = 0; p < 5; p++) f.characterCreationAllocate('insight', 1);",
  '    trace.push(step());',
  '    var adv = f.characterCreationAdvance(); trace.push(step() + ":" + JSON.stringify(adv).slice(0, 60));',
  '    var fin = f.characterCreationFinalize();',
  '    trace.push(f.queryCharacterCreation().status);',
  "    return { ok: true, trace: trace, fin: JSON.stringify(fin).slice(0, 80) };",
  '  } catch (e) { return { ok: false, trace: trace || [], error: String(e && e.message || e) }; } })()`);',
  '}',
  '',
].join('\n');
if (!createFn.test(s)) { console.error('createCharacter pattern missing'); process.exit(1); }
s = s.replace(createFn, newCreate);

// 2) screenshot 调用带文件名
s = s.replace(/await shoot\(cdp, '([^']+)'\);/g, "await shoot(cdp, '$1');");
s = s.replace("await shoot(cdp, 'v59o-after-restart.png');", "await shoot(cdp2, 'v59o-after-restart.png');");

// 3) shoot() 使用 cdp.screenshot(name)（cdp.mjs 已实现落盘）
const shootFn = /async function shoot\(cdp, name\) \{[\s\S]*?\n\}\n/;
const newShoot = [
  'async function shoot(cdp, name) {',
  '  try {',
  '    const r = await cdp.screenshot(name);',
  '    evidence[name] = r.file;',
  '  } catch (e) { log("screenshot failed", name, String(e).slice(0, 80)); }',
  '}',
  '',
].join('\n');
if (!shootFn.test(s)) { console.error('shoot pattern missing'); process.exit(1); }
s = s.replace(shootFn, newShoot);

// 4) gameDay eval 简化（排除 BINDINGS 反序列化问题源）
s = s.replace("await domEval(cdp, `(function(){ try { window.__GAME_FACADE__.context.gameDay.ensureStarted(); return true; } catch(e){ return String(e); } })()`);",
  "await domEval(cdp, 'window.__GAME_FACADE__.context.gameDay.ensureStarted(); true');");

fs.writeFileSync('ai/qa-final/session-v59o-card-battle.mjs', s);
console.log('e2e script v3 ready');
