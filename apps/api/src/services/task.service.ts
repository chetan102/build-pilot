import {
  taskRepository,
  eventRepository,
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
}

export const taskService = new TaskService();
