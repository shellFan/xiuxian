#!/usr/bin/env node
/**
 * qa-smoke.cjs — repeatable packaged-EXE smoke protocol for independent QA.
 *
 * Modes:
 *   --corrupt (default)  F01 fail-closed protocol:
 *     1. seed nested-corrupt save.json + save.backup.json in userData
 *     2. record SHA256 of both files
 *     3. launch the packaged EXE with --enable-logging
 *     4. wait --wait seconds (default 70 > 60s autosave window)
 *     5. assert boot log contains the LOAD_FAILED / fail-closed markers
 *     6. assert no "[storage] Save successful" write happened
 *     7. graceful-close the EXE (WM_CLOSE)
 *     8. assert SHA256 unchanged (before == after)
 *   --boot               normal boot: expect GAME_READY within 30s, no boot timeout
 *
 * Usage: node scripts/qa-smoke.cjs [--corrupt|--boot] [--wait 70] [--exe <path>]
 * Exit 0 = PASS, 1 = FAIL.
 */
const { spawn, execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const mode = args.includes('--boot') ? 'boot' : 'corrupt';
const waitIdx = args.indexOf('--wait');
const WAIT_MS = (waitIdx >= 0 ? parseInt(args[waitIdx + 1], 10) : 70) * 1000;
const exeIdx = args.indexOf('--exe');
const ROOT = path.join(__dirname, '..');
const EXE = exeIdx >= 0
  ? args[exeIdx + 1]
  : path.join(ROOT, 'dist', '牛马修仙传-win32-x64', '牛马修仙传.exe');

if (!fs.existsSync(EXE)) {
  console.error(`[qa-smoke] FAIL: EXE not found: ${EXE}`);
  process.exit(1);
}

const SAVE_DIR = path.join(os.homedir(), 'AppData', 'Roaming', 'xiuxian-desktop', 'xiuxian-save');
const CORRUPT_PRIMARY = '{{{NESTED CORRUPT NOT JSON[[[';
const CORRUPT_BACKUP = '}}}ALSO CORRUPT]]]';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function taskkillPid(pid, force) {
  // Numeric PID — avoids non-ASCII process-name encoding issues through cmd.exe.
  // Without /F, taskkill posts WM_CLOSE (graceful); with /F it terminates.
  try { execSync(`taskkill /PID ${pid}${force ? ' /F' : ''}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function killLeftovers() {
  // PowerShell handles the non-ASCII app path where cmd.exe taskkill /IM may not.
  try {
    execSync('powershell -NoProfile -Command "Get-Process | Where-Object { try { $_.Path -like \'*xiuxian*dist*\' } catch { $false } } | Stop-Process -Force"', { stdio: 'ignore' });
  } catch { /* none running */ }
}

async function main() {
  const logFile = path.join(os.tmpdir(), `qa-smoke-${Date.now()}.log`);
  const logStream = fs.openSync(logFile, 'a');

  if (mode === 'corrupt') {
    killLeftovers(); // no leftover instance may write after we seed the corrupt files
    await sleep(2000);
    fs.mkdirSync(SAVE_DIR, { recursive: true });
    fs.writeFileSync(path.join(SAVE_DIR, 'save.json'), CORRUPT_PRIMARY);
    fs.writeFileSync(path.join(SAVE_DIR, 'save.backup.json'), CORRUPT_BACKUP);
  } else {
    // boot mode: clean slate
    killLeftovers();
    await sleep(1500);
    fs.rmSync(SAVE_DIR, { recursive: true, force: true });
  }

  const before = mode === 'corrupt'
    ? [sha256(path.join(SAVE_DIR, 'save.json')), sha256(path.join(SAVE_DIR, 'save.backup.json'))]
    : null;
  console.log(`[qa-smoke] mode=${mode} wait=${WAIT_MS / 1000}s`);
  if (before) console.log(`[qa-smoke] SHA before: ${before[0].slice(0, 12)} / ${before[1].slice(0, 12)}`);

  const child = spawn(EXE, ['--enable-logging'], { stdio: ['ignore', logStream, logStream], windowsHide: true });
  let exited = false;
  child.on('exit', () => { exited = true; });
  const running = () => !exited && alive(child.pid);

  await sleep(WAIT_MS);

  const log = fs.readFileSync(logFile, 'utf8');
  let pass = true;

  if (mode === 'corrupt') {
    const markers = [
      ['LOAD_FAILED marker', /LOAD_FAILED/],
      ['fail-closed refusal', /refusing to create auto-saving game/],
    ];
    for (const [name, re] of markers) {
      if (!re.test(log)) { console.error(`[qa-smoke] FAIL: missing ${name}`); pass = false; }
      else console.log(`[qa-smoke] ok: ${name}`);
    }
    if (/\[storage\] Save successful/.test(log)) {
      console.error('[qa-smoke] FAIL: a save WRITE happened during fail-closed run');
      pass = false;
    } else {
      console.log('[qa-smoke] ok: zero writes during fail-closed run');
    }
    const mid = [sha256(path.join(SAVE_DIR, 'save.json')), sha256(path.join(SAVE_DIR, 'save.backup.json'))];
    if (mid[0] !== before[0] || mid[1] !== before[1]) {
      console.error('[qa-smoke] FAIL: SHA changed after autosave window (data clobbered)');
      pass = false;
    } else {
      console.log(`[qa-smoke] ok: SHA unchanged after ${WAIT_MS / 1000}s (autosave window covered)`);
    }
  } else {
    if (/GAME_READY received from renderer/.test(log)) console.log('[qa-smoke] ok: GAME_READY received');
    else { console.error('[qa-smoke] FAIL: no GAME_READY within wait window'); pass = false; }
    if (/GAME_BOOT_TIMEOUT/.test(log)) { console.error('[qa-smoke] FAIL: GAME_BOOT_TIMEOUT fired'); pass = false; }
    else console.log('[qa-smoke] ok: no boot timeout');
    if (/LOAD_FAILED|存档读取失败/.test(log)) { console.error('[qa-smoke] FAIL: clean boot hit load failure'); pass = false; }
    else console.log('[qa-smoke] ok: clean boot, no load failure');
  }

  // graceful close (WM_CLOSE) — exercises the F05 close-flush path
  taskkillPid(child.pid, false);
  for (let i = 0; i < 10 && running(); i++) await sleep(1000);
  if (running()) {
    console.warn('[qa-smoke] warn: graceful close did not exit in 10s — force killing');
    taskkillPid(child.pid, true);
    await sleep(2000);
    if (mode !== 'corrupt') pass = false;
  } else {
    console.log('[qa-smoke] ok: app exited after graceful close');
  }

  if (mode === 'corrupt') {
    const after = [sha256(path.join(SAVE_DIR, 'save.json')), sha256(path.join(SAVE_DIR, 'save.backup.json'))];
    if (after[0] !== before[0] || after[1] !== before[1]) {
      console.error('[qa-smoke] FAIL: SHA changed after close');
      pass = false;
    } else {
      console.log('[qa-smoke] ok: SHA unchanged after close — F01 ACCEPTED');
    }
    // leave a clean slate for QA
    fs.rmSync(path.join(SAVE_DIR, 'save.json'), { force: true });
    fs.rmSync(path.join(SAVE_DIR, 'save.backup.json'), { force: true });
  }

  fs.closeSync(logStream);
  console.log(`[qa-smoke] log: ${logFile}`);
  console.log(pass ? '[qa-smoke] RESULT: PASS' : '[qa-smoke] RESULT: FAIL');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('[qa-smoke] FAIL:', e); process.exit(1); });
