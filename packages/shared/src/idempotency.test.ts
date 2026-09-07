import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdempotencyGuard, MemoryIdempotencyStore } from './idempotency.js';

describe('IdempotencyGuard (Phase 12: Durability & Idempotency)', () => {
  let store: MemoryIdempotencyStore;
  let guard: IdempotencyGuard;

  beforeEach(() => {
    store = new MemoryIdempotencyStore();
    guard = new IdempotencyGuard(store);
  });

  it('allows single execution of idempotent task and blocks duplicate runs', async () => {
    const mockOperation = vi.fn().mockResolvedValue('pr_created_42');

    // First execution succeeds
    const firstResult = await guard.runIdempotent('create_pr:task_1', mockOperation);
    expect(firstResult.executed).toBe(true);
    expect(firstResult.result).toBe('pr_created_42');
    expect(firstResult.duplicate).toBe(false);
    expect(mockOperation).toHaveBeenCalledTimes(1);

    // Second replayed execution is safely blocked as duplicate
    const secondResult = await guard.runIdempotent('create_pr:task_1', mockOperation);
    expect(secondResult.executed).toBe(false);
    expect(secondResult.duplicate).toBe(true);
    expect(mockOperation).toHaveBeenCalledTimes(1); // Not called again!
  });

  it('releases lock if operation throws, allowing retry attempts', async () => {
    const failingOp = vi.fn().mockRejectedValueOnce(new Error('Transient network error'));

    await expect(guard.runIdempotent('webhook:del_123', failingOp)).rejects.toThrow('Transient network error');

    // Lock was released in finally block, so retry succeeds
    const retryOp = vi.fn().mockResolvedValue('recovered');
    const retryResult = await guard.runIdempotent('webhook:del_123', retryOp);

    expect(retryResult.executed).toBe(true);
    expect(retryResult.result).toBe('recovered');
  });
});
