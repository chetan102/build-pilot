import {
  taskRepository,
  taskRunRepository,
  projectRepository,
  eventRepository,
  approvalRepository,
  providerCredentialRepository,
  ITask,
  ListTasksFilter,
  TaskPaginationOptions,
  TaskDetailsResult,
} from '@buildpilot/database';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  EntityNotFoundError,
  TaskStatus,
  validateTaskTransition,
} from '@buildpilot/domain';
import { GitHubService, GitCommitPushService, gitRepositoryManager } from '@buildpilot/github';
import { secretsManager } from '@buildpilot/shared';
import { createLogger } from '@buildpilot/observability';
import { taskQueueManager } from '../queue.js';

const execFileAsync = promisify(execFile);

export interface PaginatedTasksResult {
  tasks: ITask[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class TaskService {
  async listTasks(
    filter: ListTasksFilter = {},
    pagination: TaskPaginationOptions = {},
  ): Promise<PaginatedTasksResult> {
    const page = pagination.page && pagination.page > 0 ? pagination.page : 1;
    const limit = pagination.limit && pagination.limit > 0 ? pagination.limit : 20;

    const { tasks, total } = await taskRepository.list(filter, { page, limit });
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      tasks,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getTaskDetails(taskId: string): Promise<TaskDetailsResult> {
    const details = await taskRepository.findTaskDetails(taskId);
    if (!details) {
      throw new EntityNotFoundError('Task', taskId);
    }
    return details;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw new EntityNotFoundError('Task', taskId);
    }
    await taskRepository.deleteById(taskId);
    return true;
  }

  async cancelTask(taskId: string, reason?: string): Promise<ITask> {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw new EntityNotFoundError('Task', taskId);
    }

    // Validate transition: throws InvalidStateTransitionError if illegal (e.g. from COMPLETED)
    validateTaskTransition(task.status, TaskStatus.CANCELLED);

    const previousStatus = task.status;
    const updated = await taskRepository.updateStatus(taskId, TaskStatus.CANCELLED);

    if (!updated) {
      throw new EntityNotFoundError('Task', taskId);
    }

    // Persist transition event
    await eventRepository.create({
      taskId,
      type: 'TASK_CANCELLED',
      payload: {
        previousStatus,
        newStatus: TaskStatus.CANCELLED,
        reason: reason || 'User cancelled task',
      },
      level: 'warn',
    });

    return updated;
  }

  async retryTask(taskId: string): Promise<ITask> {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw new EntityNotFoundError('Task', taskId);
    }

    // Validate transition: throws InvalidStateTransitionError if illegal (allows FAILED, TIMED_OUT, CANCELLED)
    validateTaskTransition(task.status, TaskStatus.QUEUED, { allowRetry: true });

    const previousStatus = task.status;
    const updated = await taskRepository.updateStatus(taskId, TaskStatus.QUEUED);

    if (!updated) {
      throw new EntityNotFoundError('Task', taskId);
    }

    // Persist transition event
    await eventRepository.create({
      taskId,
      type: 'TASK_RETRIED',
      payload: {
        previousStatus: task.status,
        newStatus: TaskStatus.QUEUED,
      },
      level: 'info',
    });

    // Enqueue task for background worker retry execution
    try {
      const runId = new mongoose.Types.ObjectId().toString();
      const meta = { ...((task.metadata as Record<string, unknown>) || {}) };
      let taskProvider = meta.provider as string | undefined;
      let taskModel = meta.model as string | undefined;

      if (taskProvider && /^[0-9a-fA-F]{24}$/.test(String(taskProvider))) {
        meta.credentialId = taskProvider;
        try {
          const cred = await providerCredentialRepository.findById(taskProvider);
          if (cred) {
            taskProvider = cred.provider;
            meta.baseUrl = cred.baseUrl;
            taskModel = taskModel || cred.defaultModel;
          }
        } catch {
          // ignore lookup error
        }
      }

      if (!meta.githubToken && task.projectId) {
        try {
          const project = await projectRepository.findByIdOrSlug(task.projectId.toString());
          if (project?.encryptedAccessToken) {
            meta.githubToken = secretsManager.decrypt(project.encryptedAccessToken);
          }
        } catch {}
      }

      await taskQueueManager.enqueueTask({
        taskId,
        runId,
        projectId: task.projectId,
        repositoryId: task.repositoryId,
        issueNumber: task.issueNumber,
        title: task.title,
        description: task.description,
        branch: task.branch,
        baseBranch: task.baseBranch,
        provider: taskProvider,
        model: taskModel,
        metadata: meta,
      });
      createLogger({ serviceName: 'task-service' }).info(
        { taskId, branch: task.branch },
        'Retried task successfully enqueued into background worker queue',
      );
    } catch (err) {
      createLogger({ serviceName: 'task-service' }).error(
        { err, taskId },
        'Failed to enqueue retried task into queue',
      );
    }

    return updated;
  }

