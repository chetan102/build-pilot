import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { resolveSafePath, toRelativePath } from './path-utils.js';

export const readFileTool = defineTool({
  name: 'read_file',
  description: 'Reads the content of a file from the repository with optional line range slicing.',
  permissionClass: 'READ_ONLY',
  inputSchema: z.object({
    path: z.string().describe('Relative path to the file within the workspace'),
    startLine: z.number().int().min(1).optional().describe('1-indexed starting line number (inclusive)'),
    endLine: z.number().int().min(1).optional().describe('1-indexed ending line number (inclusive)'),
    maxLines: z.number().int().min(1).max(5000).optional().default(1000).describe('Maximum lines to return'),
  }),
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to the file' },
      startLine: { type: 'integer', minimum: 1, description: '1-indexed starting line' },
      endLine: { type: 'integer', minimum: 1, description: '1-indexed ending line' },
      maxLines: { type: 'integer', minimum: 1, maximum: 5000, description: 'Maximum lines to return' },
    },
    required: ['path'],
  },
  execute: async (input, context) => {
    const fullPath = resolveSafePath(context.workspaceDir, input.path);
    const rawContent = await fs.readFile(fullPath, 'utf-8');
    const allLines = rawContent.split('\n');
    const totalLines = allLines.length;

    const startLine = input.startLine ? Math.max(1, input.startLine) : 1;
    const maxLines = input.maxLines || 1000;
    const defaultEnd = Math.min(totalLines, startLine + maxLines - 1);
    const endLine = input.endLine ? Math.min(input.endLine, totalLines) : defaultEnd;

    if (startLine > totalLines) {
      return {
        path: toRelativePath(context.workspaceDir, fullPath),
        totalLines,
        startLine,
        endLine: totalLines,
        content: '',
        truncated: false,
      };
    }

    const selectedLines = allLines.slice(startLine - 1, endLine);
    const truncated = endLine < totalLines;

    return {
      path: toRelativePath(context.workspaceDir, fullPath),
      totalLines,
      startLine,
      endLine,
      content: selectedLines.join('\n'),
      truncated,
    };
  },
});

export const writeFileTool = defineTool({
  name: 'write_file',
  description: 'Creates or overwrites a file with the provided content within the workspace.',
  permissionClass: 'SAFE_WRITE',
  inputSchema: z.object({
    path: z.string().describe('Relative path to the target file within the workspace'),
    content: z.string().describe('Full content to write to the file'),
    createDirectories: z.boolean().optional().default(true).describe('Automatically create parent directories'),
  }),
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to the file' },
      content: { type: 'string', description: 'File content' },
      createDirectories: { type: 'boolean', description: 'Auto-create directories' },
    },
    required: ['path', 'content'],
  },
  execute: async (input, context) => {
    const fullPath = resolveSafePath(context.workspaceDir, input.path);
    const parentDir = path.dirname(fullPath);

    if (input.createDirectories ?? true) {
      await fs.mkdir(parentDir, { recursive: true });
    }

    let existed = false;
    try {
      await fs.access(fullPath);
      existed = true;
    } catch {
      existed = false;
    }

    await fs.writeFile(fullPath, input.content, 'utf-8');
    const stats = await fs.stat(fullPath);

    return {
      path: toRelativePath(context.workspaceDir, fullPath),
      bytesWritten: stats.size,
      created: !existed,
      updated: existed,
    };
  },
});
