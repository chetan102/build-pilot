import { z } from 'zod';
import { ToolPermissionClassType } from '@buildpilot/domain';

export interface ToolContext {
  workspaceDir: string;
  taskId: string;
  runId: string;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  permissionClass: ToolPermissionClassType;
  inputSchema: z.ZodSchema<TInput>;
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
}