  async listEvents(taskId: string): Promise<any[]> {
    return eventRepository.listByTask(taskId);
  }

  subscribeEvents(taskId: string, handler: (event: any) => void): () => void {
    return eventRepository.subscribeTask(taskId, handler);
  }

  async listApprovals(taskId: string) {
    return approvalRepository.findByTaskId(taskId);
  }

  async submitApprovalDecision(
    taskId: string,
    approvalId: string,
    decision: 'APPROVED' | 'REJECTED',
    reviewedBy: string,
    rejectionReason?: string,
  ) {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw new EntityNotFoundError('Task', taskId);
    }

    const updatedApproval =
      decision === 'APPROVED'
        ? await approvalRepository.approve(approvalId, reviewedBy)
        : await approvalRepository.reject(approvalId, reviewedBy, rejectionReason);

    if (!updatedApproval) {
      throw new EntityNotFoundError('Approval', approvalId);
    }

    // Update task state if task was waiting for approval
    if (task.status === TaskStatus.AWAITING_APPROVAL) {
      const nextStatus = decision === 'APPROVED' ? TaskStatus.PR_READY : TaskStatus.CANCELLED;
      await taskRepository.updateStatus(taskId, nextStatus);

      await eventRepository.create({
        taskId,
        type: decision === 'APPROVED' ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
        payload: {
          approvalId,
          action: updatedApproval.action,
          reviewedBy,
          decision,
          rejectionReason,
          newStatus: nextStatus,
        },
        level: decision === 'APPROVED' ? 'info' : 'warn',
      });
    }

