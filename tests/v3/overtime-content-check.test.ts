import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { mergeUniqueById } from '../../assets/scripts/v3/overtime-content';

const check = spawnSync(process.execPath, [path.resolve(process.cwd(), 'scripts/check-v2-content.cjs')], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || check.stdout);
assert.match(check.stdout, /Overtime V3: pre-off 20 \| night 50 \| standalone night 20 \| bosses 6 \| chains 10 \| achievements 15/, 'content check must report both the independent night-event pool and overtime delivery minimums');
assert.match(check.stdout, /Overtime V3 cross-pool IDs: verified/, 'content check must reject V3 IDs that collide with legacy event or achievement bundles');
assert.throws(
  () => mergeUniqueById([{ id: 'shared' }], [{ id: 'shared' }], 'event'),
  /Duplicate event id: shared/,
  'runtime content merging must reject collisions instead of overriding an existing item',
);
console.log('overtime content check tests passed');
