import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { runCommandTool, runTestsTool, runBrowserVerificationTool } from './execution-tools.js';
import { ToolContext } from '../types.js';

describe('Execution Tools (Task 7.3 & Task 15.4)', () => {
  let tempDir: string;
  let context: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bp-exec-tools-'));
    context = {
      workspaceDir: tempDir,
      taskId: 'task_exec_demo',
      runId: 'run_exec_demo',
    };
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('run_command', () => {
    it('executes a shell command and captures stdout and exit code 0', async () => {
      const res = await runCommandTool.execute(
        { command: 'echo "Hello BuildPilot"' },
        context,
      );

      expect(res.success).toBe(true);
      expect(res.exitCode).toBe(0);
      expect(res.stdout.trim()).toBe('Hello BuildPilot');
      expect(res.stderr).toBe('');
      expect(res.timedOut).toBe(false);
      expect(res.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('captures non-zero exit codes and stderr for failing commands', async () => {
      const res = await runCommandTool.execute(
        { command: 'node -e "process.stderr.write(\'Custom error\'); process.exit(42);"' },
        context,
      );

      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(42);
      expect(res.stderr).toContain('Custom error');
    });

    it('handles process execution timeouts gracefully', async () => {
      const res = await runCommandTool.execute(
        { command: 'node -e "setTimeout(() => {}, 5000)"', timeoutMs: 50 },
        context,
      );

      expect(res.success).toBe(false);
      expect(res.timedOut).toBe(true);
    });
  });

  describe('run_tests', () => {
    it('runs custom test command and parses passing summary', async () => {
      const res = await runTestsTool.execute(
        { testCommand: 'node -e "process.exit(0)"' },
        context,
      );

      expect(res.passed).toBe(true);
      expect(res.exitCode).toBe(0);
      expect(res.summary).toContain('passed successfully');
    });

    it('runs custom test command and parses failure summary', async () => {
      const res = await runTestsTool.execute(
        { testCommand: 'node -e "process.exit(1)"' },
        context,
      );

      expect(res.passed).toBe(false);
      expect(res.exitCode).toBe(1);
      expect(res.summary).toContain('Tests failed');
    });
  });

  describe('run_browser_verification (Task 15.4: Playwright)', () => {
    it('executes browser verification script and captures artifacts', async () => {
      const res = await runBrowserVerificationTool.execute(
        {
          testScript: 'node -e "process.exit(0)"',
          captureScreenshot: true,
          screenshotPath: 'artifacts/smoke-pass.png',
        },
        context,
      );

      expect(res.passed).toBe(true);
      expect(res.exitCode).toBe(0);
      expect(res.screenshotCaptured).toBe(true);
      expect(res.screenshotPath).toBe('artifacts/smoke-pass.png');
      expect(res.summary).toContain('passed cleanly');
    });
  });
});