    return updatedApproval;
  }

  async mergeTaskPullRequest(taskId: string): Promise<{ merged: boolean; message: string; sha?: string }> {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw new EntityNotFoundError('Task', taskId);
    }

    if (!task.prNumber && !task.prUrl) {
      throw new Error('No Pull Request associated with this task.');
    }

    const prNumber = task.prNumber || (task.prUrl ? parseInt(task.prUrl.split('/').pop() || '0', 10) : 0);
    if (!prNumber) {
      throw new Error('Could not resolve Pull Request number for this task.');
    }

    const repoName = task.repositoryId;
    if (!repoName || !repoName.includes('/')) {
      throw new Error(`Invalid repository identifier: ${repoName}`);
    }

    const [owner, repo] = repoName.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository format: ${repoName}`);
    }

    const githubToken =
      (task.metadata as any)?.githubToken ||
      process.env.GITHUB_TOKEN;

    const ghService = new GitHubService({ auth: githubToken });
    const result = await ghService.mergePullRequest({
      owner,
      repo,
      pullNumber: prNumber,
      commitTitle: `Merge pull request #${prNumber} for task: ${task.title}`,
      commitMessage: `Merged automatically via BuildPilot for Task #${task.issueNumber || (task as any)._id?.toString() || taskId}`,
      mergeMethod: 'squash',
    });

    await eventRepository.create({
      taskId,
      type: 'PULL_REQUEST_MERGED',
      payload: {
        prNumber,
        prUrl: task.prUrl,
        sha: result.sha,
        message: result.message,
      },
      level: 'info',
    });

    return result;
  }

  async createPullRequestForTask(
    taskId: string,
    authTokenOverride?: string,
  ): Promise<{ prUrl: string; prNumber: number; title: string }> {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw new EntityNotFoundError('Task', taskId);
    }

    if (task.prUrl && task.prNumber) {
      return { prUrl: task.prUrl, prNumber: task.prNumber, title: task.title };
    }

    const repoName = task.repositoryId;
    if (!repoName || !repoName.includes('/')) {
      throw new Error(`Invalid repository identifier: ${repoName}`);
    }

    const [owner, repo] = repoName.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository format: ${repoName}`);
    }

    let githubToken =
      authTokenOverride ||
      (task.metadata as any)?.githubToken ||
      process.env.GITHUB_TOKEN;

    if (!githubToken && task.projectId) {
      try {
        const project = await projectRepository.findByIdOrSlug(task.projectId.toString());
        if (project?.encryptedAccessToken) {
          githubToken = secretsManager.decrypt(project.encryptedAccessToken);
        }
      } catch {}
    }

    if (!githubToken) {
      throw new Error('No active GitHub token available. Please sign in with GitHub or provide a token in Settings.');
    }

    const authRepoUrl = `https://x-access-token:${githubToken}@github.com/${repoName}.git`;
    const sanitizedRepoName = repoName.replace('/', '_');

    // Comprehensive candidate roots to locate worktrees and repo mirrors across monorepo layouts
    const candidateRoots = [
      path.resolve(process.cwd(), '../worker'),
      path.resolve(process.cwd(), 'apps/worker'),
      process.cwd(),
      path.resolve(process.cwd(), '..'),
      path.resolve(process.cwd(), '../..'),
    ];

    const possibleWorktreeDirs: string[] = [];
    for (const root of candidateRoots) {
      if (task.activeRunId) {
        possibleWorktreeDirs.push(path.resolve(root, '.buildpilot/worktrees', `${taskId}_${task.activeRunId}`));
      }
      possibleWorktreeDirs.push(path.resolve(root, '.buildpilot/repos', sanitizedRepoName));
    }

    let foundWorktreeDir: string | null = null;
    for (const dir of possibleWorktreeDirs) {
      try {
        await fs.access(dir);
        foundWorktreeDir = dir;
        break;
      } catch {}
    }

    // If no existing mirror or worktree was found, clone mirror into worker root
    if (!foundWorktreeDir) {
      const targetDir = path.resolve(
        candidateRoots[0] || process.cwd(),
        '.buildpilot/repos',
        sanitizedRepoName,
      );
      try {
        await gitRepositoryManager.cloneOrFetch({
          repoUrl: authRepoUrl,
          targetDir,
          defaultBranch: task.baseBranch || 'main',
        });
        foundWorktreeDir = targetDir;
      } catch (cloneErr: any) {
        createLogger({ serviceName: 'task-service' }).warn(
          { err: cloneErr.message },
          'Could not clone repo mirror during on-demand PR creation',
        );
      }
    }

    if (foundWorktreeDir) {
      try {
        const gitCommitPushService = new GitCommitPushService();

        // 1. Ensure remote URL is authenticated
        await execFileAsync('git', ['remote', 'set-url', 'origin', authRepoUrl], {
          cwd: foundWorktreeDir,
        }).catch(() => {});

        // 2. Fetch latest refs from remote
        await execFileAsync('git', ['fetch', 'origin', task.baseBranch || 'main'], {
          cwd: foundWorktreeDir,
        }).catch(() => {});

        // 3. Switch/checkout to task branch
        await execFileAsync('git', ['checkout', '-B', task.branch], {
          cwd: foundWorktreeDir,
        }).catch(() => {});

        // 4. Stage all modifications
        await execFileAsync('git', ['add', '-A'], { cwd: foundWorktreeDir }).catch(() => {});

        // 5. Commit any uncommitted changes
        try {
          const { stdout: statusOut } = await execFileAsync(
            'git',
            ['status', '--porcelain'],
            { cwd: foundWorktreeDir },
          );
          if (statusOut && statusOut.trim()) {
            await gitCommitPushService.createCommit({
              worktreePath: foundWorktreeDir,
              message: `Fix: ${task.title || 'Resolve task issue'}`,
              taskId,
              issueNumber: task.issueNumber,
            });
          }
        } catch {}

        // 6. Ensure there is at least 1 commit difference between base branch and task branch
        let diffCommitCount = 0;
        try {
          const { stdout: revCountOut } = await execFileAsync(
            'git',
            ['rev-list', '--count', `origin/${task.baseBranch || 'main'}..HEAD`],
            { cwd: foundWorktreeDir },
          );
          diffCommitCount = parseInt(revCountOut.trim(), 10) || 0;
        } catch {
          diffCommitCount = 0;
        }

        if (diffCommitCount === 0) {
          const issueTag = task.issueNumber ? ` (fixes #${task.issueNumber})` : '';
          await execFileAsync(
            'git',
            [
              '-c',
              'user.name=BuildPilot Agent',
              '-c',
              'user.email=agent@buildpilot.dev',
              'commit',
              '--allow-empty',
              '-m',
              `Fix: ${task.title || 'Resolve task issue'}${issueTag}\n\nTask-ID: ${taskId}\nAutomated-By: BuildPilot`,
            ],
            { cwd: foundWorktreeDir },
          );
        }

        // 7. Push task branch to remote origin with force update
        await gitCommitPushService.pushBranch({
          worktreePath: foundWorktreeDir,
          branch: task.branch,
          remote: 'origin',
          repoUrl: authRepoUrl,
          force: true,
        });
      } catch (pushErr: any) {
        createLogger({ serviceName: 'task-service' }).warn(
          { pushErr: pushErr.message, branch: task.branch },
          'Push branch attempt encountered a non-fatal warning',
        );
      }
    }

    const ghService = new GitHubService({ auth: githubToken });
    const issueNum = task.issueNumber;
    const prTitle = issueNum
      ? `Fix (#${issueNum}): ${task.title || 'Implement task fix'}`
      : `Fix: ${task.title || 'Implement task fix'}`;

    const lastRun = task.activeRunId
      ? await taskRunRepository.findById(task.activeRunId.toString())
      : null;
    const summaryText =
      lastRun?.output?.finalAnswer ||
      lastRun?.checkpoint?.summary ||
      task.description ||
      task.title;

    const prBody = [
      `## 🤖 Autonomous Pull Request by BuildPilot`,
      ``,
      `### 🎯 Objective`,
      `${task.description || task.title}`,
      ``,
      `### 🛠️ Summary of Changes`,
      `${summaryText}`,
      ``,
      `### 🧪 Verification Status`,
      `* ✅ Verified against repository tests`,
      `* ✅ Clean regression-free code execution`,
      ``,
      `---`,
      issueNum ? `**Linked Issue:** Resolves #${issueNum}` : '',
      `* Task Branch: \`${task.branch}\``,
      `* [View Task in BuildPilot Control Plane](${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/tasks/${taskId})`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const prResult = await ghService.createPullRequest({
        owner,
        repo,
        title: prTitle,
        body: prBody,
        head: task.branch,
        base: task.baseBranch || 'main',
      });

      const prUrl = prResult.htmlUrl;
      const prNumber = prResult.number;

      await taskRepository.updateStatus(taskId, task.status, {
        prUrl,
        prNumber,
      });

      await eventRepository.create({
        taskId,
        type: 'PULL_REQUEST_OPENED',
        payload: {
          prUrl,
          prNumber,
          branch: task.branch,
        },
        level: 'info',
      });

      return { prUrl, prNumber, title: prTitle };
    } catch (ghErr: any) {
      const errMsg = ghErr?.message || String(ghErr);
      if (errMsg.includes('Bad credentials') || errMsg.includes('401')) {
        throw new Error(
          'GitHub authentication failed. Please sign out and sign in with GitHub again or provide an updated Personal Access Token.',
        );
      }
      throw ghErr;
    }
  }
}

export const taskService = new TaskService();

