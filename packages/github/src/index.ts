export interface GitHubIssuePayload {
  number: number;
  title: string;
  body?: string;
  labels?: Array<{ name: string }>;
  repository: {
    owner: { login: string };
    name: string;
    full_name: string;
  };
}

export function isIssueEligible(
  payload: GitHubIssuePayload,
  triggerLabel = 'buildpilot',
): boolean {
  return (
    payload.labels?.some((l) => l.name.toLowerCase() === triggerLabel.toLowerCase()) ??
    false
  );
}

