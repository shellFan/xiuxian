'use strict';
const fs = require('fs');
let s = fs.readFileSync('ai/qa-final/session-v59o-card-battle.mjs', 'utf8');
s = s.replace("f.characterCreationSelectDirection('TECH');", "f.characterCreationSelectDirection('TECH_RND');");
s = s.replace("await domEval(cdp, 'window.__GAME_FACADE__.context.gameDay.ensureStarted(); true');",
  "await domEval(cdp, '(function(){ window.__GAME_FACADE__.context.gameDay.ensureStarted(); return true; })()');");
fs.writeFileSync('ai/qa-final/session-v59o-card-battle.mjs', s);
console.log('e2e v5 ready');
