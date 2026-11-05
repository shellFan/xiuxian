// 探针：定位 CDP BINDINGS 反序列化报错的触发表达式。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QA, launchExe, Cdp, closeExe, sleep } from './cdp.mjs';

QA.isolatedUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'v59o-probe-'));

const probes = [
  ['plain-true', 'true'],
  ['facade-exists', '!!window.__GAME_FACADE__'],
  ['facade-context', 'window.__GAME_FACADE__.context ? 1 : 0'],
  ['gameDay-iife', '(function(){ window.__GAME_FACADE__.context.gameDay.ensureStarted(); return true; })()'],
  ['gameDay-direct', 'window.__GAME_FACADE__.context.gameDay.ensureStarted(); true'],
  ['queryCC', 'window.__GAME_FACADE__.queryCharacterCreation().status'],
];

const boot = await launchExe({ logFile: path.join(QA.evidenceDir, 'probe-boot.log') });
const { child } = boot;
const cdp = await Cdp.connect();
try {
  for (let i = 0; i < 30; i++) {
    const ready = await cdp.eval('!!(window.__GAME_FACADE__ && window.__GAME_FACADE__.context)');
    if (ready) break;
    await sleep(1000);
  }
  await sleep(2000);
  for (const [name, expr] of probes) {
    try {
      const v = await cdp.eval(expr);
      console.log('OK  ', name, JSON.stringify(v));
    } catch (e) {
      console.log('FAIL', name, String(e).slice(0, 120));
    }
  }
} finally {
  await closeExe(child);
}
process.exit(0);
