import { ToolRegistry } from '@buildpilot/tools';
import { LLMProvider } from '@buildpilot/llm';
import { TaskContext, RepoContext } from '../types.js';
import { AgentCoreLoop, AgentLoopResult } from '../agent-loop.js';
import { BASE_SYSTEM_PROMPT } from '../prompts.js';

export const PLANNER_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

# ROLE: ARCHITECT & PLANNER
Your goal is to inspect the codebase, analyze the issue, identify the root cause, and produce a detailed, bulletproof implementation plan.
You have READ-ONLY tools. You do not write or modify code directly.

# PLAN SPECIFICATION FORMAT:
When complete, your final answer must output the plan formatted in markdown:
1. **Problem Analysis & Root Cause**
2. **Affected Files & Locations**
3. **Step-by-Step Implementation Changes**
4. **Verification & Testing Strategy**`;

export class PlannerRole {
  constructor(private agentLoop: AgentCoreLoop = new AgentCoreLoop()) {}

  async plan(
    task: TaskContext,
    repo: RepoContext | undefined,
    provider: LLMProvider,
    tools: ToolRegistry,
  ): Promise<{ plan: string; steps: number; durationMs: number }> {
    // Filter to strictly read-only tools
    const readOnlyRegistry = new ToolRegistry();
    for (const t of tools.listByPermission('READ_ONLY')) {
      readOnlyRegistry.register(t);
    }

    const result: AgentLoopResult = await this.agentLoop.run(
      {
        ...task,
        userInstructions: `${task.userInstructions || ''}\n\nPlease inspect the relevant files and produce a structured implementation plan.`,
      },
      repo,
      provider,
      readOnlyRegistry,
    );

    return {
      plan: result.finalAnswer || 'Plan generated successfully.',
      steps: result.totalSteps,
      durationMs: result.durationMs,
    };
  }
}
