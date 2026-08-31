import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'assets', 'scenes', 'Main.scene'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate repository root from ' + start);
}

const root = findRepoRoot(__dirname);
const uiDir = path.join(root, 'assets', 'scripts', 'ui');
const coreDir = path.join(root, 'assets', 'scripts', 'core');

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : (entry.name.endsWith('.ts') ? [full] : []);
  });
}

// Scope: every Cocos Component under ui/** and every *component.ts under core/.
const targets = [...walk(uiDir), ...walk(coreDir).filter((f) => /component\.ts$/.test(f))];

const NUMBER_DECORATOR = /@property\(\s*Number\s*\)/;

test('no Cocos Component uses @property(Number) — must be CCFloat/CCInteger', () => {
  const offenders = targets.filter((f) => NUMBER_DECORATOR.test(fs.readFileSync(f, 'utf8')));
  assert.equal(offenders.length, 0, `@property(Number) found in: ${offenders.join(', ')}`);
});

test('MergeBoardView imports CCFloat and CCInteger from cc', () => {
  const src = fs.readFileSync(path.join(uiDir, 'merge-board-view.ts'), 'utf8');
  assert.match(src, /import\s*\{[^}]*\bCCFloat\b[^}]*\}\s*from\s*['"]cc['"]/, 'CCFloat must be imported from cc');
  assert.match(src, /import\s*\{[^}]*\bCCInteger\b[^}]*\}\s*from\s*['"]cc['"]/, 'CCInteger must be imported from cc');
});

test('MergeBoardView geometry fields use CCFloat and count fields use CCInteger', () => {
  const src = fs.readFileSync(path.join(uiDir, 'merge-board-view.ts'), 'utf8');
  const floatFields = ['originX', 'originY', 'cellWidth', 'cellHeight', 'scaleX', 'scaleY'];
  const intFields = ['rows', 'columns'];
  const re = /@property\(\s*(CCFloat|CCInteger|Number)\s*\)\s+public\s+(\w+)\s*=/g;
  const found: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) found[m[2]] = m[1];
  for (const f of floatFields) assert.equal(found[f], 'CCFloat', `${f} must be @property(CCFloat)`);
  for (const f of intFields) assert.equal(found[f], 'CCInteger', `${f} must be @property(CCInteger)`);
  // Ensure no leftover Number decorator anywhere in this component.
  assert.equal(NUMBER_DECORATOR.test(src), false, 'MergeBoardView still contains @property(Number)');
});

console.log('numeric property type checks passed');
