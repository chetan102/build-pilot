import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { WorkerService } from './worker.js';
import { AgentCoreLoop } from './agent/index.js';
import { ToolRegistry, registerDefaultTools } from '@buildpilot/tools';
import { MockLLMProvider } from '@buildpilot/llm';
import { TaskStatus, TaskRunStatus, LLMProviderType } from '@buildpilot/domain';

describe('End-to-End Vertical Slice (Phase 10: Issue → Code Fix → Tests → PR)', () => {
  let tempWorkspace: string;
  let mockTaskRepo: any;
  let mockTaskRunRepo: any;
  let mockEventRepo: any;
  let mockStepRepo: any;
  let mockToolCallRepo: any;
  let toolRegistry: ToolRegistry;

  beforeEach(async () => {
    vi.restoreAllMocks();
    tempWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'bp-e2e-'));

    // Create seeded repository file with a bug
    await fs.mkdir(path.join(tempWorkspace, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tempWorkspace, 'src/calculator.ts'),
      'export function add(a: number, b: number): number {\n  return a - b; // BUG: subtraction instead of addition\n}',
      'utf-8',
    );

    mockTaskRepo = {
      findById: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue({ status: TaskStatus.COMPLETED }),
    };

    mockTaskRunRepo = {
      findById: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((data) => Promise.resolve({ _id: data._id, ...data })),
      markStarted: vi.fn().mockResolvedValue({ status: TaskRunStatus.RUNNING }),
      markCompleted: vi.fn().mockResolvedValue({ status: TaskRunStatus.COMPLETED }),
      markFailed: vi.fn().mockResolvedValue({ status: TaskRunStatus.FAILED }),
      saveCheckpoint: vi.fn().mockResolvedValue({ _id: 'run_1' }),
      renewHeartbeat: vi.fn().mockResolvedValue({ _id: 'run_1' }),
    };

    mockEventRepo = {
      create: vi.fn().mockImplementation((data) => Promise.resolve({ _id: 'evt_1', ...data })),
    };

    mockStepRepo = {
      create: vi.fn().mockImplementation((data) => Promise.resolve({ _id: 'step_1', ...data })),
      updateDuration: vi.fn(),
    };

    mockToolCallRepo = {
      create: vi.fn().mockImplementation((data) => Promise.resolve({ _id: 'tc_1', ...data })),
      updateStatus: vi.fn().mockResolvedValue({ _id: 'tc_1' }),
    };

    toolRegistry = new ToolRegistry();
    registerDefaultTools(toolRegistry);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempWorkspace, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('autonomously completes complete vertical slice: inspects, edits code, tests, and proposes PR', async () => {
    // 1. Mock frontier LLM responses simulating intelligent engineering reasoning
    const mockProvider = new MockLLMProvider();
    mockProvider.setMockResponses([
      // Step 1: LLM searches for buggy function
      {
        content: 'I need to find the calculator function to fix the addition bug.',
        toolCalls: [
          {
            id: 'call_search_1',
            name: 'search_code',
            arguments: { query: 'function add' },
          },
        ],
        finishReason: 'tool_calls',
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      },
      // Step 2: LLM writes the bugfix to calculator.ts
      {
        content: 'I found the bug on line 2 (return a - b). Writing the corrected implementation.',
        toolCalls: [
          {
            id: 'call_write_1',
            name: 'write_file',
            arguments: {
              path: 'src/calculator.ts',
              content: 'export function add(a: number, b: number): number {\n  return a + b;\n}',
            },
          },
        ],
        finishReason: 'tool_calls',
        usage: { promptTokens: 60, completionTokens: 30, totalTokens: 90 },
      },
      // Step 3: LLM executes test runner to verify fix
      {
        content: 'Running tests to verify the fix.',
        toolCalls: [
          {
            id: 'call_test_1',
            name: 'run_tests',
            arguments: {
              testCommand: 'node -e "process.exit(0)"',
            },
          },
        ],
        finishReason: 'tool_calls',
        usage: { promptTokens: 70, completionTokens: 20, totalTokens: 90 },
      },
      // Step 4: LLM creates Pull Request
      {
        content: 'Tests passed. Opening pull request with bug fix description.',
        toolCalls: [
          {
            id: 'call_pr_1',
            name: 'create_pull_request',
            arguments: {
              title: 'Fix: Correct addition operator in calculator',
              body: 'Fixed arithmetic operator from subtraction to addition. Verified with passing tests.',
            },
          },
        ],
        finishReason: 'tool_calls',
        usage: { promptTokens: 80, completionTokens: 35, totalTokens: 115 },
      },
      // Step 5: Final completion synthesis
      {
        content: 'The bug has been successfully resolved, verified with tests, and a Pull Request is ready for review.',
        finishReason: 'stop',
        usage: { promptTokens: 90, completionTokens: 25, totalTokens: 115 },
      },
    ]);

    const customAgentLoop = new AgentCoreLoop({
      agentStepRepository: mockStepRepo,
      toolCallRepository: mockToolCallRepo,
      eventRepository: mockEventRepo,
      workspaceDir: tempWorkspace,
    });

    const workerService = new WorkerService({
      taskRepository: mockTaskRepo,
      taskRunRepository: mockTaskRunRepo,
      eventRepository: mockEventRepo,
      toolRegistry,
      agentCoreLoop: customAgentLoop,
      llmProvider: mockProvider,
    });

    const mockJob = {
      id: 'task_calc_1__run_calc_1',
      attemptsMade: 0,
      opts: { attempts: 3 },
      data: {
        taskId: '6a9cf2425d9b845db6781a18',
        runId: '6a9cf2425d9b845db6781a19',
        projectId: 'proj_demo',
        repositoryId: 'demo/repo',
        issueNumber: 101,
        title: 'Fix addition bug in calculator',
        description: 'add(2, 3) currently returns -1 instead of 5',
        branch: 'buildpilot/task-101-calc',
        baseBranch: 'main',
        provider: LLMProviderType.OPENROUTER,
        model: 'anthropic/claude-3.5-sonnet',
        maxSteps: 30,
        metadata: {},
        correlationId: 'req_e2e_demo',
      },
    } as any;

    const result = await workerService.processJob(mockJob);

    // Assert overall execution success
    expect(result.success).toBe(true);
    expect(result.taskId).toBe('6a9cf2425d9b845db6781a18');
    expect(result.runId).toBe('6a9cf2425d9b845db6781a19');

    // Verify file content was actually modified in workspace
    const fixedContent = await fs.readFile(
      path.join(tempWorkspace, 'src/calculator.ts'),
      'utf-8',
    );
    expect(fixedContent).toBe('export function add(a: number, b: number): number {\n  return a + b;\n}');

    // Verify task state was transitioned to COMPLETED
    expect(mockTaskRepo.updateStatus).toHaveBeenCalledWith(
      '6a9cf2425d9b845db6781a18',
      TaskStatus.COMPLETED,
      expect.objectContaining({ completedRunId: '6a9cf2425d9b845db6781a19' }),
    );

    // Verify all 5 steps recorded in DB
    expect(mockStepRepo.create).toHaveBeenCalledTimes(5);

    // Verify 4 tool calls executed and recorded
    expect(mockToolCallRepo.create).toHaveBeenCalledTimes(4);
  });
});
