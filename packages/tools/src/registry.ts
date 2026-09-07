import { ToolDefinition, ToolContext, ToolExecutionResult, ToolPolicy, ToolPermissionClassType } from './types.js';
import {
  UnknownToolError,
  ToolValidationError,
  ToolPermissionError,
  ToolTimeoutError,
} from './errors.js';
import { createLogger, Logger } from '@buildpilot/observability';

const defaultLogger = createLogger({ serviceName: 'tool-registry' });

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger;
  }

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      this.logger.warn({ tool: tool.name }, 'Overwriting existing tool registration');
    }
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  listByPermission(permission: ToolPermissionClassType): ToolDefinition[] {
    return this.list().filter((tool) => tool.permissionClass === permission);
  }

  toLLMTools(allowedClasses?: ToolPermissionClassType[]): Array<{
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties?: Record<string, unknown>;
      required?: string[];
      [key: string]: unknown;
    };
  }> {
    const tools = allowedClasses
      ? this.list().filter((t) => allowedClasses.includes(t.permissionClass))
      : this.list();

    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || {
        type: 'object',
        properties: {},
        required: [],
      },
    }));
  }

  async execute<TInput = unknown, TOutput = unknown>(
    name: string,
    rawInput: unknown,
    context: ToolContext,
    options?: { policy?: ToolPolicy; timeoutMs?: number },
  ): Promise<ToolExecutionResult<TOutput>> {
    const startTime = Date.now();
    const tool = this.tools.get(name);

    if (!tool) {
      throw new UnknownToolError(name);
    }

    // Check policy permissions
    if (options?.policy) {
      const { allowedPermissionClasses, disallowedTools, allowedTools } = options.policy;

      if (allowedTools && !allowedTools.includes(name)) {
        throw new ToolPermissionError(name, tool.permissionClass);
      }
      if (disallowedTools && disallowedTools.includes(name)) {
        throw new ToolPermissionError(name, tool.permissionClass);
      }
      if (allowedPermissionClasses && !allowedPermissionClasses.includes(tool.permissionClass)) {
        throw new ToolPermissionError(name, tool.permissionClass);
      }
    }

    // Validate input against Zod schema
    const validation = tool.inputSchema.safeParse(rawInput);
    if (!validation.success) {
      const errorMessages = validation.error.errors.map(
        (e) => `${e.path.join('.') || 'input'}: ${e.message}`,
      );
      throw new ToolValidationError(name, errorMessages);
    }

    const timeout = options?.timeoutMs || tool.timeoutMs || context.timeoutMs || 30000;

    // Execute with timeout and abort signal protection
    try {
      const resultData = await new Promise<TOutput>((resolve, reject) => {
        let timer: NodeJS.Timeout | undefined;

        if (timeout > 0) {
          timer = setTimeout(() => {
            reject(new ToolTimeoutError(name, timeout));
          }, timeout);
        }

        const cleanup = () => {
          if (timer) clearTimeout(timer);
        };

        if (context.signal?.aborted) {
          cleanup();
          return reject(new Error(`Tool '${name}' execution aborted`));
        }

        const abortHandler = () => {
          cleanup();
          reject(new Error(`Tool '${name}' execution aborted`));
        };

        context.signal?.addEventListener('abort', abortHandler, { once: true });

        tool
          .execute(validation.data, context)
          .then((res: TOutput) => {
            cleanup();
            context.signal?.removeEventListener('abort', abortHandler);
            resolve(res);
          })
          .catch((err: unknown) => {
            cleanup();
            context.signal?.removeEventListener('abort', abortHandler);
            reject(err);
          });
      });

      const durationMs = Date.now() - startTime;
      return {
        success: true,
        data: resultData,
        durationMs,
        toolName: name,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      return {
        success: false,
        error: errorMessage,
        durationMs,
        toolName: name,
      };
    }
  }
}

export const toolRegistry = new ToolRegistry();
