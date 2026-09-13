import {
  projectRepository,
  taskRepository,
  eventRepository,
  providerCredentialRepository,
  IProject,
  ITask,
  ListProjectsFilter,
  PaginationOptions,
} from '@buildpilot/database';
import mongoose from 'mongoose';
import { EntityNotFoundError, DomainError, TaskStatus } from '@buildpilot/domain';
import { createLogger, Logger } from '@buildpilot/observability';
import { CreateProjectInput } from '../schemas/project.schema.js';
import { CreateTaskInput } from '../schemas/task.schema.js';
import { taskQueueManager } from '../queue.js';

export interface PaginatedProjectsResult {
  projects: IProject[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class ProjectService {
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async createProject(input: CreateProjectInput): Promise<IProject> {
    const slug = input.slug ? input.slug.toLowerCase().trim() : this.slugify(input.name);

    const existing = await projectRepository.findBySlug(slug);
    if (existing) {
      throw new DomainError(`Project with slug "${slug}" already exists`, 'SLUG_CONFLICT');
    }

    return projectRepository.create({
      name: input.name,
      slug,
      description: input.description,
      ownerId: input.ownerId || 'user_default',
      active: true,
    });
  }

  async listProjects(
    filter: ListProjectsFilter = {},
    pagination: PaginationOptions = {},
  ): Promise<any> {
    const page = pagination.page && pagination.page > 0 ? pagination.page : 1;
    const limit = pagination.limit && pagination.limit > 0 ? pagination.limit : 20;

    const { projects, total } = await projectRepository.list(filter, { page, limit });
    const totalPages = Math.ceil(total / limit) || 1;

    // Enrich projects with task stats
    const enrichedProjects = await Promise.all(
      projects.map(async (p: any) => {
        const projectId = p._id?.toString() || p.id;
        let allTasks: any[] = [];
        try {
          allTasks = (await taskRepository.listByProject(projectId)) || [];
        } catch {
          allTasks = [];
        }
        const completed = allTasks.filter((t) => t.status === 'COMPLETED').length;
        const running = allTasks.filter((t) => ['PLANNING', 'DEVELOPMENT', 'REVIEW', 'REPAIRING', 'QUEUED'].includes(t.status)).length;
        const failed = allTasks.filter((t) => ['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(t.status)).length;

        return {
          ...(typeof p.toObject === 'function' ? p.toObject() : p),
          stats: {
            totalTasks: allTasks.length,
            completedTasks: completed,
            activeTasks: running,
            failedTasks: failed,
          },
        };
      }),
    );

    return {
      projects: enrichedProjects,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getProject(idOrSlug: string): Promise<IProject> {
    const project = await projectRepository.findByIdOrSlug(idOrSlug);
    if (!project) {
      throw new EntityNotFoundError('Project', idOrSlug);
    }
    return project;
  }

  async createTaskForProject(projectId: string, input: CreateTaskInput): Promise<ITask> {
    const project = await this.getProject(projectId);

    // Auto-generate issue number if not explicitly specified
    let issueNumber = input.issueNumber;
    if (!issueNumber) {
      const latestIssue = await taskRepository.getLatestIssueNumber(input.repositoryId);
      issueNumber = latestIssue + 1;
    }

    // Auto-generate task branch if not explicitly specified
    const branch =
      input.branch ||
      `buildpilot/task-${issueNumber}-${Math.random().toString(36).substring(2, 8)}`;

    const task = await taskRepository.create({
      projectId: (project as any)._id?.toString() || projectId,
      repositoryId: input.repositoryId,
      issueNumber,
      title: input.title,
      description: input.description || '',
      status: TaskStatus.QUEUED,
      branch,
      baseBranch: input.baseBranch || 'main',
      tags: input.tags || [],
      metadata: input.metadata || {},
    });

    const taskId = (task as any)._id?.toString();

    // Persist creation lifecycle event
    await eventRepository.create({
      taskId,
      type: 'TASK_CREATED',
      payload: {
        projectId: (project as any)._id?.toString() || projectId,
        repositoryId: task.repositoryId,
        issueNumber: task.issueNumber,
        title: task.title,
        status: task.status,
      },
      level: 'info',
    });

    // Enqueue task for background worker execution
    try {
      const runId = new mongoose.Types.ObjectId().toString();
      const meta = (task.metadata as Record<string, any>) || {};
      let taskProvider = meta.provider;
      let taskModel = meta.model;

      if (!taskProvider || !taskModel) {
        try {
          const activeCred = await providerCredentialRepository.findActiveProvider('default-user');
          if (activeCred) {
            taskProvider = taskProvider || activeCred.provider;
            taskModel = taskModel || activeCred.defaultModel;
          }
        } catch {
          // ignore lookup error
        }
      }

      await taskQueueManager.enqueueTask({
        taskId,
        runId,
        projectId: (project as any)._id?.toString() || projectId,
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
      createLogger({ serviceName: 'project-service' }).info(
        { taskId, branch: task.branch, provider: taskProvider, model: taskModel },
        'Task successfully enqueued into background worker queue',
      );
    } catch (err) {
      createLogger({ serviceName: 'project-service' }).error(
        { err, taskId },
        'Failed to enqueue task into queue',
      );
    }

    return task;
  }
}

export const projectService = new ProjectService();

