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
