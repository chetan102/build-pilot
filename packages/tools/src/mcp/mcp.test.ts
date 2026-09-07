import { describe, it, expect, vi } from 'vitest';
import { McpClient } from './mcp-client.js';
import { BuildPilotMcpServer } from './mcp-server.js';
import { McpSafetyGuard } from './mcp-safety.js';
import { ToolRegistry } from '../registry.js';

describe('Model Context Protocol (Phase 18: MCP)', () => {
  describe('Task 18.1 — MCP Client Integration', () => {
    it('discovers tools and adapts MCP tool to ToolRegistry format', async () => {
      const mockTransport = {
        sendRequest: vi.fn().mockImplementation((method: string) => {
          if (method === 'tools/list') {
            return Promise.resolve({
              tools: [
                {
                  name: 'fetch_weather',
                  description: 'Fetch current weather',
                  inputSchema: {
                    type: 'object',
                    properties: { city: { type: 'string' } },
                    required: ['city'],
                  },
                },
              ],
            });
          }
          if (method === 'tools/call') {
            return Promise.resolve({ temperature: 72, condition: 'Sunny' });
          }
          return Promise.resolve({});
        }),
      };

      const client = new McpClient(mockTransport);
      const tools = await client.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe('fetch_weather');

      const adaptedTool = client.adaptTool(tools[0]!, 'READ_ONLY');
      const registry = new ToolRegistry();
      registry.register(adaptedTool);

      expect(registry.has('fetch_weather')).toBe(true);

      const execResult = await registry.execute(
        'fetch_weather',
        { city: 'San Francisco' },
        { workspaceDir: '/tmp', taskId: 't1', runId: 'r1' },
      );

      expect(execResult.success).toBe(true);
      expect((execResult.data as any).mcpResponse).toEqual({ temperature: 72, condition: 'Sunny' });
    });
  });

  describe('Task 18.2 — BuildPilot MCP Server', () => {
    it('handles tools/list and tools/call requests', async () => {
      const mockDataProvider = {
        listTasks: vi.fn().mockResolvedValue({
          tasks: [{ _id: 'task_1', title: 'Fix bug', status: 'COMPLETED' }],
          total: 1,
        }),
        getTaskDetails: vi.fn().mockResolvedValue({ task: { _id: 'task_1' } }),
        listEvents: vi.fn().mockResolvedValue([]),
      };

      const server = new BuildPilotMcpServer(mockDataProvider);

      // Test tools/list
      const listRes = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      });

      expect(listRes.result).toBeDefined();
      expect((listRes.result as any).tools).toHaveLength(3);

      // Test tools/call
      const callRes = await server.handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'buildpilot_list_tasks',
          arguments: { limit: 5 },
        },
      });

      expect(callRes.result).toBeDefined();
      expect((callRes.result as any).tasks).toHaveLength(1);
      expect(mockDataProvider.listTasks).toHaveBeenCalledWith({ status: undefined }, { page: 1, limit: 5 });
    });
  });

  describe('Task 18.3 — External MCP Safety & Gates', () => {
    it('creates security policies and generates audit log entries', () => {
      const guard = new McpSafetyGuard({
        defaultPermissionClass: 'READ_ONLY',
        deniedTools: ['dangerous_tool'],
      });

      const policy = guard.createPolicyForMcpServer('custom-server');
      expect(policy.allowedPermissionClasses).toContain('READ_ONLY');
      expect(policy.disallowedTools).toContain('dangerous_tool');

      expect(() => {
        guard.auditMcpInvocation(
          'custom-server',
          'safe_query',
          { query: 'test' },
          { success: true, durationMs: 12 },
        );
      }).not.toThrow();
    });
  });
});
