import { describe, it, expect } from 'vitest';
import { formatTimestamp, generateCorrelationId } from './index.js';

describe('shared utilities', () => {
  it('formats timestamp as ISO string', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(formatTimestamp(d)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('generates correlation IDs with default prefix', () => {
    const id = generateCorrelationId();
    expect(id.startsWith('bp_')).toBe(true);
  });
});
