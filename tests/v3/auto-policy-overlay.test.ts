import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'desktop', 'ui-overlay.js'), 'utf8');
const styles = fs.readFileSync(path.join(process.cwd(), 'desktop', 'ui-overlay.css'), 'utf8');

assert.match(source, /function showWelcomeBackPopup\(\)/);
assert.match(source, /prepareWelcomeBackSummary\(\)/);
assert.match(source, /showWelcomeBackPopup\(\)/);
assert.doesNotMatch(source, /showOfflinePopup\(['"]offline_['"] \+ Date\.now\(\)\)/);
assert.match(source, /setAutoPolicy\(/);
assert.match(source, /NORMAL:\s*'均衡'/);
assert.match(source, /SAFE:\s*'稳健'/);
assert.match(source, /GRINDER:\s*'卷王'/);
assert.match(source, /SLACKER:\s*'摸鱼'/);

for (const field of [
  'effectiveSeconds', 'policyUsed', 'salary', 'cultivation', 'spiritStones',
  'workSeconds', 'fishingSeconds', 'cultivatingSeconds', 'overtimeSeconds',
  'eventsAutoResolved', 'pendingDecisionCount', 'incidentsRaised',
]) {
  assert.match(source, new RegExp(`simulation\\.${field}`), `summary must render ${field}`);
}
assert.match(source, /summary\.welcomeLine\.text/);
assert.match(source, /任务 ' \+ fmtNum\(simulation\.tasksCompleted\)/, 'auto task metric must use simulation result');
assert.match(source, /'继续上班'/);
assert.match(source, /'领取并处理破事'/);
assert.match(source, /function showOfflineDecisionPopup\(\)/);
assert.match(source, /prepareOfflineDecisions\(\)/);
assert.match(source, /performOfflineDecision\(current\.id\)/);
assert.match(source, /positionText\s*=\s*\(session\.cursor \+ 1\) \+ ' \/ ' \+ session\.pendingEventIds\.length/);
assert.doesNotMatch(source, /WELCOME_(?:LINES|COPY|MESSAGES)\s*=\s*\[/, 'welcome copy belongs to the TypeScript provider');
assert.match(styles, /\.ux-welcome-scroll\s*\{[^}]*overflow-y:\s*auto/s);
assert.match(styles, /\.ux-body--home\s*\{[^}]*overflow:\s*hidden/s);

console.log('auto policy overlay contract tests passed');
