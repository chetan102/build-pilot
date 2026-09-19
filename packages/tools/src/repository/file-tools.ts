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

export const editFileTool = defineTool({
  name: 'edit_file',
  description:
    'Performs targeted search-and-replace on an existing file. Replaces targetContent with replacementContent without rewriting the entire file.',
  permissionClass: 'SAFE_WRITE',
  inputSchema: z.object({
    path: z.string().describe('Relative path to the target file within the workspace'),
    targetContent: z.string().describe('Exact block or lines to find and replace in the file'),
    replacementContent: z.string().describe('New replacement block or lines to insert'),
    allowMultiple: z
      .boolean()
      .optional()
      .default(false)
      .describe('If true, replaces all occurrences. Default false fails if matched multiple times.'),
  }),
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to the file' },
      targetContent: { type: 'string', description: 'Exact string to find and replace' },
      replacementContent: { type: 'string', description: 'New string to insert' },
      allowMultiple: {
        type: 'boolean',
        description: 'Whether to replace all occurrences if found multiple times',
      },
    },
    required: ['path', 'targetContent', 'replacementContent'],
  },
  execute: async (input, context) => {
    const fullPath = resolveSafePath(context.workspaceDir, input.path);
    const originalContent = await fs.readFile(fullPath, 'utf-8');

    let matchedTarget = input.targetContent;
    let targetIndex = originalContent.indexOf(matchedTarget);

    // If exact match fails, try normalized line endings (\r\n -> \n)
    if (targetIndex === -1 && originalContent.includes('\r')) {
      const normalizedOriginal = originalContent.replace(/\r\n/g, '\n');
      const normalizedTarget = input.targetContent.replace(/\r\n/g, '\n');
      if (normalizedOriginal.includes(normalizedTarget)) {
        matchedTarget = normalizedTarget;
      }
    }

    // If still not matched, try trimmed targetContent match
    if (!originalContent.includes(matchedTarget)) {
      const trimmedTarget = input.targetContent.trim();
      if (trimmedTarget.length > 5 && originalContent.includes(trimmedTarget)) {
        matchedTarget = trimmedTarget;
      } else {
        throw new Error(
          `Target content not found in file '${input.path}'. Ensure you copy the exact lines from read_file or use write_file to overwrite the file cleanly.`,
        );
      }
    }

    const occurrences = originalContent.split(matchedTarget).length - 1;
    if (occurrences > 1 && !input.allowMultiple) {
      throw new Error(
        `Target content occurs ${occurrences} times in '${input.path}'. Provide additional surrounding context lines to uniquely identify the target or pass allowMultiple: true.`,
      );
    }

    const newContent = input.allowMultiple
      ? originalContent.split(matchedTarget).join(input.replacementContent)
      : originalContent.replace(matchedTarget, input.replacementContent);

    await fs.writeFile(fullPath, newContent, 'utf-8');
    const stats = await fs.stat(fullPath);

    return {
      path: toRelativePath(context.workspaceDir, fullPath),
      bytesWritten: stats.size,
      occurrencesReplaced: input.allowMultiple ? occurrences : 1,
      updated: true,
    };
  },
});

