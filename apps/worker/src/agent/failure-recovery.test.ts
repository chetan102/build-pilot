import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff, LoopDetector, isRetryableError } from './failure-recovery.js';
import { RateLimitError, AuthError, ProviderUnavailableError } from '@buildpilot/llm';

describe('Failure Recovery: retryWithBackoff & LoopDetector', () => {
  describe('isRetryableError', () => {
    it('identifies retryable LLM errors correctly', () => {
      expect(isRetryableError(new RateLimitError('Rate limited'))).toBe(true);
      expect(isRetryableError(new ProviderUnavailableError('503 Service Unavailable'))).toBe(true);
      expect(isRetryableError(new AuthError('Invalid API Key'))).toBe(false);
      expect(isRetryableError(new Error('fetch failed: ECONNRESET'))).toBe(true);
      expect(isRetryableError(new Error('SyntaxError: unexpected token'))).toBe(false);
    });
  });

  describe('retryWithBackoff', () => {
    it('resolves on first attempt if operation succeeds', async () => {
      const op = vi.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(op);
      expect(result).toBe('success');
      expect(op).toHaveBeenCalledTimes(1);
    });

    it('retries transient failures and succeeds on subsequent attempt', async () => {
      let attempts = 0;
      const op = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new RateLimitError('429 Too Many Requests');
        }
        return 'recovered';
      });

      const onRetry = vi.fn();
      const result = await retryWithBackoff(op, {
        maxRetries: 3,
        initialDelayMs: 10,
        backoffFactor: 2,
        onRetry,
      });

      expect(result).toBe('recovered');
      expect(op).toHaveBeenCalledTimes(3);
      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, 10, expect.any(RateLimitError));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, 20, expect.any(RateLimitError));
    });

    it('throws immediately on non-retryable error without retrying', async () => {
      const op = vi.fn().mockRejectedValue(new AuthError('401 Unauthorized'));
      const onRetry = vi.fn();

      await expect(
        retryWithBackoff(op, {
          maxRetries: 3,
          initialDelayMs: 10,
          onRetry,
        }),
      ).rejects.toThrow('401 Unauthorized');

      expect(op).toHaveBeenCalledTimes(1);
      expect(onRetry).not.toHaveBeenCalled();
    });

    it('throws when max retries are exhausted', async () => {
      const op = vi.fn().mockRejectedValue(new RateLimitError('Persistent rate limit'));
      const onRetry = vi.fn();

      await expect(
        retryWithBackoff(op, {
          maxRetries: 2,
          initialDelayMs: 5,
          onRetry,
        }),
      ).rejects.toThrow('Persistent rate limit');

      expect(op).toHaveBeenCalledTimes(3); // Initial attempt + 2 retries
      expect(onRetry).toHaveBeenCalledTimes(2);
    });
  });

  describe('LoopDetector', () => {
    it('tracks successful calls and resets failure state', () => {
      const detector = new LoopDetector();
      const res1 = detector.recordCall('read_file', { path: 'a.txt' }, false);
      expect(res1.count).toBe(1);

      const res2 = detector.recordCall('read_file', { path: 'a.txt' }, true);
      expect(res2.count).toBe(0);
      expect(res2.isLoop).toBe(false);
    });

    it('triggers warning at 1 failure and loop termination at 2 consecutive failures by default', () => {
      const detector = new LoopDetector();
      const res1 = detector.recordCall('run_cmd', { cmd: 'npm test' }, false);
      expect(res1.shouldWarn).toBe(true);
      expect(res1.isLoop).toBe(false);
      expect(res1.count).toBe(1);

      const res2 = detector.recordCall('run_cmd', { cmd: 'npm test' }, false);
      expect(res2.isLoop).toBe(true);
      expect(res2.count).toBe(2);
    });

    it('respects custom warning and loop thresholds', () => {
      const detector = new LoopDetector({ warningThreshold: 3, maxConsecutiveIdenticalFailures: 5 });
      for (let i = 0; i < 4; i++) {
        detector.recordCall('run_cmd', { cmd: 'broken' }, false);
      }
      const res5 = detector.recordCall('run_cmd', { cmd: 'broken' }, false);

      expect(res5.isLoop).toBe(true);
      expect(res5.count).toBe(5);
    });
  });
});
