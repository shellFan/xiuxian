// 一次性补丁：为 exp-audit.cjs 增加职业/昵称参数（跑 10 档案用）。
const fs = require('fs');
const p = 'scripts/v101/exp-audit.cjs';
let s = fs.readFileSync(p, 'utf8');
if (!s.includes('const PROF =')) {
  s = s.replace(
    "const CLEAR = args['keep-save'] !== '1';",
    "const CLEAR = args['keep-save'] !== '1';\nconst PROF = String(args.profession || 'JAVA_BACKEND');\nconst DIR = String(args.direction || 'TECH_RND');\nconst IND = String(args.industry || 'INTERNET');\nconst NICK = String(args.nick || '审计员' + TAG.slice(-4));",
  );
}
s = s.replace('click(\'[data-creation-choice="industry:INTERNET"]\')', "click('[data-creation-choice=\"industry:' + IND + '\"]')");
s = s.replace('click(\'[data-creation-choice="direction:TECH_RND"]\')', "click('[data-creation-choice=\"direction:' + DIR + '\"]')");
s = s.replace('click(\'[data-creation-choice="profession:JAVA_BACKEND"]\')', "click('[data-creation-choice=\"profession:' + PROF + '\"]')");
s = s.replace("inp.value='审计员';", "inp.value=NICK;");
fs.writeFileSync(p, s);
console.log('patched: PROF/DIR/IND/NICK wired');
