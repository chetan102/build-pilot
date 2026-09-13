export interface ParsedTestCase {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs?: number;
  errorMessage?: string;
  file?: string;
}

export interface ParsedTestSuite {
  framework: 'tap' | 'jest' | 'vitest' | 'pytest' | 'mocha' | 'unknown';
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  testCases: ParsedTestCase[];
}

export function parseTestOutput(stdout: string, stderr = ''): ParsedTestSuite {
  const combinedOutput = `${stdout}\n${stderr}`;
  const lines = combinedOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (detectTap(lines)) {
    return parseTap(lines);
  }
  if (detectJestVitest(lines)) {
    return parseJestVitest(lines);
  }
  if (detectPytest(lines)) {
    return parsePytest(lines);
  }

  return {
    framework: 'unknown',
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    testCases: [],
  };
}

function detectTap(lines: string[]): boolean {
  return lines.some((line) => line.startsWith('TAP version') || /^(not )?ok\b/.test(line));
}

function parseTap(lines: string[]): ParsedTestSuite {
  const testCases: ParsedTestCase[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const tapMatch = line.match(/^(not )?ok\s+\d+\s+-\s+(.+)$/);
    if (tapMatch && tapMatch[2]) {
      const isFail = tapMatch[1] === 'not ';
      const name = tapMatch[2].trim();
      const status = isFail ? 'fail' : 'pass';

      let durationMs: number | undefined;
      if (i + 1 < lines.length && lines[i + 1]?.startsWith('---')) {
        for (let j = i + 2; j < lines.length; j++) {
          const subLine = lines[j];
          if (!subLine || subLine.startsWith('...')) break;
          const durationMatch = subLine.match(/duration_ms:\s*([\d.]+)/);
          if (durationMatch && durationMatch[1]) {
            durationMs = parseFloat(durationMatch[1]);
          }
        }
      }

      testCases.push({ name, status, durationMs });
    }

    const summaryPassMatch = line.match(/^# pass\s+(\d+)/);
    if (summaryPassMatch && summaryPassMatch[1]) passed = parseInt(summaryPassMatch[1], 10);

    const summaryFailMatch = line.match(/^# fail\s+(\d+)/);
    if (summaryFailMatch && summaryFailMatch[1]) failed = parseInt(summaryFailMatch[1], 10);

    const summarySkipMatch = line.match(/^# skip\s+(\d+)/);
    if (summarySkipMatch && summarySkipMatch[1]) skipped = parseInt(summarySkipMatch[1], 10);
  }

  if (passed === 0 && failed === 0) {
    passed = testCases.filter((t) => t.status === 'pass').length;
    failed = testCases.filter((t) => t.status === 'fail').length;
    skipped = testCases.filter((t) => t.status === 'skip').length;
  }

  return {
    framework: 'tap',
    total: testCases.length,
    passed,
    failed,
    skipped,
    testCases,
  };
}

function detectJestVitest(lines: string[]): boolean {
  return lines.some(
    (line) =>
      line.includes('✓') ||
      line.includes('√') ||
      line.includes('✗') ||
      line.includes('✕') ||
      line.includes('×') ||
      /^PASS\s+/.test(line) ||
      /^FAIL\s+/.test(line) ||
      line.includes('Tests:'),
  );
}

function parseJestVitest(lines: string[]): ParsedTestSuite {
  const testCases: ParsedTestCase[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const line of lines) {
    if (!line) continue;

    const passMatch = line.match(/^[✓√]\s+(.+)$/);
    if (passMatch && passMatch[1]) {
      testCases.push({ name: passMatch[1].trim(), status: 'pass' });
      continue;
    }

    const failMatch = line.match(/^[✗✕×]\s+(.+)$/);
    if (failMatch && failMatch[1]) {
      testCases.push({ name: failMatch[1].trim(), status: 'fail' });
      continue;
    }

    const summaryMatch = line.match(
      /Tests:\s+(?:(\d+)\s+failed,?\s+)?(?:(\d+)\s+passed,?\s+)?(\d+)\s+total/,
    );
    if (summaryMatch) {
      if (summaryMatch[1]) failed = parseInt(summaryMatch[1], 10);
      if (summaryMatch[2]) passed = parseInt(summaryMatch[2], 10);
    }
  }

  if (passed === 0 && failed === 0) {
    passed = testCases.filter((t) => t.status === 'pass').length;
    failed = testCases.filter((t) => t.status === 'fail').length;
    skipped = testCases.filter((t) => t.status === 'skip').length;
  }

  return {
    framework: 'jest',
    total: passed + failed + skipped > 0 ? passed + failed + skipped : testCases.length,
    passed,
    failed,
    skipped,
    testCases,
  };
}

function detectPytest(lines: string[]): boolean {
  return lines.some(
    (line) => line.includes('::') && (line.includes('PASSED') || line.includes('FAILED')),
  );
}

function parsePytest(lines: string[]): ParsedTestSuite {
  const testCases: ParsedTestCase[] = [];
  let passed = 0;
  let failed = 0;

  for (const line of lines) {
    if (!line) continue;

    const pyMatch = line.match(/^(.+?::.+?)\s+(PASSED|FAILED)/);
    if (pyMatch && pyMatch[1] && pyMatch[2]) {
      const name = pyMatch[1].trim();
      const status = pyMatch[2] === 'PASSED' ? 'pass' : 'fail';
      testCases.push({ name, status });
    }

    const summaryMatch = line.match(/(\d+)\s+passed,?\s+(\d+)\s+failed/);
    if (summaryMatch) {
      if (summaryMatch[1]) passed = parseInt(summaryMatch[1], 10);
      if (summaryMatch[2]) failed = parseInt(summaryMatch[2], 10);
    }
  }

  if (passed === 0 && failed === 0) {
    passed = testCases.filter((t) => t.status === 'pass').length;
    failed = testCases.filter((t) => t.status === 'fail').length;
  }

  return {
    framework: 'pytest',
    total: passed + failed,
    passed,
    failed,
    skipped: 0,
    testCases,
  };
}
