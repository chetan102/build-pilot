import { describe, it, expect } from 'vitest';
import { createLogger } from './index.js';

describe('observability package', () => {
  it('instantiates logger with service name', () => {
    const logger = createLogger({ serviceName: 'test-service', level: 'silent' });
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });
});
