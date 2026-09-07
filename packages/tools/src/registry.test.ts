import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from './registry.js';
import { defineTool } from './define-tool.js';
import { ToolContext } from './types.js';
import {
  UnknownToolError,
  ToolValidationError,
  ToolPermissionError,
} from './errors.js';

describe('Tool Framework & ToolRegistry', () => {
  const dummyContext: ToolContext = {
    workspaceDir: '/tmp/workspace',
    taskId: 'task_1',
    runId: 'run_1',
  };

  it('registers, retrieves, and lists tools with permission filtering', () => {
    const registry = new ToolRegistry();

    const readTool = defineTool({
      name: 'read_doc',
      description: 'Read documentation file',
      permissionClass: 'READ_ONLY',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => ({ content: `doc: ${path}` }),
    });

    const writeTool = defineTool({
      name: 'write_code',
      description: 'Write code file',
      permissionClass: 'SAFE_WRITE',
      inputSchema: z.object({ path: z.string(), code: z.string() }),
      execute: async ({ path, code }) => ({ bytesWritten: code.length }),
    });

    registry.register(readTool);
    registry.register(writeTool);

    expect(registry.has('read_doc')).toBe(true);
    expect(registry.has('unknown')).toBe(false);
    expect(registry.get('read_doc')).toBe(readTool);
    expect(registry.list()).toHaveLength(2);
    expect(registry.listByPermission('READ_ONLY')).toEqual([readTool]);
    expect(registry.listByPermission('SAFE_WRITE')).toEqual([writeTool]);
  });

  it('formats tools for LLM provider consumption with schema metadata', () => {
    const registry = new ToolRegistry();

    registry.register(
      defineTool({
        name: 'search',
        description: 'Search repository code',
        permissionClass: 'READ_ONLY',
        inputSchema: z.object({ query: z.string() }),
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
        execute: async () => [],
      }),
    );

    const llmTools = registry.toLLMTools();
    expect(llmTools).toHaveLength(1);
    expect(llmTools[0]).toEqual({
      name: 'search',
      description: 'Search repository code',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    });
  });

  it('executes a tool successfully with schema validation', async () => {
    const registry = new ToolRegistry();
    const executeSpy = vi.fn().mockResolvedValue({ status: 'ok' });

    registry.register(
      defineTool({
        name: 'echo',
        description: 'Echo input',
        permissionClass: 'READ_ONLY',
        inputSchema: z.object({ msg: z.string() }),
        execute: executeSpy,
      }),
    );

    const result = await registry.execute('echo', { msg: 'hello' }, dummyContext);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ status: 'ok' });
    expect(result.toolName).toBe('echo');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(executeSpy).toHaveBeenCalledWith({ msg: 'hello' }, dummyContext);
  });

  it('throws UnknownToolError when executing non-existent tool', async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute('ghost_tool', {}, dummyContext)).rejects.toThrow(
      UnknownToolError,
    );
  });

  it('throws ToolValidationError on schema mismatch', async () => {
    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: 'format',
        description: 'Format file',
        permissionClass: 'SAFE_WRITE',
        inputSchema: z.object({ indent: z.number().int().min(2) }),
        execute: async () => true,
      }),
    );

    await expect(registry.execute('format', { indent: 'two' }, dummyContext)).rejects.toThrow(
      ToolValidationError,
    );
  });

  it('enforces permission policy by blocking unauthorized tool permission classes', async () => {
    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: 'deploy_cluster',
        description: 'Deploy to cloud',
        permissionClass: 'HIGH_RISK',
        inputSchema: z.object({ env: z.string() }),
        execute: async () => true,
      }),
    );

    await expect(
      registry.execute(
        'deploy_cluster',
        { env: 'prod' },
        dummyContext,
        {
          policy: {
            allowedPermissionClasses: ['READ_ONLY', 'SAFE_WRITE'],
          },
        },
      ),
    ).rejects.toThrow(ToolPermissionError);
  });

  it('enforces timeout on slow tool executions', async () => {
    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: 'slow_op',
        description: 'Slow operation',
        permissionClass: 'READ_ONLY',
        inputSchema: z.object({}),
        execute: () => new Promise((resolve) => setTimeout(resolve, 500)),
      }),
    );

    const result = await registry.execute('slow_op', {}, dummyContext, { timeoutMs: 20 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out after 20ms');
  });
});
