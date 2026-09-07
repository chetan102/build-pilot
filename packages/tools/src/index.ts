import { z } from 'zod';
import { ToolPermissionClassType } from '@buildpilot/domain';

export { z };

export interface ToolContext {
  workspaceDir: string;
  taskId: string;
  runId: string;
  signal?: AbortSignal;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  permissionClass: ToolPermissionClassType;
  inputSchema: z.ZodSchema<TInput>;
  parameters?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  execute(input: TInput, context: ToolContext): Promise<TOutput>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  toLLMTools(): Array<{
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties?: Record<string, unknown>;
      required?: string[];
      [key: string]: unknown;
    };
  }> {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || {
        type: 'object',
        properties: {},
        required: [],
      },
    }));
  }
}

export const toolRegistry = new ToolRegistry();
