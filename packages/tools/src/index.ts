export { z } from 'zod';
export * from './types.js';
export * from './errors.js';
export * from './define-tool.js';
export * from './registry.js';
export * from './repository/index.js';
export * from './execution/index.js';

import { toolRegistry } from './registry.js';
import { readFileTool, writeFileTool } from './repository/file-tools.js';
import { listFilesTool, searchCodeTool } from './repository/search-tools.js';
import { gitStatusTool, gitDiffTool } from './repository/git-tools.js';
import { runCommandTool, runTestsTool, createPullRequestTool } from './execution/execution-tools.js';

export function registerDefaultTools(registry = toolRegistry) {
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(listFilesTool);
  registry.register(searchCodeTool);
  registry.register(gitStatusTool);
  registry.register(gitDiffTool);
  registry.register(runCommandTool);
  registry.register(runTestsTool);
  registry.register(createPullRequestTool);
  return registry;
}

// Automatically register default tools on global instance
registerDefaultTools(toolRegistry);
