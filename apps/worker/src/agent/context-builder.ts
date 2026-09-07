import { LLMMessage } from '@buildpilot/llm';
import {
  ContextBuildOptions,
  ContextBuildResult,
  TokenBudgetOptions,
  TaskContext,
  RepoContext,
} from './types.js';
import {
  DEFAULT_TOKEN_BUDGET,
  estimateTokens,
  estimateMessageTokens,
  estimateMessagesTokens,
  truncateMiddle,
  formatAndTruncateFileTree,
  pruneConversationHistory,
} from './token-budget.js';
import { BASE_SYSTEM_PROMPT, formatTaskPrompt, formatRepoContext } from './prompts.js';

export class ContextBuilder {
  /**
   * Builds the structured messages array and system prompt within token limits
   */
  build(options: ContextBuildOptions): ContextBuildResult {
    const budget: TokenBudgetOptions = {
      ...DEFAULT_TOKEN_BUDGET,
      ...(options.tokenBudget || {}),
    };

    const truncationDetails: string[] = [];
    let wasTruncated = false;

    // 1. Process repo context & file tree summary
    let repoContextWithTruncation: RepoContext | undefined = options.repo;
    if (options.repo?.fileTree && options.repo.fileTree.length > 0) {
      const { tree, wasTruncated: treeTruncated } = formatAndTruncateFileTree(
        options.repo.fileTree,
        budget.maxFileTreeTokens,
      );
      if (treeTruncated) {
        wasTruncated = true;
        truncationDetails.push('Repository file tree was truncated to fit token budget');
      }
      repoContextWithTruncation = {
        ...options.repo,
        fileTreeSummary: tree,
      };
    }

    // 2. Build complete system prompt
    const systemPrompt = this.buildSystemPrompt(
      options.task,
      repoContextWithTruncation,
      options.systemPromptOverride,
      options.customGuidelines,
    );

    const systemPromptTokens = estimateTokens(systemPrompt);

    // 3. Assemble conversation history
    let messages: LLMMessage[] = [];
    if (options.history && options.history.length > 0) {
      const toolTruncation = this.normalizeAndTruncateToolOutputs(
        options.history,
        budget.maxToolOutputTokens,
        truncationDetails,
      );
      messages = toolTruncation.messages;
      if (toolTruncation.wasTruncated) {
        wasTruncated = true;
      }
    } else {
      // Create initial user kickoff message
      messages = [this.buildInitialUserMessage(options.task)];
    }

    // 4. Calculate available token budget for conversation history
    const availableHistoryTokens = Math.max(
      1000,
      budget.maxContextTokens - budget.reservedOutputTokens - systemPromptTokens,
    );

    // 5. Prune history if total message tokens exceed available budget
    const {
      messages: prunedMessages,
      wasTruncated: historyTruncated,
      droppedCount,
    } = pruneConversationHistory(messages, availableHistoryTokens);

    if (historyTruncated) {
      wasTruncated = true;
      truncationDetails.push(
        `Pruned ${droppedCount} older conversation message(s) to stay within ${budget.maxContextTokens} token limit`,
      );
    }

    // 6. Calculate total token estimation
    const totalEstimatedTokens = systemPromptTokens + estimateMessagesTokens(prunedMessages);

    return {
      systemPrompt,
      messages: prunedMessages,
      estimatedTokens: totalEstimatedTokens,
      wasTruncated,
      truncationDetails,
    };
  }

  /**
   * Assembles the system prompt from base instructions, task assignment, and repo context
   */
  buildSystemPrompt(
    task: TaskContext,
    repo?: RepoContext,
    systemPromptOverride?: string,
    customGuidelines?: string,
  ): string {
    const base = systemPromptOverride || BASE_SYSTEM_PROMPT;
    const taskSection = formatTaskPrompt(task);
    const repoSection = repo ? formatRepoContext(repo) : '';

    const parts = [base, taskSection];

    if (customGuidelines) {
      parts.push(`# CUSTOM PROJECT GUIDELINES\n${customGuidelines}`);
    }

    if (repoSection) {
      parts.push(repoSection);
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Constructs the initial kickoff user message from the task
   */
  buildInitialUserMessage(task: TaskContext): LLMMessage {
    const lines = [
      `Please solve Issue #${task.issueNumber}: **${task.title}**`,
    ];

    if (task.description) {
      lines.push(`\n**Task Description**:\n${task.description}`);
    }

    if (task.userInstructions) {
      lines.push(`\n**Special Instructions**:\n${task.userInstructions}`);
    }

    lines.push(
      '\nStart by inspecting the codebase, locating the relevant files, and formulating your implementation plan.',
    );

    return {
      role: 'user',
      content: lines.join('\n'),
    };
  }

  /**
   * Truncates excessively large individual tool output messages (e.g. huge file reads or terminal logs)
   */
  private normalizeAndTruncateToolOutputs(
    history: LLMMessage[],
    maxToolTokens: number,
    truncationDetails: string[],
  ): { messages: LLMMessage[]; wasTruncated: boolean } {
    let anyTruncated = false;

    const messages = history.map((msg) => {
      if (msg.role !== 'tool' || !msg.content) {
        return msg;
      }

      const { text, wasTruncated } = truncateMiddle(msg.content, maxToolTokens);
      if (wasTruncated) {
        anyTruncated = true;
        truncationDetails.push(
          `Truncated oversized output for tool call ${msg.toolCallId || 'unknown'}`,
        );
        return {
          ...msg,
          content: text,
        };
      }

      return msg;
    });

    return {
      messages,
      wasTruncated: anyTruncated,
    };
  }
}

export const contextBuilder = new ContextBuilder();
