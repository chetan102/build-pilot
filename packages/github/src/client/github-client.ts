import { Octokit } from '@octokit/rest';
import { createLogger, Logger } from '@buildpilot/observability';

const defaultLogger = createLogger({ serviceName: 'github-client' });

export interface GitHubClientOptions {
  auth?: string;
  baseUrl?: string;
  logger?: Logger;
}

export interface CreatePullRequestParams {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
}

export interface GitHubRepositorySummary {
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
}

export interface GitHubUserProfile {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

export interface OAuthTokenExchangeResult {
  accessToken: string;
  tokenType: string;
  scope: string;
}

export class GitHubService {
  private octokit: Octokit;
  private logger: Logger;

  constructor(options: GitHubClientOptions = {}) {
    this.logger = options.logger || defaultLogger;
    this.octokit = new Octokit({
      auth: options.auth || process.env.GITHUB_TOKEN,
      baseUrl: options.baseUrl,
    });
  }

  getOAuthAuthorizationUrl(params: {
    clientId: string;
    redirectUri?: string;
    state?: string;
    scope?: string;
  }): string {
    const {
      clientId,
      redirectUri = process.env.GITHUB_OAUTH_REDIRECT_URI || 'http://localhost:4000/api/v1/github/oauth/callback',
      state = 'buildpilot_oauth',
      scope = 'repo,read:user,user:email',
    } = params;

    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      allow_signup: 'true',
    });

    return `https://github.com/login/oauth/authorize?${query.toString()}`;
  }

  async exchangeOAuthCode(params: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri?: string;
  }): Promise<OAuthTokenExchangeResult> {
    const { clientId, clientSecret, code, redirectUri } = params;
    this.logger.info('Exchanging OAuth code for GitHub access token');

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      throw new Error(`GitHub OAuth exchange failed: ${res.statusText}`);
    }

    const data: any = await res.json();
    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type || 'bearer',
      scope: data.scope || '',
    };
  }

  async getAuthenticatedUser(customAuth?: string): Promise<GitHubUserProfile> {
    const client = customAuth ? new Octokit({ auth: customAuth }) : this.octokit;
    const res = await client.rest.users.getAuthenticated();
    return {
      id: res.data.id,
      login: res.data.login,
      name: res.data.name,
      email: res.data.email,
      avatarUrl: res.data.avatar_url,
      htmlUrl: res.data.html_url,
    };
  }

  async listUserRepositories(customAuth?: string): Promise<GitHubRepositorySummary[]> {
    const client = customAuth ? new Octokit({ auth: customAuth }) : this.octokit;
    this.logger.info('Fetching repositories for authenticated GitHub user');

    const res = await client.rest.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
      affiliation: 'owner,collaborator,organization_member',
    });

    return res.data.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      defaultBranch: repo.default_branch || 'main',
      isPrivate: repo.private,
      description: repo.description,
      htmlUrl: repo.html_url,
      stargazersCount: repo.stargazers_count,
      language: repo.language,
      updatedAt: repo.updated_at,
    }));
  }

  async createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<{ id: number; htmlUrl: string }> {
    this.logger.info({ owner, repo, issueNumber }, 'Posting comment to GitHub issue');
    try {
      const res = await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });

      return {
        id: res.data.id,
        htmlUrl: res.data.html_url,
      };
    } catch (err: any) {
      throw new Error(
        `Failed to post comment on GitHub issue #${issueNumber}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async createPullRequest(params: CreatePullRequestParams): Promise<{
    id: number;
    number: number;
    htmlUrl: string;
    diffUrl: string;
  }> {
    const { owner, repo, title, body, head, base, draft = false } = params;
    this.logger.info({ owner, repo, head, base, title }, 'Creating GitHub Pull Request');

    try {
      const res = await this.octokit.rest.pulls.create({
        owner,
        repo,
        title,
        body,
        head,
        base,
        draft,
      });

      return {
        id: res.data.id,
        number: res.data.number,
        htmlUrl: res.data.html_url,
        diffUrl: res.data.diff_url,
      };
    } catch (err: any) {
      throw new Error(
        `Failed to create GitHub Pull Request from '${head}' to '${base}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async addLabels(
    owner: string,
    repo: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void> {
    try {
      await this.octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels,
      });
    } catch (err: any) {
      this.logger.warn({ owner, repo, issueNumber, err }, 'Failed to add labels to issue');
    }
  }
}

export const gitHubService = new GitHubService();
