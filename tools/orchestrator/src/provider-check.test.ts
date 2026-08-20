import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCodexArgs } from './adapters/codex-adapter';
import { providerConfiguration } from './provider-check';
import { persistReviewResult } from './review-runner';
import { dirs } from './config';
import fs from 'node:fs';
import path from 'node:path';

test('Codex developer and reviewer args use their configured models', () => {
  assert.deepEqual(buildCodexArgs('developer', 'gpt-5.6-luna', 'ai/state/TASK/developer-result.json', 'ai/schemas/developer.schema.json'), ['exec', '--model', 'gpt-5.6-luna', '--sandbox', 'workspace-write', '--output-schema', 'ai/schemas/developer.schema.json', '-o', 'ai/state/TASK/developer-result.json', '-']);
  assert.deepEqual(buildCodexArgs('reviewer', 'gpt-5.6-sol', 'ai/state/TASK/review-result-round-01.json', 'ai/schemas/reviewer.schema.json'), ['exec', '--model', 'gpt-5.6-sol', '--sandbox', 'read-only', '--output-schema', 'ai/schemas/reviewer.schema.json', '-o', 'ai/state/TASK/review-result-round-01.json', '-']);
});

test('provider configuration requires both model names for Codex', () => {
  assert.deepEqual(providerConfiguration({developerProvider:'codex', reviewerProvider:'codex', developerModel:'', reviewerModel:''}), [
    'AI_DEVELOPER_MODEL is required when AI_DEVELOPER_PROVIDER=codex',
    'AI_REVIEWER_MODEL is required when AI_REVIEWER_PROVIDER=codex'
  ]);
});

test('orchestrator persists a validated reviewer result in task state', () => {
  const taskId = `TASK-999-PERSIST-${Date.now()}`;
  const review = {
    taskId,
    result: 'PASS' as const,
    summary: 'pass',
    blocker: [], high: [], medium: [], low: [], requiredFixes: [],
    tests: { passed: true, details: 'checked' },
    architecture: '', performance: '', security: '', outOfScopeFindings: []
  };
  const stateDir = path.join(dirs.state, taskId);
  try {
    const output = persistReviewResult(review, 1);
    assert.equal(output, path.join(stateDir, 'review-result-round-01.json'));
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), review);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('orchestrator rejects a reviewer result for another task', () => {
  const review = {
    taskId: 'TASK-999-WRONG', result: 'PASS' as const, summary: 'pass',
    blocker: [], high: [], medium: [], low: [], requiredFixes: [],
    tests: { passed: true, details: 'checked' },
    architecture: '', performance: '', security: '', outOfScopeFindings: []
  };
  assert.throws(() => persistReviewResult(review, 1, 'TASK-999-EXPECTED'), /taskId mismatch/);
});
