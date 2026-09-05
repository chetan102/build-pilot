import { describe, it, expect } from 'vitest';
import { createWorkerService } from './worker.js';

describe('worker service', () => {
  it('initializes worker service', () => {
    const worker = createWorkerService();
    expect(worker.status).toBe('initialized');
  });
});
