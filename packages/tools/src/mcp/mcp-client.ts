import { z } from 'zod';
import { ToolDefinition, ToolPermissionClassType } from '../types.js';
import { defineTool } from '../define-tool.js';

export interface McpToolSchema {
  name: string;
  description: string;
  inputSchema?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpClientTransport {
  sendRequest(method: string, params?: Record<string, unknown>): Promise<any>;
}

export class McpClient {
  private transport: McpClientTransport;

  constructor(transport: McpClientTransport) {
    this.transport = transport;
  }

  async listTools(): Promise<McpToolSchema[]> {
    const res = await this.transport.sendRequest('tools/list', {});
    return res?.tools || [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<any> {
    const res = await this.transport.sendRequest('tools/call', {
      name,
      arguments: args,
    });
    return res;
  }

  adaptTool(
    mcpTool: McpToolSchema,
    permissionClass: ToolPermissionClassType = 'READ_ONLY',
  ): ToolDefinition {
    return defineTool({
      name: mcpTool.name,
      description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
      permissionClass,
      inputSchema: z.record(z.unknown()),
      parameters: mcpTool.inputSchema || {
        type: 'object',
        properties: {},
      },
      execute: async (input, context) => {
        const result = await this.callTool(mcpTool.name, input as Record<string, unknown>);
        return {
          mcpResponse: result,
          taskId: context.taskId,
          runId: context.runId,
        };
      },
    });
  }
}
