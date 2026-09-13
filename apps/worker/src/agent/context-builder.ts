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
  distillOlderToolOutputs,
  compactOlderAssistantWrites,
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

    // 2. Build complete system prompt (includes runtime dedup block + env note)
    const systemPrompt = this.buildSystemPrompt(
      options.task,
      repoContextWithTruncation,
      options.systemPromptOverride,
      options.customGuidelines,
      options.readFiles,
      options.sandboxCapabilities,
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

      // Compact older assistant write_file calls so file contents don't bloat context
      const compacted = compactOlderAssistantWrites(messages, 2);
      messages = compacted.messages;

      // Distill older tool outputs (Observation Masking) to keep prompt tokens frugal
      const distilled = distillOlderToolOutputs(messages, 2);
      messages = distilled.messages;
    } else {
      // Create initial user kickoff message
      messages = [this.buildInitialUserMessage(options.task)];
    }

    // 4. Calculate available token budget for conversation history
    const availableHistoryTokens = Math.max(
      1000,
      budget.maxContextTokens - budget.reservedOutputTokens - systemPromptTokens,
    );

    // 5. Prune history if total message tokens or message count exceed available budget
    const {
      messages: prunedMessages,
      wasTruncated: historyTruncated,
      droppedCount,
    } = pruneConversationHistory(messages, availableHistoryTokens, budget.maxHistoryMessages);

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
   * Assembles the system prompt from base instructions, task assignment, and repo context.
   * Also injects runtime context: files already read this session + sandbox capabilities.
   */
  buildSystemPrompt(
    task: TaskContext,
    repo?: RepoContext,
    systemPromptOverride?: string,
    customGuidelines?: string,
    readFiles?: Map<string, { lines: number; step: number }>,
    sandboxCapabilities?: { gitAvailable: boolean; nodeAvailable: boolean },
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

    // Inject sandbox capabilities note — prevents panic loops when git is missing
    if (sandboxCapabilities) {
      const envLines: string[] = ['# SANDBOX ENVIRONMENT'];
      envLines.push(`- git: ${sandboxCapabilities.gitAvailable ? '✅ available' : '❌ NOT available — do NOT run git commands, use commit_and_push tool instead'}`);
      envLines.push(`- node: ${sandboxCapabilities.nodeAvailable ? '✅ available' : '❌ NOT available'}`);
      parts.push(envLines.join('\n'));
    }

    // Inject read-file deduplication block — prevents the model re-reading files it already has
    if (readFiles && readFiles.size > 0) {
      const lines = ['# FILES ALREADY IN YOUR CONTEXT (DO NOT RE-READ THESE)'];
      lines.push('The following files were read earlier in this session. Their content is in your context window. Do NOT call read_file on them again — just recall from memory.');
      lines.push('');
      for (const [path, entry] of readFiles) {
        lines.push(`- \`${path}\`  (${entry.lines} lines, read at step ${entry.step})`);
      }
      parts.push(lines.join('\n'));
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
