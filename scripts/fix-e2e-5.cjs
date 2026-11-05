'use strict';
const fs = require('fs');
let s = fs.readFileSync('ai/qa-final/session-v59o-card-battle.mjs', 'utf8');
s = s.replace("f.characterCreationSetIdentity('测试侠', 'AVATAR_A');", "f.characterCreationSetIdentity('测试侠', 'avatar-1');");
fs.writeFileSync('ai/qa-final/session-v59o-card-battle.mjs', s);
console.log('avatar fixed');
