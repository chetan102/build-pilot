import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerService, createWorkerService } from './worker.js';
import { LLMProviderType, TaskStatus, TaskRunStatus } from '@buildpilot/domain';

describe('WorkerService Lifecycle & Job Processing', () => {
  let mockTaskRepo: any;
  let mockTaskRunRepo: any;
  let mockEventRepo: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockTaskRepo = {
      findById: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue({ _id: '6a9cf2425d9b845db6781a18', status: TaskStatus.COMPLETED }),
    };

    mockTaskRunRepo = {
      findById: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((data) => Promise.resolve({ _id: data._id || '6a9cf2425d9b845db6781a19', ...data })),
      markStarted: vi.fn().mockResolvedValue({ status: TaskRunStatus.RUNNING }),
      markCompleted: vi.fn().mockResolvedValue({ status: TaskRunStatus.COMPLETED }),
      markFailed: vi.fn().mockResolvedValue({ status: TaskRunStatus.FAILED }),
    };

    mockEventRepo = {
      create: vi.fn().mockImplementation((data) => Promise.resolve({ _id: 'evt_1', ...data })),
      listByTask: vi.fn().mockResolvedValue([]),
      listByRun: vi.fn().mockResolvedValue([]),
    };
  });

  it('instantiates WorkerService with default and custom options', () => {
    const defaultService = createWorkerService();
    expect(defaultService).toBeInstanceOf(WorkerService);

    const customService = createWorkerService({
      concurrency: 10,
      taskRepository: mockTaskRepo,
      taskRunRepository: mockTaskRunRepo,
      eventRepository: mockEventRepo,
    });
    expect(customService).toBeInstanceOf(WorkerService);
  });

  it('processes a strongly typed engineering task job successfully through complete lifecycle', async () => {
    const service = createWorkerService({
      taskRepository: mockTaskRepo,
      taskRunRepository: mockTaskRunRepo,
      eventRepository: mockEventRepo,
      jobExecutor: vi.fn().mockResolvedValue({ success: true }),
    });

    const mockJob = {
      id: '6a9cf2425d9b845db6781a18__6a9cf2425d9b845db6781a19',
      attemptsMade: 0,
      opts: { attempts: 3 },
      data: {
        taskId: '6a9cf2425d9b845db6781a18',
        runId: '6a9cf2425d9b845db6781a19',
        projectId: '6a9cf1f85d9b845db6781a0b',
        repositoryId: 'repo_99',
        issueNumber: 15,
        title: 'Fix issue in auth token',
        description: 'Detail description',
        branch: 'buildpilot/task-15-auth',
        baseBranch: 'main',
        provider: LLMProviderType.OPENROUTER,
        model: 'anthropic/claude-3.5-sonnet',
        maxSteps: 30,
        metadata: {},
        correlationId: 'req_test_123',
      },
    } as any;

    const result = await service.processJob(mockJob);

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('6a9cf2425d9b845db6781a18');
    expect(result.runId).toBe('6a9cf2425d9b845db6781a19');
    expect(result.durationMs).toBeDefined();

    // 1. TaskRun created with RUNNING status
    expect(mockTaskRunRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: '6a9cf2425d9b845db6781a19',
        taskId: '6a9cf2425d9b845db6781a18',
        status: TaskRunStatus.RUNNING,
        branch: 'buildpilot/task-15-auth',
        provider: LLMProviderType.OPENROUTER,
        model: 'anthropic/claude-3.5-sonnet',
        maxSteps: 30,
      }),
    );

    // 2. Task transitioned to PLANNING
    expect(mockTaskRepo.updateStatus).toHaveBeenCalledWith(
      '6a9cf2425d9b845db6781a18',
      TaskStatus.PLANNING,
      { activeRunId: '6a9cf2425d9b845db6781a19' },
    );

    // 3. TASK_RUN_STARTED event recorded
    expect(mockEventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: '6a9cf2425d9b845db6781a18',
        runId: '6a9cf2425d9b845db6781a19',
        type: 'TASK_RUN_STARTED',
        level: 'info',
      }),
    );

    // 4. TaskRun marked COMPLETED
    expect(mockTaskRunRepo.markCompleted).toHaveBeenCalledWith(
      '6a9cf2425d9b845db6781a19',
      expect.any(Number),
    );

    // 5. Task transitioned to COMPLETED
    expect(mockTaskRepo.updateStatus).toHaveBeenCalledWith(
      '6a9cf2425d9b845db6781a18',
      TaskStatus.COMPLETED,
      { completedRunId: '6a9cf2425d9b845db6781a19' },
    );

    // 6. TASK_RUN_COMPLETED event recorded
    expect(mockEventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: '6a9cf2425d9b845db6781a18',
        runId: '6a9cf2425d9b845db6781a19',
        type: 'TASK_RUN_COMPLETED',
        level: 'info',
      }),
    );
  });

  it('marks started on existing TaskRun if already in database', async () => {
    mockTaskRunRepo.findById.mockResolvedValueOnce({
      _id: '6a9cf2425d9b845db6781a19',
      taskId: '6a9cf2425d9b845db6781a18',
      status: TaskRunStatus.PENDING,
    });

    const service = createWorkerService({
      taskRepository: mockTaskRepo,
      taskRunRepository: mockTaskRunRepo,
      eventRepository: mockEventRepo,
      jobExecutor: vi.fn().mockResolvedValue({ success: true }),
    });

    const mockJob = {
      id: '6a9cf2425d9b845db6781a18__6a9cf2425d9b845db6781a19',
      attemptsMade: 0,
      opts: { attempts: 3 },
      data: {
        taskId: '6a9cf2425d9b845db6781a18',
        runId: '6a9cf2425d9b845db6781a19',
        projectId: 'proj_1',
        repositoryId: 'repo_1',
        issueNumber: 1,
        title: 'Task title',
        branch: 'bp/branch',
        provider: LLMProviderType.OPENROUTER,
        model: 'model',
      },
    } as any;

    await service.processJob(mockJob);

    expect(mockTaskRunRepo.markStarted).toHaveBeenCalledWith('6a9cf2425d9b845db6781a19', expect.any(Date));
    expect(mockTaskRunRepo.create).not.toHaveBeenCalled();
  });

  it('executes custom job executor when provided', async () => {
    const mockExecutor = vi.fn().mockResolvedValue({
      success: true,
      output: { filesModified: ['src/index.ts'] },
    });

    const service = createWorkerService({
      taskRepository: mockTaskRepo,
      taskRunRepository: mockTaskRunRepo,
      eventRepository: mockEventRepo,
      jobExecutor: mockExecutor,
    });

    const mockJob = {
      id: 'job_1',
      attemptsMade: 0,
      opts: { attempts: 3 },
      data: {
        taskId: '6a9cf2425d9b845db6781a18',
        runId: '6a9cf2425d9b845db6781a19',
        projectId: 'proj_1',
        repositoryId: 'repo_1',
        issueNumber: 1,
        title: 'Task title',
        branch: 'bp/branch',
      },
    } as any;

    const res = await service.processJob(mockJob);

    expect(res.success).toBe(true);
    expect(res.output).toEqual({ filesModified: ['src/index.ts'] });
    expect(mockExecutor).toHaveBeenCalledTimes(1);
  });

  it('handles execution failure on non-terminal attempt (does not mark Task as FAILED)', async () => {
    const failingExecutor = vi.fn().mockRejectedValue(new Error('LLM rate limit reached'));

    const service = createWorkerService({
      taskRepository: mockTaskRepo,
      taskRunRepository: mockTaskRunRepo,
      eventRepository: mockEventRepo,
      jobExecutor: failingExecutor,
    });

    const mockJob = {
      id: 'job_attempt_1',
      attemptsMade: 0, // 1st attempt out of 3
      opts: { attempts: 3 },
      data: {
        taskId: '6a9cf2425d9b845db6781a18',
        runId: '6a9cf2425d9b845db6781a19',
        projectId: 'proj_1',
        repositoryId: 'repo_1',
        issueNumber: 1,
        title: 'Task title',
        branch: 'bp/branch',
      },
    } as any;

    await expect(service.processJob(mockJob)).rejects.toThrow('LLM rate limit reached');

    // TaskRun marked FAILED
    expect(mockTaskRunRepo.markFailed).toHaveBeenCalledWith(
      '6a9cf2425d9b845db6781a19',
      'LLM rate limit reached',
      expect.any(Number),
    );

    // TASK_RUN_FAILED event recorded
    expect(mockEventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: '6a9cf2425d9b845db6781a18',
        runId: '6a9cf2425d9b845db6781a19',
        type: 'TASK_RUN_FAILED',
        level: 'error',
      }),
    );

    // Task status should NOT be set to FAILED since retry attempts remain
    expect(mockTaskRepo.updateStatus).not.toHaveBeenCalledWith(
      '6a9cf2425d9b845db6781a18',
      TaskStatus.FAILED,
    );
  });

  it('marks Task as FAILED when maximum attempts are exhausted', async () => {
    const failingExecutor = vi.fn().mockRejectedValue(new Error('Permanent compile failure'));

    const service = createWorkerService({
      taskRepository: mockTaskRepo,
      taskRunRepository: mockTaskRunRepo,
      eventRepository: mockEventRepo,
      jobExecutor: failingExecutor,
    });

    const mockJob = {
      id: 'job_attempt_3',
      attemptsMade: 2, // 3rd and final attempt (attemptsMade = 2, total = 3)
      opts: { attempts: 3 },
      data: {
        taskId: '6a9cf2425d9b845db6781a18',
        runId: '6a9cf2425d9b845db6781a19',
        projectId: 'proj_1',
        repositoryId: 'repo_1',
        issueNumber: 1,
        title: 'Task title',
        branch: 'bp/branch',
      },
    } as any;

    await expect(service.processJob(mockJob)).rejects.toThrow('Permanent compile failure');

    // Task status SHOULD now be transitioned to FAILED
    expect(mockTaskRepo.updateStatus).toHaveBeenCalledWith(
      '6a9cf2425d9b845db6781a18',
      TaskStatus.FAILED,
    );
  });

  it('starts and stops gracefully', async () => {
    const service = createWorkerService();
    await service.stop();
    expect(service.getWorkerManager()).toBeNull();
  });
});
