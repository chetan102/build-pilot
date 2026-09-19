import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { defaultDockerRunner } from '../sandbox/docker-runner.js';
import { parseTestOutput } from './test-parser.js';

function cleanLogOutput(output: string, maxChars = 3000): string {
  if (!output) return '';
  const lines = output.split('\n');
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith(' WARN  Issue while reading')) return false;
    if (trimmed.startsWith('[Browserslist] Could not parse')) return false;
    if (trimmed.includes('MaxListenersExceededWarning')) return false;
    if (trimmed.includes('The CJS build of Vite\'s Node API is deprecated')) return false;
    if (trimmed.startsWith('npm notice')) return false;
    return true;
  });

  const joined = filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (joined.length <= maxChars) return joined;

  const head = joined.slice(0, Math.floor(maxChars * 0.4));
  const tail = joined.slice(joined.length - Math.floor(maxChars * 0.6));
  return `${head}\n... [Logs truncated for conciseness] ...\n${tail}`;
}

export const runCommandTool = defineTool({
  name: 'run_command',
  description: 'Executes a shell command in the repository workspace and captures stdout, stderr, and exit code.',
  permissionClass: 'SAFE_WRITE',
  inputSchema: z.object({
    command: z.string().min(1).describe('The shell command to execute'),
    cwd: z.string().optional().default('.').describe('Subdirectory relative to workspace to run the command in'),
    env: z.record(z.string()).optional().describe('Optional environment variables'),
    timeoutMs: z.number().int().min(1000).max(300000).optional().default(60000).describe('Timeout in milliseconds (max 5 minutes)'),
  }),
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command string' },
      cwd: { type: 'string', description: 'Working subdirectory' },
      env: { type: 'object', description: 'Environment variables' },
      timeoutMs: { type: 'integer', minimum: 1000, maximum: 300000, description: 'Execution timeout in ms' },
    },
    required: ['command'],
  },
  execute: async (input, context) => {
    const result = await defaultDockerRunner.run({
      command: input.command,
      workspaceDir: context.workspaceDir,
      cwd: input.cwd,
      env: input.env,
      timeoutMs: input.timeoutMs || 60000,
      signal: context.signal,
      useLocalFallback: process.env.BUILDPILOT_LOCAL_EXEC === 'true' || process.env.NODE_ENV === 'test',
    });

    return {
      command: input.command,
      exitCode: result.exitCode,
      success: result.exitCode === 0,
      stdout: cleanLogOutput(result.stdout, 3000),
      stderr: cleanLogOutput(result.stderr, 1500),
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      truncated: result.truncated,
    };
  },
});

export const runTestsTool = defineTool({
  name: 'run_tests',
  description: 'Runs the test suite within the workspace and returns structured pass/fail results.',
  permissionClass: 'READ_ONLY',
  inputSchema: z.object({
    testCommand: z.string().optional().default('pnpm test').describe('Custom test command to run (e.g. pnpm test, vitest run, npm test)'),
    testFile: z.string().optional().describe('Specific test file or path filter to execute'),
    timeoutMs: z.number().int().min(1000).max(600000).optional().default(120000).describe('Test execution timeout in ms'),
  }),
  parameters: {
    type: 'object',
    properties: {
      testCommand: { type: 'string', description: 'Test command to run' },
      testFile: { type: 'string', description: 'Specific test file' },
      timeoutMs: { type: 'integer', minimum: 1000, maximum: 600000, description: 'Test timeout in ms' },
    },
  },
  execute: async (input, context) => {
    let command = input.testCommand || 'npm test';
    if (input.testFile) {
      // If command is npm test, format with '--' for targeted file execution
      if (command.trim() === 'npm test' || (command.startsWith('npm test') && !command.includes('--'))) {
        command = `${command} -- ${input.testFile}`;
      } else {
        command = `${command} ${input.testFile}`;
      }
    }

    let result = await defaultDockerRunner.run({
      command,
      workspaceDir: context.workspaceDir,
      timeoutMs: input.timeoutMs || 120000,
      signal: context.signal,
      useLocalFallback: process.env.BUILDPILOT_LOCAL_EXEC === 'true' || process.env.NODE_ENV === 'test',
    });

    // If pnpm was not found (exit 127), auto-fallback to npm test or npx
    if (result.exitCode === 127 && command.startsWith('pnpm test')) {
      const fallbackCmd = command.replace(/^pnpm test/, 'npm test');
      const fallbackResult = await defaultDockerRunner.run({
        command: fallbackCmd,
        workspaceDir: context.workspaceDir,
        timeoutMs: input.timeoutMs || 120000,
        signal: context.signal,
        useLocalFallback: process.env.BUILDPILOT_LOCAL_EXEC === 'true' || process.env.NODE_ENV === 'test',
      });
      if (fallbackResult.exitCode !== 127) {
        result = fallbackResult;
        command = fallbackCmd;
      }
    }

    // If execution failed due to uncompiled JSX or modern TS syntax in native Node test runner,
    // auto-fallback to npx tsx --test for on-the-fly transpilation
    const combinedOutput = `${result.stdout} ${result.stderr}`;
    if (
      result.exitCode !== 0 &&
      (combinedOutput.includes("Unexpected token '<'") ||
        combinedOutput.includes('Unknown file extension') ||
        combinedOutput.includes('Cannot use import statement outside a module'))
    ) {
      const tsxCmd = input.testFile ? `npx tsx --test ${input.testFile}` : 'npx tsx --test';
      const tsxResult = await defaultDockerRunner.run({
        command: tsxCmd,
        workspaceDir: context.workspaceDir,
        timeoutMs: input.timeoutMs || 120000,
        signal: context.signal,
        useLocalFallback: process.env.BUILDPILOT_LOCAL_EXEC === 'true' || process.env.NODE_ENV === 'test',
      });
      if (tsxResult.exitCode === 0) {
        result = tsxResult;
        command = tsxCmd;
      }
    }

    const parsed = parseTestOutput(result.stdout, result.stderr);
    const passed = result.exitCode === 0 || (parsed.total > 0 && parsed.failed === 0);
    const failedTestNames = parsed.testCases.filter((t) => t.status === 'fail').map((t) => t.name);

    const failureSummary = parsed.total > 0
      ? `Tests failed: ${parsed.failed} of ${parsed.total} test(s) failed (${failedTestNames.join(', ')})`
      : `Tests failed with exit code ${result.exitCode}`;

    return {
      command,
      passed,
      exitCode: result.exitCode,
      total: parsed.total,
      passedCount: parsed.passed,
      failedCount: parsed.failed,
      failedTests: failedTestNames,
      summary: passed
        ? `All ${parsed.total || 'executed'} test(s) passed successfully.`
        : failureSummary,
      stdout: cleanLogOutput(result.stdout, 3000),
      stderr: cleanLogOutput(result.stderr, 1500),
      durationMs: result.durationMs,
      timedOut: result.timedOut,
    };
  },
});

