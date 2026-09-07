import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { Express } from 'express';
import { createApp } from '../app.js';
import { projectRepository, taskRepository, eventRepository } from '@buildpilot/database';
import { taskQueueManager } from '../queue.js';
import { gitHubService } from '@buildpilot/github';

function invokeApp(
  app: Express,
  options: {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
): Promise<{ statusCode: number; headers: Record<string, string>; body: any }> {
  return new Promise((resolve) => {
    const reqHeaders = { ...(options.headers || {}) };
    const method = options.method || 'POST';

    const req = Object.assign(new EventEmitter(), {
      method,
      url: options.url,
      originalUrl: options.url,
      headers: reqHeaders,
      body: options.body || {},
    });

    let statusCode = 200;
    const resHeaders: Record<string, string> = {};
    let responseBody: any = {};

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
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        responseBody = data;
        resolve({ statusCode, headers: resHeaders, body: responseBody });
        return this;
      },
      send(data: any) {
        responseBody = data;
        resolve({ statusCode, headers: resHeaders, body: responseBody });
        return this;
      },
      end() {
        resolve({ statusCode, headers: resHeaders, body: responseBody });
        return this;
      },
    });

    app(req as any, res as any);
  });
}

describe('GitHub Webhooks & Issue Intake (Phase 9)', () => {
  let app: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();

    vi.spyOn(eventRepository, 'create').mockResolvedValue({ _id: 'evt_1' } as any);
    vi.spyOn(projectRepository, 'findBySlug').mockResolvedValue(null);
    vi.spyOn(projectRepository, 'create').mockResolvedValue({
      _id: '507f191e810c19729de860ea',
      name: 'org/repo',
      slug: 'org-repo',
    } as any);
    vi.spyOn(taskRepository, 'create').mockImplementation((data: any) =>
      Promise.resolve({ _id: '6a9cf1f85d9b845db6781a0b', ...data }),
    );
    vi.spyOn(taskQueueManager, 'enqueueTask').mockResolvedValue({} as any);
    vi.spyOn(gitHubService, 'createIssueComment').mockResolvedValue({ id: 123, htmlUrl: 'https://github.com' });
  });

  it('ignores non-issue events gracefully and responds 200 OK', async () => {
    const res = await invokeApp(app, {
      url: '/api/v1/github/webhooks',
      headers: {
        'x-github-event': 'ping',
        'x-github-delivery': 'del_ping_1',
      },
      body: { zen: 'Keep it simple.' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.event).toBe('ping');
  });

  it('ignores issues that do not contain the trigger label', async () => {
    const res = await invokeApp(app, {
      url: '/api/v1/github/webhooks',
      headers: {
        'x-github-event': 'issues',
        'x-github-delivery': 'del_issue_unlabeled',
      },
      body: {
        action: 'opened',
        issue: {
          number: 10,
          title: 'General question',
          labels: [{ name: 'question' }],
        },
        repository: {
          name: 'repo',
          owner: { login: 'org' },
          full_name: 'org/repo',
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.action).toBe('opened');
    expect(taskRepository.create).not.toHaveBeenCalled();
    expect(taskQueueManager.enqueueTask).not.toHaveBeenCalled();
  });

  it('converts labeled issue with "buildpilot" label into a task and enqueues it', async () => {
    const res = await invokeApp(app, {
      url: '/api/v1/github/webhooks',
      headers: {
        'x-github-event': 'issues',
        'x-github-delivery': 'del_issue_eligible_1',
      },
      body: {
        action: 'labeled',
        label: { name: 'buildpilot' },
        issue: {
          number: 25,
          title: 'Add JWT authorization middleware',
          body: 'Implement auth check for API routes',
          html_url: 'https://github.com/org/repo/issues/25',
          labels: [{ name: 'buildpilot' }, { name: 'enhancement' }],
        },
        repository: {
          name: 'repo',
          owner: { login: 'org' },
          full_name: 'org/repo',
          default_branch: 'main',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.received).toBe(true);
    expect(res.body.action).toBe('TASK_CREATED');
    expect(res.body.taskId).toBe('6a9cf1f85d9b845db6781a0b');

    // 1. Created project
    expect(projectRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'org/repo',
        slug: 'org-repo',
      }),
    );

    // 2. Created task
    expect(taskRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Add JWT authorization middleware',
        issueNumber: 25,
      }),
    );

    // 3. Enqueued in BullMQ
    expect(taskQueueManager.enqueueTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: '6a9cf1f85d9b845db6781a0b',
        title: 'Add JWT authorization middleware',
      }),
    );
  });
});
