import { ParsedTestSuite } from './test-parser.js';

export interface TestDelta {
  regressions: string[];     // Tests that PASSED in baseline but FAIL now
  fixed: string[];           // Tests that FAILED in baseline but PASS now
  preExisting: string[];     // Tests that FAILED in both baseline and post-fix
  newTests: string[];        // Tests that didn't exist in baseline
  verdict: 'PASS' | 'FAIL'; // PASS if regressions.length === 0
}

export function computeTestDelta(baseline: ParsedTestSuite, postFix: ParsedTestSuite): TestDelta {
  const baselinePass = new Set(baseline.testCases.filter(t => t.status === 'pass').map(t => t.name));
  const baselineFail = new Set(baseline.testCases.filter(t => t.status === 'fail').map(t => t.name));
  const baselineAll = new Set(baseline.testCases.map(t => t.name));

  const regressions: string[] = [];
  const fixed: string[] = [];
  const preExisting: string[] = [];
  const newTests: string[] = [];

  for (const tc of postFix.testCases) {
    if (!baselineAll.has(tc.name)) {
      newTests.push(tc.name);
    } else if (tc.status === 'fail' && baselinePass.has(tc.name)) {
      regressions.push(tc.name);
    } else if (tc.status === 'pass' && baselineFail.has(tc.name)) {
      fixed.push(tc.name);
    } else if (tc.status === 'fail' && baselineFail.has(tc.name)) {
      preExisting.push(tc.name);
    }
  }

  return {
    regressions,
    fixed,
    preExisting,
    newTests,
    verdict: regressions.length === 0 ? 'PASS' : 'FAIL'
  };
}
