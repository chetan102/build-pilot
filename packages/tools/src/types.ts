import { z } from 'zod';
import { ToolPermissionClassType } from '@buildpilot/domain';

export type { ToolPermissionClassType };

export interface ToolContext {
  workspaceDir: string;
  taskId: string;
  runId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ToolParametersSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  permissionClass: ToolPermissionClassType;
  inputSchema: z.ZodSchema<TInput>;
  parameters?: ToolParametersSchema;
  timeoutMs?: number;
  execute(input: TInput, context: ToolContext): Promise<TOutput>;
}

export interface ToolExecutionResult<TOutput = unknown> {
  success: boolean;
  data?: TOutput;
  error?: string;
  durationMs: number;
  toolName: string;
}

export interface ToolPolicy {
  allowedPermissionClasses?: ToolPermissionClassType[];
  disallowedTools?: string[];
  allowedTools?: string[];
}
