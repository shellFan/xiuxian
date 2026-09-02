/**
 * Dangerous Diff Detector — Detects dangerous changes in git diffs.
 * Blocks: .git/ changes, main branch modifications, mass deletions, .env changes, etc.
 */
import { FindingSeverity } from './types';

export interface DangerousDiffFinding {
  severity: FindingSeverity;
  file: string;
  title: string;
  detail: string;
}

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; severity: FindingSeverity; title: string; detail: string }> = [
  // .git directory
  { pattern: /^\.git\//, severity: 'BLOCKER', title: 'Git directory modification', detail: 'Modifications to .git/ directory are forbidden' },
  // .env files
  { pattern: /^\.env/, severity: 'BLOCKER', title: 'Environment file modification', detail: '.env files may contain secrets' },
  // credentials
  { pattern: /credential/i, severity: 'BLOCKER', title: 'Credential file', detail: 'Credential files must not be modified by automation' },
  // AGENTS.md rules
  { pattern: /^AGENTS\.md$/, severity: 'HIGH', title: 'AGENTS.md modification', detail: 'Agent rules should not be modified by the agent itself' },
  // package-lock mass changes (suspicious)
  { pattern: /^package-lock\.json$/, severity: 'MEDIUM', title: 'package-lock.json change', detail: 'Large package-lock changes may indicate unintended dependency modifications' },
  // Cocos meta files
  { pattern: /\.meta$/, severity: 'LOW', title: 'Cocos .meta file', detail: 'Cocos .meta files should not be deleted' },
  // library/ temp/ .creator/
  { pattern: /^(library|temp|\.creator)\//, severity: 'BLOCKER', title: 'Cocos internal directory', detail: 'library/, temp/, .creator/ are not source code' },
];

/**
 * Check a list of changed files for dangerous patterns.
 */
export function detectDangerousFiles(changedFiles: string[], diff: string): DangerousDiffFinding[] {
  const findings: DangerousDiffFinding[] = [];

  for (const file of changedFiles) {
    for (const { pattern, severity, title, detail } of DANGEROUS_PATTERNS) {
      if (pattern.test(file.replace(/\\/g, '/'))) {
        findings.push({ severity, file, title, detail });
      }
    }
  }

  // Mass deletion detection (>100 files deleted)
  const deletedFiles = diff.split('\n').filter(line => line.startsWith('--- ') && !line.startsWith('--- /dev/null'));
  if (deletedFiles.length > 100) {
    findings.push({
      severity: 'BLOCKER',
      file: '*',
      title: 'Mass deletion detected',
      detail: `${deletedFiles.length} files appear to be deleted. This is likely unintended.`,
    });
  }

  // Main branch check (caller should verify this separately)
  // package-lock.json suspicious if > 500 lines changed
  if (changedFiles.includes('package-lock.json')) {
    const lockLines = diff.split('\n').filter(l => l.startsWith('+') || l.startsWith('-')).length;
    if (lockLines > 500) {
      findings.push({
        severity: 'HIGH',
        file: 'package-lock.json',
        title: 'Suspicious package-lock change',
        detail: `${lockLines} lines changed in package-lock.json. May indicate unintended dependency changes.`,
      });
    }
  }

  return findings;
}

/**
 * Check if diff is too large for review.
 */
export function isDiffTooLarge(changedFiles: string[], diff: string): boolean {
  return changedFiles.length > 50 || diff.split('\n').length > 5000;
}