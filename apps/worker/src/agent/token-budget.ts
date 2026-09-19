import { LLMMessage } from '@buildpilot/llm';
import { TokenBudgetOptions } from './types.js';

export const DEFAULT_TOKEN_BUDGET: TokenBudgetOptions = {
  maxContextTokens: 64000,
  reservedOutputTokens: 2048,
  maxToolOutputTokens: 1500,
  maxHistoryMessages: 30,
  maxFileTreeTokens: 1000,
};

/**
 * Estimates token count for text using character/word heuristic
 * (Average ~4 characters per token in English / code)
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  // Account for code symbols, whitespace, and markdown syntax
  return Math.ceil(text.length / 3.8);
}

/**
 * Estimates token count for a single LLMMessage including tool calls
 */
export function estimateMessageTokens(message: LLMMessage): number {
  let tokens = 4; // overhead per message framing

  if (message.content) {
    tokens += estimateTokens(message.content);
  }

  if (message.name) {
    tokens += estimateTokens(message.name);
  }

  if (message.toolCalls && message.toolCalls.length > 0) {
    for (const tc of message.toolCalls) {
      tokens += estimateTokens(tc.name) + 8;
      if (typeof tc.arguments === 'string') {
        tokens += estimateTokens(tc.arguments);
      } else {
        tokens += estimateTokens(JSON.stringify(tc.arguments));
      }
    }
  }

  return tokens;
}

/**
 * Estimates total token count for an array of LLMMessages
 */
export function estimateMessagesTokens(messages: LLMMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

/**
 * Truncates text from the middle if it exceeds maxTokens, preserving the header and recent tail (e.g. error traces)
 */
export function truncateMiddle(
  text: string,
  maxTokens: number,
  indicator = '\n... [Content truncated due to context window limits] ...\n',
): { text: string; wasTruncated: boolean } {
  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) {
    return { text, wasTruncated: false };
  }

  const maxChars = Math.floor(maxTokens * 3.8);
  const indicatorChars = indicator.length;
  const availableChars = Math.max(0, maxChars - indicatorChars);

  // Keep 40% from beginning, 60% from end (tail usually contains errors/stack traces)
  const headChars = Math.floor(availableChars * 0.4);
  const tailChars = availableChars - headChars;

  const head = text.slice(0, headChars);
  const tail = text.slice(text.length - tailChars);

  return {
    text: `${head}${indicator}${tail}`,
    wasTruncated: true,
  };
}

/**
 * Formats and truncates file paths list into a clean directory tree string
 */
export function formatAndTruncateFileTree(
  files: string[],
  maxTokens: number = DEFAULT_TOKEN_BUDGET.maxFileTreeTokens,
): { tree: string; wasTruncated: boolean } {
  if (!files || files.length === 0) {
    return { tree: 'No files in repository.', wasTruncated: false };
  }

  const lines: string[] = [];
  let currentEstimatedTokens = 0;
  let wasTruncated = false;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    const line = `- ${file}`;
    const lineTokens = estimateTokens(line);

    if (currentEstimatedTokens + lineTokens > maxTokens) {
      const remaining = files.length - i;
      lines.push(`... and ${remaining} more files (truncated)`);
      wasTruncated = true;
      break;
    }

    lines.push(line);
    currentEstimatedTokens += lineTokens;
  }

  return {
    tree: lines.join('\n'),
    wasTruncated,
  };
}

/**
 * Prunes conversation history messages to fit within available budget tokens.
 * Retains the first message (task instruction) and latest messages, preserving atomic assistant+tool pairs.
 */
