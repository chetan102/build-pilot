import { LLMError } from '@buildpilot/llm';
import { createLogger, Logger } from '@buildpilot/observability';

const defaultLogger = createLogger({ serviceName: 'failure-recovery' });

// ---------------------------------------------------------------------------
// Fatal tool result detection
// ---------------------------------------------------------------------------

export interface ToolResultAnalysis {
  isFatal: boolean;
  reason: string;
}

/**
 * String patterns in stdout/stderr/error that indicate an unrecoverable quota or authentication error.
 * Any match triggers immediate task failure — no retries.
 */
const FATAL_OUTPUT_PATTERNS = [
  'invalid api key',
  'authentication failed',
  'insufficient_quota',
  'out of credits',
  'free-models-per-day',
  'add credits',
  'unlock 1000',
  'no ai api key',
];

/**
 * Classifies a tool's result as fatal or non-fatal.
 *
 * Fatal results trigger immediate task FAILED when API keys/quotas are exhausted.
 * Regular tool execution failures (e.g. exit code 1 or 127, missing binaries)
 * are returned to the model as feedback so the agent can adapt gracefully.
 */
export function analyzeToolResult(toolName: string, result: unknown): ToolResultAnalysis {
  if (!result || typeof result !== 'object') return { isFatal: false, reason: '' };

  const r = result as Record<string, any>;

  // Check all text fields for fatal auth/quota patterns
  const combined = [r.stderr, r.stdout, r.error, r.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const pattern of FATAL_OUTPUT_PATTERNS) {
    if (combined.includes(pattern.toLowerCase())) {
      return {
        isFatal: true,
        reason: `Tool '${toolName}' hit unrecoverable condition: "${pattern}"`,
      };
    }
  }

  return { isFatal: false, reason: '' };
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  maxDelayMs?: number;
  logger?: Logger;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof LLMError) {
    return error.retryable;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('free-models-per-day') ||
      msg.includes('insufficient_quota') ||
      msg.includes('exceeded your current quota') ||
      msg.includes('credit balance') ||
      msg.includes('add credits') ||
      msg.includes('out of credits') ||
      msg.includes('unlock 1000') ||
      msg.includes('invalid api key') ||
      msg.includes('authentication failed') ||
      msg.includes('no ai api key')
    ) {
      return false;
    }
    return (
      msg.includes('rate limit') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('fetch failed') ||
      msg.includes('timeout') ||
      msg.includes('429') ||
      msg.includes('503') ||
      msg.includes('502') ||
      msg.includes('500')
    );
  }
  return false;
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 1;
  const initialDelayMs = options.initialDelayMs ?? 500;
  const backoffFactor = options.backoffFactor ?? 2;
  const maxDelayMs = options.maxDelayMs ?? 10000;
  const shouldRetry = options.shouldRetry ?? isRetryableError;
  const logger = options.logger ?? defaultLogger;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      if (attempt > maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const currentDelay = Math.min(delay, maxDelayMs);
      logger.warn(
        { attempt, maxRetries, delayMs: currentDelay, error: error instanceof Error ? error.message : error },
        'Transient error encountered, executing exponential backoff retry',
      );

      if (options.onRetry) {
        options.onRetry(attempt, currentDelay, error);
      }

      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      delay *= backoffFactor;
    }
  }
}

export class LoopDetector {
  private callHistory: string[] = [];
  private failureHistory: Map<string, number> = new Map();
  private maxConsecutiveIdenticalFailures: number;
  private warningThreshold: number;

  constructor(options: { warningThreshold?: number; maxConsecutiveIdenticalFailures?: number } = {}) {
    this.warningThreshold = options.warningThreshold ?? 1;
    this.maxConsecutiveIdenticalFailures = options.maxConsecutiveIdenticalFailures ?? 2;
  }

  private createFingerprint(name: string, args: unknown): string {
    if (args && typeof args === 'object') {
      const a = args as Record<string, any>;
      if (a.path) {
        return `${name}::path=${a.path}`;
      }
      if (a.command) {
        return `${name}::cmd=${a.command}`;
      }
      if (a.query) {
        return `${name}::query=${a.query}`;
      }
    }
    const serializedArgs = typeof args === 'object' ? JSON.stringify(args) : String(args);
    return `${name}::${serializedArgs.slice(0, 100)}`;
  }

  recordCall(name: string, args: unknown, success: boolean): { isLoop: boolean; shouldWarn: boolean; count: number; reason?: string } {
    const key = this.createFingerprint(name, args);
    this.callHistory.push(key);

    // 1. Check failure loop
    if (!success) {
      const currentCount = (this.failureHistory.get(key) || 0) + 1;
      this.failureHistory.set(key, currentCount);
      const shouldWarn = currentCount === this.warningThreshold;
      const isLoop = currentCount >= this.maxConsecutiveIdenticalFailures;
      return { isLoop, shouldWarn, count: currentCount, reason: `Repeated tool failure (${currentCount} times)` };
    } else {
      this.failureHistory.delete(key);
    }

    // 2. Check identical action repetition (e.g. calling same action 3+ times in recent history)
    const recent = this.callHistory.slice(-8);
    const occurrences = recent.filter((k) => k === key).length;
    if (occurrences >= 3) {
      return { isLoop: true, shouldWarn: true, count: occurrences, reason: `Repeated identical action '${key}' detected ${occurrences} times` };
    }

    // 3. Check cyclical pattern of period 2, 3, or 4 (e.g. [A, B, C, A, B, C])
    const n = this.callHistory.length;
    for (const period of [2, 3, 4]) {
      if (n >= period * 2) {
        const cycle1 = this.callHistory.slice(n - period * 2, n - period);
        const cycle2 = this.callHistory.slice(n - period);
        const isMatch = cycle1.every((item, idx) => item === cycle2[idx]);
        if (isMatch) {
          if (n >= period * 3) {
            const cycle0 = this.callHistory.slice(n - period * 3, n - period * 2);
            if (cycle0.every((item, idx) => item === cycle2[idx])) {
              return { isLoop: true, shouldWarn: true, count: 3, reason: `Cyclical loop pattern of length ${period} detected repeating 3 times: [${cycle2.join(' -> ')}]` };
            }
          }
          return { isLoop: false, shouldWarn: true, count: 2, reason: `Cyclical pattern of length ${period} detected repeating: [${cycle2.join(' -> ')}]` };
        }
      }
    }

    return { isLoop: false, shouldWarn: false, count: 0 };
  }

  reset(): void {
    this.failureHistory.clear();
    this.callHistory = [];
  }
}
