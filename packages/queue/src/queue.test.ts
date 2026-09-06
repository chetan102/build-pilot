import { describe, it, expect, vi } from 'vitest';
import {
  EngineeringTaskJobSchema,
  formatJobId,
  parseJobId,
  DEFAULT_JOB_OPTIONS,
  ENGINEERING_TASK_QUEUE,
  TASK_EXECUTION_JOB,
  DEFAULT_WORKER_CONCURRENCY,
  RedisConnectionManager,
} from './index.js';
import { LLMProviderType } from '@buildpilot/domain';

describe('Queue Schemas & Job Correlation', () => {
  it('validates a correct EngineeringTaskJobPayload', () => {
    const validPayload = {
      taskId: 'task_123',
      runId: 'run_456',
      projectId: 'proj_789',
      repositoryId: 'repo_99',
      issueNumber: 42,
      title: 'Fix edge case in auth token generator',
      description: 'Token expires 1 hour early',
      branch: 'buildpilot/task-42-auth',
      baseBranch: 'main',
      provider: LLMProviderType.OPENROUTER,
      model: 'anthropic/claude-3.5-sonnet',
      maxSteps: 30,
      metadata: { priority: 'high' },
      correlationId: 'req_xyz123',
    };

    const parsed = EngineeringTaskJobSchema.parse(validPayload);
    expect(parsed.taskId).toBe('task_123');
    expect(parsed.runId).toBe('run_456');
    expect(parsed.issueNumber).toBe(42);
    expect(parsed.provider).toBe('OPENROUTER');
  });

  it('rejects payload when required fields are missing', () => {
    expect(() =>
      EngineeringTaskJobSchema.parse({
        taskId: '',
        title: '',
      }),
    ).toThrow();
  });

  it('formats and parses job ID with taskId__runId correlation', () => {
    const taskId = 'task_abc123';
    const runId = 'run_xyz789';

    const jobId = formatJobId(taskId, runId);
    expect(jobId).toBe('task_abc123__run_xyz789');

    const parsed = parseJobId(jobId);
    expect(parsed).not.toBeNull();
    expect(parsed?.taskId).toBe(taskId);
    expect(parsed?.runId).toBe(runId);
  });

  it('returns null when parsing invalid jobId format', () => {
    expect(parseJobId('invalid-job-id-without-delimiter')).toBeNull();
    expect(parseJobId('a__b__c')).toBeNull();
  });
});

describe('Queue Configuration Defaults & Dead-Letter Handling', () => {
  it('defines correct queue name and job execution name', () => {
    expect(ENGINEERING_TASK_QUEUE).toBe('engineering-task');
    expect(TASK_EXECUTION_JOB).toBe('task:execute');
    expect(DEFAULT_WORKER_CONCURRENCY).toBe(5);
  });

  it('configures exponential backoff and dead-letter retention in DEFAULT_JOB_OPTIONS', () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.backoff.type).toBe('exponential');
    expect(DEFAULT_JOB_OPTIONS.backoff.delay).toBe(5000);
    expect(DEFAULT_JOB_OPTIONS.removeOnFail.count).toBe(5000);
    expect(DEFAULT_JOB_OPTIONS.removeOnComplete.count).toBe(1000);
  });
});

describe('Redis Connection Manager Lifecycle & Health Check', () => {
  it('returns unhealthy when client is not initialized', async () => {
    const manager = RedisConnectionManager.getInstance();
    const health = await manager.healthCheck();

    expect(health.status).toBe('unhealthy');
    expect(health.error).toBeDefined();
  });

  it('reports healthy when mock redis responds with PONG', async () => {
    const manager = RedisConnectionManager.getInstance();
    const mockRedis = {
      ping: vi.fn().mockResolvedValue('PONG'),
      status: 'ready',
    } as any;

    const health = await manager.healthCheck(mockRedis);
    expect(health.status).toBe('healthy');
    expect(health.statusString).toBe('ready');
    expect(health.latencyMs).toBeDefined();
  });

  it('reports unhealthy when mock redis throws an error', async () => {
    const manager = RedisConnectionManager.getInstance();
    const mockRedis = {
      ping: vi.fn().mockRejectedValue(new Error('Connection refused')),
      status: 'ready',
    } as any;

    const health = await manager.healthCheck(mockRedis);
    expect(health.status).toBe('unhealthy');
    expect(health.error).toContain('Connection refused');
  });
});
