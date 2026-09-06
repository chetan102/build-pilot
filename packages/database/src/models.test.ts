import { describe, it, expect } from 'vitest';
import {
  UserModel,
  ProjectModel,
  RepositoryModel,
  GitHubInstallationModel,
  ProviderCredentialModel,
  AgentDefinitionModel,
  TaskModel,
  TaskRunModel,
  AgentStepModel,
  ToolCallModel,
  TestRunModel,
  ArtifactModel,
  ApprovalModel,
  PullRequestModel,
  EventModel,
  EvaluationResultModel,
} from './index.js';

describe('Mongoose Models Schema Verification', () => {
  it('instantiates valid UserModel document', () => {
    const user = new UserModel({
      name: 'Alice Engineer',
      email: 'alice@example.com',
      role: 'engineer',
      avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
      githubId: '12345',
    });
    const err = user.validateSync();
    expect(err).toBeUndefined();
    expect(user.role).toBe('engineer');
  });

  it('rejects UserModel with invalid email or missing name', () => {
    const user = new UserModel({});
    const err = user.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors['name']).toBeDefined();
    expect(err?.errors['email']).toBeDefined();
  });

  it('instantiates valid ProjectModel and RepositoryModel documents', () => {
    const project = new ProjectModel({
      name: 'BuildPilot Monorepo',
      slug: 'build-pilot',
      ownerId: 'user_1',
      active: true,
    });
    expect(project.validateSync()).toBeUndefined();
    expect(project.slug).toBe('build-pilot');

    const repo = new RepositoryModel({
      projectId: project._id.toString(),
      githubInstallationId: 998877,
      owner: 'chetan102',
      name: 'build-pilot',
      fullName: 'chetan102/build-pilot',
      defaultBranch: 'main',
      isPrivate: false,
    });
    expect(repo.validateSync()).toBeUndefined();
    expect(repo.defaultBranch).toBe('main');
  });

  it('instantiates valid TaskModel and TaskRunModel with indexes', () => {
    const task = new TaskModel({
      projectId: 'proj_1',
      repositoryId: 'repo_1',
      issueNumber: 42,
      title: 'Fix auth token expiry',
      description: 'Cookie expires prematurely',
      status: 'QUEUED',
      branch: 'bp/issue-42',
      baseBranch: 'main',
      tags: ['bug', 'auth'],
    });
    expect(task.validateSync()).toBeUndefined();
    expect(task.status).toBe('QUEUED');
    expect(task.tags).toContain('bug');

    // Verify indexes exist on TaskModel
    const taskIndexes = TaskModel.schema.indexes();
    expect(taskIndexes.length).toBeGreaterThan(0);

    const taskRun = new TaskRunModel({
      taskId: task._id.toString(),
      status: 'RUNNING',
      branch: 'bp/issue-42',
      provider: 'OPENROUTER',
      model: 'anthropic/claude-3.5-sonnet',
      maxSteps: 30,
      currentStepIndex: 1,
    });
    expect(taskRun.validateSync()).toBeUndefined();
    expect(taskRun.maxSteps).toBe(30);
  });

  it('instantiates AgentStepModel and ToolCallModel with type safety', () => {
    const step = new AgentStepModel({
      runId: 'run_1',
      taskId: 'task_1',
      stage: 'DEVELOPMENT',
      title: 'Modify auth controller',
      thought: 'Need to update cookie maxAge',
      durationMs: 1200,
    });
    expect(step.validateSync()).toBeUndefined();
    expect(step.stage).toBe('DEVELOPMENT');

    const toolCall = new ToolCallModel({
      runId: 'run_1',
      stepId: step._id.toString(),
      name: 'edit_file',
      permissionClass: 'SAFE_WRITE',
      status: 'SUCCESS',
      input: { path: 'src/auth.ts' },
      output: { modified: true },
      durationMs: 340,
    });
    expect(toolCall.validateSync()).toBeUndefined();
    expect(toolCall.permissionClass).toBe('SAFE_WRITE');
  });

  it('instantiates TestRunModel, ArtifactModel, and ApprovalModel', () => {
    const testRun = new TestRunModel({
      taskId: 'task_1',
      runId: 'run_1',
      command: 'pnpm test',
      status: 'PASSED',
      totalTests: 12,
      passed: 12,
      failed: 0,
      skipped: 0,
    });
    expect(testRun.validateSync()).toBeUndefined();
    expect(testRun.passed).toBe(12);

    const artifact = new ArtifactModel({
      taskId: 'task_1',
      runId: 'run_1',
      type: 'PATCH',
      path: 'diff.patch',
      sizeBytes: 1024,
    });
    expect(artifact.validateSync()).toBeUndefined();

    const approval = new ApprovalModel({
      taskId: 'task_1',
      runId: 'run_1',
      action: 'push_protected',
      permissionClass: 'HIGH_RISK',
      status: 'PENDING',
      details: { branch: 'main' },
      requestedBy: 'agent_worker',
    });
    expect(approval.validateSync()).toBeUndefined();
    expect(approval.status).toBe('PENDING');
  });

  it('instantiates PullRequestModel, EventModel, and EvaluationResultModel', () => {
    const pr = new PullRequestModel({
      taskId: 'task_1',
      projectId: 'proj_1',
      repositoryId: 'repo_1',
      githubPrNumber: 101,
      githubPrUrl: 'https://github.com/chetan102/build-pilot/pull/101',
      branch: 'bp/issue-42',
      baseBranch: 'main',
      title: 'fix: auth cookie timeout',
      body: 'Resolves issue #42',
      status: 'OPEN',
    });
    expect(pr.validateSync()).toBeUndefined();
    expect(pr.githubPrNumber).toBe(101);

    const event = new EventModel({
      taskId: 'task_1',
      type: 'TASK_STARTED',
      payload: { workerId: 'w1' },
      level: 'info',
    });
    expect(event.validateSync()).toBeUndefined();

    const evalResult = new EvaluationResultModel({
      taskId: 'task_1',
      runId: 'run_1',
      benchmarkName: 'SWE-bench-lite-task-1',
      score: 95,
      passed: true,
      metrics: { patchSize: 120, latencyMs: 4500 },
    });
    expect(evalResult.validateSync()).toBeUndefined();
    expect(evalResult.passed).toBe(true);
  });

  it('instantiates GitHubInstallationModel, ProviderCredentialModel, and AgentDefinitionModel', () => {
    const installation = new GitHubInstallationModel({
      installationId: 123456,
      accountName: 'chetan102',
      accountId: 987654,
      accountType: 'User',
      repositorySelection: 'selected',
    });
    expect(installation.validateSync()).toBeUndefined();

    const credential = new ProviderCredentialModel({
      userId: 'user_1',
      provider: 'OPENROUTER',
      apiKeyEncrypted: 'enc_sk_or_12345',
      defaultModel: 'anthropic/claude-3.5-sonnet',
      availableModels: ['anthropic/claude-3.5-sonnet', 'google/gemini-2.5-flash'],
      isActive: true,
    });
    expect(credential.validateSync()).toBeUndefined();

    const agentDef = new AgentDefinitionModel({
      name: 'standard-coder',
      description: 'Primary coding agent',
      systemPrompt: 'You are an autonomous engineering agent.',
      tools: ['view_file', 'edit_file', 'run_command'],
      defaultModel: 'anthropic/claude-3.5-sonnet',
      isDefault: true,
    });
    expect(agentDef.validateSync()).toBeUndefined();
    expect(agentDef.isDefault).toBe(true);
  });
});
