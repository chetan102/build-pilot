import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskHeartbeatSession } from './heartbeat-manager.js';

describe('TaskHeartbeatSession (Phase 12: Durability & Leases)', () => {
  let mockTaskRunRepo: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();

    mockTaskRunRepo = {
      renewHeartbeat: vi.fn().mockResolvedValue({ _id: 'run_123', status: 'RUNNING' }),
      findStalledRuns: vi.fn().mockResolvedValue([]),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('acquires initial lease immediately on start', async () => {
    const session = new TaskHeartbeatSession({
      runId: 'run_123',
      workerId: 'worker-unit-test-1',
      taskRunRepo: mockTaskRunRepo,
      intervalMs: 5000,
      leaseTtlMs: 15000,
    });

    await session.start();

    expect(mockTaskRunRepo.renewHeartbeat).toHaveBeenCalledTimes(1);
    expect(mockTaskRunRepo.renewHeartbeat).toHaveBeenCalledWith('run_123', 'worker-unit-test-1', 15000);

    session.stop();
  });

  it('periodically pulses heartbeat renewals on interval', async () => {
    const session = new TaskHeartbeatSession({
      runId: 'run_123',
      workerId: 'worker-unit-test-1',
      taskRunRepo: mockTaskRunRepo,
      intervalMs: 5000,
      leaseTtlMs: 15000,
    });

    await session.start();
    expect(mockTaskRunRepo.renewHeartbeat).toHaveBeenCalledTimes(1);

    // Fast-forward 5 seconds
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockTaskRunRepo.renewHeartbeat).toHaveBeenCalledTimes(2);

    // Fast-forward another 5 seconds
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockTaskRunRepo.renewHeartbeat).toHaveBeenCalledTimes(3);

    session.stop();

    // Fast-forward after stop, should not trigger any more
    await vi.advanceTimersByTimeAsync(10000);
    expect(mockTaskRunRepo.renewHeartbeat).toHaveBeenCalledTimes(3);
  });
});
