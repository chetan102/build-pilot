import { ToolRegistry } from '@buildpilot/tools';
import { LLMProvider } from '@buildpilot/llm';
import { TaskContext, RepoContext } from '../types.js';
import { AgentCoreLoop, AgentLoopResult } from '../agent-loop.js';
import { BASE_SYSTEM_PROMPT } from '../prompts.js';

export interface ReviewResult {
  approved: boolean;
  feedback: string;
  steps: number;
  durationMs: number;
}

export const REVIEWER_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

# ROLE: CODE REVIEWER & QA LEAD
Your goal is to inspect the git diff and run verification tests to evaluate the developer's implementation.
Check for:
1. Requirements compliance (Does the code fix the issue?)
2. Code quality, correctness, edge cases, and regression risks.
3. Test suite results (Are all tests passing?).

# VERDICT FORMAT:
End your review with either:
- VERDICT: APPROVED (if implementation is clean and verified)
- VERDICT: CHANGES_REQUESTED (with numbered actionable feedback)`;

export class ReviewerRole {
  constructor(private agentLoop: AgentCoreLoop = new AgentCoreLoop()) {}

  async review(
    task: TaskContext,
    diff: string,
    repo: RepoContext | undefined,
    provider: LLMProvider,
    tools: ToolRegistry,
  ): Promise<ReviewResult> {
    const readOnlyRegistry = new ToolRegistry();
    for (const t of tools.listByPermission('READ_ONLY')) {
      readOnlyRegistry.register(t);
    }

    const result: AgentLoopResult = await this.agentLoop.run(
      {
        ...task,
        userInstructions: `${task.userInstructions || ''}\n\n# CURRENT GIT DIFF:\n\`\`\`diff\n${diff}\n\`\`\`\n\nPlease review the changes and run tests if needed. Conclude with VERDICT: APPROVED or VERDICT: CHANGES_REQUESTED.`,
      },
      repo,
      provider,
      readOnlyRegistry,
    );

    const text = result.finalAnswer || '';
    const isApproved = text.includes('VERDICT: APPROVED') || !text.includes('VERDICT: CHANGES_REQUESTED');

    return {
      approved: isApproved,
      feedback: text,
      steps: result.totalSteps,
      durationMs: result.durationMs,
    };
  }
}
