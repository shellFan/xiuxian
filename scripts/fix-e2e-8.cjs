'use strict';
const fs = require('fs');
let s = fs.readFileSync('ai/qa-final/session-v59o-card-battle.mjs', 'utf8');

// 战斗循环：处理升级三选一弹窗（popup 拦截点击）+ 周期日志 + 状态可见。
const oldLoop = s.match(/    let outcome = null;\n    for \(let i = 0; i < 400; i\+\+\) \{[\s\S]*?\n    \}\n/);
if (!oldLoop) { console.error('loop pattern missing'); process.exit(1); }
const newLoop = [
  '    let outcome = null;',
  '    for (let i = 0; i < 600; i += 1) {',
  '      const state = await domEval(cdp, `(function(){ try {',
  '        var f = window.__GAME_FACADE__;',
  '        var finished = f.queryFinishedBattle();',
  "        if (finished) return { done: true, status: finished.status };",
  '        var run = f.queryBattle();',
  "        if (run && run.skillOffers) { f.chooseBattleSkill(run.skillOffers[0]); return { step: 'skill' }; }",
  '        var offerBtn = document.querySelector("[data-battle-skill]");',
  '        if (offerBtn) { offerBtn.click(); return { step: "offer-dom" }; }',
  '        var c = f.queryBattleCard();',
  "        if (!c) return { done: true, status: 'VANISHED' };",
  "        if (c.phase === 'REWARD_SELECTION') return { done: true, status: 'VICTORY' };",
  "        if (c.phase !== 'PLAYER_TURN') return { step: 'wait', phase: c.phase };",
  '        var usable = document.querySelectorAll(".ux-bc-card.is-usable");',
  '        var picked = null;',
  '        for (var k = 0; k < usable.length; k++) { if (usable[k].className.indexOf("is-attack") >= 0) { picked = usable[k]; break; } }',
  '        if (!picked) picked = usable[0];',
  '        if (picked) {',
  '          picked.click();',
  '          if (window.__BATTLE_CARD__.isSelecting()) {',
  '            var en = document.querySelector(".ux-bt-enemy[data-enemy-uid]");',
  '            if (en) en.click();',
  '          }',
  "          return { step: 'play' };",
  '        }',
  '        var btn = document.querySelector("[data-action=\\"battleEndTurn\\"]");',
  '        if (btn) { btn.click(); return { step: "endturn" }; }',
  "        return { step: 'stuck' };",
  "      } catch(e){ return { done:true, status:'ERR', error:String(e).slice(0,140) }; } })()`);",
  '      if (i % 40 === 0) log("loop", i, JSON.stringify(state));',
  '      if (state.done) { outcome = state; break; }',
  '      await sleep(300);',
  '    }',
  '',
].join('\n');
s = s.replace(oldLoop[0], newLoop);

// 保存结果日志
s = s.replace("    await domEval(cdp, `(function(){ try { window.__GAME_FACADE__.context.saveService.save(window.__GAME_FACADE__.context.player); return true; } catch(e){ return false; } })()`);",
  "    const saveResult = await domEval(cdp, `(function(){ try { window.__GAME_FACADE__.context.saveService.save(window.__GAME_FACADE__.context.player); return 'saved'; } catch(e){ return 'ERR:' + String(e && e.message || e).slice(0, 120); } })()`);\n    log('explicit save:', saveResult);");

fs.writeFileSync('ai/qa-final/session-v59o-card-battle.mjs', s);
console.log('loop upgraded');
