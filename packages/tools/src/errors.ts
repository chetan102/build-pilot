export class ToolError extends Error {
  public readonly code: string;
  public readonly toolName: string;

  constructor(message: string, toolName: string, code = 'TOOL_ERROR') {
    super(message);
    this.name = 'ToolError';
    this.toolName = toolName;
    this.code = code;
  }
}

export class UnknownToolError extends ToolError {
  constructor(toolName: string) {
    super(`Tool '${toolName}' is not registered or supported.`, toolName, 'UNKNOWN_TOOL_ERROR');
    this.name = 'UnknownToolError';
  }
}

export class ToolValidationError extends ToolError {
  public readonly validationErrors: string[];

  constructor(toolName: string, validationErrors: string[]) {
    super(
      `Validation Error for tool '${toolName}': ${validationErrors.join(', ')}`,
      toolName,
      'TOOL_VALIDATION_ERROR',
    );
    this.name = 'ToolValidationError';
    this.validationErrors = validationErrors;
  }
}

export class ToolPermissionError extends ToolError {
  constructor(toolName: string, permissionClass: string) {
    super(
      `Tool '${toolName}' execution denied: Permission class '${permissionClass}' is not permitted by active policy.`,
      toolName,
      'TOOL_PERMISSION_ERROR',
    );
    this.name = 'ToolPermissionError';
  }
}

export class ToolTimeoutError extends ToolError {
  public readonly timeoutMs: number;

  constructor(toolName: string, timeoutMs: number) {
    super(
      `Tool '${toolName}' execution timed out after ${timeoutMs}ms`,
      toolName,
      'TOOL_TIMEOUT_ERROR',
    );
    this.name = 'ToolTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}
