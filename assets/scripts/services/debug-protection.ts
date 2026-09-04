/**
 * DebugProtection — prevent debug service from running in production.
 *
 * Strategies:
 *   1. Hard disable: DebugService methods throw in production
 *   2. Tree-shake marker: `__DEBUG__` constant that bundlers can strip
 *   3. Guard: check environment before allowing debug operations
 *
 * Usage:
 *   const guard = new DebugProtection({ isProduction: true });
 *   guard.guard(); // Throws if isProduction is true
 */

export interface DebugProtectionOptions {
  /** Whether the game is running in production mode. Default: false. */
  readonly isProduction?: boolean;
  /** Custom environment check. If returns true, debug is blocked. */
  readonly environmentCheck?: () => boolean;
}

export class DebugProtection {
  private readonly isProduction: boolean;
  private readonly environmentCheck?: () => boolean;

  public constructor(options: DebugProtectionOptions = {}) {
    this.isProduction = options.isProduction ?? false;
    this.environmentCheck = options.environmentCheck;
  }

  /**
   * Guard a debug operation. Throws if running in production.
   * Call at the start of every DebugService method.
   */
  public guard(): void {
    if (this.isProduction) {
      throw new Error('DebugService: operation blocked in production');
    }
    if (this.environmentCheck?.()) {
      throw new Error('DebugService: operation blocked by environment check');
    }
  }

  /**
   * Check if debug operations are allowed (non-throwing version).
   */
  public isAllowed(): boolean {
    return !this.isProduction && !(this.environmentCheck?.() ?? false);
  }

  /**
   * Wrap a debug function with production guard.
   * Returns a function that throws in production, calls the original otherwise.
   */
  public wrap<T extends (...args: unknown[]) => unknown>(fn: T): T {
    return ((...args: unknown[]) => {
      this.guard();
      return fn(...args);
    }) as T;
  }
}

/**
 * Global debug flag. Bundlers can replace this with `false` for production
 * builds, allowing tree-shaking of debug-only code paths.
 *
 * In Cocos Creator, this can be set via a build-time define:
 *   cc.macro.DEBUG = false  (release builds)
 */
export const __DEBUG__ = typeof globalThis !== 'undefined'
  ? (globalThis as Record<string, unknown>).__DEBUG__ !== false
  : true;

/**
 * Create a DebugProtection instance based on the global __DEBUG__ flag.
 */
export function createDebugProtection(): DebugProtection {
  return new DebugProtection({ isProduction: !__DEBUG__ });
}