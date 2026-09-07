import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { Express } from 'express';
import { createApp } from '../app.js';
import {
  projectRepository,
  taskRepository,
  eventRepository,
  approvalRepository,
  IProject,
  ITask,
} from '@buildpilot/database';
import { TaskStatus } from '@buildpilot/domain';
import { taskQueueManager } from '../queue.js';

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, any>;
}

function invokeApp(
  app: Express,
  options: {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
): Promise<MockResponse> {
  return new Promise((resolve) => {
    const reqHeaders = { ...(options.headers || {}) };
    const method = options.method || 'GET';

    const req = Object.assign(new EventEmitter(), {
      method,
      url: options.url,
      originalUrl: options.url,
      headers: reqHeaders,
      body: options.body || {},
    });

    let statusCode = 200;
    const resHeaders: Record<string, string> = {};
    let responseBody: Record<string, any> = {};

    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      setHeader(name: string, value: string) {
        resHeaders[name.toLowerCase()] = String(value);
        return this;
      },
      header(name: string, value: string) {
        resHeaders[name.toLowerCase()] = String(value);
        return this;
      },
      getHeader(name: string) {
        return resHeaders[name.toLowerCase()];
      },
      writeHead(code: number, headers?: Record<string, string>) {
        statusCode = code;
        this.statusCode = code;
        if (headers) {
          for (const [k, v] of Object.entries(headers)) {
            resHeaders[k.toLowerCase()] = String(v);
          }
        }
        if (headers && (headers['Content-Type'] === 'text/event-stream' || headers['content-type'] === 'text/event-stream')) {
          resolve({ statusCode, headers: resHeaders, body: responseBody });
        }
        return this;
      },
      write(chunk: any) {
        return true;
      },
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data: Record<string, any>) {
        responseBody = data;
        resolve({ statusCode, headers: resHeaders, body: responseBody });
        return this;
      },
      send(data: Record<string, any>) {
        responseBody = data;
        resolve({ statusCode, headers: resHeaders, body: responseBody });
        return this;
      },
      end() {
        resolve({ statusCode, headers: resHeaders, body: responseBody });
        return this;
      },
    });

    app(req as unknown as Parameters<typeof app>[0], res as unknown as Parameters<typeof app>[1]);
  });
}

