import { spawn } from 'child_process';
import { resolveSafePath } from '../repository/path-utils.js';

export interface CommandExecutionOptions {
  command: string;
  workspaceDir: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
}

export interface CommandExecutionResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
}

export async function executeCommand(
  options: CommandExecutionOptions,
): Promise<CommandExecutionResult> {
  const {
    command,
    workspaceDir,
    cwd,
    env = {},
    timeoutMs = 60000,
    maxOutputBytes = 500 * 1024,
    signal,
  } = options;

  const resolvedCwd = resolveSafePath(workspaceDir, cwd || '.');
  const startTime = Date.now();

  return new Promise((resolve) => {
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let totalBytes = 0;
    let truncated = false;
    let timedOut = false;
    let timeoutTimer: NodeJS.Timeout | undefined;

    // Spawn shell process
    const child = spawn(command, {
      cwd: resolvedCwd,
      shell: true,
      env: {
        ...process.env,
        ...env,
        CI: 'true',
        FORCE_COLOR: '0',
      },
    });

    const cleanup = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 2000);
      }, timeoutMs);
    }

    const abortHandler = () => {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 1000);
    };

    if (signal) {
      if (signal.aborted) {
        abortHandler();
      } else {
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    }

    child.stdout.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (stdoutBuffer.length < maxOutputBytes) {
        const remainingSpace = maxOutputBytes - stdoutBuffer.length;
        stdoutBuffer += chunk.toString('utf-8', 0, remainingSpace);
      } else {
        truncated = true;
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (stderrBuffer.length < maxOutputBytes) {
        const remainingSpace = maxOutputBytes - stderrBuffer.length;
        stderrBuffer += chunk.toString('utf-8', 0, remainingSpace);
      } else {
        truncated = true;
      }
    });

    child.on('error', (err) => {
      cleanup();
      if (signal) signal.removeEventListener('abort', abortHandler);
      resolve({
        command,
        exitCode: 1,
        stdout: stdoutBuffer,
        stderr: (stderrBuffer ? stderrBuffer + '\n' : '') + err.message,
        durationMs: Date.now() - startTime,
        timedOut,
        truncated,
      });
    });

    child.on('close', (code) => {
      cleanup();
      if (signal) signal.removeEventListener('abort', abortHandler);
      resolve({
        command,
        exitCode: code ?? (timedOut ? 124 : 1),
        stdout: stdoutBuffer,
        stderr: stderrBuffer,
        durationMs: Date.now() - startTime,
        timedOut,
        truncated,
      });
    });
  });
}
