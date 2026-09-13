import { LLMError } from '@buildpilot/llm';
import { createLogger, Logger } from '@buildpilot/observability';

const defaultLogger = createLogger({ serviceName: 'failure-recovery' });

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
