import { execFile } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';

const execFileAsync = promisify(execFile);

export interface GitStatusFile {
  path: string;
  status: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export const gitStatusTool = defineTool({
  name: 'git_status',
  description: 'Shows the working tree status, including staged, unstaged, and untracked files.',
  permissionClass: 'READ_ONLY',
  inputSchema: z.object({
    path: z.string().optional().default('.').describe('Optional subdirectory path to check status for'),
  }),
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Subdirectory path' },
    },
  },
  execute: async (_input, context) => {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['status', '--porcelain=v1', '-uall'],
        { cwd: context.workspaceDir, timeout: 15000 },
      );

      const files: GitStatusFile[] = [];
      const lines = stdout.split('\n').filter((l) => l.trim().length > 0);

      for (const line of lines) {
        const indexStatus = line.charAt(0);
        const worktreeStatus = line.charAt(1);
        const filePath = line.slice(3).trim();

        const isUntracked = indexStatus === '?' && worktreeStatus === '?';
        const isStaged = indexStatus !== ' ' && indexStatus !== '?';
        const isUnstaged = worktreeStatus !== ' ' && worktreeStatus !== '?';

        files.push({
          path: filePath,
          status: line.slice(0, 2).trim(),
          staged: isStaged,
          unstaged: isUnstaged,
          untracked: isUntracked,
        });
      }

      return {
        clean: files.length === 0,
        totalChanged: files.length,
        files,
      };
    } catch (err: any) {
      throw new Error(`git_status failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
});

export const gitDiffTool = defineTool({
  name: 'git_diff',
  description: 'Shows the Git diff of modified files in the working directory.',
  permissionClass: 'READ_ONLY',
  inputSchema: z.object({
    staged: z.boolean().optional().default(false).describe('Show diff of staged changes only'),
    path: z.string().optional().describe('Filter diff by specific file or folder path'),
    maxLines: z.number().int().min(1).max(5000).optional().default(1000).describe('Maximum diff lines to return'),
  }),
  parameters: {
    type: 'object',
    properties: {
      staged: { type: 'boolean', description: 'Show staged diff only' },
      path: { type: 'string', description: 'Path filter' },
      maxLines: { type: 'integer', minimum: 1, maximum: 5000, description: 'Max diff lines' },
    },
  },
  execute: async (input, context) => {
    try {
      const args = ['diff'];
      if (input.staged) {
        args.push('--staged');
      }
      if (input.path) {
        args.push('--', input.path);
      }

      const { stdout } = await execFileAsync('git', args, {
        cwd: context.workspaceDir,
        timeout: 15000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const lines = stdout.split('\n');
      const maxLines = input.maxLines || 1000;
      const truncated = lines.length > maxLines;
      const diffContent = lines.slice(0, maxLines).join('\n');

      return {
        diff: diffContent,
        totalLines: lines.length,
        truncated,
      };
    } catch (err: any) {
      throw new Error(`git_diff failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
});
