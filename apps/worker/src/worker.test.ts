import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerService, createWorkerService } from './worker.js';
import { LLMProviderType } from '@buildpilot/domain';

describe('WorkerService Lifecycle & Job Processing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('instantiates WorkerService with default options', () => {
    const service = createWorkerService();
    expect(service).toBeInstanceOf(WorkerService);
  });

  it('processes a strongly typed engineering task job payload', async () => {
    const service = createWorkerService();

    const mockJob = {
      id: 'task_123:run_456',
      attemptsMade: 0,
      data: {
        taskId: 'task_123',
        runId: 'run_456',
        projectId: 'proj_789',
        repositoryId: 'repo_99',
        issueNumber: 15,
        title: 'Fix issue in auth token',
        description: 'Detail',
        branch: 'buildpilot/task-15-auth',
        baseBranch: 'main',
        provider: LLMProviderType.OPENROUTER,
        model: 'anthropic/claude-3.5-sonnet',
        maxSteps: 30,
        metadata: {},
      },
    } as any;

    const result = await service.processJob(mockJob);

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task_123');
    expect(result.runId).toBe('run_456');
  });

  it('starts and stops gracefully', async () => {
    const service = createWorkerService();
    await service.stop();
    expect(service.getWorkerManager()).toBeNull();
  });
});
