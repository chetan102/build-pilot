import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from '@buildpilot/domain';
import { AgentCoreLoop } from './agent-loop.js';
import { ToolRegistry } from '@buildpilot/tools';
import { MockLLMProvider } from '@buildpilot/llm';
import { TaskContext, RepoContext } from './types.js';

describe('Agent Runtime — AgentCoreLoop Multi-Step Tool Calling', () => {
  let mockStepRepo: any;
  let mockToolCallRepo: any;
  let mockEventRepo: any;
  let toolRegistry: ToolRegistry;

  const sampleTask: TaskContext = {
    taskId: 'task_001',
    runId: 'run_001',
    projectId: 'proj_001',
    repositoryId: 'repo_001',
    issueNumber: 1,
    title: 'Implement healthcheck',
    description: 'Add /health endpoint',
    branch: 'bp/task-1',
  };

  const sampleRepo: RepoContext = {
    owner: 'test',
    name: 'repo',
    fullName: 'test/repo',
    defaultBranch: 'main',
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockStepRepo = {
      create: vi.fn().mockImplementation((data) => Promise.resolve({ _id: 'step_db_1', ...data })),
      updateDuration: vi.fn(),
    };

    mockToolCallRepo = {
      create: vi.fn().mockImplementation((data) => Promise.resolve({ _id: 'tc_db_1', ...data })),
      updateStatus: vi.fn().mockResolvedValue({ _id: 'tc_db_1' }),
    };

    mockEventRepo = {
      create: vi.fn().mockResolvedValue({ _id: 'evt_1' }),
    };

    toolRegistry = new ToolRegistry();
  });

  it('completes on turn 1 when model returns direct answer without tool calls', async () => {
    const mockProvider = new MockLLMProvider();
    mockProvider.setMockResponses([
      {
        content: 'I have analyzed the problem and no changes are needed.',
        finishReason: 'stop',
        usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
      },
    ]);

    const loop = new AgentCoreLoop({
      agentStepRepository: mockStepRepo,
      toolCallRepository: mockToolCallRepo,
      eventRepository: mockEventRepo,
    });

    const result = await loop.run(sampleTask, sampleRepo, mockProvider, toolRegistry);

    expect(result.success).toBe(true);
    expect(result.finalAnswer).toBe('I have analyzed the problem and no changes are needed.');
    expect(result.totalSteps).toBe(1);
    expect(result.totalTokens.totalTokens).toBe(30);

    // Verify AgentStep persisted
    expect(mockStepRepo.create).toHaveBeenCalledTimes(1);
    expect(mockStepRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task_001',
        runId: 'run_001',
        title: 'Step 1: Model Response',
      }),
    );
  });

  it('executes a multi-step tool-calling agent flow successfully (Acceptance Criteria)', async () => {
    // 1. Register a test tool
    const mockFileContent = 'export function health() { return { ok: true }; }';
    const executeSpy = vi.fn().mockResolvedValue({ content: mockFileContent });

    toolRegistry.register({
      name: 'read_file',
      description: 'Reads contents of a file',
      permissionClass: 'READ_ONLY',
      inputSchema: z.object({ path: z.string() }),
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      execute: executeSpy,
    });

    // 2. Setup mock LLM responses for multi-step execution
    const mockProvider = new MockLLMProvider();
    mockProvider.setMockResponses([
      // Step 1: Model makes a tool call to read file
      {
        content: 'I will read the health check file.',
        toolCalls: [
          {
            id: 'call_read_1',
            name: 'read_file',
            arguments: { path: 'src/health.ts' },
          },
        ],
        finishReason: 'tool_calls',
        usage: { promptTokens: 30, completionTokens: 15, totalTokens: 45 },
      },
      // Step 2: Model sees tool result and provides final response
      {
        content: 'File content verified. The health endpoint is correctly configured.',
        finishReason: 'stop',
        usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
      },
    ]);

    const loop = new AgentCoreLoop({
      agentStepRepository: mockStepRepo,
      toolCallRepository: mockToolCallRepo,
      eventRepository: mockEventRepo,
    });

    const result = await loop.run(sampleTask, sampleRepo, mockProvider, toolRegistry);

    expect(result.success).toBe(true);
    expect(result.finalAnswer).toContain('The health endpoint is correctly configured');
    expect(result.totalSteps).toBe(2);
    expect(result.totalTokens.totalTokens).toBe(115);

    // Verify tool execution
    expect(executeSpy).toHaveBeenCalledWith(
      { path: 'src/health.ts' },
      expect.objectContaining({ taskId: 'task_001', runId: 'run_001' }),
    );

    // Verify AgentStep and ToolCall persistence
    expect(mockStepRepo.create).toHaveBeenCalledTimes(2);
    expect(mockToolCallRepo.create).toHaveBeenCalledTimes(1);
    expect(mockToolCallRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'read_file',
        runId: 'run_001',
        input: { path: 'src/health.ts' },
      }),
    );
    expect(mockToolCallRepo.updateStatus).toHaveBeenCalledWith(
      'tc_db_1',
      'SUCCESS',
      expect.objectContaining({
        output: { content: mockFileContent },
      }),
    );
  });

  it('handles unknown tool call by returning error feedback to model', async () => {
    const mockProvider = new MockLLMProvider();
    mockProvider.setMockResponses([
      // Step 1: Calls unknown tool
      {
        content: 'Running unknown tool',
        toolCalls: [
          {
            id: 'call_unknown_1',
            name: 'non_existent_tool',
            arguments: {},
          },
        ],
      },
      // Step 2: Model self-corrects after receiving unknown tool error
      {
        content: 'I noticed the tool is not available. Concluding task.',
        finishReason: 'stop',
      },
    ]);

    const loop = new AgentCoreLoop({
      agentStepRepository: mockStepRepo,
      toolCallRepository: mockToolCallRepo,
    });

    const result = await loop.run(sampleTask, sampleRepo, mockProvider, toolRegistry);

    expect(result.success).toBe(true);
    expect(result.totalSteps).toBe(2);
    expect(mockToolCallRepo.updateStatus).toHaveBeenCalledWith(
      'tc_db_1',
      'FAILED',
      expect.objectContaining({
        error: expect.stringContaining('is not registered'),
      }),
    );
  });

  it('handles tool argument validation failure with Zod feedback', async () => {
    toolRegistry.register({
      name: 'create_issue',
      description: 'Creates an issue',
      permissionClass: 'SAFE_WRITE',
      inputSchema: z.object({ title: z.string().min(3), priority: z.enum(['low', 'high']) }),
      execute: vi.fn(),
    });

    const mockProvider = new MockLLMProvider();
    mockProvider.setMockResponses([
      // Step 1: Passes invalid arguments
      {
        content: 'Creating issue',
        toolCalls: [
          {
            id: 'call_val_1',
            name: 'create_issue',
            arguments: { title: 'ab' }, // missing priority, title too short
          },
        ],
      },
      // Step 2: Model responds to validation failure
      {
        content: 'I need to provide valid title and priority.',
        finishReason: 'stop',
      },
    ]);

    const loop = new AgentCoreLoop({
      agentStepRepository: mockStepRepo,
      toolCallRepository: mockToolCallRepo,
    });

    const result = await loop.run(sampleTask, sampleRepo, mockProvider, toolRegistry);

    expect(result.success).toBe(true);
    expect(result.totalSteps).toBe(2);
    expect(mockToolCallRepo.updateStatus).toHaveBeenCalledWith(
      'tc_db_1',
      'FAILED',
      expect.objectContaining({
        error: expect.stringContaining('Validation Error in arguments'),
      }),
    );
  });

  it('terminates safely when maxSteps limit is reached', async () => {
    // Model continuously calls tool
    toolRegistry.register({
      name: 'ping',
      description: 'Ping',
      permissionClass: 'READ_ONLY',
      inputSchema: z.object({}),
      execute: vi.fn().mockResolvedValue({ pong: true }),
    });

    const mockProvider = new MockLLMProvider();
    // Continuous tool calls
    mockProvider.setMockResponses(
      Array.from({ length: 10 }, () => ({
        content: 'Ping again',
        toolCalls: [{ id: 'call_ping', name: 'ping', arguments: {} }],
      })),
    );

    const loop = new AgentCoreLoop({
      maxSteps: 3,
      agentStepRepository: mockStepRepo,
      toolCallRepository: mockToolCallRepo,
    });

    const result = await loop.run(sampleTask, sampleRepo, mockProvider, toolRegistry);

    expect(result.success).toBe(false);
    expect(result.totalSteps).toBe(3);
    expect(result.error).toContain('maximum step limit (3)');
  });

  it('aborts execution when cancellation signal is triggered', async () => {
    const controller = new AbortController();
    controller.abort(); // pre-aborted

    const mockProvider = new MockLLMProvider();

    const loop = new AgentCoreLoop({
      signal: controller.signal,
      agentStepRepository: mockStepRepo,
      toolCallRepository: mockToolCallRepo,
    });

    const result = await loop.run(sampleTask, sampleRepo, mockProvider, toolRegistry);

    expect(result.success).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.error).toContain('cancelled by user');
  });
});