describe('Projects & Tasks Layered API Architecture', () => {
  const app = createApp();
  const fakeProjectId = '507f1f77bcf86cd799439011';
  const fakeTaskId = '507f191e810c19729de860ea';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(taskQueueManager, 'enqueueTask').mockResolvedValue({ id: 'task_1:run_1' } as any);
  });

  describe('Project Endpoints (Controller -> Service -> Repository)', () => {
    it('POST /api/v1/projects creates project and auto-slugifies name', async () => {
      vi.spyOn(projectRepository, 'findBySlug').mockResolvedValue(null);
      vi.spyOn(projectRepository, 'create').mockResolvedValue({
        _id: fakeProjectId,
        name: 'BuildPilot Control Plane',
        slug: 'buildpilot-control-plane',
        ownerId: 'user_default',
        active: true,
      } as unknown as IProject);

      const res = await invokeApp(app, {
        method: 'POST',
        url: '/api/v1/projects',
        body: { name: 'BuildPilot Control Plane' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.project.name).toBe('BuildPilot Control Plane');
      expect(res.body.project.slug).toBe('buildpilot-control-plane');
      expect(res.body.correlationId).toBeDefined();
    });

    it('POST /api/v1/projects fails with 400 on duplicate slug', async () => {
      vi.spyOn(projectRepository, 'findBySlug').mockResolvedValue({
        _id: fakeProjectId,
        name: 'Existing',
        slug: 'existing',
      } as unknown as IProject);

      const res = await invokeApp(app, {
        method: 'POST',
        url: '/api/v1/projects',
        body: { name: 'Existing', slug: 'existing' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('SLUG_CONFLICT');
    });

    it('GET /api/v1/projects returns paginated projects list', async () => {
      const mockProjects = [
        { _id: fakeProjectId, name: 'Project 1', slug: 'project-1', active: true },
      ] as unknown as IProject[];

      vi.spyOn(projectRepository, 'list').mockResolvedValue({
        projects: mockProjects,
        total: 1,
      });

      const res = await invokeApp(app, {
        url: '/api/v1/projects?page=1&limit=10',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.projects).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(1);
      expect(res.body.totalPages).toBe(1);
    });

    it('GET /api/v1/projects/:projectId returns project for valid slug or id', async () => {
      vi.spyOn(projectRepository, 'findByIdOrSlug').mockResolvedValue({
        _id: fakeProjectId,
        name: 'Project Alpha',
        slug: 'project-alpha',
      } as unknown as IProject);

      const res = await invokeApp(app, {
        url: `/api/v1/projects/project-alpha`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.project.name).toBe('Project Alpha');
    });

    it('GET /api/v1/projects/:projectId returns 404 for unknown project', async () => {
      vi.spyOn(projectRepository, 'findByIdOrSlug').mockResolvedValue(null);

      const res = await invokeApp(app, {
        url: `/api/v1/projects/unknown-project`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('ENTITY_NOT_FOUND');
      expect(res.body.entityType).toBe('Project');
    });

    it('POST /api/v1/projects/:projectId/tasks creates task and records lifecycle event in repository', async () => {
      vi.spyOn(projectRepository, 'findByIdOrSlug').mockResolvedValue({
        _id: fakeProjectId,
        name: 'Project 1',
        slug: 'project-1',
      } as unknown as IProject);

      vi.spyOn(taskRepository, 'getLatestIssueNumber').mockResolvedValue(10);

      const createdTask = {
        _id: fakeTaskId,
        projectId: fakeProjectId,
        repositoryId: 'repo_99',
        issueNumber: 11,
        title: 'Fix edge case in parser',
        status: TaskStatus.QUEUED,
        branch: 'buildpilot/task-11-abc',
      } as unknown as ITask;

      vi.spyOn(taskRepository, 'create').mockResolvedValue(createdTask);
      const eventSpy = vi.spyOn(eventRepository, 'create').mockResolvedValue({} as any);

      const res = await invokeApp(app, {
        method: 'POST',
        url: `/api/v1/projects/${fakeProjectId}/tasks`,
        body: {
          repositoryId: 'repo_99',
          title: 'Fix edge case in parser',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.task.issueNumber).toBe(11);
      expect(res.body.task.status).toBe(TaskStatus.QUEUED);
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: fakeTaskId,
          type: 'TASK_CREATED',
        }),
      );
    });
  });

  describe('Task Endpoints (Controller -> Service -> Repository)', () => {
    it('GET /api/v1/tasks returns filtered and paginated tasks', async () => {
      const mockTasks = [
        { _id: fakeTaskId, title: 'Task 1', status: TaskStatus.PLANNING },
      ] as unknown as ITask[];

      vi.spyOn(taskRepository, 'list').mockResolvedValue({
        tasks: mockTasks,
        total: 1,
      });

      const res = await invokeApp(app, {
        url: '/api/v1/tasks?status=PLANNING&search=Task',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('GET /api/v1/tasks/:taskId returns task details with runs and steps', async () => {
      const mockDetails = {
        task: { _id: fakeTaskId, title: 'Task 1', status: TaskStatus.DEVELOPMENT } as unknown as ITask,
        runs: [{ _id: 'run_1', taskId: fakeTaskId, status: 'RUNNING' }] as any[],
        steps: [{ _id: 'step_1', taskId: fakeTaskId, stage: 'DEVELOPMENT' }] as any[],
      };

      vi.spyOn(taskRepository, 'findTaskDetails').mockResolvedValue(mockDetails);

      const res = await invokeApp(app, {
        url: `/api/v1/tasks/${fakeTaskId}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.task.title).toBe('Task 1');
      expect(res.body.runs).toHaveLength(1);
      expect(res.body.steps).toHaveLength(1);
    });

    it('GET /api/v1/tasks/:taskId returns 404 when task not found', async () => {
      vi.spyOn(taskRepository, 'findTaskDetails').mockResolvedValue(null);

      const res = await invokeApp(app, {
        url: `/api/v1/tasks/nonexistent_id`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('ENTITY_NOT_FOUND');
      expect(res.body.entityType).toBe('Task');
    });

    it('POST /api/v1/tasks/:taskId/cancel validates transition and updates status to CANCELLED', async () => {
      const mockTask = {
        _id: fakeTaskId,
        status: TaskStatus.DEVELOPMENT,
      } as unknown as ITask;

      const updatedTask = {
        _id: fakeTaskId,
        status: TaskStatus.CANCELLED,
      } as unknown as ITask;

      vi.spyOn(taskRepository, 'findById').mockResolvedValue(mockTask);
      vi.spyOn(taskRepository, 'updateStatus').mockResolvedValue(updatedTask);
      const eventSpy = vi.spyOn(eventRepository, 'create').mockResolvedValue({} as any);

      const res = await invokeApp(app, {
        method: 'POST',
        url: `/api/v1/tasks/${fakeTaskId}/cancel`,
        body: { reason: 'Cancelled by engineer' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.task.status).toBe(TaskStatus.CANCELLED);
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: fakeTaskId,
          type: 'TASK_CANCELLED',
        }),
      );
    });

    it('POST /api/v1/tasks/:taskId/cancel rejects cancelling COMPLETED task with 409 Conflict', async () => {
      const mockTask = {
        _id: fakeTaskId,
        status: TaskStatus.COMPLETED,
      } as unknown as ITask;

      vi.spyOn(taskRepository, 'findById').mockResolvedValue(mockTask);

      const res = await invokeApp(app, {
        method: 'POST',
        url: `/api/v1/tasks/${fakeTaskId}/cancel`,
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe('INVALID_STATE_TRANSITION');
    });

    it('POST /api/v1/tasks/:taskId/retry transitions FAILED task back to QUEUED', async () => {
      const mockTask = {
        _id: fakeTaskId,
        status: TaskStatus.FAILED,
      } as unknown as ITask;

      const updatedTask = {
        _id: fakeTaskId,
        status: TaskStatus.QUEUED,
      } as unknown as ITask;

      vi.spyOn(taskRepository, 'findById').mockResolvedValue(mockTask);
      vi.spyOn(taskRepository, 'updateStatus').mockResolvedValue(updatedTask);
      const eventSpy = vi.spyOn(eventRepository, 'create').mockResolvedValue({} as any);

      const res = await invokeApp(app, {
        method: 'POST',
        url: `/api/v1/tasks/${fakeTaskId}/retry`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.task.status).toBe(TaskStatus.QUEUED);
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: fakeTaskId,
          type: 'TASK_RETRIED',
        }),
      );
    });

    it('POST /api/v1/tasks/:taskId/retry rejects retrying an active task with 409 Conflict', async () => {
      const mockTask = {
        _id: fakeTaskId,
        status: TaskStatus.DEVELOPMENT,
      } as unknown as ITask;

      vi.spyOn(taskRepository, 'findById').mockResolvedValue(mockTask);

      const res = await invokeApp(app, {
        method: 'POST',
        url: `/api/v1/tasks/${fakeTaskId}/retry`,
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe('INVALID_STATE_TRANSITION');
    });

    it('GET /api/v1/tasks/:taskId/approvals returns list of approval records', async () => {
      vi.spyOn(approvalRepository, 'findByTaskId').mockResolvedValue([
        {
          _id: 'appr_1',
          taskId: fakeTaskId,
          action: 'DEPLOY_PRODUCTION',
          permissionClass: 'HIGH_RISK',
          status: 'PENDING',
        } as any,
      ]);

      const res = await invokeApp(app, {
        url: `/api/v1/tasks/${fakeTaskId}/approvals`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.approvals).toHaveLength(1);
      expect(res.body.approvals[0].action).toBe('DEPLOY_PRODUCTION');
    });

    it('POST /api/v1/tasks/:taskId/approvals/:approvalId/decision approves action and updates task state', async () => {
      vi.spyOn(taskRepository, 'findById').mockResolvedValue({
        _id: fakeTaskId,
        status: TaskStatus.AWAITING_APPROVAL,
      } as any);

      vi.spyOn(approvalRepository, 'approve').mockResolvedValue({
        _id: 'appr_1',
        taskId: fakeTaskId,
        action: 'DEPLOY_PRODUCTION',
        status: 'APPROVED',
        reviewedBy: 'admin_user',
      } as any);

      vi.spyOn(taskRepository, 'updateStatus').mockResolvedValue({} as any);
      const eventSpy = vi.spyOn(eventRepository, 'create').mockResolvedValue({} as any);

      const res = await invokeApp(app, {
        method: 'POST',
        url: `/api/v1/tasks/${fakeTaskId}/approvals/appr_1/decision`,
        body: {
          decision: 'APPROVED',
          reviewedBy: 'admin_user',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.approval.status).toBe('APPROVED');
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: fakeTaskId,
          type: 'APPROVAL_GRANTED',
        }),
      );
    });
  });
});


