export interface MockTask {
  id: string;
  issueNumber: number;
  title: string;
  description: string;
  repository: string;
  branch: string;
  status:
    | 'QUEUED'
    | 'PLANNING'
    | 'READY_FOR_DEVELOPMENT'
    | 'DEVELOPMENT'
    | 'TESTING'
    | 'REPAIRING'
    | 'REVIEW'
    | 'CHANGES_REQUESTED'
    | 'AWAITING_APPROVAL'
    | 'PR_READY'
    | 'COMPLETED'
    | 'FAILED';
  prUrl?: string;
  prNumber?: number;
  provider: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  durationMs: number;
  tokenCount: number;
  costEstimate: string;
  testSummary?: {
    passed: number;
    failed: number;
    total: number;
  };
  steps: Array<{
    id: string;
    stage: string;
    status: 'completed' | 'running' | 'failed' | 'pending';
    title: string;
    description: string;
    durationMs?: number;
    timestamp: string;
    toolCall?: {
      name: string;
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    };
  }>;
  diffPreview?: string;
}

export interface MockProject {
  id: string;
  name: string;
  description: string;
  repositoryCount: number;
  activeTaskCount: number;
  completedTaskCount: number;
  createdAt: string;
}

export interface MockRepository {
  id: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  githubInstallationId: string;
  webhookActive: boolean;
  activeTasks: number;
  totalRuns: number;
  lastActivity: string;
}

export interface MockProvider {
  id: string;
  name: string;
  type: 'openrouter' | 'openai' | 'gemini' | 'anthropic';
  status: 'connected' | 'not_configured' | 'error';
  defaultModel: string;
  availableModels: string[];
  hasApiKey: boolean;
}

export const MOCK_PROJECTS: MockProject[] = [
  {
    id: 'proj_1',
    name: 'Core Services Backplane',
    description: 'Autonomous engineering pipeline for core microservices & control APIs',
    repositoryCount: 3,
    activeTaskCount: 3,
    completedTaskCount: 24,
    createdAt: '2026-08-15T10:00:00Z',
  },
  {
    id: 'proj_2',
    name: 'Frontend Web Apps',
    description: 'Autonomous UI bug fixes, modern components, and accessibility testing',
    repositoryCount: 2,
    activeTaskCount: 1,
    completedTaskCount: 18,
    createdAt: '2026-08-20T14:30:00Z',
  },
];

export const MOCK_REPOSITORIES: MockRepository[] = [
  {
    id: 'repo_1',
    name: 'build-pilot',
    fullName: 'chetan102/build-pilot',
    defaultBranch: 'main',
    githubInstallationId: 'inst_491028',
    webhookActive: true,
    activeTasks: 2,
    totalRuns: 34,
    lastActivity: '2026-09-06T06:45:00Z',
  },
  {
    id: 'repo_2',
    name: 'e-commerce-api',
    fullName: 'chetan102/e-commerce-api',
    defaultBranch: 'main',
    githubInstallationId: 'inst_491028',
    webhookActive: true,
    activeTasks: 1,
    totalRuns: 19,
    lastActivity: '2026-09-06T05:12:00Z',
  },
  {
    id: 'repo_3',
    name: 'customer-portal-web',
    fullName: 'chetan102/customer-portal-web',
    defaultBranch: 'main',
    githubInstallationId: 'inst_491028',
    webhookActive: true,
    activeTasks: 1,
    totalRuns: 12,
    lastActivity: '2026-09-05T22:30:00Z',
  },
];

export const MOCK_PROVIDERS: MockProvider[] = [
  {
    id: 'prov_openrouter',
    name: 'OpenRouter Gateway',
    type: 'openrouter',
    status: 'connected',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    availableModels: [
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o',
      'google/gemini-2.0-flash-001',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    hasApiKey: true,
  },
  {
    id: 'prov_gemini',
    name: 'Google Gemini Native',
    type: 'gemini',
    status: 'connected',
    defaultModel: 'gemini-2.0-flash',
    availableModels: ['gemini-2.0-flash', 'gemini-2.0-pro-exp-02-05', 'gemini-1.5-pro'],
    hasApiKey: true,
  },
  {
    id: 'prov_openai',
    name: 'OpenAI Direct',
    type: 'openai',
    status: 'connected',
    defaultModel: 'gpt-4o',
    availableModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'o1'],
    hasApiKey: true,
  },
  {
    id: 'prov_anthropic',
    name: 'Anthropic Direct',
    type: 'anthropic',
    status: 'not_configured',
    defaultModel: 'claude-3-5-sonnet-20241022',
    availableModels: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    hasApiKey: false,
  },
];

