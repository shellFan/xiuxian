const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  const result = execSync('npx tsc -p tsconfig.game.json --noEmit 2>&1', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf-8',
    timeout: 120000,
  });
  fs.writeFileSync(path.join(__dirname, '..', 'tsc-output.txt'), 'OK - no errors\n' + (result || ''));
} catch (err) {
  fs.writeFileSync(path.join(__dirname, '..', 'tsc-output.txt'), (err.stdout || '') + '\n' + (err.stderr || ''));
}