import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger, Logger } from '@buildpilot/observability';

const execFileAsync = promisify(execFile);
const defaultLogger = createLogger({ serviceName: 'git-commit-push' });

export interface CreateTaskCommitOptions {
  worktreePath: string;
  message: string;
  taskId: string;
  issueNumber?: number;
  author?: {
    name: string;
    email: string;
  };
}

export interface CommitResult {
  commitSha: string;
  branch: string;
  filesChanged: string[];
  message: string;
}

export interface PushTaskBranchOptions {
  worktreePath: string;
  branch: string;
  remote?: string;
  force?: boolean;
  repoUrl?: string;
}

export class GitCommitPushService {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger;
  }

  async createCommit(options: CreateTaskCommitOptions): Promise<CommitResult> {
    const { worktreePath, message, taskId, issueNumber, author } = options;
    const authorName = author?.name || 'BuildPilot Agent';
    const authorEmail = author?.email || 'agent@buildpilot.dev';

    // 1. Stage all changes
    await execFileAsync('git', ['add', '-A'], { cwd: worktreePath });

    // 2. Inspect status to ensure there are staged changes
    const { stdout: statusOut } = await execFileAsync(
      'git',
      ['status', '--porcelain=v1'],
      { cwd: worktreePath },
    );

    const changedFiles = statusOut
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => l.slice(3).trim());

    if (changedFiles.length === 0) {
      throw new Error('No staged changes found in worktree to commit');
    }

    // 3. Format structured commit message
    const issueTag = issueNumber ? ` (fixes #${issueNumber})` : '';
    const structuredMessage = `${message}${issueTag}\n\nTask-ID: ${taskId}\nAutomated-By: BuildPilot`;

    // 4. Commit with author signature
    await execFileAsync(
      'git',
      [
        '-c',
        `user.name=${authorName}`,
        '-c',
        `user.email=${authorEmail}`,
        'commit',
        '-m',
        structuredMessage,
      ],
      { cwd: worktreePath },
    );

    // 5. Get commit SHA and current branch
    const { stdout: shaOut } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: worktreePath,
    });
    const { stdout: branchOut } = await execFileAsync(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: worktreePath },
    );

    const commitSha = shaOut.trim();
    const branch = branchOut.trim();

    this.logger.info(
      { commitSha, branch, changedCount: changedFiles.length, taskId },
      'Successfully created task commit in worktree',
    );

    return {
      commitSha,
      branch,
      filesChanged: changedFiles,
      message: structuredMessage,
    };
  }

  async pushBranch(options: PushTaskBranchOptions): Promise<{ pushed: boolean; remoteRef: string }> {
    const { worktreePath, branch, remote = 'origin', force = false, repoUrl } = options;

    if (repoUrl) {
      try {
        await execFileAsync('git', ['remote', 'set-url', remote, repoUrl], { cwd: worktreePath });
      } catch {
        // non-fatal, fallback to pushing directly to URL
      }
    }

    const pushTarget = repoUrl || remote;
    const args = ['push', pushTarget, branch];
    if (force) {
      args.push('--force');
    }

    this.logger.info({ branch, remote, worktreePath }, 'Pushing task branch to remote');

    try {
      await execFileAsync('git', args, { cwd: worktreePath });
      return {
        pushed: true,
        remoteRef: `${remote}/${branch}`,
      };
    } catch (err: any) {
      throw new Error(
        `Failed to push branch '${branch}' to remote '${remote}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

export const gitCommitPushService = new GitCommitPushService();
