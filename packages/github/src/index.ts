export * from './git/index.js';
export * from './client/webhook-verifier.js';
export * from './client/github-client.js';

export interface GitHubIssuePayload {
  action?: string;
  number?: number;
  title?: string;
  body?: string;
  labels?: Array<{ name: string }>;
  issue?: {
    number: number;
    title: string;
    body?: string;
    html_url?: string;
    labels?: Array<{ name: string }>;
  };
  label?: {
    name: string;
  };
  repository: {
    owner: { login: string };
    name: string;
    full_name: string;
    clone_url?: string;
    default_branch?: string;
  };
}

export function isIssueEligible(
  payload: GitHubIssuePayload,
  triggerLabel = 'buildpilot',
): boolean {
  const labelNames: string[] = [];

  if (payload.label?.name) {
    labelNames.push(payload.label.name);
  }
  if (Array.isArray(payload.labels)) {
    for (const l of payload.labels) {
      if (l.name) labelNames.push(l.name);
    }
  }
  if (Array.isArray(payload.issue?.labels)) {
    for (const l of payload.issue.labels) {
      if (l.name) labelNames.push(l.name);
    }
  }

  return labelNames.some((name) => name.toLowerCase() === triggerLabel.toLowerCase());
}
