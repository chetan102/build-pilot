import { describe, it, expect } from 'vitest';
import { parseTestOutput } from './test-parser.js';
import { computeTestDelta } from './test-differ.js';

describe('parseTestOutput', () => {
  it('parses TAP format', () => {
    const stdout = `
TAP version 13
ok 1 - math addition
  ---
  duration_ms: 2.5
  ...
not ok 2 - math subtraction
  ---
  duration_ms: 1.0
  ...
# pass 1
# fail 1
# tests 2
    `;
    const res = parseTestOutput(stdout);
    expect(res.framework).toBe('tap');
    expect(res.testCases.length).toBe(2);
    expect(res.testCases[0]?.name).toBe('math addition');
    expect(res.testCases[0]?.status).toBe('pass');
    expect(res.testCases[0]?.durationMs).toBe(2.5);
    expect(res.testCases[1]?.name).toBe('math subtraction');
    expect(res.testCases[1]?.status).toBe('fail');
    expect(res.passed).toBe(1);
    expect(res.failed).toBe(1);
  });

  it('parses Jest/Vitest format', () => {
    const stdout = `
✓ addition works
✗ subtraction fails
Tests: 1 failed, 1 passed, 2 total
    `;
    const res = parseTestOutput(stdout);
    expect(res.framework).toBe('jest');
    expect(res.testCases.length).toBe(2);
    expect(res.testCases[0]?.name).toBe('addition works');
    expect(res.testCases[0]?.status).toBe('pass');
    expect(res.testCases[1]?.name).toBe('subtraction fails');
    expect(res.testCases[1]?.status).toBe('fail');
    expect(res.passed).toBe(1);
    expect(res.failed).toBe(1);
  });

  it('parses Pytest format', () => {
    const stdout = `
test_math.py::test_addition PASSED
test_math.py::test_subtraction FAILED
========================= 1 passed, 1 failed in 0.1s =========================
    `;
    const res = parseTestOutput(stdout);
    expect(res.framework).toBe('pytest');
    expect(res.testCases.length).toBe(2);
    expect(res.testCases[0]?.name).toBe('test_math.py::test_addition');
    expect(res.testCases[0]?.status).toBe('pass');
    expect(res.testCases[1]?.name).toBe('test_math.py::test_subtraction');
    expect(res.testCases[1]?.status).toBe('fail');
    expect(res.passed).toBe(1);
    expect(res.failed).toBe(1);
  });

  it('returns unknown format for arbitrary text', () => {
    const stdout = 'Hello world, this is a compilation error';
    const res = parseTestOutput(stdout);
    expect(res.framework).toBe('unknown');
    expect(res.testCases).toEqual([]);
  });
});

describe('computeTestDelta', () => {
  it('computes correctly', () => {
    const baseline = parseTestOutput(`
✓ test1
✗ test2
✗ test3
    `);

    const postFix = parseTestOutput(`
✗ test1
✓ test2
✗ test3
✓ test4
    `);

    const delta = computeTestDelta(baseline, postFix);

    expect(delta.regressions).toContain('test1');
    expect(delta.fixed).toContain('test2');
    expect(delta.preExisting).toContain('test3');
    expect(delta.newTests).toContain('test4');
    expect(delta.verdict).toBe('FAIL'); // because of regression in test1
  });

  it('passes if no regressions', () => {
    const baseline = parseTestOutput(`
✓ test1
✗ test2
    `);

    const postFix = parseTestOutput(`
✓ test1
✓ test2
    `);

    const delta = computeTestDelta(baseline, postFix);

    expect(delta.regressions).toHaveLength(0);
    expect(delta.verdict).toBe('PASS');
  });
});
