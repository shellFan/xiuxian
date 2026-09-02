/**
 * Developer Adapter Factory — Returns the appropriate developer provider.
 * Supports: mock, cursor-cli, codex, codebuddy
 */
import { DeveloperAdapter } from '../types';
import { MockAdapter } from './mock-adapter';
import { CursorCliDeveloperProvider } from './cursor-cli-developer-provider';
import { CodexAdapter } from './codex-adapter';
import { CodeBuddyAdapter } from './codebuddy-adapter';
import { config } from '../config';

export function developerAdapter(): DeveloperAdapter {
  switch (config.developerProvider) {
    case 'mock':
      return new MockAdapter();
    case 'cursor-cli':
      return new CursorCliDeveloperProvider();
    case 'codex':
      return new CodexAdapter();
    case 'codebuddy':
      return new CodeBuddyAdapter();
    default:
      // Default to cursor-cli for production, mock for testing
      if (config.developerProvider === 'openai') {
        console.warn('OpenAI is not a developer provider. Falling back to cursor-cli.');
        return new CursorCliDeveloperProvider();
      }
      console.warn(`Unknown developer provider: ${config.developerProvider}. Falling back to mock.`);
      return new MockAdapter();
  }
}