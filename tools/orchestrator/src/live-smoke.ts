/**
 * Live Smoke Test — Makes 1 real API call per provider to verify connectivity.
 *
 * Gate: AI_LIVE_TEST=true must be set, otherwise exits with message.
 * Limits: Max 1 call each provider, no autoNextTask.
 *
 * Run: npm run ai:live-smoke
 */
import { config } from './config';
import { callOpenAI } from './openai-client';
import { recordCall } from './budget-tracker';

interface SmokeResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

async function smokeTest(name: string, fn: () => Promise<void>): Promise<SmokeResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start };
  }
}

export async function runLiveSmokeTest(): Promise<boolean> {
  // Gate check
  if (process.env.AI_LIVE_TEST !== 'true') {
    console.log('\n=== AI Orchestrator Live Smoke Test ===\n');
    console.log('SKIPPED: Set AI_LIVE_TEST=true to run live smoke tests.');
    console.log('This test makes real API calls (max 1 per provider).\n');
    return true; // Not a failure, just skipped
  }

  console.log('\n=== AI Orchestrator Live Smoke Test ===\n');
  console.log('AI_LIVE_TEST=true — making real API calls (max 1 per provider)\n');

  const results: SmokeResult[] = [];

  // Test 1: OpenAI Planner connectivity
  if (process.env.OPENAI_API_KEY) {
    results.push(await smokeTest('OpenAI Planner API call', async () => {
      const result = await callOpenAI({
        model: config.openaiModel,
        systemPrompt: 'You are a test. Respond with JSON.',
        userPrompt: 'Respond with {"status":"ok"}',
        maxTokens: 50,
        temperature: 0,
        responseFormat: 'json_object',
        taskId: 'SMOKE-TEST',
        timeoutMs: 30000,
      });
      recordCall('openai', config.openaiModel, result.durationMs, result.tokensUsed);
      if (!result.content.includes('ok')) {
        throw new Error(`Unexpected response: ${result.content.slice(0, 200)}`);
      }
    }));
  } else {
    results.push({ name: 'OpenAI Planner API call', passed: false, error: 'OPENAI_API_KEY not set', durationMs: 0 });
  }

  // Test 2: OpenAI Reviewer connectivity (same API, different prompt)
  if (process.env.OPENAI_API_KEY) {
    results.push(await smokeTest('OpenAI Reviewer API call', async () => {
      const result = await callOpenAI({
        model: config.reviewerModel,
        systemPrompt: 'You are a code reviewer. Respond with JSON.',
        userPrompt: 'Respond with {"result":"PASS","summary":"smoke test"}',
        maxTokens: 50,
        temperature: 0,
        responseFormat: 'json_object',
        taskId: 'SMOKE-TEST',
        timeoutMs: 30000,
      });
      recordCall('openai', config.reviewerModel, result.durationMs, result.tokensUsed);
      if (!result.content) throw new Error('Empty response');
    }));
  }

  // Test 3: Cursor CLI availability
  results.push(await smokeTest('Cursor CLI availability', async () => {
    const { commandExists } = await import('./process-runner');
    const available = await commandExists('agent') || await commandExists('agent.cmd');
    if (!available) {
      throw new Error('Cursor CLI (agent/agent.cmd) not found in PATH');
    }
  }));

  // Test 4: Git availability
  results.push(await smokeTest('Git availability', async () => {
    const { runCommand } = await import('./command-runner');
    const result = await runCommand('git', ['--version'], 'SMOKE-TEST');
    if (!result.success) throw new Error('git --version failed');
  }));

  // Test 5: Environment check
  results.push(await smokeTest('Environment check', async () => {
    const { runDoctor } = await import('./doctor');
    const result = await runDoctor({ verbose: false, fix: false });
    if (!result.healthy) {
      const errors = result.errors.join('; ');
      throw new Error(`Doctor unhealthy: ${errors}`);
    }
  }));

  // Results
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    console.log(`  ${icon} ${r.name} (${r.durationMs}ms)`);
    if (r.error) console.log(`    Error: ${r.error}`);
    if (r.passed) passed++;
    else failed++;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed, ${results.length} total\n`);

  if (failed > 0) {
    console.log('❌ Live smoke test FAILED\n');
    return false;
  }

  console.log('✅ Live smoke test PASSED\n');
  return true;
}

// Run if called directly
if (require.main === module) {
  runLiveSmokeTest().then(passed => {
    process.exit(passed ? 0 : 1);
  }).catch(e => {
    console.error('Live smoke test error:', e);
    process.exit(1);
  });
}