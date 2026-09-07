import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrashRecoveryService } from './crash-recovery.js';
import { TaskStatus, TaskRunStatus } from '@buildpilot/domain';

describe('CrashRecoveryService (Phase 12: Durability & Crash Recovery)', () => {
  let mockTaskRunRepo: any;
  let mockTaskRepo: any;
  let mockEventRepo: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockTaskRunRepo = {
      findStalledRuns: vi.fn(),
      markFailed: vi.fn().mockResolvedValue({ status: TaskRunStatus.FAILED }),
    };

    mockTaskRepo = {
      findById: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue({ status: TaskStatus.TIMED_OUT }),
    };

    mockEventRepo = {
      create: vi.fn().mockResolvedValue({ _id: 'evt_crash_1' }),
    };
  });

  it('detects and safely recovers stalled runs with checkpoints', async () => {
    const expiredDate = new Date(Date.now() - 100000);
    const mockStalledRuns = [
      {
        _id: 'run_crash_1',
        taskId: 'task_crash_1',
        status: TaskRunStatus.RUNNING,
        checkpoint: {
          stage: 'DEVELOPMENT',
          stepIndex: 12,
          summary: 'Editing calculator.ts',
        },
        heartbeat: {
          workerId: 'worker-dead-pid-999',
          lastHeartbeatAt: expiredDate,
          leaseExpiresAt: expiredDate,
        },
      },
    ];

    mockTaskRunRepo.findStalledRuns.mockResolvedValueOnce(mockStalledRuns);
    mockTaskRepo.findById.mockResolvedValueOnce({
      _id: 'task_crash_1',
      status: TaskStatus.DEVELOPMENT,
    });

    const recoveryService = new CrashRecoveryService({
      taskRunRepo: mockTaskRunRepo,
      taskRepo: mockTaskRepo,
      eventRepo: mockEventRepo,
      maxStalledLeaseMs: 30000,
    });

    const summary = await recoveryService.recoverStalledRuns();

    expect(summary.recoveredCount).toBe(1);
    expect(summary.timedOutCount).toBe(1);
    expect(summary.processedRunIds).toContain('run_crash_1');

    // TaskRun marked as failed with diagnostic message
    expect(mockTaskRunRepo.markFailed).toHaveBeenCalledWith(
      'run_crash_1',
      expect.stringContaining("stage 'DEVELOPMENT' (step 12)"),
    );

    // Event persisted
    expect(mockEventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task_crash_1',
        runId: 'run_crash_1',
        type: 'WORKER_CRASH_DETECTED',
        payload: expect.objectContaining({
          lastStage: 'DEVELOPMENT',
          lastStepIndex: 12,
        }),
      }),
    );

    // Task status transitioned to TIMED_OUT
    expect(mockTaskRepo.updateStatus).toHaveBeenCalledWith('task_crash_1', TaskStatus.TIMED_OUT);
  });

  it('returns zero recovered when no runs are stalled', async () => {
    mockTaskRunRepo.findStalledRuns.mockResolvedValueOnce([]);

    const recoveryService = new CrashRecoveryService({
      taskRunRepo: mockTaskRunRepo,
      taskRepo: mockTaskRepo,
      eventRepo: mockEventRepo,
    });

    const summary = await recoveryService.recoverStalledRuns();

    expect(summary.recoveredCount).toBe(0);
    expect(summary.timedOutCount).toBe(0);
    expect(summary.processedRunIds).toEqual([]);
    expect(mockTaskRunRepo.markFailed).not.toHaveBeenCalled();
  });
});
