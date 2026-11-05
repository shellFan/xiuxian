'use strict';
const fs = require('fs');
let s = fs.readFileSync('ai/qa-final/session-v59o-card-battle.mjs', 'utf8');

// 1) 清理历史补丁残留的损坏行（domEval(cdp, ) 等）
const lines = s.split('\n');
const cleaned = lines.filter((l) => !/domEval\(cdp,\s*\)\s*;/.test(l));
if (lines.length !== cleaned.length) console.log('removed broken lines:', lines.length - cleaned.length);
s = cleaned.join('\n');

// 2) 入职剧情跳过（在 gameDay 之前）
if (!s.includes('onboarding-skip')) {
  const anchor = "    log('step: before gameDay');";
  const insert = [
    "    // 跳过入职剧情（真实 DOM 按钮）。",
    "    await domEval(cdp, `(function(){ try { var skip = document.querySelector('[data-creation-action=\\\"onboarding-skip\\\"]'); if (skip) skip.click(); return !!skip; } catch(e){ return String(e); } })()`);",
    "    await sleep(1000);",
    "    log('step: onboarding skipped');",
    "    log('step: before gameDay');",
  ].join('\n');
  if (!s.includes(anchor)) { console.error('gameDay anchor missing'); process.exit(1); }
  s = s.replace(anchor, insert);
  console.log('onboarding skip inserted');
}

// 3) PROJECT 导航选择器（data-nav 优先）
s = s.replace("var nav = document.querySelector('[data-goto-page=\"PROJECT\"]');",
  "var nav = document.querySelector('[data-nav=\"PROJECT\"]') || document.querySelector('[data-goto-page=\"PROJECT\"]');");

fs.writeFileSync('ai/qa-final/session-v59o-card-battle.mjs', s);
console.log('v8 ready; onboarding-skip:', s.includes('onboarding-skip'), '; data-nav:', s.includes('[data-nav="PROJECT"]'));
