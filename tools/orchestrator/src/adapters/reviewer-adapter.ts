/**
 * Reviewer Adapter Factory — Returns the appropriate reviewer provider.
 * Supports: mock, openai, codex
 */
import { ReviewerAdapter } from '../types';
import { MockAdapter } from './mock-adapter';
import { OpenAIReviewerProvider } from './openai-reviewer-provider';
import { CodexAdapter } from './codex-adapter';
import { config } from '../config';

export function reviewerAdapter(): ReviewerAdapter {
  switch (config.reviewerProvider) {
    case 'mock':
      return new MockAdapter();
    case 'openai':
      return new OpenAIReviewerProvider();
    case 'codex':
      return new CodexAdapter();
    default:
      console.warn(`Unknown reviewer provider: ${config.reviewerProvider}. Falling back to mock.`);
      return new MockAdapter();
  }
}