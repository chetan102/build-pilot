import { ToolRegistry } from '@buildpilot/tools';
import { LLMProvider } from '@buildpilot/llm';
import { TaskContext, RepoContext } from '../types.js';
import { AgentCoreLoop, AgentLoopResult } from '../agent-loop.js';
import { BASE_SYSTEM_PROMPT } from '../prompts.js';

export const DEVELOPER_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

# ROLE: SOFTWARE DEVELOPER
Your goal is to implement the approved implementation plan with surgical accuracy in the workspace.
You have write tools (write_file) and execution tools (run_command, run_tests).
After making code edits, you must always run tests to verify your implementation before completing.`;

export class DeveloperRole {
  constructor(private agentLoop: AgentCoreLoop = new AgentCoreLoop()) {}

  async develop(
    task: TaskContext,
    plan: string,
    repo: RepoContext | undefined,
    provider: LLMProvider,
    tools: ToolRegistry,
  ): Promise<{ success: boolean; output: string; steps: number; durationMs: number }> {
    const result: AgentLoopResult = await this.agentLoop.run(
      {
        ...task,
        userInstructions: `${task.userInstructions || ''}\n\n# APPROVED IMPLEMENTATION PLAN:\n${plan}\n\nPlease execute the code changes adhering strictly to the plan and verify with tests.`,
      },
      repo,
      provider,
      tools,
    );

    return {
      success: result.success,
      output: result.finalAnswer || 'Development completed.',
      steps: result.totalSteps,
      durationMs: result.durationMs,
    };
  }
}
