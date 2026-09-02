/**
 * SecretRedactor — Detects and redacts secrets from text content.
 * Used to prevent API keys, tokens, passwords from being sent to OpenAI or logged.
 */

const SECRET_PATTERNS: RegExp[] = [
  // API keys and tokens
  /(api[_-]?key|apikey)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}["']?/gi,
  /(token|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9_\-\.]{20,}["']?/gi,
  /(password|passwd|pwd)\s*[:=]\s*["']?[^\s"']{8,}["']?/gi,
  /(secret|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}["']?/gi,
  /(cookie|session[_-]?id)\s*[:=]\s*["']?[A-Za-z0-9_\-\.]{20,}["']?/gi,
  // Bearer tokens
  /Bearer\s+[A-Za-z0-9_\-\.]{20,}/gi,
  // Private key markers
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE\s+KEY-----/gi,
  // Common env var patterns
  /OPENAI_API_KEY\s*=\s*[A-Za-z0-9_\-]{20,}/gi,
  /CURSOR_API_KEY\s*=\s*[A-Za-z0-9_\-]{20,}/gi,
  // Connection strings
  /mongodb(?:\+srv)?:\/\/[^\s"']+/gi,
  /mysql:\/\/[^\s"']+/gi,
  /postgres(?:ql)?:\/\/[^\s"']+/gi,
  /redis:\/\/[^\s"']+/gi,
  // AWS-like keys
  /AKIA[0-9A-Z]{16}/g,
  // Generic hex secrets (32+ hex chars after key name)
  /(?:key|secret|token|password|credential)\s*[:=]\s*["']?[0-9a-fA-F]{32,}["']?/gi,
];

/**
 * Redact secrets from a string, replacing them with [REDACTED].
 */
export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match) => {
      // Preserve the key name if possible
      const eqIdx = match.indexOf('=');
      const colonIdx = match.indexOf(':');
      const sepIdx = eqIdx >= 0 ? eqIdx : colonIdx;
      if (sepIdx >= 0) {
        return match.slice(0, sepIdx + 1) + ' [REDACTED]';
      }
      return '[REDACTED]';
    });
  }
  return result;
}

/**
 * Check if text contains what appears to be a secret.
 * Returns list of detected secret type descriptions.
 */
export function detectSecrets(text: string): string[] {
  const found: string[] = [];
  for (let i = 0; i < SECRET_PATTERNS.length; i++) {
    const pattern = SECRET_PATTERNS[i];
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      found.push(`secret-pattern-${i + 1}`);
      pattern.lastIndex = 0; // reset for next caller
    }
  }
  return found;
}

/**
 * Check a git diff for secrets. Returns findings with severity.
 */
export function checkDiffForSecrets(diff: string): { hasSecret: boolean; findings: string[] } {
  const findings = detectSecrets(diff);
  return { hasSecret: findings.length > 0, findings };
}