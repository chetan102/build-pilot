import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createLogger, Logger } from '@buildpilot/observability';

const execFileAsync = promisify(execFile);
const defaultLogger = createLogger({ serviceName: 'git-repo-manager' });

export interface CloneOrFetchOptions {
  repoUrl: string;
  targetDir: string;
  defaultBranch?: string;
  logger?: Logger;
  timeoutMs?: number;
}

export interface RepoPreparationResult {
  repoDir: string;
  defaultBranch: string;
  fetched: boolean;
  cloned: boolean;
}

export class GitRepositoryManager {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger;
  }

  async cloneOrFetch(options: CloneOrFetchOptions): Promise<RepoPreparationResult> {
    const { repoUrl, targetDir, defaultBranch = 'main', timeoutMs = 120000 } = options;
    const logger = options.logger || this.logger;

    await fs.mkdir(path.dirname(targetDir), { recursive: true });

    let isGitRepo = false;
    try {
      await fs.access(path.join(targetDir, '.git'));
      isGitRepo = true;
    } catch {
      isGitRepo = false;
    }

    if (!isGitRepo) {
      logger.info({ repoUrl, targetDir }, 'Cloning repository mirror');
      try {
        await execFileAsync('git', ['clone', repoUrl, targetDir], {
          timeout: timeoutMs,
        });
        return {
          repoDir: targetDir,
          defaultBranch,
          cloned: true,
          fetched: false,
        };
      } catch (err: any) {
        throw new Error(`Git clone failed for '${repoUrl}': ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      logger.info({ repoUrl, targetDir }, 'Fetching latest refs for existing repository mirror');
      try {
        await execFileAsync('git', ['fetch', '--all', '--prune'], {
          cwd: targetDir,
          timeout: timeoutMs,
        });
        return {
          repoDir: targetDir,
          defaultBranch,
          cloned: false,
          fetched: true,
        };
      } catch (err: any) {
        throw new Error(`Git fetch failed for repo at '${targetDir}': ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  async getDefaultBranch(repoDir: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['rev-parse', '--abbrev-ref', 'origin/HEAD'],
        { cwd: repoDir },
      );
      const branch = stdout.trim().replace(/^origin\//, '');
      return branch || 'main';
    } catch {
      return 'main';
    }
  }
}

export const gitRepositoryManager = new GitRepositoryManager();
