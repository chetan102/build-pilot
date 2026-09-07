import { describe, it, expect, vi } from 'vitest';
import { DockerSandboxRunner } from './docker-runner.js';

describe('DockerSandboxRunner (Phase 13: Sandbox Execution)', () => {
  it('builds secure docker execution arguments with resource limits and non-root user', () => {
    const runner = new DockerSandboxRunner({
      image: 'node:20-alpine',
      memoryLimit: '1024m',
      cpuLimit: '1.5',
      network: 'none',
      user: '1000:1000',
    });

    const args = runner.buildDockerArgs({
      command: 'pnpm test',
      workspaceDir: '/tmp/test-workspace',
      cwd: 'packages/core',
      env: {
        SECRET_TOKEN: 'leaked_token', // Not in allowlist, must be stripped
        NODE_ENV: 'test', // In allowlist, must be kept
        BUILDPILOT_TASK_ID: 'task_123', // Starts with BUILDPILOT_, must be kept
      },
    });

    expect(args).toContain('run');
    expect(args).toContain('--rm');
    expect(args).toContain('--network');
    expect(args).toContain('none');
    expect(args).toContain('--memory');
    expect(args).toContain('1024m');
    expect(args).toContain('--cpus');
    expect(args).toContain('1.5');
    expect(args).toContain('--user');
    expect(args).toContain('1000:1000');
    expect(args).toContain('no-new-privileges:true');

    // Mount workspace
    expect(args).toContain('-v');
    expect(args).toContain('/tmp/test-workspace:/workspace');

    // Container working directory
    expect(args).toContain('-w');
    expect(args).toContain('/workspace/packages/core');

    // Environment filtering
    expect(args).toContain('NODE_ENV=test');
    expect(args).toContain('BUILDPILOT_TASK_ID=task_123');
    expect(args.join(' ')).not.toContain('SECRET_TOKEN');

    // Target command
    expect(args).toContain('node:20-alpine');
    expect(args).toContain('pnpm test');
  });

  it('executes via local fallback when requested', async () => {
    const runner = new DockerSandboxRunner();
    const result = await runner.run({
      command: 'echo "hello from sandbox"',
      workspaceDir: process.cwd(),
      useLocalFallback: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello from sandbox');
  });
});
