import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCodexArgs } from './adapters/codex-adapter';
import { providerConfiguration } from './provider-check';

test('Codex developer and reviewer args use their configured models', () => {
  assert.deepEqual(buildCodexArgs('developer', 'gpt-5.6-luna', 'ai/state/TASK/developer-result.json', 'ai/schemas/developer.schema.json'), ['exec', '--model', 'gpt-5.6-luna', '--full-auto', '--output-schema', 'ai/schemas/developer.schema.json', '-o', 'ai/state/TASK/developer-result.json', '-']);
  assert.deepEqual(buildCodexArgs('reviewer', 'gpt-5.6-sol', 'ai/state/TASK/review-result-round-01.json', 'ai/schemas/reviewer.schema.json'), ['exec', '--model', 'gpt-5.6-sol', '--sandbox', '--output-schema', 'ai/schemas/reviewer.schema.json', '-o', 'ai/state/TASK/review-result-round-01.json', '-']);
});

test('provider configuration requires both model names for Codex', () => {
  assert.deepEqual(providerConfiguration({developerProvider:'codex', reviewerProvider:'codex', developerModel:'', reviewerModel:''}), [
    'AI_DEVELOPER_MODEL is required when AI_DEVELOPER_PROVIDER=codex',
    'AI_REVIEWER_MODEL is required when AI_REVIEWER_PROVIDER=codex'
  ]);
});
