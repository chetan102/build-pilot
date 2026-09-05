import { describe, it, expect } from 'vitest';
import { TaskStatus, TaskStatusSchema } from './index.js';

describe('domain package', () => {
  it('validates task status against schema', () => {
    expect(TaskStatusSchema.parse(TaskStatus.QUEUED)).toBe('QUEUED');
    expect(() => TaskStatusSchema.parse('INVALID_STATUS')).toThrow();
  });
});
