import { LLMMessage } from '@buildpilot/llm';

export interface TaskContext {
  taskId: string;
  runId: string;
  projectId: string;
  repositoryId: string;
  issueNumber: number;
  title: string;
  description?: string;
  branch: string;
  baseBranch?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  userInstructions?: string;
}

export interface RepoContext {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  activeBranch?: string;
  workspacePath?: string;
  fileTree?: string[];
  fileTreeSummary?: string;
  detectedLanguages?: string[];
  frameworks?: string[];
  guidelines?: string;
  packageInfo?: {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
}

export interface TokenBudgetOptions {
  /**
   * Maximum total context window token capacity for the selected model
   * @default 128000
   */
  maxContextTokens: number;

  /**
   * Tokens reserved for the model's completion output
   * @default 4096
   */
  reservedOutputTokens: number;

  /**
   * Maximum tokens allocated per individual tool output before truncation
   * @default 8000
   */
  maxToolOutputTokens: number;

  /**
   * Maximum conversation history messages to retain in active memory
   * @default 50
   */
  maxHistoryMessages: number;

  /**
   * Maximum tokens allocated for file tree summary
   * @default 4000
   */
  maxFileTreeTokens: number;
}

export interface ContextBuildOptions {
  task: TaskContext;
  repo?: RepoContext;
  history?: LLMMessage[];
  systemPromptOverride?: string;
  customGuidelines?: string;
  tokenBudget?: Partial<TokenBudgetOptions>;
}

export interface ContextBuildResult {
  systemPrompt: string;
  messages: LLMMessage[];
  estimatedTokens: number;
  wasTruncated: boolean;
  truncationDetails: string[];
}

