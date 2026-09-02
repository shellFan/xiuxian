import OpenAI from 'openai';
import { config } from './config';
import { log } from './logger';

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set. Cannot initialize OpenAI client.');
  _client = new OpenAI({ apiKey });
  return _client;
}

export interface OpenAICallOptions {
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'json_object';
  taskId?: string;
  timeoutMs?: number;
}

export interface OpenAICallResult {
  content: string;
  model: string;
  tokensUsed: number;
  durationMs: number;
  finishReason: string | null;
}

export async function callOpenAI(options: OpenAICallOptions): Promise<OpenAICallResult> {
  const client = getOpenAIClient();
  const model = options.model || config.openaiModel;
  const started = Date.now();

  const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
    model,
    messages: [
      { role: 'system', content: options.systemPrompt },
      { role: 'user', content: options.userPrompt },
    ],
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.2,
  };

  if (options.responseFormat === 'json_object') {
    requestParams.response_format = { type: 'json_object' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || config.plannerTimeoutMs);

  try {
    const response = await client.chat.completions.create(requestParams, {
      signal: controller.signal as AbortSignal,
    });

    const content = response.choices[0]?.message?.content || '';
    const tokensUsed = response.usage?.total_tokens || 0;
    const finishReason = response.choices[0]?.finish_reason || null;

    const durationMs = Date.now() - started;
    const taskId = options.taskId || 'OPENAI';
    log(taskId, `OpenAI call: model=${model} tokens=${tokensUsed} duration=${durationMs}ms finish=${finishReason}`);

    return { content, model, tokensUsed, durationMs, finishReason };
  } catch (error: unknown) {
    const durationMs = Date.now() - started;
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes('404') || msg.includes('model_not_found') || msg.includes('does not exist')) {
      throw new Error(`OPENAI_MODEL_UNAVAILABLE: Model "${model}" is not available. ${msg}`);
    }
    if (msg.includes('401') || msg.includes('Incorrect API key')) {
      throw new Error(`OPENAI_AUTH_ERROR: Invalid API key. ${msg}`);
    }
    if (msg.includes('429') || msg.includes('rate_limit')) {
      throw new Error(`OPENAI_RATE_LIMITED: Rate limited. ${msg}`);
    }
    if (msg.includes('AbortError') || msg.includes('timed out')) {
      throw new Error(`OPENAI_TIMEOUT: Request timed out after ${durationMs}ms.`);
    }
    throw new Error(`OPENAI_ERROR: ${msg}`);
  } finally {
    clearTimeout(timeout);
  }
}

export function parseJSON<T>(text: string, taskId: string): T {
  // Strip ANSI escape codes
  const clean = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  // Try full parse
  try { return JSON.parse(clean); } catch { /* continue */ }
  // Try extracting JSON object
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(clean.slice(start, end + 1)); } catch { /* continue */ }
  }
  // Try array
  const aStart = clean.indexOf('[');
  const aEnd = clean.lastIndexOf(']');
  if (aStart >= 0 && aEnd > aStart) {
    try { return JSON.parse(clean.slice(aStart, aEnd + 1)); } catch { /* continue */ }
  }
  throw new Error(`REVIEW_INVALID_JSON: Could not parse JSON from OpenAI response for ${taskId}. Raw length: ${text.length}`);
}