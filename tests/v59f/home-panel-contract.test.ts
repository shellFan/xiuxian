import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const panel = readFileSync(join(process.cwd(), 'desktop', 'ui-v59f-home.js'), 'utf8');
assert.match(
  panel,
  /data-action="claim"[^>]*data-id="' \+ H\.escHtml\(t\.taskId\)/,
  'home task reward button must carry the active task id to claimTask',
);
console.log('V5.9-F home task claim binding contract passed');
