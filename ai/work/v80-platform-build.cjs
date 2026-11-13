/** V8.0 V7.8 — platform builds via Cocos CLI (wechatgame / bytedance-mini-game). */
'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const exe = 'C:' + path.sep + 'ProgramData' + path.sep + 'cocos' + path.sep + 'editors' + path.sep + 'Creator' + path.sep + '3.8.4' + path.sep + 'CocosCreator.exe';

function build(platform) {
  const buildPath = path.join(root, 'build', platform + '-current');
  const args = ['--project', root, '--build', 'platform=' + platform + ';buildPath=' + buildPath + ';outputName=' + platform + ';debug=false'];
  const started = Date.now();
  const r = spawnSync(exe, args, { stdio: 'pipe', encoding: 'utf8', timeout: 420000 });
  const logDir = path.join(root, 'ai', 'reports', 'v80', 'logs', 'build');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, 'cocos-' + platform + '.log'), (r.stdout || '') + (r.stderr || ''));
  const outDir = path.join(buildPath, platform);
  const exists = fs.existsSync(outDir);
  const files = exists ? fs.readdirSync(outDir).length : 0;
  console.log('PLATFORM_BUILD', platform, 'exit=' + r.status, 'ms=' + (Date.now() - started), 'outDirExists=' + exists, 'files=' + files);
  return { platform, exit: r.status, exists, files, ms: Date.now() - started };
}

const results = [];
if (process.argv.includes('--wechat')) results.push(build('wechatgame'));
if (process.argv.includes('--douyin')) results.push(build('bytedance-mini-game'));
fs.writeFileSync(path.join(root, 'ai', 'reports', 'v80', 'platform-build-results.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
console.log('DONE');
