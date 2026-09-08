/**
 * Bulk-fix: Add non-null assertion (!) after context.board / xxx.board
 * in test files where board is known to exist (GameContext defaults to creating one).
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'tests');

function processFile(fp) {
  let c = fs.readFileSync(fp, 'utf8');
  const orig = c;

  // Pattern: identifier.board. -> identifier.board!.
  // But NOT if already has ! (identifier.board!.)
  c = c.replace(/(\w+)\.board\./g, (match, prefix) => {
    return `${prefix}.board!.`;
  });

  // Pattern: identifier.board\n -> identifier.board!\n (standalone board access at end of line)
  // Only if not already followed by ! or . or )
  c = c.replace(/(\w+)\.board(?=[\s;,\)\]])/g, (match, prefix) => {
    return `${prefix}.board!`;
  });

  if (c !== orig) {
    fs.writeFileSync(fp, c, 'utf8');
    console.log(`Fixed: ${fp}`);
  }
}

function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const fp = path.join(d, f);
    if (fs.statSync(fp).isDirectory()) walk(fp);
    else if (f.endsWith('.ts')) processFile(fp);
  }
}

walk(dir);
console.log('Done!');