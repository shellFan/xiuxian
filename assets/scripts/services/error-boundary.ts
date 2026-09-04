/**
 * GameErrorBoundary — centralized error handling with classification.
 *
 * Catches, classifies, and reports errors from game services.
 * Errors are categorized into: RECOVERABLE, STORAGE, PLATFORM, REWARD,
 * CONFIG, and FATAL. Each category has a different recovery strategy.
 *
 * Usage:
 *   const boundary = new ErrorBoundary();
 *   boundary.on('error', (e) => { reportToAnalytics(e); });
 *   try { ... } catch (err) { boundary.handle(err, 'STORAGE'); }
 */

export type ErrorCategory = 'RECOVERABLE' | 'STORAGE' | 'PLATFORM' | 'REWARD' | 'CONFIG' | 'FATAL';

export interface GameError {
  readonly category: ErrorCategory;
  readonly message: string;
  readonly originalError?: unknown;
  readonly timestamp: number;
  readonly context?: string;
}

export type ErrorListener = (error: GameError) => void;

export class ErrorBoundary {
  private readonly listeners = new Set<ErrorListener>();
  private readonly errorHistory: GameError[] = [];
  private readonly maxHistory: number;

  public constructor(options?: { maxHistory?: number }) {
    this.maxHistory = options?.maxHistory ?? 50;
  }

  /**
   * Handle an error by classifying it and notifying listeners.
   * Returns the classified GameError for inspection.
   */
  public handle(error: unknown, category: ErrorCategory, context?: string): GameError {
    const gameError: GameError = {
      category,
      message: error instanceof Error ? error.message : String(error),
      originalError: error,
      timestamp: Date.now(),
      context,
    };

    this.errorHistory.push(gameError);
    if (this.errorHistory.length > this.maxHistory) {
      this.errorHistory.shift();
    }

    this.notify(gameError);

    // FATAL errors should not be silently swallowed
    if (category === 'FATAL') {
      console.error(`[GameErrorBoundary] FATAL: ${gameError.message}`, error);
    }

    return gameError;
  }

  /**
   * Wrap an operation with error handling.
   * Returns null on error, result on success.
   */
  public try<T>(fn: () => T, category: ErrorCategory, context?: string): T | null {
    try {
      return fn();
    } catch (error) {
      this.handle(error, category, context);
      return null;
    }
  }

  /**
   * Wrap an async operation with error handling.
   * Returns null on error, result on success.
   */
  public async tryAsync<T>(fn: () => Promise<T>, category: ErrorCategory, context?: string): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      this.handle(error, category, context);
      return null;
    }
  }

  /** Subscribe to error events. Returns unsubscribe function. */
  public onError(listener: ErrorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Get recent error history (readonly copy). */
  public getHistory(): ReadonlyArray<GameError> {
    return [...this.errorHistory];
  }

  /** Get errors by category. */
  public getErrorsByCategory(category: ErrorCategory): ReadonlyArray<GameError> {
    return this.errorHistory.filter(e => e.category === category);
  }

  /** Whether any FATAL errors have occurred. */
  public hasFatalError(): boolean {
    return this.errorHistory.some(e => e.category === 'FATAL');
  }

  /** Clear error history. */
  public clearHistory(): void {
    this.errorHistory.length = 0;
  }

  /** Dispose all listeners. */
  public dispose(): void {
    this.listeners.clear();
    this.errorHistory.length = 0;
  }

  private notify(error: GameError): void {
    for (const listener of this.listeners) {
      try { listener(error); } catch { /* listener errors must not propagate */ }
    }
  }
}

/**
 * Classify an error automatically based on its type/message.
 * Used when the caller doesn't know the category.
 */
export function classifyError(error: unknown): ErrorCategory {
  if (error instanceof TypeError) return 'RECOVERABLE';
  if (error instanceof RangeError) return 'CONFIG';
  if (error instanceof SyntaxError) return 'CONFIG';

  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('storage') || message.includes('localStorage') || message.includes('quota')) {
    return 'STORAGE';
  }
  if (message.includes('platform') || message.includes('wx') || message.includes('wechat')) {
    return 'PLATFORM';
  }
  if (message.includes('reward') || message.includes('ad')) {
    return 'REWARD';
  }
  if (message.includes('config') || message.includes('validation') || message.includes('invalid')) {
    return 'CONFIG';
  }

  return 'RECOVERABLE';
}