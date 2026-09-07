import { spawn } from 'child_process';
import { resolveSafePath } from '../repository/path-utils.js';
import { executeCommand, CommandExecutionOptions, CommandExecutionResult } from '../execution/command-runner.js';

export interface DockerSandboxOptions extends CommandExecutionOptions {
  image?: string;
  cpuLimit?: string;
  memoryLimit?: string;
  network?: 'none' | 'bridge' | 'host';
  allowedEnvVars?: string[];
  readOnlyRoot?: boolean;
  user?: string;
  useLocalFallback?: boolean;
}

export class DockerSandboxRunner {
  private defaultImage: string;
  private defaultMemory: string;
  private defaultCpus: string;
  private defaultNetwork: string;
  private defaultUser: string;
  private envAllowlist: Set<string>;

  constructor(options: {
    image?: string;
    memoryLimit?: string;
    cpuLimit?: string;
    network?: 'none' | 'bridge';
    user?: string;
    allowedEnvVars?: string[];
  } = {}) {
    this.defaultImage = options.image || 'node:20-slim';
    this.defaultMemory = options.memoryLimit || '2048m';
    this.defaultCpus = options.cpuLimit || '2.0';
    this.defaultNetwork = options.network || 'none';
    this.defaultUser = options.user || '1000:1000';
    this.envAllowlist = new Set(
      options.allowedEnvVars || ['PATH', 'NODE_ENV', 'CI', 'FORCE_COLOR', 'PNPM_HOME', 'NVM_DIR'],
    );
  }

  buildDockerArgs(options: DockerSandboxOptions): string[] {
    const {
      workspaceDir,
      cwd = '.',
      command,
      image = this.defaultImage,
      memoryLimit = this.defaultMemory,
      cpuLimit = this.defaultCpus,
      network = this.defaultNetwork,
      user = this.defaultUser,
      env = {},
    } = options;

    const resolvedWorkspace = resolveSafePath(workspaceDir, '.');
    const containerWorkingDir = cwd === '.' ? '/workspace' : `/workspace/${cwd.replace(/^\.\//, '')}`;

    const dockerArgs: string[] = [
      'run',
      '--rm',
      '--network',
      network,
      '--memory',
      memoryLimit,
      '--cpus',
      cpuLimit,
      '--user',
      user,
      '--security-opt',
      'no-new-privileges:true',
      '-v',
      `${resolvedWorkspace}:/workspace`,
      '-w',
      containerWorkingDir,
    ];

    // Filter environment variables against allowlist
    for (const [k, v] of Object.entries(env)) {
      if (this.envAllowlist.has(k) || k.startsWith('BUILDPILOT_')) {
        dockerArgs.push('-e', `${k}=${v}`);
      }
    }

    dockerArgs.push('-e', 'CI=true');
    dockerArgs.push('-e', 'FORCE_COLOR=0');
    dockerArgs.push(image);
    dockerArgs.push('sh', '-c', command);

    return dockerArgs;
  }

  async run(options: DockerSandboxOptions): Promise<CommandExecutionResult> {
    if (options.useLocalFallback) {
      return executeCommand(options);
    }

    const dockerArgs = this.buildDockerArgs(options);
    const { timeoutMs = 60000, maxOutputBytes = 500 * 1024, signal } = options;
    const startTime = Date.now();

    return new Promise((resolve) => {
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let truncated = false;
      let timedOut = false;
      let timeoutTimer: NodeJS.Timeout | undefined;

      const child = spawn('docker', dockerArgs);

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

      child.stdout?.on('data', (chunk: Buffer) => {
        if (stdoutBuffer.length < maxOutputBytes) {
          const remaining = maxOutputBytes - stdoutBuffer.length;
          stdoutBuffer += chunk.toString('utf-8', 0, remaining);
        } else {
          truncated = true;
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderrBuffer.length < maxOutputBytes) {
          const remaining = maxOutputBytes - stderrBuffer.length;
          stderrBuffer += chunk.toString('utf-8', 0, remaining);
        } else {
          truncated = true;
        }
      });

      child.on('error', async (err) => {
        cleanup();
        // If docker daemon is not running or binary not found, fallback to local
        if (err.message.includes('ENOENT') || options.useLocalFallback) {
          const localResult = await executeCommand(options);
          resolve(localResult);
          return;
        }

        resolve({
          command: options.command,
          exitCode: 1,
          stdout: stdoutBuffer,
          stderr: (stderrBuffer ? stderrBuffer + '\n' : '') + `Docker execution error: ${err.message}`,
          durationMs: Date.now() - startTime,
          timedOut,
          truncated,
        });
      });

      child.on('close', (code) => {
        cleanup();
        resolve({
          command: options.command,
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
}

export const defaultDockerRunner = new DockerSandboxRunner();
