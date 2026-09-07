import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createLogger, Logger } from '@buildpilot/observability';

const execFileAsync = promisify(execFile);
const defaultLogger = createLogger({ serviceName: 'git-worktree-manager' });

export interface CreateWorktreeOptions {
  repoDir: string;
  taskId: string;
  runId: string;
  baseBranch?: string;
  taskBranch?: string;
  worktreesRoot?: string;
}

export interface WorktreeInfo {
  worktreePath: string;
  branch: string;
  baseBranch: string;
  taskId: string;
  runId: string;
}

export class GitWorktreeManager {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger;
  }

  async createWorktree(options: CreateWorktreeOptions): Promise<WorktreeInfo> {
    const {
      repoDir,
      taskId,
      runId,
      baseBranch = 'main',
      worktreesRoot = path.join(path.dirname(repoDir), 'worktrees'),
    } = options;

    const shortTaskId = taskId.slice(-8);
    const shortRunId = runId.slice(-6);
    const branch = options.taskBranch || `buildpilot/task-${shortTaskId}-${shortRunId}`;
    const worktreePath = path.join(worktreesRoot, `${taskId}_${runId}`);

    await fs.mkdir(worktreesRoot, { recursive: true });

    this.logger.info(
      { repoDir, branch, baseBranch, worktreePath },
      'Creating isolated Git worktree for task run',
    );

    try {
      // Create worktree with a new dedicated branch from baseBranch
      await execFileAsync(
        'git',
        ['worktree', 'add', '-b', branch, worktreePath, baseBranch],
        { cwd: repoDir },
      );

      return {
        worktreePath,
        branch,
        baseBranch,
        taskId,
        runId,
      };
    } catch (err: any) {
      // If branch already exists, try attaching without -b
      try {
        await execFileAsync(
          'git',
          ['worktree', 'add', worktreePath, branch],
          { cwd: repoDir },
        );
        return {
          worktreePath,
          branch,
          baseBranch,
          taskId,
          runId,
        };
      } catch {
        throw new Error(
          `Failed to create Git worktree at '${worktreePath}': ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async removeWorktree(repoDir: string, worktreePath: string): Promise<void> {
    this.logger.info({ repoDir, worktreePath }, 'Removing Git worktree and cleaning up');
    try {
      await execFileAsync('git', ['worktree', 'remove', '--force', worktreePath], {
        cwd: repoDir,
      });
    } catch {
      // Fallback manual directory cleanup
      try {
        await fs.rm(worktreePath, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }

    try {
      await execFileAsync('git', ['worktree', 'prune'], { cwd: repoDir });
    } catch {
      // ignore
    }
  }

  async listWorktrees(repoDir: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
        cwd: repoDir,
      });
      const paths: string[] = [];
      for (const line of stdout.split('\n')) {
        if (line.startsWith('worktree ')) {
          paths.push(line.replace(/^worktree /, '').trim());
        }
      }
      return paths;
    } catch {
      return [];
    }
  }
}

export const gitWorktreeManager = new GitWorktreeManager();
