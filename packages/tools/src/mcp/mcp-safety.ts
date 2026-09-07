import { ToolPolicy, ToolPermissionClassType } from '../types.js';
import { createLogger, Logger } from '@buildpilot/observability';

const defaultLogger = createLogger({ serviceName: 'mcp-safety-guard' });

export interface McpSafetyConfig {
  defaultPermissionClass: ToolPermissionClassType;
  allowedTools?: string[];
  deniedTools?: string[];
  requireHumanApprovalForHighRisk?: boolean;
}

export class McpSafetyGuard {
  private config: McpSafetyConfig;
  private logger: Logger;

  constructor(config: Partial<McpSafetyConfig> = {}, logger?: Logger) {
    this.config = {
      defaultPermissionClass: config.defaultPermissionClass || 'READ_ONLY',
      allowedTools: config.allowedTools,
      deniedTools: config.deniedTools,
      requireHumanApprovalForHighRisk: config.requireHumanApprovalForHighRisk ?? true,
    };
    this.logger = logger || defaultLogger;
  }

  createPolicyForMcpServer(serverName: string): ToolPolicy {
    this.logger.info({ serverName }, 'Creating security policy for external MCP server');
    return {
      allowedPermissionClasses: [this.config.defaultPermissionClass, 'SAFE_WRITE'],
      disallowedTools: this.config.deniedTools,
      allowedTools: this.config.allowedTools,
    };
  }

  auditMcpInvocation(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
    result: { success: boolean; durationMs: number; error?: string },
  ): void {
    this.logger.info(
      {
        serverName,
        toolName,
        success: result.success,
        durationMs: result.durationMs,
        error: result.error,
      },
      'MCP tool execution audit log entry recorded',
    );
  }
}
