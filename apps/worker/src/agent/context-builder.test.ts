import { describe, it, expect } from 'vitest';
import {
  ContextBuilder,
  contextBuilder,
  estimateTokens,
  estimateMessageTokens,
  estimateMessagesTokens,
  truncateMiddle,
  formatAndTruncateFileTree,
  pruneConversationHistory,
  TaskContext,
  RepoContext,
  BASE_SYSTEM_PROMPT,
} from './index.js';
import { LLMMessage } from '@buildpilot/llm';

describe('Agent Runtime — ContextBuilder & Token Budgeting', () => {
  const sampleTask: TaskContext = {
    taskId: 'task_123',
    runId: 'run_456',
    projectId: 'proj_789',
    repositoryId: 'repo_99',
    issueNumber: 42,
    title: 'Fix authentication token expiration bug',
    description: 'JWT tokens are expiring prematurely after 5 minutes instead of 24 hours.',
    branch: 'buildpilot/task-42-jwt',
    baseBranch: 'main',
    tags: ['auth', 'bug'],
    userInstructions: 'Ensure you write tests in auth.test.ts before pushing.',
  };

  const sampleRepo: RepoContext = {
    owner: 'acme-corp',
    name: 'backend-api',
    fullName: 'acme-corp/backend-api',
    defaultBranch: 'main',
    detectedLanguages: ['TypeScript', 'Node.js'],
    frameworks: ['Express', 'Mongoose'],
    packageInfo: {
      name: '@acme/backend',
      scripts: {
        build: 'tsc',
        test: 'vitest run',
      },
    },
    guidelines: 'Use strict TypeScript types. All error messages must be normalized.',
    fileTree: [
      'package.json',
      'tsconfig.json',
      'src/server.ts',
      'src/auth/jwt.ts',
      'src/auth/jwt.test.ts',
      'src/routes/auth.ts',
    ],
  };

  describe('Token Estimation Utilities', () => {
    it('estimates tokens accurately based on character heuristics', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens(null)).toBe(0);
      expect(estimateTokens('Hello world')).toBe(3); // 11 chars / 3.8 ~ 3 tokens
      expect(estimateTokens('a'.repeat(380))).toBe(100);
    });

    it('estimates message tokens including tool calls', () => {
      const msg: LLMMessage = {
        role: 'assistant',
        content: 'I will inspect the JWT implementation.',
        toolCalls: [
          {
            id: 'call_read_1',
            name: 'read_file',
            arguments: { path: 'src/auth/jwt.ts' },
          },
        ],
      };

      const tokens = estimateMessageTokens(msg);
      expect(tokens).toBeGreaterThan(15);
    });

    it('estimates total tokens for message arrays', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'Step 1' },
        { role: 'assistant', content: 'Step 2' },
      ];
      expect(estimateMessagesTokens(messages)).toBeGreaterThan(10);
    });
  });

  describe('Middle-Out Truncation', () => {
    it('leaves short text untouched', () => {
      const text = 'Short output without truncation';
      const result = truncateMiddle(text, 100);
      expect(result.wasTruncated).toBe(false);
      expect(result.text).toBe(text);
    });

    it('truncates oversized text in the middle while preserving head and tail', () => {
      const longText = 'HEAD_START_' + 'x'.repeat(2000) + '_TAIL_END';
      const result = truncateMiddle(longText, 50);

      expect(result.wasTruncated).toBe(true);
      expect(result.text).toContain('HEAD_START_');
      expect(result.text).toContain('_TAIL_END');
      expect(result.text).toContain('... [Content truncated due to context window limits] ...');
      expect(estimateTokens(result.text)).toBeLessThanOrEqual(60);
    });
  });

  describe('File Tree Formatting and Truncation', () => {
    it('formats file tree within budget', () => {
      const files = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
      const result = formatAndTruncateFileTree(files, 500);

      expect(result.wasTruncated).toBe(false);
      expect(result.tree).toContain('- src/a.ts');
      expect(result.tree).toContain('- src/b.ts');
      expect(result.tree).toContain('- src/c.ts');
    });

    it('truncates large file tree when exceeding budget', () => {
      const files = Array.from({ length: 1000 }, (_, i) => `src/components/component_${i}.tsx`);
      const result = formatAndTruncateFileTree(files, 50);

      expect(result.wasTruncated).toBe(true);
      expect(result.tree).toContain('... and ');
      expect(result.tree).toContain('more files (truncated)');
    });
  });

  describe('Conversation History Pruning', () => {
    it('preserves initial prompt and prunes middle conversation history', () => {
      const initialPrompt: LLMMessage = {
        role: 'user',
        content: 'Initial task instruction: Solve issue #42',
      };

      const history: LLMMessage[] = [
        initialPrompt,
        ...Array.from({ length: 30 }, (_, i) => ({
          role: 'assistant' as const,
          content: `Intermediate step ${i}: Executing search step with verbose output ${'log '.repeat(50)}`,
        })),
        { role: 'assistant', content: 'Final recent step: all tests pass.' },
      ];

      // Total history is large (~4000 tokens), restrict budget to ~500 tokens
      const { messages, wasTruncated, droppedCount } = pruneConversationHistory(history, 500);

      expect(wasTruncated).toBe(true);
      expect(droppedCount).toBeGreaterThan(10);
      // Verify initial message is always preserved
      expect(messages[0]?.content).toBe('Initial task instruction: Solve issue #42');
      // Verify pruning notice is injected
      expect(messages[1]?.content).toContain('older conversation steps were pruned');
      // Verify latest message is preserved
      expect(messages[messages.length - 1]?.content).toBe('Final recent step: all tests pass.');
    });
  });

  describe('ContextBuilder Assembly', () => {
    it('builds complete structured prompt and messages for a new task', () => {
      const builder = new ContextBuilder();
      const result = builder.build({
        task: sampleTask,
        repo: sampleRepo,
      });

      expect(result.systemPrompt).toContain('BuildPilot Autonomous AI Software Engineer');
      expect(result.systemPrompt).toContain('Issue #42');
      expect(result.systemPrompt).toContain('Fix authentication token expiration bug');
      expect(result.systemPrompt).toContain('acme-corp/backend-api');
      expect(result.systemPrompt).toContain('src/auth/jwt.ts');
      expect(result.systemPrompt).toContain('Use strict TypeScript types');

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.role).toBe('user');
      expect(result.messages[0]?.content).toContain('Please solve Issue #42');
      expect(result.messages[0]?.content).toContain('JWT tokens are expiring prematurely');

      expect(result.wasTruncated).toBe(false);
      expect(result.estimatedTokens).toBeGreaterThan(50);
    });

    it('handles system prompt overrides and custom guidelines', () => {
      const builder = new ContextBuilder();
      const result = builder.build({
        task: sampleTask,
        systemPromptOverride: 'You are a custom AI agent.',
        customGuidelines: 'Never delete any files.',
      });

      expect(result.systemPrompt).toContain('You are a custom AI agent.');
      expect(result.systemPrompt).toContain('Never delete any files.');
      expect(result.systemPrompt).not.toContain('BuildPilot Autonomous AI Software Engineer');
    });

    it('truncates oversized tool outputs in history messages', () => {
      const builder = new ContextBuilder();
      const hugeLog = 'LOG_LINE_START\n' + 'test output log line\n'.repeat(2000) + 'LOG_LINE_END';

      const history: LLMMessage[] = [
        { role: 'user', content: 'Run test suite' },
        {
          role: 'assistant',
          content: 'Running tests now',
          toolCalls: [{ id: 'call_test_1', name: 'run_command', arguments: { cmd: 'pnpm test' } }],
        },
        {
          role: 'tool',
          toolCallId: 'call_test_1',
          content: hugeLog,
        },
      ];

      const result = builder.build({
        task: sampleTask,
        repo: sampleRepo,
        history,
        tokenBudget: {
          maxToolOutputTokens: 200, // strict tool output limit
        },
      });

      expect(result.wasTruncated).toBe(true);
      expect(result.truncationDetails.some((d) => d.includes('call_test_1'))).toBe(true);

      const toolMsg = result.messages.find((m) => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      expect(toolMsg?.content).toContain('Content truncated due to context window limits');
      expect(toolMsg?.content).toContain('LOG_LINE_START');
      expect(toolMsg?.content).toContain('LOG_LINE_END');
    });

    it('enforces total token budget constraint (Acceptance Criteria)', () => {
      const builder = new ContextBuilder();

      // Create a massive history with 50 messages
      const history: LLMMessage[] = [
        { role: 'user', content: 'Initial prompt' },
        ...Array.from({ length: 50 }, (_, i) => ({
          role: 'assistant' as const,
          content: `Step ${i}: Processing file data with large context payload ${'code block '.repeat(100)}`,
        })),
      ];

      const result = builder.build({
        task: sampleTask,
        repo: sampleRepo,
        history,
        tokenBudget: {
          maxContextTokens: 4000,
          reservedOutputTokens: 1000,
        },
      });

      expect(result.wasTruncated).toBe(true);
      expect(result.estimatedTokens).toBeLessThanOrEqual(4000);
      expect(result.messages[0]?.content).toBe('Initial prompt');
    });
  });
});

