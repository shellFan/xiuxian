import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const mainSource = fs.readFileSync(path.resolve(process.cwd(), 'desktop/main.cjs'), 'utf8');

assert.match(
  mainSource,
  /const e2eHidden\s*=\s*process\.argv\.includes\('--e2e-hidden'\)\s*&&\s*isolatedTestProfile\s*&&\s*process\.argv\.some\(arg\s*=>\s*arg\.startsWith\('--remote-debugging-port='\)\)/,
  'hidden mode must require the explicit E2E flag, an isolated temp profile, and CDP',
);
assert.match(
  mainSource,
  /ready-to-show'[\s\S]{0,180}if\s*\(e2eHidden\)[\s\S]{0,120}else\s*\{\s*mainWindow\.show\(\)/,
  'normal launches must keep showing the window; only isolated E2E launches stay hidden',
);
