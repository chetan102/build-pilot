import { describe, it, expect } from 'vitest';
import {
  TaskStatus,
  TaskStatusSchema,
  ToolPermissionClass,
  ToolPermissionClassSchema,
  TaskRunStatus,
  ApprovalStatus,
  ArtifactType,
  LLMProviderType,
  TaskSchema,
  CreateTaskInputSchema,
  ToolCallSchema,
  ApprovalSchema,
  PullRequestSchema,
  DomainError,
  InvalidStateTransitionError,
  EntityNotFoundError,
  PermissionDeniedError,
} from './index.js';

describe('Domain Enums and Schemas', () => {
  it('validates TaskStatus enum values', () => {
    expect(TaskStatus.QUEUED).toBe('QUEUED');
    expect(TaskStatus.PLANNING).toBe('PLANNING');
    expect(TaskStatus.DEVELOPMENT).toBe('DEVELOPMENT');
    expect(TaskStatus.TESTING).toBe('TESTING');
    expect(TaskStatus.COMPLETED).toBe('COMPLETED');
    expect(TaskStatus.FAILED).toBe('FAILED');
    expect(TaskStatus.AWAITING_APPROVAL).toBe('AWAITING_APPROVAL');

    expect(TaskStatusSchema.safeParse('QUEUED').success).toBe(true);
    expect(TaskStatusSchema.safeParse('INVALID_STATUS').success).toBe(false);
  });

  it('validates ToolPermissionClass', () => {
    expect(ToolPermissionClass.READ_ONLY).toBe('READ_ONLY');
    expect(ToolPermissionClass.SAFE_WRITE).toBe('SAFE_WRITE');
    expect(ToolPermissionClass.EXTERNAL_WRITE).toBe('EXTERNAL_WRITE');
    expect(ToolPermissionClass.HIGH_RISK).toBe('HIGH_RISK');

    expect(ToolPermissionClassSchema.safeParse('SAFE_WRITE').success).toBe(true);
    expect(ToolPermissionClassSchema.safeParse('UNSAFE').success).toBe(false);
  });

  it('validates LLMProviderType, TaskRunStatus, and ArtifactType', () => {
    expect(LLMProviderType.OPENROUTER).toBe('OPENROUTER');
    expect(LLMProviderType.GEMINI).toBe('GEMINI');
    expect(LLMProviderType.OPENAI).toBe('OPENAI');
    expect(LLMProviderType.ANTHROPIC).toBe('ANTHROPIC');

    expect(TaskRunStatus.RUNNING).toBe('RUNNING');
    expect(ArtifactType.PATCH).toBe('PATCH');
  });
});

describe('Domain Models & Zod Schemas', () => {
  it('validates TaskSchema correctly', () => {
    const task = {
      id: 'task_1',
      createdAt: new Date(),
      updatedAt: new Date(),
      projectId: 'proj_1',
      repositoryId: 'repo_1',
      issueNumber: 1,
      title: 'Fix issue',
      description: 'Desc',
      status: TaskStatus.QUEUED,
      branch: 'bp/issue-1',
      baseBranch: 'main',
      tags: ['bug'],
    };
    expect(TaskSchema.safeParse(task).success).toBe(true);
  });
  it('validates CreateTaskInputSchema correctly', () => {
    const valid = {
      projectId: 'proj_123',
      repositoryId: 'repo_456',
      issueNumber: 42,
      title: 'Fix authentication cookie expiry',
      description: 'The auth cookie expires too quickly on mobile Safari',
    };
    const parsed = CreateTaskInputSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.baseBranch).toBe('main');
    }

    const invalid = {
      projectId: 'proj_123',
      title: '', // Empty title
    };
    expect(CreateTaskInputSchema.safeParse(invalid).success).toBe(false);
  });

  it('validates ToolCallSchema correctly', () => {
    const toolCall = {
      id: 'tool_1',
      createdAt: new Date(),
      updatedAt: new Date(),
      runId: 'run_1',
      stepId: 'step_1',
      name: 'git_status',
      permissionClass: ToolPermissionClass.READ_ONLY,
      status: 'SUCCESS',
      input: { path: '.' },
      output: { clean: true },
    };
    expect(ToolCallSchema.safeParse(toolCall).success).toBe(true);
  });

  it('validates ApprovalSchema correctly', () => {
    const approval = {
      id: 'appr_1',
      createdAt: new Date(),
      updatedAt: new Date(),
      taskId: 'task_1',
      runId: 'run_1',
      action: 'push_to_protected_branch',
      permissionClass: ToolPermissionClass.HIGH_RISK,
      status: ApprovalStatus.PENDING,
      details: { branch: 'main' },
      requestedBy: 'agent_worker',
    };
    expect(ApprovalSchema.safeParse(approval).success).toBe(true);
  });

  it('validates PullRequestSchema correctly', () => {
    const pr = {
      id: 'pr_1',
      createdAt: new Date(),
      updatedAt: new Date(),
      taskId: 'task_1',
      projectId: 'proj_1',
      repositoryId: 'repo_1',
      githubPrNumber: 101,
      githubPrUrl: 'https://github.com/org/repo/pull/101',
      branch: 'buildpilot/issue-42',
      baseBranch: 'main',
      title: 'feat: add auth timeout fix',
      body: 'Automated PR by BuildPilot',
      status: 'OPEN',
    };
    expect(PullRequestSchema.safeParse(pr).success).toBe(true);
  });
});

describe('Domain Errors', () => {
  it('instantiates and formats DomainError derivatives properly', () => {
    const err = new InvalidStateTransitionError('QUEUED', 'COMPLETED');
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(InvalidStateTransitionError);
    expect(err.code).toBe('INVALID_STATE_TRANSITION');
    expect(err.fromStatus).toBe('QUEUED');
    expect(err.toStatus).toBe('COMPLETED');
    expect(err.message).toContain('Illegal state transition');

    const notFound = new EntityNotFoundError('Task', 'task_999');
    expect(notFound.code).toBe('ENTITY_NOT_FOUND');
    expect(notFound.entityType).toBe('Task');

    const denied = new PermissionDeniedError('delete_database', 'HIGH_RISK');
    expect(denied.code).toBe('PERMISSION_DENIED');
  });
});
