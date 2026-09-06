import { describe, it, expect } from 'vitest';
import { MOCK_TASKS, MOCK_PROJECTS, MOCK_PROVIDERS } from '../lib/mock-data.js';

describe('web application shell', () => {
  it('contains valid mock tasks spanning lifecycle stages', () => {
    expect(MOCK_TASKS.length).toBeGreaterThan(0);
    const statuses = MOCK_TASKS.map((t) => t.status);
    expect(statuses).toContain('COMPLETED');
    expect(statuses).toContain('DEVELOPMENT');
    expect(statuses).toContain('TESTING');
    expect(statuses).toContain('AWAITING_APPROVAL');
  });

  it('contains configured projects and providers', () => {
    expect(MOCK_PROJECTS.length).toBeGreaterThan(0);
    expect(MOCK_PROVIDERS.length).toBeGreaterThan(0);
    expect(MOCK_PROVIDERS.some((p) => p.status === 'connected')).toBe(true);
  });
});
