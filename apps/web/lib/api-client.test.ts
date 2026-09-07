import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchTasks,
  fetchTaskDetails,
  fetchProjects,
  cancelTask,
  retryTask,
  getTaskEventsStreamUrl,
  API_BASE_URL,
} from './api-client.js';

describe('Frontend API Client (Phase 11: Reality Connectivity)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates correct SSE stream URL for task', () => {
    const url = getTaskEventsStreamUrl('task_123');
    expect(url).toBe(`${API_BASE_URL}/api/v1/tasks/task_123/events`);
  });

  it('fetches tasks with filters and pagination query params', async () => {
    const mockTasks = {
      tasks: [{ id: 'task_1', title: 'Task 1', status: 'QUEUED' }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockTasks,
    } as any);

    const res = await fetchTasks({
      status: 'PLANNING',
      search: 'auth',
      page: 2,
      limit: 10,
    });

    expect(res.tasks).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/tasks?status=PLANNING&search=auth&page=2&limit=10'),
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('fetches task details by taskId', async () => {
    const mockDetails = {
      task: { id: 'task_1', title: 'Fix bug' },
      runs: [],
      steps: [],
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockDetails,
    } as any);

    const res = await fetchTaskDetails('task_1');
    expect(res.task.title).toBe('Fix bug');
  });

  it('calls cancel task POST endpoint', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ task: { id: 'task_1', status: 'CANCELLED' } }),
    } as any);

    const res = await cancelTask('task_1', 'Changed priorities');
    expect(res.task.status).toBe('CANCELLED');
    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/v1/tasks/task_1/cancel`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Changed priorities' }),
      }),
    );
  });

  it('calls retry task POST endpoint', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ task: { id: 'task_1', status: 'QUEUED' } }),
    } as any);

    const res = await retryTask('task_1');
    expect(res.task.status).toBe('QUEUED');
    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/v1/tasks/task_1/retry`,
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });
});
