import { describe, it, expect } from 'vitest';
import { isDbConnected, DB_READY_STATE } from './index.js';

describe('database package', () => {
  it('checks connection state correctly', () => {
    expect(isDbConnected(DB_READY_STATE.CONNECTED)).toBe(true);
    expect(isDbConnected(DB_READY_STATE.DISCONNECTED)).toBe(false);
  });
});

