import { describe, it, expect } from 'vitest';
import { cn, formatDuration, formatDate } from './utils.js';

describe('web utils', () => {
  it('merges tailwind class names correctly', () => {
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
    expect(cn('px-2 py-1', { 'text-white': true, 'text-black': false })).toBe(
      'px-2 py-1 text-white',
    );
  });

  it('formats durations cleanly', () => {
    expect(formatDuration(450)).toBe('450ms');
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(125000)).toBe('2m 5s');
  });

  it('formats dates consistently', () => {
    const formatted = formatDate('2026-09-06T10:00:00Z');
    expect(formatted).toBeDefined();
    expect(typeof formatted).toBe('string');
  });
});

