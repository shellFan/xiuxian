'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  validateSchemas,
  validateSemantics,
} = require('./schema-validator.cjs');

const PREVIEW_STATUS = 'PHASE4_PREVIEW';
const ROOT = path.resolve(__dirname, '../..');
const PREVIEW_DESTINATION = path.join('generated', 'phase4-integration-preview');
const OUTPUT_FILES = {
  events: 'events.preview.json',
  achievements: 'achievements.preview.json',
  daily: 'daily.preview.json',
  report: 'integration-report.json',
};

function clone(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

function domainForSource(source) {
  if (typeof source !== 'string') return null;
  if (source.includes('office-events') || source.includes('career-events')) return 'events';
  if (source.includes('achievement')) return 'achievements';
  if (source.includes('daily')) return 'daily';
  return null;
}

function issueSortKey(issue) {
  return [issue.source || '', issue.id || '', issue.code || '', issue.message || ''].join('\u0000');
}

function sortIssues(issues) {
  return [...issues].sort((left, right) => {
    const a = issueSortKey(left);
    const b = issueSortKey(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function candidateItems(pack, domain) {
  if (domain === 'events') return pack && pack.events && Array.isArray(pack.events.events) ? pack.events.events : [];
  if (domain === 'achievements') return pack && pack.achievements && Array.isArray(pack.achievements.achievements) ? pack.achievements.achievements : [];
  if (domain === 'daily') return pack && pack.daily && Array.isArray(pack.daily.tasks) ? pack.daily.tasks : [];
  return [];
}

function itemId(item) {
  return item && typeof item.id === 'string' ? item.id : null;
}

function groupedIssues(issues, domain) {
  const byId = new Map();
  const global = [];
  for (const issue of issues) {
    if (domainForSource(issue.source) !== domain) continue;
    if (issue.id) {
      const current = byId.get(issue.id) || [];
      current.push(issue);
      byId.set(issue.id, current);
    } else {
      global.push(issue);
    }
  }
  return { byId, global };
}

function blockedEntry(id, issues, fallbackSource) {
  return {
    id,
    source: issues.find((issue) => issue.source)?.source || fallbackSource,
    issues: sortIssues(issues).map(({ code, severity, message }) => ({ code, severity, message })),
  };
}

function makeDomainPreview(pack, domain, issues, forceBlock = false) {
  const items = candidateItems(pack, domain);
  const candidateSource = domain === 'events'
    ? 'assets/configs/phase4/office-events.json'
    : domain === 'achievements'
      ? 'assets/configs/phase4/achievements.json'
      : 'assets/configs/phase4/daily-tasks.json';
  const { byId, global } = groupedIssues(issues, domain);
  const blocked = [];
  const accepted = [];
  const seenBlocked = new Set();
  for (const item of items) {
    const id = itemId(item);
    const itemIssues = [...(id ? (byId.get(id) || []) : [])];
    if (forceBlock || global.length > 0) itemIssues.push(...global);
    if (itemIssues.length > 0 || forceBlock) {
      if (!seenBlocked.has(id)) {
        blocked.push(blockedEntry(id, itemIssues, candidateSource));
        seenBlocked.add(id);
      }
    } else {
      accepted.push(clone(item));
    }
  }
  if (forceBlock && items.length === 0 && global.length > 0) {
    blocked.push(blockedEntry(null, global, candidateSource));
  }
  return {
    runtimeEnabled: false,
    activationStatus: 'PREVIEW_ONLY',
    accepted,
    blocked,
  };
}

function capabilityIssues(pack) {
  const issues = [];
  const achievements = candidateItems(pack, 'achievements');
  for (const item of achievements) {
    if (item && item.condition && item.condition.type === 'FISH_SECONDS') {
      issues.push({
        code: 'CONDITION_MISMATCH',
        severity: 'WARNING',
        id: item.id,
        source: 'assets/configs/phase4/achievements.json',
        message: `FISH_SECONDS for ${item.id} is blocked until AchievementService adds the condition capability`,
      });
    }
  }
  const daily = candidateItems(pack, 'daily');
  for (const item of daily) {
    issues.push({
      code: 'CAPABILITY_GAP',
      severity: 'WARNING',
      id: itemId(item),
      source: 'assets/configs/phase4/daily-tasks.json',
      message: `daily task ${itemId(item) || '<unknown>'} remains candidate-only until random pool selection is available`,
    });
  }
  if (pack && Array.isArray(pack.inputErrors)) {
    for (const error of pack.inputErrors) {
      issues.push({
        code: 'MALFORMED_INPUT',
        severity: 'ERROR',
        id: error.id ?? null,
        source: error.source || null,
        message: error.message || 'malformed input',
      });
    }
  }
  return issues;
}

function createPreview(pack) {
  const schemaResult = validateSchemas(pack);
  const semanticIssues = validateSemantics(pack);
  const findings = sortIssues([...schemaResult.errors, ...semanticIssues, ...capabilityIssues(pack)]);
  const schemaInvalid = !schemaResult.valid;
  const events = makeDomainPreview(pack, 'events', findings, schemaInvalid);
  const achievements = makeDomainPreview(pack, 'achievements', findings, schemaInvalid);
  const daily = makeDomainPreview(pack, 'daily', findings, schemaInvalid || candidateItems(pack, 'daily').length > 0);
  const report = {
    schemaVersion: 1,
    status: PREVIEW_STATUS,
    runtimeEnabled: false,
    runtimeActivationReady: false,
    provenance: {
      candidateFiles: [
        'assets/configs/phase4/office-events.json',
        'assets/configs/phase4/achievements.json',
        'assets/configs/phase4/daily-tasks.json',
        'assets/configs/audio-plan.json',
        'assets/configs/ui-theme.json',
      ],
      sourceFiles: [
        'assets/configs/career-events.json',
        'assets/configs/achievements.json',
        'assets/configs/daily-tasks.json',
      ],
    },
    findings,
    summary: {
      schemaValid: schemaResult.valid,
      semanticValid: semanticIssues.length === 0,
      events: { accepted: events.accepted.length, blocked: events.blocked.length },
      achievements: { accepted: achievements.accepted.length, blocked: achievements.blocked.length },
      daily: { accepted: daily.accepted.length, blocked: daily.blocked.length },
    },
  };
  return { runtimeEnabled: false, status: PREVIEW_STATUS, events, achievements, daily, report };
}

function assertNoSymlink(filePath) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (stat.isSymbolicLink()) throw new Error(`destination contains a symlink: ${filePath}`);
}

function assertSafeDestination(destination, workspaceRoot = ROOT) {
  const root = path.resolve(workspaceRoot);
  const expected = path.resolve(root, PREVIEW_DESTINATION);
  const actual = path.resolve(destination);
  if (actual !== expected) throw new Error(`destination must be ${expected}`);
  assertNoSymlink(root);
  assertNoSymlink(path.dirname(expected));
  assertNoSymlink(expected);
  if (fs.existsSync(expected) && !fs.statSync(expected).isDirectory()) {
    throw new Error(`destination is not a directory: ${expected}`);
  }
}

function outputDocument(part) {
  return {
    schemaVersion: 1,
    status: PREVIEW_STATUS,
    runtimeEnabled: false,
    activationStatus: 'PREVIEW_ONLY',
    accepted: clone(part.accepted),
    blocked: clone(part.blocked),
  };
}

function writePreviewFiles(preview, destination, workspaceRoot = ROOT) {
  assertSafeDestination(destination, workspaceRoot);
  fs.mkdirSync(destination, { recursive: true });
  const documents = {
    [OUTPUT_FILES.events]: outputDocument(preview.events),
    [OUTPUT_FILES.achievements]: outputDocument(preview.achievements),
    [OUTPUT_FILES.daily]: outputDocument(preview.daily),
    [OUTPUT_FILES.report]: clone(preview.report),
  };
  for (const [fileName, document] of Object.entries(documents)) {
    const filePath = path.join(destination, fileName);
    assertNoSymlink(filePath);
    fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  }
  return Object.keys(documents);
}

module.exports = {
  OUTPUT_FILES,
  PREVIEW_DESTINATION,
  assertSafeDestination,
  createPreview,
  writePreviewFiles,
};
