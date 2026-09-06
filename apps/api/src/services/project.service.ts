import {
  projectRepository,
  taskRepository,
  eventRepository,
  IProject,
  ITask,
  ListProjectsFilter,
  PaginationOptions,
} from '@buildpilot/database';
import { EntityNotFoundError, DomainError, TaskStatus } from '@buildpilot/domain';
import { CreateProjectInput } from '../schemas/project.schema.js';
import { CreateTaskInput } from '../schemas/task.schema.js';

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
  ): Promise<PaginatedProjectsResult> {
    const page = pagination.page && pagination.page > 0 ? pagination.page : 1;
    const limit = pagination.limit && pagination.limit > 0 ? pagination.limit : 20;

    const { projects, total } = await projectRepository.list(filter, { page, limit });
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      projects,
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

    return task;
  }
}

export const projectService = new ProjectService();

