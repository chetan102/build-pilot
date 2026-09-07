import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { resolveSafePath, toRelativePath } from './path-utils.js';

export interface FileEntry {
  path: string;
  type: 'file' | 'directory';
  sizeBytes?: number;
}

const DEFAULT_IGNORE = new Set([
  '.git',
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'coverage',
  '.DS_Store',
]);

export const listFilesTool = defineTool({
  name: 'list_files',
  description: 'Lists files and directories recursively within the workspace with path filtering and depth limits.',
  permissionClass: 'READ_ONLY',
  inputSchema: z.object({
    path: z.string().optional().default('.').describe('Relative directory path to inspect'),
    maxDepth: z.number().int().min(1).max(20).optional().default(5).describe('Maximum directory depth to traverse'),
    limit: z.number().int().min(1).max(2000).optional().default(500).describe('Maximum entries to return'),
    includeHidden: z.boolean().optional().default(false).describe('Whether to include hidden files (starting with .)'),
  }),
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path relative to workspace' },
      maxDepth: { type: 'integer', minimum: 1, maximum: 20, description: 'Max depth' },
      limit: { type: 'integer', minimum: 1, maximum: 2000, description: 'Max items returned' },
      includeHidden: { type: 'boolean', description: 'Include dotfiles' },
    },
  },
  execute: async (input, context) => {
    const rootPath = resolveSafePath(context.workspaceDir, input.path || '.');
    const entries: FileEntry[] = [];
    const maxDepth = input.maxDepth || 5;
    const limit = input.limit || 500;
    const includeHidden = input.includeHidden ?? false;

    async function walk(currentDir: string, currentDepth: number): Promise<void> {
      if (currentDepth > maxDepth || entries.length >= limit) return;

      let dirEntries;
      try {
        dirEntries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const dirent of dirEntries) {
        if (entries.length >= limit) break;

        const name = dirent.name;
        if (!includeHidden && name.startsWith('.')) continue;
        if (DEFAULT_IGNORE.has(name)) continue;

        const fullPath = path.join(currentDir, name);
        const relPath = toRelativePath(context.workspaceDir, fullPath);

        if (dirent.isDirectory()) {
          entries.push({ path: relPath, type: 'directory' });
          await walk(fullPath, currentDepth + 1);
        } else if (dirent.isFile()) {
          let sizeBytes: number | undefined;
          try {
            const stat = await fs.stat(fullPath);
            sizeBytes = stat.size;
          } catch {
            // ignore
          }
          entries.push({ path: relPath, type: 'file', sizeBytes });
        }
      }
    }

    await walk(rootPath, 1);

    return {
      basePath: toRelativePath(context.workspaceDir, rootPath),
      count: entries.length,
      entries,
      truncated: entries.length >= limit,
    };
  },
});

export const searchCodeTool = defineTool({
  name: 'search_code',
  description: 'Searches for text or regex patterns across files in the workspace.',
  permissionClass: 'READ_ONLY',
  inputSchema: z.object({
    query: z.string().min(1).describe('Search query string or regular expression'),
    path: z.string().optional().default('.').describe('Relative directory or file to search within'),
    isRegex: z.boolean().optional().default(false).describe('Treat query as regular expression'),
    caseSensitive: z.boolean().optional().default(false).describe('Case-sensitive matching'),
    maxResults: z.number().int().min(1).max(500).optional().default(100).describe('Maximum matches to return'),
  }),
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Query text or regex' },
      path: { type: 'string', description: 'Search root path' },
      isRegex: { type: 'boolean', description: 'Is regular expression' },
      caseSensitive: { type: 'boolean', description: 'Case sensitive match' },
      maxResults: { type: 'integer', minimum: 1, maximum: 500, description: 'Max match count' },
    },
    required: ['query'],
  },
  execute: async (input, context) => {
    const rootPath = resolveSafePath(context.workspaceDir, input.path || '.');
    const maxResults = input.maxResults || 100;
    const matches: Array<{ file: string; lineNumber: number; lineContent: string }> = [];

    let regex: RegExp;
    try {
      const flags = input.caseSensitive ? 'g' : 'gi';
      const pattern = input.isRegex ? input.query : input.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(pattern, flags);
    } catch (err) {
      throw new Error(`Invalid search regular expression: ${err instanceof Error ? err.message : String(err)}`);
    }

    async function searchDir(currentDir: string): Promise<void> {
      if (matches.length >= maxResults) return;

      let dirEntries;
      try {
        dirEntries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const dirent of dirEntries) {
        if (matches.length >= maxResults) break;
        if (DEFAULT_IGNORE.has(dirent.name)) continue;

        const fullPath = path.join(currentDir, dirent.name);

        if (dirent.isDirectory()) {
          await searchDir(fullPath);
        } else if (dirent.isFile()) {
          const ext = path.extname(dirent.name).toLowerCase();
          const binaryExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.lock']);
          if (binaryExtensions.has(ext)) continue;

          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
              if (matches.length >= maxResults) break;
              const line = lines[i];
              if (line !== undefined) {
                regex.lastIndex = 0;
                if (regex.test(line)) {
                  matches.push({
                    file: toRelativePath(context.workspaceDir, fullPath),
                    lineNumber: i + 1,
                    lineContent: line.trimEnd(),
                  });
                }
              }
            }
          } catch {
            // ignore unreadable files
          }
        }
      }
    }

    const stat = await fs.stat(rootPath);
    if (stat.isDirectory()) {
      await searchDir(rootPath);
    } else if (stat.isFile()) {
      const content = await fs.readFile(rootPath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= maxResults) break;
        const line = lines[i];
        if (line !== undefined) {
          regex.lastIndex = 0;
          if (regex.test(line)) {
            matches.push({
              file: toRelativePath(context.workspaceDir, rootPath),
              lineNumber: i + 1,
              lineContent: line.trimEnd(),
            });
          }
        }
      }
    }

    return {
      query: input.query,
      count: matches.length,
      matches,
      truncated: matches.length >= maxResults,
    };
  },
});
