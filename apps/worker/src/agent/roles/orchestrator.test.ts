import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MultiAgentOrchestrator } from './multi-agent-orchestrator.js';
import { PlannerRole } from './planner-role.js';
import { DeveloperRole } from './developer-role.js';
import { ReviewerRole } from './reviewer-role.js';
import { ToolRegistry } from '@buildpilot/tools';
import { MockLLMProvider } from '@buildpilot/llm';
import { taskRepository, taskRunRepository, eventRepository } from '@buildpilot/database';

describe('Multi-Agent Roles & Orchestration (Phase 14: Agent Roles)', () => {
  let mockPlanner: any;
  let mockDeveloper: any;
  let mockReviewer: any;
  let tools: ToolRegistry;

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(taskRepository, 'updateStatus').mockResolvedValue({} as any);
    vi.spyOn(taskRunRepository, 'saveCheckpoint').mockResolvedValue({} as any);
    vi.spyOn(eventRepository, 'create').mockResolvedValue({} as any);

    mockPlanner = {
      plan: vi.fn().mockResolvedValue({
        plan: '1. Inspect auth.ts\n2. Fix token expiration',
        steps: 2,
        durationMs: 100,
      }),
    };

    mockDeveloper = {
      develop: vi.fn().mockResolvedValue({
        success: true,
        output: 'Fixed token expiration',
        steps: 3,
        durationMs: 250,
      }),
    };

    mockReviewer = {
      review: vi.fn().mockResolvedValue({
        approved: true,
        feedback: 'VERDICT: APPROVED. All tests passing.',
        steps: 1,
        durationMs: 50,
      }),
    };

    tools = new ToolRegistry();
  });

  it('orchestrates Planner -> Developer -> Reviewer workflow cleanly on first pass approval', async () => {
    const orchestrator = new MultiAgentOrchestrator({
      planner: mockPlanner,
      developer: mockDeveloper,
      reviewer: mockReviewer,
    });

    const result = await orchestrator.run(
      {
        taskId: 'task_1',
        runId: 'run_1',
        projectId: 'p1',
        repositoryId: 'r1',
        issueNumber: 1,
        title: 'Fix token bug',
        branch: 'bp/branch-1',
      },
      undefined,
      new MockLLMProvider(),
      tools,
    );

    expect(result.success).toBe(true);
    expect(result.repairCycles).toBe(0);
    expect(result.plan).toContain('Inspect auth.ts');
    expect(mockPlanner.plan).toHaveBeenCalledTimes(1);
    expect(mockDeveloper.develop).toHaveBeenCalledTimes(1);
    expect(mockReviewer.review).toHaveBeenCalledTimes(1);
  });

  it('executes bounded repair loop when Reviewer requests changes initially', async () => {
    // Reviewer rejects first time, approves second time
    mockReviewer.review
      .mockResolvedValueOnce({
        approved: false,
        feedback: 'VERDICT: CHANGES_REQUESTED. Please add missing unit test for empty token.',
        steps: 1,
        durationMs: 50,
      })
      .mockResolvedValueOnce({
        approved: true,
        feedback: 'VERDICT: APPROVED. Unit test added.',
        steps: 1,
        durationMs: 50,
      });

    const orchestrator = new MultiAgentOrchestrator({
      planner: mockPlanner,
      developer: mockDeveloper,
      reviewer: mockReviewer,
      maxRepairCycles: 3,
    });

    const result = await orchestrator.run(
      {
        taskId: 'task_1',
        runId: 'run_1',
        projectId: 'p1',
        repositoryId: 'r1',
        issueNumber: 1,
        title: 'Fix token bug',
        branch: 'bp/branch-1',
      },
      undefined,
      new MockLLMProvider(),
      tools,
    );

    expect(result.success).toBe(true);
    expect(result.repairCycles).toBe(1);
    expect(mockDeveloper.develop).toHaveBeenCalledTimes(2); // Initial develop + 1 repair cycle
    expect(mockReviewer.review).toHaveBeenCalledTimes(2); // Initial review + 1 re-review
  });
});