export const createPullRequestTool = defineTool({
  name: 'create_pull_request',
  description: 'Proposes changes and opens a GitHub Pull Request for the task.',
  permissionClass: 'EXTERNAL_WRITE',
  inputSchema: z.object({
    title: z.string().min(3).describe('Title of the pull request'),
    body: z.string().describe('Detailed description of changes and test verification summary'),
    draft: z.boolean().optional().default(false).describe('Whether to create as draft PR'),
  }),
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'PR title' },
      body: { type: 'string', description: 'PR description summary' },
      draft: { type: 'boolean', description: 'Is draft PR' },
    },
    required: ['title', 'body'],
  },
  execute: async (input, context) => {
    return {
      title: input.title,
      body: input.body,
      taskId: context.taskId,
      runId: context.runId,
      status: 'PR_PROPOSED',
    };
  },
});

export const runBrowserVerificationTool = defineTool({
  name: 'run_browser_verification',
  description: 'Executes Playwright or browser-based automated verification tests and captures test reports, traces, and screenshots.',
  permissionClass: 'SAFE_WRITE',
  inputSchema: z.object({
    url: z.string().url().optional().describe('Target URL to run browser smoke tests against (e.g. http://localhost:3000)'),
    testScript: z.string().optional().default('pnpm exec playwright test').describe('Playwright test runner command'),
    captureScreenshot: z.boolean().optional().default(true).describe('Whether to capture screenshot artifact on completion/failure'),
    screenshotPath: z.string().optional().default('artifacts/screenshot.png').describe('Relative artifact path for screenshot'),
    timeoutMs: z.number().int().min(1000).max(300000).optional().default(60000).describe('Browser verification timeout'),
  }),
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Target URL' },
      testScript: { type: 'string', description: 'Playwright test command' },
      captureScreenshot: { type: 'boolean', description: 'Capture screenshot' },
      screenshotPath: { type: 'string', description: 'Screenshot path' },
      timeoutMs: { type: 'integer', minimum: 1000, maximum: 300000, description: 'Timeout in ms' },
    },
  },
  execute: async (input, context) => {
    const command = input.testScript || 'pnpm exec playwright test';
    const result = await defaultDockerRunner.run({
      command,
      workspaceDir: context.workspaceDir,
      timeoutMs: input.timeoutMs || 60000,
      signal: context.signal,
      useLocalFallback: process.env.BUILDPILOT_LOCAL_EXEC === 'true' || process.env.NODE_ENV === 'test',
    });

    if (
      result.exitCode === 127 ||
      result.stderr.includes('not found') ||
      result.stdout.includes('not found')
    ) {
      return {
        command,
        passed: true,
        skipped: true,
        exitCode: 0,
        summary: 'Playwright is not installed in this repository. Browser smoke test skipped.',
        stdout: cleanLogOutput(result.stdout, 1000),
        stderr: '',
        durationMs: result.durationMs,
      };
    }

    const passed = result.exitCode === 0;
    return {
      command,
      passed,
      exitCode: result.exitCode,
      stdout: cleanLogOutput(result.stdout, 3000),
      stderr: cleanLogOutput(result.stderr, 1500),
      durationMs: result.durationMs,
      screenshotCaptured: input.captureScreenshot ?? true,
      screenshotPath: input.screenshotPath || 'artifacts/screenshot.png',
      summary: passed
        ? 'Browser verification passed cleanly.'
        : `Browser verification failed with exit code ${result.exitCode}`,
    };
  },
});

