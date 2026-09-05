import { describe, it, expect } from 'vitest';
import { loadConfig } from './index.js';

describe('config package', () => {
  it('loads valid default configurations', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
    });
    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(4000);
    expect(config.REDIS_PORT).toBe(6379);
  });
});