export function pruneConversationHistory(
  history: LLMMessage[],
  availableTokens: number,
  maxMessages = 30,
): { messages: LLMMessage[]; wasTruncated: boolean; droppedCount: number } {
  if (history.length <= 1) {
    return { messages: [...history], wasTruncated: false, droppedCount: 0 };
  }

  // Enforce maxMessages limit — must prune whole turns atomically to avoid
  // orphaned tool messages (which cause HTTP 400 from LLM APIs).
  let workingHistory = [...history];
  let msgCountDropped = 0;
  if (workingHistory.length > maxMessages) {
    // Build turns from index 1 onward (index 0 is the protected kickoff message)
    const preGrouped: LLMMessage[][] = [];
    let current: LLMMessage[] = [];
    for (let i = 1; i < workingHistory.length; i++) {
      const msg = workingHistory[i]!;
      if (msg.role === 'assistant' && current.length > 0) {
        preGrouped.push(current);
        current = [msg];
      } else {
        current.push(msg);
      }
    }
    if (current.length > 0) preGrouped.push(current);

    // Drop oldest turns until we are within budget
    while (
      preGrouped.reduce((s, t) => s + t.length, 0) + 1 > maxMessages &&
      preGrouped.length > 0
    ) {
      const dropped = preGrouped.shift()!;
      msgCountDropped += dropped.length;
    }
    workingHistory = [workingHistory[0]!, ...preGrouped.flat()];
  }

  const totalHistoryTokens = estimateMessagesTokens(workingHistory);
  if (totalHistoryTokens <= availableTokens && msgCountDropped === 0) {
    return { messages: workingHistory, wasTruncated: false, droppedCount: 0 };
  }

  // Always keep the very first message (initial instruction)
  const firstMsg = workingHistory[0]!;
  const firstTokens = estimateMessageTokens(firstMsg);
  const remainingBudget = Math.max(0, availableTokens - firstTokens);

  // Group intermediate messages into conversational turns / tool call pairs:
  const turns: LLMMessage[][] = [];
  let currentTurn: LLMMessage[] = [];

  for (let i = 1; i < workingHistory.length; i++) {
    const msg = workingHistory[i]!;
    if (msg.role === 'assistant' && currentTurn.length > 0) {
      turns.push(currentTurn);
      currentTurn = [msg];
    } else {
      currentTurn.push(msg);
    }
  }
  if (currentTurn.length > 0) {
    turns.push(currentTurn);
  }

  // Walk backwards turn by turn to pack as many recent turns as possible
  const includedTurns: LLMMessage[][] = [];
  let accumulatedTokens = 0;
  let droppedTurnsCount = 0;

  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]!;
    const turnTokens = estimateMessagesTokens(turn);

    if (accumulatedTokens + turnTokens <= remainingBudget) {
      includedTurns.unshift(turn);
      accumulatedTokens += turnTokens;
    } else {
      droppedTurnsCount += turn.length;
    }
  }

  const totalDropped = msgCountDropped + droppedTurnsCount;
  const result: LLMMessage[] = [firstMsg];

  if (totalDropped > 0) {
    result.push({
      role: 'system',
      content: `[Note: ${totalDropped} older conversation steps were pruned to preserve context window token budget.]`,
    });
  }

  for (const turn of includedTurns) {
    result.push(...turn);
  }

  return {
    messages: result,
    wasTruncated: totalDropped > 0,
    droppedCount: totalDropped,
  };
}

/**
 * Compacts older assistant tool calls (specifically write_file) so massive file contents
 * do not persist indefinitely in the assistant message history.
 */
