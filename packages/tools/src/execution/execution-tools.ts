import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { executeCommand } from './command-runner.js';

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
    const result = await executeCommand({
      command: input.command,
      workspaceDir: context.workspaceDir,
      cwd: input.cwd,
      env: input.env,
      timeoutMs: input.timeoutMs || 60000,
      signal: context.signal,
    });

    return {
      command: input.command,
      exitCode: result.exitCode,
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
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
    let command = input.testCommand || 'pnpm test';
    if (input.testFile) {
      command = `${command} ${input.testFile}`;
    }

    const result = await executeCommand({
      command,
      workspaceDir: context.workspaceDir,
      timeoutMs: input.timeoutMs || 120000,
      signal: context.signal,
    });

    const passed = result.exitCode === 0;

    return {
      command,
      passed,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      summary: passed ? 'All tests passed successfully.' : `Tests failed with exit code ${result.exitCode}`,
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
