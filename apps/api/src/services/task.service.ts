import {
  taskRepository,
  eventRepository,
  approvalRepository,
  ITask,
  ListTasksFilter,
  TaskPaginationOptions,
  TaskDetailsResult,
} from '@buildpilot/database';
import mongoose from 'mongoose';
import {
  EntityNotFoundError,
  TaskStatus,
  validateTaskTransition,
} from '@buildpilot/domain';
import { GitHubService } from '@buildpilot/github';
import { createLogger } from '@buildpilot/observability';
import { taskQueueManager } from '../queue.js';

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
        metadata: (task.metadata as Record<string, unknown>) || {},
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
      commitMessage: `Merged automatically via BuildPilot for Task #${task.issueNumber || task.id}`,
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
}

export const taskService = new TaskService();

