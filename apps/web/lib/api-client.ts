export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface TaskSummary {
  _id: string;
  id: string;
  projectId: string;
  repositoryId: string;
  issueNumber: number;
  title: string;
  description?: string;
  status: string;
  branch: string;
  baseBranch?: string;
  activeRunId?: string;
  completedRunId?: string;
  createdAt: string;
  updatedAt: string;
  durationMs?: number;
  model?: string;
  provider?: string;
  prUrl?: string;
  prNumber?: number;
}

export interface TaskRunSummary {
  _id: string;
  id: string;
  taskId: string;
  status: string;
  branch: string;
  provider: string;
  model: string;
  maxSteps: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  totalTokens?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AgentStepSummary {
  _id: string;
  id: string;
  runId: string;
  taskId: string;
  stage: string;
  title: string;
  thought?: string;
  durationMs?: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  createdAt: string;
}

export interface TaskDetailsResponse {
  task: TaskSummary;
  runs: TaskRunSummary[];
  steps: AgentStepSummary[];
  events?: any[];
  correlationId?: string;
}

export interface PaginatedTasksResponse {
  tasks: TaskSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  correlationId?: string;
}

export interface ProjectSummary {
  _id: string;
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  description?: string;
  defaultBranch?: string;
  createdAt: string;
}

export async function fetchTasks(params: {
  projectId?: string;
  repositoryId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
} = {}): Promise<PaginatedTasksResponse> {
  const query = new URLSearchParams();
  if (params.projectId) query.set('projectId', params.projectId);
  if (params.repositoryId) query.set('repositoryId', params.repositoryId);
  if (params.status && params.status !== 'ALL') query.set('status', params.status);
  if (params.search) query.set('search', params.search);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const res = await fetch(`${API_BASE_URL}/api/v1/tasks?${query.toString()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch tasks: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchTaskDetails(taskId: string): Promise<TaskDetailsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/tasks/${taskId}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch task details: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchProjects(): Promise<{ projects: ProjectSummary[] }> {
  const res = await fetch(`${API_BASE_URL}/api/v1/projects`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch projects: ${res.statusText}`);
  }
  return res.json();
}

export async function cancelTask(taskId: string, reason?: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/tasks/${taskId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason || 'Cancelled by user' }),
  });
  if (!res.ok) {
    throw new Error(`Failed to cancel task: ${res.statusText}`);
  }
  return res.json();
}

export async function retryTask(taskId: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/tasks/${taskId}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to retry task: ${res.statusText}`);
  }
  return res.json();
}

export interface GitHubRepoSummary {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
  isPrivate: boolean;
  description?: string | null;
  htmlUrl: string;
  stargazersCount?: number;
  language?: string | null;
  updatedAt?: string | null;
  alreadyImported?: boolean;
  projectId?: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

export async function fetchGitHubOAuthAuthorize(): Promise<{ configured: boolean; url?: string; message?: string }> {
  const res = await fetch(`${API_BASE_URL}/api/v1/github/oauth/authorize`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to get OAuth authorize URL: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchGitHubUser(token?: string): Promise<{ connected: boolean; user: GitHubUser | null; error?: string }> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-github-token'] = token;
  }

  const res = await fetch(`${API_BASE_URL}/api/v1/github/user`, {
    headers,
    cache: 'no-store',
  });
  if (!res.ok) {
    return { connected: false, user: null };
  }
  return res.json();
}

export async function fetchGitHubRepositories(token?: string): Promise<{ repositories: GitHubRepoSummary[]; count: number }> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-github-token'] = token;
  }

  const res = await fetch(`${API_BASE_URL}/api/v1/github/repos`, {
    headers,
    cache: 'no-store',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch GitHub repositories: ${res.statusText}`);
  }
  return res.json();
}

export async function verifyGitHubToken(token: string): Promise<{ valid: boolean; user?: GitHubUser; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/api/v1/github/oauth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return res.json();
}

export async function importGitHubRepository(data: {
  repoFullName: string;
  name?: string;
  description?: string;
  defaultBranch?: string;
  token?: string;
}): Promise<{ success: boolean; project: ProjectSummary; message?: string }> {
  const res = await fetch(`${API_BASE_URL}/api/v1/github/repos/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to import repository: ${res.statusText}`);
  }
  return res.json();
}

export async function createTaskForProject(
  projectId: string,
  data: {
    title: string;
    description?: string;
    repositoryId?: string;
    baseBranch?: string;
  },
): Promise<{ task: TaskSummary }> {
  const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Failed to create task: ${res.statusText}`);
  }
  return res.json();
}

export function getTaskEventsStreamUrl(taskId: string): string {
  return `${API_BASE_URL}/api/v1/tasks/${taskId}/events`;
}