export const MOCK_TASKS: MockTask[] = [
  {
    id: 'task_101',
    issueNumber: 42,
    title: 'Fix incorrect discount percentage rounding in checkout calculation',
    description:
      'The applyDiscount helper in src/calculator.ts subtracts percentage directly instead of computing (price * percentage / 100). Add regression test.',
    repository: 'chetan102/build-pilot',
    branch: 'buildpilot/task-101-discount-fix',
    status: 'COMPLETED',
    prUrl: 'https://github.com/chetan102/build-pilot/pull/43',
    prNumber: 43,
    provider: 'OpenRouter',
    model: 'anthropic/claude-3.5-sonnet',
    createdAt: '2026-09-06T05:00:00Z',
    updatedAt: '2026-09-06T05:08:30Z',
    durationMs: 510000,
    tokenCount: 14200,
    costEstimate: '$0.042',
    testSummary: { passed: 6, failed: 0, total: 6 },
    diffPreview: `--- a/src/calculator.ts
+++ b/src/calculator.ts
@@ -1,3 +1,3 @@
 export function applyDiscount(price: number, percentage: number): number {
-  return price - percentage;
+  return Number((price - (price * percentage) / 100).toFixed(2));
 }`,
    steps: [
      {
        id: 'step_1',
        stage: 'PLANNING',
        status: 'completed',
        title: 'Plan implementation & verify affected files',
        description: 'Planner inspected repository structure and pinpointed src/calculator.ts and test suite.',
        durationMs: 4200,
        timestamp: '2026-09-06T05:00:10Z',
        toolCall: {
          name: 'search_code',
          input: { query: 'applyDiscount' },
          output: { matchCount: 1, files: ['src/calculator.ts'] },
        },
      },
      {
        id: 'step_2',
        stage: 'DEVELOPMENT',
        status: 'completed',
        title: 'Edit src/calculator.ts and update test coverage',
        description: 'Applied correct math formula and added boundary checks.',
        durationMs: 6500,
        timestamp: '2026-09-06T05:02:15Z',
        toolCall: {
          name: 'write_file',
          input: { path: 'src/calculator.ts' },
          output: { bytesWritten: 142, success: true },
        },
      },
      {
        id: 'step_3',
        stage: 'TESTING',
        status: 'completed',
        title: 'Execute test suite in isolated Docker sandbox',
        description: 'Vitest executed 6 test suites with 100% pass rate.',
        durationMs: 3800,
        timestamp: '2026-09-06T05:04:40Z',
        toolCall: {
          name: 'run_tests',
          input: { command: 'pnpm test' },
          output: { passed: 6, failed: 0, duration: '2.4s' },
        },
      },
      {
        id: 'step_4',
        stage: 'REVIEW',
        status: 'completed',
        title: 'Reviewer agent verification & policy checks',
        description: 'Reviewer approved diff. No security risks or unintended file modifications detected.',
        durationMs: 3100,
        timestamp: '2026-09-06T05:06:20Z',
      },
      {
        id: 'step_5',
        stage: 'PR_READY',
        status: 'completed',
        title: 'Create GitHub Pull Request #43',
        description: 'Committed verified changes to branch and opened PR #43 with detailed execution evidence.',
        durationMs: 2400,
        timestamp: '2026-09-06T05:08:30Z',
        toolCall: {
          name: 'create_pull_request',
          input: { branch: 'buildpilot/task-101-discount-fix', base: 'main' },
          output: { prNumber: 43, url: 'https://github.com/chetan102/build-pilot/pull/43' },
        },
      },
    ],
  },
  {
    id: 'task_102',
    issueNumber: 44,
    title: 'Add input validation schema for Task creation payload',
    description:
      'Ensure projectId, title, and initialStatus adhere to Zod validation constraints before database insertion.',
    repository: 'chetan102/build-pilot',
    branch: 'buildpilot/task-102-validation-schema',
    status: 'DEVELOPMENT',
    provider: 'OpenRouter',
    model: 'anthropic/claude-3.5-sonnet',
    createdAt: '2026-09-06T06:15:00Z',
    updatedAt: '2026-09-06T06:18:20Z',
    durationMs: 200000,
    tokenCount: 6800,
    costEstimate: '$0.021',
    steps: [
      {
        id: 'step_1',
        stage: 'PLANNING',
        status: 'completed',
        title: 'Analyze schemas in packages/domain',
        description: 'Planner read existing Zod schemas and defined TaskCreateInput schema.',
        durationMs: 3900,
        timestamp: '2026-09-06T06:15:10Z',
      },
      {
        id: 'step_2',
        stage: 'DEVELOPMENT',
        status: 'running',
        title: 'Implement TaskCreateInputSchema in packages/domain',
        description: 'Developer agent is actively modifying domain types and adding unit test fixtures.',
        timestamp: '2026-09-06T06:17:00Z',
      },
    ],
  },
  {
    id: 'task_103',
    issueNumber: 45,
    title: 'Handle redis connection retry with exponential backoff',
    description:
      'Configure BullMQ queue connection to gracefully retry upon transient network interruption.',
    repository: 'chetan102/build-pilot',
    branch: 'buildpilot/task-103-redis-backoff',
    status: 'TESTING',
    provider: 'Gemini Direct',
    model: 'gemini-2.0-flash',
    createdAt: '2026-09-06T06:20:00Z',
    updatedAt: '2026-09-06T06:23:45Z',
    durationMs: 225000,
    tokenCount: 8400,
    costEstimate: '$0.009',
    steps: [
      {
        id: 'step_1',
        stage: 'PLANNING',
        status: 'completed',
        title: 'Create backoff specification',
        description: 'Selected exponential retry schedule with jitter.',
        durationMs: 2800,
        timestamp: '2026-09-06T06:20:10Z',
      },
      {
        id: 'step_2',
        stage: 'DEVELOPMENT',
        status: 'completed',
        title: 'Add reconnection retry options',
        description: 'Updated ioredis and BullMQ connection config.',
        durationMs: 4100,
        timestamp: '2026-09-06T06:21:40Z',
      },
      {
        id: 'step_3',
        stage: 'TESTING',
        status: 'running',
        title: 'Executing connection failover unit tests',
        description: 'Simulating Redis disconnect and validating reconnect timer.',
        timestamp: '2026-09-06T06:23:00Z',
      },
    ],
  },
  {
    id: 'task_104',
    issueNumber: 46,
    title: 'Production database index optimization on TaskRun collection',
    description:
      'High-risk migration modifying collection indexes. Requires human approval before running schema alterations.',
    repository: 'chetan102/build-pilot',
    branch: 'buildpilot/task-104-db-indexes',
    status: 'AWAITING_APPROVAL',
    provider: 'OpenAI Direct',
    model: 'gpt-4o',
    createdAt: '2026-09-06T06:30:00Z',
    updatedAt: '2026-09-06T06:34:10Z',
    durationMs: 251000,
    tokenCount: 9200,
    costEstimate: '$0.028',
    steps: [
      {
        id: 'step_1',
        stage: 'PLANNING',
        status: 'completed',
        title: 'Index analysis and query plan evaluation',
        description: 'Identified missing compound index on { taskId: 1, createdAt: -1 }.',
        durationMs: 3400,
        timestamp: '2026-09-06T06:30:10Z',
      },
      {
        id: 'step_2',
        stage: 'AWAITING_APPROVAL',
        status: 'running',
        title: 'Approval required for database migration',
        description: 'Action classified as HIGH_RISK. Waiting for human approval to apply index script.',
        timestamp: '2026-09-06T06:34:00Z',
      },
    ],
  },
  {
    id: 'task_105',
    issueNumber: 47,
    title: 'Add JWT token refresh endpoint in Control API',
    description: 'Provide POST /api/v1/auth/refresh to exchange refresh token for new access token.',
    repository: 'chetan102/e-commerce-api',
    branch: 'buildpilot/task-105-jwt-refresh',
    status: 'PLANNING',
    provider: 'OpenRouter',
    model: 'anthropic/claude-3.5-sonnet',
    createdAt: '2026-09-06T06:40:00Z',
    updatedAt: '2026-09-06T06:41:15Z',
    durationMs: 75000,
    tokenCount: 3100,
    costEstimate: '$0.009',
    steps: [
      {
        id: 'step_1',
        stage: 'PLANNING',
        status: 'running',
        title: 'Scanning auth middleware and route handlers',
        description: 'Planner is examining token signature strategy.',
        timestamp: '2026-09-06T06:40:10Z',
      },
    ],
  },
  {
    id: 'task_106',
    issueNumber: 48,
    title: 'Migrate legacy CSS color tokens to Tailwind theme variables',
    description: 'Replace hardcoded hex values with CSS variables for dark mode support.',
    repository: 'chetan102/customer-portal-web',
    branch: 'buildpilot/task-106-theme-tokens',
    status: 'QUEUED',
    provider: 'OpenRouter',
    model: 'anthropic/claude-3.5-sonnet',
    createdAt: '2026-09-06T06:45:00Z',
    updatedAt: '2026-09-06T06:45:00Z',
    durationMs: 0,
    tokenCount: 0,
    costEstimate: '$0.000',
    steps: [],
  },
];