export function compactOlderAssistantWrites(
  history: LLMMessage[],
  recentWriteCount = 2,
): { messages: LLMMessage[]; compactedCount: number } {
  const writeIndices: number[] = [];
  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (
      msg?.role === 'assistant' &&
      msg.toolCalls?.some((tc) => tc.name === 'write_file' || tc.name === 'edit_file')
    ) {
      writeIndices.push(i);
    }
  }

  if (writeIndices.length <= recentWriteCount) {
    return { messages: [...history], compactedCount: 0 };
  }

  const indicesToCompact = new Set(writeIndices.slice(0, writeIndices.length - recentWriteCount));
  let compactedCount = 0;

  const messages = history.map((msg, idx) => {
    if (!indicesToCompact.has(idx) || !msg.toolCalls) {
      return msg;
    }

    const modifiedToolCalls = msg.toolCalls.map((tc) => {
      if ((tc.name === 'write_file' || tc.name === 'edit_file') && tc.arguments) {
        try {
          const args = typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments;
          if (tc.name === 'write_file' && args.content && typeof args.content === 'string') {
            const lineCount = args.content.split('\n').length;
            compactedCount++;
            return {
              ...tc,
              arguments: {
                path: args.path,
                content: `(File content written: ${lineCount} lines — compacted from earlier step)`,
                createDirectories: args.createDirectories,
              },
            };
          } else if (tc.name === 'edit_file' && args.replacementContent) {
            compactedCount++;
            return {
              ...tc,
              arguments: {
                path: args.path,
                targetContent: '(Target block snippet — compacted)',
                replacementContent: '(Replacement block snippet — compacted)',
              },
            };
          }
        } catch {
          // ignore parse errors
        }
      }
      return tc;
    });

    return {
      ...msg,
      toolCalls: modifiedToolCalls,
    };
  });

  return { messages, compactedCount };
}

/**
 * Distills older tool outputs in conversation history (Observation Masking).
 * Keeps the most recent recentToolCount tool responses in full fidelity, while compacting
 * earlier tool responses (like large file reads or directory listings) into concise semantic summaries.
 */
export function distillOlderToolOutputs(
  history: LLMMessage[],
  recentToolCount = 2,
): { messages: LLMMessage[]; distilledCount: number } {
  const toolIndices: number[] = [];
  for (let i = 0; i < history.length; i++) {
    if (history[i]?.role === 'tool') {
      toolIndices.push(i);
    }
  }

  if (toolIndices.length <= recentToolCount) {
    return { messages: [...history], distilledCount: 0 };
  }

  // Identify indices of tool messages that should be distilled (all except the last recentToolCount)
  const indicesToDistill = new Set(toolIndices.slice(0, toolIndices.length - recentToolCount));
  let distilledCount = 0;

  const messages = history.map((msg, idx) => {
    if (!indicesToDistill.has(idx) || !msg.content) {
      return msg;
    }

    const originalTokens = estimateTokens(msg.content);
    // If output is already tiny (< 100 tokens), no need to distill
    if (originalTokens < 100) {
      return msg;
    }

    let compactContent = msg.content;
    try {
      const parsed = JSON.parse(msg.content);
      if (parsed.path && parsed.content !== undefined) {
        // Distill read_file result
        compactContent = JSON.stringify({
          path: parsed.path,
          totalLines: parsed.totalLines || (parsed.content ? parsed.content.split('\n').length : 0),
          summary: '(File content was inspected in earlier step)',
        });
      } else if (Array.isArray(parsed.entries) || (parsed.count && parsed.basePath !== undefined)) {
        // Distill list_files result
        compactContent = JSON.stringify({
          basePath: parsed.basePath || '.',
          count: parsed.count || parsed.entries?.length || 0,
          summary: '(Repository directory listing processed in earlier step)',
        });
      } else if (Array.isArray(parsed.matches) || parsed.query !== undefined) {
        // Distill search_code result
        compactContent = JSON.stringify({
          query: parsed.query,
          count: parsed.count || parsed.matches?.length || 0,
          summary: '(Code search results processed in earlier step)',
        });
      } else if (parsed.command && (parsed.stdout !== undefined || parsed.stderr !== undefined)) {
        // Distill run_command or run_tests result
        compactContent = JSON.stringify({
          command: parsed.command,
          passed: parsed.passed ?? (parsed.exitCode === 0),
          exitCode: parsed.exitCode,
          summary: parsed.summary || (parsed.exitCode === 0 ? 'Command succeeded' : 'Command failed'),
        });
      } else {
        // Generic compaction: keep top 200 chars
        compactContent = truncateMiddle(msg.content, 80).text;
      }
    } catch {
      // Non-JSON content: truncate down to 80 tokens
      compactContent = truncateMiddle(msg.content, 80).text;
    }

    distilledCount++;
    return {
      ...msg,
      content: compactContent,
    };
  });

  return { messages, distilledCount };
}

