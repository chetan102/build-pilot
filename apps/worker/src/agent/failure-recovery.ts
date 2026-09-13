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
 * Exit codes that indicate the environment is broken — not a transient error.
 * 127 = command not found, 126 = permission denied / not executable.
 */
const FATAL_EXIT_CODES = new Set([127, 126]);

/**
 * String patterns in stdout/stderr that indicate an unrecoverable error.
 * Any match triggers immediate task failure — no retries.
 */
const FATAL_OUTPUT_PATTERNS = [
  'command not found',
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
 * Fatal results trigger immediate task FAILED — no retry, no model panic loop.
 * This prevents the agent from burning tokens searching for a missing binary,
 * or retrying when the API key/quota is exhausted.
 */
export function analyzeToolResult(toolName: string, result: unknown): ToolResultAnalysis {
  if (!result || typeof result !== 'object') return { isFatal: false, reason: '' };

  const r = result as Record<string, any>;

  // exit 127/126 → environment broken, model cannot fix this
  if (typeof r.exitCode === 'number' && FATAL_EXIT_CODES.has(r.exitCode)) {
    const detail = (r.stderr || r.stdout || '').toString().slice(0, 200);
    return {
      isFatal: true,
      reason: `Tool '${toolName}' returned fatal exit code ${r.exitCode}: ${detail}`,
    };
  }

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
  private failureHistory: Map<string, number> = new Map();
  private maxConsecutiveIdenticalFailures: number;
  private warningThreshold: number;

  constructor(options: { warningThreshold?: number; maxConsecutiveIdenticalFailures?: number } = {}) {
    this.warningThreshold = options.warningThreshold ?? 1;
    this.maxConsecutiveIdenticalFailures = options.maxConsecutiveIdenticalFailures ?? 2;
  }

  private createFingerprint(name: string, args: unknown): string {
    const serializedArgs = typeof args === 'object' ? JSON.stringify(args) : String(args);
    return `${name}::${serializedArgs}`;
  }

  recordCall(name: string, args: unknown, success: boolean): { isLoop: boolean; shouldWarn: boolean; count: number } {
    const key = this.createFingerprint(name, args);

    if (success) {
      this.failureHistory.delete(key);
      return { isLoop: false, shouldWarn: false, count: 0 };
    }

    const currentCount = (this.failureHistory.get(key) || 0) + 1;
    this.failureHistory.set(key, currentCount);

    const shouldWarn = currentCount === this.warningThreshold;
    const isLoop = currentCount >= this.maxConsecutiveIdenticalFailures;

    return { isLoop, shouldWarn, count: currentCount };
  }

  reset(): void {
    this.failureHistory.clear();
  }
}
