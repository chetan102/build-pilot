import { LLMMessage } from '@buildpilot/llm';
import { TokenBudgetOptions } from './types.js';

export const DEFAULT_TOKEN_BUDGET: TokenBudgetOptions = {
  maxContextTokens: 128000,
  reservedOutputTokens: 4096,
  maxToolOutputTokens: 8000,
  maxHistoryMessages: 50,
  maxFileTreeTokens: 4000,
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
 * Retains the first message (task instruction) and latest messages, truncating older intermediate steps.
 */
export function pruneConversationHistory(
  history: LLMMessage[],
  availableTokens: number,
): { messages: LLMMessage[]; wasTruncated: boolean; droppedCount: number } {
  if (history.length <= 1) {
    return { messages: [...history], wasTruncated: false, droppedCount: 0 };
  }

  const totalHistoryTokens = estimateMessagesTokens(history);
  if (totalHistoryTokens <= availableTokens) {
    return { messages: [...history], wasTruncated: false, droppedCount: 0 };
  }

  // Always keep the very first message (initial instruction)
  const firstMsg = history[0]!;
  const firstTokens = estimateMessageTokens(firstMsg);
  const remainingBudget = Math.max(0, availableTokens - firstTokens);

  // Walk backwards from the latest message to pack as many recent messages as possible
  const recentMessages: LLMMessage[] = [];
  let accumulatedTokens = 0;
  let droppedCount = 0;

  for (let i = history.length - 1; i >= 1; i--) {
    const msg = history[i]!;
    const msgTokens = estimateMessageTokens(msg);

    if (accumulatedTokens + msgTokens <= remainingBudget) {
      recentMessages.unshift(msg);
      accumulatedTokens += msgTokens;
    } else {
      droppedCount++;
    }
  }

  const result: LLMMessage[] = [firstMsg];

  if (droppedCount > 0) {
    result.push({
      role: 'system',
      content: `[Note: ${droppedCount} older conversation steps were pruned to preserve context window token budget.]`,
    });
  }

  result.push(...recentMessages);

  return {
    messages: result,
    wasTruncated: droppedCount > 0,
    droppedCount,
  };
}

