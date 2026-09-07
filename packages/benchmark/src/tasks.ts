export interface BenchmarkTask {
  id: string;
  category: 'BUG_FIX' | 'REFACTOR' | 'FEATURE' | 'TEST_GENERATION';
  title: string;
  description: string;
  initialFiles: Record<string, string>;
  testFile: string;
  testScript: string;
  expectedFilesModified: string[];
}

export const BENCHMARK_TASKS: BenchmarkTask[] = [
  {
    id: 'bench_01_calc_add',
    category: 'BUG_FIX',
    title: 'Fix addition bug in calculator',
    description: 'The add function subtracts instead of adding. Fix it and ensure tests pass.',
    initialFiles: {
      'src/calculator.ts': 'export function add(a: number, b: number): number {\n  return a - b;\n}\n',
    },
    testFile: 'src/calculator.test.ts',
    testScript: 'node -e "const { add } = require(\'./src/calculator.js\'); if (add(2, 3) !== 5) process.exit(1);"',
    expectedFilesModified: ['src/calculator.ts'],
  },
  {
    id: 'bench_02_discount_calc',
    category: 'BUG_FIX',
    title: 'Fix discount calculation rounding',
    description: 'applyDiscount must calculate price * (1 - rate / 100).',
    initialFiles: {
      'src/discount.ts': 'export function applyDiscount(price: number, discount: number): number {\n  return price - discount;\n}\n',
    },
    testFile: 'src/discount.test.ts',
    testScript: 'node -e "const { applyDiscount } = require(\'./src/discount.js\'); if (applyDiscount(100, 20) !== 80) process.exit(1);"',
    expectedFilesModified: ['src/discount.ts'],
  },
  {
    id: 'bench_03_slugify_helper',
    category: 'FEATURE',
    title: 'Implement slugify string utility',
    description: 'slugify must convert uppercase to lowercase, replace spaces with dashes, and remove non-alphanumeric chars.',
    initialFiles: {
      'src/slugify.ts': 'export function slugify(str: string): string {\n  return str;\n}\n',
    },
    testFile: 'src/slugify.test.ts',
    testScript: 'node -e "const { slugify } = require(\'./src/slugify.js\'); if (slugify(\'Hello World!\') !== \'hello-world\') process.exit(1);"',
    expectedFilesModified: ['src/slugify.ts'],
  },
  {
    id: 'bench_04_token_expiration',
    category: 'BUG_FIX',
    title: 'Fix JWT expiration comparison',
    description: 'isTokenExpired should compare Date.now() with expiresAt in ms.',
    initialFiles: {
      'src/auth.ts': 'export function isExpired(expiresAt: number): boolean {\n  return false;\n}\n',
    },
    testFile: 'src/auth.test.ts',
    testScript: 'node -e "const { isExpired } = require(\'./src/auth.js\'); if (!isExpired(Date.now() - 1000)) process.exit(1);"',
    expectedFilesModified: ['src/auth.ts'],
  },
  {
    id: 'bench_05_retry_backoff',
    category: 'FEATURE',
    title: 'Implement exponential backoff delay calculator',
    description: 'calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs) must compute Math.min(baseDelayMs * 2 ** attempt, maxDelayMs).',
    initialFiles: {
      'src/backoff.ts': 'export function calculateBackoff(attempt: number): number {\n  return 100;\n}\n',
    },
    testFile: 'src/backoff.test.ts',
    testScript: 'node -e "const { calculateBackoff } = require(\'./src/backoff.js\'); if (calculateBackoff(2) !== 400) process.exit(1);"',
    expectedFilesModified: ['src/backoff.ts'],
  },
];
